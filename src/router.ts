// A small client-side router: the address bar is the state (path and query),
// so every view is a link that can be bookmarked or shared. The server
// answers any path with index.html (server/index.js).
import { useCallback, useEffect, useState } from "react";

export interface Location {
  path: string;
  query: URLSearchParams;
}

function current(): Location {
  return { path: window.location.pathname, query: new URLSearchParams(window.location.search) };
}

const EVENT = "mkt-ui:navigate";

export function navigate(to: string, { replace = false } = {}): void {
  if (replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  window.dispatchEvent(new Event(EVENT));
}

export function useLocation(): Location {
  const [loc, setLoc] = useState(current);
  useEffect(() => {
    const update = () => setLoc(current());
    window.addEventListener("popstate", update);
    window.addEventListener(EVENT, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(EVENT, update);
    };
  }, []);
  return loc;
}

/** Replace some query parameters (null removes one), keeping the path; for filters, without a history entry. */
export function useQueryUpdater(): (changes: Record<string, string | null>) => void {
  return useCallback((changes) => {
    const q = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") q.delete(k);
      else q.set(k, v);
    }
    const s = q.toString();
    navigate(`${window.location.pathname}${s ? `?${s}` : ""}`, { replace: true });
  }, []);
}

/** An <a> that navigates in-app on a plain left click. */
export function linkProps(to: string) {
  return {
    href: to,
    onClick: (e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; preventDefault: () => void }) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      navigate(to);
    },
  };
}
