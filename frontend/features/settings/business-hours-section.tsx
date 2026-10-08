"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { formatError, type FormattedError } from "@/lib/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { DAY_NAMES, DAYS, defaultHoursDraft, hasOwnHours, toHoursDraft, validateHours, type HoursDraft, type HoursErrors } from "./hours";
import { HoursFields } from "./hours-fields";
import { describeSetupWriteError, readBusinessHours, saveBusinessHours, type BusinessHours } from "./resources-data";
import { sectionHead, sectionTitle } from "./section";

// The business's opening hours (tenants.business_hours): every resource without hours of its own
// works these, and the AI only offers times inside them. Shown as a day-by-day list; owners and admins
// edit it in place. Saved only after validation, and the list changes only once the database answers.

type State = { status: "loading" } | { status: "error"; error: FormattedError } | { status: "ready"; data: BusinessHours };

export function BusinessHoursSection({ tenantId, canWrite, onSaved }: { tenantId: string; canWrite: boolean; onSaved: (message: string) => void }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [draft, setDraft] = useState<HoursDraft | null>(null);
  const [errors, setErrors] = useState<HoursErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<FormattedError | null>(null);

  const load = useCallback(
    () =>
      readBusinessHours(getSupabaseBrowserClient(), tenantId).then(
        (data) => setState({ status: "ready", data }),
        (err: unknown) => setState({ status: "error", error: formatError(err) }),
      ),
    [tenantId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const hours = state.status === "ready" ? state.data.hours : null;
  const isSet = hours !== null && hasOwnHours(hours);

  function startEditing() {
    setDraft(hours && isSet ? toHoursDraft(hours) : defaultHoursDraft());
    setErrors({});
    setSaveError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft || saving) return;
    const result = validateHours(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const data = await saveBusinessHours(getSupabaseBrowserClient(), tenantId, result.hours);
      setState({ status: "ready", data });
      setDraft(null);
      onSaved("Saved business hours");
    } catch (err) {
      setSaveError(describeSetupWriteError(err, "Couldn't save the hours"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="business-hours-heading" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={sectionHead}>
        <h2 id="business-hours-heading" style={sectionTitle}>
          Business hours
        </h2>
        {canWrite && state.status === "ready" && !draft && isSet ? (
          <button type="button" className="btn btn-ghost" onClick={startEditing}>
            Edit
          </button>
        ) : null}
      </div>

      {state.status === "loading" ? <LoadingState compact title="Loading your hours" /> : null}
      {state.status === "error" ? (
        <ErrorState
          compact
          title="Couldn't load your hours"
          description={state.error.message}
          onRetry={() => {
            setState({ status: "loading" });
            void load();
          }}
        />
      ) : null}

      {state.status === "ready" && !draft ? (
        <>
          <p className="app-hint" style={{ margin: 0 }}>
            Staff and resources without their own hours work these. Times are in {state.data.timezone}.
          </p>
          {hours === null ? (
            <ErrorState
              compact
              title="These hours can't be read"
              description={canWrite ? "Set them again to fix them; until then no times are offered from them." : "Ask an owner or admin to set them again."}
              action={
                canWrite ? (
                  <button type="button" className="btn btn-secondary" onClick={startEditing}>
                    Set business hours
                  </button>
                ) : undefined
              }
            />
          ) : !isSet ? (
            <EmptyState
              compact
              title="No business hours yet"
              description="Without hours, only staff and resources with their own hours can be booked."
              action={
                canWrite ? (
                  <button type="button" className="btn btn-primary" onClick={startEditing}>
                    Set business hours
                  </button>
                ) : undefined
              }
            />
          ) : (
            <dl style={{ margin: 0 }}>
              {DAYS.map((day) => {
                const intervals = hours[day] ?? [];
                return (
                  <div key={day} style={{ display: "grid", gridTemplateColumns: "minmax(96px,120px) minmax(0,1fr)", gap: "12px", padding: "8px 0", borderBottom: "1px solid var(--color-divider)", fontSize: "14px" }}>
                    <dt style={{ color: "var(--color-neutral-700)" }}>{DAY_NAMES[day]}</dt>
                    <dd style={{ margin: 0, fontWeight: intervals.length ? 600 : 400, color: intervals.length ? "var(--color-text)" : "var(--color-neutral-700)" }}>
                      {intervals.length ? intervals.map((i) => `${i.start}–${i.end}`).join(", ") : "Closed"}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
        </>
      ) : null}

      {draft ? (
        <form className="app-form" onSubmit={submit} noValidate style={{ maxWidth: "none", gap: "12px" }} aria-label="Business hours">
          <p className="app-hint" style={{ margin: 0 }}>
            24-hour times in {state.status === "ready" ? state.data.timezone : "your time zone"}, like 09:30 and 18:00. Use “Add hours” for a break in the day.
          </p>
          <HoursFields
            idPrefix="business-hours"
            value={draft}
            errors={errors}
            disabled={saving}
            onChange={(next) => {
              setDraft(next);
              setErrors({});
            }}
          />
          {Object.keys(errors).length > 0 ? (
            <p className="app-field-error" role="alert" style={{ margin: 0 }}>
              Check the hours marked above.
            </p>
          ) : null}
          {saveError ? <ErrorState compact title={saveError.title} description={saveError.message} /> : null}
          <div className="app-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save hours"}
            </button>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
