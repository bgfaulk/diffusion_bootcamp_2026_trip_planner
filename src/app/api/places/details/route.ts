import { requireUser } from "@/lib/auth";
import { withAudit } from "@/lib/audit";
import { asString, errorResponse, fail } from "@/lib/validation";

function googleReferer(request: Request) {
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return `${new URL(referer).origin}/`;
    } catch {}
  }
  const host = request.headers.get("host");
  return host ? `https://${host}/` : "http://localhost:3000/";
}

export const POST = withAudit("places.details", async (request, ctx) => {
  try {
    ctx.user = await requireUser();
    const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
    if (!key) fail("Address lookup is not configured", 503);
    const body = await request.json();
    const placeId = asString(body.placeId, 160);
    if (!placeId) fail("Missing place id");
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "id,formattedAddress,displayName",
        "Referer": googleReferer(request)
      }
    });
    if (!response.ok) {
      console.warn("Google Place details failed", response.status, await response.text());
      fail("Address lookup is unavailable right now", 502);
    }
    const data = await response.json();
    return Response.json({
      placeId: data.id,
      address: data.formattedAddress || data.displayName?.text || ""
    });
  } catch (error) {
    return errorResponse(error, "Could not load address");
  }
});
