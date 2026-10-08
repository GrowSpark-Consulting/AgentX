"use client";

import { DAY_NAMES, DAYS, MAX_INTERVALS, type Day, type HoursDraft, type HoursErrors } from "./hours";

// A week of opening hours: one row per day, Monday first, each open day with one or more intervals
// (split shifts). Plain .input boxes in 24-hour HH:MM, so 24:00 (open until midnight) can be entered.
// Used for the business's hours and for a resource's own hours; validation is hours.ts.

const dayLabel = { fontWeight: "600", fontSize: "14px", paddingTop: "8px" } as const;
const timeBox = { width: "84px", textAlign: "center" } as const;

export function HoursFields({
  idPrefix,
  value,
  errors,
  disabled,
  onChange,
}: {
  /** Unique per form, so labels and errors point at the right boxes. */
  idPrefix: string;
  value: HoursDraft;
  errors: HoursErrors;
  disabled?: boolean;
  onChange: (next: HoursDraft) => void;
}) {
  const setDay = (day: Day, intervals: HoursDraft[Day]) => onChange({ ...value, [day]: intervals });

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {DAYS.map((day) => {
        const intervals = value[day];
        const open = intervals.length > 0;
        const dayError = errors[day];
        return (
          <fieldset
            key={day}
            aria-describedby={dayError ? `${idPrefix}-${day}-error` : undefined}
            style={{ border: 0, margin: 0, padding: "8px 0", borderBottom: "1px solid var(--color-divider)", display: "grid", gridTemplateColumns: "minmax(96px,120px) minmax(0,1fr)", gap: "8px 12px", minWidth: 0 }}
          >
            <legend style={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap" }}>{DAY_NAMES[day]}</legend>
            <div style={dayLabel} aria-hidden="true">
              {DAY_NAMES[day]}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "14px", cursor: disabled ? "default" : "pointer", minHeight: "36px" }}>
                <input
                  type="checkbox"
                  checked={open}
                  disabled={disabled}
                  aria-label={`Open on ${DAY_NAMES[day]}`}
                  onChange={(e) => setDay(day, e.target.checked ? [{ start: "10:00", end: "18:00" }] : [])}
                  style={{ width: "18px", height: "18px", accentColor: "var(--color-accent)", margin: 0 }}
                />
                {open ? "Open" : "Closed"}
              </label>
              {intervals.map((interval, i) => {
                const n = intervals.length > 1 ? ` (${i + 1})` : "";
                const startKey = `${day}.${i}.start`;
                const endKey = `${day}.${i}.end`;
                const startId = `${idPrefix}-${day}-${i}-start`;
                const endId = `${idPrefix}-${day}-${i}-end`;
                return (
                  <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: "6px 8px", alignItems: "center" }}>
                    <input
                      id={startId}
                      className="input"
                      style={timeBox}
                      inputMode="numeric"
                      placeholder="10:00"
                      aria-label={`${DAY_NAMES[day]} opens${n}`}
                      aria-invalid={errors[startKey] ? true : undefined}
                      aria-describedby={errors[startKey] ? `${startId}-error` : undefined}
                      value={interval.start}
                      disabled={disabled}
                      onChange={(e) => setDay(day, intervals.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
                    />
                    <span aria-hidden="true">to</span>
                    <input
                      id={endId}
                      className="input"
                      style={timeBox}
                      inputMode="numeric"
                      placeholder="18:00"
                      aria-label={`${DAY_NAMES[day]} closes${n}`}
                      aria-invalid={errors[endKey] ? true : undefined}
                      aria-describedby={errors[endKey] ? `${endId}-error` : undefined}
                      value={interval.end}
                      disabled={disabled}
                      onChange={(e) => setDay(day, intervals.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}
                    />
                    {intervals.length > 1 && !disabled ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: "2px 6px" }}
                        aria-label={`Remove ${DAY_NAMES[day]} hours${n}`}
                        onClick={() => setDay(day, intervals.filter((_, j) => j !== i))}
                      >
                        Remove
                      </button>
                    ) : null}
                    {errors[startKey] ? (
                      <p id={`${startId}-error`} className="app-field-error" style={{ flexBasis: "100%", margin: 0 }}>
                        {errors[startKey]}
                      </p>
                    ) : null}
                    {errors[endKey] ? (
                      <p id={`${endId}-error`} className="app-field-error" style={{ flexBasis: "100%", margin: 0 }}>
                        {errors[endKey]}
                      </p>
                    ) : null}
                  </div>
                );
              })}
              {open && intervals.length < MAX_INTERVALS && !disabled ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ alignSelf: "flex-start", padding: "2px 6px" }}
                  aria-label={`Add more hours on ${DAY_NAMES[day]}`}
                  onClick={() => {
                    const last = intervals[intervals.length - 1];
                    setDay(day, [...intervals, { start: last?.end ?? "", end: "" }]);
                  }}
                >
                  Add hours
                </button>
              ) : null}
              {dayError ? (
                <p id={`${idPrefix}-${day}-error`} className="app-field-error" style={{ margin: 0 }}>
                  {dayError}
                </p>
              ) : null}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
