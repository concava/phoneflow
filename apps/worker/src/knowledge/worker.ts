import { Worker } from "bullmq"
import { BullMQOtel } from "bullmq-otel"

import type { ProcessKnowledgeDocumentPayload } from "@workspace/shared/jobs/knowledge/types"
import { connection } from "@/lib/redis"
import {
  failKnowledgeDocument,
  processKnowledgeDocument,
} from "./jobs/process-document"

const telemetry = new BullMQOtel({
  tracerName: "worker",
  meterName: "worker",
  enableMetrics: true,
})

export const knowledgeWorker = new Worker<ProcessKnowledgeDocumentPayload>(
  "knowledge",
  async (job) => {
    switch (job.name) {
      case "process-document":
        return processKnowledgeDocument(job.data)
      default:
        throw new Error(`Unknown job: ${job.name}`)
    }
  },
  { connection, telemetry }
)

// Handled here rather than in the job so that stalled jobs, which never reach the
// processor again, also leave the failure on the document.
knowledgeWorker.on("failed", (job, error) => {
  if (!job) {
    return
  }

  failKnowledgeDocument(job.data.documentId, error).catch((failure) => {
    console.error(
      `[knowledge] could not record failure of document ${job.data.documentId}:`,
      failure
    )
  })
})
