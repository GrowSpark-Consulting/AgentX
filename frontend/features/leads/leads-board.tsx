"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { formatError, type FormattedError } from "@/lib/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  fetchLeads,
  fetchPackFields,
  formatAgo,
  groupByStage,
  matchesFilters,
  parseMinScore,
  qualificationSummary,
  TEMPERATURE_LABEL,
  temperatureCounts,
  type Lead,
  type PackFieldInfo,
  type TemperatureFilter,
} from "./data";
import { ScoreBadge } from "./score-badge";

// The real Leads board (Day 3): the /dashboard/preview Leads layout (features/leads/pakka-leads.tsx:
// title and counts, score chips, a column per stage scrolling sideways, cards with name, badge and the
// customer's answers) on leads read under RLS. Read-only: stages move as the AI and bookings move them;
// dragging cards isn't part of Day 3. Score and temperature are shown as Dev 1's engine stored them.

type State =
  | { status: "loading" }
  | { status: "error"; error: FormattedError }
  | { status: "ready"; leads: Lead[]; truncated: boolean; packFields: PackFieldInfo[] };

const FILTERS: TemperatureFilter[] = ["all", "hot", "warm", "cold", "disqualified", "unscored"];

const chip = (on: boolean): CSSProperties => ({
  border: `1px solid ${on ? "var(--color-text)" : "var(--color-divider)"}`,
  background: on ? "var(--color-text)" : "transparent",
  color: on ? "var(--color-bg)" : "var(--color-text)",
  font: "inherit",
  fontSize: "13px",
  fontWeight: 600,
  padding: "6px 12px",
  cursor: "pointer",
});

export function LeadsBoard({ tenantId, timeZone }: { tenantId: string; timeZone: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [temperature, setTemperature] = useState<TemperatureFilter>("all");
  const [minScoreText, setMinScoreText] = useState("");
  const [now] = useState(() => new Date());

  const load = useCallback(() => {
    const client = getSupabaseBrowserClient();
    // Labels are a nicety: without the pack, answers show with their keys.
    const packFields = fetchPackFields(client, tenantId).catch((): PackFieldInfo[] => []);
    return Promise.all([fetchLeads(client, tenantId), packFields]).then(
      ([{ leads, truncated }, fields]) => setState({ status: "ready", leads, truncated, packFields: fields }),
      (err: unknown) => setState({ status: "error", error: formatError(err) }),
    );
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const minScore = parseMinScore(minScoreText);
  const minScoreInvalid = minScore === undefined;
  const leads = state.status === "ready" ? state.leads : [];
  const filtered = leads.filter((l) => matchesFilters(l, { temperature, minScore: minScore ?? null }));
  const counts = temperatureCounts(leads);
  const filtering = temperature !== "all" || (minScore !== null && minScore !== undefined);
  const open = leads.filter((l) => l.stage !== "won" && l.stage !== "lost").length;

  const clear = () => {
    setTemperature("all");
    setMinScoreText("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0, color: "var(--color-text)" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h1 className="app-h1">Leads</h1>
          <p style={{ margin: "4px 0 0", color: "var(--color-neutral-700)" }}>
            {state.status === "ready" ? `${open} open · ${counts.hot} hot` : "Every WhatsApp enquiry, by stage."}
          </p>
        </div>
      </div>

      {state.status === "ready" && leads.length > 0 ? (
        <div style={{ display: "flex", gap: "12px 16px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div role="group" aria-label="Temperature" style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {FILTERS.filter((f) => f === "all" || f === "hot" || f === "warm" || f === "cold" || counts[f] > 0).map((f) => (
              <button key={f} type="button" aria-pressed={temperature === f} style={chip(temperature === f)} onClick={() => setTemperature(f)}>
                {f === "all" ? "All" : TEMPERATURE_LABEL[f]} · {counts[f]}
              </button>
            ))}
          </div>
          <div className="field" style={{ gap: "4px" }}>
            <label htmlFor="leads-min-score" style={{ fontSize: "13px", fontWeight: 600 }}>
              Score at least
            </label>
            <input
              id="leads-min-score"
              className="input"
              inputMode="numeric"
              placeholder="Any"
              value={minScoreText}
              aria-invalid={minScoreInvalid ? true : undefined}
              aria-describedby={minScoreInvalid ? "leads-min-score-error" : undefined}
              onChange={(e) => setMinScoreText(e.target.value)}
              style={{ width: "96px", minHeight: "34px", padding: "4px 8px" }}
            />
          </div>
          {filtering || minScoreText ? (
            <button type="button" className="btn btn-ghost" onClick={clear}>
              Clear filters
            </button>
          ) : null}
          {minScoreInvalid ? (
            <p id="leads-min-score-error" className="app-field-error" style={{ flexBasis: "100%", margin: 0 }}>
              Enter a whole number, like 70
            </p>
          ) : null}
        </div>
      ) : null}

      {state.status === "loading" ? <LoadingState compact title="Loading your leads" /> : null}
      {state.status === "error" ? (
        <ErrorState
          compact
          title="Couldn't load your leads"
          description={state.error.message}
          onRetry={() => {
            setState({ status: "loading" });
            void load();
          }}
        />
      ) : null}

      {state.status === "ready" && leads.length === 0 ? (
        <EmptyState compact title="No leads yet" description="Every new WhatsApp enquiry becomes a lead here. The AI fills in their answers and moves them along as they reply." />
      ) : null}

      {state.status === "ready" && state.truncated ? (
        <p className="app-notice" style={{ margin: 0 }}>
          Showing the {leads.length} most recently updated leads.
        </p>
      ) : null}

      {state.status === "ready" && leads.length > 0 && filtered.length === 0 && !minScoreInvalid ? (
        <EmptyState
          compact
          title="No leads match these filters"
          action={
            <button type="button" className="btn btn-secondary" onClick={clear}>
              Clear filters
            </button>
          }
        />
      ) : null}

      {state.status === "ready" && filtered.length > 0 ? (
        <div className="app-leads-board" data-testid="leads-board">
          <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(232px, 232px)", gap: "2px", background: "var(--color-divider)", borderTop: "2px solid var(--color-text)", width: "max-content", minHeight: "320px" }}>
            {groupByStage(filtered).map((col) => (
              <section key={col.stage} aria-label={`${col.label} · ${col.leads.length}`} data-stage={col.stage} style={{ background: "var(--color-bg)", display: "flex", flexDirection: "column", gap: "8px", padding: "12px 10px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 2px 6px" }}>
                  <h2 style={{ margin: 0, fontSize: "12px", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>{col.label}</h2>
                  <span style={{ fontSize: "13px", color: "var(--color-neutral-700)", fontWeight: 600 }}>{col.leads.length}</span>
                </div>
                {col.leads.map((l) => {
                  const summary = state.status === "ready" ? qualificationSummary(l.answers, state.packFields) : null;
                  return (
                    <Link
                      key={l.id}
                      href={`/dashboard/leads/${l.id}`}
                      className="app-lead-card"
                      style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px", background: "var(--color-surface)", color: "var(--color-text)", textDecoration: "none" }}
                    >
                      <span style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
                        <span style={{ fontWeight: 800, fontSize: "15px", overflowWrap: "anywhere" }}>{l.name}</span>
                        <ScoreBadge temperature={l.temperature} score={l.score} />
                      </span>
                      <span style={{ fontSize: "13px", lineHeight: 1.35, color: summary ? "var(--color-neutral-800)" : "var(--color-neutral-700)", overflowWrap: "anywhere" }}>
                        {summary ?? "No answers yet"}
                      </span>
                      <span style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "11px", color: "var(--color-neutral-700)", borderTop: "1px solid var(--color-divider)", paddingTop: "6px", marginTop: "2px" }}>
                        <span>{l.hasName ? l.phoneMasked : ""}</span>
                        <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Updated {formatAgo(l.updatedAt, now, timeZone)}</span>
                      </span>
                    </Link>
                  );
                })}
                {col.leads.length === 0 ? <div style={{ fontSize: "12px", color: "var(--color-neutral-700)", padding: "8px 2px" }}>Nothing here</div> : null}
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
