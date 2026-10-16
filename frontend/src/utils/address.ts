/**
 * Combines parent addresses into a shared address according to the specification:
 * 1. First, all empty addresses should be ignored.
 * 2. Then, if more than one address is left, the addresses should be joined on the "; " separator in this case.
 * 3. If one address is left, that address is returned.
 * 4. If none are left, an empty string is returned.
 */
export function combineAddressesToShared(addresses: (string | null | undefined)[]): string {
  const nonEmpty = addresses
    .map((a) => (a || '').trim())
    .filter((a) => a.length > 0);

  if (nonEmpty.length === 0) {
    return '';
  }
  if (nonEmpty.length === 1) {
    return nonEmpty[0];
  }
  return nonEmpty.join('; ');
}
