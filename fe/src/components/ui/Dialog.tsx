"use client";

import { Dialog as Base } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

// Dialog from "05 Product components" (xyK1N): a white card, an optional icon tile top left, close
// top right, title, body, an optional slot on the canvas colour, then the actions. 400 wide by default,
// 440 where the design draws it wider (3a Approve repayment).
export function Dialog({
  open,
  onClose,
  title,
  body,
  icon,
  wide = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  /** A glyph for the 48px brand-subtle icon tile, e.g. `<PenLine />`. */
  icon?: ReactNode;
  wide?: boolean;
  children?: ReactNode;
}) {
  return (
    // A press outside does not close it: these dialogs wait on the wallet, and the press that opened
    // one would otherwise count as outside and close it at once. Close, Cancel and Escape still do.
    <Base.Root open={open} onOpenChange={(next) => !next && onClose()} disablePointerDismissal>
      <Base.Portal>
        <Base.Backdrop className="fixed inset-0 z-50 bg-fg/60 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Base.Popup className={`fixed left-1/2 top-1/2 z-50 flex w-[calc(100vw-32px)] ${wide ? "max-w-[440px]" : "max-w-[400px]"} -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-card bg-surface p-7 outline-none transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none`}>
          <div className={`flex w-full ${icon ? "items-start justify-between" : "justify-end"}`}>
            {icon && (
              <span className="flex size-12 items-center justify-center rounded-icon bg-brand-subtle text-icon [&_svg]:size-6">
                {icon}
              </span>
            )}
            <Base.Close aria-label="Close" className="rounded-full text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-brand">
              <X className="size-5" aria-hidden />
            </Base.Close>
          </div>
          <div className="flex flex-col gap-1.5">
            <Base.Title className="text-[20px] font-semibold tracking-[-0.3px] text-fg">{title}</Base.Title>
            <Base.Description className="text-[15px] leading-[23px] text-fg-muted">{body}</Base.Description>
          </div>
          {children}
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}

/** The canvas-coloured box of label and value rows inside a dialog. */
export function DialogSlot({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="flex flex-col gap-2.5 rounded-tile bg-canvas p-4">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between">
          <dt className="text-[14px] text-fg-muted">{r.label}</dt>
          <dd className="text-[14px] font-medium text-fg">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
