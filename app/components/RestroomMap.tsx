"use client";

import L from "leaflet";
import { useCallback, useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { LivePlace } from "../lib/firestore";
import "leaflet/dist/leaflet.css";

type Coordinates = { latitude: number; longitude: number };
type MapViewport = {
  center: Coordinates;
  bounds: { south: number; north: number; west: number; east: number };
  zoom: number;
};
const colors: Record<string, string> = { blue: "#0a84ff", orange: "#f08a32", teal: "#18a7a1", rose: "#ef5470" };

const normalizeLongitude = (longitude: number) => ((longitude + 180) % 360 + 360) % 360 - 180;

function Controller({ userCoords, focus, onViewportChange }: { userCoords: Coordinates | null; focus: Coordinates | null; onViewportChange: (viewport: MapViewport) => void }) {
  const map = useMap();
  const reportViewport = useCallback(() => {
    const center = map.getCenter();
    const padded = map.getBounds().pad(.3);
    const longitudeWidth = padded.getEast() - padded.getWest();
    onViewportChange({
      center: { latitude: center.lat, longitude: center.lng },
      bounds: {
        south: Math.max(-90, padded.getSouth()),
        north: Math.min(90, padded.getNorth()),
        west: longitudeWidth >= 359 ? -180 : normalizeLongitude(padded.getWest()),
        east: longitudeWidth >= 359 ? 180 : normalizeLongitude(padded.getEast()),
      },
      zoom: map.getZoom(),
    });
  }, [map, onViewportChange]);

  useEffect(() => {
    const target = focus ?? userCoords;
    if (target) map.flyTo([target.latitude, target.longitude], Math.max(map.getZoom(), 13), { duration: .75 });
  }, [map, userCoords, focus]);

  useEffect(() => { reportViewport(); }, [reportViewport]);
  useMapEvents({ moveend: reportViewport });
  return null;
}

function markerIcon(place: LivePlace, active: boolean) {
  const score = place.score === null ? "?" : String(place.score);
  return L.divIcon({
    className: "rr-marker-wrap",
    html: `<span class="rr-marker ${active ? "active" : ""}" style="--marker:${colors[place.color] ?? colors.blue}"><b>${score}</b></span>`,
    iconSize: active ? [48, 56] : [40, 48], iconAnchor: active ? [24, 54] : [20, 46],
  });
}

export default function RestroomMap({ places, selected, onSelect, userCoords, focus, onViewportChange }: {
  places: LivePlace[]; selected: LivePlace | null; onSelect: (place: LivePlace) => void;
  userCoords: Coordinates | null; focus: Coordinates | null; onViewportChange: (viewport: MapViewport) => void;
}) {
  const icons = useMemo(() => new Map(places.map(place => [place.id, markerIcon(place, selected?.id === place.id)])), [places, selected?.id]);
  return <MapContainer center={[38.4, -96.5]} zoom={4} minZoom={3} maxZoom={19} zoomControl={false} className="real-map">
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <Controller userCoords={userCoords} focus={focus} onViewportChange={onViewportChange} />
    {places.map(place => <Marker key={place.id} position={[place.latitude, place.longitude]} icon={icons.get(place.id)!}
      eventHandlers={{ click: () => onSelect(place) }} title={`${place.name} — ${place.score === null ? "Unrated" : `${place.score}/10`}`} />)}
    {userCoords && <Marker position={[userCoords.latitude, userCoords.longitude]} icon={L.divIcon({ className: "user-marker-wrap", html: '<span class="user-marker"><i></i></span>', iconSize: [32, 32], iconAnchor: [16, 16] })} />}
  </MapContainer>;
}
