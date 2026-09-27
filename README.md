# Diffusion Bootcamp 2026 Trip Planner

A Vercel-ready trip planner for short-lived training trips and San Francisco itinerary planning.

- Two-step email/password login with first-login account creation
- Setup wizard: answer a few questions, hand ChatGPT one prompt, upload the trip-plan.json it returns
- Overview with the day's bookings, itinerary stops, and the bootcamp agenda
- Checklists, bookings, PDFs, photo route, and a structured itinerary view
- Neon Postgres storage with per-field AES-256-GCM encryption keyed from SESSION_SECRET
- Google Places address lookup and a weather proxy, both server-side so keys stay private
- Light, Dark, and Digital Nirvana themes

This repository intentionally contains no personal booking information, traveler names, PDFs, or private trip data. Runtime data belongs in Neon and Vercel environment variables, not git.

## Setup

Install dependencies:

```bash
npm install
```

Copy env placeholders:

```bash
cp .env.example .env.local
```

Set:

- `DIFFUSION_DATABASE_URL`, `DIFFUSION_DATABASE_DATABASE_URL`, or `DATABASE_URL` from Neon
- `GOOGLE_MAPS_API_KEY` from Google Cloud
- `SESSION_SECRET` to a long random string (required in production; it also derives the encryption key, so never rotate it without re-encrypting)
- `WEATHER_API_KEY` from weatherapi.com (optional; the weather panel hides without it)
- `OWNER_EMAIL` to the organizer's sign-in email. That account gets an Organizer tab in Settings for creating
  password reset links; there is no email sending, so the organizer sends the link to the attendee by hand.
  Links last 24 hours and work once.

Run:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Vercel

Use Vercel Marketplace Neon when possible, then pull env vars:

```bash
vercel link
vercel env pull .env.local --yes
```

## Google APIs

Enable Places API (New). The app calls Google from server routes, so the API key is not exposed to the browser.
