"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { ConfirmDialog } from "@/features/knowledge/confirm-dialog";
import { formatError, type FormattedError } from "@/lib/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { calendarOutcomeText, googleConnectUrl, listCalendarConnections, type CalendarConnection, type CalendarOutcome } from "./google-calendar";
import { formatServiceArea, summarizeHours } from "./hours";
import { ResourceFormDialog } from "./resource-form-dialog";
import {
  byResourceName,
  createResource,
  deleteResource,
  describeSetupWriteError,
  listResources,
  updateResource,
  usesBusinessHours,
  type Resource,
  type ResourceInput,
} from "./resources-data";
import { sectionHead, sectionTitle } from "./section";

// "Staff & resources": who or what can be booked (resources), with working hours, service-area
// pincodes and Google Calendar, in the services table's layout. The list changes only after the
// database confirms a write. Connecting a calendar sends the browser to Google (google-calendar.ts).

type ListState = { status: "loading" } | { status: "error"; error: FormattedError } | { status: "ready"; resources: Resource[] };
type DialogState = { kind: "none" } | { kind: "form"; resource: Resource | null } | { kind: "delete"; resource: Resource };

const rowButton = { padding: "2px 6px", whiteSpace: "nowrap" } as const;
const visuallyHidden = { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap" } as const;

/** The kinds services are booked with, as suggestions; a failed read just offers none. */
async function serviceKinds(tenantId: string): Promise<string[]> {
  const { data, error } = await getSupabaseBrowserClient().from("services").select("resource_type").eq("tenant_id", tenantId);
  if (error) return [];
  const parsed = z.array(z.object({ resource_type: z.string() })).safeParse(data ?? []);
  return parsed.success ? parsed.data.map((r) => r.resource_type) : [];
}

/** Calendar status per resource; "error" when it couldn't be read (the rest of the table still works). */
type Calendars = { status: "loading" } | { status: "error" } | { status: "ready"; byResource: Map<string, CalendarConnection> };

export function ResourcesSection({
  tenantId,
  canWrite,
  onSaved,
  calendarReturn,
}: {
  tenantId: string;
  canWrite: boolean;
  onSaved: (message: string) => void;
  /** What Google's callback reported, when the page was opened from it. */
  calendarReturn: { outcome: CalendarOutcome; resourceId: string | null } | null;
}) {
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [calendars, setCalendars] = useState<Calendars>({ status: "loading" });
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<FormattedError | null>(null);
  const [kinds, setKinds] = useState<string[]>([]);
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });

  const load = useCallback(
    () =>
      Promise.all([listResources(getSupabaseBrowserClient(), tenantId), serviceKinds(tenantId)]).then(
        ([resources, services]) => {
          setList({ status: "ready", resources });
          setKinds(services);
        },
        (err: unknown) => setList({ status: "error", error: formatError(err) }),
      ),
    [tenantId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    listCalendarConnections(getSupabaseBrowserClient(), tenantId).then(
      (byResource) => setCalendars({ status: "ready", byResource }),
      () => setCalendars({ status: "error" }),
    );
  }, [tenantId]);

  async function connect(resource: Resource) {
    if (connecting) return;
    setConnecting(resource.id);
    setConnectError(null);
    try {
      window.location.assign(await googleConnectUrl(tenantId, resource.id));
    } catch (err) {
      setConnectError({ ...formatError(err), title: `Couldn't connect Google Calendar for ${resource.name}` });
      setConnecting(null);
    }
  }

  const resources = list.status === "ready" ? list.resources : [];
  const types = [...new Set([...resources.map((r) => r.type), ...kinds].map((t) => t.trim()).filter(Boolean))].sort();
  const close = useCallback(() => setDialog({ kind: "none" }), []);
  const returned = calendarReturn
    ? calendarOutcomeText(calendarReturn.outcome, resources.find((r) => r.id === calendarReturn.resourceId)?.name ?? null)
    : null;

  async function save(editing: Resource | null, input: ResourceInput) {
    const client = getSupabaseBrowserClient();
    const saved = editing ? await updateResource(client, tenantId, editing.id, input) : await createResource(client, tenantId, input);
    setList((prev) => (prev.status === "ready" ? { ...prev, resources: [...prev.resources.filter((r) => r.id !== saved.id), saved].sort(byResourceName) } : prev));
    setDialog({ kind: "none" });
    onSaved(editing ? `Saved ${saved.name}` : `Added ${saved.name}`);
  }

  async function remove(resource: Resource) {
    await deleteResource(getSupabaseBrowserClient(), tenantId, resource.id);
    setList((prev) => (prev.status === "ready" ? { ...prev, resources: prev.resources.filter((r) => r.id !== resource.id) } : prev));
    setDialog({ kind: "none" });
    onSaved(`Deleted ${resource.name}`);
  }

  return (
    <section aria-labelledby="resources-heading" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={sectionHead}>
        <h2 id="resources-heading" style={sectionTitle}>
          Staff &amp; resources{list.status === "ready" ? ` · ${resources.length}` : ""}
        </h2>
        {canWrite ? (
          <button type="button" className="btn btn-ghost" onClick={() => setDialog({ kind: "form", resource: null })} disabled={list.status !== "ready"}>
            Add
          </button>
        ) : null}
      </div>

      {returned && list.status !== "loading" ? (
        <p className={returned.ok ? "app-success" : "app-notice"} role="status" style={{ margin: 0 }}>
          {returned.text}
        </p>
      ) : null}
      {connectError ? <ErrorState compact title={connectError.title} description={connectError.message} /> : null}

      {list.status === "loading" ? <LoadingState compact title="Loading staff and resources" /> : null}
      {list.status === "error" ? (
        <ErrorState
          compact
          title="Couldn't load staff and resources"
          description={list.error.message}
          onRetry={() => {
            setList({ status: "loading" });
            void load();
          }}
        />
      ) : null}

      {list.status === "ready" && resources.length === 0 ? (
        <EmptyState
          compact
          title="No staff or resources yet"
          description={
            canWrite
              ? "Add the people, rooms or equipment customers book. Without one, services can't be booked."
              : "An owner or admin adds the people, rooms or equipment customers book."
          }
          action={
            canWrite ? (
              <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: "form", resource: null })}>
                Add staff or a resource
              </button>
            ) : undefined
          }
        />
      ) : null}

      {list.status === "ready" && resources.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ minWidth: "860px" }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Working hours</th>
                <th>Service area</th>
                <th>Google Calendar</th>
                <th>Status</th>
                {canWrite ? (
                  <th style={{ position: "relative" }}>
                    <span style={visuallyHidden}>Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: "600" }}>{r.name}</td>
                  <td>{r.type}</td>
                  <td style={{ minWidth: "200px" }}>
                    {r.hours === null ? (
                      <span style={{ color: "var(--color-accent-700)", fontWeight: 600 }}>Can’t be read · uses business hours</span>
                    ) : usesBusinessHours(r) ? (
                      <span style={{ color: "var(--color-neutral-700)" }}>Business hours</span>
                    ) : (
                      summarizeHours(r.hours)
                    )}
                  </td>
                  <td>{formatServiceArea(r.pincodes)}</td>
                  <td style={{ minWidth: "160px" }}>
                    <CalendarCell
                      calendars={calendars}
                      resource={r}
                      canConnect={canWrite}
                      busy={connecting === r.id}
                      disabled={connecting !== null}
                      onConnect={() => void connect(r)}
                    />
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: "600",
                        padding: "3px 8px",
                        border: `1px solid ${r.active ? "var(--color-text)" : "var(--color-divider)"}`,
                        color: r.active ? "var(--color-text)" : "var(--color-neutral-700)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.active ? "Active" : "Off"}
                    </span>
                  </td>
                  {canWrite ? (
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button type="button" className="btn btn-ghost" style={rowButton} aria-label={`Edit ${r.name}`} onClick={() => setDialog({ kind: "form", resource: r })}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-ghost" style={rowButton} aria-label={`Delete ${r.name}`} onClick={() => setDialog({ kind: "delete", resource: r })}>
                        Delete
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {dialog.kind === "form" ? (
        <ResourceFormDialog resource={dialog.resource} existing={resources} types={types} onSave={(input) => save(dialog.resource, input)} onClose={close} />
      ) : null}
      {dialog.kind === "delete" ? (
        <ConfirmDialog
          title={`Delete ${dialog.resource.name}?`}
          text="It stops being offered for bookings. One with bookings can't be deleted; switch it off instead."
          confirmLabel="Delete"
          busyLabel="Deleting…"
          keepLabel="Keep it"
          onConfirm={() => remove(dialog.resource)}
          describeError={(err) => describeSetupWriteError(err, `Couldn't delete ${dialog.resource.name}`)}
          onClose={close}
        />
      ) : null}
    </section>
  );
}

function CalendarCell({
  calendars,
  resource,
  canConnect,
  busy,
  disabled,
  onConnect,
}: {
  calendars: Calendars;
  resource: Resource;
  canConnect: boolean;
  busy: boolean;
  disabled: boolean;
  onConnect: () => void;
}) {
  if (calendars.status === "loading") return <span style={{ color: "var(--color-neutral-700)" }}>…</span>;
  if (calendars.status === "error") return <span style={{ color: "var(--color-neutral-700)" }}>Couldn’t check</span>;
  const c = calendars.byResource.get(resource.id);
  const connected = c?.status === "connected";
  const label = c ? "Reconnect" : "Connect";
  return (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "2px" }}>
      {connected ? (
        <span>
          <span style={{ fontWeight: 600 }}>Connected</span>
          {c.email ? <span style={{ display: "block", fontSize: "12px", color: "var(--color-neutral-700)", overflowWrap: "anywhere" }}>{c.email}</span> : null}
        </span>
      ) : c ? (
        <span style={{ fontWeight: 600, color: "var(--color-accent-700)" }}>Needs reconnecting</span>
      ) : (
        <span style={{ color: "var(--color-neutral-700)" }}>Not connected</span>
      )}
      {canConnect && !connected ? (
        <button type="button" className="btn btn-ghost" style={{ padding: "2px 0", whiteSpace: "nowrap" }} disabled={disabled} aria-label={`${label} Google Calendar for ${resource.name}`} onClick={onConnect}>
          {busy ? "Opening Google…" : label}
        </button>
      ) : null}
    </span>
  );
}
