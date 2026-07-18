"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { LivePlace } from "../lib/firestore";
import "leaflet/dist/leaflet.css";

type Coordinates = { latitude: number; longitude: number };
const colors: Record<string, string> = { blue: "#0a84ff", orange: "#f08a32", teal: "#18a7a1", rose: "#ef5470" };

function Controller({ userCoords, focus, onCenterChange }: { userCoords: Coordinates | null; focus: Coordinates | null; onCenterChange: (coords: Coordinates) => void }) {
  const map = useMap();
  useEffect(() => {
    const target = focus ?? userCoords;
    if (target) map.flyTo([target.latitude, target.longitude], Math.max(map.getZoom(), 13), { duration: .75 });
  }, [map, userCoords, focus]);
  useMapEvents({ moveend: event => { const center = event.target.getCenter(); onCenterChange({ latitude: center.lat, longitude: center.lng }); } });
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

export default function RestroomMap({ places, selected, onSelect, userCoords, focus, onCenterChange }: {
  places: LivePlace[]; selected: LivePlace | null; onSelect: (place: LivePlace) => void;
  userCoords: Coordinates | null; focus: Coordinates | null; onCenterChange: (coords: Coordinates) => void;
}) {
  const icons = useMemo(() => new Map(places.map(place => [place.id, markerIcon(place, selected?.id === place.id)])), [places, selected?.id]);
  return <MapContainer center={[38.4, -96.5]} zoom={4} minZoom={3} maxZoom={19} zoomControl={false} className="real-map">
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <Controller userCoords={userCoords} focus={focus} onCenterChange={onCenterChange} />
    {places.map(place => <Marker key={place.id} position={[place.latitude, place.longitude]} icon={icons.get(place.id)!}
      eventHandlers={{ click: () => onSelect(place) }} title={`${place.name} — ${place.score === null ? "Unrated" : `${place.score}/10`}`} />)}
    {userCoords && <Marker position={[userCoords.latitude, userCoords.longitude]} icon={L.divIcon({ className: "user-marker-wrap", html: '<span class="user-marker"><i></i></span>', iconSize: [32, 32], iconAnchor: [16, 16] })} />}
  </MapContainer>;
}
