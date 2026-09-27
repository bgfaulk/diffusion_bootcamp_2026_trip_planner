# Working on the Trip Planner

Read `README.md` first for what the app does and how it is configured. This file is the short list of
conventions that are easy to break.

## Ground rules

- **No personal data in git.** No traveler names, bookings, PDFs, photos, group links, or credentials.
  Trip data lives in Neon; secrets and links live in Vercel environment variables and `.env.local`.
- **The database is production.** There is no local database. Any account created while testing shows up
  on the organizer's Accounts tab; delete it via Settings > Account when finished.
- **Never spam the organizer.** Only five places send email (see the Email section of the README). Keep
  the caps: rate limits on the attendee-triggered ones and the per-kind 24-hour state in
  `health_alert_state` on alerts. New notification kinds are in-app only unless the organizer asks otherwise.

## Server code

- Wrap every API route in `withAudit` (things people did), `withTraffic` (routine loads), or `withQuiet`
  (polling and lookups) from `src/lib/audit.ts`, and call `requireUser()` or `requireOwner()` first.
- Scope every per-user query with `user_id = ${user.id}`. All SQL is the Neon tagged template; no string
  concatenation, no `sql.unsafe`, no dynamic identifiers.
- Encrypt free-text columns (and base64 file bodies) with `encryptText` from `src/lib/crypto.ts`, and read
  them back with `decryptText` or `decryptRow`.
- Throw `AppError` (via `fail`) for user-facing messages and let `errorResponse` shape the reply. Never
  return stack traces or database errors.
- **API changes.** Tabs stay open across deploys, so an old bundle may call a new route. Prefer additive
  changes: new optional fields, new routes, tolerant parsing of old request shapes. If a shape must change,
  make the route return a clear 4xx for the old shape rather than silently doing the wrong thing. Every
  `/api` response carries `X-App-Build` (set in `next.config.ts`) and `src/lib/client.ts` compares it with
  the bundle's own build: the first mismatch shows a "Reload" toast, a stale tab reloads itself when it comes back from the background
  with nothing typed, and any failure from a newer build tells the person to reload instead of showing the raw error.
- Schema changes go in `ensureSchema()` in `src/lib/db.ts` as idempotent `CREATE TABLE IF NOT EXISTS` or
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements. Add new tables to `appTables` in `src/lib/admin.ts`
  so the size chart sees them, and to `pruneAuditLog` if they need retention.

## Client code

- Every save, add, or delete must surface its result with `notify` from `src/app/toast.tsx`.
- Do not hand-write `-webkit-` prefixed properties in `globals.css`; the compiler drops the standard
  property next to them. Write the standard property and let the build add prefixes.
- Check all three themes (Light, Dark, Digital Nirvana), the collapsed sidebar, and the phone layout
  (below 900px: top bar plus bottom rail) for any UI change. Digital Nirvana overrides live at the bottom of
  `globals.css` and often need their own rule for a new component.
- Pages are grouped in `navGroups` in `src/app/planner.tsx`; a new page needs a `pageLabels` entry, a
  `pagePaths` URL, a `PageIcon` glyph, and a place in a group.
- The loading-screen chime must not restart or extend the loader.

## Docs to keep in step

- `src/app/user-guide.tsx` is the attendee-facing guide. Update the relevant section and the "What's new"
  list, and bump `GUIDE_UPDATED`, whenever a feature changes.
- `README.md` for anything about configuration, email, data, or the page list.
- `.env.example` for any new environment variable, with a one-line comment.

## Verifying

```bash
npx tsc --noEmit
npx next lint
```

Start the app with `npm run dev` and check the change in the browser; there is no test suite.
