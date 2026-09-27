"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { buildWizardPrompt, extractJson, parseAnswers, trainingAgenda, type WizardAnswers } from "@/lib/plan";
import { AbcLoader, AbcMark, ActionMenu, DestinationField, InterestFields, LoginScreen, PlanningChoice, SetupWizard, TravelerFields, TripDateFields } from "./onboarding";
import { primeChime } from "@/lib/chime";
import { PlaceInput } from "./place-input";
import { TabPanel, Tabs } from "./tabs";
import { JsonFileInput } from "./json-file-input";
import { BookingForm, bookingCategories, categoryTitle } from "./trip-bookings";
import { NirvanaBackdrop } from "./nirvana-backdrop";
import { PageIcon } from "./page-icons";
import { useWeather, WeatherPanel } from "./weather";
import { photoSpots } from "@/lib/photo-spots";
import { applyFx, applyTheme, storedFx, storedTheme, THEMES, themeLabels, type Theme } from "@/lib/theme";
import { buildTripModel, countdown, dayKey, daysBetween, fmtDay, fmtMinutes, fmtShort, keyToDate, parseItinerary, parseWhen, type DayEvent, type ParsedPlan, type TimedBooking, type TripModel } from "@/lib/trip-time";

type Item = { id: string; page: string; title: string; checked: boolean; position: number };
type TripInfo = {
  id: string;
  category: "flight" | "hotel" | "rental" | "training" | "insurance" | "other";
  title: string;
  provider?: string;
  confirmation_number?: string;
  start_at?: string;
  end_at?: string;
  address?: string;
  phone?: string;
  notes?: string;
};
type TripDocument = {
  id: string;
  label: string;
  file_name: string;
  content_type: string;
  created_at: string;
  viewUrl: string;
  downloadUrl: string;
};
type Settings = {
  profile_name?: string;
  trip_name?: string;
  home_address?: string;
  home_place_id?: string;
  training_location?: string;
  training_place_id?: string;
  theme?: Theme;
  planning_mode?: "ai" | "manual" | null;
  planning_answers?: string;
} | null;
type AppState = {
  user: null | { id: string; email: string; owner?: boolean };
  settings: Settings;
  items: Item[];
  photos: Record<string, { id: string; caption: string; imageUrl: string }>;
  itinerary: null | { instructions?: string; response?: string; saved_plan?: string };
  tripInfo: TripInfo[];
  tripDocuments: TripDocument[];
};

const emptyAppState: AppState = {
  user: null,
  settings: null,
  items: [],
  photos: {},
  itinerary: null,
  tripInfo: [],
  tripDocuments: []
};

// Per-device hint that a session exists, so the loader can start before bootstrap answers.
function sessionHint() { try { return localStorage.getItem("trip-session") === "1"; } catch { return false; } }
function rememberSession(on: boolean) { try { if (on) localStorage.setItem("trip-session", "1"); else localStorage.removeItem("trip-session"); } catch {} }

const enterMessages = ["Loading your trip", "Checking your bookings", "Lining up your days", "Almost there"];

const pageLabels: Record<string, string> = {
  overview: "Overview",
  prechecks: "Pre-checks",
  packing: "Packing",
  departure: "Departure Day",
  explore: "Explore San Francisco",
  tripInfo: "Trip Information",
  gallery: "Photo Route",
  return: "Return Day"
};

const listPages = ["prechecks", "packing", "departure", "return"];

export default function Home() {
  const [data, setData] = useState<AppState>(emptyAppState);
  const [page, setPage] = useState("overview");
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  // Sidebar collapse is a per-device preference.
  const [collapsed, setCollapsed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // The ABC bumper plays on every sign-in (and on load with a saved session); it holds until data is ready.
  const [entering, setEntering] = useState(false);
  const [enterDone, setEnterDone] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [choosingPlan, setChoosingPlan] = useState(false);
  const [itineraryOpen, setItineraryOpen] = useState(false);
  const [viewer, setViewer] = useState<null | string>(null);
  // Theme mirrors the account setting once loaded; before that (and on the login screen) it is the
  // last theme used on this device. Grid effects are a per-device preference.
  const [theme, setThemeState] = useState<Theme>("light");
  const [fx, setFx] = useState(true);

  function apply(next: Partial<AppState>) {
    setData(normalizeAppState(next));
    if (next.settings?.theme) { applyTheme(next.settings.theme); setThemeState(next.settings.theme); }
  }

  async function loadState() {
    const next = (await api("/api/bootstrap", { signal: AbortSignal.timeout(20000) })) as Partial<AppState>;
    apply(next);
    return next;
  }

  async function load() { await loadState(); }

  // Checklist edits change one row; apply them to local state instead of refetching every table.
  function patchItems(update: (items: Item[]) => Item[]) {
    setData(current => ({ ...current, items: update(current.items) }));
  }

  async function enterAfterSignIn() {
    setEnterDone(false);
    setEntering(true);
    try { await load(); rememberSession(true); } finally { setEnterDone(true); }
  }

  // Close the profile menu when clicking anywhere outside it, or on Escape.
  useEffect(() => {
    if (!profileOpen) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape") setProfileOpen(false); }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [profileOpen]);

  useEffect(() => {
    const remembered = storedTheme();
    applyTheme(remembered); setThemeState(remembered);
    const effects = storedFx();
    applyFx(effects); setFx(effects);
    try { setCollapsed(localStorage.getItem("trip-sidebar") === "collapsed"); } catch {}
    // A device that signed in before starts the ABC bumper right away, while the data loads behind it.
    // If the session turns out to be gone, the bumper gives way to the login screen.
    const hinted = sessionHint();
    if (hinted) { setEnterDone(false); setEntering(true); }
    loadState().then(next => {
      if (next?.user) { rememberSession(true); setEnterDone(true); setEntering(true); }
      else { rememberSession(false); setEntering(false); }
    }).catch(() => { rememberSession(false); setEntering(false); }).finally(() => setLoaded(true));
    // Any early click (e.g. into the email field) unlocks audio for the loader's chime.
    const prime = () => primeChime();
    document.addEventListener("pointerdown", prime, { once: true });
    return () => document.removeEventListener("pointerdown", prime);
  }, []);

  const displayName = data.settings?.profile_name?.trim() || "";
  const tripName = data.settings?.trip_name || "San Francisco trip planner";
  const initials = (displayName || data.user?.email || "?").charAt(0).toUpperCase();
  // Sidebar counts: what's still left to do on each page.
  const remaining: Record<string, number> = {
    ...Object.fromEntries(["prechecks", "packing", "departure", "explore", "return"].map(key => [key, data.items.filter(item => item.page === key && !item.checked).length])),
    gallery: photoSpots.filter(([id]) => !data.photos[id]).length
  };

  async function choosePlanning(mode: "ai" | "manual") {
    const answers = { ...parseAnswers(data.settings?.planning_answers), step: 0, completed: false, dismissed: false };
    await api("/api/planning", { method: "POST", body: JSON.stringify({ mode, answers, theme }) });
    setWizardOpen(true);
    setChoosingPlan(false);
    setPage("overview");
    await load();
  }

  // Leave setup from the choice screen: open the planner with a "finish setup" banner.
  async function setUpLater() {
    const answers = { ...parseAnswers(data.settings?.planning_answers), dismissed: true };
    await api("/api/planning", { method: "POST", body: JSON.stringify({ answers, theme }) });
    setChoosingPlan(false);
    setPage("overview");
    await load();
  }

  // Back into setup where they left off (the choice screen if they never picked a path).
  async function resumeSetup() {
    setProfileOpen(false);
    if (!data.settings?.planning_mode) return setChoosingPlan(true);
    const answers = parseAnswers(data.settings.planning_answers);
    if (answers.dismissed) {
      await api("/api/planning", { method: "POST", body: JSON.stringify({ answers: { ...answers, dismissed: false } }) });
      await load();
    }
    setWizardOpen(true);
  }

  async function signOut() {
    await api("/api/auth", { method: "DELETE" }).catch(() => {});
    rememberSession(false);
    setWizardOpen(false);
    setChoosingPlan(false);
    setProfileOpen(false);
    setPage("overview");
    setData(emptyAppState);
  }

  async function saveSettings(form: HTMLFormElement, extras: Record<string, unknown> = {}) {
    const payload = { ...Object.fromEntries(new FormData(form).entries()), ...extras };
    await api("/api/settings", { method: "POST", body: JSON.stringify(payload) });
    await load();
  }

  async function chooseTheme(next: Theme) {
    if (next === theme) return;
    applyTheme(next); setThemeState(next);
    await api("/api/settings", { method: "POST", body: JSON.stringify({ ...settingPayload(data.settings), theme: next }) });
    await load();
  }

  function toggleFx() {
    const next = !fx;
    setFx(next); applyFx(next);
  }

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem("trip-sidebar", next ? "collapsed" : "open"); } catch {}
  }

  // Weather for where the person actually is (browser location, rounded to ~100 m), falling back to the
  // training location until they allow it or if they decline.
  const [geo, setGeo] = useState<string | null>(null);
  useEffect(() => {
    if (!data.user || typeof navigator === "undefined" || !navigator.geolocation) return;
    try { const saved = localStorage.getItem("trip-geo"); if (saved) setGeo(saved); } catch {}
    navigator.geolocation.getCurrentPosition(
      position => {
        const next = `${position.coords.latitude.toFixed(3)},${position.coords.longitude.toFixed(3)}`;
        setGeo(next);
        try { localStorage.setItem("trip-geo", next); } catch {}
      },
      () => {},
      { maximumAge: 30 * 60 * 1000, timeout: 10000 }
    );
  }, [data.user]);
  const weather = useWeather(data.user ? (geo || data.settings?.training_location || "Redwood City, CA") : null);

  const backdrop = (inApp: boolean) => (theme === "nirvana" && fx ? <NirvanaBackdrop dim={inApp} /> : null);

  if (entering) return <AbcLoader done={enterDone} failed={false} onFinish={() => setEntering(false)} onFailed={() => setEntering(false)} messages={enterMessages} />;
  if (!loaded) return null;
  if (!data.user) return <>{backdrop(false)}<LoginScreen onSignedIn={enterAfterSignIn} /></>;
  const settings = data.settings;
  const answers = parseAnswers(settings?.planning_answers);
  const mode = settings?.planning_mode;
  if (choosingPlan || (!mode && !answers.dismissed)) return <>{backdrop(false)}<PlanningChoice onChoose={choosePlanning} onLater={setUpLater} onSignOut={signOut} /></>;
  // The wizard only shows until setup is finished. It resumes on the saved step (including after
  // signing out and back in) unless they chose to leave it; "Finish setup" brings them back.
  if (mode && (wizardOpen || (!answers.completed && !answers.dismissed))) {
    return (
      <>{backdrop(false)}<SetupWizard
        mode={mode}
        initial={{
          ...answers,
          bookingEmail: answers.bookingEmail || data.user.email,
          // Settings is the source of truth for fields that are editable there.
          displayName: settings?.profile_name || answers.displayName,
          tripName: settings?.trip_name || answers.tripName,
          homeCity: settings?.home_address || answers.homeCity,
          trainingLocation: settings?.training_location || answers.trainingLocation
        }}
        settings={settings}
        bookings={data.tripInfo}
        places={data.items.filter(item => item.page === "explore")}
        reload={load}
        onFinish={async next => {
          if (next) apply(next as Partial<AppState>); else await load();
          setWizardOpen(false);
          setPage("overview");
          window.scrollTo({ top: 0 });
        }}
        onSwitchMode={choosePlanning}
        onBackToChoice={async () => { await load(); setWizardOpen(false); setChoosingPlan(true); }}
        onSignOut={signOut}
      /></>
    );
  }

  return (
    <>{backdrop(true)}<div className="app-shell">
      <aside className={collapsed ? "sidebar collapsed" : "sidebar"}>
        <div className="brand">
          <AbcMark small />
          {!collapsed && <span className="brand-divider" aria-hidden="true" />}
          {!collapsed && <div><strong>Trip Planner</strong><span>{tripName}</span></div>}
          <button type="button" className="sidebar-toggle" onClick={toggleSidebar} aria-expanded={!collapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} /></svg>
          </button>
        </div>
        <nav className="primary-nav" aria-label="Pages">
          {["overview", "prechecks", "packing", "departure", "explore", "tripInfo", "gallery", "return"].map(key => (
            <button key={key} className={page === key ? "active" : ""} onClick={() => setPage(key)} title={collapsed ? pageLabels[key] : undefined} aria-label={collapsed ? pageLabels[key] : undefined} aria-current={page === key ? "page" : undefined}>
              <PageIcon page={key} />
              {!collapsed && <span className="nav-label">{pageLabels[key]}</span>}
              {remaining[key] > 0 && <span className="nav-count" aria-label={`${remaining[key]} left`}>{remaining[key]}</span>}
            </button>
          ))}
        </nav>
        <WeatherPanel weather={weather} collapsed={collapsed} />
        <div className="profile" ref={profileRef}>
          <button className="profile-button" onClick={() => setProfileOpen(open => !open)} title={collapsed ? (displayName || data.user.email) : undefined}>
            <span className="avatar">{initials}</span>{!collapsed && (displayName ? <span><strong>{displayName}</strong><small>{data.user.email}</small></span> : <span className="profile-email"><strong>{data.user.email}</strong></span>)}{!collapsed && <span>⌄</span>}
          </button>
          {profileOpen && (
            <div className="profile-popover">
              <button onClick={() => { setPage("settings"); setProfileOpen(false); }}>Settings</button>
              {!answers.completed && <button onClick={resumeSetup}>Finish setup</button>}
              <div className="theme-picker" role="radiogroup" aria-label="Theme">
                <span>Theme</span>
                <div>
                  {THEMES.map(option => (
                    <button key={option} type="button" role="radio" aria-checked={theme === option} onClick={() => chooseTheme(option)}>{themeLabels[option]}</button>
                  ))}
                </div>
              </div>
              {theme === "nirvana" && <button type="button" onClick={toggleFx}>Grid effects: {fx ? "On" : "Off"}</button>}
              <button className="sign-out" onClick={signOut}>Sign out</button>
            </div>
          )}
        </div>
      </aside>

      <main className="content">
        {!answers.completed && (
          <div className="setup-banner" role="status">
            <div><strong>Finish setting up your trip</strong><span>{mode === "ai" ? "ChatGPT hasn't built your itinerary, checklists, or bookings yet." : "Add your dates, bookings, travelers, and interests to get the most out of the planner."}</span></div>
            <button className="btn primary" onClick={resumeSetup}>Finish setup</button>
          </div>
        )}
        {page === "overview" && <Overview tripName={tripName} settings={data.settings} answers={answers} itinerary={data.itinerary} tripInfo={data.tripInfo} goTo={setPage} />}
        {listPages.includes(page) && <ListPage pageKey={page} items={data.items} onItems={patchItems} />}
        {page === "explore" && <ExplorePage items={data.items.filter(item => item.page === "explore")} itinerary={data.itinerary} startDate={answers.startDate} openModal={() => setItineraryOpen(true)} reload={load} onItems={patchItems} />}
        {page === "tripInfo" && <TripInfoPage tripInfo={data.tripInfo} tripDocuments={data.tripDocuments} reload={load} />}
        {page === "gallery" && <Gallery photos={data.photos} openViewer={setViewer} reload={load} />}
        {page === "settings" && <SettingsPage settings={data.settings} owner={Boolean(data.user.owner)} saveSettings={saveSettings} reload={load} />}
      </main>

      {itineraryOpen && <ItineraryModal items={data.items.filter(item => item.page === "explore")} itinerary={data.itinerary} answers={answers} hasTripData={Boolean(data.itinerary?.saved_plan) || data.tripInfo.length > 0} onClose={() => setItineraryOpen(false)} reload={load} />}
      {viewer && <PhotoViewer spot={viewer} photos={data.photos} onClose={() => setViewer(null)} />}
    </div></>
  );
}

function normalizeAppState(next: Partial<AppState>): AppState {
  return {
    ...emptyAppState,
    ...next,
    settings: next.settings || null,
    items: Array.isArray(next.items) ? next.items : [],
    photos: next.photos && typeof next.photos === "object" ? next.photos : {},
    itinerary: next.itinerary || null,
    tripInfo: Array.isArray(next.tripInfo) ? next.tripInfo : [],
    tripDocuments: Array.isArray(next.tripDocuments) ? next.tripDocuments : []
  };
}

// Dev only: ?today=2026-10-13 previews the Overview as if it were that day.
function overviewNow() {
  if (process.env.NODE_ENV !== "production" && typeof location !== "undefined") {
    const override = parseWhen(new URLSearchParams(location.search).get("today"));
    if (override) {
      const now = new Date();
      const minutes = override.minutes ?? now.getHours() * 60 + now.getMinutes();
      return new Date(override.y, override.m - 1, override.d, Math.floor(minutes / 60), minutes % 60);
    }
  }
  return new Date();
}

// The Overview answers "what's happening today?" Before the trip it previews day 1; during the trip it shows
// that day's bookings and itinerary stops; everything else is compact facts and stats built from the data.
function Overview({ tripName, settings, answers, itinerary, tripInfo, goTo }: { tripName: string; settings: Settings; answers: WizardAnswers; itinerary: AppState["itinerary"]; tripInfo: TripInfo[]; goTo: (page: string) => void }) {
  const [barOpen, setBarOpen] = useState(false);
  const [now, setNow] = useState(overviewNow);
  // Re-evaluate once a minute so finished items move to "Earlier today" as the day goes on.
  useEffect(() => { const timer = setInterval(() => setNow(overviewNow()), 60 * 1000); return () => clearInterval(timer); }, []);
  const savedPlan = itinerary?.saved_plan;
  const trip = useMemo(() => buildTripModel({ startDate: answers.startDate, endDate: answers.endDate, bookings: tripInfo, itinerary: savedPlan, now }), [answers.startDate, answers.endDate, tripInfo, savedPlan, now]);
  const facts = factRows(answers, settings, trip);
  const status = trip.phase === "before" && trip.startKey ? `Trip starts ${countdown(now, keyToDate(trip.startKey)) || "today"}`
    : trip.phase === "during" ? `Day ${trip.dayNumber} of ${trip.totalDays ?? "?"}`
    : trip.phase === "after" ? "Trip complete" : "Add your dates in Settings";
  const summary = [
    trip.startKey && trip.endKey ? `${fmtShort(trip.startKey)} to ${fmtShort(trip.endKey)}` : "",
    trip.route.split(", ")[0] || "",
    answers.travelerCount > 1 ? `${answers.travelerCount} travelers` : answers.travelers
  ].filter(Boolean).join(" · ");
  return (
    <section className="page active">
      <div className="hero-card">
        <div className="hero-main">
          <p className="eyebrow">Bay Area planner</p>
          <h1>{tripName}</h1>
          <p className="hero-status"><span className={`phase-pill ${trip.phase}`}>{status}</span>{summary && <span className="muted">{summary}</span>}</p>
        </div>
        <div className="hero-next">
          <span className="eyebrow">Next up</span>
          {trip.nextUp ? (
            <>
              <strong>{trip.nextUp.title}</strong>
              <span>{trip.nextUp.when}{trip.nextUp.relative && ` · ${trip.nextUp.relative}`}</span>
              {trip.nextUp.detail && <span className="muted">{trip.nextUp.detail}</span>}
            </>
          ) : <span className="muted">{trip.phase === "after" ? `All done. The trip wrapped up ${trip.endKey ? fmtDay(trip.endKey) : ""}.` : "Nothing scheduled yet. Add bookings or build an itinerary."}</span>}
        </div>
      </div>
      {(trip.stats.length > 0 || facts.length > 0) && (
        <section className={barOpen ? "trip-bar open" : "trip-bar"}>
          <button type="button" className="trip-bar-summary" aria-expanded={barOpen} aria-controls="trip-bar-details" onClick={() => setBarOpen(open => !open)}>
            <span className="trip-bar-stats">
              {trip.stats.length ? trip.stats.map(stat => (
                <span className="trip-stat" key={stat.label} title={stat.note}><span className="eyebrow">{stat.label}</span><strong>{stat.value}</strong></span>
              )) : <span className="muted">Trip details</span>}
            </span>
            <span className="trip-bar-toggle" title={barOpen ? "Hide trip details" : "Show trip details"}>
              <span className="visually-hidden">{barOpen ? "Hide trip details" : "Show trip details"}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </span>
          </button>
          {barOpen && (
            <div id="trip-bar-details" className="trip-bar-details">
              {facts.length ? (
                <table className="fact-table">
                  <thead><tr><th>Item</th><th>Date</th><th>Time</th><th>Details</th></tr></thead>
                  <tbody>
                    {facts.map(row => <tr key={row.label}><td>{row.label}</td><td className="when">{row.date}</td><td className="when">{row.time}</td><td className="detail">{row.detail}</td></tr>)}
                  </tbody>
                </table>
              ) : <p className="muted">Add your dates and bookings to fill this in.</p>}
            </div>
          )}
        </section>
      )}
      <TodayPanel trip={trip} now={now} goTo={goTo} />
    </section>
  );
}

function TodayPanel({ trip, now, goTo }: { trip: TripModel; now: Date; goTo: (page: string) => void }) {
  const [showPast, setShowPast] = useState(false);
  const heading = trip.phase === "before" && trip.focusKey ? `Day 1 · ${fmtDay(trip.focusKey)}`
    : trip.phase === "during" && trip.focusKey ? `Today · ${fmtDay(trip.focusKey)}`
    : trip.phase === "after" ? "You're home" : "No dates yet";
  const sub = trip.phase === "before" ? `Here's how your first day looks.${trip.startKey ? ` The trip starts ${countdown(now, keyToDate(trip.startKey)) || "today"}.` : ""}`
    : trip.phase === "during" ? `Day ${trip.dayNumber} of ${trip.totalDays ?? "?"}${trip.focusDay && !/^day\s*\d/i.test(trip.focusDay.label) ? ` · ${trip.focusDay.label}` : ""}`
    : trip.phase === "after" ? "The trip is over. Your photos and itinerary are still here whenever you want them."
    : "Add your travel dates in Settings so the planner knows which day to show.";
  // On the actual day, timed items slide into "Earlier today" once their time has passed.
  const live = trip.phase === "during" && trip.focusKey === trip.todayKey;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const past = live ? trip.events.filter(event => event.minutes !== null && event.minutes < nowMinutes) : [];
  const upcoming = live ? trip.events.filter(event => !past.includes(event)) : trip.events;
  const nextIndex = live ? upcoming.findIndex(event => event.minutes !== null) : -1;
  const tag = (kind: DayEvent["kind"]) => kind === "booking" ? "Booking" : kind === "training" ? "Training" : "Itinerary";
  return (
    <section className="day-panel">
      <div className="panel-head"><div><h2>{heading}</h2><p className="muted">{sub}</p></div>{trip.phase !== "after" && <button className="link-button" onClick={() => goTo("explore")}>Edit itinerary</button>}</div>
      {upcoming.length ? (
        <ol className="day-list">
          {upcoming.map((event, index) => (
            <li key={index} className={`${event.kind}${index === nextIndex ? " next" : ""}`}>
              <span className="day-time">{event.time || "Any time"}</span>
              <div><strong>{event.title}</strong>{event.detail && <span>{event.detail}</span>}</div>
              <em>{index === nextIndex ? "Up next" : tag(event.kind)}</em>
            </li>
          ))}
        </ol>
      ) : trip.events.length ? <p className="check-empty all-done">That&apos;s everything for today.</p>
      : trip.phase === "before" || trip.phase === "during" ? <p className="muted">Nothing scheduled for this day yet. Add stops on the Explore page or bookings under Trip Information.</p> : null}
      {past.length > 0 && (
        <section className="check-section">
          <div className="check-section-head"><h2>Earlier today · {past.length}</h2><button type="button" className="link-button" onClick={() => setShowPast(show => !show)}>{showPast ? "Hide" : "Show"}</button></div>
          {showPast && (
            <ol className="day-list">
              {past.map((event, index) => (
                <li key={index} className={`${event.kind} past`}>
                  <span className="day-time">{event.time}</span>
                  <div><strong>{event.title}</strong>{event.detail && <span>{event.detail}</span>}</div>
                  <em>Done</em>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
      {trip.phase === "after" && <div className="button-row"><button className="btn" onClick={() => goTo("gallery")}>Open photo route</button><button className="btn" onClick={() => goTo("explore")}>Review the itinerary</button></div>}
    </section>
  );
}

// One row per trip fact for the details table under the hero bar.
type FactRow = { label: string; date: string; time: string; detail: string };
function factRows(answers: WizardAnswers, settings: Settings, trip: TripModel): FactRow[] {
  const date = (booking?: TimedBooking) => booking?.start ? fmtDay(dayKey(booking.start)) : booking?.start_at || "";
  const time = (booking?: TimedBooking) => booking?.start ? fmtMinutes(booking.start.minutes) : "";
  const legs = trip.route.split(", ");
  const nights = trip.startKey && trip.endKey ? daysBetween(trip.startKey, trip.endKey) : 0;
  const travelers = answers.travelers || (answers.travelerCount > 1 ? `${answers.travelerCount} people` : "");
  return [
    { label: "Dates", date: trip.startKey && trip.endKey ? `${fmtShort(trip.startKey)} to ${fmtShort(trip.endKey)}` : trip.startKey ? fmtShort(trip.startKey) : "", time: "", detail: nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "" },
    { label: "Flight out", date: date(trip.outbound), time: time(trip.outbound), detail: [trip.outbound?.provider, legs[0], trip.outbound?.confirmation_number && `Conf. ${trip.outbound.confirmation_number}`].filter(Boolean).join(" · ") },
    { label: "Flight home", date: date(trip.homebound), time: time(trip.homebound), detail: [trip.homebound?.provider, legs[1], trip.homebound?.confirmation_number && `Conf. ${trip.homebound.confirmation_number}`].filter(Boolean).join(" · ") },
    { label: "Hotel", date: date(trip.hotel), time: time(trip.hotel), detail: [trip.hotel?.provider || trip.hotel?.title, trip.hotel?.address].filter(Boolean).join(" · ") },
    { label: "Training", date: date(trip.training), time: time(trip.training), detail: settings?.training_location || trip.training?.address || "" },
    { label: "Travelers", date: "", time: "", detail: travelers },
    { label: "Route", date: "", time: "", detail: trip.route ? `${trip.route} · about ${trip.miles.toLocaleString("en-US")} miles` : "" }
  ].filter(row => row.date || row.time || row.detail);
}

const listTaglines: Record<string, string> = {
  prechecks: "Confirmations and loose ends to tie up before you fly.",
  packing: "Everything that needs to make it into the bag.",
  departure: "Your morning-of runbook, top to bottom.",
  return: "Check out, hand back the keys, and get home."
};

type ItemsPatch = (update: (items: Item[]) => Item[]) => void;

function ListPage({ pageKey, items, onItems }: { pageKey: string; items: Item[]; onItems: ItemsPatch }) {
  const visible = items.filter(item => item.page === pageKey);
  const done = visible.filter(item => item.checked).length;
  const total = visible.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const status = !total ? "Add your first item" : done === total ? "All done" : `${total - done} to go`;
  return (
    <section className="page active">
      <header className="checklist-hero">
        <div>
          <p className="eyebrow">{listTaglines[pageKey] || "Editable checklist"}</p>
          <h1>{pageLabels[pageKey]}</h1>
          <AddItemForm pageKey={pageKey} onItems={onItems} />
        </div>
        <div className="progress-block" role="group" aria-label="Progress">
          <strong>{done}<small>of {total} done</small></strong>
          <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ width: `${percent}%` }} /></div>
          <span>{status}</span>
        </div>
      </header>
      <Checklist pageKey={pageKey} items={items} onItems={onItems} />
    </section>
  );
}

function AddItemForm({ pageKey, onItems, placeholder = "Add an item" }: { pageKey: string; onItems: ItemsPatch; placeholder?: string }) {
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = String(new FormData(form).get("title") || "").trim();
    if (!title) return;
    const { item } = await api("/api/items", { method: "POST", body: JSON.stringify({ page: pageKey, title }) });
    form.reset();
    onItems(items => [...items, item]);
  }
  return <form className="item-form" onSubmit={add}><input name="title" placeholder={placeholder} maxLength={180} aria-label={placeholder} /><button className="btn primary">Add</button></form>;
}

// Open items first; finished ones collapse into a "Done" group underneath so the list stays about what's left.
function Checklist({ pageKey, items, onItems }: { pageKey: string; items: Item[]; onItems: ItemsPatch }) {
  const [showDone, setShowDone] = useState(true);
  const visible = items.filter(item => item.page === pageKey);
  const open = visible.filter(item => !item.checked);
  const done = visible.filter(item => item.checked);
  return (
    <div className="check-groups">
      {!visible.length && <p className="check-empty">Nothing here yet. Add your first item above.</p>}
      {open.length > 0 && <ol className="check-list">{open.map(item => <ChecklistItem key={item.id} item={item} onItems={onItems} />)}</ol>}
      {visible.length > 0 && !open.length && <p className="check-empty all-done">Everything is checked off. Nice work.</p>}
      {done.length > 0 && (
        <section className="check-section">
          <div className="check-section-head"><h2>Done · {done.length}</h2><button type="button" className="link-button" onClick={() => setShowDone(show => !show)}>{showDone ? "Hide" : "Show"}</button></div>
          {showDone && <ol className="check-list">{done.map(item => <ChecklistItem key={item.id} item={item} onItems={onItems} />)}</ol>}
        </section>
      )}
    </div>
  );
}

// Places-to-visit tab on Explore: same list with its own add form.
function ChecklistBody({ pageKey, items, onItems, placeholder = "Add an item" }: { pageKey: string; items: Item[]; onItems: ItemsPatch; placeholder?: string }) {
  return <><AddItemForm pageKey={pageKey} onItems={onItems} placeholder={placeholder} /><Checklist pageKey={pageKey} items={items} onItems={onItems} /></>;
}

function ChecklistItem({ item, onItems }: { item: Item; onItems: ItemsPatch }) {
  async function toggle() {
    const checked = !item.checked;
    // Flip it right away and move it to the end of its new group, which is where the server puts it too.
    onItems(items => [...items.filter(other => other.id !== item.id), { ...item, checked }]);
    try {
      await api("/api/items", { method: "PATCH", body: JSON.stringify({ id: item.id, checked }) });
    } catch {
      onItems(items => items.map(other => (other.id === item.id ? { ...other, checked: !checked } : other)));
    }
  }
  async function remove() {
    await api("/api/items", { method: "DELETE", body: JSON.stringify({ id: item.id }) });
    onItems(items => items.filter(other => other.id !== item.id));
  }
  return (
    <li className={item.checked ? "check-card done" : "check-card"}>
      <label className="check-toggle">
        <input type="checkbox" className="visually-hidden" checked={item.checked} onChange={toggle} />
        <span className="check-box" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
        <span className="check-title">{item.title}</span>
      </label>
      <button type="button" className="check-remove" onClick={remove} aria-label={`Delete ${item.title}`}>×</button>
    </li>
  );
}

function ExplorePage({ items, itinerary, startDate, openModal, reload, onItems }: { items: Item[]; itinerary: AppState["itinerary"]; startDate: string; openModal: () => void; reload: () => Promise<void>; onItems: ItemsPatch }) {
  const [tab, setTab] = useState<"itinerary" | "places">("itinerary");
  const [confirmClear, setConfirmClear] = useState(false);
  const saved = itinerary?.saved_plan || "";
  const start = parseWhen(startDate);
  const plan = useMemo(() => parseItinerary(saved, start ? dayKey(start) : null), [saved, start?.y, start?.m, start?.d]); // eslint-disable-line react-hooks/exhaustive-deps
  const title = plan.days.length && plan.intro[0] ? plan.intro[0] : saved ? "Your itinerary" : "Build a custom itinerary";
  async function clear() {
    await api("/api/itinerary/clear", { method: "POST", body: JSON.stringify({}) });
    setConfirmClear(false);
    await reload();
  }
  return (
    <section className="page active">
      <header className="page-header page-header-row">
        <div><p className="eyebrow">Explore San Francisco</p><h1>{title}</h1></div>
        <ActionMenu label="Itinerary" items={[
          { label: saved ? "Plan again with ChatGPT" : "Plan with ChatGPT", onSelect: openModal },
          ...(saved ? [{ label: "Clear itinerary and start over", danger: true, onSelect: () => setConfirmClear(true) }] : [])
        ]} />
      </header>
      <Tabs label="Explore sections" active={tab} onChange={setTab} tabs={[
        { key: "itinerary", label: "Itinerary", count: plan.days.length || undefined },
        { key: "places", label: "Places to visit", count: items.length }
      ]} />
      {tab === "itinerary" && (
        <TabPanel id="itinerary">
          {saved ? <ItineraryView plan={plan} raw={saved} /> : (
            <div className="callout">
              <h2>No itinerary yet</h2>
              <p>Describe the kind of San Francisco trip you want, send the prepared prompt to ChatGPT, and bring the plan back here. Your places to visit are used as starting ideas.</p>
              <div className="button-row"><button className="btn primary" onClick={openModal}>Plan with ChatGPT</button></div>
            </div>
          )}
        </TabPanel>
      )}
      {tab === "places" && <TabPanel id="places"><ChecklistBody pageKey="explore" items={items} onItems={onItems} placeholder="Add a place you want to visit" /></TabPanel>}
      {confirmClear && (
        <div className="modal-backdrop" onClick={() => setConfirmClear(false)}>
          <section className="modal confirm-modal" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
            <button type="button" className="modal-x" onClick={() => setConfirmClear(false)} aria-label="Close">×</button>
            <p className="eyebrow">Explore San Francisco</p>
            <h2>Clear the itinerary?</h2>
            <p>This removes the saved plan and the ChatGPT response it came from. Bookings, checklists, and places to visit stay as they are.</p>
            <div className="button-row"><button className="btn" onClick={() => setConfirmClear(false)}>Keep it</button><button className="btn danger" onClick={clear}>Clear itinerary</button></div>
          </section>
        </div>
      )}
    </section>
  );
}

// The saved plan, laid out as day cards instead of raw text. Plans that don't parse into days fall back to prose.
function ItineraryView({ plan, raw }: { plan: ParsedPlan; raw: string }) {
  if (!plan.days.length) return <article className="plan-prose">{raw.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</article>;
  const overview = plan.intro.slice(1); // the first intro line is the plan title, shown as the page heading
  const stops = plan.days.reduce((sum, day) => sum + day.stops.length, 0);
  return (
    <div className="plan-view">
      <section className="plan-summary">
        <span className="plan-meta">{plan.days.length} {plan.days.length === 1 ? "day" : "days"} · {stops} {stops === 1 ? "stop" : "stops"}</span>
        {overview.length ? overview.map((paragraph, index) => <p key={index}>{paragraph}</p>) : <p className="muted">Your saved plan, day by day.</p>}
      </section>
      <div className="plan-days">
        {plan.days.map(day => (
          <section className="plan-day" key={`${day.index}-${day.label}`}>
            <header><span className="eyebrow">{day.key ? `Day ${day.index} · ${fmtDay(day.key)}` : day.label}</span><span className="muted">{day.stops.length} {day.stops.length === 1 ? "stop" : "stops"}</span></header>
            {day.stops.length ? (
              <ol className="day-list">
                {day.stops.map((stop, index) => (
                  <li key={index} className="stop">
                    <span className="day-time">{stop.time || "Any time"}</span>
                    <div><strong>{stop.place}</strong>{(stop.why || stop.address) && <span>{[stop.why, stop.address].filter(Boolean).join(" · ")}</span>}</div>
                  </li>
                ))}
              </ol>
            ) : <p className="muted">Nothing planned yet.</p>}
          </section>
        ))}
      </div>
      {plan.notes.length > 0 && (
        <section className="plan-notes">
          <h3>Practical notes</h3>
          <ul>{plan.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
        </section>
      )}
    </div>
  );
}

function ItineraryModal({ items, itinerary, answers, hasTripData, onClose, reload }: { items: Item[]; itinerary: AppState["itinerary"]; answers: WizardAnswers; hasTripData: boolean; onClose: () => void; reload: () => Promise<void> }) {
  const existing = Boolean(itinerary?.saved_plan);
  const [instructions, setInstructions] = useState(itinerary?.instructions || "");
  const [response, setResponse] = useState(itinerary?.response || "");
  const [file, setFile] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const prompt = useMemo(() => buildChatGptPrompt(instructions, items), [instructions, items]);
  const filePrompt = useMemo(() => buildWizardPrompt(answers), [answers]);

  async function persistText(nextInstructions = instructions, nextResponse = response) {
    await api("/api/itinerary", { method: "POST", body: JSON.stringify({ instructions: nextInstructions, response: nextResponse, savedPlan: itinerary?.saved_plan || "" }) }).catch(() => {});
  }
  async function saveText() {
    if (!response.trim()) return setError("Paste ChatGPT's itinerary first.");
    setError(""); setBusy(true);
    try {
      await api("/api/itinerary", { method: "POST", body: JSON.stringify({ instructions, response, savedPlan: response }) });
      await reload();
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save the itinerary"); } finally { setBusy(false); }
  }
  async function importFile() {
    setError(""); setBusy(true);
    try {
      extractJson(file);
      await api("/api/plan-import", { method: "POST", body: JSON.stringify({ response: file }) });
      await reload();
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't read that file"); } finally { setBusy(false); }
  }

  return (
    <FormModal eyebrow="Explore San Francisco" title={existing ? "Plan again with ChatGPT" : "Plan with ChatGPT"} onClose={onClose}>
      {existing && <p className="warn-banner"><strong>You already have an itinerary.</strong> Saving a pasted plan replaces it. Importing a trip-plan.json replaces your bookings, checklists, and itinerary with the file&apos;s contents.</p>}
      <label>Instructions<textarea value={instructions} onChange={event => setInstructions(event.target.value)} onBlur={() => persistText()} placeholder="We want walkable dinners, views, and one relaxed daytime idea..." /></label>
      <div className="button-row">
        <button className="btn" type="button" onClick={() => setInstructions(items.map(item => item.title).join("\n"))}>Use my places to visit</button>
        <button className="btn primary" type="button" onClick={() => window.open(`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`, "_blank")}>Open ChatGPT with prompt</button>
      </div>
      <label>Paste ChatGPT&apos;s itinerary<textarea value={response} onChange={event => setResponse(event.target.value)} onBlur={() => persistText()} placeholder="Paste the finished itinerary here after ChatGPT plans it." /></label>
      <div className="button-row"><button className="btn primary" type="button" disabled={busy} onClick={saveText}>{busy ? "Saving..." : existing ? "Replace itinerary" : "Save itinerary"}</button></div>
      <details className="plan-file">
        <summary>Have a full trip-plan.json from ChatGPT instead?</summary>
        <p className="muted">Use the setup prompt to get the whole trip back as a file, then drop it here. This rebuilds bookings, checklists, and the itinerary from the file.</p>
        <div className="button-row"><button className="btn" type="button" onClick={() => window.open(`https://chatgpt.com/?q=${encodeURIComponent(filePrompt)}`, "_blank")}>Open ChatGPT with the trip file prompt</button></div>
        <JsonFileInput value={file} onChange={setFile} placeholder='{ "tripName": "...", "records": [ ... ] }' />
        {hasTripData && <label className="ack"><input type="checkbox" checked={ack} onChange={event => setAck(event.target.checked)} />I understand this replaces my current trip data</label>}
        <div className="button-row"><button className="btn danger" type="button" disabled={busy || !file.trim() || (hasTripData && !ack)} onClick={importFile}>{busy ? "Importing..." : "Replace trip with this file"}</button></div>
      </details>
      {error && <p className="error">{error}</p>}
    </FormModal>
  );
}

function buildChatGptPrompt(instructions: string, items: Item[]) {
  return `Build a concise, practical San Francisco itinerary for a training trip web app.

User instructions:
${instructions || "(No custom instructions yet.)"}

Existing saved Explore San Francisco ideas:
${items.map(item => `- ${item.title}`).join("\n")}

Return the response in this format:
Title:
Overview:
Plan:
- Time or sequence | Place | Why it fits | Address/search phrase
Practical notes:
- Parking, layers, timing, reservations, and transit notes

Keep it mobile-readable, specific, and ready to save into the app.`;
}

function TripInfoPage({ tripInfo, tripDocuments, reload }: { tripInfo: TripInfo[]; tripDocuments: TripDocument[]; reload: () => Promise<void> }) {
  const [adding, setAdding] = useState<string | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<null | { kind: "booking" | "document"; id: string; label: string }>(null);
  const [tab, setTab] = useState<string>("flight");
  const singular = (category: string) => categoryTitle(category).replace(/s$/, "");
  const grouped = tripInfo.reduce<Record<string, TripInfo[]>>((groups, item) => {
    groups[item.category] = [...(groups[item.category] || []), item];
    return groups;
  }, {});

  async function uploadPdf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await api("/api/trip-documents", { method: "POST", body: new FormData(form) });
    form.reset();
    await reload();
    setPdfOpen(false);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { kind, id } = pendingDelete;
    await api(kind === "booking" ? "/api/trip-info" : "/api/trip-documents", { method: "DELETE", body: JSON.stringify({ id }) });
    setPendingDelete(null);
    await reload();
  }

  return (
    <section className="page active">
      <header className="page-header"><p className="eyebrow">Travel details</p><h1>Trip Information</h1></header>
      <div className="callout">
        <h2>Keep booking details in your own account</h2>
        <p>Add flights, hotels, rental cars, training addresses, insurance policy notes, and other reservations here. Nothing personal needs to live in the shared repo.</p>
      </div>

      <Tabs label="Trip information sections" active={tab} onChange={setTab} tabs={[
        ...bookingCategories.map(category => ({ key: category, label: categoryTitle(category), count: (grouped[category] || []).length })),
        { key: "documents", label: "PDFs", count: tripDocuments.length }
      ]} />

      {tab !== "documents" && (
        <TabPanel id={tab}>
          <section className="booking-section">
            <div className="panel-head"><h2>{categoryTitle(tab)}</h2><button className="btn primary" onClick={() => setAdding(tab)}>+ {singular(tab)} Details</button></div>
            {(grouped[tab] || []).length ? grouped[tab].map(item => (
              <article className="booking-card" key={item.id}>
                <div><strong>{item.title}</strong>{item.provider && <span>{item.provider}</span>}</div>
                {item.confirmation_number && <p><b>Confirmation:</b> {item.confirmation_number}</p>}
                {(item.start_at || item.end_at) && <p><b>When:</b> {[item.start_at, item.end_at].filter(Boolean).join(" to ")}</p>}
                {item.address && <p><b>Address:</b> <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}`} target="_blank" rel="noreferrer">{item.address}</a></p>}
                {item.phone && <p><b>Phone:</b> <a href={`tel:${item.phone}`}>{item.phone}</a></p>}
                {item.notes && <p>{item.notes}</p>}
                <div className="card-actions"><button type="button" className="btn danger" onClick={() => setPendingDelete({ kind: "booking", id: item.id, label: item.title })}>Delete booking</button></div>
              </article>
            )) : <p className="muted">No {categoryTitle(tab).toLowerCase()} details yet.</p>}
          </section>
          {tab === "training" && <TrainingSchedule record={grouped.training?.[0]} />}
        </TabPanel>
      )}

      {tab === "documents" && (
        <TabPanel id="documents">
          <section className="documents-panel">
            <div className="panel-head">
              <div>
                <h2>Insurance or protection PDFs</h2>
                <p className="muted">Upload a policy or protection PDF so it can be viewed or downloaded from the trip.</p>
              </div>
              <button className="btn primary" onClick={() => setPdfOpen(true)}>+ PDF</button>
            </div>
            <div className="document-list">
              {tripDocuments.length ? tripDocuments.map(document => (
                <article className="document-row" key={document.id}>
                  <div><strong>{document.label}</strong><span>{document.file_name}</span></div>
                  <div className="button-row"><a className="btn" href={document.viewUrl} target="_blank" rel="noreferrer">View</a><a className="btn" href={document.downloadUrl}>Download</a><button type="button" className="btn danger" onClick={() => setPendingDelete({ kind: "document", id: document.id, label: document.label })}>Delete PDF</button></div>
                </article>
              )) : <p className="muted">No PDFs uploaded yet.</p>}
            </div>
          </section>
        </TabPanel>
      )}

      {pendingDelete && (
        <div className="modal-backdrop" onClick={() => setPendingDelete(null)}>
          <section className="modal confirm-modal" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
            <button type="button" className="modal-x" onClick={() => setPendingDelete(null)} aria-label="Close">×</button>
            <p className="eyebrow">Trip Information</p>
            <h2>{pendingDelete.kind === "booking" ? "Delete this booking?" : "Delete this PDF?"}</h2>
            <p><strong>{pendingDelete.label}</strong> will be removed from your trip. {pendingDelete.kind === "booking" ? "The Overview and the details bar update right away." : "The file is deleted from storage too."} This can&apos;t be undone.</p>
            <div className="button-row"><button type="button" className="btn" onClick={() => setPendingDelete(null)}>Keep it</button><button type="button" className="btn danger" onClick={confirmDelete}>{pendingDelete.kind === "booking" ? "Delete booking" : "Delete PDF"}</button></div>
          </section>
        </div>
      )}
      {adding && (
        <FormModal eyebrow="Trip Information" title={`${singular(adding)} details`} onClose={() => setAdding(null)}>
          <BookingForm category={adding} modal submitLabel="Save" onSaved={async () => { await reload(); setAdding(null); }} />
        </FormModal>
      )}
      {pdfOpen && (
        <FormModal eyebrow="Trip Information" title="Add a PDF" onClose={() => setPdfOpen(false)}>
          <form className="document-form in-modal" onSubmit={uploadPdf}>
            <label>Label<input name="label" placeholder="Travel protection policy" required maxLength={120} autoFocus /></label>
            <label>PDF<input name="document" type="file" accept="application/pdf" required /></label>
            <div className="button-row"><button className="btn primary">Save PDF</button></div>
          </form>
        </FormModal>
      )}
    </section>
  );
}

// The bootcamp's daily agenda, shown under the Training booking. The same schedule feeds the Overview's day view.
function TrainingSchedule({ record }: { record?: TripInfo }) {
  const start = parseWhen(record?.start_at);
  const end = parseWhen(record?.end_at) || start;
  const range = start ? (end && dayKey(end) !== dayKey(start) ? `${fmtDay(dayKey(start))} to ${fmtDay(dayKey(end))}` : fmtDay(dayKey(start))) : "";
  return (
    <section className="schedule">
      <div className="panel-head"><div><h2>Daily schedule</h2><p className="muted">{range ? `Every training day, ${range}. These show up on the Overview each morning.` : "Add a training booking with dates and this schedule lands on your Overview for each training day."}</p></div></div>
      <ol className="day-list">
        {trainingAgenda.slots.map(slot => (
          <li key={slot.minutes} className="training">
            <span className="day-time">{fmtMinutes(slot.minutes)}</span>
            <div><strong>{slot.title}</strong>{slot.detail && <span>{slot.detail}</span>}</div>
          </li>
        ))}
      </ol>
      <ul className="schedule-notes">{trainingAgenda.notes.map(note => <li key={note}>{note}</li>)}</ul>
    </section>
  );
}

// Shared shell for the "+ Something" add dialogs: backdrop click or Escape closes it.
function FormModal({ title, eyebrow, onClose, children }: { title: string; eyebrow?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal form-modal" role="dialog" aria-modal="true" aria-labelledby="form-modal-title" onClick={event => event.stopPropagation()}>
        <button type="button" className="modal-x" onClick={onClose} aria-label="Close">×</button>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 id="form-modal-title">{title}</h2>
        {children}
      </section>
    </div>
  );
}

function Gallery({ photos, openViewer, reload }: { photos: AppState["photos"]; openViewer: (spot: string) => void; reload: () => Promise<void> }) {
  const [addOpen, setAddOpen] = useState(false);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await api("/api/photos", { method: "POST", body: new FormData(form) });
    form.reset();
    await reload();
    setAddOpen(false);
  }
  return (
    <section className="page active">
      <header className="page-header page-header-row"><div><p className="eyebrow">Photo route</p><h1>Dotted memory map</h1></div><button className="btn primary" onClick={() => setAddOpen(true)}>+ Photo</button></header>
      {addOpen && (
        <FormModal eyebrow="Photo route" title="Add a photo" onClose={() => setAddOpen(false)}>
          <form className="document-form in-modal" onSubmit={upload}>
            <label>Stop<select name="spot" autoFocus>{photoSpots.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>
            <label>Caption<input name="caption" placeholder="Caption" maxLength={240} /></label>
            <label>Photo<input name="photo" type="file" accept="image/*" capture="environment" required /></label>
            <div className="button-row"><button className="btn primary">Save photo</button></div>
          </form>
        </FormModal>
      )}
      <div className="photo-route">
        {photoSpots.map(([id, title, hint]) => <button key={id} className="photo-stop" onClick={() => openViewer(id)}><span className="photo-frame">{photos[id] ? <img src={photos[id].imageUrl} alt={title} /> : title}</span><span><strong>{title}</strong><small>{photos[id]?.caption || hint}</small></span></button>)}
      </div>
    </section>
  );
}

function PhotoViewer({ spot, photos, onClose }: { spot: string; photos: AppState["photos"]; onClose: () => void }) {
  const meta = photoSpots.find(([id]) => id === spot);
  const photo = photos[spot];
  return <div className="modal-backdrop" onClick={onClose}><section className="viewer" onClick={event => event.stopPropagation()}><button className="modal-x" onClick={onClose}>×</button><h2>{meta?.[1] || "Photo"}</h2><p className="muted">{photo?.caption || meta?.[2]}</p><div className="viewer-media">{photo ? <img src={photo.imageUrl} alt={meta?.[1]} /> : meta?.[1]}</div></section></div>;
}

function SettingsPage({ settings, owner, saveSettings, reload }: { settings: Settings; owner: boolean; saveSettings: (form: HTMLFormElement) => Promise<void>; reload: () => Promise<void> }) {
  const [tab, setTab] = useState<"profile" | "details" | "account" | "organizer">("profile");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  async function deleteAccount() {
    rememberSession(false);
    if (deleteText !== "DELETE") return;
    await api("/api/account", { method: "DELETE" });
    window.location.reload();
  }
  return <section className="page active"><header className="page-header"><p className="eyebrow">Profile</p><h1>Settings</h1></header><Tabs label="Settings sections" active={tab} onChange={setTab} tabs={[{ key: "profile", label: "Profile" }, { key: "details", label: "Trip details" }, { key: "account", label: "Account" }, ...(owner ? [{ key: "organizer" as const, label: "Organizer" }] : [])]} />{tab === "profile" && <TabPanel id="profile"><SettingsForm settings={settings} onSubmit={saveSettings} /></TabPanel>}{tab === "details" && <TabPanel id="details"><TripDetailsPanel settings={settings} reload={reload} /></TabPanel>}{tab === "organizer" && owner && <TabPanel id="organizer"><ResetLinkPanel /></TabPanel>}{tab === "account" && <TabPanel id="account"><div className="danger-panel"><h2>Delete account data</h2><p className="muted">Remove this account and all saved trip planner data from the database.</p><button className="btn danger" onClick={() => setDeleteOpen(true)}>Delete my account data</button></div></TabPanel>}{deleteOpen && <div className="modal-backdrop"><section className="modal confirm-modal"><button className="modal-x" onClick={() => setDeleteOpen(false)}>×</button><p className="eyebrow">Danger zone</p><h2>Delete account data?</h2><p>This removes the account, checklists, trip information, PDFs, photos, and itinerary from the database. Type DELETE to confirm.</p><label>Confirmation<input value={deleteText} onChange={event => setDeleteText(event.target.value)} placeholder="DELETE" /></label><div className="button-row"><button className="btn" onClick={() => setDeleteOpen(false)}>Cancel</button><button className="btn danger" disabled={deleteText !== "DELETE"} onClick={deleteAccount}>Delete permanently</button></div></section></div>}</section>;
}

// Organizer only (OWNER_EMAIL): mint a password reset link for an attendee and send it to them by hand.
function ResetLinkPanel() {
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<null | { url: string; email: string; expiresAt: string }>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setBusy(true); setCopied(false);
    try {
      const result = await api("/api/reset-link", { method: "POST", body: JSON.stringify({ email }) });
      setLink({ url: `${location.origin}/?reset=${result.token}`, email: email.trim().toLowerCase(), expiresAt: result.expiresAt });
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create a reset link"); } finally { setBusy(false); }
  }
  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); setCopied(true); } catch { setError("Couldn't copy automatically. Select the link and copy it."); }
  }
  return (
    <div className="settings-grid organizer-panel">
      <div className="wide"><h2>Password reset links</h2><p className="muted">There is no email sending. Create a link for the attendee who is locked out and send it to them yourself (text, chat, or email). Each link lasts 24 hours and works once.</p></div>
      <form className="item-form wide" onSubmit={create}>
        <input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="attendee@example.com" required maxLength={254} aria-label="Attendee email" />
        <button className="btn primary" disabled={busy}>{busy ? "Creating..." : "Create reset link"}</button>
      </form>
      {error && <p className="error wide">{error}</p>}
      {link && (
        <div className="wide stack">
          <label>Reset link for {link.email}<input value={link.url} readOnly onFocus={event => event.target.select()} /></label>
          <div className="button-row"><button type="button" className="btn" onClick={copy}>{copied ? "Copied" : "Copy link"}</button><span className="muted">Expires {new Date(link.expiresAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.</span></div>
        </div>
      )}
    </div>
  );
}

function SettingsForm({ settings, onSubmit }: { settings: Settings; onSubmit: (form: HTMLFormElement) => Promise<void> }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(event.currentTarget);
  }
  return (
    <form className="settings-grid" onSubmit={submit}>
      <label>Display name<input name="profileName" placeholder="Shown above your email in the menu" defaultValue={settings?.profile_name || ""} maxLength={80} /></label>
      <label>Trip name<input name="tripName" defaultValue={settings?.trip_name || ""} maxLength={120} /></label>
      <AddressField label={<span>Home address <span className="help" title="Optional. It helps personalize the route map and itinerary context.">?</span></span>} name="home" defaultAddress={settings?.home_address || ""} defaultPlaceId={settings?.home_place_id || ""} />
      <AddressField label="Training location" name="training" defaultAddress={settings?.training_location || ""} defaultPlaceId={settings?.training_place_id || ""} />
      <input type="hidden" name="theme" value={settings?.theme || "light"} />
      <button className="btn primary">Save settings</button>
    </form>
  );
}

// Only the address text and Google's place id are kept; coordinates are deliberately never stored.
function AddressField({ label, name, defaultAddress, defaultPlaceId }: { label: React.ReactNode; name: "home" | "training"; defaultAddress: string; defaultPlaceId: string }) {
  const [query, setQuery] = useState(defaultAddress);
  const [placeId, setPlaceId] = useState(defaultPlaceId);
  async function choose(picked: string) {
    const details = await api("/api/places/details", { method: "POST", body: JSON.stringify({ placeId: picked }) });
    setQuery(details.address);
    setPlaceId(details.placeId);
  }
  return (
    <label className="address-field">{label}<PlaceInput name={name === "home" ? "homeAddress" : "trainingLocation"} value={query} onChange={setQuery} onPick={suggestion => choose(suggestion.placeId)} />
      <input type="hidden" name={`${name}PlaceId`} value={placeId} />
    </label>
  );
}

// Everything the setup wizard asks that isn't already in the settings form above it.
function TripDetailsPanel({ settings, reload }: { settings: Settings; reload: () => Promise<void> }) {
  const [answers, setAnswers] = useState<WizardAnswers>(() => parseAnswers(settings?.planning_answers));
  const [status, setStatus] = useState("");
  function set<K extends keyof WizardAnswers>(key: K, value: WizardAnswers[K]) {
    setAnswers(current => ({ ...current, [key]: value }));
    setStatus("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Merge onto the latest saved answers so wizard progress (step, completed) isn't overwritten.
    const latest = parseAnswers(settings?.planning_answers);
    const { step, completed, dismissed, response, emailAccess, bookingHints, ...details } = answers;
    await api("/api/planning", { method: "POST", body: JSON.stringify({ answers: { ...latest, ...details } }) });
    await reload();
    setStatus("Saved");
  }
  return (
    <form className="settings-grid trip-details" onSubmit={save}>
      <div className="wide"><h2>Trip details</h2><p className="muted">Used to plan your itinerary, checklists, and packing list.</p></div>
      <DestinationField answers={answers} set={set} />
      <span />
      <TripDateFields answers={answers} set={set} />
      <TravelerFields answers={answers} set={set} />
      <InterestFields answers={answers} set={set} />
      <div className="button-row wide"><button className="btn primary">Save trip details</button>{status && <span className="save-status">{status}</span>}</div>
    </form>
  );
}

function settingPayload(settings: Settings) {
  return {
    profileName: settings?.profile_name || "",
    tripName: settings?.trip_name || "",
    homeAddress: settings?.home_address || "",
    homePlaceId: settings?.home_place_id || "",
    trainingLocation: settings?.training_location || "",
    trainingPlaceId: settings?.training_place_id || ""
  };
}
