import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-white shadow-sm hover:bg-ink-soft focus-visible:outline-accent disabled:bg-ink-muted",
  secondary:
    "border border-line bg-surface text-ink hover:border-line-strong hover:bg-canvas focus-visible:outline-accent",
  ghost: "text-ink-soft hover:bg-accent-soft hover:text-ink focus-visible:outline-accent",
  danger: "bg-danger text-white shadow-sm hover:bg-danger/90 focus-visible:outline-danger",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 gap-1.5 px-3 text-sm",
  md: "h-11 gap-2 px-5 text-sm",
  icon: "size-11",
};

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
