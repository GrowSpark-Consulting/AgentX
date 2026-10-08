"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { ConfirmDialog } from "@/features/knowledge/confirm-dialog";
import { formatError, type FormattedError } from "@/lib/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
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

// "Staff & resources": who or what can be booked (resources), with working hours and service-area
// pincodes, in the services table's layout. The list changes only after the database confirms a write.

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

export function ResourcesSection({ tenantId, canWrite, onSaved }: { tenantId: string; canWrite: boolean; onSaved: (message: string) => void }) {
  const [list, setList] = useState<ListState>({ status: "loading" });
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

  const resources = list.status === "ready" ? list.resources : [];
  const types = [...new Set([...resources.map((r) => r.type), ...kinds].map((t) => t.trim()).filter(Boolean))].sort();
  const close = useCallback(() => setDialog({ kind: "none" }), []);

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
          <table className="table" style={{ minWidth: "680px" }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Working hours</th>
                <th>Service area</th>
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
