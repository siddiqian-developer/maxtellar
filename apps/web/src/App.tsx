import { useEffect, useState } from "react";
import { useStore } from "./useStore";
import { Timeline } from "./components/Timeline";
import { Pipeline } from "./components/Pipeline";
import { TaskDrawer } from "./components/TaskDrawer";
import { fmtDur } from "./time";

type Theme = "light" | "dark" | "system";

export function App(): JSX.Element {
  const { ready, persistent, state, dispatch, error } = useStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  if (!ready || !state) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
        <h1>maxtellar</h1>
      </div>
    );
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

  const themeLabel = {
    system: "🔄",
    light: "☀️",
    dark: "🌙",
  }[theme];

  return (
    <div className="app">
      <div className="topbar">
        <h1>maxtellar</h1>
        <span className="meta num" title="Time Accounted vs Unaccounted — the hero metric">
          accounted {fmtDur(accounted)} · lost {fmtDur(lost)}
        </span>
        <span className="spacer" />
        {!persistent && <span className="warn">memory mode — data will not survive reload</span>}
        <button
          onClick={cycleTheme}
          title={`Theme: ${theme} (click to cycle)`}
          style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "18px", padding: 0 }}
        >
          {themeLabel}
        </button>
      </div>

      <Timeline state={state} />
      <Pipeline state={state} dispatch={(e) => void dispatch(e)} />

      <button className="fab primary" onClick={() => setDrawerOpen(true)} title="New task">
        +
      </button>
      {drawerOpen && (
        <TaskDrawer now={state.now} dispatch={(e) => void dispatch(e)} onClose={() => setDrawerOpen(false)} />
      )}
      {error && <div className="error-toast">{error}</div>}
    </div>
  );
}
