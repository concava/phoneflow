import { useMutation, useQuery } from "@tanstack/react-query"
import { PlayIcon } from "lucide-react"
import { useState } from "react"

import type { ExtractionField } from "@workspace/shared/api/agent-config/types"
import type { TestExtractionRequest } from "@workspace/shared/api/agents/types"
import type {
  CallListResponse,
  ExtractionResult,
} from "@workspace/shared/api/calls/types"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { toast } from "@workspace/ui/components/sonner"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  ExtractionErrorMessage,
  ExtractionStatusBadge,
  ExtractionValues,
} from "@/components/calls/call-extraction"
import { UserDateTime } from "@/components/user-timezone-provider"
import { api } from "@/lib/api"
import { useCheckPermission } from "@/lib/auth/permissions"
import { useTranslation } from "@/lib/i18n"
import { useAgentStore } from "@/stores/agent"

export function ExtractionTest({ fields }: { fields: ExtractionField[] }) {
  const { t } = useTranslation()
  const agentId = useAgentStore((state) => state.agent.id)
  const canTest = useCheckPermission({ agent: ["update"] })
  const [callId, setCallId] = useState<string | null>(null)

  const { data: calls } = useQuery({
    queryKey: ["calls", "extraction-test", agentId],
    enabled: canTest,
    queryFn: () =>
      api.get<CallListResponse>(
        `/calls?agentIds=${agentId}&status=completed&pageSize=10`
      ),
  })

  const testMutation = useMutation({
    mutationFn: (selectedCallId: string) =>
      api.post<ExtractionResult, TestExtractionRequest>(
        `/agents/${agentId}/extraction/test`,
        { body: { callId: selectedCallId, fields } }
      ),
    onError: (error) => {
      toast.error(error.message)
    },
  })

  if (!canTest) {
    return null
  }

  const items = calls?.items ?? []
  const selected = items.find((call) => call.id === callId)
  const result = testMutation.data

  return (
    <Field className="border-t border-border pt-4">
      <FieldLabel>
        {t("components.flow.sidepanel.extraction.test.title")}
      </FieldLabel>
      <FieldDescription>
        {t("components.flow.sidepanel.extraction.test.description")}
      </FieldDescription>
      {calls && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("components.flow.sidepanel.extraction.test.no_calls")}
        </p>
      ) : (
        <>
          <Select value={callId} onValueChange={setCallId}>
            <SelectTrigger className="w-full">
              <SelectValue>
                {selected ? (
                  <UserDateTime value={selected.startedAt} />
                ) : (
                  t(
                    "components.flow.sidepanel.extraction.test.call.placeholder"
                  )
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {items.map((call) => (
                <SelectItem key={call.id} value={call.id}>
                  <UserDateTime value={call.startedAt} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!callId || testMutation.isPending}
            onClick={() => {
              if (callId) testMutation.mutate(callId)
            }}
          >
            {testMutation.isPending ? <Spinner /> : <PlayIcon />}
            {t("components.flow.sidepanel.extraction.test.run")}
          </Button>
        </>
      )}
      {result ? (
        <div
          key={testMutation.submittedAt}
          ref={(node) => node?.scrollIntoView({ block: "nearest" })}
          className="flex flex-col gap-2 rounded-md border border-border p-3"
        >
          <ExtractionStatusBadge status={result.status} />
          {result.status === "completed" ? (
            <ExtractionValues extraction={result.extraction} />
          ) : (
            <ExtractionErrorMessage error={result.error} />
          )}
        </div>
      ) : null}
    </Field>
  )
}
