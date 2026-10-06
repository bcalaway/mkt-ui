// A time chart that opens on all of history and gets finer as you zoom
// (TradingView Lightweight Charts). It asks its `loader` for bars at the
// interval that suits what's on screen (months, weeks, days) and keeps the
// same window in view when the data changes under it, including when the
// lines change (a tenor added or removed, lines to bars, another source):
// the chart is kept and the new lines replace the old ones when they arrive. Where the bars come
// from is the loader's business (src/charts/loaders.ts: asking mkt-api for
// each zoom level, or loading every day once and summing up in the browser).
//
// The chart's x-axis is evenly spaced by bar, not by time, so one load is
// always one interval: mixing months and days would bend time.
import { useEffect, useRef, useState } from "react";
import {
  BarSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type MouseEventParams,
  type IRange,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import { addDays, daysBetween, pickInterval, type Interval } from "./bars";
import ChartToolbar, { type Preset } from "./ChartToolbar";
import { useChartTheme } from "./theme";
import type { TimeLine } from "./types";

export interface Loaded {
  lines: TimeLine[];
  from: string; // the dates the bars cover
  to: string;
}

export type Loader = (interval: Interval, from: string, to: string) => Promise<Loaded>;

interface Hover {
  date: string;
  x: number;
  rows: { label: string; color: string; text: string; note?: string }[];
}

function timeToIso(t: Time): string {
  if (typeof t === "string") return t;
  if (typeof t === "number") return new Date(t * 1000).toISOString().slice(0, 10);
  return `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
}

const DEBOUNCE_MS = 250;

export default function ZoomChart({
  loader,
  first,
  today,
  unit,
  bars = false,
  height = 380,
  onInterval,
  presets = [],
  initialDays = null,
}: {
  loader: Loader;
  first: string; // the earliest date there could be data for
  today: string;
  unit: string;
  bars?: boolean;
  height?: number;
  onInterval?: (interval: Interval) => void;
  presets?: Preset[];
  initialDays?: number | null; // open on the last n days; null opens on all of history
}) {
  const theme = useChartTheme();
  const box = useRef<HTMLDivElement>(null);
  // The chart is made once (per height) and kept: new lines, bars or colors are
  // swapped into it, so the old lines stay on screen until the new ones are
  // drawn and the window on screen stays where it was.
  const props = useRef({ loader, bars, theme, unit, onInterval, first, today, initialDays });
  props.current = { loader, bars, theme, unit, onInterval, first, today, initialDays };
  const engine = useRef<{
    reset: () => void;
    showLast: (days: number) => void;
    reload: () => void; // the loader or bars changed: the same window, from the new loader
    restyle: () => void; // the theme or unit changed
  } | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const style = () => {
      const { theme, unit } = props.current;
      return {
        layout: {
          background: { type: ColorType.Solid, color: theme.surface },
          textColor: theme.muted,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          attributionLogo: true,
        },
        grid: { vertLines: { visible: false }, horzLines: { color: theme.grid } },
        rightPriceScale: { borderColor: theme.axis },
        timeScale: { borderColor: theme.axis, minBarSpacing: 0.05 },
        localization: { priceFormatter: (v: number) => `${v.toFixed(unit === "bp" ? 0 : 2)}${unit === "bp" ? "" : "%"}` },
      };
    };
    const chart: IChartApi = createChart(box.current, { height, autoSize: true, crosshair: { mode: CrosshairMode.Magnet }, ...style() });

    let series: ISeriesApi<SeriesType>[] = [];
    let shown: { lines: TimeLine[]; byDate: Map<string, Map<string, TimeLine["points"][number]>>; axis: string[] } = {
      lines: [],
      byDate: new Map(),
      axis: [],
    };
    let current: { interval: Interval; from: string; to: string } | null = null;
    let lastLoaded: Loaded | null = null;
    let used: { loader: Loader; bars: boolean } | null = null; // what the lines on screen came from
    let seq = 0; // the latest load wins
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;

    // Replaces the lines in one go (no paint in between), so nothing blanks.
    const draw = (loaded: Loaded) => {
      const { theme, bars } = props.current;
      for (const s of series) chart.removeSeries(s);
      series = loaded.lines.map((line) => {
        const color = theme.series[line.slot % theme.series.length];
        if (bars) {
          const s = chart.addSeries(BarSeries, { upColor: color, downColor: color, priceLineVisible: false, title: line.label });
          s.setData(line.points.map((p) => ({ time: p.date as Time, open: p.bar?.open ?? p.plot, high: p.bar?.high ?? p.plot, low: p.bar?.low ?? p.plot, close: p.plot })));
          return s as unknown as ISeriesApi<SeriesType>;
        }
        const s = chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, title: line.label });
        s.setData(line.points.map((p) => ({ time: p.date as Time, value: p.plot })));
        return s as unknown as ISeriesApi<SeriesType>;
      });
      shown = {
        lines: loaded.lines,
        byDate: new Map(loaded.lines.map((l) => [l.key, new Map(l.points.map((p) => [p.date, p]))])),
        // The time scale's bars: every date any line has, in order (what logical indexes count).
        axis: [...new Set(loaded.lines.flatMap((l) => l.points.map((p) => p.date)))].sort(),
      };
    };

    const load = async (interval: Interval, from: string, to: string, keep: IRange<Time> | null) => {
      const mine = ++seq;
      const { loader, bars } = props.current;
      try {
        const loaded = await loader(interval, from, to);
        if (!alive || mine !== seq) return;
        setError(null);
        current = { interval, from: loaded.from, to: loaded.to };
        used = { loader, bars };
        lastLoaded = loaded;
        draw(loaded);
        props.current.onInterval?.(interval);
        if (keep) chart.timeScale().setVisibleRange(keep);
        else chart.timeScale().fitContent();
      } catch (e) {
        if (alive && mine === seq) setError((e as Error).message);
      }
    };

    // The date at a logical index, extrapolated past the data's ends (zoomed
    // or panned beyond what's loaded) at the loaded bars' average spacing.
    const dateAt = (index: number): string => {
      const axis = shown.axis;
      if (!axis.length) return props.current.today;
      const step = axis.length > 1 ? daysBetween(axis[0], axis[axis.length - 1]) / (axis.length - 1) : 1;
      if (index < 0) return addDays(axis[0], Math.round(index * step));
      if (index >= axis.length) return addDays(axis[axis.length - 1], Math.round((index - axis.length + 1) * step));
      return axis[Math.floor(index)];
    };

    const clamp = (d: string) => {
      const { first, today } = props.current;
      return d < first ? first : d > today ? today : d;
    };
    // The dates on screen, or null before the first load has drawn anything.
    const onScreen = (): { from: string; to: string } | null => {
      const logical: LogicalRange | null = chart.timeScale().getVisibleLogicalRange();
      if (!logical || !current) return null;
      return { from: clamp(dateAt(logical.from)), to: clamp(dateAt(logical.to)) };
    };
    // A window's bars at the interval that suits it, loaded for the window and
    // as much again either side (room to pan).
    const showRange = (from: string, to: string) => {
      const { first, today } = props.current;
      const span = Math.max(1, daysBetween(from, to));
      const want = pickInterval(span);
      const keep: IRange<Time> = { from: from as Time, to: to as Time };
      if (want === "month") void load(want, first, today, keep);
      else void load(want, clamp(addDays(from, -span)), clamp(addDays(to, span)), keep);
    };

    // On a zoom or pan: once it settles, reload if the window wants another
    // interval or has run past what's loaded.
    const onRange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const win = onScreen();
        if (!win || !current) return;
        const { first, today } = props.current;
        const want = pickInterval(Math.max(1, daysBetween(win.from, win.to)));
        const covered = (current.from <= win.from || current.from <= first) && (current.to >= win.to || current.to >= today);
        if (want === current.interval && covered) return;
        showRange(win.from, win.to);
      }, DEBOUNCE_MS);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

    const onMove = (param: MouseEventParams<Time>) => {
      if (!param.time || !param.point) {
        setHover(null);
        return;
      }
      const { theme } = props.current;
      const date = timeToIso(param.time);
      const rows = shown.lines
        .map((line) => ({ line, p: shown.byDate.get(line.key)?.get(date) }))
        .filter((r) => r.p)
        .map(({ line, p }) => ({ label: line.label, color: theme.series[line.slot % theme.series.length], text: p!.text, note: p!.note }));
      setHover(rows.length ? { date, x: param.point.x, rows } : null);
    };
    chart.subscribeCrosshairMove(onMove);

    const reset = () => {
      const { first, today } = props.current;
      void load(pickInterval(daysBetween(first, today)), first, today, null);
    };
    // The last n days at the interval that suits them, loaded with as much again before (room to pan).
    const showLast = (days: number) => {
      const { first, today } = props.current;
      const from = addDays(today, -days) < first ? first : addDays(today, -days);
      const want = pickInterval(daysBetween(from, today));
      const keep: IRange<Time> = { from: from as Time, to: today as Time };
      if (want === "month") void load(want, first, today, keep);
      else void load(want, addDays(from, -days) < first ? first : addDays(from, -days), today, keep);
    };
    const open = () => {
      const days = props.current.initialDays;
      if (days) showLast(days);
      else reset();
    };
    const reload = () => {
      const { loader, bars } = props.current;
      if (used && used.loader === loader && used.bars === bars) return;
      const win = onScreen();
      if (win) showRange(win.from, win.to);
      else open();
    };
    const restyle = () => {
      chart.applyOptions(style());
      if (!lastLoaded) return;
      const logical = chart.timeScale().getVisibleLogicalRange();
      draw(lastLoaded);
      if (logical) chart.timeScale().setVisibleLogicalRange(logical);
    };
    engine.current = { reset, showLast, reload, restyle };
    open();

    return () => {
      alive = false;
      engine.current = null;
      clearTimeout(timer);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
    };
  }, [height]);

  // New lines (a tenor added or removed, another source or loading) or bars:
  // the same window from the new loader, drawn over the old lines when it arrives.
  useEffect(() => engine.current?.reload(), [loader, bars]);
  useEffect(() => engine.current?.restyle(), [theme, unit]);

  return (
    <div className="chart" style={{ position: "relative" }}>
      <div ref={box} style={{ height }} />
      <ChartToolbar onAll={() => engine.current?.reset()} presets={presets} onPreset={(p) => engine.current?.showLast(p.days)} />
      {error && <p className="error chart-error">Couldn't load: {error}</p>}
      {hover && (
        <div className="tooltip" style={{ left: Math.max(8, hover.x + 16) }} role="status">
          <div className="tooltip-date">{hover.date}</div>
          {hover.rows.map((r) => (
            <div key={r.label} className="tooltip-row">
              <span className="swatch" style={{ background: r.color }} />
              <span className="tooltip-label">{r.label}</span>
              <span className="num">{r.text}</span>
              {r.note && <span className="tooltip-note">{r.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
