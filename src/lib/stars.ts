import { decryptText, encryptText } from "./crypto";
import { getSql } from "./db";
import { parseAnswers } from "./plan";
import { isOwner } from "./reset";
import { CUSTOM_BONUS, CUSTOM_LIMIT, FIXED, MIN_ITEMS_FOR_UNLOCK, PAGE_CAP, PRIZE_NOTE, STAR_PAGES, pageNames, starRules, type Award, type LeaderRow, type PageStars, type StarState } from "./stars-rules";

// Stars are a ledger (star_awards): one row per achievement, unique per person and key, never revoked.
// settleStars() looks at what the person has done, inserts any awards that are now due, and returns the
// full picture for the client. It runs on every bootstrap and after checklist edits, so nothing is ever
// "owed": a condition met is a row inserted. Only the caller that inserts a row sees it in newAwards,
// which is what makes the unlock toast fire exactly once even with two tabs open.

export type StarSnapshot = {
  items: { page: string; checked: boolean; source?: string | null }[];
  // Already decrypted.
  settings: { profile_name?: string | null; home_address?: string | null; training_location?: string | null; planning_answers?: string | null } | null;
  tripInfoCount: number;
};

async function loadSnapshot(userId: string): Promise<StarSnapshot> {
  const sql = getSql();
  const [items, settings, bookings] = await Promise.all([
    sql`SELECT page, checked, source FROM list_items WHERE user_id = ${userId}`,
    sql`SELECT profile_name, home_address, training_location, planning_answers FROM settings WHERE user_id = ${userId}`,
    sql`SELECT count(*)::int AS count FROM trip_info WHERE user_id = ${userId}`
  ]);
  const row = settings[0];
  return {
    items: items as StarSnapshot["items"],
    settings: row ? { profile_name: decryptText(row.profile_name), home_address: decryptText(row.home_address), training_location: decryptText(row.training_location), planning_answers: decryptText(row.planning_answers) } : null,
    tripInfoCount: Number(bookings[0]?.count || 0)
  };
}

const filled = (value: unknown) => typeof value === "string" && value.trim().length > 0;
const toAward = (row: any): Award => ({ key: String(row.key), stars: Number(row.stars), label: String(row.label), awardedAt: row.awarded_at ? new Date(row.awarded_at).toISOString() : new Date().toISOString() });

export async function settleStars(userId: string, snapshot?: StarSnapshot): Promise<StarState> {
  const sql = getSql();
  const [snap, userRows, awardRows, reportRows] = await Promise.all([
    snapshot ? Promise.resolve(snapshot) : loadSnapshot(userId),
    sql`SELECT guide_read_at, stars_welcomed_at, custom_items_created FROM users WHERE id = ${userId}`,
    sql`SELECT key, stars, label, awarded_at FROM star_awards WHERE user_id = ${userId} ORDER BY awarded_at, id`,
    sql`SELECT id, kind, status FROM reports WHERE user_id = ${userId} AND status IN ('fixed', 'accepted') ORDER BY resolved_at, created_at`
  ]);
  const user = userRows[0] || {};
  const existing = awardRows.map(toAward);
  const have = new Set(existing.map(award => award.key));
  const due: { key: string; stars: number; label: string }[] = [];

  // Checklists: 1 star per counted item, capped per page, unlocked when the whole page is checked.
  const pages: Record<string, PageStars> = {};
  for (const page of STAR_PAGES) {
    const items = snap.items.filter(item => item.page === page);
    const total = items.length;
    const done = items.filter(item => item.checked).length;
    const counted = Math.min(PAGE_CAP, items.filter(item => item.source !== "extra").length);
    const countedDone = Math.min(PAGE_CAP, items.filter(item => item.checked && item.source !== "extra").length);
    const key = `list:${page}`;
    const award = existing.find(entry => entry.key === key);
    const unlocked = Boolean(award);
    if (!unlocked && total >= MIN_ITEMS_FOR_UNLOCK && done === total && counted > 0) due.push({ key, stars: counted, label: `${pageNames[page]} list complete` });
    pages[page] = { done, total, counted, pending: unlocked ? 0 : countedDone, unlocked, stars: award ? award.stars : counted };
  }

  // Five of your own items checked (only the first five ever added carry source = 'custom').
  const customChecked = snap.items.filter(item => item.source === "custom" && item.checked).length;
  if (!have.has("custom5") && customChecked >= CUSTOM_LIMIT) due.push({ key: "custom5", stars: CUSTOM_BONUS, label: `${CUSTOM_LIMIT} of your own items done` });

  const profile = Boolean(snap.settings && filled(snap.settings.profile_name) && filled(snap.settings.home_address) && filled(snap.settings.training_location));
  if (!have.has("profile") && profile) due.push({ key: "profile", stars: FIXED.profile, label: "Profile filled in" });

  const answers = parseAnswers(snap.settings?.planning_answers || "");
  const trip = filled(answers.startDate) && filled(answers.endDate) && snap.tripInfoCount >= 1;
  if (!have.has("trip") && trip) due.push({ key: "trip", stars: FIXED.trip, label: "Trip details filled in" });

  const guideReadAt = user.guide_read_at ? new Date(user.guide_read_at).toISOString() : null;
  if (!have.has("guide") && guideReadAt) due.push({ key: "guide", stars: FIXED.guide, label: "Read the User Guide" });

  // Fixed bugs and accepted feedback, each capped per person. Oldest resolved first, so the cap is fair.
  for (const kind of ["bug", "feedback"] as const) {
    let room = FIXED.reportCap - existing.filter(award => award.key.startsWith(`${kind}:`)).length;
    const wanted = kind === "bug" ? "fixed" : "accepted";
    for (const report of reportRows) {
      if (room <= 0) break;
      if (report.kind !== kind || report.status !== wanted) continue;
      const key = `${kind}:${report.id}`;
      if (have.has(key)) continue;
      due.push({ key, stars: FIXED[kind], label: kind === "bug" ? "Bug report fixed" : "Feedback accepted" });
      room -= 1;
    }
  }

  let newAwards: Award[] = [];
  if (due.length) {
    const inserted = await sql`
      INSERT INTO star_awards (user_id, key, stars, label)
      SELECT ${userId}, k, s, l FROM unnest(${due.map(entry => entry.key)}::text[], ${due.map(entry => entry.stars)}::int[], ${due.map(entry => entry.label)}::text[]) AS t(k, s, l)
      ON CONFLICT (user_id, key) DO NOTHING
      RETURNING key, stars, label, awarded_at
    `;
    newAwards = inserted.map(toAward);
    for (const award of newAwards) {
      if (!award.key.startsWith("list:")) continue;
      const page = award.key.slice(5);
      if (pages[page]) pages[page] = { ...pages[page], pending: 0, unlocked: true, stars: award.stars };
    }
    await sendStarNotices(userId, newAwards, !user.stars_welcomed_at).catch(error => console.error("star notices", error));
  }
  const awards = [...existing, ...newAwards];
  const balance = awards.reduce((sum, award) => sum + award.stars, 0);
  const reportBonus = awards.filter(award => award.key.startsWith("bug:") || award.key.startsWith("feedback:")).reduce((sum, award) => sum + award.stars, 0);
  const has = (key: string) => awards.some(award => award.key === key);

  // "To 100%": everything in the person's own hands, plus report stars already earned (which raise both
  // sides), so the organizer's queue never dilutes it and 100% is reachable alone.
  const remaining: { label: string; stars: number }[] = [];
  let max = reportBonus;
  for (const page of STAR_PAGES) {
    const entry = pages[page];
    max += entry.unlocked ? entry.stars : entry.counted;
    if (!entry.unlocked && entry.counted > 0) remaining.push({ label: pageNames[page], stars: entry.counted });
  }
  max += CUSTOM_BONUS; if (!has("custom5")) remaining.push({ label: `${CUSTOM_LIMIT} own items`, stars: CUSTOM_BONUS });
  max += FIXED.profile; if (!has("profile")) remaining.push({ label: "Profile", stars: FIXED.profile });
  max += FIXED.trip; if (!has("trip")) remaining.push({ label: "Trip details", stars: FIXED.trip });
  max += FIXED.guide; if (!has("guide")) remaining.push({ label: "User Guide", stars: FIXED.guide });
  const percent = max > 0 ? Math.min(100, Math.round((100 * balance) / max)) : 0;

  return {
    balance, max, percent, awards, newAwards, pages,
    custom: { created: Number(user.custom_items_created || 0), checked: customChecked, limit: CUSTOM_LIMIT, unlocked: has("custom5") },
    flags: { profile, trip, guideReadAt },
    remaining
  };
}

// In-app notices only (never email): the explainer the first time anyone earns stars, and a note for each
// bug or feedback award, since those happen while the person is away.
async function sendStarNotices(userId: string, awards: Award[], first: boolean) {
  const sql = getSql();
  if (first) {
    const total = awards.reduce((sum, award) => sum + award.stars, 0);
    const body = `You just earned ${total} star${total === 1 ? "" : "s"} (${awards.map(award => award.label).join(", ")}). Stars are points for getting ready for the trip: finishing checklists, filling in your details, reading the guide, and reporting bugs. Open this notice for the full list of ways to earn them.`;
    await sql`
      INSERT INTO notifications (user_id, kind, title, body, data)
      VALUES (${userId}, ${"stars"}, ${encryptText("You earned your first stars!")}, ${encryptText(body)}, ${encryptText(JSON.stringify({ explainer: true, rules: starRules(), note: PRIZE_NOTE }))})
    `;
    await sql`UPDATE users SET stars_welcomed_at = now() WHERE id = ${userId} AND stars_welcomed_at IS NULL`;
  }
  for (const award of awards) {
    if (!award.key.startsWith("bug:") && !award.key.startsWith("feedback:")) continue;
    const title = award.key.startsWith("bug:") ? `Your bug report was fixed: +${award.stars} stars` : `Your feedback was accepted: +${award.stars} stars`;
    const body = award.key.startsWith("bug:")
      ? "The organizer marked a bug you reported as fixed. Thanks for flagging it; the stars are already in your total on the Overview."
      : "The organizer accepted an idea you sent in. Thanks for the suggestion; the stars are already in your total on the Overview.";
    await sql`
      INSERT INTO notifications (user_id, kind, title, body, data)
      VALUES (${userId}, ${"stars"}, ${encryptText(title)}, ${encryptText(body)}, ${encryptText(JSON.stringify({ award }))})
    `;
  }
}

// Everyone with at least one star, best first. The organizer is left out (they judge the prize), and so
// are suspended accounts. Ties go to whoever reached their total first; dense ranks, so two people on
// 40 stars are both #1 and the next person is #2.
export async function leaderboard(viewerId: string): Promise<LeaderRow[]> {
  const rows = await getSql()`
    SELECT u.id, u.email, s.profile_name, coalesce(a.stars, 0)::int AS stars
    FROM users u
    LEFT JOIN settings s ON s.user_id = u.id
    LEFT JOIN (SELECT user_id, sum(stars) AS stars, max(awarded_at) AS last FROM star_awards GROUP BY user_id) a ON a.user_id = u.id
    WHERE u.suspended_at IS NULL AND coalesce(a.stars, 0) > 0
    ORDER BY a.stars DESC, a.last ASC NULLS LAST, u.created_at ASC
  `;
  const out: LeaderRow[] = [];
  let rank = 0, last = -1;
  for (const row of rows) {
    if (isOwner(String(row.email))) continue;
    const stars = Number(row.stars);
    if (stars !== last) { rank += 1; last = stars; }
    // No display name yet: a neutral label, never a piece of the email address (everyone sees this list).
    const name = decryptText(row.profile_name).trim() || "Unnamed attendee";
    out.push({ id: String(row.id), name, stars, rank, me: String(row.id) === viewerId });
  }
  return out;
}

// What every stars response carries: the person's own state (settled first, so the ranking includes
// anything just awarded) and the leaderboard.
export async function starsFor(userId: string, snapshot?: StarSnapshot) {
  const stars = await settleStars(userId, snapshot);
  return { stars, leaderboard: await leaderboard(userId) };
}
