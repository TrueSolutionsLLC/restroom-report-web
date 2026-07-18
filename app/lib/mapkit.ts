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
