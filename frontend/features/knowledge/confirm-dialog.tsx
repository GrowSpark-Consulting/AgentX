"use client";

import { useState } from "react";
import { ErrorState } from "@/components/shared/states";
import type { FormattedError } from "@/lib/errors";
import { DialogFrame } from "./dialog-frame";

// A confirmation before a write that can't be undone (delete an FAQ or a document, dismiss a
// question), in the prototype's confirm-dialog pattern used by DeleteServiceDialog: primary action
// first, then the safe choice, which has focus. The dialog stays open, with the reason, if it fails.

export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  busyLabel,
  keepLabel,
  onConfirm,
  describeError,
  onClose,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  busyLabel: string;
  keepLabel: string;
  onConfirm: () => Promise<void>;
  describeError: (err: unknown) => FormattedError;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FormattedError | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  return (
    <DialogFrame title={title} onClose={onClose} busy={busy}>
      <>
        <div style={{ fontSize: "14px", color: "var(--color-neutral-700)", overflowWrap: "anywhere" }}>{text}</div>
        {error ? <ErrorState compact title={error.title} description={error.message} /> : null}
        <div className="dialog-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy} autoFocus>
            {keepLabel}
          </button>
        </div>
      </>
    </DialogFrame>
  );
}
