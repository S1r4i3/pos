"use client";

import { useRef, useState, useTransition } from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { setOutletLogo } from "./actions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB (same limit as the storage bucket)
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export function LogoUploader({ orgId, outletId, currentUrl }: { orgId: string; outletId: string; currentUrl: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function handleFile(file: File) {
    setMessage(null);
    const ext = TYPES[file.type];
    if (!ext) return setMessage({ tone: "danger", text: "Please choose a PNG, JPG or WebP image." });
    if (file.size > MAX_BYTES) return setMessage({ tone: "danger", text: "Image is larger than 2 MB. Please use a smaller one." });

    setUploading(true);
    const supabase = createClient();
    // Folder starts with the business id — the storage security rules require this.
    const path = `${orgId}/outlets/${outletId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      setUploading(false);
      return setMessage({ tone: "danger", text: `Upload failed: ${error.message}` });
    }
    const { data } = supabase.storage.from("media").getPublicUrl(path);
    const result = await setOutletLogo(outletId, data.publicUrl);
    setUploading(false);
    if (result.error) return setMessage({ tone: "danger", text: result.error });
    setPreview(data.publicUrl);
    setMessage({ tone: "success", text: "Logo updated." });
  }

  function removeLogo() {
    startTransition(async () => {
      const result = await setOutletLogo(outletId, null);
      if (result.error) setMessage({ tone: "danger", text: result.error });
      else {
        setPreview(null);
        setMessage({ tone: "success", text: "Logo removed." });
      }
    });
  }

  const busy = uploading || pending;

  return (
    <Card>
      <CardHeader title="Logo" description="Shown on bills and the app. Square, simple black-and-white logos print best on thermal paper." />
      <CardBody className="flex flex-wrap items-center gap-5">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Outlet logo" className="h-full w-full object-contain" />
          ) : (
            <ImageUp className="h-8 w-8 text-muted" aria-hidden />
          )}
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImageUp className="h-4 w-4" aria-hidden />}
              {uploading ? "Uploading…" : preview ? "Change logo" : "Upload logo"}
            </Button>
            {preview && (
              <Button variant="ghost" onClick={removeLogo} disabled={busy} className="text-danger">
                <Trash2 className="h-4 w-4" aria-hidden />
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted">PNG, JPG or WebP · up to 2 MB</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
        </div>
        {message && (
          <Alert tone={message.tone} className="w-full">
            {message.text}
          </Alert>
        )}
      </CardBody>
    </Card>
  );
}
