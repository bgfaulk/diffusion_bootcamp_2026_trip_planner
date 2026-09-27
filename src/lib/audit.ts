import { after } from "next/server";
import { getUser } from "./auth";
import { getSql } from "./db";
import { clientIp } from "./rate-limit";

// Every API route is wrapped in one of these, which writes one audit_log row per request after the response
// has gone out (Next's after()), so logging never adds latency to the request itself. The row carries what
// you need when someone says "it broke": who, from where, which route, the status, how long it took, and the
// error text the client was shown. Handlers set ctx.user once they know it and may set ctx.target / detail.
//
// Three levels keep the table from filling with noise:
//   withAudit   "activity": things people did (sign in, save, upload, delete, admin actions). Kept for a year.
//   withTraffic "traffic":  page loads and other routine requests. Kept 7 days for the request/latency charts,
//                           without the user-agent string. Hidden from the Activity tab by default.
//   withQuiet   polling and lookups (weather, address search, organizer refreshes, image fetches). Logged only
//                           when they fail, as traffic. A handler can raise its level with ctx.level.

export type AuditUser = { id: string; email: string } | null;
export type AuditLevel = "activity" | "traffic" | "quiet";
export type AuditCtx = { event?: string; user?: AuditUser; target?: string; detail?: string; level?: AuditLevel };
type Handler<P> = (request: Request, ctx: AuditCtx, params: P) => Promise<Response>;

export function withTraffic<P = unknown>(event: string, handler: Handler<P>) { return audited(event, handler, "traffic"); }
export function withQuiet<P = unknown>(event: string, handler: Handler<P>) { return audited(event, handler, "quiet"); }
export function withAudit<P = unknown>(event: string, handler: Handler<P>) { return audited(event, handler, "activity"); }

function audited<P>(event: string, handler: Handler<P>, defaultLevel: AuditLevel) {
  return async (request: Request, params: P): Promise<Response> => {
    const started = Date.now();
    const ctx: AuditCtx = {};
    let response: Response;
    try {
      response = await handler(request, ctx, params);
    } catch (error) {
      // Handlers catch their own errors; this only fires for a bug outside their try block.
      console.error(`${event} threw`, error);
      response = Response.json({ error: "Something went wrong" }, { status: 500 });
    }
    const ms = Date.now() - started;
    const level = ctx.level ?? defaultLevel;
    if (level === "quiet" && response.status < 400) return response;
    const kind = level === "activity" ? "activity" : "traffic";
    // Resolve the actor now (cookies are request-scoped); only routes that never called requireUser pay for it.
    const actor = ctx.user !== undefined ? ctx.user : await getUser().catch(() => null);
    const failed = response.status >= 400 ? response.clone() : null;
    const row = {
      event: ctx.event ?? event,
      method: request.method,
      route: new URL(request.url).pathname,
      status: response.status,
      ms,
      userId: actor?.id ?? null,
      email: actor?.email ?? null,
      target: ctx.target?.slice(0, 200) ?? null,
      ip: clientIp(request).slice(0, 80),
      userAgent: kind === "activity" ? request.headers.get("user-agent")?.slice(0, 300) ?? null : null,
      detail: ctx.detail?.slice(0, 500) ?? null
    };
    after(async () => {
      try {
        let detail = row.detail;
        if (failed) {
          const body = await failed.json().catch(() => null);
          if (body?.error) detail = [detail, String(body.error)].filter(Boolean).join(" · ").slice(0, 500);
        }
        await getSql()`
          INSERT INTO audit_log (event, method, route, status, ms, user_id, email, target, ip, user_agent, detail, kind)
          VALUES (${row.event}, ${row.method}, ${row.route}, ${row.status}, ${row.ms}, ${row.userId}, ${row.email}, ${row.target}, ${row.ip}, ${row.userAgent}, ${detail}, ${kind})
        `;
      } catch (error) {
        console.error("audit log write failed", error);
      }
    });
    return response;
  };
}
