import type { ComponentType } from "react";
import type { Location } from "../router";

// Each screen is a self-contained module that registers its route here
// (src/screens/index.ts): adding a screen touches nothing else.
export interface Screen {
  id: string;
  title: string; // the nav label
  path: string; // where the nav links to
  matches: (path: string) => boolean;
  Component: ComponentType<{ location: Location }>;
}
