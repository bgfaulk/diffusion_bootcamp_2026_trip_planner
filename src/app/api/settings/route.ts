import { requireUser } from "@/lib/auth";
import { encryptText } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { isTheme } from "@/lib/theme";
import { asString, errorResponse } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const theme = isTheme(body.theme) ? body.theme : "light";
    const profileName = encryptText(asString(body.profileName, 80));
    const tripName = encryptText(asString(body.tripName, 120));
    const homeAddress = encryptText(asString(body.homeAddress, 240));
    const homePlaceId = encryptText(asString(body.homePlaceId, 160));
    const trainingLocation = encryptText(asString(body.trainingLocation, 240));
    const trainingPlaceId = encryptText(asString(body.trainingPlaceId, 160));
    // Coordinates are never stored (privacy). The legacy *_lat/*_lng columns are nulled on every save so
    // anything written before that decision is scrubbed the next time the row is touched.
    await getSql()`
      INSERT INTO settings (
        user_id, profile_name, trip_name, home_address, home_place_id,
        training_location, training_place_id, theme, updated_at
      )
      VALUES (
        ${user.id}, ${profileName}, ${tripName}, ${homeAddress}, ${homePlaceId},
        ${trainingLocation}, ${trainingPlaceId}, ${theme}, now()
      )
      ON CONFLICT(user_id) DO UPDATE SET
        profile_name = excluded.profile_name,
        trip_name = excluded.trip_name,
        home_address = excluded.home_address,
        home_place_id = excluded.home_place_id,
        home_lat = NULL,
        home_lng = NULL,
        training_location = excluded.training_location,
        training_place_id = excluded.training_place_id,
        training_lat = NULL,
        training_lng = NULL,
        theme = excluded.theme,
        updated_at = now()
    `;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not save settings");
  }
}
