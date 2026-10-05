"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "@/lib/utils";

/** Modernist `.field > label` — 12px, 70% ink, sits 5px above its control. */
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "block text-xs mb-[5px] text-foreground/70 select-none",
        className
      )}
      {...props}
    />
  );
}

export { Label };
