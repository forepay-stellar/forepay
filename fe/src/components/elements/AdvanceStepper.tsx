import { cn } from "@/lib/cn";

// Stepper/Desktop and Stepper/Mobile from "05 Product components". Bar segments, not numbered circles
// (brief §3): done near black, current tangerine, next stone. `current` 4 means every step is done.
export const ADVANCE_STEPS = ["Prove revenue", "Review offer", "Sign", "Receive"] as const;

type State = "done" | "current" | "next";

function stateOf(i: number, current: number): State {
  if (i < current) return "done";
  return i === current ? "current" : "next";
}

const BAR: Record<State, string> = { done: "bg-action", current: "bg-brand", next: "bg-line-strong" };

/** Desktop: one column per step, the bar on top, then "Step 2", its name and Done, You are here or Next. */
export function AdvanceStepper({ current }: { current: number }) {
  return (
    <ol className="hidden w-full gap-3 md:flex" aria-label="Advance progress">
      {ADVANCE_STEPS.map((name, i) => {
        const state = stateOf(i, current);
        return (
          <li key={name} className="flex flex-1 flex-col gap-3" aria-current={state === "current" ? "step" : undefined}>
            <span className={cn("h-1 w-full rounded-[2px]", BAR[state])} />
            <span className="flex flex-col gap-0.5">
              <span className={cn("text-small", state === "current" ? "text-brand-strong" : "text-fg-subtle")}>
                Step {i + 1}
              </span>
              <span className={cn("text-body font-medium", state === "next" ? "text-fg-subtle" : "text-fg")}>
                {name}
              </span>
              <span
                className={cn(
                  "text-small",
                  state === "done" && "text-success",
                  state === "current" && "text-brand",
                  state === "next" && "text-fg-subtle",
                )}
              >
                {state === "done" ? "Done" : state === "current" ? "You are here" : "Next"}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Phone: "Step 2 of 4" and the step name on a white card, short segments on the right. */
export function AdvanceProgress({ current }: { current: number }) {
  const allDone = current >= ADVANCE_STEPS.length;
  return (
    <div className="flex w-full items-center gap-4 rounded-tile bg-surface px-[18px] py-4 md:hidden">
      <div className="flex flex-1 flex-col gap-0.5">
        <p className="text-small text-fg-muted">
          {allDone ? "All steps done" : `Step ${current + 1} of ${ADVANCE_STEPS.length}`}
        </p>
        <p className="text-body font-semibold text-fg">{allDone ? "USDC received" : ADVANCE_STEPS[current]}</p>
      </div>
      <div className="flex items-center gap-1.5" aria-hidden>
        {ADVANCE_STEPS.map((name, i) => {
          const state = stateOf(i, current);
          return (
            <span key={name} className={cn("h-[5px] rounded-[3px]", state === "current" ? "w-7" : "w-[18px]", BAR[state])} />
          );
        })}
      </div>
    </div>
  );
}
