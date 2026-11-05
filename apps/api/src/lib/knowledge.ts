import { and, cosineDistance, eq, inArray, type SQL, sql } from "drizzle-orm"

import { db } from "@workspace/db/client"
import { agentsTable } from "@workspace/db/schema/agents"
import {
  knowledgeBasesTable,
  knowledgeChunksTable,
  knowledgeDocumentsTable,
} from "@workspace/db/schema/knowledge-bases"
import type { AgentConfig } from "@workspace/shared/api/agent-config/types"
import { KNOWLEDGE_EMBEDDING_DIMENSIONS } from "@workspace/shared/api/knowledge-bases/schemas"
import type { KnowledgeSearchResult } from "@workspace/shared/api/knowledge-bases/types"
import type { ProcessKnowledgeDocumentPayload } from "@workspace/shared/jobs/knowledge/types"
import {
  createEmbeddings,
  embeddingsConfigured,
} from "@workspace/shared/knowledge/embeddings"
import { env } from "@/lib/env"
import { knowledgeQueue } from "@/lib/queues"

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

const embeddingsConfig = {
  baseUrl: env.EMBEDDINGS_BASE_URL,
  apiKey: env.EMBEDDINGS_API_KEY,
  model: env.EMBEDDINGS_MODEL,
}

export function knowledgeEmbeddingsConfigured() {
  return embeddingsConfigured(embeddingsConfig)
}

export function decodeEmbedding(encoded: string) {
  const buffer = Buffer.from(encoded, "base64")
  return Array.from({ length: KNOWLEDGE_EMBEDDING_DIMENSIONS }, (_, index) =>
    buffer.readFloatLE(index * 4)
  )
}

export async function enqueueKnowledgeDocument(documentId: string) {
  await knowledgeQueue.add("process-document", {
    documentId,
  } satisfies ProcessKnowledgeDocumentPayload)
}

export async function searchKnowledge({
  organizationId,
  knowledgeBaseIds,
  query,
  limit,
  timeoutMs,
}: {
  organizationId: string
  knowledgeBaseIds: string[]
  query: string
  limit: number
  timeoutMs: number
}): Promise<KnowledgeSearchResult[]> {
  const [embedding] = await createEmbeddings(
    embeddingsConfig,
    [query],
    AbortSignal.timeout(timeoutMs)
  )
  const distance = cosineDistance(knowledgeChunksTable.embedding, embedding)

  return db.transaction(async (tx) => {
    // A caller that has timed out is gone, so don't keep the database busy on its behalf.
    await tx.execute(sql`set local statement_timeout = 2000`)
    // HNSW filters after the index scan, so without iterative scans another organization's
    // nearby chunks can use up the candidate list and leave this one with few results.
    await tx.execute(sql`set local hnsw.iterative_scan = strict_order`)

    const selectChunks = (order: SQL) =>
      tx
        .select({
          content: knowledgeChunksTable.content,
          score: sql<number>`1 - (${distance})`.mapWith(Number),
          documentName: knowledgeDocumentsTable.name,
          knowledgeBaseId: knowledgeChunksTable.knowledgeBaseId,
        })
        .from(knowledgeChunksTable)
        .innerJoin(
          knowledgeDocumentsTable,
          eq(knowledgeDocumentsTable.id, knowledgeChunksTable.documentId)
        )
        .where(
          and(
            eq(knowledgeChunksTable.organizationId, organizationId),
            inArray(knowledgeChunksTable.knowledgeBaseId, knowledgeBaseIds)
          )
        )
        .orderBy(order)
        .limit(limit)

    const results = await selectChunks(distance)
    if (results.length === limit) {
      return results
    }

    // Even iterative scans can't leave a tight cluster of another organization's vectors,
    // because the graph may have no links out of it. Adding 0 keeps the planner off the
    // HNSW index, so this runs an exact search over only this organization's chunks.
    return selectChunks(sql`(${distance}) + 0`)
  })
}

// Returns the name of the first node that references a knowledge base outside the organization.
export async function findNodeWithForeignKnowledgeBase(
  config: AgentConfig,
  organizationId: string,
  database: Pick<typeof db, "select"> = db
) {
  const nodes = config.nodes.flatMap((node) =>
    node.type === "conversation" && node.data.knowledgeBaseIds?.length
      ? [{ name: node.data.name, ids: node.data.knowledgeBaseIds }]
      : []
  )

  if (nodes.length === 0) {
    return null
  }

  const owned = await database
    .select({ id: knowledgeBasesTable.id })
    .from(knowledgeBasesTable)
    .where(
      and(
        eq(knowledgeBasesTable.organizationId, organizationId),
        inArray(
          knowledgeBasesTable.id,
          nodes.flatMap((node) => node.ids)
        )
      )
    )
  const ownedIds = new Set(owned.map((entry) => entry.id))

  return (
    nodes.find((node) => node.ids.some((id) => !ownedIds.has(id)))?.name ?? null
  )
}

// Published versions are immutable and keep the id; at runtime it simply matches no chunks.
export async function removeKnowledgeBaseFromDrafts(
  tx: Transaction,
  knowledgeBaseId: string,
  organizationId: string
) {
  const agents = await tx
    .select({ id: agentsTable.id, config: agentsTable.config })
    .from(agentsTable)
    .where(
      and(
        eq(agentsTable.organizationId, organizationId),
        sql`${agentsTable.config}::text like ${`%${knowledgeBaseId}%`}`
      )
    )

  for (const agent of agents) {
    await tx
      .update(agentsTable)
      .set({
        updatedAt: new Date(),
        config: {
          ...agent.config,
          nodes: agent.config.nodes.map((node) =>
            node.type === "conversation" && node.data.knowledgeBaseIds
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    knowledgeBaseIds: node.data.knowledgeBaseIds.filter(
                      (id) => id !== knowledgeBaseId
                    ),
                  },
                }
              : node
          ),
        },
      })
      .where(eq(agentsTable.id, agent.id))
  }
}
