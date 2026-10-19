import { useSyncExternalStore } from "react";

/**
 * Where the phone frames end, Tailwind's `md` (768px): from there the tablet and desktop share the
 * top nav and the centred dialogs (section 08 of the design).
 */
const DESKTOP = "(min-width: 768px)";

/**
 * Whether the tablet and desktop frames apply, kept in step with the window. For a component whose
 * desktop and phone forms differ in structure, not only in classes. The server renders the desktop
 * form.
 */
export function useDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(DESKTOP);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );
}
