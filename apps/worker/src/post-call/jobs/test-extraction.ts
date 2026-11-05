import type { ExtractionResult } from "@workspace/shared/api/calls/types"
import type { TestExtractionPayload } from "@workspace/shared/jobs/post-call/types"
import { isLlmConfigured } from "@/lib/llm"
import { extractionErrorCode, runExtraction } from "@/post-call/extraction"

export async function testExtraction(
  payload: TestExtractionPayload
): Promise<ExtractionResult> {
  if (!isLlmConfigured()) {
    return { status: "skipped", error: "llm_not_configured" }
  }

  try {
    return { status: "completed", extraction: await runExtraction(payload) }
  } catch (error) {
    console.error(
      `[post-call] test extraction failed for call ${payload.callId}:`,
      error instanceof Error ? error.message : error
    )
    return { status: "failed", error: extractionErrorCode(error) }
  }
}
