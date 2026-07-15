import { useEffect, useState } from "react";
import { useStore } from "./useStore";
import { useHeads } from "./heads";
import { Timeline } from "./components/Timeline";
import { Pipeline } from "./components/Pipeline";
import { TaskDrawer } from "./components/TaskDrawer";
import { GlobalClock } from "./components/GlobalClock";
import { DevClock } from "./components/DevClock";
import { SettingsPanel } from "./components/SettingsPanel";
import { HeadsConfigScreen } from "./components/HeadsConfigScreen";
import { AiStudioScreen } from "./components/AiStudioScreen";
import { HistoryScreen } from "./components/HistoryScreen";
import { AnalyticsScreen } from "./components/AnalyticsScreen";
import { SodCeremony } from "./components/SodCeremony";
import { EodButton } from "./components/EodButton";
import { OffPeriodControl } from "./components/OffPeriodControl";
import { WeekView } from "./components/WeekView";
import { GapFillModal } from "./components/GapFillModal";
import { LOST_HOURS, formingDayStart, sodPrecondition } from "@maxtellar/core";
import { fmtDur } from "./time";
import { useSettings, type TimeFormat, type GridGranularity, type PresetDefaults } from "./settings";

type Theme = "light" | "dark" | "system";
type View = "main" | "headsConfig" | "history" | "analytics" | "aiStudio" | "week" | "calendar";

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
  const settings = useSettings();
  const { devSandbox } = settings;
  const [drawerOpen, setDrawerOpen] = useState(false);
  // §7.0.2 snap-notify toast: the reducer sets `state.notice` (with a `seq`)
  // when it moves a just-added task to respect priority. Show each once, ~5s.
  const [noticeToast, setNoticeToast] = useState<string | null>(null);
  const noticeSeq = state?.notice?.seq;
  useEffect(() => {
    if (state?.notice) {
      setNoticeToast(state.notice.text);
      const t = setTimeout(() => setNoticeToast(null), 5000);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticeSeq]);
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
  // §4.2 SOD ceremony overlay (pre-sweep). Once dispatched, state.ceremony
  // drives the phase and keeps the overlay up across reloads.
  const [sodOpen, setSodOpen] = useState(false);
  // Missing-data fallback: when the precondition fails, the same GapFillModal
  // (its §4.2 second entry point) opens on the trailing unaccounted span.
  const [sodGapFill, setSodGapFill] = useState<{ from: number; to: number } | null>(null);

  // §06 transactional Settings: changes reflect live but only commit on Done;
  // Esc/×/scrim revert to this snapshot. Held above the panel so it survives the
  // round-trip to the Heads screen (which unmounts the panel).
  interface SettingsSnapshot {
    minFragment: number;
    openExtentCap: number;
    semiTailFloor: number;
    timeFormat: TimeFormat;
    gridGranularity: GridGranularity;
    devSandboxVal: boolean;
    presetDefaults: PresetDefaults;
  }
  const [settingsSnapshot, setSettingsSnapshot] = useState<SettingsSnapshot | null>(null);
  const openSettings = (): void => {
    if (!settingsSnapshot && state) {
      setSettingsSnapshot({
        minFragment: state.minFragment,
        openExtentCap: state.openExtentCap,
        semiTailFloor: state.semiTailFloor,
        timeFormat: settings.timeFormat,
        gridGranularity: settings.gridGranularity,
        devSandboxVal: settings.devSandbox,
        presetDefaults: settings.presetDefaults,
      });
    }
    setSettingsOpen(true);
  };
  const commitSettings = (): void => {
    setSettingsSnapshot(null); // Done: keep the live changes
    setSettingsOpen(false);
  };
  const revertSettings = (): void => {
    const s = settingsSnapshot;
    if (s && state) {
      if (s.minFragment !== state.minFragment) dispatch({ type: "SET_MIN_FRAGMENT", minutes: s.minFragment });
      if (s.openExtentCap !== state.openExtentCap) dispatch({ type: "SET_OPEN_CAP", minutes: s.openExtentCap });
      if (s.semiTailFloor !== state.semiTailFloor) dispatch({ type: "SET_TAIL_FLOOR", minutes: s.semiTailFloor });
      settings.setTimeFormat(s.timeFormat);
      settings.setGridGranularity(s.gridGranularity);
      settings.setDevSandbox(s.devSandboxVal);
      settings.setPresetDefault("sleep", s.presetDefaults.sleep);
      settings.setPresetDefault("nap", s.presetDefaults.nap);
      settings.setPresetDefault("food", s.presetDefaults.food);
    }
    setSettingsSnapshot(null);
    setSettingsOpen(false);
  };
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

  // Hero metric (SPEC 1.4, §4.2): time accounted vs lost across the FORMING day
  // — the window since the last sealed DayRecord (or the day's head sleep).
  // "Accounted" excludes Lost Hours (the SOD-booked gutter is its own category),
  // so the zero-sum identity holds live and after sealing: wall = accounted + lost.
  const dayStart = formingDayStart(state);
  const wall = Math.max(0, state.now - dayStart);
  const clip = (s: number, e: number): number =>
    Math.max(0, Math.min(e, state.now) - Math.max(s, dayStart));
  const accounted = state.history
    .filter((h) => h.kind === "occupancy" && h.headId !== LOST_HOURS)
    .reduce((acc, h) => acc + clip(h.start, h.end), 0)
    + (state.running ? clip(state.running.startedAt, state.now) : 0);
  const lost = Math.max(0, wall - accounted);
  const canSod = sodPrecondition(state).ok;

  // Start-of-Day entry point. Mid-ceremony → resume. Precondition ok → open the
  // guided sweep. Otherwise open the missing-data GapFillModal on the trailing
  // unaccounted span so the user can log the sleep that's blocking the sweep.
  const startSod = (): void => {
    setView("main"); // the ceremony (and its add-task drawer) lives over the Day
    if (state.ceremony || canSod) {
      setSodOpen(true);
      return;
    }
    const lastOcc = state.history
      .filter((h) => h.kind === "occupancy" && h.end > h.start)
      .reduce((m, h) => Math.max(m, h.end), dayStart);
    let from = Math.max(dayStart, lastOcc);
    if (from >= state.now) from = dayStart;
    setSodGapFill({ from, to: state.now });
  };

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
        {/* Screen navigation (SPEC VI): quiet icon menu — Day / History / Analytics */}
        <nav className="nav-menu" aria-label="Screens">
          <button
            className={`nav-btn${view === "main" ? " active" : ""}`}
            onClick={() => setView("main")}
            data-tip="Day"
            aria-label="Day"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="17" rx="2" />
              <path d="M3 9h18M8 2v4M16 2v4" />
            </svg>
          </button>
          <button
            className={`nav-btn${view === "history" ? " active" : ""}`}
            onClick={() => setView("history")}
            data-tip="History"
            aria-label="History"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5M12 7v5l3 3" />
            </svg>
          </button>
          <button
            className={`nav-btn${view === "analytics" ? " active" : ""}`}
            onClick={() => setView("analytics")}
            data-tip="Analytics"
            aria-label="Analytics"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
            </svg>
          </button>
          <button
            className={`nav-btn${view === "week" ? " active" : ""}`}
            onClick={() => setView("week")}
            data-tip="Week plan"
            aria-label="Week plan"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="17" rx="2" />
              <path d="M3 9h18M8 2v4M16 2v4M8 13h2M14 13h2M8 17h2M14 17h2" />
            </svg>
          </button>
          <button
            className={`nav-btn${view === "calendar" ? " active" : ""}`}
            onClick={() => setView("calendar")}
            data-tip="Calendar — dated activities"
            aria-label="Calendar"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="17" rx="2" />
              <path d="M3 9h18M8 2v4M16 2v4" />
              <circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="16" cy="14" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="8" cy="18" r="1.4" fill="currentColor" stroke="none" />
            </svg>
          </button>
        </nav>
        <span className="meta num" title="Time Accounted vs Unaccounted — the hero metric (this forming day)">
          accounted {fmtDur(accounted)} · lost {fmtDur(lost)}
        </span>
        <div className="ceremony-controls">
          <button
            className={`sod-btn${canSod && !state.ceremony ? " ready" : ""}`}
            onClick={startSod}
            data-tip={
              state.ceremony
                ? "Resume the Start-of-Day ceremony"
                : canSod
                  ? "Start of Day — sweep yesterday, prune, plan today"
                  : "Start of Day — needs two Finished Sleeps; log the missing one"
            }
          >
            {state.ceremony ? "Resume day setup" : "Start Day"}
          </button>
          <EodButton state={state} dispatch={(e) => void dispatch(e)} />
          <OffPeriodControl state={state} dispatch={(e) => void dispatch(e)} />
        </div>
        <span className="spacer" />
        <GlobalClock />
        {devSandbox && <DevClock now={state.now} dispatch={(e) => void dispatch(e)} />}
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
          onClick={openSettings}
          title="Settings"
          aria-label="Settings"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </button>
      </div>

      {view === "aiStudio" ? (
        <AiStudioScreen onBack={() => { setView("main"); setSettingsOpen(true); }} />
      ) : view === "headsConfig" ? (
        <HeadsConfigScreen state={state} dispatch={(e) => void dispatch(e)} onBack={() => { setView("main"); setSettingsOpen(true); }} />
      ) : view === "history" ? (
        <HistoryScreen state={state} dispatch={(e) => void dispatch(e)} onBack={() => setView("main")} />
      ) : view === "analytics" ? (
        <AnalyticsScreen state={state} onBack={() => setView("main")} />
      ) : view === "week" || view === "calendar" ? (
        <WeekView state={state} dispatch={(e) => void dispatch(e)} onBack={() => setView("main")} initialMode={view === "calendar" ? "calendar" : "week"} />
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
              minFragment={state.minFragment}
              dispatch={(e) => void dispatch(e)}
              onClose={() => setDrawerOpen(false)}
            />
          )}
        </>
      )}
      {(sodOpen || state.ceremony) && (
        <SodCeremony
          state={state}
          dispatch={(e) => void dispatch(e)}
          onClose={() => setSodOpen(false)}
          onAddTask={() => setDrawerOpen(true)}
        />
      )}
      {sodGapFill && (
        <GapFillModal
          from={sodGapFill.from}
          to={sodGapFill.to}
          now={state.now}
          dispatch={(e) => void dispatch(e)}
          onClose={() => setSodGapFill(null)}
        />
      )}
      {settingsOpen && (
        <SettingsPanel
          minFragment={state.minFragment}
          openExtentCap={state.openExtentCap}
          semiTailFloor={state.semiTailFloor}
          sleepMinutes={state.week.sleepMinutes}
          dispatch={(e) => void dispatch(e)}
          onCancel={revertSettings}
          onDone={commitSettings}
          onOpenHeadsConfig={() => { setSettingsOpen(false); setView("headsConfig"); }}
          onOpenAiStudio={() => { setSettingsOpen(false); setView("aiStudio"); }}
        />
      )}
      {error && <div className="error-toast">{error}</div>}
      {noticeToast && <div className="notice-toast" role="status">{noticeToast}</div>}
      {splashPhase !== "gone" && <Splash leaving={splashPhase === "leave"} />}
    </div>
  );
}
