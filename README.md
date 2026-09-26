# Local Trip Planner

A private, local-first trip dashboard with:

- SQLite-backed checklists and settings
- Generic trip setup wizard
- Mobile-friendly dashboard available on the same Wi-Fi
- SF-themed starter pages and photo gallery
- Custom checklist items, delete actions, and checked items moved out of the way
- Local teardown flow for deleting the database and removing the local app folder

This repository intentionally contains no personal booking information, traveler names, PDFs, or private trip data.

## Run locally

Mac/Linux:

```bash
python3 app.py
```

Windows:

```powershell
py app.py
```

Then open:

```text
http://localhost:8767
```

The app shows the same-network phone URL after it starts.

## Data

Runtime data is written to:

```text
data/trip_planner.sqlite3
```

Do not commit the `data/` folder.

## Sharing

For non-technical users, publish packaged Mac/Windows downloads through GitHub Releases. Each user gets their own local SQLite database on their own computer.
