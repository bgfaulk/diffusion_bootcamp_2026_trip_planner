# ABC Fitness Diffusion Bootcamp 2026 Trip Planner

A Vercel-hosted trip planner for the San Francisco training trip. Each attendee has a private, encrypted
account holding their bookings, checklists, itinerary, PDFs, and photo route. The trip organizer has an
extra Organizer page with accounts, activity, health checks, and broadcast notices.

Next.js 16, React 19, Neon Postgres. Deployed at https://diffusion-bootcamp-2026-trip-planne.vercel.app,
which is **paused since 2026-10-03** after the trip; see [Bringing it back](#bringing-it-back).

This repository intentionally contains no personal booking information, traveler names, PDFs, private
trip data, or group links. Runtime data belongs in Neon and Vercel environment variables, not git.

## What it does

**Getting in**
- Email and password sign-in. Creating an account takes the organizer's invite code (`SIGNUP_CODE`) and
  emails the address a one-time, 24-hour link that finishes sign-up by choosing a password, so an account can
  only be made by whoever reads that inbox. An address that already has an account gets a "you're already
  signed up" email with a reset link instead, and the form answers the same way either time.
- "Forgot your password?" emails a one-time, 24-hour reset link. The organizer can also mint or email one
  from the Organizer page.
- After an hour of inactivity a warning shows, and two minutes later the person is signed out.

**Setting up a trip**
- "Plan with ChatGPT": answer a few questions, hand ChatGPT one prompt (paste your confirmation emails
  into it), and upload the `trip-plan.json` it returns. Bookings, itinerary, packing list, and checklists
  are filled from it. Importing again merges the checklists (ticked items stay ticked, hand-added items stay)
  and replaces bookings and the itinerary. The Explore page's "Plan again with ChatGPT" prompt asks for a
  day-by-day text answer built around the saved dates and bookings; pasting JSON works too.
- "Set it up myself": enter dates, travelers, interests, and bookings by hand.
- Setup can be left at any time; a banner on the Overview brings people back to it.

**Pages** (the sidebar groups them; each group folds, and every page has its own URL)
- Overview: trip name, dates, what is next, and today's schedule.
- Get ready: Pre-checks and Packing checklists.
- Travel days: Departure Day and Return Day checklists.
- On the trip: Explore San Francisco (itinerary and places; booking moments are placed on their days live
  from Trip Information, and plan stops that only restate a booking are dropped), Trip Information (bookings and PDFs, with
  "Add to calendar" .ics downloads for the whole trip, one booking, or the training days; a calendar guest
  from Settings is invited on every event), and
  Photo Route (one photo per stop, shrunk before upload; every stop starts with a stock photo from
  `public/stock`, credited in `public/stock/CREDITS.md`, until the attendee adds their own or deletes it).
- Settings: profile, trip details, account deletion, and the in-app User Guide.
- Organizer (owner only): see below.

**Around the app**
- Weather for the person's location (or the training location) in the sidebar, from a shared 30-minute
  cache so the whole group costs one upstream call per place.
- Google Places address suggestions on address fields, with a visible note when lookup is unavailable.
- Notifications with an unread count on the avatar: a welcome tour for new accounts, notices from the
  organizer, and health alerts for the organizer.
- Account menu: Settings, Notifications, Theme (Light, Dark, Digital Nirvana), ABC WhatsApp (group link and
  QR code), Report Bug (stored for the organizer and emailed), Sign out.
- Stars: points for using the planner, computed on the server from what each person has done and kept as a
  ledger that is never revoked (`src/lib/stars-rules.ts` holds the numbers). Checklist items are 1 star each
  (up to 10 per list, at least 3 items, unlocked when the whole list is checked); the first five hand-added
  items count and checking all five is a 5-star bonus; profile 5, trip dates plus a booking 10, the User
  Guide checkbox 15; a fixed bug or accepted feedback 5 each, up to five times. The Overview strip shows the
  balance, the percent of what that person can earn, and a Rank cell that cycles through everyone with
  stars. The organizer is not ranked. The first award sends an in-app explainer notice; prizes are TBD.
- The loading screen plays an A-B-C chime, mutable in Settings.
- Every save, add, or delete shows a toast with the result.
- Phones get a top bar and a bottom page rail instead of the sidebar.

**Organizer page** (`OWNER_EMAIL` accounts only)
- Overview: requests, errors, latency (p95), database size and growth per table, and application health
  with a "Check now" button, over a selectable time window with optional auto-refresh.
- Accounts: every registered account with status, last sign-in, last seen, stored data, session count,
  and stars, plus an Actions menu per row (email or copy a reset link, sign out everywhere, suspend or
  reinstate, delete).
- Reports: every bug report and piece of feedback with its status. Marking a bug Fixed or feedback
  Accepted awards the reporter 5 stars (capped at five of each per person); Close awards nothing.
- Send a notice: one notification to every active account.
- Activity: the audit log (who, IP, route, status, timing, error text), filterable and sortable.

## Email

All mail goes out through the organizer's Gmail account using an app password. There are exactly five
senders, and none of them loop or retry:

| Trigger | Recipient | Cap |
| --- | --- | --- |
| Create an account (sign-up link, or "already signed up") | the attendee | 3 per email and 10 per IP every 15 minutes |
| Forgot password | the attendee | 3 per email and 10 per IP every 15 minutes |
| Organizer emails a reset link | the attendee | manual only |
| Report Bug / feedback (also stored in `reports`) | the organizer | 10 per account and 20 per IP per hour |
| Health alert | the organizer | each alert kind at most once per 24 hours |

Health checks run from the daily Vercel cron (`vercel.json`, 14:00 UTC), when the organizer opens the app
(throttled to once per 15 minutes), and from "Check now". The once-per-day cap per alert kind is stored in
the database, so it holds across serverless instances and triggers. New-attendee and broadcast
notifications are in-app only and never send email.

## Data

Neon Postgres, created lazily by `ensureSchema()` in `src/lib/db.ts`. Text fields, photos, and PDFs are
encrypted at rest with AES-256-GCM keyed from `SESSION_SECRET`. Tables: `users`, `sessions`, `settings`,
`list_items`, `itinerary`, `trip_info`, `trip_documents`, `photos`, `notifications`, `audit_log`,
`health_snapshots`, `health_alert_state`, `weather_cache`, `star_awards`, `reports`.

`settings.hidden_stock_spots` is a JSON list of photo-route stops whose stock photo the person deleted; the
`photos` table holds only their own uploads.

`list_items.source` records where an item came from (`starter`, `import`, `custom`, or `extra` for
hand-added items after a person's fifth ever). Items from before the column existed count as `starter`.

Retention: activity audit rows a year, traffic rows a week, health snapshots 90 days, weather cache a day.
Photos are limited to 1.5 MB after shrinking and PDFs to 10 MB.

## Setup

```bash
npm install
cp .env.example .env.local
```

Set in `.env.local` (and in Vercel for production and preview):

- `DIFFUSION_DATABASE_URL` (or `DIFFUSION_DATABASE_DATABASE_URL` / `DATABASE_URL`) from Neon.
- `SESSION_SECRET`: a long random string. Required in production. It also derives the encryption key, so
  never rotate it without re-encrypting.
- `OWNER_EMAIL`: the organizer's sign-in email, or a comma-separated list of emails. Every listed account
  sees the Organizer page; the first one is the organizer proper and receives alerts and bug reports.
- `GMAIL_APP_PASSWORD`: an app password for the first `OWNER_EMAIL` (a Gmail account). Google Account > Security >
  2-Step Verification > App passwords. Without it, production reports mail as unavailable and the organizer
  copies reset links from the Organizer page instead.
- `SIGNUP_CODE`: the invite code shared with attendees. Account creation is refused in production without it.
- `GOOGLE_MAPS_API_KEY`: a Places API (New) key. The server forwards the site's origin as the Referer, so a
  key with HTTP-referrer restrictions must allow the deployed origin and `http://localhost:3000/*`.
- `WEATHER_API_KEY` from weatherapi.com. Optional; the weather panel hides without it.
- `WHATSAPP_GROUP_URL`: the attendees' WhatsApp invite link, shown under ABC WhatsApp.
- `CRON_SECRET`: any long random string. Vercel sends it as a bearer token for the daily health check.

Run:

```bash
npm run dev
```

Open `http://localhost:3000`. There is no local database; development talks to Neon too, so delete any
test accounts you create (Settings > Account) when you are done.

## Vercel

Use the Vercel Marketplace Neon integration when possible, then pull env vars:

```bash
vercel link
vercel env pull .env.local --yes
```

`vercel.json` defines the daily health-check cron. A redeploy does not sign anyone out or discard saved
work: sessions and data live in Neon, and open tabs keep running until they reload. Each build stamps its
API responses with `X-App-Build`; an open tab from an older build shows a "Reload" toast the first time it
notices, reloads itself when it comes back from the background with nothing typed, and if one of its requests
fails against the newer build the error says to reload.

## Bringing it back

On 2026-10-03, after the trip, the site was shut down so it stops using Vercel resources. Nothing was
deleted:

- The Vercel project `diffusion-bootcamp-2026-trip-planner` (id `prj_mi2RE1NhZNPGhpdtulaNt0kee8iN`) is
  **paused**. Visitors get an error page, no functions or crons run, and its deployments, domain, and
  environment variables are kept.
- The GitHub repository was **disconnected** from the project, so pushes to `main` no longer build.
- The Neon database is untouched and holds all accounts and trip data. Its compute suspends when idle.

To restore it, from a checkout linked to the project (`vercel link` if `.vercel/` is missing):

```bash
vercel api /v1/projects/prj_mi2RE1NhZNPGhpdtulaNt0kee8iN/unpause -X POST --input - <<<'{}'
vercel git connect https://github.com/bgfaulk/diffusion_bootcamp_2026_trip_planner
```

Or use the dashboard: the project page offers Resume, and Settings > Git connects the repository. Then:

1. Check the environment variables listed under [Setup](#setup) are still present for Production and
   Preview (`vercel env ls`). Keep `SESSION_SECRET` unchanged: it derives the encryption key, and a new one
   makes every stored record unreadable.
2. If the Gmail app password or the Google Places key was revoked, create new ones and update
   `GMAIL_APP_PASSWORD` / `GOOGLE_MAPS_API_KEY`.
3. Redeploy (`vercel --prod`, or push to `main` once Git is connected) and open the site. The daily health
   check in `vercel.json` resumes on its own.

If the Vercel project was deleted instead, create a new one from the repository, reconnect Neon (Vercel
Marketplace integration or `DIFFUSION_DATABASE_URL`), and set every variable from `.env.example` again using
the original `SESSION_SECRET`.

## Layout

- `src/app/api/**/route.ts`: API routes. Every route is wrapped in `withAudit`, `withTraffic`, or
  `withQuiet` from `src/lib/audit.ts` and calls `requireUser()` or `requireOwner()`.
- `src/lib`: auth and sessions, crypto, database and schema, admin queries, health checks, mail, rate
  limiting, validation, plan parsing, image shrinking.
- `src/app/planner.tsx`: the signed-in app shell and pages. `organizer.tsx`, `onboarding.tsx`,
  `trip-bookings.tsx`, `weather.tsx`, `user-guide.tsx`, and friends hold the larger pieces.
- `src/app/globals.css`: all styling, including the Dark and Digital Nirvana themes and the phone layout.

See `AGENTS.md` for conventions when changing the code.
