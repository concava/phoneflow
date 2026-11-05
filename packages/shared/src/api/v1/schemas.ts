import { z } from "zod"

export const v1IdParamsSchema = z.object({
  id: z.uuid("schemas.v1.id.invalid"),
})

const v1PaginationShape = {
  page: z.coerce
    .number("schemas.v1.page.invalid")
    .int("schemas.v1.page.invalid")
    .min(1, "schemas.v1.page.invalid")
    .default(1),
  pageSize: z.coerce
    .number("schemas.v1.page_size.invalid")
    .int("schemas.v1.page_size.invalid")
    .min(1, "schemas.v1.page_size.invalid")
    .max(100, "schemas.v1.page_size.invalid")
    .default(20),
}

export const v1AgentListQuerySchema = z.object(v1PaginationShape).strict()

export const v1CallListQuerySchema = z
  .object({
    ...v1PaginationShape,
    status: z
      .enum(["in_progress", "completed", "no_answer"], {
        error: "schemas.v1.status.invalid",
      })
      .optional(),
    agentId: z.uuid("schemas.v1.agent_id.invalid").optional(),
    batchCallId: z.uuid("schemas.v1.batch_call_id.invalid").optional(),
  })
  .strict()
