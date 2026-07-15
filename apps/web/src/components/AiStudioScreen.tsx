/**
 * AI Studio — a full screen (SPEC VI, §7.0.3) to tune EVERY on-device AI feature
 * independently: Deterministic (no model), Lightweight AI (model, stricter/
 * cheaper bar), or Full AI (model, full quality). This is the detailed
 * counterpart to the Settings quick switch (Maximum / Lightweight). AI is never
 * load-bearing — Deterministic simply runs the rule-based path.
 */

import { useSettings, AI_FEATURES, type AiLevel } from "../settings";
import { useEscClose } from "../useEscClose";

interface Props {
  onBack: () => void;
}

const LEVELS: { id: AiLevel; label: string; tip: string }[] = [
  { id: "deterministic", label: "Deterministic", tip: "Rules only — no AI model runs. Fastest, lowest memory." },
  { id: "lightweight", label: "Lightweight AI", tip: "On-device AI with a stricter, cheaper bar — fewer but safer suggestions." },
  { id: "full", label: "Full AI", tip: "On-device AI at full quality — the most suggestions." },
];

export function AiStudioScreen({ onBack }: Props): JSX.Element {
  const { aiLevels, setAiLevel, setMlMode } = useSettings();
  useEscClose(onBack);

  return (
    <div className="config-screen">
      <div className="config-header">
        <button className="theme-toggle" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h2>AI Studio</h2>
      </div>

      <div className="config-body">
        <section className="config-section">
          <p className="meta" style={{ marginTop: 0 }}>
            Every AI feature runs <strong>on your device</strong> — nothing leaves the machine, and the app
            works fully at any level (AI only ever <em>helps</em>). Set each feature to taste, or use a
            one-tap preset.
          </p>
          <div className="type-chips" role="group" aria-label="AI presets">
            <button type="button" className="type-chip" data-status="fixed" onClick={() => setMlMode("maximum")}>
              All Full AI
            </button>
            <button type="button" className="type-chip" data-status="unscheduled" onClick={() => setMlMode("lightweight")}>
              All Deterministic
            </button>
          </div>
        </section>

        <section className="config-section">
          <h3>Per-feature</h3>
          {AI_FEATURES.map((f) => (
            <div key={f.id} className="ai-feature-row">
              <div className="ai-feature-meta">
                <div className="ai-feature-name">{f.label}</div>
                <div className="ai-feature-desc meta">{f.desc}</div>
              </div>
              <div className="type-chips" role="radiogroup" aria-label={`${f.label} level`}>
                {LEVELS.map((lv) => (
                  <button
                    key={lv.id}
                    type="button"
                    className={`type-chip${aiLevels[f.id] === lv.id ? " active" : ""}`}
                    data-status={lv.id === "deterministic" ? "unscheduled" : lv.id === "lightweight" ? "semi-head" : "fixed"}
                    data-tip={lv.tip}
                    onClick={() => setAiLevel(f.id, lv.id)}
                  >
                    {lv.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
