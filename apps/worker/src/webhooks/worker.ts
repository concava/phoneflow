import { type Job, Worker } from "bullmq"
import { BullMQOtel } from "bullmq-otel"

import type { DeliverWebhookPayload } from "@workspace/shared/jobs/webhooks/types"
import { connection } from "@/lib/redis"
import { deliverWebhook } from "./jobs/deliver-webhook"

const telemetry = new BullMQOtel({
  tracerName: "worker",
  meterName: "worker",
  enableMetrics: true,
})

export const webhooksWorker = new Worker(
  "webhooks",
  async (job: Job<DeliverWebhookPayload>) => {
    switch (job.name) {
      case "deliver-webhook":
        return deliverWebhook(job)
      default:
        throw new Error(`Unknown job: ${job.name}`)
    }
  },
  // One unresponsive endpoint holds a slot for the full request timeout, so
  // concurrency keeps it from stalling deliveries for every other organization.
  { connection, telemetry, concurrency: 20 }
)
