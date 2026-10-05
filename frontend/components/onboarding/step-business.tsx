"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { INDUSTRIES, PROFILES } from "@/features/onboarding/data";
import { DEFAULT_FAQ, type OnboardingState, type SetState } from "@/features/onboarding/state";
import { StepIntro } from "@/components/onboarding/primitives";

export function StepBusiness({
  s,
  set,
}: {
  s: OnboardingState;
  set: SetState;
}) {
  const pickIndustry = (i: number) =>
    set((x) => {
      const profile = PROFILES[INDUSTRIES[i].key];
      return {
        ind: i,
        imp: "idle",
        impStep: 0,
        faq: [...DEFAULT_FAQ],
        staff: profile.staff.map((p) => ({ ...p })),
        site: profile.site,
        ...(x.bizEdited ? {} : { biz: profile.biz }),
      };
    });

  return (
    <>
      <StepIntro title="Tell us about your business">
        We’ll set up questions and replies that suit your trade.
      </StepIntro>

      <div>
        <Label htmlFor="pk-biz">Business name</Label>
        <Input
          id="pk-biz"
          value={s.biz}
          onChange={(e) => set({ biz: e.target.value, bizEdited: true })}
          className="min-h-12 text-[17px]"
        />
      </div>

      <div>
        <Label asChild>
          <span>What do you do?</span>
        </Label>
        <div
          role="radiogroup"
          aria-label="What do you do?"
          className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,190px),1fr))] gap-2"
        >
          {INDUSTRIES.map((ind, i) => {
            const selected = s.ind === i;
            return (
              <button
                key={ind.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => pickIndustry(i)}
                className={cn(
                  "flex flex-col gap-1 text-left p-4 min-h-24 border-2 text-foreground cursor-pointer hover:border-primary",
                  selected
                    ? "border-primary bg-brand-100"
                    : "border-divider bg-transparent"
                )}
              >
                <span className="font-extrabold text-base">{ind.name}</span>
                <span className="text-xs text-neutral-700">Books: {ind.books}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
