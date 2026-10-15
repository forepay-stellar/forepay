/** `GBX4…7QPA`: the first and last four characters, as the wallet chip shows an address. */
export function shortAddress(address: string): string {
  if (address.length <= 9) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
