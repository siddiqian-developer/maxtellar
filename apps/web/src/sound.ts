/**
 * §5.3 alarm sound — asset-free by default. The built-in library is a set of
 * WebAudio-synthesized patterns (no bundled binaries, works fully offline); the
 * user can also add their own audio files, stored as data URLs and played back
 * through an <audio> element. `playAlarm` is best-effort: a blocked AudioContext
 * (no user gesture yet) or a failed decode fails silently — the visual banner
 * and Notification still carry the alarm.
 */

export type BuiltinSoundId = "synth" | "chime" | "double" | "rising" | "alert";

export const BUILTIN_SOUNDS: { id: BuiltinSoundId; label: string }[] = [
  { id: "synth", label: "Beep (default)" },
  { id: "chime", label: "Chime" },
  { id: "double", label: "Double beep" },
  { id: "rising", label: "Rising" },
  { id: "alert", label: "Alert" },
];

/** A user-added sound: a decoded audio file kept as a data URL. */
export interface CustomSound {
  id: string;
  name: string;
  dataUrl: string;
}

/** Persisted choice: a built-in id, or `custom:<id>`. */
export type SoundChoice = string;

/** Each pattern as [frequencyHz, startOffsetSec, durationSec] notes. */
const PATTERNS: Record<BuiltinSoundId, [number, number, number][]> = {
  synth: [[880, 0, 0.16]],
  chime: [[660, 0, 0.18], [990, 0.16, 0.28]],
  double: [[880, 0, 0.12], [880, 0.2, 0.12]],
  rising: [[440, 0, 0.12], [660, 0.12, 0.12], [880, 0.24, 0.18]],
  alert: [[988, 0, 0.12], [784, 0.14, 0.12], [988, 0.28, 0.12], [784, 0.42, 0.14]],
};

let ctx: AudioContext | null = null;
function audioCtx(): AudioContext | null {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function playPattern(id: BuiltinSoundId): void {
  const ac = audioCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  for (const [freq, off, dur] of PATTERNS[id] ?? PATTERNS.synth) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    // Short attack/decay envelope so notes don't click.
    gain.gain.setValueAtTime(0.0001, t0 + off);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + off + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + off + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0 + off);
    osc.stop(t0 + off + dur + 0.02);
  }
}

function playDataUrl(url: string): void {
  try {
    const el = new Audio(url);
    el.volume = 0.6;
    void el.play().catch(() => {
      /* autoplay blocked — best-effort, the banner still fires */
    });
  } catch {
    /* ignore */
  }
}

/** Play the chosen alarm sound. Best-effort — any failure is swallowed. */
export function playAlarm(choice: SoundChoice, customs: CustomSound[]): void {
  if (choice.startsWith("custom:")) {
    const id = choice.slice("custom:".length);
    const found = customs.find((c) => c.id === id);
    if (found) return playDataUrl(found.dataUrl);
    return playPattern("synth"); // deleted custom → fall back
  }
  playPattern((choice as BuiltinSoundId) in PATTERNS ? (choice as BuiltinSoundId) : "synth");
}
