/** A Sui coin type looks like 0x<hex>::<module>::<NAME>. */
const COIN_TYPE = /^0x[0-9a-fA-F]{1,64}::[A-Za-z_][A-Za-z0-9_]*::[A-Za-z_][A-Za-z0-9_]*$/;

/** A bare Sui address or object id: 0x followed by up to 64 hex characters. */
const SUI_ADDRESS = /^0x[0-9a-fA-F]{1,64}$/;

export function isCoinType(input: string): boolean {
  return COIN_TYPE.test(input.trim());
}

export function isSuiAddress(input: string): boolean {
  return SUI_ADDRESS.test(input.trim());
}

/** Compare two coin types or addresses, ignoring case and leading zeros in the package id. */
export function sameCoin(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizeCoin(a) === normalizeCoin(b);
}

export function normalizeCoin(input: string): string {
  const [pkg, ...rest] = input.trim().split("::");
  if (!pkg.startsWith("0x")) return input.trim().toLowerCase();
  const hex = pkg.slice(2).replace(/^0+/, "") || "0";
  return [`0x${hex.toLowerCase()}`, ...rest].join("::");
}

export function explorerAccount(address: string): string {
  return `https://suiscan.xyz/mainnet/account/${address}`;
}

export function explorerCoin(coinType: string): string {
  return `https://suiscan.xyz/mainnet/coin/${encodeURIComponent(coinType)}`;
}
