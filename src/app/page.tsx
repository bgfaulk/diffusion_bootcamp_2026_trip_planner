"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Item = { id: string; page: string; title: string; checked: boolean; position: number };
type Settings = {
  profile_name?: string;
  trip_name?: string;
  home_address?: string;
  home_place_id?: string;
  home_lat?: number;
  home_lng?: number;
  training_location?: string;
  training_place_id?: string;
  training_lat?: number;
  training_lng?: number;
  theme?: "light" | "dark";
} | null;
type AppState = {
  user: null | { id: string; email: string };
  settings: Settings;
  items: Item[];
  photos: Record<string, { id: string; caption: string; imageUrl: string }>;
  itinerary: null | { instructions?: string; response?: string; saved_plan?: string };
};

const pageLabels: Record<string, string> = {
  overview: "Overview",
  prechecks: "Pre-checks",
  packing: "Packing",
  departure: "Departure Day",
  explore: "Explore San Francisco",
  gallery: "Photo Route",
  return: "Return Day",
  settings: "Settings",
  wizard: "Setup Wizard"
};

const listPages = ["prechecks", "packing", "departure", "return"];
const photoSpots = [
  ["golden-gate-overlook", "Golden Gate Overlook", "Langdon Ct, San Francisco"],
  ["ferry-building", "Ferry Building", "1 Ferry Building, San Francisco"],
  ["north-beach", "North Beach", "Washington Square / Columbus Ave"],
  ["mission-district", "Mission District", "Dolores Park anchor"],
  ["half-moon-bay", "Half Moon Bay", "Main Street / Coastside"],
  ["wildcard", "Favorite surprise", "Something worth remembering"]
];

async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" })
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

export default function Home() {
  const [data, setData] = useState<AppState>({ user: null, settings: null, items: [], photos: {}, itinerary: null });
  const [page, setPage] = useState("overview");
  const [profileOpen, setProfileOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<"login" | "reset">("login");
  const [error, setError] = useState("");
  const [itineraryOpen, setItineraryOpen] = useState(false);
  const [viewer, setViewer] = useState<null | string>(null);

  async function load() {
    const next = await api("/api/bootstrap");
    setData(next);
    if (next.settings?.theme) document.documentElement.dataset.theme = next.settings.theme;
  }

  useEffect(() => { load().catch(() => {}); }, []);

  const theme = data.settings?.theme || "light";
  const profileName = data.settings?.profile_name || data.user?.email?.split("@")[0] || "Traveler";
  const tripName = data.settings?.trip_name || "San Francisco trip planner";
  const initials = profileName.charAt(0).toUpperCase();
  const complete = data.items.filter(item => item.checked).length;

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/auth", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          resetPassword: loginMode === "reset"
        })
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    }
  }

  async function saveSettings(form: HTMLFormElement, extras: Record<string, unknown> = {}) {
    const payload = { ...Object.fromEntries(new FormData(form).entries()), ...extras };
    await api("/api/settings", { method: "POST", body: JSON.stringify(payload) });
    await load();
  }

  async function toggleTheme() {
    await api("/api/settings", {
      method: "POST",
      body: JSON.stringify({ ...settingPayload(data.settings), theme: theme === "dark" ? "light" : "dark" })
    });
    await load();
  }

  if (!data.user) {
    return <LoginScreen mode={loginMode} setMode={setLoginMode} onSubmit={signIn} error={error} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">SF</span>
          <div><strong>Trip Planner</strong><span>{tripName}</span></div>
        </div>
        <nav className="primary-nav">
          {["overview", "prechecks", "packing", "departure", "explore", "gallery", "return"].map(key => (
            <button key={key} className={page === key ? "active" : ""} onClick={() => setPage(key)}>{pageLabels[key]}</button>
          ))}
        </nav>
        <div className="profile">
          <button className="profile-button" onClick={() => setProfileOpen(open => !open)}>
            <span className="avatar">{initials}</span><span><strong>{profileName}</strong><small>{data.user.email}</small></span><span>⌄</span>
          </button>
          {profileOpen && (
            <div className="profile-popover">
              <button onClick={() => { setPage("settings"); setProfileOpen(false); }}>Settings</button>
              <button onClick={() => { setPage("wizard"); setProfileOpen(false); }}>Setup Wizard</button>
            </div>
          )}
          <button className="theme-toggle" onClick={toggleTheme}>{theme === "dark" ? "Light theme" : "Dark theme"}</button>
        </div>
      </aside>

      <main className="content">
        {page === "overview" && <Overview tripName={tripName} settings={data.settings} openItems={data.items.length - complete} complete={complete} photos={Object.keys(data.photos).length} />}
        {listPages.includes(page) && <ListPage pageKey={page} items={data.items} reload={load} />}
        {page === "explore" && <ExplorePage items={data.items.filter(item => item.page === "explore")} itinerary={data.itinerary} openModal={() => setItineraryOpen(true)} reload={load} />}
        {page === "gallery" && <Gallery photos={data.photos} openViewer={setViewer} reload={load} />}
        {page === "settings" && <SettingsPage settings={data.settings} saveSettings={saveSettings} />}
        {page === "wizard" && <WizardPage settings={data.settings} saveSettings={saveSettings} />}
      </main>

      {itineraryOpen && <ItineraryModal items={data.items.filter(item => item.page === "explore")} itinerary={data.itinerary} onClose={() => setItineraryOpen(false)} reload={load} />}
      {viewer && <PhotoViewer spot={viewer} photos={data.photos} onClose={() => setViewer(null)} />}
    </div>
  );
}

function LoginScreen({ mode, setMode, onSubmit, error }: { mode: "login" | "reset"; setMode: (mode: "login" | "reset") => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; error: string }) {
  return (
    <main className="login-page">
      <section className="login-card">
        <p className="eyebrow">San Francisco trip planner</p>
        <h1>{mode === "reset" ? "Reset password" : "Sign in or create account"}</h1>
        <p className="muted">First login creates your account. Later, use the same email and password. For this short-lived app, password reset updates the password immediately when the email already exists.</p>
        <form onSubmit={onSubmit} className="stack">
          <label>Email<input name="email" type="email" required maxLength={254} /></label>
          <label>{mode === "reset" ? "New password" : "Password"}<input name="password" type="password" required minLength={8} maxLength={128} /></label>
          {error && <p className="error">{error}</p>}
          <button className="btn primary">{mode === "reset" ? "Update password" : "Continue"}</button>
        </form>
        <button className="link-button" onClick={() => setMode(mode === "reset" ? "login" : "reset")}>{mode === "reset" ? "Back to sign in" : "Reset password for this email"}</button>
      </section>
    </main>
  );
}

function Overview({ tripName, settings, openItems, complete, photos }: { tripName: string; settings: Settings; openItems: number; complete: number; photos: number }) {
  return (
    <section className="page active">
      <div className="hero">
        <div>
          <p className="eyebrow">Bay Area planner</p>
          <h1>{tripName}</h1>
          <p className="subtitle">Plan the training trip, build a custom San Francisco itinerary, and keep a shared photo route.</p>
        </div>
        <MetaMap settings={settings} />
      </div>
      <div className="metric-grid">
        <div className="metric"><strong>{openItems}</strong><span>Open items</span></div>
        <div className="metric"><strong>{complete}</strong><span>Completed</span></div>
        <div className="metric"><strong>{photos}</strong><span>Photo stops</span></div>
      </div>
    </section>
  );
}

function MetaMap({ settings }: { settings: Settings }) {
  const home = settings?.home_address ? "Home" : "Start";
  const training = settings?.training_location ? "Training" : "Bay";
  return (
    <div className="route-card">
      <svg viewBox="0 0 620 300" role="img" aria-label="Custom route map">
        <rect width="620" height="300" rx="18" fill="currentColor" opacity=".06" />
        <path d="M80 220 C160 92, 318 84, 390 142 S515 210, 552 72" fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" strokeDasharray="2 22" />
        <circle cx="80" cy="220" r="24" fill="var(--bay)" />
        <circle cx="390" cy="142" r="24" fill="var(--bridge)" />
        <circle cx="552" cy="72" r="28" fill="var(--accent)" />
        <text x="38" y="268" fontSize="34" fontWeight="900" fill="currentColor">{home}</text>
        <text x="340" y="112" fontSize="34" fontWeight="900" fill="currentColor">{training}</text>
        <text x="516" y="42" fontSize="34" fontWeight="900" fill="currentColor">San Francisco</text>
      </svg>
      <p>{settings?.home_address || "Add a home address in setup to personalize this map."}</p>
    </div>
  );
}

function ListPage({ pageKey, items, reload }: { pageKey: string; items: Item[]; reload: () => Promise<void> }) {
  const visible = items.filter(item => item.page === pageKey);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get("title") || "");
    await api("/api/items", { method: "POST", body: JSON.stringify({ page: pageKey, title }) });
    event.currentTarget.reset();
    await reload();
  }
  return (
    <section className="page active">
      <header className="page-header"><p className="eyebrow">Editable checklist</p><h1>{pageLabels[pageKey]}</h1></header>
      <form className="item-form" onSubmit={add}><input name="title" placeholder="Add a custom item" maxLength={180} /><button className="btn primary">Add</button></form>
      <div className="list-items">
        {visible.map(item => <ChecklistItem key={item.id} item={item} reload={reload} />)}
      </div>
    </section>
  );
}

function ChecklistItem({ item, reload }: { item: Item; reload: () => Promise<void> }) {
  async function toggle() {
    await api("/api/items", { method: "PATCH", body: JSON.stringify({ id: item.id, checked: !item.checked }) });
    await reload();
  }
  async function remove() {
    await api("/api/items", { method: "DELETE", body: JSON.stringify({ id: item.id }) });
    await reload();
  }
  return <div className={`list-item ${item.checked ? "done" : ""}`}><input type="checkbox" checked={item.checked} onChange={toggle} /><span>{item.title}</span><button className="delete-item" onClick={remove}>Delete</button></div>;
}

function ExplorePage({ items, itinerary, openModal, reload }: { items: Item[]; itinerary: AppState["itinerary"]; openModal: () => void; reload: () => Promise<void> }) {
  async function clear() {
    await api("/api/itinerary/clear", { method: "POST", body: JSON.stringify({}) });
    await reload();
  }
  return (
    <section className="page active">
      <header className="page-header"><p className="eyebrow">Explore San Francisco</p><h1>Build a custom itinerary</h1></header>
      <div className="callout">
        <h2>Start with your own instructions</h2>
        <p>Open the planner, describe the kind of San Francisco trip you want, and send the prepared prompt to ChatGPT. Paste the plan back here to save and build this page.</p>
        <div className="button-row"><button className="btn primary" onClick={openModal}>Plan with ChatGPT</button>{itinerary?.saved_plan && <button className="btn" onClick={clear}>Clear itinerary and start over</button>}</div>
      </div>
      {itinerary?.saved_plan ? <article className="plan-output"><pre>{itinerary.saved_plan}</pre></article> : <div className="muted">No saved itinerary yet. Current starter ideas: {items.map(item => item.title).join(", ")}</div>}
    </section>
  );
}

function ItineraryModal({ items, itinerary, onClose, reload }: { items: Item[]; itinerary: AppState["itinerary"]; onClose: () => void; reload: () => Promise<void> }) {
  const [instructions, setInstructions] = useState(itinerary?.instructions || "");
  const [response, setResponse] = useState(itinerary?.response || "");
  const prompt = useMemo(() => buildChatGptPrompt(instructions, items), [instructions, items]);
  async function saveDraft() {
    await api("/api/itinerary", { method: "POST", body: JSON.stringify({ instructions, response, savedPlan: response }) });
    await reload();
    onClose();
  }
  async function persistText(nextInstructions = instructions, nextResponse = response) {
    await api("/api/itinerary", { method: "POST", body: JSON.stringify({ instructions: nextInstructions, response: nextResponse, savedPlan: itinerary?.saved_plan || "" }) });
  }
  return (
    <div className="modal-backdrop">
      <section className="modal">
        <button className="modal-x" onClick={onClose}>×</button>
        <h2>Plan Explore San Francisco</h2>
        <label>Instructions<textarea value={instructions} onChange={event => setInstructions(event.target.value)} onBlur={() => persistText()} placeholder="We want walkable dinners, views, and one relaxed daytime idea..." /></label>
        <div className="button-row"><button className="btn" onClick={() => setInstructions(items.map(item => item.title).join("\n"))}>Use current Explore San Francisco ideas</button><button className="btn primary" onClick={() => window.open(`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`, "_blank")}>Open ChatGPT with prompt</button></div>
        <label>Paste ChatGPT itinerary response<textarea value={response} onChange={event => setResponse(event.target.value)} onBlur={() => persistText()} placeholder="Paste the finished itinerary here after ChatGPT plans it." /></label>
        <div className="button-row"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={saveDraft}>Save itinerary</button></div>
      </section>
    </div>
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

function Gallery({ photos, openViewer, reload }: { photos: AppState["photos"]; openViewer: (spot: string) => void; reload: () => Promise<void> }) {
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api("/api/photos", { method: "POST", body: new FormData(event.currentTarget) });
    event.currentTarget.reset();
    await reload();
  }
  return (
    <section className="page active">
      <header className="page-header"><p className="eyebrow">Photo route</p><h1>Dotted memory map</h1></header>
      <form className="mobile-capture" onSubmit={upload}>
        <select name="spot">{photoSpots.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select>
        <input name="caption" placeholder="Caption" maxLength={240} />
        <input name="photo" type="file" accept="image/*" capture="environment" />
        <button className="btn primary">Save photo</button>
      </form>
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

function SettingsPage({ settings, saveSettings }: { settings: Settings; saveSettings: (form: HTMLFormElement) => Promise<void> }) {
  return <section className="page active"><header className="page-header"><p className="eyebrow">Profile</p><h1>Settings</h1></header><SettingsForm settings={settings} onSubmit={saveSettings} /></section>;
}

function WizardPage({ settings, saveSettings }: { settings: Settings; saveSettings: (form: HTMLFormElement) => Promise<void> }) {
  return <section className="page active"><header className="page-header"><p className="eyebrow">Setup</p><h1>Setup Wizard</h1></header><div className="callout"><p>This wizard personalizes the map and app labels. Home address is optional; it helps estimate your route context and personalize the custom map metadata.</p></div><SettingsForm settings={settings} onSubmit={saveSettings} wizard /></section>;
}

function SettingsForm({ settings, onSubmit, wizard = false }: { settings: Settings; onSubmit: (form: HTMLFormElement) => Promise<void>; wizard?: boolean }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(event.currentTarget);
  }
  return (
    <form className="settings-grid" onSubmit={submit}>
      <label>Profile name<input name="profileName" defaultValue={settings?.profile_name || ""} maxLength={80} /></label>
      <label>Trip name<input name="tripName" defaultValue={settings?.trip_name || ""} maxLength={120} /></label>
      <AddressField label={<span>Home address <span className="help" title="Optional. It helps personalize the route map and itinerary context.">?</span></span>} name="home" defaultAddress={settings?.home_address || ""} defaultPlaceId={settings?.home_place_id || ""} defaultLat={settings?.home_lat} defaultLng={settings?.home_lng} />
      <AddressField label="Training location" name="training" defaultAddress={settings?.training_location || ""} defaultPlaceId={settings?.training_place_id || ""} defaultLat={settings?.training_lat} defaultLng={settings?.training_lng} />
      <input type="hidden" name="theme" value={settings?.theme || "light"} />
      <button className="btn primary">{wizard ? "Finish setup" : "Save settings"}</button>
    </form>
  );
}

function AddressField({ label, name, defaultAddress, defaultPlaceId, defaultLat, defaultLng }: { label: React.ReactNode; name: "home" | "training"; defaultAddress: string; defaultPlaceId: string; defaultLat?: number; defaultLng?: number }) {
  const [query, setQuery] = useState(defaultAddress);
  const [suggestions, setSuggestions] = useState<{ placeId: string; text: string }[]>([]);
  const [place, setPlace] = useState({ placeId: defaultPlaceId, lat: defaultLat ?? "", lng: defaultLng ?? "" });
  useEffect(() => {
    const timeout = setTimeout(async () => {
      if (query.length < 3) return setSuggestions([]);
      const result = await api("/api/places/autocomplete", { method: "POST", body: JSON.stringify({ input: query }) }).catch(() => ({ suggestions: [] }));
      setSuggestions(result.suggestions || []);
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);
  async function choose(placeId: string) {
    const details = await api("/api/places/details", { method: "POST", body: JSON.stringify({ placeId }) });
    setQuery(details.address);
    setPlace({ placeId: details.placeId, lat: details.lat ?? "", lng: details.lng ?? "" });
    setSuggestions([]);
  }
  return (
    <label className="address-field">{label}<input name={name === "home" ? "homeAddress" : "trainingLocation"} value={query} onChange={event => setQuery(event.target.value)} maxLength={240} />
      <input type="hidden" name={`${name}PlaceId`} value={place.placeId} />
      <input type="hidden" name={`${name}Lat`} value={place.lat} />
      <input type="hidden" name={`${name}Lng`} value={place.lng} />
      {suggestions.length > 0 && <span className="suggestions">{suggestions.map(suggestion => <button type="button" key={suggestion.placeId} onClick={() => choose(suggestion.placeId)}>{suggestion.text}</button>)}</span>}
    </label>
  );
}

function settingPayload(settings: Settings) {
  return {
    profileName: settings?.profile_name || "",
    tripName: settings?.trip_name || "",
    homeAddress: settings?.home_address || "",
    homePlaceId: settings?.home_place_id || "",
    homeLat: settings?.home_lat ?? null,
    homeLng: settings?.home_lng ?? null,
    trainingLocation: settings?.training_location || "",
    trainingPlaceId: settings?.training_place_id || "",
    trainingLat: settings?.training_lat ?? null,
    trainingLng: settings?.training_lng ?? null
  };
}
