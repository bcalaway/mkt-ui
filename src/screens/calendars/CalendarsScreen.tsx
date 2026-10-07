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
type SourcesOut = Schemas["CalendarSourcesResponse"];
type History = Schemas["DayHistoryResponse"];
type Disagreements = Schemas["DisagreementsResponse"];

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
                <td key={i} className={cls || undefined} title={c ? `${closeText(c)}${c.source ? `, from ${c.source}` : ""}` : undefined}>
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

const DIFFERS_LABEL: Record<string, string> = { status: "Status", time: "Close time", name: "Holiday name" };

function SourcesPanel({ name }: { name: string }) {
  const { data, error } = useApi<SourcesOut>((signal) => apiGet("/api/calendars/{name}/sources", { path: { name }, signal }), [name]);
  return (
    <section>
      <h2>Sources, in precedence order</h2>
      <p className="muted">A higher source decides a date it lists; a projection fills only years no other source covers.</p>
      {error && <p className="error">{error}</p>}
      {data && (
        <table className="data">
          <thead>
            <tr>
              <th scope="col" className="num">#</th>
              <th scope="col">Source</th>
              <th scope="col">Kind</th>
              <th scope="col">Years it decided</th>
            </tr>
          </thead>
          <tbody>
            {data.sources.map((s) => (
              <tr key={s.name}>
                <td className="num">{s.rank}</td>
                <td>
                  <a {...linkProps(`/sources/${s.name}`)}>{s.name}</a>
                </td>
                <td>{KIND_LABEL[s.kind] ?? s.kind}</td>
                <td className={s.years ? undefined : "muted"}>
                  {s.years ? `${s.years} (${s.first_year === s.last_year ? s.first_year : `${s.first_year} to ${s.last_year}`})` : "None"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function DayHistoryPanel({ name, day }: { name: string; day: string }) {
  const setQuery = useQueryUpdater();
  const { data, error } = useApi<History>(
    (signal) => apiGet("/api/calendars/{name}/days/{day}", { path: { name, day }, signal }),
    [name, day],
  );
  return (
    <section className="day-history">
      <h2>
        {shortDate(day)} on {name}{" "}
        <button type="button" className="chip" onClick={() => setQuery({ day: null })}>
          Close
        </button>
      </h2>
      {error && <p className="error">{error}</p>}
      {data && data.versions.length === 0 && <p className="muted">Always a business day here (or a weekend): no source has closed it.</p>}
      {data && data.versions.length > 0 && (
        <table className="data">
          <thead>
            <tr>
              <th scope="col">From</th>
              <th scope="col">Until</th>
              <th scope="col">Said</th>
              <th scope="col">Source</th>
              <th scope="col" className="num">Capture</th>
            </tr>
          </thead>
          <tbody>
            {data.versions.map((v, i) => (
              <tr key={i}>
                <td className="muted">{v.valid_from.slice(0, 10)}</td>
                <td className={v.valid_to ? "muted" : undefined}>{v.valid_to ? v.valid_to.slice(0, 10) : "Now"}</td>
                <td>{closeText({ date: day, status: v.status, holiday: v.holiday, close_time: v.close_time, projected: false, source: v.source })}</td>
                <td>{v.source}</td>
                <td className="num">#{v.capture_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function DisagreementsPanel({ name, year }: { name: string; year: number }) {
  const [asked, setAsked] = useState(false);
  const [all, setAll] = useState(false);
  const { data, error } = useApi<Disagreements | null>(
    (signal) => (asked ? apiGet("/api/calendars/{name}/disagreements", { path: { name }, signal }) : Promise.resolve(null)),
    [name, asked],
  );
  const rows = data ? data.days.filter((d) => all || d.date.startsWith(String(year))) : [];
  const flagged = data ? data.days.filter((d) => !d.decided_by_higher).length : 0;
  return (
    <section>
      <h2>Where the sources disagree</h2>
      {!asked && (
        <p>
          <button type="button" className="chip" onClick={() => setAsked(true)}>
            Check every year
          </button>{" "}
          <span className="muted">Reads each source's own dates from mkt-data: a few seconds.</span>
        </p>
      )}
      {asked && !data && !error && <p className="muted">Checking…</p>}
      {error && <p className="error">{error}</p>}
      {data && (
        <>
          <p className={flagged ? "error" : "muted"}>
            {data.days.length} days across every year where a source says something other than the calendar
            {flagged ? `; ${flagged} decided by a lower source than one covering the year, worth a look` : ""}.{" "}
            <label>
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Every year
            </label>
          </p>
          {rows.length === 0 ? (
            <p className="muted">None {all ? "" : `in ${year}`}.</p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Differs in</th>
                  <th scope="col">The calendar</th>
                  <th scope="col">Decided by</th>
                  <th scope="col">Disagrees</th>
                  <th scope="col">It says</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={`${d.date}:${d.source}`}>
                    <td>
                      <a {...linkProps(`${PREFIX}/${name}/${d.date.slice(0, 4)}?day=${d.date}`)}>{shortDate(d.date)}</a>
                    </td>
                    <td>{DIFFERS_LABEL[d.differs] ?? d.differs}</td>
                    <td>
                      {d.calendar_says}
                      {d.calendar_holiday && <span className="muted"> · {d.calendar_holiday}</span>}
                    </td>
                    <td>
                      {d.decided_by || <span className="muted">—</span>}
                      {!d.decided_by_higher && d.decided_by && <span className="badge status-error">lower source</span>}
                    </td>
                    <td>{d.source}</td>
                    <td>
                      {d.source_says}
                      {d.source_holiday && <span className="muted"> · {d.source_holiday}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

function YearPage({ name, year, day }: { name: string; year: number; day: string }) {
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
          {day && <DayHistoryPanel name={name} day={day} />}
          <h2>Closes and early closes</h2>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Closes</th>
                <th scope="col">Decided by</th>
              </tr>
            </thead>
            <tbody>
              {data.closes.map((c) => (
                <tr key={c.date}>
                  <td>
                    <a {...linkProps(`${PREFIX}/${name}/${year}?day=${c.date}`)} title="How this day's status changed">
                      {shortDate(c.date)}
                    </a>
                  </td>
                  <td>{closeText(c)}</td>
                  <td className="muted">{c.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <SourcesPanel name={name} />
      <DisagreementsPanel name={name} year={year} />
    </section>
  );
}

function CalendarsScreen({ location }: { location: Location }) {
  const [name, year] = location.path.slice(PREFIX.length).replace(/^\/+/, "").split("/");
  if (name) {
    const y = Number(year);
    return (
      <YearPage
        name={decodeURIComponent(name).toUpperCase()}
        year={Number.isInteger(y) && y > 1800 ? y : new Date().getFullYear()}
        day={location.query.get("day") ?? ""}
      />
    );
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
