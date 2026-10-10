// The controls every chart has, in the same place: jumps to a span ("1Y",
// "10Y") where a chart offers them, and All, which shows everything. Zooming
// in between is the scroll wheel, a pinch or a drag (Bill, 2026-10-06: All
// rather than Reset; no + / − buttons). Each chart component wires these to
// its library; screens don't.
import type { ReactNode } from "react";
import { FitIcon } from "./icons";

export interface Preset {
  label: string;
  days: number;
}

export default function ChartToolbar({
  onAll,
  presets = [],
  onPreset,
  start,
}: {
  onAll: () => void;
  presets?: Preset[];
  onPreset?: (p: Preset) => void;
  start?: ReactNode; // controls on the left end, such as the lines/OHLC toggle
}) {
  return (
    <div className="chart-toolbar" role="toolbar" aria-label="Chart">
      {start}
      <div className="tool-group span" role="group" aria-label="Chart span">
        {presets.map((p) => (
          <button key={p.label} type="button" className="tool" onClick={() => onPreset?.(p)} title={`Show the last ${p.label}`}>
            {p.label}
          </button>
        ))}
        <button type="button" className="tool" onClick={onAll} title="Show everything">
          <FitIcon /> All
        </button>
      </div>
    </div>
  );
}
