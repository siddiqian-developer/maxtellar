/**
 * §5.3 in-app alarm banners — the always-available visual layer (system sound +
 * Notification are best-effort on top). Stacked bottom-left; urgent alarms get
 * the danger accent. Each is dismissable; persist-mode banners stay until the
 * condition clears or the user dismisses, one-shot banners self-clear.
 */
import type { ActiveAlarm } from "../useAlarms";

interface Props {
  alarms: ActiveAlarm[];
  onDismiss: (key: string) => void;
}

export function AlarmCenter({ alarms, onDismiss }: Props): JSX.Element | null {
  if (alarms.length === 0) return null;
  return (
    <div className="alarm-center" role="region" aria-label="Alarms">
      {alarms.map((a) => (
        <div key={a.key} className={`alarm-banner${a.urgent ? " is-urgent" : ""}`} role="alert" data-kind={a.kind}>
          <span className="alarm-bell" aria-hidden>🔔</span>
          <div className="alarm-text">
            <strong>{a.title}</strong>
            <span>{a.body}</span>
          </div>
          <button className="alarm-dismiss" aria-label="Dismiss alarm" onClick={() => onDismiss(a.key)}>&times;</button>
        </div>
      ))}
    </div>
  );
}
