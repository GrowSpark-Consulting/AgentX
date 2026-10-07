"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { POPUP_QR_BODY, POPUP_STEPS } from "@/features/onboarding/data";
import type { OnboardingState } from "@/features/onboarding/state";

/**
 * A preview of Meta’s Embedded Signup window, labelled as one. Five screens; closing it at any
 * point records which screen the user abandoned on. The real window is opened by Facebook’s SDK
 * (lib/whatsapp/facebook-sdk.ts) once the API can exchange its code.
 */
export function MetaPopup({
  s,
  onNext,
  onCancel,
}: {
  s: OnboardingState;
  onNext: () => void;
  onCancel: () => void;
}) {
  const P = POPUP_STEPS[s.popStep];
  const body = s.popStep === 3 && s.coex === "yes" ? POPUP_QR_BODY : P.body;

  return (
    <Dialog
      open={s.popup}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent
        overlayClassName="z-80 bg-neutral-900/55"
        onInteractOutside={(e) => e.preventDefault()}
        className={cn(
          "z-80 w-[min(440px,calc(100%-32px))] gap-0 p-0",
          "bg-white text-meta-ink shadow-lg border border-meta-line font-system"
        )}
      >
        {/* window chrome */}
        <div className="flex items-center gap-2 px-3 py-2 bg-meta-chrome border-b border-meta-line text-xs text-meta-muted">
          <span className="size-2.5 rounded-full bg-meta-dot" />
          <span className="flex-1 overflow-hidden whitespace-nowrap text-ellipsis">
            Preview · Meta’s WhatsApp setup window
          </span>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="border-0 bg-transparent text-lg leading-none cursor-pointer text-meta-muted"
          >
            ×
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3.5">
          <div className="flex gap-1">
            {POPUP_STEPS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "flex-1 h-1 rounded-[2px]",
                  i <= s.popStep ? "bg-meta" : "bg-meta-track"
                )}
              />
            ))}
          </div>
          <div className="text-xs text-meta-muted">Step {s.popStep + 1} of 5</div>
          <DialogTitle className="font-system text-xl font-bold leading-[1.2]">
            {P.title}
          </DialogTitle>
          <DialogDescription className="text-sm text-meta-body leading-[1.45] opacity-100">
            {body}
          </DialogDescription>

          {P.options && (
            <div className="flex flex-col gap-1.5">
              {P.options.map((label, i) => {
                const first = i === 0;
                const text =
                  s.popStep === 1 && i === 0
                    ? s.biz || "Your business"
                    : s.popStep === 3 && i === 0
                      ? "+91 " + s.phone + " · code sent"
                      : label;
                return (
                  <div
                    key={label}
                    className={cn(
                      "flex gap-2.5 items-center px-3 py-2.5 border rounded-md text-sm",
                      first ? "border-meta bg-meta-tint" : "border-meta-line bg-white"
                    )}
                  >
                    <span
                      className={cn(
                        "size-3.5 rounded-full border-2",
                        first ? "border-meta bg-meta" : "border-meta-line bg-white"
                      )}
                    />
                    {text}
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-between gap-2 mt-1">
            <button
              type="button"
              onClick={onCancel}
              className="border border-meta-line bg-white rounded-md px-3.5 py-2 text-sm font-semibold cursor-pointer text-meta-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onNext}
              className="border-0 bg-meta text-white rounded-md px-[18px] py-2 text-sm font-semibold cursor-pointer"
            >
              {P.cta}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
