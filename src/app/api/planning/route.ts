import { requireUser } from "@/lib/auth";
import { encryptText } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { isTheme } from "@/lib/theme";
import { jsonError } from "@/lib/validation";

// Saves the AI/manual choice and the wizard's in-progress answers without touching the rest of settings.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const mode = body.mode === "ai" || body.mode === "manual" ? body.mode : null;
    // Only used when this call creates the settings row: a new account keeps the theme it signed up under.
    const theme = isTheme(body.theme) ? body.theme : "light";
    let answers: string | null = null;
    if (body.answers && typeof body.answers === "object") {
      const json = JSON.stringify(body.answers);
      if (json.length > 60000) throw new Error("Wizard answers are too long");
      answers = encryptText(json);
    }
    await getSql()`
      INSERT INTO settings (user_id, planning_mode, planning_answers, theme, updated_at)
      VALUES (${user.id}, ${mode}, ${answers}, ${theme}, now())
      ON CONFLICT(user_id) DO UPDATE SET
        planning_mode = COALESCE(excluded.planning_mode, settings.planning_mode),
        planning_answers = COALESCE(excluded.planning_answers, settings.planning_answers),
        updated_at = now()
    `;
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not save planning choice", 400);
  }
}
