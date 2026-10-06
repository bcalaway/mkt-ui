import type { IChartApi } from "lightweight-charts";

/** Zoom a Lightweight Charts time scale about its middle: factor 0.5 halves the span shown, 2 doubles it. */
export function zoomAboutMiddle(chart: IChartApi | null, factor: number): void {
  const r = chart?.timeScale().getVisibleLogicalRange();
  if (!chart || !r) return;
  const mid = (r.from + r.to) / 2;
  const half = Math.max(2, ((r.to - r.from) / 2) * factor);
  chart.timeScale().setVisibleLogicalRange({ from: mid - half, to: mid + half });
}
