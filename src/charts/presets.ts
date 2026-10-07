// The zoom buttons every history chart offers (ZoomChart's `presets`), and how much it opens on.
import type { Preset } from "./ChartToolbar";

export const PRESETS: Preset[] = [
  { label: "1M", days: 31 },
  { label: "6M", days: 183 },
  { label: "1Y", days: 365 },
  { label: "5Y", days: 1826 },
  { label: "10Y", days: 3653 },
];
export const OPEN_ON_DAYS = 365;
