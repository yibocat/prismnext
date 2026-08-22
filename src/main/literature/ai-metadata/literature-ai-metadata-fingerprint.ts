import { createHash } from "node:crypto";

export function aiMetadataFingerprint(input: {
  abstractText: string;
  pdfSha: string | null;
  model: string;
}): string {
  const payload = `${input.model}\n${input.pdfSha ?? ""}\n${input.abstractText.trim()}`;
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 32);
}
