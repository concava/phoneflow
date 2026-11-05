import { useWavesurfer } from "@wavesurfer/react"
import { DownloadIcon, PauseIcon, PlayIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import Hover from "wavesurfer.js/plugins/hover"
import Timeline from "wavesurfer.js/plugins/timeline"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { env } from "@/lib/env"
import { useTranslation } from "@/lib/i18n"
import { isRecordingMissing } from "@/lib/recording"

const PLAYBACK_RATES = [0.5, 1, 1.5, 2]
const SPLIT_CHANNELS = [
  { waveColor: "#7dd3fc", progressColor: "#38bdf8" },
  { waveColor: "#b796fa", progressColor: "#8b5cf6" },
]

function formatTick(seconds: number) {
  const cs = Math.max(0, Math.round(seconds * 100))
  const minutes = String(Math.floor(cs / 6000)).padStart(2, "0")
  const secs = String(Math.floor(cs / 100) % 60).padStart(2, "0")
  const fraction = String(cs % 100).padStart(2, "0")
  return `${minutes}:${secs}.${fraction}`
}

export function CallRecordingPlayer({
  callId,
  position,
  recordingOffset,
}: {
  callId: string
  position?: number
  recordingOffset: number
}) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const fetchParams = useRef({ credentials: "include" as const }).current
  const [playbackRate, setPlaybackRate] = useState(1)
  const [loadError, setLoadError] = useState<"missing" | "failed" | null>(null)
  const url = `${env.API_URL}/api/calls/${callId}/recording`

  const { wavesurfer, isReady, isPlaying } = useWavesurfer({
    container: containerRef,
    url,
    fetchParams,
    height: 48,
    minPxPerSec: 50,
    cursorWidth: 2,
    cursorColor: "#ef4444",
    barHeight: 0.8,
    normalize: true,
    dragToSeek: true,
    splitChannels: SPLIT_CHANNELS,
  })

  useEffect(() => {
    if (!wavesurfer || isReady) return
    let active = true
    const unsubscribe = wavesurfer.on("error", () => {
      void isRecordingMissing(url).then((missing) => {
        if (active) setLoadError(missing ? "missing" : "failed")
      })
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [wavesurfer, isReady, url])

  useEffect(() => {
    if (!wavesurfer || !isReady || position == null) return
    const fileTime = Math.min(
      wavesurfer.getDuration(),
      Math.max(0, position - recordingOffset)
    )
    wavesurfer.setTime(fileTime)
  }, [wavesurfer, isReady, position, recordingOffset])

  useEffect(() => {
    if (!wavesurfer || loadError) return

    wavesurfer.registerPlugin(
      Timeline.create({
        height: 16,
        timeInterval: 1,
        primaryLabelInterval: 2,
        secondaryLabelInterval: 2,
        style: {
          fontSize: "10px",
          color: "var(--muted-foreground)",
        },
        formatTimeCallback: (seconds) => formatTick(seconds + recordingOffset),
      })
    )
    wavesurfer.registerPlugin(
      Hover.create({
        lineColor: "var(--muted-foreground)",
        lineWidth: 2,
        labelColor: "var(--foreground)",
        labelBackground: "transparent",
        labelSize: 10,
        formatTimeCallback: (seconds) => formatTick(seconds + recordingOffset),
      })
    )

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") return
      event.preventDefault()
      void wavesurfer.playPause()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [wavesurfer, recordingOffset, loadError])

  function onPlayPause() {
    void wavesurfer?.playPause()
  }

  function onCycleRate() {
    const rate =
      PLAYBACK_RATES[
        (PLAYBACK_RATES.indexOf(playbackRate) + 1) % PLAYBACK_RATES.length
      ] ?? 1
    setPlaybackRate(rate)
    wavesurfer?.setPlaybackRate(rate, true)
  }

  function onDownload() {
    const src = wavesurfer?.getMediaElement().src
    if (!src) return
    const link = document.createElement("a")
    link.href = src
    link.download = `recording-${callId}.mp4`
    link.click()
  }

  if (loadError === "missing") return null

  if (loadError === "failed") {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        {t("components.calls.call_recording_player.load_failed")}
      </p>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex items-center space-x-1.5">
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          disabled={!isReady}
          onClick={onPlayPause}
          aria-label={
            isPlaying
              ? t("components.calls.call_recording_player.pause")
              : t("components.calls.call_recording_player.play")
          }
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={!isReady}
          onClick={onCycleRate}
          aria-label={t("components.calls.call_recording_player.playback_rate")}
        >
          {playbackRate}x
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="ml-auto"
          disabled={!isReady}
          onClick={onDownload}
        >
          <DownloadIcon />
          {t("components.calls.call_recording_player.download_audio")}
        </Button>
      </div>
      <div className="relative h-28">
        {!isReady && <Skeleton className="absolute inset-0 z-10" />}
        <div ref={containerRef} className="h-full" />
      </div>
    </div>
  )
}
