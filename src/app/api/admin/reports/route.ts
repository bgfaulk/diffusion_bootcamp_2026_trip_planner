import { requireOwner } from "@/lib/admin";
import { withAudit, withQuiet } from "@/lib/audit";
import { decryptText } from "@/lib/crypto";
import { getSql } from "@/lib/db";
import { isOwner } from "@/lib/reset";
import { settleStars } from "@/lib/stars";
import { FIXED } from "@/lib/stars-rules";
import { errorResponse, fail, requireString } from "@/lib/validation";

// Bug reports and feedback for the Organizer page's Reports tab. Marking a bug "fixed" or feedback
// "accepted" awards stars to the reporter (capped per person; see lib/stars.ts). Nothing here emails.

const statuses = new Set(["open", "fixed", "accepted", "closed"]);

export const GET = withQuiet("admin.reports", async (request, ctx) => {
  try {
    ctx.user = await requireOwner();
    const status = new URL(request.url).searchParams.get("status") || "open";
    if (status !== "all" && !statuses.has(status)) fail("Unknown status");
    const rows = await getSql()`
      SELECT r.id, r.kind, r.message, r.page, r.user_agent, r.status, r.mail, r.created_at, r.resolved_at,
        u.email, s.profile_name,
        (SELECT count(*)::int FROM star_awards WHERE user_id = r.user_id AND key LIKE r.kind || ':%') AS awarded
      FROM reports r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN settings s ON s.user_id = r.user_id
      WHERE ${status === "all"} OR r.status = ${status}
      ORDER BY r.created_at DESC
      LIMIT 500
    `;
    return Response.json({
      reports: rows.map((row: any) => ({
        id: String(row.id),
        kind: String(row.kind),
        message: decryptText(row.message),
        page: row.page || "",
        userAgent: row.user_agent || "",
        status: String(row.status),
        mail: row.mail || "",
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
        email: String(row.email),
        name: decryptText(row.profile_name),
        organizer: isOwner(String(row.email)),
        awarded: Number(row.awarded) || 0,
        cap: FIXED.reportCap
      }))
    });
  } catch (error) {
    return errorResponse(error, "Could not load reports");
  }
});

export const POST = withAudit("admin.report_status", async (request, ctx) => {
  try {
    ctx.user = await requireOwner();
    const body = await request.json();
    const id = requireString(body.id, "Report id", 80);
    const status = String(body.status);
    if (!statuses.has(status)) fail("Unknown status");
    ctx.target = id; ctx.detail = status;
    const sql = getSql();
    const rows = await sql`
      UPDATE reports
      SET status = ${status}, resolved_at = CASE WHEN ${status} = 'open' THEN NULL ELSE coalesce(resolved_at, now()) END
      WHERE id = ${id}
      RETURNING user_id, kind
    `;
    if (!rows.length) fail("Report not found", 404);
    const reporter = String(rows[0].user_id);
    const stars = await settleStars(reporter);
    const awarded = stars.newAwards.some(award => award.key === `${rows[0].kind}:${id}`);
    return Response.json({ ok: true, awarded, balance: stars.balance });
  } catch (error) {
    return errorResponse(error, "Could not update that report");
  }
});
