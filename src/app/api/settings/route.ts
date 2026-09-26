import { requireUser } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { asString, jsonError, parseNumber } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const theme = body.theme === "dark" ? "dark" : "light";
    const profileName = asString(body.profileName, 80);
    const tripName = asString(body.tripName, 120);
    const homeAddress = asString(body.homeAddress, 240);
    const homePlaceId = asString(body.homePlaceId, 160);
    const trainingLocation = asString(body.trainingLocation, 240);
    const trainingPlaceId = asString(body.trainingPlaceId, 160);
    const homeLat = parseNumber(body.homeLat);
    const homeLng = parseNumber(body.homeLng);
    const trainingLat = parseNumber(body.trainingLat);
    const trainingLng = parseNumber(body.trainingLng);
    await getSql()`
      INSERT INTO settings (
        user_id, profile_name, trip_name, home_address, home_place_id, home_lat, home_lng,
        training_location, training_place_id, training_lat, training_lng, theme, updated_at
      )
      VALUES (
        ${user.id}, ${profileName}, ${tripName}, ${homeAddress}, ${homePlaceId}, ${homeLat}, ${homeLng},
        ${trainingLocation}, ${trainingPlaceId}, ${trainingLat}, ${trainingLng}, ${theme}, now()
      )
      ON CONFLICT(user_id) DO UPDATE SET
        profile_name = excluded.profile_name,
        trip_name = excluded.trip_name,
        home_address = excluded.home_address,
        home_place_id = excluded.home_place_id,
        home_lat = excluded.home_lat,
        home_lng = excluded.home_lng,
        training_location = excluded.training_location,
        training_place_id = excluded.training_place_id,
        training_lat = excluded.training_lat,
        training_lng = excluded.training_lng,
        theme = excluded.theme,
        updated_at = now()
    `;
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not save settings", 401);
  }
}
