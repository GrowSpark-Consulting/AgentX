"use client";

import { useState, type FormEvent } from "react";
import { ErrorState } from "@/components/shared/states";
import type { FormattedError } from "@/lib/errors";
import { DialogFrame } from "./dialog-frame";
import { describeWriteError, EMPTY_DRAFT, NAME_MAX, toDraft, validateDraft, type FieldErrors, type Service, type ServiceDraft, type ServiceInput } from "./data";

// Add or edit one service, in the prototype's dialog with its .field / .input form controls. Only the
// columns that exist are offered. Everything is validated before the database is called; a failed
// save keeps the dialog and what was typed, and says why.

export function ServiceFormDialog({
  service,
  existing,
  resourceTypes,
  onSave,
  onClose,
}: {
  /** null = a new service. */
  service: Service | null;
  existing: Service[];
  resourceTypes: string[];
  onSave: (input: ServiceInput) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ServiceDraft>(service ? toDraft(service) : EMPTY_DRAFT);
  const [fields, setFields] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<FormattedError | null>(null);

  const set = <K extends keyof ServiceDraft>(key: K, value: ServiceDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setFields((f) => ({ ...f, [key]: undefined }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const result = validateDraft(draft, existing, service?.id ?? null);
    if (!result.ok) {
      setFields(result.fields);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(result.input);
    } catch (err) {
      setError(describeWriteError(err, "Couldn't save the service"));
      setSaving(false);
    }
  }

  const field = (key: keyof ServiceDraft) => ({
    id: `service-${key}`,
    "aria-invalid": fields[key] ? true : undefined,
    "aria-describedby": fields[key] ? `service-${key}-error` : undefined,
  });
  const fieldError = (key: keyof ServiceDraft) =>
    fields[key] ? (
      <p id={`service-${key}-error`} className="app-field-error">
        {fields[key]}
      </p>
    ) : null;

  return (
    <DialogFrame title={service ? `Edit ${service.name}` : "Add a service"} onClose={onClose} busy={saving}>
      <form className="app-form" onSubmit={submit} noValidate style={{ gap: "14px" }}>
        <div className="field">
          <label htmlFor="service-name">Name</label>
          <input
            {...field("name")}
            className="input"
            value={draft.name}
            maxLength={NAME_MAX + 20}
            autoFocus
            onChange={(e) => set("name", e.target.value)}
          />
          {fieldError("name")}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "14px" }}>
          <div className="field">
            <label htmlFor="service-durationMin">Length (minutes)</label>
            <input {...field("durationMin")} className="input" inputMode="numeric" value={draft.durationMin} onChange={(e) => set("durationMin", e.target.value)} />
            {fieldError("durationMin")}
          </div>
          <div className="field">
            <label htmlFor="service-resourceType">Booked with</label>
            <input
              {...field("resourceType")}
              className="input"
              list={resourceTypes.length > 0 ? "service-resource-types" : undefined}
              placeholder={resourceTypes[0] ?? "staff"}
              value={draft.resourceType}
              onChange={(e) => set("resourceType", e.target.value)}
            />
            {resourceTypes.length > 0 ? (
              <datalist id="service-resource-types">
                {resourceTypes.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            ) : null}
            {fieldError("resourceType")}
          </div>
        </div>
        <p className="app-hint" style={{ margin: "-6px 0 0" }}>
          Length is how long a booking blocks the calendar. “Booked with” is the kind of staff or resource that takes it.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "14px" }}>
          <div className="field">
            <label htmlFor="service-priceMin">Lowest price (₹)</label>
            <input {...field("priceMin")} className="input" inputMode="numeric" value={draft.priceMin} onChange={(e) => set("priceMin", e.target.value)} />
            {fieldError("priceMin")}
          </div>
          <div className="field">
            <label htmlFor="service-priceMax">Highest price (₹)</label>
            <input {...field("priceMax")} className="input" inputMode="numeric" value={draft.priceMax} onChange={(e) => set("priceMax", e.target.value)} />
            {fieldError("priceMax")}
          </div>
        </div>
        <p className="app-hint" style={{ margin: "-6px 0 0" }}>Whole rupees. Leave both empty if there’s no fixed price; enter 0 if it’s free.</p>

        <label style={{ display: "flex", gap: "10px", alignItems: "center", fontSize: "14px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => set("active", e.target.checked)}
            style={{ width: "18px", height: "18px", accentColor: "var(--color-accent)", margin: 0 }}
          />
          Customers can book this
        </label>

        {error ? <ErrorState compact title={error.title} description={error.message} /> : null}

        <div className="dialog-actions" style={{ justifyContent: "flex-start", marginTop: 0 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : service ? "Save changes" : "Add service"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}
