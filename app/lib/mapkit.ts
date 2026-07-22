import { load, type MapKit } from "@apple/mapkit-loader";

export type AppleMapsCoordinate = {
  latitude: number;
  longitude: number;
};

export type AppleMapsPlaceResult = AppleMapsCoordinate & {
  label: string;
  formattedAddress: string;
  city: string;
  state: string;
};

export type AppleMapsViewport = {
  center: AppleMapsCoordinate;
  bounds: { south: number; north: number; west: number; east: number };
};

export type AppleMapsPoiResult = AppleMapsPlaceResult & {
  id: string;
  type: "Gas station" | "Truck stop" | "Rest area" | "Fast food";
};

const token = (process.env.NEXT_PUBLIC_MAPKIT_TOKEN ?? "").trim();
let mapKitPromise: Promise<MapKit> | null = null;

export const isAppleMapsConfigured = () => token.length > 0;

export function loadAppleMaps() {
  if (!token) return Promise.reject(new Error("Apple Maps is not configured."));
  if (!mapKitPromise) {
    mapKitPromise = load({
      token,
      language: typeof navigator === "undefined" ? "en-US" : navigator.language,
      libraries: ["map", "annotations", "services"],
      version: "6",
    }).catch(error => {
      mapKitPromise = null;
      throw error;
    });
  }
  return mapKitPromise;
}

const firstPlace = (places: Awaited<ReturnType<InstanceType<MapKit["Search"]>["search"]>>["places"]): AppleMapsPlaceResult => {
  const place = places[0];
  const coordinate = place?.coordinate;
  if (!place || !coordinate) throw new Error("Apple Maps did not find that location.");
  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    label: place.name ?? place.formattedAddress ?? "this location",
    formattedAddress: place.formattedAddress ?? "",
    city: place.locality ?? "",
    state: place.administrativeAreaCode ?? place.administrativeArea ?? "",
  };
};

export async function searchAppleMaps(query: string, near?: AppleMapsCoordinate | null) {
  const mapkit = await loadAppleMaps();
  const search = new mapkit.Search(near ? { coordinate: near } : undefined);
  const response = await search.search(query, near ? { coordinate: near } : undefined);
  return firstPlace(response.places);
}

export async function geocodeAppleMaps(address: string, near?: AppleMapsCoordinate | null) {
  const mapkit = await loadAppleMaps();
  const geocoder = new mapkit.Geocoder();
  const response = await geocoder.lookup(address, near ? { coordinate: near } : undefined);
  return firstPlace(response.results);
}

const longitudeSpan = (west: number, east: number) => (
  west <= east ? east - west : (180 - west) + (east + 180)
);

const resultType = (name: string, category: string | null): AppleMapsPoiResult["type"] => {
  const normalizedName = name.toLowerCase();
  if (/\b(truck stop|travel center|travelcentre|flying j|pilot travel|love'?s travel|ta travel)\b/.test(normalizedName)) return "Truck stop";
  if (/\b(rest area|rest stop|welcome center|welcome centre)\b/.test(normalizedName) || category === "Restroom" || category === "Parking") return "Rest area";
  if (["Restaurant", "Cafe", "Bakery", "FoodMarket"].includes(category ?? "")) return "Fast food";
  return "Gas station";
};

const longitudeInBounds = (longitude: number, viewport: AppleMapsViewport) => {
  const { west, east } = viewport.bounds;
  return west <= east ? longitude >= west && longitude <= east : longitude >= west || longitude <= east;
};

/**
 * Discovers real Apple Maps places in the visible rectangle. Firestore contains
 * Restroom Report's community data, but it is not a complete places directory;
 * this fills new map areas with candidates that can then receive a first report.
 */
export async function searchAppleMapsPois(viewport: AppleMapsViewport, signal?: AbortSignal): Promise<AppleMapsPoiResult[]> {
  const latitudeDelta = Math.max(0.002, viewport.bounds.north - viewport.bounds.south);
  const longitudeDelta = Math.max(0.002, longitudeSpan(viewport.bounds.west, viewport.bounds.east));

  // A POI request is useful at neighborhood/city scale. At continent scale it
  // would return an arbitrary partial result and make the marker count misleading.
  if (latitudeDelta > 4 || longitudeDelta > 4) return [];

  const mapkit = await loadAppleMaps();
  const categories = [
    mapkit.PointOfInterestCategory.GasStation,
    mapkit.PointOfInterestCategory.Restroom,
    mapkit.PointOfInterestCategory.Parking,
    mapkit.PointOfInterestCategory.Restaurant,
    mapkit.PointOfInterestCategory.Cafe,
    mapkit.PointOfInterestCategory.Bakery,
    mapkit.PointOfInterestCategory.FoodMarket,
  ];
  const region = {
    center: viewport.center,
    span: { latitudeDelta, longitudeDelta },
  };
  const pointOfInterestFilter = mapkit.PointOfInterestFilter.including(categories);
  const search = new mapkit.PointsOfInterestSearch({ region, pointOfInterestFilter });
  const response = await search.search({ region, pointOfInterestFilter, signal });

  return response.places.flatMap(place => {
    const coordinate = place.coordinate;
    if (!coordinate || !place.name) return [];
    if (coordinate.latitude < viewport.bounds.south || coordinate.latitude > viewport.bounds.north || !longitudeInBounds(coordinate.longitude, viewport)) return [];
    const type = resultType(place.name, place.pointOfInterestCategory);
    const fallbackId = `${place.name}:${coordinate.latitude.toFixed(6)}:${coordinate.longitude.toFixed(6)}`;
    return [{
      id: `apple:${place.id ?? fallbackId}`,
      name: place.name,
      type,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      label: place.name,
      formattedAddress: place.formattedAddress ?? "",
      city: place.locality ?? "",
      state: place.administrativeAreaCode ?? place.administrativeArea ?? "",
    }];
  });
}
