# Location markers

The website uses the same location states as the approved phone design:

- Discovered Apple Maps places: outlined category marker, “Not added yet”, “Restroom details haven’t been reported here.” and “Add this stop”. The existing proximity-verified first-report flow adds the stop.
- Added stops without ratings: blue category marker, “No ratings yet” and “Be the first to rate”.
- Rated stops: numeric CleanScore with the existing recommendation thresholds. Zero remains a valid score. Missing aggregates with existing reports say “CleanScore unavailable”.

MapKit and Leaflet share marker geometry, categories, status logic and accessible labels. Selection adds a jade halo while preserving status color. Both Enter and Space activate custom markers. Remote names/categories are never interpolated into marker HTML.

Station reading prefers the supported native `locationType`, then a recognized legacy `stationType`. All 18 native categories have matching labels and glyphs; unknown categories use Other. Travel centers remain included in the Truck Stops filter while showing their actual category. Submission payloads, counts, score calculations and account synchronization are unchanged.

## Validation

Node 22.23.3: 87 tests passed, including score/category mapping and safe marker rendering. Both real map components were checked at 1440, 390 and 320 pixels in light and dark modes: four fixture states rendered, no horizontal overflow and no page errors. Mobile click, Enter and Space selection passed for both providers, including selected accessibility state and a zero score. Fixtures used no production data writes and were removed before publishing.

Local MapKit annotations rendered and interacted correctly, but its basemap showed a grid under the localhost origin. The production domain's Apple basemap must be verified after rollout. Screenshots and QA scripts are local artifacts rather than shipped routes.
