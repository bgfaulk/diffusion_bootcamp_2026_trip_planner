import { requireUser } from "@/lib/auth";
import { withAudit } from "@/lib/audit";
import { encryptText } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { mailConfigured, sendMail } from "@/lib/mail";
import { primaryOwnerEmail } from "@/lib/reset";
import { clientIp, enforceLimit } from "@/lib/rate-limit";
import { asString, errorResponse, requireString } from "@/lib/validation";

// "Report Bug" in the account menu. The report is stored (encrypted) for the Organizer page's Reports tab,
// where the organizer marks it fixed or accepted (which awards stars), and then emailed to OWNER_EMAIL
// when mail is configured. The email is best effort: a report is never lost because mail failed.
export const POST = withAudit("feedback.send", async (request, ctx) => {
  try {
    const user = ctx.user = await requireUser();
    enforceLimit(`feedback:${user.id}`, 10, 60 * 60 * 1000);
    enforceLimit(`feedback:ip:${clientIp(request)}`, 20, 60 * 60 * 1000);
    const body = await request.json();
    const kind = body.kind === "feedback" ? "feedback" : "bug";
    const message = requireString(body.message, "Message", 4000);
    const page = asString(body.page, 200);
    const userAgent = asString(body.userAgent, 300);
    const sql = getSql();
    const stored = await sql`
      INSERT INTO reports (user_id, kind, message, page, user_agent)
      VALUES (${user.id}, ${kind}, ${encryptText(message)}, ${page || null}, ${userAgent || null})
      RETURNING id
    `;
    const id = String(stored[0].id);
    ctx.target = id;
    const owner = primaryOwnerEmail();
    if (!owner || !mailConfigured()) {
      ctx.detail = `${kind} · stored, mail not configured`;
      return Response.json({ ok: true, id });
    }
    const subject = `[Trip Planner] ${kind === "bug" ? "Bug report" : "Feedback"} from ${user.email}`;
    const when = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" });
    const text = `${kind === "bug" ? "Bug report" : "Feedback"} from ${user.email}\nPage: ${page || "unknown"}\nWhen: ${when} (Pacific)\nBrowser: ${userAgent || "unknown"}\n\n${message}\n`;
    const escape = (value: string) => value.replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch] as string));
    const html = `<p><strong>${kind === "bug" ? "Bug report" : "Feedback"}</strong> from ${escape(user.email)}</p><p>Page: ${escape(page || "unknown")}<br>When: ${escape(when)} (Pacific)<br>Browser: ${escape(userAgent || "unknown")}</p><pre style="white-space:pre-wrap;font:14px/1.5 -apple-system,Segoe UI,sans-serif">${escape(message)}</pre>`;
    const mail = await sendMail(owner, subject, text, html).catch((error: unknown) => `mail failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200));
    await sql`UPDATE reports SET mail = ${mail} WHERE id = ${id}`.catch(() => {});
    ctx.detail = `${kind} · ${mail}`;
    return Response.json({ ok: true, id });
  } catch (error) {
    return errorResponse(error, "Could not send that");
  }
});
