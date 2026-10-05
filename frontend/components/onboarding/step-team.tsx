"use client";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FEATURES, NEW_STAFF, featureDescription } from "@/features/onboarding/data";
import { profileOf, type OnboardingState, type SetState } from "@/features/onboarding/state";
import { RuleHeading, StepIntro } from "@/components/onboarding/primitives";

export function StepTeam({
  s,
  set,
}: {
  s: OnboardingState;
  set: SetState;
}) {
  const profile = profileOf(s);
  const staffNames = s.staff
    .slice(0, 2)
    .map((p) => p.name)
    .join(" and ");

  return (
    <>
      <StepIntro title="Team, calendar and features">
        Who meets customers, when they’re free, and what your assistant should do.
      </StepIntro>

      <section className="flex flex-col gap-2">
        <RuleHeading>Staff who get alerts</RuleHeading>
        {s.staff.map((p, i) => (
          <div
            key={`${p.name}-${i}`}
            className="grid grid-cols-[36px_minmax(0,1fr)_auto] gap-3 items-center py-2 border-b border-divider"
          >
            <span className="size-9 bg-neutral-300 grid place-items-center font-extrabold text-xs">
              {p.initials}
            </span>
            <span>
              <strong>{p.name}</strong>
              <span className="block text-xs text-neutral-700">{p.phone}</span>
            </span>
            <span className="text-xs text-neutral-700">{p.role}</span>
          </div>
        ))}
        <Button
          variant="ghost"
          onClick={() => set((x) => ({ staff: [...x.staff, { ...NEW_STAFF }] }))}
          className="self-start pl-0"
        >
          + Add staff
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <RuleHeading>Calendar</RuleHeading>
        {!s.cal ? (
          <div className="flex gap-3 items-center flex-wrap">
            <Button variant="secondary" onClick={() => set({ cal: true })}>
              Connect Google Calendar
            </Button>
            <span className="text-[13px] text-neutral-700">Or set slots by hand later</span>
          </div>
        ) : (
          <div className="text-sm px-3 py-2.5 bg-surface">
            <strong>Google Calendar connected</strong> · {profile.email} · {staffNames}’s
            calendars found
          </div>
        )}
      </section>

      <section className="flex flex-col">
        <RuleHeading>What your assistant does</RuleHeading>
        {FEATURES.map((f, i) => {
          const on = !!s.feats[i];
          return (
            <div
              key={f.name}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center py-3 border-b border-divider"
            >
              <span>
                <strong className="text-[15px]">{f.name}</strong>
                <span className="block text-[13px] text-neutral-700">
                  {featureDescription(i, profile)}
                </span>
              </span>
              <Switch
                checked={on}
                aria-label={f.name}
                onCheckedChange={() =>
                  set((x) => {
                    const next = [...x.feats];
                    next[i] = !next[i];
                    return { feats: next };
                  })
                }
              />
            </div>
          );
        })}
        <span className="text-[13px] text-neutral-700 mt-2">
          You can change any of these later in Features.
        </span>
      </section>
    </>
  );
}
