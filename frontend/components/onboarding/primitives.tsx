"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CopyItem } from "@/features/onboarding/data";

/** Big step title + one-line explainer under it. */
export function StepIntro({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h1 className="m-0 mb-2 text-[clamp(32px,5vw,44px)]">{title}</h1>
      <p className="m-0 text-base text-neutral-700">{children}</p>
    </div>
  );
}

/** Uppercase section label sitting on a 2px ink rule. */
export function RuleHeading({
  className,
  children,
  as: Comp = "div",
}: {
  className?: string;
  children: React.ReactNode;
  as?: "div" | "span";
}) {
  return (
    <Comp
      className={cn(
        "text-[13px] font-extrabold tracking-[.08em] uppercase border-b-2 border-foreground pb-1.5",
        className
      )}
    >
      {children}
    </Comp>
  );
}

/** 16px square “radio” used by method and coexistence pickers. */
export function SquareRadio({
  checked,
  className,
}: {
  checked: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-4 flex-none grid place-items-center border-2",
        checked ? "border-primary" : "border-divider",
        className
      )}
    >
      <span className={cn("size-2", checked ? "bg-primary" : "bg-transparent")} />
    </span>
  );
}

/** Key / monospace value / Copy button row. */
export function CopyRow({
  item,
  copied,
  onCopy,
}: {
  item: CopyItem;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-center">
      <div className="min-w-0">
        <div className="text-xs text-neutral-700">{item.label}</div>
        <div className="font-mono font-semibold text-[13px] [overflow-wrap:anywhere]">
          {item.value}
        </div>
      </div>
      <Button
        variant="secondary"
        onClick={onCopy}
        className="py-[5px] px-2.5 text-[13px]"
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export type CheckMark = "done" | "fail" | "active" | "idle";
export type Tone = "muted" | "alert" | "strong";

const toneClass: Record<Tone, string> = {
  muted: "text-neutral-700",
  alert: "text-brand-700",
  strong: "text-foreground",
};

/** One line of a setup checklist: status box, title (+ note), status word. */
export function CheckRow({
  mark,
  title,
  note,
  noteTone = "muted",
  status,
  statusTone = "muted",
}: {
  mark: CheckMark;
  title: React.ReactNode;
  note?: React.ReactNode;
  noteTone?: Tone;
  status: React.ReactNode;
  statusTone?: Tone;
}) {
  return (
    <div className="grid grid-cols-[22px_minmax(0,1fr)_auto] gap-3 items-center py-[9px] border-b border-divider text-sm">
      <span
        aria-hidden
        className={cn(
          "size-5 border-2 text-white grid place-items-center text-xs font-extrabold",
          mark === "done" && "bg-foreground border-foreground",
          mark === "fail" && "bg-primary border-primary",
          mark === "active" && "bg-transparent border-primary",
          mark === "idle" && "bg-transparent border-neutral-400"
        )}
      >
        {mark === "done" ? "✓" : mark === "fail" ? "!" : ""}
      </span>
      <span className="min-w-0">
        <span className="block">{title}</span>
        {note ? (
          <span className={cn("block text-xs", toneClass[noteTone])}>{note}</span>
        ) : null}
      </span>
      <span
        className={cn(
          "text-xs font-semibold whitespace-nowrap",
          toneClass[statusTone]
        )}
      >
        {status}
      </span>
    </div>
  );
}
