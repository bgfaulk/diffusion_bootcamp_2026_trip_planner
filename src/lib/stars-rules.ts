// The star rules, in one place, shared by the server (which awards them) and the client (which explains
// them). Numbers here are the whole scoring system; change them here and the guide, the explainer notice
// and the awards all follow.

export const STAR_PAGES = ["prechecks", "packing", "departure", "explore", "return"] as const;
export type StarPage = (typeof STAR_PAGES)[number];

// A checklist only unlocks with at least this many items, so "delete everything but one" earns nothing.
export const MIN_ITEMS_FOR_UNLOCK = 3;
// Stars per checklist page are capped, so a pasted plan with 25 items a page is worth no more than a starter list.
export const PAGE_CAP = 10;
// Only the first five items a person ever adds by hand count (and can earn the bonus); later ones are "extra".
export const CUSTOM_LIMIT = 5;
export const CUSTOM_BONUS = 5;
export const FIXED = { profile: 5, trip: 10, guide: 15, bug: 5, feedback: 5, reportCap: 5 } as const;

export const pageNames: Record<StarPage, string> = {
  prechecks: "Pre-checks",
  packing: "Packing",
  departure: "Departure Day",
  explore: "Places to visit",
  return: "Return Day"
};

export const PRIZE_NOTE = "Prizes are still to be decided. For now this is just a bit of competitive fun between attendees.";

// Plain-language rules for the explainer notice and the User Guide.
export function starRules(): string[] {
  return [
    `Finish a checklist (Pre-checks, Packing, Departure Day, Return Day, or Places to visit): 1 star per item, up to ${PAGE_CAP} per list. Each checked item adds a waiting star to that page's progress bar, and they all unlock when every item is checked. A list needs at least ${MIN_ITEMS_FOR_UNLOCK} items.`,
    `Check off ${CUSTOM_LIMIT} items you added yourself: ${CUSTOM_BONUS} bonus stars. Only the first ${CUSTOM_LIMIT} items you ever add count; after that, added items are worth nothing.`,
    `Fill in your profile (display name, home address, and training location): ${FIXED.profile} stars.`,
    `Add your trip dates and at least one booking: ${FIXED.trip} stars.`,
    `Read the User Guide and tick the box at the bottom of it: ${FIXED.guide} stars.`,
    `Report a bug that the organizer fixes: ${FIXED.bug} stars each, up to ${FIXED.reportCap} times. Send feedback the organizer accepts: ${FIXED.feedback} stars each, up to ${FIXED.reportCap} times.`,
    "Stars are never taken away once earned. The Overview shows your total, how close you are to 100%, and where everyone ranks."
  ];
}

export type Award = { key: string; stars: number; label: string; awardedAt: string };
export type PageStars = { done: number; total: number; counted: number; pending: number; unlocked: boolean; stars: number };
export type StarState = {
  balance: number;
  max: number;
  percent: number;
  awards: Award[];
  newAwards: Award[];
  pages: Record<string, PageStars>;
  custom: { created: number; checked: number; limit: number; unlocked: boolean };
  flags: { profile: boolean; trip: boolean; guideReadAt: string | null };
  remaining: { label: string; stars: number }[];
};
export type LeaderRow = { id: string; name: string; stars: number; rank: number; me: boolean };
