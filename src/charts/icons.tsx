// Small line icons for chart controls, drawn in the text colour (currentColor) so they follow the theme.
const BOX = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

/** A line chart: one zigzag. */
export function LineIcon() {
  return (
    <svg {...BOX}>
      <polyline points="1.5,12 5.5,7 8.5,9.5 14.5,3" />
    </svg>
  );
}

/** OHLC bars: three bars, each with its open tick left and close tick right. */
export function BarsIcon() {
  return (
    <svg {...BOX}>
      <path d="M3.5 4v9M2 6h1.5M3.5 11H5" />
      <path d="M8 2.5v8M6.5 4.5H8M8 8.5h1.5" />
      <path d="M12.5 6v8M11 12h1.5M12.5 7.5H14" />
    </svg>
  );
}

/** Fit everything: four corners pointing out. */
export function FitIcon() {
  return (
    <svg {...BOX}>
      <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
    </svg>
  );
}
