import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { CopyButton } from "@/components/copy-button"
import { useTranslation } from "@/lib/i18n"

type WebhookSecretDialogProps = {
  secret: string | null
  onClose: () => void
}

export function WebhookSecretDialog({
  secret,
  onClose,
}: WebhookSecretDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog
      open={secret !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("components.settings.webhooks.secret.title")}
          </DialogTitle>
          <DialogDescription>
            {t("components.settings.webhooks.secret.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={secret ?? ""}
            className="font-mono"
            aria-label={t("components.settings.webhooks.secret.title")}
            onFocus={(event) => event.target.select()}
          />
          <CopyButton value={secret ?? ""} />
        </div>
        <DialogFooter>
          <Button onClick={onClose}>
            {t("components.settings.webhooks.secret.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
