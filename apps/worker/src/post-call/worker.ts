import { Worker } from "bullmq"
import { BullMQOtel } from "bullmq-otel"

import { connection } from "@/lib/redis"
import { extractCall } from "./jobs/extract-call"
import { testExtraction } from "./jobs/test-extraction"

const telemetry = new BullMQOtel({
  tracerName: "worker",
  meterName: "worker",
  enableMetrics: true,
})

export const postCallWorker = new Worker(
  "post-call",
  async (job) => {
    switch (job.name) {
      case "extract-call":
        return extractCall(job)
      case "test-extraction":
        return testExtraction(job.data)
      default:
        throw new Error(`Unknown job: ${job.name}`)
    }
  },
  // A single slow LLM call must not hold up every other extraction.
  { connection, telemetry, concurrency: 5 }
)
