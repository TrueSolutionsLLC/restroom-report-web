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

export type RestroomMapProps = {
  places: LivePlace[];
  selected: LivePlace | null;
  onSelect: (place: LivePlace) => void;
  userCoords: Coordinates | null;
  focus: Coordinates | null;
  onViewportChange: (viewport: MapViewport) => void;
  viewportRequest: number;
};
