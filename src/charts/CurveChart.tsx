// The yield curve on one or more dates (ECharts): tenors along the bottom in
// curve order, yields up the side, one line per date. The tooltip and the end
// labels show the API's strings; floats are only for drawing.
import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import ChartToolbar from "./ChartToolbar";
import { useChartTheme } from "./theme";

echarts.use([LineChart, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

// Back to every tenor after zooming in with the wheel or a pinch.
function showAllTenors(chart: echarts.ECharts | null) {
  chart?.dispatchAction({ type: "dataZoom", start: 0, end: 100 });
}

export interface CurveLine {
  key: string;
  label: string; // the legend and tooltip: "Latest · 2026-10-02"
  short: string; // the end label: "Latest", "1W"
  slot: number;
  values: Record<string, { text: string; source: string } | undefined>; // by tenor label
}

export default function CurveChart({ tenors, lines, height = 380 }: { tenors: string[]; lines: CurveLine[]; height?: number }) {
  const theme = useChartTheme();
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  // The tenors on screen when the chart was last torn down, so adding or
  // removing a curve keeps the zoom.
  const view = useRef<{ from: string; to: string } | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const chart = echarts.init(box.current, undefined, { renderer: "svg" });
    chartRef.current = chart;
    const color = (slot: number) => theme.series[slot % theme.series.length];
    const kept = view.current && tenors.includes(view.current.from) && tenors.includes(view.current.to) ? view.current : null;
    chart.setOption({
      backgroundColor: theme.surface,
      textStyle: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: theme.inkSecondary },
      grid: { left: 56, right: 120, top: 48, bottom: 40 },
      // Wheel and pinch zoom the tenors; All shows them all again.
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          filterMode: "none",
          ...(kept ? { startValue: tenors.indexOf(kept.from), endValue: tenors.indexOf(kept.to) } : {}),
        },
      ],
      legend: { top: 8, left: 56, textStyle: { color: theme.inkSecondary }, icon: "roundRect", itemWidth: 14, itemHeight: 4 },
      tooltip: {
        trigger: "axis",
        backgroundColor: theme.surface,
        borderColor: theme.axis,
        textStyle: { color: theme.ink },
        axisPointer: { type: "line", lineStyle: { color: theme.axis } },
        formatter: (params: unknown) => {
          const list = params as { axisValue: string; seriesIndex: number }[];
          if (!list.length) return "";
          const tenor = list[0].axisValue;
          const rows = lines
            .map((l) => ({ l, v: l.values[tenor] }))
            .filter((r) => r.v)
            .map(
              ({ l, v }) =>
                `<div style="display:flex;gap:8px;align-items:center"><span style="width:10px;height:3px;border-radius:2px;background:${color(l.slot)}"></span>` +
                `<span>${l.label}</span><b style="margin-left:auto;font-variant-numeric:tabular-nums">${v!.text}%</b></div>`,
            )
            .join("");
          return `<div style="font-weight:600;margin-bottom:4px">${tenor}</div>${rows}`;
        },
      },
      xAxis: {
        type: "category",
        data: tenors,
        boundaryGap: false,
        axisLine: { lineStyle: { color: theme.axis } },
        axisTick: { show: false },
        axisLabel: { color: theme.muted },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: { color: theme.muted, formatter: (v: number) => `${v.toFixed(2)}%` },
        splitLine: { lineStyle: { color: theme.grid } },
      },
      series: lines.map((l) => ({
        name: l.label,
        type: "line",
        data: tenors.map((t) => (l.values[t] ? Number(l.values[t]!.text) : null)),
        connectNulls: false,
        symbol: "circle",
        symbolSize: 8,
        lineStyle: { width: 2, color: color(l.slot) },
        itemStyle: { color: color(l.slot), borderColor: theme.surface, borderWidth: 2 },
        endLabel: { show: true, formatter: l.short, color: theme.inkSecondary },
        emphasis: { focus: "series" },
      })),
    });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      const zoom = (chart.getOption().dataZoom as { startValue?: number; endValue?: number }[] | undefined)?.[0];
      if (zoom && zoom.startValue != null && zoom.endValue != null) {
        const from = tenors[Math.round(zoom.startValue)];
        const to = tenors[Math.round(zoom.endValue)];
        view.current = from && to ? { from, to } : null;
      }
      window.removeEventListener("resize", resize);
      chartRef.current = null;
      chart.dispose();
    };
  }, [tenors, lines, theme]);

  return (
    <div className="chart chart-frame">
      <div ref={box} style={{ height }} />
      <ChartToolbar onAll={() => showAllTenors(chartRef.current)} />
    </div>
  );
}
