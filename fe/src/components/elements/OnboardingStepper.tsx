import { cn } from "@/lib/cn";

// Stepper/Onboarding. Bar segments, not numbered circles (brief §3): done near black, current
// tangerine, next stone. Desktop shows the step names, a phone shows "Step 2 of 3".
export const ONBOARDING_STEPS = ["Before you start", "Connect wallet", "Allow USDC"] as const;

function barColour(i: number, current: number) {
  if (i < current) return "bg-action";
  if (i === current) return "bg-brand";
  return "bg-line-strong";
}

export function OnboardingStepper({ current }: { current: number }) {
  return (
    // 480 wide at 1440, narrower between 1024 and ~1120 so the top bar never overflows.
    <ol className="flex w-full min-w-0 max-w-[480px] flex-1 gap-2.5" aria-label="Onboarding progress">
      {ONBOARDING_STEPS.map((name, i) => (
        <li key={name} className="flex flex-1 flex-col gap-2" aria-current={i === current ? "step" : undefined}>
          <span className={cn("h-1 w-full rounded-[2px]", barColour(i, current))} />
          <span className={cn("text-[13px] font-medium", i <= current ? "text-fg" : "text-fg-subtle")}>{name}</span>
        </li>
      ))}
    </ol>
  );
}

export function OnboardingProgress({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-3 px-4 pt-1">
      <div className="flex items-center gap-1.5" aria-hidden>
        {ONBOARDING_STEPS.map((name, i) => (
          <span key={name} className={cn("h-[5px] rounded-[3px]", i === current ? "w-7" : "w-[18px]", barColour(i, current))} />
        ))}
      </div>
      <p className="text-[13px] text-fg-muted">
        Step {current + 1} of {ONBOARDING_STEPS.length}
      </p>
    </div>
  );
}
