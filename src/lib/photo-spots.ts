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

// Stock photos that fill each stop until the attendee adds their own or deletes them. Files live in public/stock
// (see public/stock/CREDITS.md); every image is a Wikimedia Commons photo under the license named here, so the
// viewer shows the credit. Deleting a stock photo is remembered per account (settings.hidden_stock_spots).
/** settings.hidden_stock_spots as a list of known spot ids; anything unreadable counts as nothing hidden. */
export function parseHiddenStock(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  try { const list = JSON.parse(value); return Array.isArray(list) ? list.filter((id): id is string => typeof id === "string" && photoSpotIds.has(id)) : []; }
  catch { return []; }
}

export type StockPhoto = { src: string; author: string; license: string; sourceUrl: string };
export const stockPhotos: Record<string, StockPhoto> = {
  "golden-gate-overlook": { src: "/stock/golden-gate-overlook.jpg", author: "Choinowski", license: "CC0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Golden_Gate_Bridge_in_2012_as_seen_from_Battery_Spencer.jpg" },
  "ferry-building": { src: "/stock/ferry-building.jpg", author: "Frank Schulenburg", license: "CC BY-SA 4.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Ferry_Building_clock_tower_as_seen_from_the_North.jpg" },
  "north-beach": { src: "/stock/north-beach.jpg", author: "Daderot", license: "CC0", sourceUrl: "https://commons.wikimedia.org/wiki/File:Saints_Peter_and_Paul_Catholic_Church_from_Washington_Square_-_San_Francisco,_CA_-_DSC02640.jpg" },
  "mission-district": { src: "/stock/mission-district.jpg", author: "Tony Webster", license: "CC BY 2.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:San_Francisco_Skyline_-_Mission_Dolores_Park.jpg" },
  "half-moon-bay": { src: "/stock/half-moon-bay.jpg", author: "Dennis Yang", license: "CC BY 2.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:2006_Pillar_Point_Bluff_Haze_and_Sunrise.jpg" },
  "wildcard": { src: "/stock/wildcard.jpg", author: "Bernard Spragg", license: "Public domain", sourceUrl: "https://commons.wikimedia.org/wiki/File:Powell_St_cable_cars._(52539164840).jpg" }
};
