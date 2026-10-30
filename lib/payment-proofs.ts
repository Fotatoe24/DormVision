import { createAdminClient } from "@/lib/supabase/admin";
import { imageExtension, type ImageType } from "@/lib/image-files";

// Server-side helpers for payment-proof images (migration 0019). Nothing in
// here is safe to import from a client component: it uses the service-role
// client, and the whole point of the bucket being private is that only
// server code decides who may upload to it or view from it.

export const PROOF_BUCKET = "payment-proofs";
export const MAX_PROOF_BYTES = 2 * 1024 * 1024; // matches the bucket limit
export const PROOF_URL_TTL_SECONDS = 3600;

// Methods where a proof is expected (there's a transfer reference / screenshot
// to show). Cash has nothing to photograph, so it stays optional.
export const PROOF_REQUIRED_METHODS = ["gcash", "bank_transfer"];

// {tenants.id}/{payments.id}-{unix-ms}.{ext}. The extension follows the real
// type: browsers that can't encode WebP (Safari) hand back JPEG/PNG, and a
// mislabelled extension would be a lie in the bucket.
export function buildProofPath(
  tenantId: string,
  paymentId: string,
  type: ImageType
) {
  return `${tenantId}/${paymentId}-${Date.now()}.${imageExtension(type)}`;
}

// Short-lived signed URLs for a batch of object paths, keyed by path. Callers
// must already have established that the viewer may see these payments --
// this only turns authorized paths into links. Missing or unsignable paths
// are simply absent from the map (the UI then shows no proof).
export async function signProofUrls(
  paths: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const urls = new Map<string, string>();

  if (unique.length === 0) return urls;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(PROOF_BUCKET)
    .createSignedUrls(unique, PROOF_URL_TTL_SECONDS);

  if (error || !data) {
    console.error("Could not sign payment proof URLs:", error);
    return urls;
  }

  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) {
      urls.set(item.path, item.signedUrl);
    }
  }

  return urls;
}
