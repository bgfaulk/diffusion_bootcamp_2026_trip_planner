"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";
import { notify } from "./toast";
import { PlaceInput } from "./place-input";
import { BookingForm, categoryTitle } from "./trip-bookings";
import { JsonFileInput } from "./json-file-input";
import { passwordChecks } from "@/lib/validation";
import { chimeEnabled, chimeReady, playChimeNote, primeChime, saveChimeEnabled } from "@/lib/chime";
import { buildWizardPrompt, extractJson, interestOptions, normalizePlan, sampleResponse, trainingAddress, trainingDetail, type EmailAccess, type WizardAnswers } from "@/lib/plan";

type AuthStep = "welcome" | "signin" | "create" | "reset" | "forgot";
// Set once an account has been created or signed into on this device. Until then the login page leads with
// "Create an account" and doesn't show a password field at all.
const knownCookie = "trip_known";
function knownDevice() { return new RegExp(`(?:^|; )${knownCookie}=`).test(document.cookie) || rememberedEmail() !== ""; }
function rememberKnown() {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${knownCookie}=1; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax${secure}`;
}

const emailCookie = "trip_email";
const rememberDays = 7;

function rememberedEmail() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${emailCookie}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

// A reset link is /?reset=<token>; the token's first part is base64url JSON with the email in it. The server
// verifies the signature; the browser only reads the email to prefill the form.
function resetLinkFromUrl(): { token: string; email: string } | null {
  try {
    const token = new URLSearchParams(location.search).get("reset");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload?.email === "string" ? { token, email: payload.email } : null;
  } catch {
    return null;
  }
}

function rememberEmail(email: string) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${emailCookie}=${encodeURIComponent(email)}; Max-Age=${60 * 60 * 24 * rememberDays}; Path=/; SameSite=Lax${secure}`;
}

// One form for both signing in and creating an account. The server answers a bad sign-in the same way
// whether the email is unknown or the password is wrong, so nothing here can tell people apart either.
export function LoginScreen({ onSignedIn, notice = "" }: { onSignedIn: () => Promise<void>; notice?: string }) {
  const [step, setStep] = useState<AuthStep>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [sentTo, setSentTo] = useState("");

  useEffect(() => {
    const link = resetLinkFromUrl();
    if (link) { setEmail(link.email); setResetToken(link.token); setStep("reset"); return; }
    setEmail(current => current || rememberedEmail());
    if (!knownDevice()) setStep("welcome");
  }, []);

  const newPassword = step === "create" || step === "reset";
  const checks = passwordChecks(password);
  const rulesMet = checks.every(check => check.ok);
  const confirmOk = step !== "create" || (confirm !== "" && confirm === password);
  const canSubmit = !busy && email.trim() !== "" && (step === "forgot" || (password !== "" && (!newPassword || rulesMet) && confirmOk));

  function goTo(next: AuthStep) {
    setStep(next);
    setPassword("");
    setConfirm("");
    setInviteCode("");
    setError("");
    setSentTo("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setError("");
    setBusy(true);
    if (step === "forgot") {
      try {
        await api("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email, website }) });
        setSentTo(email.trim());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not send a reset link");
      } finally {
        setBusy(false);
      }
      return;
    }
    primeChime(); // inside the submit gesture, so the loader's chime is allowed to play
    try {
      await api("/api/auth", { method: "POST", body: JSON.stringify({ email, password, intent: step, website, token: resetToken, inviteCode }) });
      rememberEmail(email);
      rememberKnown();
      if (step === "reset") history.replaceState(null, "", location.pathname);
      await onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
      setBusy(false);
    }
  }

  const heading = { welcome: "Welcome", signin: "Sign in", create: "Create your account", reset: "Set a new password", forgot: "Reset your password" }[step];

  return (
    <main className="login-page">
      <section className="login-card">
        <h1>{heading}</h1>
        {notice && <p className="notice" role="status">{notice}</p>}
        {/* Honeypot: hidden from people and screen readers, so only bots fill it in. */}
        <label className="honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></label>
        {step === "welcome" ? (
          <div className="stack">
            <p className="muted">Planning the ABC Fitness Diffusion Bootcamp trip starts with an account. You&apos;ll need the invite code from the trip organizer.</p>
            <label>Email<input id="username" name="username" type="email" maxLength={254} autoFocus autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} /></label>
            <button type="button" className="btn primary" onClick={() => goTo("create")}>Create an account</button>
            <button type="button" className="btn" onClick={() => goTo("signin")}>I already have an account</button>
          </div>
        ) : step === "forgot" && sentTo ? (
          <div className="stack">
            <p className="muted">If <strong>{sentTo}</strong> has an account, a reset link is on its way. It works once and expires in 24 hours. Check spam if it doesn&apos;t show up in a minute.</p>
          </div>
        ) : (
        <form onSubmit={submit} className="stack" key={step}>
          {step === "forgot" ? (
            <>
              <p className="muted">Enter the email you signed up with and we&apos;ll send you a link to set a new password.</p>
              <label>Email<input id="username" name="username" type="email" required maxLength={254} autoFocus autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} /></label>
            </>
          ) : step === "reset" ? (
            <>
              {/* The account comes from the reset link. Repeat its email as the username so password managers pair
                  the new password with it. Kept in the layout (not display:none) because some managers skip hidden fields. */}
              <input className="visually-hidden" id="username" name="username" type="email" autoComplete="username" value={email} readOnly tabIndex={-1} aria-hidden="true" />
              <div className="email-chip"><span>{email}</span></div>
            </>
          ) : (
            <label>Email<input id="username" name="username" type="email" required maxLength={254} autoFocus autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} /></label>
          )}
          {step !== "forgot" && <PasswordField id={step === "signin" ? "current-password" : "new-password"} label={step === "reset" ? "New password" : "Password"} value={password} onChange={setPassword} autoFocus={step === "reset"} autoComplete={step === "signin" ? "current-password" : "new-password"} />}
          {newPassword && (
            <ul className="password-rules" aria-live="polite">
              {checks.map(check => <li key={check.label} className={check.ok ? "ok" : ""}><RuleIcon ok={check.ok} />{check.label}</li>)}
              {rulesMet && <li className="ok all-set"><RuleIcon ok />Password looks good</li>}
            </ul>
          )}
          {step === "create" && (
            <>
              <PasswordField id="confirm-password" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
              {confirm !== "" && <p className={`match-note ${confirmOk ? "ok" : ""}`}><RuleIcon ok={confirmOk} />{confirmOk ? "Passwords match" : "Passwords don't match yet"}</p>}
              <label>Invite code<input id="invite-code" name="inviteCode" maxLength={200} autoComplete="off" autoCapitalize="off" spellCheck={false} value={inviteCode} onChange={event => setInviteCode(event.target.value)} /></label>
              <p className="muted">The trip organizer shares the invite code with attendees.</p>
            </>
          )}
          {error && <p className="error">{error}</p>}
          <button className="btn primary" disabled={!canSubmit}>{busy ? "One moment..." : { signin: "Sign in", create: "Create account", reset: "Update password", forgot: "Email me a reset link" }[step]}</button>
        </form>
        )}
        {step === "signin" && (
          <div className="login-actions">
            <button type="button" className="link-button" onClick={() => goTo("forgot")}>Forgot your password?</button>
            <p className="muted">First time here?</p>
            <button type="button" className="btn" onClick={() => goTo("create")}>Create an account</button>
          </div>
        )}
        {step === "create" && (
          <div className="login-actions">
            <p className="muted">Already have an account?</p>
            <button type="button" className="btn" onClick={() => goTo("signin")}>Sign in instead</button>
          </div>
        )}
        {step === "forgot" && <button type="button" className="link-button" onClick={() => goTo("signin")}>Back to sign in</button>}
        {step === "reset" && <button className="link-button" onClick={() => { setResetToken(""); history.replaceState(null, "", location.pathname); goTo("signin"); }}>Back to sign in</button>}
        <footer className="login-brand"><AbcMark /><p className="eyebrow">ABC Fitness Diffusion Bootcamp Trip Planner</p></footer>
      </section>
    </main>
  );
}

function PasswordField({ id, label, value, onChange, autoComplete, autoFocus = false }: { id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: string; autoFocus?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <label>{label}
      <span className="password-input">
        <input id={id} name={id} type={visible ? "text" : "password"} required maxLength={128} autoFocus={autoFocus} autoComplete={autoComplete} value={value} onChange={event => onChange(event.target.value)} />
        <button type="button" className="eye-toggle" onClick={() => setVisible(show => !show)} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible}>
          {visible ? (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
          )}
        </button>
      </span>
    </label>
  );
}

function RuleIcon({ ok }: { ok: boolean }) {
  return ok
    ? <svg className="rule-icon" viewBox="0 0 20 20" aria-label="met"><circle cx="10" cy="10" r="9" /><path d="M6 10.5l2.6 2.6L14 7.6" /></svg>
    : <svg className="rule-icon" viewBox="0 0 20 20" aria-label="not met yet"><circle cx="10" cy="10" r="8.5" /></svg>;
}

export function PlanningChoice({ onChoose, onLater, onSignOut }: { onChoose: (mode: "ai" | "manual") => Promise<void>; onLater: () => Promise<void>; onSignOut: () => Promise<void> }) {
  const [busy, setBusy] = useState<"" | "ai" | "manual">("");
  const [leaving, setLeaving] = useState(false);
  async function choose(mode: "ai" | "manual") {
    setBusy(mode);
    try { await onChoose(mode); } finally { setBusy(""); }
  }
  return (
    <main className="login-page">
      <section className="choice-card">
        <div className="wizard-meta">
          <p className="eyebrow">Let's set up your trip</p>
          <ActionMenu items={[{ label: "Set up later", onSelect: () => setLeaving(true) }, { label: "Sign out", onSelect: onSignOut, danger: true }]} />
        </div>
        <h1>How do you want to plan?</h1>
        <p className="muted">Pick one to get started. Whichever you choose, you can edit your trip details anytime in Settings.</p>
        <div className="choice-grid">
          <button className="choice-option" onClick={() => choose("ai")} disabled={Boolean(busy)}>
            <span className="choice-badge">Recommended</span>
            <strong>Plan with ChatGPT</strong>
            <span>Answer a few questions. ChatGPT finds your bookings and builds your itinerary, checklists, and packing list. You paste the result back here.</span>
            <em>{busy === "ai" ? "Starting..." : "Start the wizard"}</em>
          </button>
          <button className="choice-option" onClick={() => choose("manual")} disabled={Boolean(busy)}>
            <strong>Set it up myself</strong>
            <span>Enter your trip dates, flights, hotels, and places to visit yourself.</span>
            <em>{busy === "manual" ? "Opening..." : "Go manual"}</em>
          </button>
        </div>
      </section>
      {leaving && <LeaveSetupDialog mode={null} onStay={() => setLeaving(false)} onLeave={onLater} />}
    </main>
  );
}

type MenuItem = { label: string; onSelect: () => void | Promise<void>; danger?: boolean };

// Single "Options" button in the panel's top-right corner that holds the secondary setup actions.
export function ActionMenu({ items, label = "Options" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className="action-menu" ref={ref}>
      <button type="button" className="btn action-menu-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        {label}
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7.5l5 5 5-5" /></svg>
      </button>
      {open && (
        <div className="action-menu-list" role="menu">
          {items.map(item => (
            <button type="button" role="menuitem" key={item.label} className={item.danger ? "danger" : ""} onClick={() => { setOpen(false); item.onSelect(); }}>{item.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Warns that skipping setup limits what the planner can do. Everything entered so far is kept.
export function LeaveSetupDialog({ mode, onStay, onLeave }: { mode: "ai" | "manual" | null; onStay: () => void; onLeave: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const limits = mode === "ai"
    ? ["ChatGPT won't build your itinerary, packing list, or checklists", "Your bookings won't be pulled in from your email", "Explore ideas won't be matched to your interests"]
    : ["You'll start from generic starter checklists", "Trip Information stays empty until you add your bookings", "Your dates, travelers, and interests won't be on file for planning"];
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="leave-setup-title">
      <section className="modal confirm-modal">
        <p className="eyebrow">Setup isn't finished</p>
        <h2 id="leave-setup-title">Leave setup for now?</h2>
        <p>Leaving before setup is finished limits what the trip planner can do for you:</p>
        <ul className="limit-list">{limits.map(limit => <li key={limit}>{limit}</li>)}</ul>
        <p className="muted">What you've entered so far is saved. Pick up where you left off from the banner at the top of the planner, or from Setup wizard in your profile menu.</p>
        <div className="button-row">
          <button className="btn primary" onClick={onStay} autoFocus>Keep setting up</button>
          <button className="btn" disabled={busy} onClick={async () => { setBusy(true); await onLeave(); }}>{busy ? "Leaving..." : "Leave setup"}</button>
        </div>
      </section>
    </div>
  );
}

type SetAnswer = <K extends keyof WizardAnswers>(key: K, value: WizardAnswers[K]) => void;

// Answer groups shared by the setup wizard and the Trip details section in Settings.
export function DestinationField({ answers, set }: { answers: WizardAnswers; set: SetAnswer }) {
  return <label>Destination<PlaceInput value={answers.destination} onChange={value => set("destination", value)} placeholder="City" maxLength={120} /></label>;
}

export function TripDateFields({ answers, set }: { answers: WizardAnswers; set: SetAnswer }) {
  return (
    <>
      <label>Leave home<input type="date" value={answers.startDate} onChange={e => set("startDate", e.target.value)} /></label>
      <label>Return home<input type="date" value={answers.endDate} min={answers.startDate || undefined} onChange={e => set("endDate", e.target.value)} /></label>
    </>
  );
}

export function TravelerFields({ answers, set }: { answers: WizardAnswers; set: SetAnswer }) {
  return (
    <>
      <label>How many people, including you?<input type="number" min={1} max={20} value={answers.travelerCount} onChange={e => set("travelerCount", Math.max(1, Math.min(20, Number(e.target.value) || 1)))} /></label>
      <label>Who's coming? (optional)<input value={answers.travelers} onChange={e => set("travelers", e.target.value)} placeholder="Me and my partner Sam" maxLength={240} /></label>
      <label>Kids and their ages (optional)<input value={answers.kids} onChange={e => set("kids", e.target.value)} placeholder="None, or 7 and 10" maxLength={120} /></label>
      <label>Accessibility or mobility needs (optional)<input value={answers.accessibility} onChange={e => set("accessibility", e.target.value)} placeholder="Avoid steep hills, stroller..." maxLength={240} /></label>
    </>
  );
}

export function InterestFields({ answers, set, showMustDo = true }: { answers: WizardAnswers; set: SetAnswer; showMustDo?: boolean }) {
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState("");
  const customInterests = answers.interests.filter(item => !interestOptions.includes(item));
  function toggle(option: string) {
    const on = answers.interests.includes(option);
    set("interests", on ? answers.interests.filter(item => item !== option) : [...answers.interests, option]);
  }
  function addCustom() {
    const value = custom.trim().slice(0, 40);
    if (value && !answers.interests.some(item => item.toLowerCase() === value.toLowerCase())) set("interests", [...answers.interests, value]);
    setCustom("");
    setAdding(false);
  }
  return (
    <>
      <div className="chip-row wide">
        {interestOptions.map(option => {
          const on = answers.interests.includes(option);
          return <button type="button" key={option} aria-pressed={on} className={`chip ${on ? "on" : ""}`} onClick={() => toggle(option)}>{option}</button>;
        })}
        {customInterests.map(option => <button type="button" key={option} aria-pressed className="chip on" onClick={() => toggle(option)} aria-label={`Remove ${option}`}>{option} <span aria-hidden="true">×</span></button>)}
        {adding ? (
          <span className="chip-add">
            <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="Your interest" maxLength={40} autoFocus onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } if (e.key === "Escape") setAdding(false); }} />
            <button type="button" className="chip on" onClick={addCustom}>Add</button>
          </span>
        ) : (
          <button type="button" className="chip chip-new" onClick={() => setAdding(true)}>+ Add your own</button>
        )}
      </div>
      <label>Pace<select value={answers.pace} onChange={e => set("pace", e.target.value as WizardAnswers["pace"])}><option value="">No preference</option><option value="relaxed">Relaxed</option><option value="balanced">Balanced</option><option value="packed">See as much as possible</option></select></label>
      <label>Budget<select value={answers.budget} onChange={e => set("budget", e.target.value as WizardAnswers["budget"])}><option value="">No preference</option><option value="budget">Budget</option><option value="moderate">Moderate</option><option value="splurge">Splurge</option></select></label>
      <label>Getting around<select value={answers.transport} onChange={e => set("transport", e.target.value)}><option value="">Not sure yet</option><option value="Rental car">Rental car</option><option value="Public transit and walking">Transit and walking</option><option value="Rideshare">Rideshare</option><option value="Mix of everything">Mix</option></select></label>
      <label>Food preferences or restrictions<input value={answers.food} onChange={e => set("food", e.target.value)} placeholder="Vegetarian, love seafood..." maxLength={240} /></label>
      {showMustDo && <label className="wide">Anything you don't want to miss?<textarea value={answers.mustDo} onChange={e => set("mustDo", e.target.value)} placeholder="Sunset at the Golden Gate, a Giants game, sourdough at the Ferry Building..." maxLength={1000} /></label>}
    </>
  );
}

type PlanningMode = "ai" | "manual";
type StepKey = "trip" | "email" | "bookings" | "travelers" | "interests" | "chatgpt" | "paste" | "review";

const wizardSteps: Record<PlanningMode, { key: StepKey; label: string }[]> = {
  // Dates, home city, and travelers come from the bookings ChatGPT finds, so the ChatGPT path skips them.
  ai: [
    { key: "trip", label: "Trip" },
    { key: "email", label: "Bookings" },
    { key: "interests", label: "Interests" },
    { key: "chatgpt", label: "ChatGPT" },
    { key: "paste", label: "Upload" }
  ],
  manual: [
    { key: "trip", label: "Trip" },
    { key: "bookings", label: "Bookings" },
    { key: "travelers", label: "Travelers" },
    { key: "interests", label: "Interests" },
    { key: "review", label: "Review" }
  ]
};

type WizardBooking = { id: string; category: string; title: string; provider?: string; start_at?: string };
type WizardItem = { id: string; title: string };
type WizardSettings = null | {
  profile_name?: string;
  trip_name?: string;
  home_address?: string;
  home_place_id?: string;
  training_location?: string;
  training_place_id?: string;
  theme?: string;
};

export function SetupWizard({ mode, initial, settings, bookings, places, reload, onFinish, onSwitchMode, onBackToChoice, onSignOut }: {
  mode: PlanningMode;
  initial: WizardAnswers;
  settings: WizardSettings;
  bookings: WizardBooking[];
  places: WizardItem[];
  reload: () => Promise<void>;
  onFinish: (next?: unknown) => void;
  onSwitchMode: (mode: PlanningMode) => Promise<void>;
  onBackToChoice: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const steps = wizardSteps[mode];
  const [answers, setAnswers] = useState<WizardAnswers>(initial);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [building, setBuilding] = useState<null | { done: boolean; next?: unknown; error?: string }>(null);
  const prompt = useMemo(() => buildWizardPrompt(answers), [answers]);
  const step = Math.min(answers.step, steps.length - 1);
  const furthest = Math.min(Math.max(answers.furthest || 0, step), steps.length - 1);
  const stepKey = steps[step].key;
  // Phones and tablets can't use ChatGPT's email connector, so the paste path is preselected there. It's a
  // default, not a lock: the other options stay one tap away.
  useEffect(() => {
    if (stepKey !== "email" || answers.emailAccess) return;
    if (matchMedia("(pointer: coarse)").matches) setAnswers(current => current.emailAccess ? current : { ...current, emailAccess: "paste" });
  }, [stepKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function set<K extends keyof WizardAnswers>(key: K, value: WizardAnswers[K]) {
    setAnswers(current => ({ ...current, [key]: value }));
    setError("");
  }

  function save(next: WizardAnswers) {
    return api("/api/planning", { method: "POST", body: JSON.stringify({ answers: next }) }).catch(err => notify.error(err, "Couldn't save your progress"));
  }

  // Autosave while typing so answers (and the current step) survive moving between steps,
  // leaving the wizard, signing out, or a refresh. Paused while the trip is being built so it
  // can't overwrite the "completed" save.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (building) return;
    const timer = setTimeout(() => save(answers), 700);
    return () => clearTimeout(timer);
  }, [answers, building]);

  async function leaveWith(action: () => Promise<void> | void) {
    await save(answers);
    await action();
  }

  function go(nextStep: number) {
    setError("");
    if (stepKey === "email" && nextStep > step && !answers.emailAccess) return setError("Choose how ChatGPT should find your bookings");
    const next = { ...answers, step: nextStep, furthest: Math.max(furthest, nextStep) };
    setAnswers(next);
    save(next);
    window.scrollTo({ top: 0 });
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy automatically. Select the prompt text and copy it.");
    }
  }

  // Trip name, home, and training location from step 1 go into settings for both paths.
  async function saveTripBasics() {
    const homeAddress = answers.homeCity || settings?.home_address || "";
    const trainingLocation = mode === "ai" ? trainingAddress : answers.trainingLocation || settings?.training_location || "";
    await api("/api/settings", {
      method: "POST",
      body: JSON.stringify({
        profileName: answers.displayName.trim(),
        tripName: answers.tripName || settings?.trip_name || "",
        homeAddress,
        homePlaceId: homeAddress === settings?.home_address ? settings?.home_place_id || "" : "",
        trainingLocation,
        trainingPlaceId: trainingLocation === settings?.training_location ? settings?.training_place_id || "" : "",
        theme: settings?.theme || "light"
      })
    });
  }

  async function build() {
    setError("");
    let finished = { ...answers, completed: true, dismissed: false };
    if (mode === "ai") {
      try {
        const plan = normalizePlan(extractJson(answers.response));
        finished = {
          ...finished,
          trainingLocation: trainingAddress,
          startDate: plan.startDate || finished.startDate,
          endDate: plan.endDate || finished.endDate,
          homeCity: plan.homeCity || finished.homeCity,
          travelerCount: plan.travelerCount || finished.travelerCount,
          travelers: plan.travelers || finished.travelers
        };
      } catch (err) {
        return setError(err instanceof Error ? err.message : "That response couldn't be read");
      }
    }
    primeChime();
    setBuilding({ done: false });
    try {
      await saveTripBasics();
      if (mode === "ai") await api("/api/plan-import", { method: "POST", body: JSON.stringify({ response: answers.response }) });
      await api("/api/planning", { method: "POST", body: JSON.stringify({ mode, answers: finished }) });
      const next = await api("/api/bootstrap");
      setBuilding({ done: true, next });
    } catch (err) {
      setBuilding({ done: false, error: err instanceof Error ? err.message : "Could not build your trip" });
    }
  }

  async function leaveSetup() {
    await saveTripBasics().catch(() => {});
    await api("/api/planning", { method: "POST", body: JSON.stringify({ answers: { ...answers, dismissed: true } }) });
    onFinish();
  }

  if (building) {
    return (
      <AbcLoader
        done={building.done}
        failed={Boolean(building.error)}
        onFinish={() => onFinish(building.next)}
        onFailed={() => { setError(building.error || "Could not build your trip"); setBuilding(null); }}
      />
    );
  }

  const isLast = step === steps.length - 1;

  return (
    <main className="wizard-page">
      <section className="wizard-card">
        <div className="wizard-top">
          <div className="wizard-meta">
            <p className="eyebrow">{mode === "ai" ? "ChatGPT setup" : "Manual setup"} - step {step + 1} of {steps.length}</p>
            <ActionMenu items={[
              { label: mode === "ai" ? "Set it up manually instead" : "Use ChatGPT instead", onSelect: () => leaveWith(() => onSwitchMode(mode === "ai" ? "manual" : "ai")) },
              { label: "Leave setup", onSelect: () => setLeaving(true) },
              { label: "Sign out", onSelect: () => leaveWith(onSignOut), danger: true }
            ]} />
          </div>
          <ol className="wizard-steps" aria-label="Wizard progress">
            {steps.map((item, index) => (
              <li key={item.key} className={index === step ? "current" : index <= furthest ? "done" : ""}>
                {/* Any step already reached is a link; steps past that unlock by moving forward. */}
                {index !== step && index <= furthest
                  ? <button type="button" onClick={() => go(index)} aria-label={`Go to ${item.label}`}>{item.label}</button>
                  : <span aria-current={index === step ? "step" : undefined}>{item.label}</span>}
              </li>
            ))}
          </ol>
        </div>

        {stepKey === "trip" && (
          <div className="stack">
            <h1>{mode === "ai" ? "Let's start with you" : "Where are you headed?"}</h1>
            {mode === "ai" && <p className="muted">ChatGPT will pull your dates, flights, and who's traveling from your bookings. Training is at {trainingAddress} ({trainingDetail}).</p>}
            <div className="wizard-grid">
              <label>{mode === "ai" ? "Full name" : "Your name (optional)"}<input value={answers.displayName} onChange={e => set("displayName", e.target.value)} placeholder={mode === "ai" ? "As it appears on your bookings" : "Shown above your email in the menu"} maxLength={80} autoComplete="name" /></label>
              <label>Name your trip<input value={answers.tripName} onChange={e => set("tripName", e.target.value)} placeholder="Diffusion Bootcamp 2026" maxLength={120} /></label>
              {mode === "manual" && <>
              <DestinationField answers={answers} set={set} />
              <label>Traveling from<PlaceInput value={answers.homeCity} onChange={value => set("homeCity", value)} placeholder="City or home airport" maxLength={160} /></label>
              <TripDateFields answers={answers} set={set} />
              <label className="wide">Training or event location<PlaceInput value={answers.trainingLocation} onChange={value => set("trainingLocation", value)} placeholder="Venue or address, if you know it" /></label>
              </>}
            </div>
          </div>
        )}

        {stepKey === "email" && (
          <div className="stack">
            <h1>How should ChatGPT get your bookings?</h1>
            <p className="muted">Your flight, hotel, rental car, training, and insurance confirmations fill in Trip Information for you.</p>
            <div className="option-list" role="radiogroup">
              {([
                ["paste", "I'll paste my confirmation emails", "Works everywhere, including the ChatGPT app on your phone. After ChatGPT opens, copy each confirmation email into the same chat.", "Recommended"],
                ["connected", "Let ChatGPT search my email", "Only works with a paid ChatGPT plan (Plus or Team) that has the Gmail connector turned on, and only from a computer. The phone app can't read email.", ""],
                ["skip", "Skip bookings for now", "Just plan the trip. You can add bookings later on the Trip Information page.", ""]
              ] as [EmailAccess, string, string, string][]).map(([value, title, detail, badge]) => (
                <button type="button" key={value} role="radio" aria-checked={answers.emailAccess === value} className={`option ${answers.emailAccess === value ? "selected" : ""}`} onClick={() => set("emailAccess", value)}>
                  <strong>{title}{badge && <em className="option-badge">{badge}</em>}</strong><span>{detail}</span>
                </button>
              ))}
            </div>
            {answers.emailAccess === "connected" && (
              <label>Which email has your trip confirmations?<input type="email" value={answers.bookingEmail} onChange={e => set("bookingEmail", e.target.value)} placeholder="you@example.com" maxLength={254} autoComplete="email" /></label>
            )}
            {answers.emailAccess && answers.emailAccess !== "skip" && (
              <label>Anything that helps it find them? (optional)<input value={answers.bookingHints} onChange={e => set("bookingHints", e.target.value)} placeholder="United flight, Hotel Zephyr, Hertz rental..." maxLength={300} /></label>
            )}
          </div>
        )}

        {stepKey === "bookings" && (
          <div className="stack">
            <h1>Add your bookings</h1>
            <p className="muted">Add flights, hotels, rental cars, and training details with their dates and times. Each one saves as soon as you add it. You can also do this later on the Trip Information page.</p>
            <BookingForm onSaved={reload} compact />
            <WizardList
              empty="No bookings added yet."
              items={bookings.map(booking => ({ id: booking.id, title: booking.title, detail: [categoryTitle(booking.category), booking.provider, booking.start_at].filter(Boolean).join(" · ") }))}
              onRemove={async id => { await api("/api/trip-info", { method: "DELETE", body: JSON.stringify({ id }) }); await reload(); }}
            />
          </div>
        )}

        {stepKey === "travelers" && (
          <div className="stack">
            <h1>Who's traveling with you?</h1>
            <div className="wizard-grid"><TravelerFields answers={answers} set={set} /></div>
          </div>
        )}

        {stepKey === "interests" && (
          <div className="stack">
            <h1>What would you like to do while you're there?</h1>
            <div className="wizard-grid"><InterestFields answers={answers} set={set} showMustDo={mode === "ai"} /></div>
            {mode === "manual" && <PlacesToVisit places={places} reload={reload} />}
          </div>
        )}

        {stepKey === "chatgpt" && (
          <div className="stack">
            <h1>Send it to ChatGPT</h1>
            <p className="muted">We've put everything into one prompt. When ChatGPT is done it gives you a trip-plan.json file to download; you'll upload that on the next step.</p>
            <div className="button-row">
              <button className="btn primary" onClick={() => window.open(`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`, "_blank")}>Open ChatGPT with prompt</button>
              <button className="btn" onClick={copyPrompt}>{copied ? "Copied" : "Copy prompt"}</button>
            </div>
            <ol className="how-to">
              <li><strong>Send the prompt.</strong> "Open ChatGPT" opens the ChatGPT website with it filled in. To use the ChatGPT app instead, tap "Copy prompt" and paste it there.</li>
              {answers.emailAccess === "paste" && (
                <li><strong>Paste your confirmation emails.</strong> In your email app, search for the airline, hotel, rental company, and bootcamp, open each confirmation, select all of the message, copy it, and paste it into the same ChatGPT chat. One email per message is fine.</li>
              )}
              {answers.emailAccess === "connected" && (
                <li><strong>Let it search.</strong> ChatGPT reads your inbox through the Gmail connector. If it says it can't, don't buy anything it suggests: switch to pasting instead.</li>
              )}
              <li><strong>Answer its questions</strong>, then download the trip-plan.json file it makes.</li>
            </ol>
            {answers.emailAccess === "connected" && (
              <div className="callout compact">
                <p>Couldn't read your email, or you're on your phone?</p>
                <button type="button" className="btn" onClick={() => set("emailAccess", "paste")}>Switch to pasting my emails</button>
              </div>
            )}
            <details className="prompt-preview"><summary>See the prompt</summary><pre>{prompt}</pre></details>
          </div>
        )}

        {stepKey === "paste" && (
          <div className="stack">
            <h1>Upload your trip file</h1>
            <p className="muted">Download the trip-plan.json file ChatGPT created, then drop it here or upload it. Then hit Continue.</p>
            <JsonFileInput value={answers.response} onChange={value => set("response", value)} placeholder='{ "tripName": "...", "records": [ ... ] }' />
            {process.env.NODE_ENV !== "production" && <button type="button" className="link-button" onClick={() => set("response", sampleResponse)}>Fill with a sample response (dev only)</button>}
          </div>
        )}

        {stepKey === "review" && (
          <div className="stack">
            <h1>Here's your trip</h1>
            <p className="muted">Check it over, then build your trip. You can change anything later.</p>
            <dl className="review-list">
              <div><dt>Your name</dt><dd>{answers.displayName || "Not set (your email will show instead)"}</dd></div>
              <div><dt>Trip</dt><dd>{answers.tripName || "Untitled trip"}{answers.destination && ` · ${answers.destination}`}</dd></div>
              <div><dt>Dates</dt><dd>{answers.startDate || answers.endDate ? `Leave ${answers.startDate || "?"} · Return ${answers.endDate || "?"}` : "Not set"}</dd></div>
              <div><dt>Traveling from</dt><dd>{answers.homeCity || "Not set"}</dd></div>
              <div><dt>Training or event</dt><dd>{answers.trainingLocation || "Not set"}</dd></div>
              <div><dt>Travelers</dt><dd>{answers.travelerCount}{answers.travelers && ` · ${answers.travelers}`}</dd></div>
              <div><dt>Bookings</dt><dd>{bookings.length ? bookings.map(booking => booking.title).join(", ") : "None yet"}</dd></div>
              <div><dt>Interests</dt><dd>{answers.interests.length ? answers.interests.join(", ") : "None picked"}</dd></div>
              <div><dt>Places to visit</dt><dd>{places.length ? places.map(place => place.title).join(", ") : "None yet"}</dd></div>
            </dl>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <div className="wizard-nav">
          <button className="btn" onClick={() => (step > 0 ? go(step - 1) : leaveWith(onBackToChoice))}>Back</button>
          {!isLast
            ? <button className="btn primary" onClick={() => go(step + 1)}>{stepKey === "chatgpt" ? "I have the answer" : "Next"}</button>
            : mode === "ai"
              ? <button className="btn primary" disabled={!answers.response.trim()} onClick={build}>Continue</button>
              : <button className="btn primary" onClick={build}>Build my trip</button>}
        </div>
        {leaving && <LeaveSetupDialog mode={mode} onStay={() => setLeaving(false)} onLeave={leaveSetup} />}
      </section>
    </main>
  );
}

function WizardList({ items, empty, onRemove }: { items: { id: string; title: string; detail?: string }[]; empty: string; onRemove: (id: string) => Promise<void> }) {
  if (!items.length) return <p className="muted">{empty}</p>;
  return (
    <ul className="wizard-list">
      {items.map(item => (
        <li key={item.id}><div><strong>{item.title}</strong>{item.detail && <span>{item.detail}</span>}</div><button type="button" className="delete-item" onClick={() => onRemove(item.id)}>Remove</button></li>
      ))}
    </ul>
  );
}

function PlacesToVisit({ places, reload }: { places: WizardItem[]; reload: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    await api("/api/items", { method: "POST", body: JSON.stringify({ page: "explore", title }) });
    setTitle("");
    await reload();
  }
  return (
    <div className="stack">
      <h2>Places you want to visit</h2>
      <p className="muted">These go on your Explore San Francisco list.</p>
      <form className="item-form" onSubmit={add}>
        <PlaceInput value={title} onChange={setTitle} placeholder="Golden Gate Bridge, a restaurant, a museum..." maxLength={180} />
        <button className="btn primary">Add</button>
      </form>
      <WizardList
        empty="No places added yet."
        items={places}
        onRemove={async id => { await api("/api/items", { method: "DELETE", body: JSON.stringify({ id }) }); await reload(); }}
      />
    </div>
  );
}

// NBC-style chime: A, then B, then C light up, all three flash, then repeat until the trip is built.
// Always plays at least one full A-B-C so a fast import still gets the whole animation.
const beatMs = [450, 650, 650, 650, 900];
const loaderMessages = ["Reading your bookings", "Building your checklists", "Mapping out your days", "Packing your bags", "Almost there"];

export function AbcLoader({ done, failed, onFinish, onFailed, messages = loaderMessages }: { done: boolean; failed: boolean; onFinish: () => void; onFailed: () => void; messages?: string[] }) {
  const [beat, setBeat] = useState(0);
  const [loop, setLoop] = useState(0);
  const [sound, setSound] = useState(() => chimeEnabled());
  const [ready, setReady] = useState(() => chimeReady());
  const latestSound = useRef(sound);
  latestSound.current = sound;
  const latest = useRef({ done, onFinish });
  latest.current = { done, onFinish };

  useEffect(() => { if (failed) onFailed(); }, [failed, onFailed]);

  useEffect(() => {
    // Beats 1-3 light A, B, C; each gets its note of the chime.
    if (beat >= 1 && beat <= 3 && sound) setReady(playChimeNote(beat - 1) || chimeReady());
    const timer = setTimeout(() => {
      if (beat < beatMs.length - 1) return setBeat(beat + 1);
      if (latest.current.done) return latest.current.onFinish();
      setLoop(count => count + 1);
      setBeat(0);
    }, beatMs[beat]);
    return () => clearTimeout(timer);
  }, [beat]); // eslint-disable-line react-hooks/exhaustive-deps

  // The preference (on/off) is saved to the device and the account on every change. "Unlocked" is separate:
  // browsers only let audio start after a click or key press, so a saved "on" can still be waiting for a tap.
  function setSoundPreference(on: boolean) {
    saveChimeEnabled(on);
    setSound(on);
    if (on) { primeChime(); setReady(chimeReady()); }
  }
  function toggleSound() {
    if (!sound) return setSoundPreference(true);
    if (!ready) { primeChime(); setReady(chimeReady()); return; } // unlock, keep it on
    setSoundPreference(false);
  }
  useEffect(() => {
    // Space bar flips sound on/off (a key press also counts as the gesture that unlocks audio).
    function onKey(event: KeyboardEvent) {
      if (event.code !== "Space" && event.key !== " ") return;
      const target = event.target as HTMLElement | null;
      if (target && /^(input|textarea|select|button)$/i.test(target.tagName)) return;
      event.preventDefault();
      setSoundPreference(!latestSound.current);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const soundLabel = !sound ? "Sound off" : ready ? "Sound on" : "Sound on · tap to allow";

  return (
    <main className="abc-stage" role="status" aria-live="polite">
      <AbcLetters beat={beat} />
      <p className="abc-caption">{messages[loop % messages.length]}...</p>
      <button type="button" className={`abc-sound ${sound && !ready ? "attention" : ""}`} onClick={toggleSound} aria-pressed={sound}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{sound ? <path d="M4 9v6h4l5 4V5L8 9H4zM16 8a5 5 0 0 1 0 8M18.5 5.5a9 9 0 0 1 0 13" /> : <path d="M4 9v6h4l5 4V5L8 9H4zM17 9l4 6M21 9l-4 6" />}</svg>
        {soundLabel}<span className="visually-hidden"> (space bar toggles sound)</span>
      </button>
    </main>
  );
}

// The letters and peacock feathers at a given beat (0 = dark, 1-3 = A, B, C lit, 4 = flash).
function AbcLetters({ beat }: { beat: number }) {
  return (
    <>
      <div className={`abc-letters ${beat === 4 ? "flash" : ""}`}>
        {["A", "B", "C"].map((letter, index) => <span key={letter} className={`abc-letter abc-${letter.toLowerCase()} ${beat > index ? "lit" : ""}`}>{letter}</span>)}
      </div>
      <div className="abc-feathers" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <i key={index} className={beat > Math.floor(index / 2) ? "lit" : ""} />)}</div>
    </>
  );
}

// Compact, silent version of the bumper for the login card: loops forever, sits still (all lit) when the
// person prefers reduced motion.
export function AbcMark({ small = false }: { small?: boolean }) {
  const [beat, setBeat] = useState(0);
  const still = useMemo(() => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  useEffect(() => {
    if (still) return;
    // A touch slower than the loader: a longer dark pause, then each letter holds about 25% longer.
    const timer = setTimeout(() => setBeat(beat < beatMs.length - 1 ? beat + 1 : 0), beat === 0 ? 1100 : Math.round(beatMs[beat] * 1.25));
    return () => clearTimeout(timer);
  }, [beat, still]);
  return <div className={small ? "abc-logo small" : "abc-logo"} aria-hidden="true"><AbcLetters beat={still ? 3 : beat} /></div>;
}
