/**
 * Global wall clock: absolutely centered in the topbar regardless of side
 * content, muted date line above a bold tabular time (with seconds). Honors
 * the app-wide 12h/24h setting (Settings panel). The seam/scheduler own
 * logical `now`; this is the ambient wall time.
 */

import { useEffect, useState } from "react";
import { useSettings } from "../settings";

export function GlobalClock(): JSX.Element {
  const { timeFormat } = useSettings();
  const hour12 = timeFormat === "12h";
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // toLocaleTimeString's AM/PM casing is locale-dependent — force uppercase.
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12 }).toUpperCase();
  const date = new Intl.DateTimeFormat([], { weekday: "short", day: "numeric", month: "short" }).format(now);

  return (
    <div className="global-clock" aria-label="Current time" role="timer">
      <span className="clock-date">{date}</span>
      <span className="clock-time num">{time}</span>
    </div>
  );
}
