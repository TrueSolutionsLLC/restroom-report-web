"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Annotation,
  MapAnnotationSelectionEvent,
  MapKit,
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

function pinLabel(place: LivePlace) {
  return place.score === null ? "?" : String(place.score);
}

function updatePinElement(element: HTMLElement, place: LivePlace, active: boolean) {
  element.className = `apple-restroom-pin${active ? " active" : ""}`;
  element.style.setProperty("--pin-color", colors[place.color] ?? colors.blue);
  element.setAttribute("aria-label", `${place.name}, ${place.score === null ? "unrated" : `${place.score} out of 10`}`);
  const label = element.querySelector<HTMLElement>(".apple-restroom-pin-label");
  if (label) label.textContent = pinLabel(place);
}

function restroomPinElement(place: LivePlace, selectPlaceById: (placeId: string) => void) {
  const element = document.createElement("button");
  element.type = "button";
  element.innerHTML = '<span class="apple-restroom-pin-label"></span>';
  updatePinElement(element, place, false);

  let start: { x: number; y: number; pointerId: number } | null = null;
  element.addEventListener("pointerdown", event => {
    start = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  });
  element.addEventListener("pointercancel", () => { start = null; });
  element.addEventListener("pointerup", event => {
    if (!start || start.pointerId !== event.pointerId) return;
    const movement = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    start = null;
    // Preserve map panning while making an intentional short tap deterministic.
    if (movement > 10) return;
    event.preventDefault();
    event.stopPropagation();
    selectPlaceById(place.id);
  });
  element.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectPlaceById(place.id);
  });
  return element;
}

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

const viewportIdentity = (viewport: MapViewport) => [
  viewport.bounds.south,
  viewport.bounds.north,
  viewport.bounds.west,
  viewport.bounds.east,
].map(value => value.toFixed(5)).join(":");

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
  viewportRequest,
  onUnavailable,
}: RestroomMapProps & { onUnavailable: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AppleMap | null>(null);
  const mapKitRef = useRef<MapKit | null>(null);
  const placeAnnotationsRef = useRef(new Map<string, Annotation>());
  const placesByIdRef = useRef(new Map<string, LivePlace>());
  const selectedPlaceIdRef = useRef<string | null>(selected?.id ?? null);
  const userAnnotationRef = useRef<Annotation | null>(null);
  const onSelectRef = useRef(onSelect);
  const onViewportChangeRef = useRef(onViewportChange);
  const unavailableRef = useRef(onUnavailable);
  const viewportReportTimerRef = useRef<number | null>(null);
  const viewportPollRef = useRef<number | null>(null);
  const lastReportedViewportRef = useRef("");
  const lastSelectionRef = useRef({ placeId: "", time: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onViewportChangeRef.current = onViewportChange; }, [onViewportChange]);
  useEffect(() => { unavailableRef.current = onUnavailable; }, [onUnavailable]);

  const selectPlaceById = useCallback((placeId: string) => {
    const place = placesByIdRef.current.get(placeId);
    if (!place) return;
    const now = performance.now();
    if (lastSelectionRef.current.placeId === placeId && now - lastSelectionRef.current.time < 100) return;
    lastSelectionRef.current = { placeId, time: now };
    onSelectRef.current(place);
  }, []);

  const reportViewport = useCallback((force = false) => {
    if (!mapRef.current) return;
    const viewport = viewportForMap(mapRef.current);
    const identity = viewportIdentity(viewport);
    if (!force && identity === lastReportedViewportRef.current) return;
    lastReportedViewportRef.current = identity;
    onViewportChangeRef.current(viewport);
  }, []);

  const scheduleViewportReport = useCallback((delay = 180) => {
    if (viewportReportTimerRef.current !== null) window.clearTimeout(viewportReportTimerRef.current);
    viewportReportTimerRef.current = window.setTimeout(() => {
      viewportReportTimerRef.current = null;
      reportViewport();
    }, delay);
  }, [reportViewport]);

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

        const regionChanged = () => scheduleViewportReport(0);
        const annotationSelected = (event: Event) => {
          const annotation = (event as MapAnnotationSelectionEvent).annotation;
          const placeId = String((annotation.data as { placeId?: unknown } | undefined)?.placeId ?? "");
          if (placeId) selectPlaceById(placeId);
        };
        map.addEventListener("region-change-end", regionChanged);
        map.addEventListener("select", annotationSelected);
        const mapElement = containerRef.current;
        const interactionEnded = () => scheduleViewportReport(40);
        mapElement.addEventListener("pointerup", interactionEnded, { passive: true });
        mapElement.addEventListener("touchend", interactionEnded, { passive: true });
        mapElement.addEventListener("wheel", interactionEnded, { passive: true });
        // MapKit's region event is the primary signal. The small watchdog catches
        // WebKit gesture/zoom paths that don't consistently emit a final event.
        viewportPollRef.current = window.setInterval(() => reportViewport(), 180);
        setReady(true);
        window.requestAnimationFrame(() => reportViewport(true));

        return () => {
          map?.removeEventListener("region-change-end", regionChanged);
          map?.removeEventListener("select", annotationSelected);
          mapElement.removeEventListener("pointerup", interactionEnded);
          mapElement.removeEventListener("touchend", interactionEnded);
          mapElement.removeEventListener("wheel", interactionEnded);
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
      if (viewportReportTimerRef.current !== null) window.clearTimeout(viewportReportTimerRef.current);
      if (viewportPollRef.current !== null) window.clearInterval(viewportPollRef.current);
      mapRef.current = null;
      mapKitRef.current = null;
      map?.destroy();
    };
  }, [reportViewport, scheduleViewportReport, selectPlaceById]);

  useEffect(() => {
    const map = mapRef.current;
    const mapkit = mapKitRef.current;
    if (!map || !mapkit || !ready) return;

    const currentIds = new Set(places.map(place => place.id));
    const removed: Annotation[] = [];
    placeAnnotationsRef.current.forEach((annotation, placeId) => {
      if (!currentIds.has(placeId)) {
        removed.push(annotation);
        placeAnnotationsRef.current.delete(placeId);
      }
    });
    if (removed.length) map.removeAnnotations(removed);

    placesByIdRef.current = new Map(places.map(place => [place.id, place]));
    const added: Annotation[] = [];
    places.forEach(place => {
      const active = selectedPlaceIdRef.current === place.id;
      let annotation = placeAnnotationsRef.current.get(place.id);
      if (!annotation) {
        annotation = new mapkit.Annotation(
          { latitude: place.latitude, longitude: place.longitude },
          () => restroomPinElement(place, selectPlaceById),
          {
            calloutEnabled: false,
            enabled: true,
            animates: false,
            size: { width: 46, height: 54 },
            collisionMode: mapkit.AnnotationCollisionMode.Circle,
            data: { placeId: place.id },
          },
        );
        annotation.addEventListener("select", () => selectPlaceById(place.id));
        placeAnnotationsRef.current.set(place.id, annotation);
        added.push(annotation);
      }

      // Keep annotation identity stable. Removing and recreating the selected
      // marker makes MapKit deselect it and was swallowing pin taps.
      annotation.coordinate = { latitude: place.latitude, longitude: place.longitude };
      annotation.title = place.name;
      annotation.subtitle = place.address || place.type;
      annotation.accessibilityLabel = `${place.name}, ${place.score === null ? "unrated" : `${place.score} out of 10`}`;
      annotation.data = { placeId: place.id };
      annotation.enabled = true;
      updatePinElement(annotation.element, place, active);
      annotation.displayPriority = active
        ? mapkit.AnnotationDisplayPriority.Required
        : mapkit.AnnotationDisplayPriority.High;
    });
    if (added.length) map.addAnnotations(added);
  }, [places, ready, selectPlaceById]);

  useEffect(() => {
    if (!ready || viewportRequest < 1) return;
    // The parent increments this value for an explicit Search this area action.
    // Read the MapKit region now instead of trusting a possibly stale event.
    reportViewport(true);
  }, [ready, reportViewport, viewportRequest]);

  useEffect(() => {
    const map = mapRef.current;
    const mapkit = mapKitRef.current;
    if (!map || !mapkit || !ready) return;
    const previousId = selectedPlaceIdRef.current;
    selectedPlaceIdRef.current = selected?.id ?? null;
    if (previousId) {
      const previous = placeAnnotationsRef.current.get(previousId);
      if (previous) {
        previous.displayPriority = mapkit.AnnotationDisplayPriority.High;
        const previousPlace = placesByIdRef.current.get(previousId);
        if (previousPlace) updatePinElement(previous.element, previousPlace, false);
      }
    }
    const annotation = selected?.id ? placeAnnotationsRef.current.get(selected.id) ?? null : null;
    if (annotation) {
      annotation.displayPriority = mapkit.AnnotationDisplayPriority.Required;
      updatePinElement(annotation.element, selected!, true);
    }
    if (map.selectedAnnotation !== annotation) map.selectedAnnotation = annotation;
  }, [ready, selected]);

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
