import type { LivePlace } from "./firestore";
import { cleanScoreBadge, isValidCleanScore } from "./reviewContract";

// A single category vocabulary for cards and both map providers. All SVG paths
// are owned by the app; place names and other remote strings never enter HTML.
const categoryPaths: Record<string, string> = {
  "Gas station": "M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10M14 8h2a2 2 0 0 1 2 2v7a1.5 1.5 0 0 0 3 0V9l-3-3",
  "Truck stop": "M2 6h12v12H2ZM14 10h4l4 4v4h-8M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0M20 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  "Travel center": "M3 21V5l9-3v19M12 8h9v13M2 21h20M6 7h2M6 11h2M6 15h2M16 12h2M16 16h2",
  "Rest area": "M12 3v18M4 5h13l4 4-4 4H4ZM9 21h6",
  "Fast food": "M5 8h14l-2 13H7ZM8 8V6a4 4 0 0 1 8 0v2M9 13h6",
  "Coffee shop": "M3 8h13v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4ZM16 9h2a3 3 0 0 1 0 6h-2M5 3v2M9 2v3M13 3v2M2 22h17",
  "Grocery store": "M2 3h3l3 13h11l3-10H6M10 21a1 1 0 1 1-2 0 1 1 0 0 1 2 0M20 21a1 1 0 1 1-2 0 1 1 0 0 1 2 0",
  "Big box store": "m3 7 9-5 9 5v10l-9 5-9-5ZM3 7l9 5 9-5M12 12v10M7 4l10 6",
  "Mall / Shopping center": "M4 7h16l1 14H3ZM8 8V6a4 4 0 0 1 8 0v2",
  "Park": "m12 2 6 8h-3l5 7H4l5-7H6ZM12 17v5M9 22h6",
  "Library": "M3 3h4v18H3ZM9 3h4v18H9ZM15 5l4-1 4 16-4 1ZM3 7h4M9 7h4M3 17h4M9 17h4",
  "Visitor center": "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 11v6M12 7v.01",
  "Airport": "m22 3-8 10 2 7-2 2-4-7-5 3-2-2 3-5-4-3 2-2 7 2 9-7Z",
  "Transit station": "M5 5a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v12H5ZM5 10h14M12 2v8M8 14h.01M16 14h.01M8 17l-3 5M16 17l3 5M7 20h10",
  "Campground": "m3 21 9-18 9 18ZM8 21l4-8 4 8M2 21h20",
  "Recreation center": "M2 5h20v14H2ZM12 5v14M2 9h4v6H2M22 9h-4v6h4M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  "Gym / Fitness center": "M6 9h12M6 15h12M3 7h3v10H3ZM18 7h3v10h-3ZM1 10v4M23 10v4",
  Other: "M19 9c0 5-7 13-7 13S5 14 5 9a7 7 0 1 1 14 0ZM15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
};

export const placeCategoryPath = (type: string) => Object.hasOwn(categoryPaths, type) ? categoryPaths[type] : categoryPaths.Other;
export type PlaceMarkerState = "discovered" | "unrated" | "rated" | "unavailable";
export function placeReportState(place: Pick<LivePlace, "source" | "reports" | "score">): PlaceMarkerState {
  if (place.source === "appleMaps") return "discovered";
  if (place.reports <= 0) return "unrated";
  return isValidCleanScore(place.score) ? "rated" : "unavailable";
}
export function placeReportLabel(place: LivePlace) {
  const state = placeReportState(place);
  if (state === "discovered") return "Not added yet";
  if (state === "unrated") return "No ratings yet";
  if (state === "unavailable") return "CleanScore unavailable";
  return cleanScoreBadge(place.score).label;
}
export function placeReportAction(place: LivePlace) {
  const state = placeReportState(place);
  return state === "discovered" ? "Add this stop" : state === "unrated" ? "Be the first to rate" : "Rate restroom";
}
export function placeMarkerLabel(place: LivePlace, active: boolean) {
  const state = placeReportState(place);
  const status = state === "rated" ? `CleanScore ${place.score!.toFixed(1)} out of 10, ${place.reports} rating${place.reports === 1 ? "" : "s"}` : placeReportLabel(place);
  return `${place.name}, ${place.type}, ${status}${active ? ", selected" : ""}`;
}
export function placeMarkerClass(place: LivePlace, active: boolean) {
  const state = placeReportState(place);
  const tone = state === "rated" ? cleanScoreBadge(place.score).tone : "unrated";
  return `place-marker marker-status-${state} marker-tone-${tone}${active ? " active" : ""}`;
}

const pinContour = "M15 5H33Q43 5 43 15V34Q43 43 34 43H30L24 52L18 43H14Q5 43 5 34V15Q5 5 15 5Z";
export function placeMarkerMarkup(place: LivePlace) {
  const content = placeReportState(place) === "rated"
    ? `<text class="place-marker-score" x="24" y="25" dominant-baseline="central" text-anchor="middle">${place.score!.toFixed(1)}</text>`
    : `<path class="place-marker-glyph" d="${placeCategoryPath(place.type)}" transform="translate(13 13) scale(.92)"/>`;
  return `<svg class="place-marker-art" viewBox="0 0 48 58" aria-hidden="true"><path class="place-marker-halo" d="${pinContour}"/><path class="place-marker-body" d="${pinContour}"/>${content}</svg>`;
}
