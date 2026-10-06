// Lines over time (TradingView Lightweight Charts): yields or spreads. The
// library only plots; the tooltip shows each value's original string, never
// a float formatted back. One y-axis per chart: yields and spreads (different
// units) are separate charts.
import { useEffect, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import { useChartTheme } from "./theme";

export interface TimePoint {
  date: string; // YYYY-MM-DD
  plot: number; // for drawing only
  text: string; // what the tooltip shows, as the API gave it
  note?: string; // e.g. the source
}

export interface TimeLine {
  key: string;
  label: string;
  slot: number; // categorical slot: fixed per line, not by position
  points: TimePoint[];
}

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

export default function TimeSeriesChart({ lines, unit, height = 360 }: { lines: TimeLine[]; unit: string; height?: number }) {
  const theme = useChartTheme();
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const chart: IChartApi = createChart(box.current, {
      height,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: theme.surface },
        textColor: theme.muted,
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        attributionLogo: true,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: theme.grid } },
      rightPriceScale: { borderColor: theme.axis },
      timeScale: { borderColor: theme.axis },
      crosshair: { mode: CrosshairMode.Magnet },
      localization: { priceFormatter: (v: number) => `${v.toFixed(unit === "bp" ? 0 : 2)}${unit === "bp" ? "" : "%"}` },
    });
    const byLine: { line: TimeLine; series: ISeriesApi<"Line">; byDate: Map<string, TimePoint> }[] = lines.map((line) => {
      const series = chart.addSeries(LineSeries, {
        color: theme.series[line.slot % theme.series.length],
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: line.label,
      });
      series.setData(line.points.map((p) => ({ time: p.date as Time, value: p.plot })));
      return { line, series, byDate: new Map(line.points.map((p) => [p.date, p])) };
    });
    chart.timeScale().fitContent();

    const onMove = (param: MouseEventParams<Time>) => {
      if (!param.time || !param.point) {
        setHover(null);
        return;
      }
      const date = timeToIso(param.time);
      const rows = byLine
        .map(({ line, byDate }) => ({ line, p: byDate.get(date) }))
        .filter((r) => r.p)
        .map(({ line, p }) => ({
          label: line.label,
          color: theme.series[line.slot % theme.series.length],
          text: p!.text,
          note: p!.note,
        }));
      setHover(rows.length ? { date, x: param.point.x, rows } : null);
    };
    chart.subscribeCrosshairMove(onMove);
    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
    };
  }, [lines, unit, height, theme]);

  return (
    <div className="chart" style={{ position: "relative" }}>
      <div ref={box} style={{ height }} />
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
