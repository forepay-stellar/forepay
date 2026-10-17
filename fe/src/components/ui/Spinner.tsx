import { LoaderCircle } from "lucide-react";

// Spinner from "04 Base components": a 32px brand loader in a 40px box.
export function Spinner({ label }: { label?: string }) {
  return (
    <span className="flex size-10 items-center justify-center" role="status" aria-label={label}>
      <LoaderCircle className="size-8 animate-spin text-brand motion-reduce:animate-none" aria-hidden />
    </span>
  );
}
