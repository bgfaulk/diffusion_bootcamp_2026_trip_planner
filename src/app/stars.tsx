"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { CUSTOM_LIMIT, MIN_ITEMS_FOR_UNLOCK, type LeaderRow, type StarState } from "@/lib/stars-rules";

// Stars on the client: the state comes from /api/bootstrap and /api/stars (see lib/stars.ts), lives in the
// planner shell, and reaches the Overview strip and the checklist progress bars through this context.

export type StarsPayload = { stars: StarState | null; leaderboard: LeaderRow[] };
type StarsContextValue = { stars: StarState | null; leaderboard: LeaderRow[]; burst: boolean; refreshStars: () => Promise<void> };

const StarsContext = createContext<StarsContextValue>({ stars: null, leaderboard: [], burst: false, refreshStars: async () => {} });
export const StarsProvider = StarsContext.Provider;
export function useStars() { return useContext(StarsContext); }

// While the Overview is open: settle once on arrival and every five minutes after (skipped while the tab is
// hidden), so the Rank cell follows everyone else's progress, not just this person's.
export function useStarsRefresh() {
  const { refreshStars } = useStars();
  useEffect(() => {
    void refreshStars();
    const timer = setInterval(() => { if (!document.hidden) void refreshStars(); }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [refreshStars]);
}

export function StarGlyph() {
  return <svg className="star-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z" /></svg>;
}

// The checklist hero's progress block, with a star riding the bar: waiting stars build as items are
// checked and unlock when the page hits 100%.
export function ProgressBlock({ pageKey, done, total, inline = false }: { pageKey: string; done: number; total: number; inline?: boolean }) {
  const { stars, burst } = useStars();
  const page = stars?.pages[pageKey];
  const percent = total ? Math.round((done / total) * 100) : 0;
  const status = !total ? "Add your first item" : done === total ? "All done" : `${total - done} to go`;
  const starLine = !page ? ""
    : page.unlocked ? `${page.stars} star${page.stars === 1 ? "" : "s"} earned`
    : total < MIN_ITEMS_FOR_UNLOCK ? `Add ${MIN_ITEMS_FOR_UNLOCK - total} more item${MIN_ITEMS_FOR_UNLOCK - total === 1 ? "" : "s"} to earn stars`
    : page.pending > 0 ? `${page.pending} star${page.pending === 1 ? "" : "s"} waiting · unlocks at 100%`
    : `${page.counted} star${page.counted === 1 ? "" : "s"} unlock when every item is checked`;
  const starClass = !page ? "" : page.unlocked ? "unlocked" : page.pending > 0 ? "pending" : "";
  return (
    <div className={inline ? "progress-block inline" : "progress-block"} role="group" aria-label="Progress">
      <strong>{done}<small>of {total} done</small></strong>
      <div className="progress-track">
        <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ width: `${percent}%` }} /></div>
        {page && <span className={`progress-star ${starClass}${burst && page.unlocked ? " burst" : ""}`} style={{ left: `${percent}%` }} title={starLine}><StarGlyph /></span>}
      </div>
      <span>{status}</span>
      {starLine && <em className={page?.unlocked ? "progress-stars earned" : "progress-stars"}>{starLine}</em>}
    </div>
  );
}

// Shown under the add-item box once the person's five counted items are used up.
export function ExtraItemsNote() {
  const { stars } = useStars();
  if (!stars || stars.custom.created < CUSTOM_LIMIT) return null;
  return <p className="muted extra-note">Items you add from here on still count toward finishing the list, but they no longer earn stars (your first {CUSTOM_LIMIT} did).</p>;
}

// The three cells on the Overview strip: balance, distance to 100%, and the rank ticker.
export function StarCells({ owner }: { owner: boolean }) {
  const { stars, leaderboard, burst } = useStars();
  if (!stars) return null;
  const left = stars.remaining.map(entry => `${entry.label} ${entry.stars}`).join(" · ");
  return (
    <>
      <span className="trip-stat-divider" aria-hidden="true" />
      <span className={burst ? "trip-stat stars burst" : "trip-stat stars"} title={`${stars.balance} of ${stars.max} stars you can earn`}><span className="eyebrow">Stars</span><strong><StarGlyph />{stars.balance}</strong></span>
      <span className="trip-stat" title={left ? `Still to earn: ${left}` : "Everything in your hands is done"}><span className="eyebrow">To 100%</span><strong>{stars.percent}%</strong></span>
      <span className="trip-stat rank" title={owner ? "Everyone with stars, best first. The organizer isn't ranked." : "Everyone with stars, best first. Refreshes every few minutes."}><span className="eyebrow">Rank</span><RankTicker rows={leaderboard} /></span>
    </>
  );
}

// Cycles through the leaderboard from first place, a few seconds each, with the viewer's own row
// highlighted. Pauses while the tab is hidden, and stands still on the viewer's row under reduced motion.
function RankTicker({ rows }: { rows: LeaderRow[] }) {
  const [index, setIndex] = useState(0);
  const [still, setStill] = useState(false);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStill(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  useEffect(() => { setIndex(0); }, [rows.length]);
  useEffect(() => {
    if (still || rows.length < 2) return;
    const timer = setInterval(() => { if (!document.hidden) setIndex(current => (current + 1) % rows.length); }, 3000);
    return () => clearInterval(timer);
  }, [rows.length, still]);
  if (!rows.length) return <strong className="rank-row muted">No stars yet</strong>;
  const mine = rows.find(row => row.me);
  const row = still ? (mine || rows[0]) : rows[index % rows.length];
  return <strong key={still ? "still" : index} className={row.me ? "rank-row me" : "rank-row"}>#{row.rank} {row.name} · {row.stars}</strong>;
}
