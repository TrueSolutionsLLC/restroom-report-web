"use client";

import L from "leaflet";
import { useCallback, useEffect, useRef } from "react";
import type { LivePlace } from "../lib/firestore";
import type { RestroomMapProps } from "./mapTypes";
import "leaflet/dist/leaflet.css";

// Match the shared score recommendation tiers; category is shown separately.
const colors: Record<string, string> = {
  good: "#30b256",
  fair: "#d9931f",
  poor: "#d94b59",
  unrated: "#f08a32",
};

const normalizeLongitude = (longitude: number) => ((longitude + 180) % 360 + 360) % 360 - 180;

function markerIcon(place: LivePlace, active: boolean) {
  const score = place.score?.toFixed(1) ?? "?";
  return L.divIcon({
    className: "rr-marker-wrap",
    html: `<span class="rr-marker ${active ? "active" : ""}" style="--marker:${colors[place.color] ?? colors.unrated}"><b>${score}</b></span>`,
    iconSize: active ? [48, 56] : [40, 48],
    iconAnchor: active ? [24, 54] : [20, 46],
  });
}

export default function LeafletRestroomMap({ places, selected, onSelect, userCoords, focus, onViewportChange, viewportRequest, localSearchRequest, mapStyle }: RestroomMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const placeMarkersRef = useRef(new Map<string, L.Marker>());
  const placesByIdRef = useRef(new Map<string, LivePlace>());
  const onSelectRef = useRef(onSelect);
  const onViewportChangeRef = useRef(onViewportChange);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onViewportChangeRef.current = onViewportChange; }, [onViewportChange]);

  const reportViewport = useCallback((map: L.Map) => {
    const center = map.getCenter();
    const padded = map.getBounds().pad(.3);
    const longitudeWidth = padded.getEast() - padded.getWest();
    onViewportChangeRef.current({
      center: { latitude: center.lat, longitude: center.lng },
      bounds: {
        south: Math.max(-90, padded.getSouth()),
        north: Math.min(90, padded.getNorth()),
        west: longitudeWidth >= 359 ? -180 : normalizeLongitude(padded.getWest()),
        east: longitudeWidth >= 359 ? 180 : normalizeLongitude(padded.getEast()),
      },
      zoom: map.getZoom(),
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    // Create and destroy the same instance in this effect. React Leaflet 5's
    // MapContainer retains a removed map/context after Strict Mode replay.
    const map = L.map(containerRef.current, { minZoom: 3, maxZoom: 19, zoomControl: false })
      .setView([38.4, -96.5], 4);
    mapRef.current = map;
    const markers = new Map<string, L.Marker>();
    placeMarkersRef.current = markers;
    const moved = () => reportViewport(map);
    map.on("moveend", moved);
    reportViewport(map);

    return () => {
      map.off("moveend", moved);
      map.remove();
      markers.clear();
      if (mapRef.current === map) {
        mapRef.current = null;
        placeMarkersRef.current = new Map();
        placesByIdRef.current = new Map();
      }
    };
  }, [reportViewport]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = mapStyle === "satellite"
      ? L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: "Tiles &copy; Esri" })
      : L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' });
    layer.addTo(map);
    return () => { layer.removeFrom(map); };
  }, [mapStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    placesByIdRef.current = new Map(places.map(place => [place.id, place]));
    const markers = placeMarkersRef.current;
    for (const [placeId, marker] of markers) {
      if (!placesByIdRef.current.has(placeId)) {
        marker.off("click");
        marker.removeFrom(map);
        markers.delete(placeId);
      }
    }
    for (const place of places) {
      let marker = markers.get(place.id);
      const icon = markerIcon(place, selected?.id === place.id);
      if (!marker) {
        marker = L.marker([place.latitude, place.longitude], { icon });
        marker.on("click", () => {
          const currentPlace = placesByIdRef.current.get(place.id);
          if (currentPlace) onSelectRef.current(currentPlace);
        });
        marker.addTo(map);
        markers.set(place.id, marker);
      } else {
        marker.setLatLng([place.latitude, place.longitude]).setIcon(icon);
      }
      const element = marker.getElement();
      if (element) {
        const label = `${place.name} — ${place.score === null ? "Unrated" : `${place.score.toFixed(1)}/10`}`;
        element.title = label;
        element.setAttribute("aria-label", label);
      }
    }
  }, [places, selected?.id]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userCoords) return;
    const marker = L.marker([userCoords.latitude, userCoords.longitude], {
      icon: L.divIcon({
        className: "user-marker-wrap",
        html: '<span class="user-marker"><i></i></span>',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      }),
    }).addTo(map);
    return () => { marker.removeFrom(map); };
  }, [userCoords]);

  useEffect(() => {
    const map = mapRef.current;
    const target = focus ?? userCoords;
    if (map && target) map.flyTo([target.latitude, target.longitude], Math.max(map.getZoom(), 13), { duration: .75 });
  }, [userCoords, focus]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && viewportRequest > 0) reportViewport(map);
  }, [reportViewport, viewportRequest]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || localSearchRequest < 1) return;
    map.flyTo(map.getCenter(), Math.max(map.getZoom(), 11), { duration: .6 });
    const fallback = window.setTimeout(() => reportViewport(map), 650);
    return () => window.clearTimeout(fallback);
  }, [localSearchRequest, reportViewport]);

  return <div className="real-map leaflet-map" ref={containerRef} aria-label="Interactive restroom map"/>;
}
