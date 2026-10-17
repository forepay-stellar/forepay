import type { ReactNode } from "react";

// Icon tile, small: a 36px brand-subtle square with an 18px brand glyph.
export function IconTile({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-brand-subtle text-icon [&_svg]:size-[18px]">
      {children}
    </span>
  );
}
