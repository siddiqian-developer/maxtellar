/**
 * The ONE tooltip mechanism (§7.0.4, revised 2026-07-20 — replaces the pure-CSS
 * `[data-tip]::after` approach). Every trigger keeps the exact same
 * `data-tip="…"` attribute API — ZERO call-site changes across the app's 125+
 * uses — this component is the only thing that changed: instead of a CSS
 * pseudo-element anchored with a fixed `right: 0`/`bottom: 100%` (which
 * silently clips off-screen for any trigger near a container's left/top edge,
 * the exact bug reported 2026-07-20), a single global listener measures the
 * hovered/focused trigger and floating-ui's `flip()`+`shift()` middleware
 * picks a side that actually fits the viewport, live, for every tooltip,
 * forever — no more manual per-selector overrides to remember.
 *
 * Mount ONCE, near the app root (`App.tsx`, alongside `SnapToast`). Delegated
 * `mouseover`/`focusin` (not a `data-tip` hook on abstracted, and every
 * `data-tip` element gets it for free.
 *
 * Visual styling (paper-raised card, hairline border, ink-soft 11px text,
 * shadow-2, 6px radius, 0.5s dwell, fade+rise transition) is unchanged from
 * the old CSS mechanism — see `docs/design-tokens.md`'s Tooltip section.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computePosition, flip, shift, offset, autoUpdate, type Placement } from "@floating-ui/react";

const DWELL_MS = 500;
const GAP = 6;

export function TooltipHost(): JSX.Element | null {
  const [state, setState] = useState<{ text: string; x: number; y: number; placement: Placement } | null>(null);
  const target = useRef<HTMLElement | null>(null);
  const dwellTimer = useRef<number | null>(null);
  const cleanupAutoUpdate = useRef<(() => void) | null>(null);

  useEffect(() => {
    const clearDwell = (): void => {
      if (dwellTimer.current !== null) {
        window.clearTimeout(dwellTimer.current);
        dwellTimer.current = null;
      }
    };
    const hide = (): void => {
      clearDwell();
      target.current = null;
      cleanupAutoUpdate.current?.();
      cleanupAutoUpdate.current = null;
      setState(null);
    };
    const place = (el: HTMLElement): void => {
      const text = el.getAttribute("data-tip");
      if (!text) return;
      // §7.0.4's original direction hints become floating-ui's PREFERRED
      // placement — `flip()` still overrides it the instant it wouldn't fit,
      // so the hint is a bias, never a hard rule that can clip again.
      const preferred: Placement = el.closest(".hint-glyph")
        ? "bottom"
        : el.closest(".drawer-body label")
          ? "top-start"
          : "top-end";
      const update = (): void => {
        void computePosition(el, tipEl(), {
          placement: preferred,
          middleware: [offset(GAP), flip(), shift({ padding: 8 })],
        }).then(({ x, y, placement }) => setState({ text, x, y, placement }));
      };
      // autoUpdate re-measures on scroll/resize/layout shift while shown —
      // a tooltip that opens correctly must stay correct if the page moves
      // under it (e.g. a scrolled panel) for the whole dwell it's visible.
      cleanupAutoUpdate.current = autoUpdate(el, tipEl(), update);
    };
    // A throwaway measuring element — floating-ui needs a real node with the
    // tooltip's actual size to compute placement; the portal below renders
    // the shown copy. Kept off-screen, never visible.
    const tipEl = (): HTMLElement => {
      let el = document.getElementById("tooltip-measure");
      if (!el) {
        el = document.createElement("div");
        el.id = "tooltip-measure";
        el.className = "tip-card";
        el.style.position = "fixed";
        el.style.visibility = "hidden";
        el.style.top = "0";
        el.style.left = "0";
        document.body.appendChild(el);
      }
      return el;
    };
    const onOver = (e: Event): void => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
      if (!el || el === target.current) return;
      hide();
      target.current = el;
      const text = el.getAttribute("data-tip");
      if (!text) return;
      tipEl().textContent = text;
      dwellTimer.current = window.setTimeout(() => place(el), DWELL_MS);
    };
    const onOut = (e: Event): void => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
      if (!el || el !== target.current) return;
      // Moving to a DESCENDANT of the same trigger isn't a real leave.
      const to = (e as MouseEvent).relatedTarget as Node | null;
      if (to && el.contains(to)) return;
      hide();
    };
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("focusin", onOver);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("focusin", onOver);
      document.removeEventListener("focusout", onOut);
      hide();
    };
  }, []);

  if (!state) return null;
  return createPortal(
    <div className="tip-card tip-shown" style={{ position: "fixed", left: state.x, top: state.y }} data-placement={state.placement}>
      {state.text}
    </div>,
    document.body,
  );
}
