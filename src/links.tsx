// Links between screens (Bill, 2026-10-10: "source on any page links to Sources, instruments to
// Instruments, calendars to Calendars"). Use these wherever one of the three is named.
import { useEffect, useState } from "react";
import { apiGet } from "./api/client";
import { linkProps } from "./router";

// mkt-data's source names, fetched once per page load: a "source" in calendar-svc's or secmaster-svc's
// answers can be a rules file or an identifier scheme (CUSIP, OTR) rather than a captured source, and
// only captured sources have a page to link to.
let known: Promise<Set<string>> | null = null;

function knownSources(): Promise<Set<string>> {
  known ??= apiGet("/api/sources")
    .then((r) => new Set((r?.sources ?? []).map((s) => s.name)))
    .catch(() => {
      known = null; // try again next time
      return new Set<string>();
    });
  return known;
}

function useKnownSources(): Set<string> | null {
  const [names, setNames] = useState<Set<string> | null>(null);
  useEffect(() => {
    let live = true;
    knownSources().then((s) => live && setNames(s));
    return () => {
      live = false;
    };
  }, []);
  return names;
}

/** A source by its mkt-data name (UST-PAR), linked to its Sources page when it has one; `label` to show another name. */
export function SourceLink({ name, label }: { name: string; label?: string }) {
  const names = useKnownSources();
  const text = label ?? name;
  if (!name || !names?.has(name)) return <>{text}</>;
  return <a {...linkProps(`/sources/${encodeURIComponent(name)}`)}>{text}</a>;
}

/** An instrument by short name or alias, linked to its Instruments page; `label` to show something shorter. */
export function InstrumentLink({ name, label }: { name: string; label?: string }) {
  if (!name) return null;
  return <a {...linkProps(`/instruments/${encodeURIComponent(name)}`)}>{label ?? name}</a>;
}

/** A calendar-svc calendar (SIFMA-US, TARGET), linked to its year on Calendars (this year unless given). */
export function CalendarLink({ name, year }: { name: string; year?: number }) {
  if (!name) return null;
  const y = year ?? new Date().getFullYear();
  return <a {...linkProps(`/calendars/${encodeURIComponent(name)}/${y}`)}>{name}</a>;
}
