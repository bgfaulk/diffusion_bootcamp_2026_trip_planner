import Planner from "../planner";

// Every page of the planner is the same client app. The path picks the page (see pagePaths in planner.tsx),
// which gives each one a real URL: refresh keeps your place, back/forward work, and pages can be linked to.
export default function Page() {
  return <Planner />;
}
