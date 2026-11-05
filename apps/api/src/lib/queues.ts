import { Queue, QueueEvents } from "bullmq"
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

export const postCallQueue = new Queue("post-call", { connection, telemetry })

export const postCallQueueEvents = new QueueEvents("post-call", { connection })

postCallQueueEvents.on("error", (error) => {
  console.error("[post-call] queue events error:", error.message)
})
