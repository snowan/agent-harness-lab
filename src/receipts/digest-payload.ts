import type { EvidenceReceipt, EvidenceReceiptPayload } from "./types";

export type ReceiptDigestPayload = Omit<EvidenceReceiptPayload, "createdAt">;

export function receiptDigestPayload(
  value: EvidenceReceiptPayload | EvidenceReceipt,
): ReceiptDigestPayload {
  const { createdAt: _createdAt, ...withoutCreatedAt } = value;
  if ("receiptDigest" in withoutCreatedAt) {
    const { receiptDigest: _receiptDigest, ...payload } = withoutCreatedAt;
    return payload;
  }
  return withoutCreatedAt;
}
