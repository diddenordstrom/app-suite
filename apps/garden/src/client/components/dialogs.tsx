import { useEffect, useState, type ReactNode } from "react";
import { Button, Dialog, Textarea } from "../ui";
import { api } from "../api";
import { t } from "../i18n";
import { FormError, Label } from "./common";

/** "Are you sure?" with a destructive confirm and a cancel. */
export function ConfirmDialog({ open, title, body, confirmLabel, busy, onConfirm, onClose, testId }: {
  open: boolean; title: string; body: ReactNode; confirmLabel: string; busy?: boolean; onConfirm: () => void; onClose: () => void; testId: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} className="sm:max-w-sm">
      <p className="mb-4 text-sm text-muted-foreground">{body}</p>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 text-danger" disabled={busy} data-testid={testId} onClick={onConfirm}>{confirmLabel}</Button>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
      </div>
    </Dialog>
  );
}

/**
 * Pick a photo, preview it, add a caption, save. The image is uploaded first (POST /image) and then attached
 * with `attach`; if attaching fails and the dialog is closed, the orphan upload is deleted.
 */
export function ImageUploadDialog({ open, onClose, title, saveLabel, attach, captionPlaceholder, withCaption = true, fileLabel, fileId = "image-file", fileTestId = "image-file-input" }: {
  open: boolean; onClose: () => void; title: string; saveLabel: string; captionPlaceholder?: string; fileTestId?: string;
  withCaption?: boolean; fileLabel?: string; fileId?: string;
  attach: (imageId: string, caption: string | null) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setFile(null); setPreview(null); setCaption(""); setError(null); setPending(null); }
  }, [open]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const close = () => {
    if (pending && !busy) void api("DELETE", `/image/${pending}`).catch(() => undefined);
    setPending(null);
    onClose();
  };
  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const id = pending ?? (await api<{ id: string }>("POST", "/image", fd)).id;
      setPending(id);
      await attach(id, caption.trim() || null);
      setPending(null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("image.upload.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} title={title} className="sm:max-w-md">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={fileId}>{fileLabel ?? t("plantingDetail.image.filePicker")}</Label>
          <input id={fileId} type="file" accept="image/*" className="block w-full text-sm" data-testid={fileTestId}
            onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setPreview(f ? URL.createObjectURL(f) : null); }} />
        </div>
        {preview && <div className="overflow-hidden rounded-md border border-border"><img src={preview} alt="" className="h-auto w-full" /></div>}
        {withCaption && <div className="space-y-2">
          <Label htmlFor="image-caption">{t("plantingDetail.image.captionLabel")}</Label>
          <Textarea id="image-caption" rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={captionPlaceholder ?? t("plantingDetail.image.captionPlaceholder")} />
        </div>}
        <FormError>{error}</FormError>
        <div className="flex gap-2">
          <Button className="flex-1" disabled={!file || busy} onClick={() => void submit()}>{busy ? t("common.saving") : saveLabel}</Button>
          <Button variant="outline" onClick={close}>{t("common.cancel")}</Button>
        </div>
      </div>
    </Dialog>
  );
}
