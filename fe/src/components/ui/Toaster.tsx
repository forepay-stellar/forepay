"use client";

import { CircleCheck, X } from "lucide-react";
import { Toaster as Sonner, toast } from "sonner";

// Toast from "05 Product components": near black, a mint check, white text, a close cross. Bottom of
// the screen, gone after three seconds (onboarding board, "Address copied"). On a phone it sits above
// the actions pinned to the bottom, and it always sits above an open dialog.
export function Toaster() {
  return <Sonner position="bottom-center" duration={3000} offset={24} mobileOffset={{ bottom: 152 }} style={{ zIndex: 60 }} />;
}

/** `success: false` drops the mint check, for a message that is not a success. */
export function notify(message: string, { success = true }: { success?: boolean } = {}) {
  toast.custom((id) => (
    <div className="flex w-[360px] max-w-[calc(100vw-32px)] items-center gap-3 rounded-tile bg-action px-4 py-3.5">
      {success && <CircleCheck className="size-5 shrink-0 text-live" aria-hidden />}
      <p className="flex-1 text-body font-medium text-fg-on-brand">{message}</p>
      <button type="button" aria-label="Close" onClick={() => toast.dismiss(id)} className="rounded-full text-fg-subtle outline-none hover:text-fg-on-brand focus-visible:ring-2 focus-visible:ring-brand">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  ));
}
