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

export const POST = withAudit("places.search", async (request, ctx) => {
  try {
    ctx.user = await requireUser();
    const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
    if (!key) return Response.json({ suggestions: [] });
    const body = await request.json();
    const input = asString(body.input, 120);
    if (input.length < 3) return Response.json({ suggestions: [] });
    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
        "Referer": googleReferer(request)
      },
      body: JSON.stringify({ input, includedRegionCodes: ["us"] })
    });
    if (!response.ok) {
      console.warn("Google Places autocomplete failed", response.status, await response.text());
      fail("Address search is unavailable right now", 502);
    }
    const data = await response.json();
    return Response.json({
      suggestions: (data.suggestions || []).map((entry: any) => ({
        placeId: entry.placePrediction?.placeId,
        text: entry.placePrediction?.text?.text
      })).filter((entry: any) => entry.placeId && entry.text)
    });
  } catch (error) {
    return errorResponse(error, "Could not search addresses");
  }
});
