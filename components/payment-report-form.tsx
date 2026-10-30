"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, X } from "lucide-react";

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "gcash", label: "GCash" },
  { value: "other", label: "Other" },
];

// Mirrors PROOF_REQUIRED_METHODS in lib/payment-proofs.ts. The server
// re-checks it; this only saves the tenant a round trip.
const PROOF_REQUIRED = ["gcash", "bank_transfer"];

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_RAW_BYTES = 15 * 1024 * 1024; // what we'll even try to compress
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // the bucket's limit

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// The tenant's "I've Paid": a method, an optional (GCash / bank transfer:
// required) photo of the receipt, and a submit.
//
// The image is compressed ONCE, when it is picked, and the compressed result
// is what every upload attempt sends -- so retrying after a network error
// never re-encodes (and degrades) it again. Receipt text has to stay
// readable, hence the generous 1600px / 0.4 MB / quality 0.8 settings.
export function PaymentReportForm({ billId }: { billId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [method, setMethod] = useState("cash");
  const [proof, setProof] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null); // null = not uploading
  const [error, setError] = useState<string | null>(null);

  const uploading = progress !== null;
  const busy = compressing || uploading;
  const proofRequired = PROOF_REQUIRED.includes(method);

  // Object URLs hold memory until revoked.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function clearProof() {
    setProof(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;

    setError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Please choose a JPEG, PNG or WebP image.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > MAX_RAW_BYTES) {
      setError("That photo is too large to process. Please choose one under 15 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setCompressing(true);

    try {
      // Loaded on demand so the library isn't part of every page's bundle.
      const { default: imageCompression } = await import(
        "browser-image-compression"
      );

      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 1600,
        maxSizeMB: 0.4,
        fileType: "image/webp",
        initialQuality: 0.8,
        useWebWorker: false, // the worker script is fetched from a public CDN; not worth that dependency
      });

      // Some browsers (Safari) can't encode WebP and quietly return another
      // type; accept what the bucket accepts, refuse anything else.
      if (!ACCEPTED_TYPES.includes(compressed.type)) {
        setError("Your browser couldn't prepare that image. Try a different one.");
        clearProof();
        return;
      }

      if (compressed.size > MAX_UPLOAD_BYTES) {
        setError("That image is still too large after compression. Try a smaller screenshot.");
        clearProof();
        return;
      }

      setProof(compressed);
      setPreviewUrl(URL.createObjectURL(compressed));
    } catch (err) {
      console.error("Image compression failed:", err);
      setError("Couldn't process that image. Please try another one.");
      clearProof();
    } finally {
      setCompressing(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    if (proofRequired && !proof) {
      setError("Please attach a screenshot or photo of your payment first.");
      return;
    }

    setError(null);
    setProgress(0);

    const body = new FormData();
    body.append("billId", billId);
    body.append("method", method);
    if (proof) {
      const ext =
        proof.type === "image/webp" ? "webp" : proof.type === "image/png" ? "png" : "jpg";
      body.append("proof", proof, `proof.${ext}`);
    }

    // XMLHttpRequest, not fetch: fetch can't report upload progress.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/payments/report");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      let message = "Could not submit your payment report.";
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          toast.success("Payment reported. Your dorm owner will confirm it.");
          router.refresh();
          return;
        }
        if (data?.error) message = data.error;
      } catch {
        // Non-JSON body (e.g. a proxy error page) -- keep the generic message.
        if (xhr.status === 413) message = "That image is too large to upload.";
      }
      setProgress(null);
      setError(message);
    };

    xhr.onerror = () => {
      setProgress(null);
      setError("Network error. Check your connection and try again.");
    };

    xhr.send(body);
  }

  return (
    <form onSubmit={submit} className="space-y-2" noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={method}
          onChange={(e) => {
            setMethod(e.target.value);
            setError(null);
          }}
          disabled={busy}
          aria-label="Payment method"
          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary disabled:opacity-60"
        >
          {METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>

        <label
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground-muted hover:bg-surface-muted hover:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary ${
            busy ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {proof ? "Change proof" : proofRequired ? "Attach proof (required)" : "Attach proof (optional)"}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className="sr-only"
            disabled={busy}
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className={`rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-surface hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`}
        >
          {uploading ? (
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
              Sending…
            </span>
          ) : (
            "I’ve Paid"
          )}
        </button>
      </div>

      {compressing && (
        <p className="text-xs text-foreground-muted" role="status">
          Preparing your image…
        </p>
      )}

      {proof && previewUrl && (
        <div className="flex items-center gap-3 rounded-md bg-surface-muted p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Preview of your payment proof"
            className="h-14 w-14 shrink-0 rounded border border-border bg-background object-contain"
          />
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-medium text-foreground">Ready to send</p>
            <p className="text-foreground-muted">{formatSize(proof.size)}</p>
          </div>
          <button
            type="button"
            onClick={clearProof}
            disabled={busy}
            aria-label="Remove attached image"
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-foreground-muted hover:bg-background hover:text-foreground disabled:opacity-60 ${focusRing}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {uploading && (
        <div
          role="progressbar"
          aria-label="Upload progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress ?? 0}
          className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-status-overdue">
          {error}
        </p>
      )}
    </form>
  );
}
