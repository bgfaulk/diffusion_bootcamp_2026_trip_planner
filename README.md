# Diffusion Bootcamp 2026 Trip Planner

A Vercel-ready trip planner for short-lived training trips and San Francisco itinerary planning.

- Email/password login with first-login account creation
- Password update from the login screen for short-lived use
- Neon Postgres-backed settings, lists, photos, and generated itinerary content
- Google Places-powered address lookup for wizard/settings fields
- Light/dark theme toggle
- Profile dropdown, settings, setup wizard, and guarded API routes
- Custom checklist items, delete actions, and checked items moved out of the way
- San Francisco itinerary planner handoff modal for ChatGPT

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
- `SESSION_SECRET` to a long random string

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
