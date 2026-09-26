import { requireUser } from "@/lib/auth";
import { asString, jsonError } from "@/lib/validation";

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

export async function POST(request: Request) {
  try {
    await requireUser();
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
      throw new Error(`Google Places lookup failed (${response.status})`);
    }
    const data = await response.json();
    return Response.json({
      suggestions: (data.suggestions || []).map((entry: any) => ({
        placeId: entry.placePrediction?.placeId,
        text: entry.placePrediction?.text?.text
      })).filter((entry: any) => entry.placeId && entry.text)
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not search addresses", 400);
  }
}
