import { Plus, Trash2 } from "lucide-react"

import type {
  AgentConfig,
  PreCallWebhook,
} from "@workspace/shared/api/agent-config/types"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  ConfigSection,
  EnumField,
  NumberField,
  SwitchField,
} from "@/components/flow/sidepanel/config/fields"
import { useTranslation } from "@/lib/i18n"
import { TIME_ZONES } from "@/lib/time"
import { useAgentStore } from "@/stores/agent"

const TIMEZONE_OPTIONS = TIME_ZONES.map((timezone) => ({
  value: timezone,
  label: timezone,
}))

const DEFAULT_PRE_CALL_WEBHOOK: PreCallWebhook = {
  url: "",
  headers: [],
  timeoutMs: 2000,
}

const PRE_CALL_RESPONSE_EXAMPLE = `{
  "variables": {
    "customer_name": "Ana"
  }
}`

export function CallTab() {
  const { t } = useTranslation()
  const readOnly = useAgentStore((state) => state.readOnly)
  const config = useAgentStore((state) => state.config)
  const setConfig = useAgentStore((state) => state.setConfig)

  const call = config.call
  const preCallWebhook = config.preCallWebhook

  function patchCall(partial: Partial<AgentConfig["call"]>) {
    setConfig({
      ...config,
      call: { ...call, ...partial },
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

      <SwitchField
        label={t(
          "components.flow.sidepanel.config.call_tab.pre_call_webhook.label"
        )}
        description={t(
          "components.flow.sidepanel.config.call_tab.pre_call_webhook.description"
        )}
        checked={preCallWebhook !== undefined}
        readOnly={readOnly}
        onCheckedChange={(checked) => {
          if (checked) {
            setConfig({ ...config, preCallWebhook: DEFAULT_PRE_CALL_WEBHOOK })
            return
          }

          const { preCallWebhook: _, ...rest } = config
          setConfig(rest)
        }}
      />

      {preCallWebhook ? (
        <PreCallWebhookFields
          webhook={preCallWebhook}
          readOnly={readOnly}
          onChange={(next) => setConfig({ ...config, preCallWebhook: next })}
        />
      ) : null}
    </ConfigSection>
  )
}

function PreCallWebhookFields({
  webhook,
  readOnly,
  onChange,
}: {
  webhook: PreCallWebhook
  readOnly: boolean
  onChange: (webhook: PreCallWebhook) => void
}) {
  const { t } = useTranslation()
  const headers = webhook.headers

  function patchHeader(
    index: number,
    partial: Partial<PreCallWebhook["headers"][number]>
  ) {
    onChange({
      ...webhook,
      headers: headers.map((header, headerIndex) =>
        headerIndex === index ? { ...header, ...partial } : header
      ),
    })
  }

  return (
    <>
      <Field>
        <FieldLabel>
          {t(
            "components.flow.sidepanel.config.call_tab.pre_call_webhook.url.label"
          )}
        </FieldLabel>
        <FieldDescription>
          {t(
            "components.flow.sidepanel.config.call_tab.pre_call_webhook.url.description"
          )}
        </FieldDescription>
        <Input
          type="url"
          placeholder="https://api.example.com/pre-call"
          readOnly={readOnly}
          disabled={readOnly}
          value={webhook.url}
          onChange={(event) =>
            onChange({ ...webhook, url: event.target.value })
          }
        />
      </Field>

      <NumberField
        label={t(
          "components.flow.sidepanel.config.call_tab.pre_call_webhook.timeout.label"
        )}
        description={t(
          "components.flow.sidepanel.config.call_tab.pre_call_webhook.timeout.description"
        )}
        value={webhook.timeoutMs}
        min={500}
        max={3000}
        step={100}
        readOnly={readOnly}
        onChange={(timeoutMs) => onChange({ ...webhook, timeoutMs })}
      />

      <Field>
        <FieldLabel>
          {t(
            "components.flow.sidepanel.config.call_tab.pre_call_webhook.headers.label"
          )}
        </FieldLabel>
        {headers.map((header, index) => (
          <div key={index} className="flex gap-2">
            <Input
              placeholder={t(
                "components.flow.sidepanel.config.call_tab.pre_call_webhook.headers.key_placeholder"
              )}
              readOnly={readOnly}
              disabled={readOnly}
              value={header.key}
              onChange={(event) =>
                patchHeader(index, { key: event.target.value })
              }
            />
            <Input
              placeholder={t(
                "components.flow.sidepanel.config.call_tab.pre_call_webhook.headers.value_placeholder"
              )}
              readOnly={readOnly}
              disabled={readOnly}
              value={header.value}
              onChange={(event) =>
                patchHeader(index, { value: event.target.value })
              }
            />
            <Button
              type="button"
              variant="ghost"
              className="text-destructive!"
              size="icon-sm"
              disabled={readOnly}
              onClick={() =>
                onChange({
                  ...webhook,
                  headers: headers.filter(
                    (_, headerIndex) => headerIndex !== index
                  ),
                })
              }
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={readOnly}
          onClick={() =>
            onChange({
              ...webhook,
              headers: [...headers, { key: "", value: "" }],
            })
          }
        >
          <Plus />
          {t("common.actions.add")}
        </Button>
      </Field>

      <Field>
        <FieldLabel>
          {t(
            "components.flow.sidepanel.config.call_tab.pre_call_webhook.response.label"
          )}
        </FieldLabel>
        <FieldDescription>
          {t(
            "components.flow.sidepanel.config.call_tab.pre_call_webhook.response.description"
          )}
        </FieldDescription>
        <pre className="rounded-md border border-border bg-muted p-3 font-mono text-xs">
          {PRE_CALL_RESPONSE_EXAMPLE}
        </pre>
      </Field>
    </>
  )
}
