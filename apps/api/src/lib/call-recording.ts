import type { AgentConfig } from "@workspace/shared/api/agent-config/types"

/**
 * Whether the agent's config allows recording this call. `remoteNumber` is the
 * other party on a phone call and `null` only for web calls, which have no
 * number. Whether storage is configured is checked separately by the caller.
 */
export function shouldRecordCall(
  config: Pick<AgentConfig, "recording">,
  remoteNumber: string | null
) {
  const recording = config.recording

  if (!recording) return true
  if (!recording.enabled) return false

  const prefixes = recording.excludedPrefixes ?? []
  if (prefixes.length === 0 || remoteNumber === null) return true

  // Trunks can report hidden callers as "" or "anonymous", or send national
  // formats. Those cannot be compared with an E.164 prefix, so fail closed.
  const number = remoteNumber.trim()
  if (!/^\+[0-9]+$/.test(number)) return false

  return !prefixes.some((prefix) => number.startsWith(prefix))
}
