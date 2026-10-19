import { cn } from "@/lib/cn";

// Button/Primary, Button/Outline and a white variant for the sunrise, from forepay.pen.
// Every landing button is a link: to a section, or out to the app.
const variants = {
  primary: "bg-action text-fg-on-brand hover:bg-action-hover active:bg-action-pressed",
  outline: "border border-line-strong bg-surface text-fg hover:bg-subtle",
  light: "bg-surface text-fg hover:bg-brand-subtle",
};

// Paddings and sizes as each instance overrides them in the design.
const sizes = {
  sm: "px-4 py-2.5 text-[13px]",
  md: "px-[22px] py-3 text-sm",
  menu: "px-6 py-[18px] text-base",
  lg: "px-[34px] py-5 text-[17px]",
};

export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "lg",
  className,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center rounded-pill font-medium whitespace-nowrap transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </a>
  );
}
