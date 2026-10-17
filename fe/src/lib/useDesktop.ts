import { useSyncExternalStore } from "react";

/** The desktop layout's breakpoint, Tailwind's `lg` (1024px), where the design switches frames. */
const DESKTOP = "(min-width: 1024px)";

/**
 * Whether the desktop frames apply, kept in step with the window. For a component whose desktop and
 * phone forms differ in structure, not only in classes. The server renders the desktop form.
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
