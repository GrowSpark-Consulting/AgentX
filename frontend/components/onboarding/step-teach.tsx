"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { importStepTexts } from "@/features/onboarding/data";
import { profileOf, type OnboardingState, type SetState } from "@/features/onboarding/state";
import { RuleHeading, StepIntro } from "@/components/onboarding/primitives";

export function StepTeach({
  s,
  set,
  onImport,
}: {
  s: OnboardingState;
  set: SetState;
  onImport: () => void;
}) {
  const profile = profileOf(s);
  const texts = importStepTexts(s.site, profile);
  const importLabel =
    s.imp === "done" ? "Imported" : s.imp === "run" ? "Reading…" : "Import";
  const faqOn = s.faq.filter(Boolean).length;

  return (
    <>
      <StepIntro title="Teach your assistant">
        Paste your website or Google Business link. We’ll read it and you check
        what we found.
      </StepIntro>

      <div className="flex gap-2 flex-wrap">
        <Input
          aria-label="Website or Google Business link"
          value={s.site}
          onChange={(e) => set({ site: e.target.value })}
          className="flex-1 min-w-[220px] min-h-12 text-base"
        />
        <Button variant="primary" onClick={onImport} className="min-h-12">
          {importLabel}
        </Button>
      </div>

      {s.imp === "run" && (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col gap-2 bg-surface p-4"
        >
          {texts.map((t, i) => (
            <div
              key={t}
              className={cn(
                "flex gap-2.5 items-center text-sm",
                i <= s.impStep ? "text-foreground" : "text-neutral-600"
              )}
            >
              <span
                className={cn(
                  "block size-3",
                  i < s.impStep
                    ? "bg-foreground"
                    : i === s.impStep
                      ? "bg-primary"
                      : "bg-neutral-300"
                )}
              />
              {i < s.impStep ? t + " · done" : t}
            </div>
          ))}
        </div>
      )}

      {s.imp === "done" && (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-baseline border-b-2 border-foreground pb-1.5">
              <span className="text-[13px] font-extrabold tracking-[.08em] uppercase">
                {profile.svcTitle} · 4 found
              </span>
              <Button variant="ghost">Edit</Button>
            </div>
            {profile.services.map((sv) => (
              <div
                key={sv.name}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2.5 border-b border-divider text-sm"
              >
                <span>
                  <strong>{sv.name}</strong> · {sv.detail}
                </span>
                <span className="font-semibold">{sv.price}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <RuleHeading className="flex justify-between items-baseline">
              <span>FAQs · {faqOn} of 6 kept</span>
            </RuleHeading>
            {profile.faqs.map((f, i) => {
              const on = !!s.faq[i];
              return (
                <button
                  key={f.q}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() =>
                    set((x) => {
                      const next = [...x.faq];
                      next[i] = !next[i];
                      return { faq: next };
                    })
                  }
                  className="flex gap-3 items-start text-left py-2.5 border-0 border-b border-solid border-divider bg-transparent text-foreground cursor-pointer"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-5 flex-none border-2 grid place-items-center text-white text-xs font-extrabold mt-px",
                      on
                        ? "border-primary bg-primary"
                        : "border-neutral-500 bg-transparent"
                    )}
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span className={cn("text-sm", on ? "opacity-100" : "opacity-55")}>
                    <strong className="block">{f.q}</strong>
                    {f.a}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
