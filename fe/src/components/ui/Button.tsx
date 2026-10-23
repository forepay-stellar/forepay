import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

// Button/Primary, Secondary, Outline, Ghost and Danger from "04 Base components". Primary is the near
// black pill; orange is never the main button. Hover and pressed come from "Primary button states".
// Hover and pressed apply only while the button can be used (`not-disabled:`, which links match too):
// a disabled one keeps its look and shows the not-allowed cursor.
export const button = cva(
  // The focus ring is a box-shadow ring, so it never fights the Outline variant's 1px outline.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill font-medium transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "outline-none bg-action text-fg-on-brand not-disabled:hover:bg-action-hover not-disabled:active:bg-action-pressed disabled:bg-line disabled:text-fg-subtle",
        secondary: "outline-none bg-subtle text-fg not-disabled:hover:bg-line not-disabled:active:bg-line-strong disabled:text-fg-subtle",
        outline:
          "bg-surface text-fg outline outline-1 -outline-offset-[0.5px] outline-line-strong not-disabled:hover:bg-subtle not-disabled:active:bg-line disabled:text-fg-subtle",
        ghost: "outline-none text-brand-strong not-disabled:hover:bg-brand-subtle not-disabled:active:bg-icon-subtle disabled:text-fg-subtle",
        danger: "outline-none bg-danger-subtle text-danger not-disabled:hover:bg-danger-muted disabled:text-fg-subtle",
      },
      size: {
        /** The full-width call to action of an onboarding step (18/28 from a tablet, 18/24 on a phone). */
        lg: "px-6 py-[18px] text-body md:px-7 [&_svg]:size-[18px]",
        /** Buttons inside panels and dialogs. */
        md: "px-6 py-3.5 text-body [&_svg]:size-[18px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button> & {
    /** Shows the spinner, swaps the label and blocks a second press. */
    loading?: boolean;
    loadingLabel?: string;
    icon?: ReactNode;
  };

export function Button({ variant, size, loading, loadingLabel, icon, className, children, disabled, ...rest }: Props) {
  return (
    <button
      type="button"
      className={cn(button({ variant, size }), loading && "disabled:bg-action disabled:text-fg-on-brand", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : icon}
      {loading ? (loadingLabel ?? children) : children}
    </button>
  );
}

/** A link that leaves Forepay, drawn as a button (for example "Get Freighter"). */
export function ButtonLink({
  variant,
  size,
  className,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & VariantProps<typeof button>) {
  return <a target="_blank" rel="noreferrer" className={cn(button({ variant, size }), className)} {...rest} />;
}
