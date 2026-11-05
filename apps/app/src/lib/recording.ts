// wavesurfer's load errors only carry a message, so after one the status is read
// from the route. This runs on the error path only, and the body is not downloaded.
export async function isRecordingMissing(url: string) {
  const controller = new AbortController()

  try {
    const response = await fetch(url, {
      credentials: "include",
      signal: controller.signal,
    })
    return response.status === 404
  } catch {
    return false
  } finally {
    controller.abort()
  }
}
