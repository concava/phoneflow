import "dotenv/config"

export const env = {
  REDIS_URL: process.env.REDIS_URL ?? "",
  API_URL: process.env.API_URL ?? "http://localhost:3000",
  API_TOKEN: process.env.API_TOKEN ?? "",
  EMAIL_HOST: process.env.EMAIL_HOST ?? "",
  EMAIL_PORT: Number(process.env.EMAIL_PORT ?? "587"),
  EMAIL_USER: process.env.EMAIL_USER ?? "",
  EMAIL_PASSWORD: process.env.EMAIL_PASSWORD ?? "",
  EMAIL_FROM: process.env.EMAIL_FROM ?? "",
  POST_CALL_LLM_BASE_URL: process.env.POST_CALL_LLM_BASE_URL ?? "",
  POST_CALL_LLM_API_KEY: process.env.POST_CALL_LLM_API_KEY ?? "",
  POST_CALL_LLM_MODEL: process.env.POST_CALL_LLM_MODEL ?? "",
}
