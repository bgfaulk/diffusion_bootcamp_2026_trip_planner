import { requireUser } from "@/lib/auth";
import { withAudit } from "@/lib/audit";
import { encryptText } from "@/lib/crypto";
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

    for (const [page, titles] of Object.entries(plan.lists)) {
      if (!titles.length) continue;
      queries.push(sql`DELETE FROM list_items WHERE user_id = ${user.id} AND page = ${page}`);
      titles.forEach((title, index) => {
        queries.push(sql`INSERT INTO list_items (user_id, page, title, position, source) VALUES (${user.id}, ${page}, ${encryptText(title)}, ${index + 1}, 'import')`);
      });
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
        INSERT INTO itinerary (user_id, instructions, response, saved_plan, updated_at)
        VALUES (${user.id}, ${encryptText("Built by the ChatGPT setup wizard")}, ${encryptText(raw)}, ${encryptText(itineraryText)}, now())
        ON CONFLICT(user_id) DO UPDATE SET instructions = excluded.instructions, response = excluded.response, saved_plan = excluded.saved_plan, updated_at = now()
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
