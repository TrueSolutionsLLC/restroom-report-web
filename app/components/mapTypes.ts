import type { LivePlace } from "../lib/firestore";

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type MapViewport = {
  center: Coordinates;
  bounds: {
    south: number;
    north: number;
    west: number;
    east: number;
  };
  zoom: number;
};

export type MapStyle = "standard" | "satellite";

export type RestroomMapProps = {
  places: LivePlace[];
  selected: LivePlace | null;
  onSelect: (place: LivePlace) => void;
  userCoords: Coordinates | null;
  focus: Coordinates | null;
  onViewportChange: (viewport: MapViewport) => void;
  viewportRequest: number;
  localSearchRequest: number;
  mapStyle: MapStyle;
};

export function viewportSpanDegrees(viewport: MapViewport) {
  const { south, north, west, east } = viewport.bounds;
  const latitudeDelta = north - south;
  const longitudeDelta = west <= east ? east - west : (180 - west) + (east + 180);
  return { latitudeDelta, longitudeDelta };
}

// Apple Maps POI search only returns a complete result at neighborhood/city
// scale. Beyond this threshold the map is too wide to search meaningfully,
// so the UI offers to zoom in instead of silently repeating an empty search.
export function isWideViewport(viewport: MapViewport, threshold = 4) {
  const { latitudeDelta, longitudeDelta } = viewportSpanDegrees(viewport);
  return latitudeDelta > threshold || longitudeDelta > threshold;
}
