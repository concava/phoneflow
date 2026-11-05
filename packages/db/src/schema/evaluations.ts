import {
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"

import { agentVersionsTable } from "@workspace/db/schema/agents"
import { organization, user } from "@workspace/db/schema/auth"
import { callsTable } from "@workspace/db/schema/calls"
import type {
  EvaluationCriterion,
  EvaluationResultError,
  EvaluationResultStatus,
  EvaluationRunStatus,
  EvaluationVerdict,
} from "@workspace/shared/api/evaluations/types"

export const evaluationSuitesTable = pgTable(
  "evaluation_suites",
  {
    id: uuid().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").notNull(),
    name: varchar({ length: 255 }).notNull(),
    criteria: json().$type<EvaluationCriterion[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("evaluation_suites_organization_id_created_at_idx").on(
      table.organizationId,
      table.createdAt
    ),
  ]
)

export const evaluationRunsTable = pgTable(
  "evaluation_runs",
  {
    id: uuid().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    suiteId: uuid("suite_id")
      .notNull()
      .references(() => evaluationSuitesTable.id, { onDelete: "cascade" }),
    agentVersionId: uuid("agent_version_id").references(
      () => agentVersionsTable.id,
      { onDelete: "set null" }
    ),
    callsFrom: timestamp("calls_from", { withTimezone: true, mode: "date" }),
    callsTo: timestamp("calls_to", { withTimezone: true, mode: "date" }),
    status: text("status").notNull().$type<EvaluationRunStatus>(),
    totalCount: integer("total_count").notNull().default(0),
    completedCount: integer("completed_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    passedCount: integer("passed_count").notNull().default(0),
    inconclusiveCount: integer("inconclusive_count").notNull().default(0),
    criteria: json().$type<EvaluationCriterion[]>().notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("evaluation_runs_organization_id_created_at_idx").on(
      table.organizationId,
      table.createdAt
    ),
    index("evaluation_runs_suite_id_created_at_idx").on(
      table.suiteId,
      table.createdAt
    ),
  ]
)

export const evaluationResultsTable = pgTable(
  "evaluation_results",
  {
    id: uuid().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => evaluationRunsTable.id, { onDelete: "cascade" }),
    callId: uuid("call_id").references(() => callsTable.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().$type<EvaluationResultStatus>(),
    attempt: integer("attempt").notNull().default(0),
    verdicts: json().$type<EvaluationVerdict[] | null>(),
    error: text("error").$type<EvaluationResultError | null>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("evaluation_results_run_id_idx").on(table.runId),
    index("evaluation_results_call_id_idx").on(table.callId),
  ]
)
