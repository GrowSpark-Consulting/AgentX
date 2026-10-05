"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

/**
 * Square Modernist toggle: 48×28 frame with a 2px border and a 20px knob
 * that slides 2px → 22px. On = accent fill + white knob; off = neutral-500.
 */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer relative inline-flex shrink-0 items-center w-12 h-7 p-0 cursor-pointer rounded-none",
        "border-2 border-solid",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary",
        "data-[state=unchecked]:border-neutral-500 data-[state=unchecked]:bg-transparent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none absolute top-0.5 left-0.5 block size-5 rounded-none",
          "transition-transform duration-150",
          "data-[state=checked]:translate-x-5 data-[state=checked]:bg-white",
          "data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-neutral-500"
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
