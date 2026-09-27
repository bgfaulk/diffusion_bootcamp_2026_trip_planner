// The Photo Route's fixed stops: [id, title, hint]. Shared with the upload route so it only stores known spots.
export const photoSpots: [string, string, string][] = [
  ["golden-gate-overlook", "Golden Gate Overlook", "Langdon Ct, San Francisco"],
  ["ferry-building", "Ferry Building", "1 Ferry Building, San Francisco"],
  ["north-beach", "North Beach", "Washington Square / Columbus Ave"],
  ["mission-district", "Mission District", "Dolores Park anchor"],
  ["half-moon-bay", "Half Moon Bay", "Main Street / Coastside"],
  ["wildcard", "Favorite surprise", "Something worth remembering"]
];

export const photoSpotIds = new Set(photoSpots.map(([id]) => id));
