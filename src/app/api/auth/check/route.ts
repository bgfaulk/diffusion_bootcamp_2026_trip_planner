import { emailExists } from "@/lib/auth";
import { errorResponse, honeypotTripped, jsonError } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (honeypotTripped(body)) return jsonError("Could not check email", 400);
    return Response.json({ exists: await emailExists(body.email) });
  } catch (error) {
    return errorResponse(error, "Could not check email");
  }
}
