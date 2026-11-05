import type { Job } from "bullmq"

import type {
  ExtractionResult,
  ReportExtractionResultResponse,
} from "@workspace/shared/api/calls/types"
import type { ExtractCallPayload } from "@workspace/shared/jobs/post-call/types"
import { api } from "@/lib/api"
import { isLlmConfigured } from "@/lib/llm"
import { extractionErrorCode, runExtraction } from "@/post-call/extraction"

function reportResult(callId: string, result: ExtractionResult) {
  return api.post<ReportExtractionResultResponse, ExtractionResult>(
    `/calls/${callId}/extraction/result`,
    { body: result }
  )
}

export async function extractCall(job: Job<ExtractCallPayload>) {
  const { callId } = job.data

  if (!isLlmConfigured()) {
    await reportResult(callId, {
      status: "skipped",
      error: "llm_not_configured",
    })
    return { callId, status: "skipped" }
  }

  try {
    const extraction = await runExtraction(job.data)
    await reportResult(callId, { status: "completed", extraction })
    return { callId, status: "completed" }
  } catch (error) {
    console.error(
      `[post-call] extraction failed for call ${callId}:`,
      error instanceof Error ? error.message : error
    )

    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
      await reportResult(callId, {
        status: "failed",
        error: extractionErrorCode(error),
      })
    }

    throw error
  }
}
