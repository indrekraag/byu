import { hardRefresh } from '../lib/refresh';

/** The same quiet line at the bottom of both pages: what the data is and how
 *  fresh it is, plus Hard refresh (fetches a fresh copy of the app). */
export function StatusFooter({ laps, lapsWarn, intake, intakeWarn }: { laps: string; lapsWarn?: boolean; intake: string; intakeWarn?: boolean }) {
  return <footer className="status unified">
    <span className="status-text">
      <span className={lapsWarn ? 'warn' : undefined}>Laps: {laps}</span>
      <span className={intakeWarn ? 'warn' : undefined}>Intake: {intake}</span>
    </span>
    <button className="import" onClick={hardRefresh}>Hard refresh</button>
  </footer>;
}
