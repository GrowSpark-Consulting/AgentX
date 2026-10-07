"use client";

import { useState } from "react";
import { ErrorState } from "@/components/shared/states";
import type { FormattedError } from "@/lib/errors";
import { DialogFrame } from "./dialog-frame";
import { describeWriteError, type Service } from "./data";

// Confirmation before deleting, in the prototype's confirm-dialog pattern (primary action first, then
// the safe choice). Nothing is removed from the list until the database confirms the delete.

export function DeleteServiceDialog({
  service,
  onDelete,
  onClose,
}: {
  service: Service;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<FormattedError | null>(null);

  async function confirm() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await onDelete();
    } catch (err) {
      setError(describeWriteError(err, "Couldn't delete the service"));
      setDeleting(false);
    }
  }

  return (
    <DialogFrame title={`Delete ${service.name}?`} onClose={onClose} busy={deleting}>
      <>
        <div style={{ fontSize: "14px", color: "var(--color-neutral-700)" }}>
          Customers won’t be able to book it any more. This can’t be undone.
        </div>
        {error ? <ErrorState compact title={error.title} description={error.message} /> : null}
        <div className="dialog-actions" style={{ justifyContent: "flex-start" }}>
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete service"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={deleting} autoFocus>
            Keep it
          </button>
        </div>
      </>
    </DialogFrame>
  );
}
