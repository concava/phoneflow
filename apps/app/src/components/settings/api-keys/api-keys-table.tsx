import { useSuspenseQuery } from "@tanstack/react-query"
import { PlusIcon } from "lucide-react"
import { useState } from "react"

import type { ApiKeyListItem } from "@workspace/shared/api/api-keys/types"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { ApiKeyRowActions } from "@/components/settings/api-keys/api-key-row-actions"
import { CreateApiKeyDialog } from "@/components/settings/api-keys/create-api-key-dialog"
import { UserDateTime } from "@/components/user-timezone-provider"
import { apiKeysQueryOptions } from "@/lib/api-keys"
import { useCheckPermission } from "@/lib/auth/permissions"
import { useTranslation } from "@/lib/i18n"

function apiKeyStatus(apiKey: ApiKeyListItem) {
  if (apiKey.revokedAt) {
    return "revoked"
  }

  if (apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() <= Date.now()) {
    return "expired"
  }

  return "active"
}

export function ApiKeysTable() {
  const { t } = useTranslation()
  const { data: apiKeys } = useSuspenseQuery(apiKeysQueryOptions())
  const canCreate = useCheckPermission({ apiKey: ["create"] })
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {t("components.settings.api_keys.api_keys_table.description")}
        </p>
        <Button
          className="shrink-0"
          disabled={!canCreate}
          onClick={() => setCreateOpen(true)}
        >
          <PlusIcon />
          {t("components.settings.api_keys.api_keys_table.create")}
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {t("components.settings.api_keys.api_keys_table.columns.name")}
              </TableHead>
              <TableHead>
                {t(
                  "components.settings.api_keys.api_keys_table.columns.status"
                )}
              </TableHead>
              <TableHead>
                {t(
                  "components.settings.api_keys.api_keys_table.columns.last_used"
                )}
              </TableHead>
              <TableHead>
                {t(
                  "components.settings.api_keys.api_keys_table.columns.expires"
                )}
              </TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {apiKeys.length ? (
              apiKeys.map((apiKey) => {
                const status = apiKeyStatus(apiKey)

                return (
                  <TableRow key={apiKey.id}>
                    <TableCell>
                      <div className="font-medium">{apiKey.name}</div>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono">{apiKey.prefix}…</span>
                        {apiKey.creator ? ` · ${apiKey.creator.name}` : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={status === "active" ? "secondary" : "outline"}
                      >
                        {t(
                          `components.settings.api_keys.api_keys_table.status.${status}`
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {apiKey.lastUsedAt ? (
                        <UserDateTime value={apiKey.lastUsedAt} />
                      ) : (
                        t("components.settings.api_keys.api_keys_table.never")
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {apiKey.expiresAt ? (
                        <UserDateTime value={apiKey.expiresAt} />
                      ) : (
                        t("components.settings.api_keys.api_keys_table.never")
                      )}
                    </TableCell>
                    <TableCell>
                      {status === "revoked" ? null : (
                        <ApiKeyRowActions apiKey={apiKey} />
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  {t("components.settings.api_keys.api_keys_table.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <CreateApiKeyDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
