import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The type roles in tokens.css are font sizes: without this, tailwind-merge reads `text-card-title`
// as a colour and drops it next to `text-fg`.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: { "font-size": [{ text: ["hero", "amount", "page-title", "card-title", "figure", "body", "small"] }] },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
