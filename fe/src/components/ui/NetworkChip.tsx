// Chip/Network. Forepay only runs on testnet, so it always says so.
export function NetworkChip() {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-pill bg-surface px-3.5 py-[9px] text-[13px] font-medium text-fg outline-1 -outline-offset-[0.5px] outline-line">
      Testnet
    </span>
  );
}
