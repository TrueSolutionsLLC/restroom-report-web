"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Annotation,
  MapAnnotationSelectionEvent,
  MapKit,
  MarkerAnnotation,
} from "@apple/mapkit-loader";
import type { LivePlace } from "../lib/firestore";
import { loadAppleMaps } from "../lib/mapkit";
import type { MapViewport, RestroomMapProps } from "./mapTypes";

type AppleMap = InstanceType<MapKit["Map"]>;

const colors: Record<string, string> = {
  blue: "#0a84ff",
  orange: "#f08a32",
  teal: "#18a7a1",
  rose: "#ef5470",
};

const normalizeLongitude = (longitude: number) => ((longitude + 180) % 360 + 360) % 360 - 180;

function viewportForMap(map: AppleMap): MapViewport {
  const { center, span } = map.region;
  const latitudeDelta = Math.min(180, Math.max(.0001, span.latitudeDelta * 1.3));
  const longitudeDelta = Math.min(360, Math.max(.0001, span.longitudeDelta * 1.3));
  const fullWorld = longitudeDelta >= 359;

  return {
    center: { latitude: center.latitude, longitude: center.longitude },
    bounds: {
      south: Math.max(-90, center.latitude - latitudeDelta / 2),
      north: Math.min(90, center.latitude + latitudeDelta / 2),
      west: fullWorld ? -180 : normalizeLongitude(center.longitude - longitudeDelta / 2),
      east: fullWorld ? 180 : normalizeLongitude(center.longitude + longitudeDelta / 2),
    },
    zoom: Math.max(1, Math.min(20, Math.round(Math.log2(360 / Math.max(span.longitudeDelta, .00001))))),
  };
}

function userLocationAnnotation(mapkit: MapKit, latitude: number, longitude: number) {
  return new mapkit.Annotation(
    { latitude, longitude },
    () => {
      const element = document.createElement("span");
      element.className = "apple-user-location";
      element.innerHTML = "<i></i>";
      return element;
    },
    {
      accessibilityLabel: "Your location",
      enabled: false,
      displayPriority: mapkit.AnnotationDisplayPriority.Required,
      collisionMode: mapkit.AnnotationCollisionMode.None,
    },
  );
}

export default function AppleRestroomMap({
  places,
  selected,
  onSelect,
  userCoords,
  focus,
  onViewportChange,
  onUnavailable,
}: RestroomMapProps & { onUnavailable: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AppleMap | null>(null);
  const mapKitRef = useRef<MapKit | null>(null);
  const placeAnnotationsRef = useRef<MarkerAnnotation[]>([]);
  const placeByAnnotationRef = useRef(new Map<Annotation, LivePlace>());
  const userAnnotationRef = useRef<Annotation | null>(null);
  const onSelectRef = useRef(onSelect);
  const onViewportChangeRef = useRef(onViewportChange);
  const unavailableRef = useRef(onUnavailable);
  const [ready, setReady] = useState(false);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onViewportChangeRef.current = onViewportChange; }, [onViewportChange]);
  useEffect(() => { unavailableRef.current = onUnavailable; }, [onUnavailable]);

  const reportViewport = useCallback(() => {
    if (mapRef.current) onViewportChangeRef.current(viewportForMap(mapRef.current));
  }, []);

  useEffect(() => {
    let disposed = false;
    let map: AppleMap | null = null;

    const start = async () => {
      try {
        const mapkit = await loadAppleMaps();
        if (disposed || !containerRef.current) return;
        mapKitRef.current = mapkit;
        const mobile = window.matchMedia("(max-width: 800px)").matches;
        map = new mapkit.Map(containerRef.current, {
          region: {
            center: { latitude: 38.4, longitude: -96.5 },
            span: { latitudeDelta: 45, longitudeDelta: 90 },
          },
          isScrollEnabled: true,
          isZoomEnabled: true,
          isRotationEnabled: true,
          showsZoomControl: false,
          showsMapTypeControl: false,
          showsUserLocationControl: false,
          showsPointsOfInterest: true,
          showsScale: mapkit.FeatureVisibility.Adaptive,
          showsCompass: mapkit.FeatureVisibility.Adaptive,
          tintColor: "#0a84ff",
          padding: mobile
            ? { top: 166, right: 68, bottom: 94, left: 12 }
            : { top: 150, right: 86, bottom: 98, left: 34 },
        });
        mapRef.current = map;

        const regionChanged = () => reportViewport();
        const annotationSelected = (event: Event) => {
          const annotation = (event as MapAnnotationSelectionEvent).annotation;
          const place = placeByAnnotationRef.current.get(annotation);
          if (place) onSelectRef.current(place);
        };
        map.addEventListener("region-change-end", regionChanged);
        map.addEventListener("select", annotationSelected);
        setReady(true);
        window.requestAnimationFrame(reportViewport);

        return () => {
          map?.removeEventListener("region-change-end", regionChanged);
          map?.removeEventListener("select", annotationSelected);
        };
      } catch (error) {
        console.warn("Apple Maps could not start; using the map fallback.", error);
        if (!disposed) unavailableRef.current();
      }
      return undefined;
    };

    let removeListeners: (() => void) | undefined;
    start().then(cleanup => { removeListeners = cleanup; });
    return () => {
      disposed = true;
      removeListeners?.();
      mapRef.current = null;
      mapKitRef.current = null;
      map?.destroy();
    };
  }, [reportViewport]);

  useEffect(() => {
    const map = mapRef.current;
    const mapkit = mapKitRef.current;
    if (!map || !mapkit || !ready) return;

    if (placeAnnotationsRef.current.length) map.removeAnnotations(placeAnnotationsRef.current);
    placeAnnotationsRef.current = [];
    placeByAnnotationRef.current.clear();

    const annotations = places.map(place => {
      const active = selected?.id === place.id;
      const annotation = new mapkit.MarkerAnnotation(
        { latitude: place.latitude, longitude: place.longitude },
        {
          title: place.name,
          subtitle: place.address || place.type,
          accessibilityLabel: `${place.name}, ${place.score === null ? "unrated" : `${place.score} out of 10`}`,
          color: colors[place.color] ?? colors.blue,
          glyphColor: "#ffffff",
          glyphText: place.score === null ? "?" : String(place.score),
          titleVisibility: mapkit.FeatureVisibility.Hidden,
          subtitleVisibility: mapkit.FeatureVisibility.Hidden,
          calloutEnabled: false,
          animates: true,
          selected: active,
          displayPriority: active
            ? mapkit.AnnotationDisplayPriority.Required
            : mapkit.AnnotationDisplayPriority.High,
          collisionMode: mapkit.AnnotationCollisionMode.Circle,
          data: { placeId: place.id },
        },
      );
      placeByAnnotationRef.current.set(annotation, place);
      return annotation;
    });

    placeAnnotationsRef.current = annotations;
    if (annotations.length) map.addAnnotations(annotations);
    map.selectedAnnotation = annotations.find((_, index) => places[index]?.id === selected?.id) ?? null;
  }, [places, ready, selected?.id]);

  useEffect(() => {
    const map = mapRef.current;
    const mapkit = mapKitRef.current;
    if (!map || !mapkit || !ready) return;
    if (userAnnotationRef.current) map.removeAnnotation(userAnnotationRef.current);
    userAnnotationRef.current = null;
    if (userCoords) {
      const annotation = userLocationAnnotation(mapkit, userCoords.latitude, userCoords.longitude);
      userAnnotationRef.current = annotation;
      map.addAnnotation(annotation);
    }
  }, [ready, userCoords]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const target = focus ?? userCoords;
    if (!target) return;
    const currentSpan = map.region.span;
    map.setRegionAnimated({
      center: target,
      span: {
        latitudeDelta: Math.min(currentSpan.latitudeDelta, .035),
        longitudeDelta: Math.min(currentSpan.longitudeDelta, .035),
      },
    }, true);
  }, [focus, ready, userCoords]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const mobile = window.matchMedia("(max-width: 800px)").matches;
    map.padding = mobile
      ? { top: 166, right: 68, bottom: selected ? 304 : 94, left: 12 }
      : { top: 150, right: 86, bottom: 98, left: selected ? 434 : 34 };
  }, [ready, selected]);

  return <div className="real-map apple-map" ref={containerRef} aria-label="Interactive Apple map">
    {!ready && <div className="apple-map-loading"><span className="apple-map-spinner"/>Loading Apple Maps…</div>}
  </div>;
}
