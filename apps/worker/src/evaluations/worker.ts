import { Worker } from "bullmq"
import { BullMQOtel } from "bullmq-otel"

import { connection } from "@/lib/redis"
import { judgeCall } from "./jobs/judge-call"

const telemetry = new BullMQOtel({
  tracerName: "worker",
  meterName: "worker",
  enableMetrics: true,
})

export const evaluationsWorker = new Worker(
  "evaluations",
  async (job) => {
    switch (job.name) {
      case "judge-call":
        return judgeCall(job.data)
      default:
        throw new Error(`Unknown job: ${job.name}`)
    }
  },
  { connection, telemetry, concurrency: 5 }
)
