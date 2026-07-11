import { useEffect, useState } from "react";
import { useStore } from "./useStore";
import { useHeads } from "./heads";
import { Timeline } from "./components/Timeline";
import { Pipeline } from "./components/Pipeline";
import { TaskDrawer } from "./components/TaskDrawer";
import { GlobalClock } from "./components/GlobalClock";
import { SettingsPanel } from "./components/SettingsPanel";
import { HeadsConfigScreen } from "./components/HeadsConfigScreen";
import { fmtDur } from "./time";

type Theme = "light" | "dark" | "system";
type View = "main" | "headsConfig";

/** Splash screen (SPEC VI): serif wordmark + the now-seam motif (hairline with
 * a sweeping accent dot) + tagline. Held for a minimum of 3s from first paint
 * even if the store is ready sooner, then fades out over 450ms. */
function Splash({ leaving }: { leaving: boolean }): JSX.Element {
  return (
    <div className={`splash${leaving ? " splash-leave" : ""}`}>
      <div className="splash-inner">
        <h1 className="splash-wordmark">maxtellar</h1>
        <div className="splash-seam" />
        <span className="splash-tag">every minute accounted</span>
      </div>
    </div>
  );
}

const SPLASH_MIN_MS = 3000;
const SPLASH_FADE_MS = 450;

export function App(): JSX.Element {
  const { ready, persistent, state, dispatch, error } = useStore();
  const { addActivity } = useHeads();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Resizable timeline/pipeline split: pipeline width in px, persisted.
  const [pipelineWidth, setPipelineWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem("pipelineWidth"));
    return Number.isFinite(stored) && stored >= 240 ? stored : 340;
  });
  useEffect(() => {
    localStorage.setItem("pipelineWidth", String(pipelineWidth));
  }, [pipelineWidth]);
  const startColResize = (e: React.MouseEvent): void => {
    e.preventDefault();
    const onMove = (ev: MouseEvent): void => {
      const w = Math.min(Math.max(window.innerWidth - ev.clientX, 240), Math.round(window.innerWidth * 0.6));
      setPipelineWidth(w);
    };
    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  // Splash: "show" until (data ready AND 3s elapsed), then "leave" (fading), then "gone".
  const [splashPhase, setSplashPhase] = useState<"show" | "leave" | "gone">("show");
  const [mountedAt] = useState(() => Date.now());
  useEffect(() => {
    if (splashPhase !== "show" || !ready || !state) return;
    const remaining = Math.max(0, SPLASH_MIN_MS - (Date.now() - mountedAt));
    const t = setTimeout(() => setSplashPhase("leave"), remaining);
    return () => clearTimeout(t);
  }, [splashPhase, ready, state, mountedAt]);
  useEffect(() => {
    if (splashPhase !== "leave") return;
    const t = setTimeout(() => setSplashPhase("gone"), SPLASH_FADE_MS);
    return () => clearTimeout(t);
  }, [splashPhase]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<View>("main");
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    return stored || "system";
  });

  useEffect(() => {
    const applyTheme = () => {
      let effectiveTheme: "light" | "dark" = "light";
      if (theme === "system") {
        effectiveTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      } else {
        effectiveTheme = theme;
      }
      document.documentElement.setAttribute("data-theme", effectiveTheme);
    };

    applyTheme();
    localStorage.setItem("theme", theme);

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const listener = () => applyTheme();
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    }
  }, [theme]);

  const cycleTheme = () => {
    setTheme((prev) => {
      const themes = ["system", "light", "dark"] as const;
      const nextIndex = (themes.indexOf(prev) + 1) % themes.length;
      return themes[nextIndex] as Theme;
    });
  };

  // One-time migration: fold any head/activity already used in the plan
  // (from before the registry existed) into it, so nothing is lost.
  useEffect(() => {
    if (!state) return;
    for (const p of state.plan) {
      if (p.kind === "task") addActivity(p.headId, p.activityId);
    }
  }, [state, addActivity]);

  if (!ready || !state) {
    return <Splash leaving={false} />;
  }

  // Hero metric (SPEC 1.4): time accounted vs unaccounted — today's window
  // approximated as the visible history span for this first slice.
  const dayStart = state.history.reduce(
    (min, h) => (h.kind === "occupancy" ? Math.min(min, h.start) : min),
    state.now,
  );
  const wall = Math.max(0, state.now - dayStart);
  const accounted = state.history
    .filter((h) => h.kind === "occupancy")
    .reduce((acc, h) => acc + (h.end - h.start), 0)
    + (state.running ? state.now - state.running.startedAt : 0);
  const lost = Math.max(0, wall - accounted);

  const themeIcon = {
    system: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
    light: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
      </svg>
    ),
    dark: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
      </svg>
    ),
  }[theme];

  return (
    <div className="app" style={{ gridTemplateColumns: `1fr 6px ${pipelineWidth}px` }}>
      <div className="topbar">
        <h1>maxtellar</h1>
        <span className="meta num" title="Time Accounted vs Unaccounted — the hero metric">
          accounted {fmtDur(accounted)} · lost {fmtDur(lost)}
        </span>
        <span className="spacer" />
        <GlobalClock />
        <span className="spacer" />
        {!persistent && <span className="warn">memory mode — data will not survive reload</span>}
        <button
          className={`theme-toggle${theme !== "system" ? ` theme-${theme}` : ""}`}
          onClick={cycleTheme}
          title={`Theme: ${theme} (click to cycle)`}
          aria-label={`Theme: ${theme}`}
        >
          {themeIcon}
        </button>
        <button
          className="theme-toggle"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Settings"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </button>
      </div>

      {view === "headsConfig" ? (
        <HeadsConfigScreen state={state} dispatch={(e) => void dispatch(e)} onBack={() => setView("main")} />
      ) : (
        <>
          <Timeline state={state} />
          <div
            className="col-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize pipeline"
            onMouseDown={startColResize}
          />
          <Pipeline state={state} dispatch={(e) => void dispatch(e)} />

          <button
            className="fab primary"
            style={{ right: pipelineWidth + 6 + 20 }}
            onClick={() => setDrawerOpen(true)}
            title="New task"
          >
            +
          </button>
          {drawerOpen && (
            <TaskDrawer
              now={state.now}
              dispatch={(e) => void dispatch(e)}
              onClose={() => setDrawerOpen(false)}
            />
          )}
        </>
      )}
      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onOpenHeadsConfig={() => { setSettingsOpen(false); setView("headsConfig"); }}
        />
      )}
      {error && <div className="error-toast">{error}</div>}
      {splashPhase !== "gone" && <Splash leaving={splashPhase === "leave"} />}
    </div>
  );
}
