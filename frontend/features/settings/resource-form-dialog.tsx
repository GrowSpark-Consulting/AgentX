"use client";

import { useState, type FormEvent } from "react";
import { ErrorState } from "@/components/shared/states";
import type { FormattedError } from "@/lib/errors";
import { DialogFrame } from "@/features/knowledge/dialog-frame";
import { defaultHoursDraft, hasOwnHours, toHoursDraft } from "./hours";
import { HoursFields } from "./hours-fields";
import {
  describeSetupWriteError,
  RESOURCE_NAME_MAX,
  validateResourceDraft,
  type Resource,
  type ResourceDraft,
  type ResourceFieldErrors,
  type ResourceInput,
} from "./resources-data";

// Add or edit one staff member or resource: name, kind (matched against services' "Booked with"), its
// own working hours or the business's, and the pincodes it covers for visits at the customer's place.
// Validated before anything is sent; a failed save keeps the dialog and what was typed.

function toDraft(r: Resource | null): ResourceDraft {
  if (!r) return { name: "", type: "", active: true, hoursMode: "business", hours: defaultHoursDraft(), pincodes: "" };
  const own = r.hours !== null && hasOwnHours(r.hours);
  return {
    name: r.name,
    type: r.type,
    active: r.active,
    hoursMode: own ? "own" : "business",
    hours: own && r.hours ? toHoursDraft(r.hours) : defaultHoursDraft(),
    pincodes: (r.pincodes ?? []).join(", "),
  };
}

export function ResourceFormDialog({
  resource,
  existing,
  types,
  onSave,
  onClose,
}: {
  /** null = a new resource. */
  resource: Resource | null;
  existing: Resource[];
  /** Kinds already in use by resources or services, offered as suggestions. */
  types: string[];
  onSave: (input: ResourceInput) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ResourceDraft>(() => toDraft(resource));
  const [fields, setFields] = useState<ResourceFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<FormattedError | null>(null);

  const set = <K extends keyof ResourceDraft>(key: K, value: ResourceDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setFields((f) => {
      const next = { ...f };
      if (key === "name" || key === "type" || key === "pincodes") delete next[key as "name" | "type" | "pincodes"];
      if (key === "hours" || key === "hoursMode") {
        delete next.hours;
        delete next.hoursFields;
      }
      return next;
    });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const result = validateResourceDraft(draft, existing, resource?.id ?? null);
    if (!result.ok) {
      setFields(result.fields);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(result.input);
    } catch (err) {
      setError(describeSetupWriteError(err, "Couldn't save"));
      setSaving(false);
    }
  }

  const fieldProps = (key: "name" | "type" | "pincodes") => ({
    id: `resource-${key}`,
    "aria-invalid": fields[key] ? true : undefined,
    "aria-describedby": fields[key] ? `resource-${key}-error` : key === "name" ? undefined : `resource-${key}-hint`,
  });
  const fieldError = (key: "name" | "type" | "pincodes" | "hours") =>
    fields[key] ? (
      <p id={`resource-${key}-error`} className="app-field-error">
        {fields[key]}
      </p>
    ) : null;

  return (
    <DialogFrame title={resource ? `Edit ${resource.name}` : "Add staff or a resource"} onClose={onClose} busy={saving} width={620}>
      <form className="app-form" onSubmit={submit} noValidate style={{ gap: "14px", maxWidth: "none" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "14px" }}>
          <div className="field">
            <label htmlFor="resource-name">Name</label>
            <input {...fieldProps("name")} className="input" value={draft.name} maxLength={RESOURCE_NAME_MAX + 20} autoFocus onChange={(e) => set("name", e.target.value)} />
            {fieldError("name")}
          </div>
          <div className="field">
            <label htmlFor="resource-type">Kind</label>
            <input
              {...fieldProps("type")}
              className="input"
              list={types.length > 0 ? "resource-types" : undefined}
              placeholder={types[0] ?? "staff"}
              value={draft.type}
              onChange={(e) => set("type", e.target.value)}
            />
            {types.length > 0 ? (
              <datalist id="resource-types">
                {types.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            ) : null}
            {fieldError("type")}
          </div>
        </div>
        <p id="resource-type-hint" className="app-hint" style={{ margin: "-6px 0 0" }}>
          A service is booked with any active resource whose kind matches its “Booked with”, like staff or room.
        </p>

        <fieldset style={{ border: 0, margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 }}>
          <legend style={{ fontSize: "13px", fontWeight: 600, padding: 0, marginBottom: "8px" }}>Working hours</legend>
          <div className="app-seg" style={{ alignSelf: "flex-start", flexWrap: "wrap" }}>
            <label>
              <input type="radio" name="resource-hours-mode" checked={draft.hoursMode === "business"} onChange={() => set("hoursMode", "business")} />
              Business hours
            </label>
            <label>
              <input type="radio" name="resource-hours-mode" checked={draft.hoursMode === "own"} onChange={() => set("hoursMode", "own")} />
              Own hours
            </label>
          </div>
          {draft.hoursMode === "own" ? (
            <HoursFields idPrefix="resource-hours" value={draft.hours} errors={fields.hoursFields ?? {}} disabled={saving} onChange={(next) => set("hours", next)} />
          ) : (
            <p className="app-hint" style={{ margin: 0 }}>
              Works whenever the business is open.
            </p>
          )}
          {fieldError("hours")}
        </fieldset>

        <div className="field">
          <label htmlFor="resource-pincodes">Service-area pincodes</label>
          <textarea
            {...fieldProps("pincodes")}
            className="input"
            rows={2}
            placeholder="600041, 600096"
            value={draft.pincodes}
            onChange={(e) => set("pincodes", e.target.value)}
            style={{ resize: "vertical", minHeight: "64px" }}
          />
          {fieldError("pincodes")}
          <p id="resource-pincodes-hint" className="app-hint">
            For visits at the customer’s place: only customers in these pincodes are offered this resource. Leave empty to cover every pincode.
          </p>
        </div>

        <label style={{ display: "flex", gap: "10px", alignItems: "center", fontSize: "14px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => set("active", e.target.checked)}
            style={{ width: "18px", height: "18px", accentColor: "var(--color-accent)", margin: 0 }}
          />
          Can take bookings
        </label>

        {error ? <ErrorState compact title={error.title} description={error.message} /> : null}

        <div className="dialog-actions" style={{ justifyContent: "flex-start", marginTop: 0 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : resource ? "Save changes" : "Add"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}
