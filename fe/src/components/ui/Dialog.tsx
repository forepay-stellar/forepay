"use client";

import { Dialog as Base } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

// Dialog from "05 Product components" (xyK1N): a white card, an optional icon tile top left, close
// top right, title, body, an optional slot on the canvas colour, then the actions. 400 wide by default,
// 440 where the design draws it wider (3a Approve repayment).
//
// `variant="sheet"` is the same dialog as a phone's bottom sheet (lLjjC): a grab handle, an optional
// `lead` (a spinner, say) above the title, no close button. Root, backdrop and fade are shared, so a
// change to either form reaches both.

const FADE =
  "transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none";

export function Dialog({
  open,
  onClose,
  title,
  body,
  icon,
  lead,
  wide = false,
  variant = "card",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  /** Card only: a glyph for the 48px brand-subtle icon tile, e.g. `<PenLine />`. */
  icon?: ReactNode;
  /** Sheet only: shown above the title, e.g. a `<Spinner />`. */
  lead?: ReactNode;
  wide?: boolean;
  variant?: "card" | "sheet";
  children?: ReactNode;
}) {
  const sheet = variant === "sheet";
  return (
    // A press outside does not close it: these dialogs wait on the wallet, and the press that opened
    // one would otherwise count as outside and close it at once. Close, Cancel and Escape still do.
    <Base.Root open={open} onOpenChange={(next) => !next && onClose()} disablePointerDismissal>
      <Base.Portal>
        <Base.Backdrop className={`fixed inset-0 z-50 bg-fg/60 ${FADE}`} />
        {sheet ? (
          <Base.Popup
            className={`fixed inset-x-0 bottom-0 z-50 flex min-h-[420px] flex-col gap-4 rounded-t-[28px] bg-surface px-5 pb-8 pt-2.5 outline-none ${FADE}`}
          >
            <div className="flex w-full justify-center" aria-hidden>
              <span className="h-[5px] w-10 rounded-[3px] bg-line-strong" />
            </div>
            {lead}
            <Base.Title className="text-card-title text-fg">{title}</Base.Title>
            <Base.Description className="text-body text-fg-muted">{body}</Base.Description>
            {children}
          </Base.Popup>
        ) : (
          <Base.Popup
            className={`fixed left-1/2 top-1/2 z-50 flex w-[calc(100vw-32px)] ${wide ? "max-w-[440px]" : "max-w-[400px]"} -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-card bg-surface p-7 outline-none ${FADE}`}
          >
            <div className={`flex w-full ${icon ? "items-start justify-between" : "justify-end"}`}>
              {icon && (
                <span className="flex size-12 items-center justify-center rounded-icon bg-brand-subtle text-icon [&_svg]:size-6">
                  {icon}
                </span>
              )}
              <Base.Close
                aria-label="Close"
                className="rounded-full text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-brand"
              >
                <X className="size-5" aria-hidden />
              </Base.Close>
            </div>
            <div className="flex flex-col gap-1.5">
              <Base.Title className="text-card-title text-fg">{title}</Base.Title>
              <Base.Description className="text-body text-fg-muted">{body}</Base.Description>
            </div>
            {children}
          </Base.Popup>
        )}
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
          <dt className="text-body text-fg-muted">{r.label}</dt>
          <dd className="text-body font-medium text-fg">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
