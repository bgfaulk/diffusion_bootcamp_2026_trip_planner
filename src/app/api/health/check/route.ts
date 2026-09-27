import { requireOwner } from "@/lib/admin";
import { withAudit } from "@/lib/audit";
import { HEALTH, latestSnapshot, runHealthCheck } from "@/lib/health";
import { errorResponse, fail } from "@/lib/validation";

// Runs a health check. Vercel's daily cron calls it with the CRON_SECRET bearer token; the organizer can call
// it from the Organizer page. ?peek=1 returns the latest snapshot and the thresholds without running one.
export const GET = withAudit("health.check", async (request, ctx) => {
  try {
    const url = new URL(request.url);
    const secret = process.env.CRON_SECRET?.trim();
    const fromCron = Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
    if (!fromCron) ctx.user = await requireOwner();
    if (url.searchParams.get("peek") === "1") return Response.json({ snapshot: await latestSnapshot(), thresholds: HEALTH });
    if (fromCron && !secret) fail("Not allowed", 403);
    const result = await runHealthCheck(fromCron ? "cron" : "manual", { demo: url.searchParams.get("demo") === "1" });
    ctx.detail = result.fired.length ? `alerts: ${result.fired.join(", ")}` : "ok";
    return Response.json({ ...result, thresholds: HEALTH });
  } catch (error) {
    return errorResponse(error, "Health check failed");
  }
});
