import { requireUser } from "@/lib/auth";
import { asString, jsonError } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    await requireUser();
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) throw new Error("Google Maps API key is not configured");
    const body = await request.json();
    const placeId = asString(body.placeId, 160);
    if (!placeId) throw new Error("Missing place id");
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "id,formattedAddress,location,displayName"
      }
    });
    if (!response.ok) throw new Error("Google Place details failed");
    const data = await response.json();
    return Response.json({
      placeId: data.id,
      address: data.formattedAddress || data.displayName?.text || "",
      lat: data.location?.latitude ?? null,
      lng: data.location?.longitude ?? null
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not load address", 400);
  }
}
