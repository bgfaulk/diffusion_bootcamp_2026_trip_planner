import { notify } from "@/app/toast";

// Every browser call to /api goes through here. Besides JSON handling it watches for a redeploy: each
// response carries the build it came from (X-App-Build, set in next.config.ts) and this bundle knows its
// own. A tab left open across a deploy keeps working until an API's shape changes under it, so on the first
// mismatch the person is told a reload is available, and any failure from a newer build says to reload
// rather than showing a confusing error.
const ownBuild = process.env.NEXT_PUBLIC_APP_BUILD;
const reloadHint = "Trip Planner was updated while this page was open. Reload the page and try again.";
let noticed = false;

function updatedSince(response: Response) {
  const served = response.headers.get("x-app-build");
  if (!ownBuild || !served || served === ownBuild) return false;
  if (!noticed) {
    noticed = true;
    notify.info("A newer version of Trip Planner is available.", { label: "Reload", run: () => location.reload() });
    reloadWhenIdle();
  }
  return true;
}

// A stale tab also refreshes itself, without the toast, at a moment nothing can be lost: when it comes back after
// at least half a minute in the background (a phone app switch, another tab) with no dialog open and nothing typed
// into a field, or when the browser restores it from its back/forward cache. Frequent deploys otherwise mean the
// same person sees the toast every time they return to the app.
function reloadWhenIdle() {
  let hiddenAt = document.visibilityState === "hidden" ? Date.now() : 0;
  const untouched = () => !document.querySelector(".modal-backdrop") && ![...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")]
    .some(field => !["checkbox", "radio", "hidden", "submit", "button", "file"].includes(field.type) && !field.readOnly && field.value.trim() !== "" && field.defaultValue !== field.value);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 30_000 && untouched()) location.reload();
  });
  window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
}

export async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" })
    }
  });
  const stale = updatedSince(response);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(stale ? reloadHint : data.error || "Request failed");
  return data;
}
