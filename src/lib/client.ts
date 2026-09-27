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
  }
  return true;
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
