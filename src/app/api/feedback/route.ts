import { requireUser } from "@/lib/auth";
import { withAudit } from "@/lib/audit";
import { mailConfigured, sendMail } from "@/lib/mail";
import { clientIp, enforceLimit } from "@/lib/rate-limit";
import { asString, errorResponse, fail, requireString } from "@/lib/validation";

// "Report Bug" in the account menu: emails the message to the organizer (OWNER_EMAIL) with enough context
// to follow up. Nothing is stored; the audit log only records that a report was sent.
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
    const owner = process.env.OWNER_EMAIL?.trim();
    if (!owner || (process.env.NODE_ENV === "production" && !mailConfigured())) fail("Bug reports aren't set up yet. Tell the trip organizer directly.", 503);
    const subject = `[Trip Planner] ${kind === "bug" ? "Bug report" : "Feedback"} from ${user.email}`;
    const when = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" });
    const text = `${kind === "bug" ? "Bug report" : "Feedback"} from ${user.email}\nPage: ${page || "unknown"}\nWhen: ${when} (Pacific)\nBrowser: ${userAgent || "unknown"}\n\n${message}\n`;
    const escape = (value: string) => value.replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[ch] as string));
    const html = `<p><strong>${kind === "bug" ? "Bug report" : "Feedback"}</strong> from ${escape(user.email)}</p><p>Page: ${escape(page || "unknown")}<br>When: ${escape(when)} (Pacific)<br>Browser: ${escape(userAgent || "unknown")}</p><pre style="white-space:pre-wrap;font:14px/1.5 -apple-system,Segoe UI,sans-serif">${escape(message)}</pre>`;
    ctx.detail = `${kind} · ${await sendMail(owner, subject, text, html)}`;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not send that");
  }
});
