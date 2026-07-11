import { useEffect } from "react";

/** Closes any drawer/panel on Escape (SPEC VI) — shared by TaskDrawer, SettingsPanel. */
export function useEscClose(onClose: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}
