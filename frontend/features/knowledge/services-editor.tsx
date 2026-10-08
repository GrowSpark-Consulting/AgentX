"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { formatError, type FormattedError } from "@/lib/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  createService,
  deleteService,
  formatBookingRules,
  formatDuration,
  formatPriceRange,
  listResourceTypes,
  listServices,
  removeService,
  updateService,
  upsertService,
  type Service,
  type ServiceInput,
} from "./data";
import { DeleteServiceDialog } from "./delete-service-dialog";
import { ServiceFormDialog } from "./service-form-dialog";

// "Services & prices", ported from the /dashboard/preview Knowledge base (features/knowledge/
// pakka-knowledge.tsx): uppercase section title over a 2px rule with a ghost Add button, then the
// .table in a horizontally scrolling wrapper, bold name and price cells and an outlined status chip.
// Edit and Delete use the prototype's ghost buttons and its confirm dialog (features/settings).
// The list changes only after the database confirms a write. Also shown on the booking setup page,
// where `canWrite` is false for staff (the page hides what a role can't change; RLS allows any member).

type ListState = { status: "loading" } | { status: "error"; error: FormattedError } | { status: "ready"; services: Service[] };
type DialogState = { kind: "none" } | { kind: "form"; service: Service | null } | { kind: "delete"; service: Service };

const TOAST_MS = 2600;

const sectionTitle = { margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase" } as const;
const rowButton = { padding: "2px 6px", whiteSpace: "nowrap" } as const;
const visuallyHidden = { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap" } as const;
const toastStyle = { position: "fixed", left: "16px", bottom: "16px", zIndex: 60, background: "var(--color-text)", color: "var(--color-bg)", padding: "12px 16px", fontSize: "14px", fontWeight: "600", maxWidth: "calc(100vw - 32px)" } as const;

export function ServicesEditor({ tenantId, canWrite = true }: { tenantId: string; canWrite?: boolean }) {
  const [list, setList] = useState<ListState>({ status: "loading" });
  const [resourceTypes, setResourceTypes] = useState<string[]>([]);
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(() => {
    const client = getSupabaseBrowserClient();
    return Promise.all([listServices(client, tenantId), listResourceTypes(client, tenantId)]).then(
      ([services, types]) => {
        setList({ status: "ready", services });
        setResourceTypes(types);
      },
      (err: unknown) => setList({ status: "error", error: formatError(err) }),
    );
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  function flash(message: string) {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }

  function retry() {
    setList({ status: "loading" });
    void load();
  }

  const services = list.status === "ready" ? list.services : [];
  const close = useCallback(() => setDialog({ kind: "none" }), []);

  async function save(editing: Service | null, input: ServiceInput) {
    const client = getSupabaseBrowserClient();
    const saved = editing ? await updateService(client, tenantId, editing.id, input) : await createService(client, tenantId, input);
    setList((prev) => (prev.status === "ready" ? { ...prev, services: upsertService(prev.services, saved) } : prev));
    setDialog({ kind: "none" });
    flash(editing ? `Saved ${saved.name}` : `Added ${saved.name}`);
  }

  async function remove(service: Service) {
    await deleteService(getSupabaseBrowserClient(), tenantId, service.id);
    setList((prev) => (prev.status === "ready" ? { ...prev, services: removeService(prev.services, service.id) } : prev));
    setDialog({ kind: "none" });
    flash(`Deleted ${service.name}`);
  }

  return (
    <section aria-labelledby="services-heading" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "2px solid var(--color-text)", paddingBottom: "8px", gap: "12px" }}>
        <h2 id="services-heading" style={sectionTitle}>
          Services &amp; prices{list.status === "ready" ? ` · ${services.length}` : ""}
        </h2>
        {canWrite ? (
          <button type="button" className="btn btn-ghost" onClick={() => setDialog({ kind: "form", service: null })} disabled={list.status !== "ready"}>
            Add
          </button>
        ) : null}
      </div>

      {list.status === "loading" ? <LoadingState compact title="Loading your services" /> : null}

      {list.status === "error" ? (
        <ErrorState compact title="Couldn't load your services" description={list.error.message} onRetry={retry} />
      ) : null}

      {list.status === "ready" && services.length === 0 ? (
        <EmptyState
          compact
          title="No services yet"
          description={canWrite ? "Add what customers can book, how long it takes and what it costs." : "An owner or admin adds what customers can book."}
          action={
            canWrite ? (
              <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: "form", service: null })}>
                Add a service
              </button>
            ) : undefined
          }
        />
      ) : null}

      {list.status === "ready" && services.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ minWidth: "680px" }}>
            <thead>
              <tr>
                <th>Service</th>
                <th>Length</th>
                <th>Booking rules</th>
                <th>Booked with</th>
                <th>Price range</th>
                <th>Status</th>
                {/* relative: keeps the hidden label inside the table's scroll box, not the page's. */}
                {canWrite ? (
                  <th style={{ position: "relative" }}>
                    <span style={visuallyHidden}>Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: "600" }}>{s.name}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDuration(s.durationMin)}</td>
                  <td style={{ whiteSpace: "nowrap", color: "var(--color-neutral-700)" }}>{formatBookingRules(s)}</td>
                  <td>{s.resourceType}</td>
                  <td style={{ fontWeight: "600", whiteSpace: "nowrap" }}>{formatPriceRange(s.priceMin, s.priceMax)}</td>
                  <td>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: "600",
                        padding: "3px 8px",
                        border: `1px solid ${s.active ? "var(--color-text)" : "var(--color-divider)"}`,
                        color: s.active ? "var(--color-text)" : "var(--color-neutral-700)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.active ? "Active" : "Off"}
                    </span>
                  </td>
                  {canWrite ? (
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button type="button" className="btn btn-ghost" style={rowButton} aria-label={`Edit ${s.name}`} onClick={() => setDialog({ kind: "form", service: s })}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-ghost" style={rowButton} aria-label={`Delete ${s.name}`} onClick={() => setDialog({ kind: "delete", service: s })}>
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
        <ServiceFormDialog
          service={dialog.service}
          existing={services}
          resourceTypes={resourceTypes}
          onSave={(input) => save(dialog.service, input)}
          onClose={close}
        />
      ) : null}
      {dialog.kind === "delete" ? <DeleteServiceDialog service={dialog.service} onDelete={() => remove(dialog.service)} onClose={close} /> : null}

      {/* Always in the page: screen readers announce a live region's new text, not one that appears
          with its text already in it. Empty, it takes no space. */}
      <div role="status" aria-live="polite" style={toast ? toastStyle : visuallyHidden}>
        {toast}
      </div>
    </section>
  );
}
