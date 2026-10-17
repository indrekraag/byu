// Next-start countdown colour: orange from 20 minutes to go, red for the last 4.
export function countdownClass(msToNext: number): string {
  return msToNext <= 4 * 60_000 ? 'countdown final' : msToNext <= 20 * 60_000 ? 'countdown soon' : 'countdown';
}
