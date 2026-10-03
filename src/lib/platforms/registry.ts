import type { Platform } from "@/lib/db/schema";

import { SwiggyAdapter } from "./swiggy";
import { ZomatoAdapter } from "./zomato";

export function getAdapter(platform: Platform) {
  if (platform === "SWIGGY") {
    return new SwiggyAdapter();
  }

  return new ZomatoAdapter();
}
