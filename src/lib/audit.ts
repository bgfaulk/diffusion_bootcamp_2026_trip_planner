import { after } from "next/server";
import { getUser } from "./auth";
import { getSql } from "./db";
import { clientIp } from "./rate-limit";

// Every API route is wrapped in withAudit, which writes one audit_log row per request after the response
// has gone out (Next's after()), so logging never adds latency to the request itself. The row carries what
// you need when someone says "it broke": who, from where, which route, the status, how long it took, and the
// error text the client was shown. Handlers set ctx.user once they know it and may set ctx.target / detail.

export type AuditUser = { id: string; email: string } | null;
export type AuditCtx = { event?: string; user?: AuditUser; target?: string; detail?: string };

export function withAudit<P = unknown>(event: string, handler: (request: Request, ctx: AuditCtx, params: P) => Promise<Response>) {
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
      userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
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
          INSERT INTO audit_log (event, method, route, status, ms, user_id, email, target, ip, user_agent, detail)
          VALUES (${row.event}, ${row.method}, ${row.route}, ${row.status}, ${row.ms}, ${row.userId}, ${row.email}, ${row.target}, ${row.ip}, ${row.userAgent}, ${detail})
        `;
      } catch (error) {
        console.error("audit log write failed", error);
      }
    });
    return response;
  };
}
