"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { LivePlace } from "../lib/firestore";
import "leaflet/dist/leaflet.css";

const colors: Record<string, string> = { blue: "#0a84ff", orange: "#f08a32", teal: "#18a7a1", rose: "#ef5470" };

function MapController({ userCoords }: { userCoords: { latitude: number; longitude: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (userCoords) map.flyTo([userCoords.latitude, userCoords.longitude], Math.max(map.getZoom(), 13), { duration: .8 });
  }, [map, userCoords]);
  return null;
}

export default function RestroomMap({ places, selected, onSelect, userCoords }: {
  places: LivePlace[];
  selected: LivePlace;
  onSelect: (place: LivePlace) => void;
  userCoords: { latitude: number; longitude: number } | null;
}) {
  return <MapContainer center={[38.627, -90.1994]} zoom={5} minZoom={3} maxZoom={19} zoomControl={false} className="real-map">
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <MapController userCoords={userCoords} />
    {places.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).map(place => {
      const active = selected.id === place.id;
      return <CircleMarker key={place.id} center={[place.latitude, place.longitude]} radius={active ? 14 : 10}
        pathOptions={{ color: "white", weight: active ? 4 : 3, fillColor: colors[place.color] ?? colors.blue, fillOpacity: 1 }}
        eventHandlers={{ click: () => onSelect(place) }}>
        <Tooltip direction="top" offset={[0, -10]} opacity={1}><strong>{place.name}</strong><br />{place.score === null ? "Unrated" : `${place.score}/10`}</Tooltip>
      </CircleMarker>;
    })}
    {userCoords && <CircleMarker center={[userCoords.latitude, userCoords.longitude]} radius={7} pathOptions={{ color: "white", weight: 4, fillColor: "#0a84ff", fillOpacity: 1 }} />}
  </MapContainer>;
}
