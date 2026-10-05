import * as React from "react";

import { cn } from "@/lib/utils";

/** Modernist `.input` — surface fill, divider border, accent caret + focus. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-h-9 px-2.5 py-1.5 font-[inherit] text-sm text-foreground caret-primary",
        "bg-surface border border-solid border-divider rounded-none",
        "placeholder:text-foreground/45",
        "hover:border-foreground/45",
        "focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Input };
