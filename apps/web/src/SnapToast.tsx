/**
 * The ONE snap-notify toast (§7.0.2) — a transient bottom status line naming a
 * snap/meaning-change. Every surface renders THIS component; a bespoke
 * `notice-toast` element anywhere else is a re-hand-roll of a shared mechanism
 * and a bug (guarded by snap-toast-guard.test.ts). §7.0.4/§7.0.5: reuse the
 * shared piece, never re-invent it.
 */
import { useRef, useState } from "react";

export function SnapToast({ text }: { text: string | null }): JSX.Element | null {
  if (!text) return null;
  return (
    <div className="notice-toast" role="status">
      {text}
    </div>
  );
}

/**
 * Local snap-notify for component-side snap-at-entry — a snap corrected BEFORE
 * it reaches the reducer (so it never rides the reducer's `state.notice`
 * channel, which App renders on its own). `notify(text)` shows the message and
 * auto-clears after `ms`. Pair with `<SnapToast text={toast} />`.
 */
export function useSnapToast(ms = 3200): { toast: string | null; notify: (text: string) => void } {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const notify = (text: string): void => {
    setToast(text);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), ms);
  };
  return { toast, notify };
}
