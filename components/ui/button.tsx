import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/* Variants address the theme through CSS variables rather than fixed colour
   values, so every button follows a theme switch without any JS. */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-bold",
    "transition-[transform,background-color,border-color,box-shadow,opacity] duration-300",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
    "disabled:pointer-events-none disabled:opacity-55",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--acc)] text-[var(--onacc)] shadow-[0_14px_40px_-16px_rgb(var(--acc-rgb)/0.8)] hover:-translate-y-0.5 hover:shadow-[0_20px_50px_-16px_rgb(var(--acc-rgb)/0.95)]",
        glass:
          "glass text-[var(--text)] hover:-translate-y-0.5 hover:border-[var(--line-strong)]",
        accent:
          "bg-[var(--acc-2)] text-[var(--onacc)] shadow-[0_14px_40px_-16px_rgb(var(--acc-2-rgb)/0.8)] hover:-translate-y-0.5",
        ghost: "text-[var(--text)] hover:bg-[rgb(var(--text-rgb)/0.06)]",
        link: "text-[var(--acc)] underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-10 px-5 text-[14px]",
        default: "h-12 px-6 text-[15px]",
        lg: "h-14 px-8 text-[16px]",
        icon: "h-10 w-10",
        auto: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
