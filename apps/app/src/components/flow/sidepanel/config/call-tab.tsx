import type { AgentConfig } from "@workspace/shared/api/agent-config/types"
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldSeparator,
} from "@workspace/ui/components/field"
import {
  ConfigSection,
  EnumField,
  NumberField,
  StringListField,
  SwitchField,
} from "@/components/flow/sidepanel/config/fields"
import { VariableTextField } from "@/components/flow/variables/variable-text-field"
import { useTranslation } from "@/lib/i18n"
import { TIME_ZONES } from "@/lib/time"
import { useAgentStore } from "@/stores/agent"

const TIMEZONE_OPTIONS = TIME_ZONES.map((timezone) => ({
  value: timezone,
  label: timezone,
}))

export function CallTab() {
  const { t } = useTranslation()
  const readOnly = useAgentStore((state) => state.readOnly)
  const config = useAgentStore((state) => state.config)
  const setConfig = useAgentStore((state) => state.setConfig)

  const call = config.call
  const recording = config.recording
  const recordingEnabled = recording?.enabled ?? true

  function patchCall(partial: Partial<AgentConfig["call"]>) {
    setConfig({
      ...config,
      call: { ...call, ...partial },
    })
  }

  function setRecordingEnabled(enabled: boolean) {
    setConfig({ ...config, recording: { ...recording, enabled } })
  }

  function setDisclosure(value: string) {
    const { disclosure: _, ...rest } = recording ?? {
      enabled: recordingEnabled,
    }
    setConfig({
      ...config,
      recording: value.trim() ? { ...rest, disclosure: value } : rest,
    })
  }

  function setExcludedPrefixes(excludedPrefixes: string[]) {
    // The field commits on every blur, so tabbing through it must not add config.
    if (excludedPrefixes.length === 0 && !recording?.excludedPrefixes) return

    const { excludedPrefixes: _, ...rest } = recording ?? {
      enabled: recordingEnabled,
    }
    setConfig({
      ...config,
      recording:
        excludedPrefixes.length > 0 ? { ...rest, excludedPrefixes } : rest,
    })
  }

  return (
    <ConfigSection>
      <NumberField
        label={t(
          "components.flow.sidepanel.config.call_tab.max_call_duration.label"
        )}
        description={t(
          "components.flow.sidepanel.config.call_tab.max_call_duration.description"
        )}
        value={call.maxDurationSec}
        min={1}
        step={1}
        readOnly={readOnly}
        onChange={(maxDurationSec) => patchCall({ maxDurationSec })}
      />

      <NumberField
        label={t(
          "components.flow.sidepanel.config.call_tab.idle_timeout.label"
        )}
        description={t(
          "components.flow.sidepanel.config.call_tab.idle_timeout.description"
        )}
        value={call.idleTimeoutSec}
        min={1}
        step={1}
        readOnly={readOnly}
        onChange={(idleTimeoutSec) => patchCall({ idleTimeoutSec })}
      />

      <NumberField
        label={t(
          "components.flow.sidepanel.config.call_tab.max_idle_messages.label"
        )}
        description={t(
          "components.flow.sidepanel.config.call_tab.max_idle_messages.description"
        )}
        value={call.maxIdleMessages}
        min={1}
        step={1}
        readOnly={readOnly}
        onChange={(maxIdleMessages) => patchCall({ maxIdleMessages })}
      />

      <NumberField
        label={t(
          "components.flow.sidepanel.config.call_tab.silence_timeout.label"
        )}
        description={t(
          "components.flow.sidepanel.config.call_tab.silence_timeout.description"
        )}
        value={call.endOnSilenceSec}
        min={1}
        step={1}
        readOnly={readOnly}
        onChange={(endOnSilenceSec) => patchCall({ endOnSilenceSec })}
      />

      <EnumField
        label={t("components.flow.sidepanel.config.call_tab.timezone.label")}
        description={t(
          "components.flow.sidepanel.config.call_tab.timezone.description",
          {
            date: "{{date}}",
            time: "{{time}}",
            timezone: "{{timezone}}",
          }
        )}
        value={config.timezone}
        options={TIMEZONE_OPTIONS}
        readOnly={readOnly}
        onChange={(timezone) => setConfig({ ...config, timezone })}
      />

      <FieldSeparator />

      <SwitchField
        label={t("components.flow.sidepanel.config.call_tab.recording.label")}
        description={t(
          "components.flow.sidepanel.config.call_tab.recording.description"
        )}
        checked={recordingEnabled}
        readOnly={readOnly}
        onCheckedChange={setRecordingEnabled}
      />

      <Field>
        <FieldLabel>
          {t(
            "components.flow.sidepanel.config.call_tab.recording.disclosure.label"
          )}
        </FieldLabel>
        <FieldDescription>
          {t(
            "components.flow.sidepanel.config.call_tab.recording.disclosure.description"
          )}
        </FieldDescription>
        <VariableTextField
          multiline
          rows={3}
          value={recording?.disclosure ?? ""}
          readOnly={readOnly || !recordingEnabled}
          onChange={setDisclosure}
          placeholder={t(
            "components.flow.sidepanel.config.call_tab.recording.disclosure.placeholder"
          )}
        />
      </Field>

      <StringListField
        label={t(
          "components.flow.sidepanel.config.call_tab.recording.excluded_prefixes.label"
        )}
        description={t(
          "components.flow.sidepanel.config.call_tab.recording.excluded_prefixes.description"
        )}
        placeholder={t(
          "components.flow.sidepanel.config.call_tab.recording.excluded_prefixes.placeholder"
        )}
        value={recording?.excludedPrefixes ?? []}
        readOnly={readOnly || !recordingEnabled}
        onChange={setExcludedPrefixes}
      />
    </ConfigSection>
  )
}
