// The controls every chart has, in the same place: zoom in, zoom out and
// reset, plus optional jumps to a span ("10Y", "2Y", "3M"). Each chart
// component wires them to its library; screens don't.
export interface Preset {
  label: string;
  days: number;
}

export default function ChartToolbar({
  onZoomIn,
  onZoomOut,
  onReset,
  presets = [],
  onPreset,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  presets?: Preset[];
  onPreset?: (p: Preset) => void;
}) {
  return (
    <div className="chart-toolbar" role="toolbar" aria-label="Chart zoom">
      {presets.map((p) => (
        <button key={p.label} type="button" className="tool" onClick={() => onPreset?.(p)} title={`Show the last ${p.label}`}>
          {p.label}
        </button>
      ))}
      <button type="button" className="tool" onClick={onZoomIn} aria-label="Zoom in" title="Zoom in">
        +
      </button>
      <button type="button" className="tool" onClick={onZoomOut} aria-label="Zoom out" title="Zoom out">
        −
      </button>
      <button type="button" className="tool" onClick={onReset} title="Show everything">
        Reset
      </button>
    </div>
  );
}
