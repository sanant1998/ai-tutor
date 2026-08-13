import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-12 w-full rounded-xl px-4 text-[15px]",
        "glass text-[var(--text)] placeholder:text-[rgb(var(--text-rgb)/0.4)]",
        "transition-colors focus-visible:outline-none focus-visible:border-[var(--acc)]",
        "focus-visible:ring-2 focus-visible:ring-[rgb(var(--acc-rgb)/0.28)]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
