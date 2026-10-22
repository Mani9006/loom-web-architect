import type { ButtonHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const btnVariants = cva("rp-btn", {
  variants: {
    variant: {
      primary: "rp-btn-primary",
      outline: "rp-btn-outline",
      ghost: "rp-btn-ghost",
      destructive: "rp-btn-destructive",
    },
    size: {
      sm: "rp-btn-sm",
      md: "",
      lg: "rp-btn-lg",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
});

export interface BtnProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof btnVariants> {
  asChild?: boolean;
}

export function Btn({ className, variant, size, asChild = false, type = "button", ...props }: BtnProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp type={asChild ? undefined : type} className={cn(btnVariants({ variant, size }), className)} {...props} />;
}
