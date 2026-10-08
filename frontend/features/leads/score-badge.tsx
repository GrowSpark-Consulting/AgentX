import { TEMPERATURE_LABEL, TEMPERATURE_STYLE, type Temperature } from "./data";

/** "Hot 82", "Warm 55", "Not scored": the stored temperature and score, never worked out here. */
export function ScoreBadge({ temperature, score, large }: { temperature: Temperature | null; score: number | null; large?: boolean }) {
  const key = temperature ?? "unscored";
  const s = TEMPERATURE_STYLE[key];
  // A score without a temperature is shown as a plain score, never given a band here.
  const label = temperature ? TEMPERATURE_LABEL[temperature] : score !== null ? "Score" : TEMPERATURE_LABEL.unscored;
  if (large) {
    return (
      <span
        data-testid="score-badge"
        style={{ width: "64px", height: "64px", background: s.bg, color: s.fg, border: temperature ? 0 : "2px solid var(--color-divider)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1, flex: "none", textAlign: "center" }}
      >
        <span style={{ fontSize: "26px", fontWeight: 800 }}>{score ?? "—"}</span>
        <span style={{ fontSize: "11px", fontWeight: 600, marginTop: "3px" }}>{label}</span>
      </span>
    );
  }
  return (
    <span
      data-testid="score-badge"
      style={{ fontSize: "10px", fontWeight: 800, padding: "2px 6px", background: s.bg, color: s.fg, border: temperature ? 0 : "1px solid var(--color-divider)", whiteSpace: "nowrap" }}
    >
      {label}
      {score !== null ? ` ${score}` : ""}
    </span>
  );
}
