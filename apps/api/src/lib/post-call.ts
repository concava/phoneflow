import type { ExtractionResult } from "@workspace/shared/api/calls/types"
import type {
  ExtractCallPayload,
  TestExtractionPayload,
} from "@workspace/shared/jobs/post-call/types"
import { postCallQueue, postCallQueueEvents } from "@/lib/queues"

const ENQUEUE_TIMEOUT_MS = 5_000
// The worker's LLM timeout is 60s; the rest covers queueing and the transcript fetch.
const TEST_TIMEOUT_MS = 75_000

// With maxRetriesPerRequest: null, Redis commands wait forever during an outage.
function withEnqueueTimeout<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Timed out waiting for Redis")),
      ENQUEUE_TIMEOUT_MS
    )
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export async function enqueueExtractCall(payload: ExtractCallPayload) {
  await withEnqueueTimeout(
    postCallQueue.add("extract-call", payload, {
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    })
  )
}

export async function runTestExtraction(
  payload: TestExtractionPayload
): Promise<ExtractionResult> {
  const job = await withEnqueueTimeout(
    postCallQueue.add("test-extraction", payload, {
      lifo: true,
      removeOnComplete: { age: 5 * 60 },
      removeOnFail: { age: 5 * 60 },
    })
  )

  try {
    return await job.waitUntilFinished(postCallQueueEvents, TEST_TIMEOUT_MS)
  } catch (error) {
    // Nobody is waiting anymore, so a job that never started must not spend LLM tokens later.
    await withEnqueueTimeout(job.remove()).catch(() => {})
    throw error
  }
}
