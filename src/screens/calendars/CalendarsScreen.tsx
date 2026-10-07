// Calendars (mkt-data's docs/phase-3.md, step 8): calendar-svc's golden
// holiday calendars (FED, SIFMA-US, NYSE). The list shows each calendar's
// coverage and next closes, the upcoming closes side by side (where the
// calendars differ), and a day lookup; a calendar's year is twelve month
// grids with closes and early closes marked, and the source that decided it.
import { useEffect, useState } from "react";
import { ApiError, apiGet, type Schemas } from "../../api/client";
import { linkProps, useQueryUpdater, type Location } from "../../router";
import type { Screen } from "../types";

const PREFIX = "/calendars";
type CloseOut = Schemas["CloseOut"];
type Calendars = Schemas["CalendarsResponse"];
type Upcoming = Schemas["UpcomingResponse"];
type DayLookup = Schemas["DayLookupResponse"];
type Year = Schemas["CalendarYearOut"];

const KIND_LABEL: Record<string, string> = { published: "Published", rules: "Rules file", projected: "Projected" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
  "November", "December"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** "Closed: Columbus Day", "Early close 14:00: Day after Thanksgiving", with "(projected)" for a guess. */
export function closeText(c: CloseOut): string {
  const what = c.status === "early_close" ? `Early close${c.close_time ? ` ${c.close_time}` : ""}` : "Closed";
  return `${what}${c.holiday ? `: ${c.holiday}` : ""}${c.projected ? " (projected)" : ""}`;
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function useApi<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    setData(null);
    setError(null);
    load(ctl.signal)
      .then(setData)
      .catch((e: Error) => e.name !== "AbortError" && setError(e instanceof ApiError ? e.message : String(e.message)));
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error };
}

function DayLookupPanel({ on }: { on: string }) {
  const setQuery = useQueryUpdater();
  const { data, error } = useApi<DayLookup>(
    (signal) => apiGet("/api/calendars/day", { query: { date: on || undefined }, signal }),
    [on],
  );
  return (
    <section>
      <h2>Is it a business day?</h2>
      <div className="controls">
        <label>
          Date
          <input type="date" value={on || data?.date || ""} onChange={(e) => setQuery({ date: e.target.value || null })} />
        </label>
        {data && <span className="muted">{data.weekday}</span>}
      </div>
      {error && <p className="error">{error}</p>}
      {data && (
        <table className="data">
          <tbody>
            {data.calendars.map((c) => (
              <tr key={c.calendar}>
                <th scope="row">{c.calendar}</th>
                <td className={c.business_day ? undefined : "error"}>
                  {!c.covered
                    ? "Not covered: no source has this year"
                    : c.status === "weekend"
                      ? "Weekend"
                      : c.status === "open"
                        ? "Business day"
                        : closeText({ date: data.date, status: c.status, holiday: c.holiday, close_time: c.close_time, projected: c.projected, source: "" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function UpcomingTable({ u }: { u: Upcoming }) {
  return (
    <>
      <p className="muted">
        Closes and early closes from {u.start} to {u.end}. A blank cell is a business day on that calendar.
      </p>
      <table className="data">
        <thead>
          <tr>
            <th scope="col">Date</th>
            {u.calendars.map((n) => (
              <th key={n} scope="col">
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {u.days.map((d) => (
            <tr key={d.date}>
              <td>{shortDate(d.date)}</td>
              {u.calendars.map((n) => {
                const c = d.calendars[n];
                return <td key={n}>{c ? closeText(c) : ""}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ListPage({ on }: { on: string }) {
  const list = useApi<Calendars>((signal) => apiGet("/api/calendars", { signal }), []);
  const upcoming = useApi<Upcoming>((signal) => apiGet("/api/calendars/upcoming", { query: { days: 180 }, signal }), []);
  const thisYear = list.data ? Number(list.data.as_of.slice(0, 4)) : new Date().getFullYear();

  return (
    <section>
      <header className="screen-head">
        <h1>Calendars</h1>
        <p className="lede">
          The holiday calendars the platform schedules by, as calendar-svc holds them: which years each covers and from what
          kind of source, the next closes, and where the calendars differ.
        </p>
      </header>
      {list.error && <p className="error">Couldn't load calendars: {list.error}</p>}
      {!list.error && !list.data && <p className="muted">Loading…</p>}
      {list.data && (
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Calendar</th>
              <th scope="col">Years</th>
              <th scope="col">Published to</th>
              <th scope="col" className="num">Published · rules · projected</th>
              <th scope="col">Next close</th>
              <th scope="col">Next early close</th>
            </tr>
          </thead>
          <tbody>
            {list.data.calendars.map((c) => (
              <tr key={c.name}>
                <td>
                  <a {...linkProps(`${PREFIX}/${c.name}/${thisYear}`)}>{c.name}</a>
                  <div className="muted">{c.description}</div>
                </td>
                <td>
                  {c.first_year} to {c.last_year}
                </td>
                <td>{c.coverage.last_published_year || <span className="muted">—</span>}</td>
                <td className="num">
                  {c.coverage.published} · {c.coverage.rules} · {c.coverage.projected}
                </td>
                <td>{c.next_close ? `${shortDate(c.next_close.date)}, ${c.next_close.holiday}` : <span className="muted">—</span>}</td>
                <td>
                  {c.next_early_close
                    ? `${shortDate(c.next_early_close.date)}, ${c.next_early_close.close_time}`
                    : <span className="muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <DayLookupPanel on={on} />

      <section>
        <h2>Coming up</h2>
        {upcoming.error && <p className="error">{upcoming.error}</p>}
        {upcoming.data && <UpcomingTable u={upcoming.data} />}
      </section>
    </section>
  );
}

function Month({ year, month, closes }: { year: number; month: number; closes: Map<string, CloseOut> }) {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return (
    <table className="month">
      <caption>{MONTHS[month]}</caption>
      <thead>
        <tr>
          {WEEKDAYS.map((w, i) => (
            <th key={i} scope="col">
              {w}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week, wi) => (
          <tr key={wi}>
            {Array.from({ length: 7 }, (_, i) => {
              const day = week[i] ?? null;
              if (day === null) return <td key={i} />;
              const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const c = closes.get(iso);
              const cls = [i === 0 || i === 6 ? "weekend" : "", c ? (c.status === "early_close" ? "early" : "closed") : "",
                c?.projected ? "projected" : ""].filter(Boolean).join(" ");
              return (
                <td key={i} className={cls || undefined} title={c ? closeText(c) : undefined}>
                  {day}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function YearPage({ name, year }: { name: string; year: number }) {
  const { data, error } = useApi<Year>(
    (signal) => apiGet("/api/calendars/{name}/{year}", { path: { name, year }, signal }),
    [name, year],
  );
  const closes = new Map((data?.closes ?? []).map((c) => [c.date, c]));
  return (
    <section>
      <p>
        <a {...linkProps(PREFIX)}>All calendars</a>
      </p>
      <header className="screen-head">
        <h1>
          {name} {year}
        </h1>
        <p className="controls">
          <a {...linkProps(`${PREFIX}/${name}/${year - 1}`)}>← {year - 1}</a>
          <a {...linkProps(`${PREFIX}/${name}/${year + 1}`)}>{year + 1} →</a>
        </p>
        {data && (
          <p className="lede">
            {KIND_LABEL[data.kind] ?? data.kind}, from {data.source}
            {data.kind === "projected" ? ": no publisher covers this year yet, so it's the rules run forward, a best guess" : ""}.{" "}
            {data.closes.filter((c) => c.status === "closed").length} closes and{" "}
            {data.closes.filter((c) => c.status === "early_close").length} early closes on weekdays.
          </p>
        )}
      </header>
      {error && <p className="error">{error}</p>}
      {!error && !data && <p className="muted">Loading…</p>}
      {data && (
        <>
          <div className="months">
            {MONTHS.map((_, m) => (
              <Month key={m} year={year} month={m} closes={closes} />
            ))}
          </div>
          <h2>Closes and early closes</h2>
          <table className="data">
            <tbody>
              {data.closes.map((c) => (
                <tr key={c.date}>
                  <td>{shortDate(c.date)}</td>
                  <td>{closeText(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function CalendarsScreen({ location }: { location: Location }) {
  const [name, year] = location.path.slice(PREFIX.length).replace(/^\/+/, "").split("/");
  if (name) {
    const y = Number(year);
    return <YearPage name={decodeURIComponent(name).toUpperCase()} year={Number.isInteger(y) && y > 1800 ? y : new Date().getFullYear()} />;
  }
  return <ListPage on={location.query.get("date") ?? ""} />;
}

export const calendarsScreen: Screen = {
  id: "calendars",
  title: "Calendars",
  path: PREFIX,
  matches: (path) => path === PREFIX || path.startsWith(`${PREFIX}/`),
  Component: CalendarsScreen,
};
