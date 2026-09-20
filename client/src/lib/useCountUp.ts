import { useEffect, useRef, useState } from "react";

/**
 * Animates a number toward `target` whenever it changes. Returns the current
 * (rounded) display value plus a `bump` flag that pulses true briefly after a
 * change settles, so callers can trigger a little emphasis animation.
 *
 * Respects prefers-reduced-motion by snapping straight to the target.
 */
export function useCountUp(target: number, durationMs = 700) {
  const [value, setValue] = useState(target);
  const [bump, setBump] = useState(false);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);
  const bumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Don't animate the very first mount from 0 unnecessarily jarringly, but a
    // gentle count-in on load is nice — so we DO animate the first paint too.
    const from = first.current ? 0 : fromRef.current;
    first.current = false;

    if (reduce || from === target) {
      setValue(target);
      fromRef.current = target;
      return;
    }

    const start = performance.now();
    const delta = target - from;
    // easeOutCubic
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(from + delta * ease(t));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setValue(target);
        fromRef.current = target;
        setBump(true);
        if (bumpTimer.current) clearTimeout(bumpTimer.current);
        bumpTimer.current = setTimeout(() => setBump(false), 520);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return { value, bump };
}
