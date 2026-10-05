import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Modernist `.btn` — square, heavy heading weight, 14px.
 * Variants mirror .btn-primary / .btn-secondary / .btn-ghost / .btn-icon.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-1.5 cursor-pointer no-underline",
    "font-heading font-extrabold text-sm [line-height:1.2] text-foreground",
    "bg-transparent border border-solid border-transparent rounded-none",
    "py-2 px-[14.4px]",
    "[&_svg]:block",
    "disabled:opacity-45 disabled:cursor-not-allowed",
    "focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-background hover:bg-brand-600 hover:text-background active:bg-brand-700",
        secondary:
          "border-divider hover:bg-foreground/7 active:bg-foreground/14",
        ghost:
          "text-primary px-1 hover:bg-primary/10 hover:text-primary active:bg-primary/18",
        plain: "",
      },
      size: {
        default: "",
        icon: "size-9 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
