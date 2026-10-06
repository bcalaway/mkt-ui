// Chart colors, light and dark, from the data-viz reference palette. Series
// take the categorical slots in fixed order (never cycled; a line keeps its
// slot when others are added or removed). The first four slots pass the
// colorblind-separation checks as a set in both modes; on the light surface
// aqua and yellow sit below 3:1 contrast, so every chart here also has a
// legend, direct labels or a table of the same values.
import { useEffect, useState } from "react";

export interface ChartTheme {
  dark: boolean;
  surface: string;
  ink: string;
  inkSecondary: string;
  muted: string;
  grid: string;
  axis: string;
  series: string[];
}

const LIGHT: ChartTheme = {
  dark: false,
  surface: "#fcfcfb",
  ink: "#0b0b0b",
  inkSecondary: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"],
};

const DARK: ChartTheme = {
  dark: true,
  surface: "#1a1a19",
  ink: "#ffffff",
  inkSecondary: "#c3c2b7",
  muted: "#898781",
  grid: "#2c2c2a",
  axis: "#383835",
  series: ["#3987e5", "#d95926", "#199e70", "#c98500"],
};

/** At most this many lines on one chart: past it, colors stop being safe to tell apart. */
export const MAX_SERIES = 4;

function prefersDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

export function useChartTheme(): ChartTheme {
  const [dark, setDark] = useState(prefersDark);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const update = () => setDark(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return dark ? DARK : LIGHT;
}
