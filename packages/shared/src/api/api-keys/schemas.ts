import { z } from "zod"

export const apiKeyIdParamsSchema = z.object({
  id: z.uuid("schemas.api_keys.id.invalid"),
})

export const createApiKeyRequestSchema = z
  .object({
    name: z
      .string("schemas.api_keys.name.required")
      .trim()
      .min(1, "schemas.api_keys.name.required")
      .max(255, "schemas.api_keys.name.max"),
    expiresAt: z.iso
      .datetime("schemas.api_keys.expires_at.invalid")
      .nullable()
      .optional()
      .refine((value) => !value || new Date(value).getTime() > Date.now(), {
        message: "schemas.api_keys.expires_at.in_past",
      }),
  })
  .strict()
