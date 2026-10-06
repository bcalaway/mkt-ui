// What a time chart draws: lines (or bars) of points. Numbers are for drawing
// only; what the chart shows as text comes from the API's strings.

export interface TimePoint {
  date: string; // YYYY-MM-DD: the day, or a bar's first calendar day
  plot: number; // the close, for drawing only
  bar?: { open: number; high: number; low: number }; // for drawing bars only
  text: string; // what the tooltip shows, as the API gave it
  note?: string; // e.g. the source, or a bar's open, high and low
}

export interface TimeLine {
  key: string;
  label: string;
  slot: number; // categorical color slot: fixed per line, not by position
  points: TimePoint[];
}
