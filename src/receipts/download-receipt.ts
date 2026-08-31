import type { EvidenceReceipt } from "./types";

interface ReceiptDownloadEnvironment {
  readonly document: Document;
  readonly createObjectUrl: (blob: Blob) => string;
  readonly revokeObjectUrl: (url: string) => void;
}

export function receiptFilename(receipt: EvidenceReceipt): string {
  const timestamp = receipt.createdAt.replace(/[:.]/g, "-");
  return `agent-harness-lab-${receipt.scenario.id}-${timestamp}.json`;
}

export function downloadEvidenceReceipt(
  receipt: EvidenceReceipt,
  environment: ReceiptDownloadEnvironment = {
    document,
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  },
): string {
  const blob = new Blob([`${JSON.stringify(receipt, null, 2)}\n`], {
    type: "application/json",
  });
  const url = environment.createObjectUrl(blob);
  const anchor = environment.document.createElement("a");
  const filename = receiptFilename(receipt);
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.hidden = true;
  environment.document.body.append(anchor);
  anchor.click();
  anchor.remove();
  queueMicrotask(() => environment.revokeObjectUrl(url));
  return filename;
}
