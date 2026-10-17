/** Fixed-width digits: Poppins has no tabular figures, so each digit gets its
 *  own equal slot and a ticking clock never shifts what is next to it. */
export function Digits({ text }: { text: string }) {
  return <>{[...text].map((c, i) => <span key={i} className={/[0-9]/.test(c) ? 'dg' : 'dg-sep'}>{c}</span>)}</>;
}
