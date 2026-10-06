import type { Screen } from "./types";
import { curveScreen } from "./curve/CurveScreen";
import { seriesScreen } from "./series/SeriesScreen";
import { securitiesScreen } from "./securities/SecuritiesScreen";
import { zoomLabScreen } from "./lab/ZoomLabScreen";

// The nav order; the first is the home page.
export const screens: Screen[] = [curveScreen, seriesScreen, securitiesScreen, zoomLabScreen];

export function screenFor(path: string): Screen {
  return screens.find((s) => s.matches(path)) ?? screens[0];
}
