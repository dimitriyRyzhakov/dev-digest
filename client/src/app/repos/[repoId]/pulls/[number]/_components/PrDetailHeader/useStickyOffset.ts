/* useStickyOffset — publishes the sticky PR header's live height as the CSS
   variable `--pr-header-h` on its scroll container (AppFrame's <main>), so
   content below can stick right under it (Smart Diff group headers). */
"use client";

import React from "react";

/** CSS variable carrying the sticky PR header height (px). */
export const PR_HEADER_HEIGHT_VAR = "--pr-header-h";

export function useStickyOffset<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);

  React.useEffect(() => {
    const el = ref.current;
    const container = el?.parentElement;
    if (!el || !container || typeof ResizeObserver === "undefined") return;
    const publish = () => container.style.setProperty(PR_HEADER_HEIGHT_VAR, `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      container.style.removeProperty(PR_HEADER_HEIGHT_VAR);
    };
  }, []);

  return ref;
}
