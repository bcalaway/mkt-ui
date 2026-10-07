import type { Screen } from "./types";
import { curveScreen } from "./curve/CurveScreen";
import { seriesScreen } from "./series/SeriesScreen";
import { securitiesScreen } from "./securities/SecuritiesScreen";
import { sourcesScreen } from "./sources/SourcesScreen";
import { calendarsScreen } from "./calendars/CalendarsScreen";

// The nav order; the first is the home page.
export const screens: Screen[] = [curveScreen, seriesScreen, securitiesScreen, calendarsScreen, sourcesScreen];

export function screenFor(path: string): Screen {
  return screens.find((s) => s.matches(path)) ?? screens[0];
}
