import { z } from "zod"

export const evaluationIdParamsSchema = z.object({
  id: z.uuid(),
})

export const evaluationCriterionSchema = z
  .object({
    id: z.uuid(),
    name: z
      .string()
      .trim()
      .min(1, "schemas.evaluations.criterion_name.required")
      .max(120, "schemas.evaluations.criterion_name.max"),
    description: z
      .string()
      .trim()
      .min(1, "schemas.evaluations.criterion_description.required")
      .max(2000, "schemas.evaluations.criterion_description.max"),
  })
  .strict()

const criteriaSchema = z
  .array(evaluationCriterionSchema)
  .min(1, "schemas.evaluations.criteria.required")
  .max(20, "schemas.evaluations.criteria.max")
  .refine(
    (criteria) =>
      new Set(criteria.map((criterion) => criterion.id)).size ===
      criteria.length,
    "schemas.evaluations.criteria.duplicate"
  )

const suiteNameSchema = z
  .string()
  .trim()
  .min(1, "schemas.evaluations.suite_name.required")
  .max(255, "schemas.evaluations.suite_name.max")

export const createEvaluationSuiteRequestSchema = z
  .object({
    name: suiteNameSchema,
    agentId: z.uuid("schemas.evaluations.agent.required"),
    criteria: criteriaSchema,
  })
  .strict()

export const updateEvaluationSuiteRequestSchema = z
  .object({
    name: suiteNameSchema,
    criteria: criteriaSchema,
  })
  .strict()

export const startEvaluationRunRequestSchema = z
  .object({
    agentVersionId: z
      .uuid("schemas.evaluations.agent_version.invalid")
      .nullable()
      .optional(),
    from: z.iso
      .datetime("schemas.evaluations.date_range.invalid_date")
      .nullable()
      .optional(),
    to: z.iso
      .datetime("schemas.evaluations.date_range.invalid_date")
      .nullable()
      .optional(),
    limit: z
      .number("schemas.evaluations.limit.range")
      .int("schemas.evaluations.limit.range")
      .min(1, "schemas.evaluations.limit.range")
      .max(200, "schemas.evaluations.limit.range")
      .default(50),
  })
  .strict()
  .refine(({ from, to }) => !from || !to || new Date(from) <= new Date(to), {
    message: "schemas.evaluations.date_range.invalid",
    path: ["from"],
  })

export const rejudgeEvaluationResultsRequestSchema = z
  .object({
    resultIds: z
      .array(z.uuid("schemas.evaluations.result_ids.invalid"))
      .min(1, "schemas.evaluations.result_ids.invalid")
      .max(200, "schemas.evaluations.result_ids.invalid")
      .optional(),
  })
  .strict()

export const evaluationVerdictSchema = z.object({
  criterionId: z.uuid(),
  passed: z.boolean().nullable(),
  reasoning: z.string().trim().min(1).max(4000),
  quote: z.string().max(4000),
})

export const evaluationJudgeOutputSchema = z.object({
  verdicts: z.array(evaluationVerdictSchema),
})

export const evaluationResultErrorSchema = z.enum([
  "llm_not_configured",
  "llm_failed",
  "invalid_output",
  "call_unavailable",
  "cancelled",
  "enqueue_failed",
])

export const claimEvaluationResultRequestSchema = z
  .object({
    attempt: z.number().int().nonnegative(),
  })
  .strict()

export const finishEvaluationResultRequestSchema = z.discriminatedUnion(
  "status",
  [
    z
      .object({
        attempt: z.number().int().nonnegative(),
        status: z.literal("completed"),
        verdicts: z.array(evaluationVerdictSchema),
      })
      .strict(),
    z
      .object({
        attempt: z.number().int().nonnegative(),
        status: z.literal("failed"),
        error: evaluationResultErrorSchema,
      })
      .strict(),
  ]
)
