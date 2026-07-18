"use client";

import { useCallback, useState } from "react";
import AppleRestroomMap from "./AppleRestroomMap";
import LeafletRestroomMap from "./LeafletRestroomMap";
import { isAppleMapsConfigured } from "../lib/mapkit";
import type { RestroomMapProps } from "./mapTypes";

export default function RestroomMap(props: RestroomMapProps) {
  const [provider, setProvider] = useState<"apple" | "leaflet">(
    () => isAppleMapsConfigured() ? "apple" : "leaflet",
  );
  const useFallback = useCallback(() => setProvider("leaflet"), []);

  if (provider === "apple") {
    return <AppleRestroomMap {...props} onUnavailable={useFallback}/>;
  }
  return <LeafletRestroomMap {...props}/>;
}
