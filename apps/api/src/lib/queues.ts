import { Queue } from "bullmq"
import { BullMQOtel } from "bullmq-otel"

import { connection } from "@/lib/redis"

const telemetry = new BullMQOtel({
  tracerName: "api",
  meterName: "api",
  enableMetrics: true,
})

export const emailsQueue = new Queue("emails", { connection, telemetry })

export const batchCallsQueue = new Queue("batch-calls", {
  connection,
  telemetry,
})

export const evaluationsQueue = new Queue("evaluations", {
  connection,
  telemetry,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
})
