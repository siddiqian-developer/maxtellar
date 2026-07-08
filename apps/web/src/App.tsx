import { useState } from "react";
import { useStore } from "./useStore";
import { Timeline } from "./components/Timeline";
import { Pipeline } from "./components/Pipeline";
import { TaskDrawer } from "./components/TaskDrawer";
import { fmtDur } from "./time";

export function App(): JSX.Element {
  const { ready, persistent, state, dispatch, error } = useStore();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (!ready || !state) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
        <h1>Timekeeper</h1>
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

  return (
    <div className="app">
      <div className="topbar">
        <h1>Timekeeper</h1>
        <span className="meta num" title="Time Accounted vs Unaccounted — the hero metric">
          accounted {fmtDur(accounted)} · lost {fmtDur(lost)}
        </span>
        <span className="spacer" />
        {!persistent && <span className="warn">memory mode — data will not survive reload</span>}
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
