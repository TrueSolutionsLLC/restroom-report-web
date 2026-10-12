import { placeCategoryPath } from "../lib/locationMarkers";

export default function PlaceCategoryIcon({ type }: { type: string }) {
  return <svg className="place-category-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d={placeCategoryPath(type)}/></svg>;
}
