import { requireUser } from "@/lib/auth";
import { withAudit } from "@/lib/audit";
import { decryptText, encryptText } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { extractJson, normalizePlan } from "@/lib/plan";
import { dayKey, parseItinerary, parseWhen, serializeItinerary, stripBookingStops, timeBookings, trainingDays, type Booking } from "@/lib/trip-time";
import { asString, errorResponse } from "@/lib/validation";

// Takes ChatGPT's pasted JSON from the setup wizard and builds out the whole trip in one transaction.
// Anything ChatGPT returned replaces what was there; sections it left empty are kept.
export const POST = withAudit("plan.import", async (request, ctx) => {
  try {
    const user = ctx.user = await requireUser();
    const body = await request.json();
    const raw = asString(body.response, 40000);
    const plan = normalizePlan(extractJson(raw));
    const sql = getSql();
    const queries = [];

    if (plan.tripName || plan.trainingLocation || plan.homeCity) {
      queries.push(sql`INSERT INTO settings (user_id, updated_at) VALUES (${user.id}, now()) ON CONFLICT(user_id) DO NOTHING`);
      if (plan.tripName) queries.push(sql`UPDATE settings SET trip_name = ${encryptText(plan.tripName)}, updated_at = now() WHERE user_id = ${user.id}`);
      if (plan.homeCity) queries.push(sql`UPDATE settings SET home_address = ${encryptText(plan.homeCity)}, home_place_id = '', updated_at = now() WHERE user_id = ${user.id}`);
      if (plan.trainingLocation) queries.push(sql`UPDATE settings SET training_location = ${encryptText(plan.trainingLocation)}, training_place_id = '', updated_at = now() WHERE user_id = ${user.id}`);
    }

    // Checklists merge rather than reset: an item already on the page keeps its tick (matched by title, ignoring
    // case and spacing) and takes the file's ordering; new titles are added; imported or starter items the file
    // no longer lists are removed; items the person added by hand always stay. Star awards are keyed once per
    // page, so a re-import can't earn a list's stars twice.
    const norm = (title: string) => title.toLowerCase().replace(/\s+/g, " ").trim();
    for (const [page, titles] of Object.entries(plan.lists)) {
      if (!titles.length) continue;
      const existing = (await sql`SELECT id, title, source FROM list_items WHERE user_id = ${user.id} AND page = ${page}`)
        .map(row => ({ id: String(row.id), key: norm(decryptText(row.title)), source: String(row.source || "starter") }));
      const matched = new Set<string>();
      titles.forEach((title, index) => {
        const match = existing.find(row => row.key === norm(title) && !matched.has(row.id));
        if (match) {
          matched.add(match.id);
          queries.push(sql`UPDATE list_items SET position = ${index + 1}, updated_at = now() WHERE id = ${match.id} AND user_id = ${user.id}`);
        } else {
          queries.push(sql`INSERT INTO list_items (user_id, page, title, position, source) VALUES (${user.id}, ${page}, ${encryptText(title)}, ${index + 1}, 'import')`);
        }
      });
      for (const row of existing) {
        if (!matched.has(row.id) && (row.source === "import" || row.source === "starter")) queries.push(sql`DELETE FROM list_items WHERE id = ${row.id} AND user_id = ${user.id}`);
      }
    }

    if (plan.records.length) {
      queries.push(sql`DELETE FROM trip_info WHERE user_id = ${user.id}`);
      for (const record of plan.records) {
        queries.push(sql`
          INSERT INTO trip_info (user_id, category, title, provider, confirmation_number, start_at, end_at, address, phone, notes)
          VALUES (${user.id}, ${record.category}, ${encryptText(record.title)}, ${encryptText(record.provider)}, ${encryptText(record.confirmationNumber)},
            ${encryptText(record.startAt)}, ${encryptText(record.endAt)}, ${encryptText(record.address)}, ${encryptText(record.phone)}, ${encryptText(record.notes)})
        `);
      }
    }

    if (plan.itineraryText) {
      // Flights, check-ins, rental times and bootcamp days come from the records; stops that restate them are left out
      // of the saved plan so they follow the booking rather than lingering in the text.
      const start = parseWhen(plan.startDate);
      const bookings = timeBookings(plan.records.map((r, index) => ({ id: String(index), category: r.category as Booking["category"], title: r.title, provider: r.provider, confirmation_number: r.confirmationNumber, start_at: r.startAt, end_at: r.endAt, address: r.address })), start?.y ?? new Date().getFullYear());
      const trainingKeys = trainingDays(bookings.find(b => b.category === "training"));
      const stripped = stripBookingStops(parseItinerary(plan.itineraryText, start ? dayKey(start) : null), bookings, trainingKeys);
      const itineraryText = stripped.removed ? serializeItinerary(stripped.plan) : plan.itineraryText;
      queries.push(sql`
        INSERT INTO itinerary (user_id, instructions, response, saved_plan, cleaned_at, updated_at)
        VALUES (${user.id}, ${encryptText("Built by the ChatGPT setup wizard")}, ${encryptText(raw)}, ${encryptText(itineraryText)}, now(), now())
        ON CONFLICT(user_id) DO UPDATE SET instructions = excluded.instructions, response = excluded.response, saved_plan = excluded.saved_plan, cleaned_at = now(), updated_at = now()
      `);
    }

    ctx.detail = `${plan.records.length} records · ${Object.values(plan.lists).reduce((sum, items) => sum + items.length, 0)} list items · itinerary ${plan.itineraryText ? "yes" : "no"}`;
    await sql.transaction(queries);
    return Response.json({
      ok: true,
      counts: {
        records: plan.records.length,
        listItems: Object.values(plan.lists).reduce((sum, items) => sum + items.length, 0),
        itinerary: Boolean(plan.itineraryText)
      }
    });
  } catch (error) {
    return errorResponse(error, "Could not build your trip");
  }
});
