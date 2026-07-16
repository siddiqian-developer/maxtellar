/**
 * §5.3 alarm watcher hook — best-effort presentation over the pure
 * `alarmSignals`. Each tick it derives the active alarm conditions; a newly
 * appearing key sounds once + fires a system Notification (where permitted) +
 * shows an in-app banner. The single global `alarmBehavior` toggle decides the
 * banner's lifetime: `persist` keeps it until the condition clears or the user
 * dismisses it; `oneshot` auto-clears it after a short spell.
 *
 * Dedupe/dismiss records are keyed by the signal's stable key and dropped once
 * the condition clears, so the same alarm can fire again on a later occurrence.
 */
import { useEffect, useRef, useState } from "react";
import type { State } from "@maxtellar/core";
import { alarmSignals, type AlarmSignal } from "./alarms";
import { playAlarm } from "./sound";
import { useSettings } from "./settings";

export interface ActiveAlarm extends AlarmSignal {
  firedAt: number;
}

const ONESHOT_MS = 6000;

function notify(s: AlarmSignal): void {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(s.title, { body: s.body, tag: s.key });
    }
  } catch {
    /* best-effort */
  }
}

export function useAlarms(state: State | null): { active: ActiveAlarm[]; dismiss: (key: string) => void } {
  const { alarmsEnabled, alarmBehavior, alarmSound, customSounds } = useSettings();
  const [active, setActive] = useState<ActiveAlarm[]>([]);
  const firedRef = useRef<Set<string>>(new Set()); // sounded already (dedupe)
  const dismissedRef = useRef<Set<string>>(new Set()); // hidden for this instance

  useEffect(() => {
    if (!state || !alarmsEnabled) {
      firedRef.current.clear();
      dismissedRef.current.clear();
      setActive((a) => (a.length ? [] : a));
      return;
    }
    const signals = alarmSignals(state);
    const live = new Set(signals.map((s) => s.key));
    // A cleared condition frees its key to fire again next time it recurs.
    for (const k of [...firedRef.current]) if (!live.has(k)) firedRef.current.delete(k);
    for (const k of [...dismissedRef.current]) if (!live.has(k)) dismissedRef.current.delete(k);

    for (const s of signals) {
      if (firedRef.current.has(s.key)) continue;
      firedRef.current.add(s.key);
      playAlarm(alarmSound, customSounds);
      notify(s);
      if (alarmBehavior === "oneshot") {
        window.setTimeout(() => {
          dismissedRef.current.add(s.key);
          setActive((a) => a.filter((x) => x.key !== s.key));
        }, ONESHOT_MS);
      }
    }

    const shown = signals.filter((s) => !dismissedRef.current.has(s.key));
    setActive((prev) => {
      const at = new Map(prev.map((a) => [a.key, a.firedAt]));
      return shown.map((s) => ({ ...s, firedAt: at.get(s.key) ?? Date.now() }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.now, state?.running?.id, state?.running?.pomodoro?.phaseStartedAt, state?.ceremony, alarmsEnabled, alarmBehavior, alarmSound]);

  const dismiss = (key: string): void => {
    dismissedRef.current.add(key);
    setActive((a) => a.filter((x) => x.key !== key));
  };

  return { active, dismiss };
}
