// The User Guide shown on Settings > User Guide. Plain prose for attendees: what the planner is, how to get
// in, what each page and control is for, and what changed recently. Keep it current when features change.

import { useState } from "react";
import { CUSTOM_BONUS, CUSTOM_LIMIT, FIXED, MIN_ITEMS_FOR_UNLOCK, PAGE_CAP, PRIZE_NOTE } from "@/lib/stars-rules";

export const APP_URL = "https://diffusion-bootcamp-2026-trip-planne.vercel.app";
export const GUIDE_UPDATED = "September 27, 2026";

// `readAt` and `onRead` drive the "I've read the guide" box at the bottom, which is worth stars (see the Stars
// section below). The first tick is the one that counts; the box stays ticked afterwards.
export function UserGuide({ readAt = null, onRead }: { readAt?: string | null; onRead?: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function tick() {
    if (readAt || busy || !onRead) return;
    setBusy(true);
    try { await onRead(); } finally { setBusy(false); }
  }
  return (
    <article className="callout guide">
      <h2>What this planner is</h2>
      <p>
        The ABC Fitness Diffusion Bootcamp Trip Planner keeps everything for the San Francisco training trip in one place: your bookings,
        your checklists, a day-by-day itinerary, the local weather, and a photo route to fill in along the way. Each attendee has a private
        account, and everything you save is stored encrypted under it. Nothing you enter is shared with other attendees, apart from
        your display name and star count on the rankings (see Stars below).
      </p>
      <p>
        Reach it at <a href={APP_URL}>{APP_URL}</a>. It works in any browser, on a computer or a phone, and there is nothing to install.
      </p>

      <h2>Getting started</h2>
      <ul>
        <li><strong>Create an account.</strong> Enter your email and the invite code from the trip organizer, then open the email we send you: its button brings you back to choose a password. The link works once and expires in 24 hours. The first visit on a new device leads with this step.</li>
        <li><strong>Sign in later.</strong> Once a device has signed in, the login page opens on the sign-in form and remembers your email. Use &ldquo;Forgot your password?&rdquo; to get a reset link by email.</li>
        <li><strong>Choose how to plan.</strong> &ldquo;Plan with ChatGPT&rdquo; asks a few questions, hands ChatGPT one prompt, and reads back the trip-plan.json file it produces. &ldquo;Set it up myself&rdquo; walks you through the same details by hand.</li>
        <li><strong>Leave setup whenever you like.</strong> Your answers are saved as you go. A &ldquo;Finish setup&rdquo; banner on the Overview brings you back to where you left off.</li>
      </ul>

      <h2>The pages</h2>
      <h3>Overview</h3>
      <ul>
        <li>Shows your trip name, your dates, and what is next: the closest booking or itinerary stop.</li>
        <li>Lists today&rsquo;s schedule. Earlier items sit under &ldquo;Earlier today,&rdquo; and finished ones under &ldquo;Done.&rdquo;</li>
        <li>&ldquo;Edit itinerary&rdquo; opens the Explore page, where any stop can be changed.</li>
      </ul>
      <h3>Pre-checks, Packing, Departure Day, and Return Day</h3>
      <ul>
        <li>Four checklists: confirmations to tie up before you fly, what goes in the bag, your morning-of runbook, and the checkout routine for the way home.</li>
        <li>Type in the box and press Add to add an item. Tap an item to check it off, and checked items drop to the bottom. Use the &times; to delete one.</li>
        <li>The number beside each page in the navigation is how many items are still open.</li>
      </ul>
      <h3>Explore San Francisco</h3>
      <ul>
        <li><strong>Itinerary</strong> shows your day-by-day plan with your bookings slotted in: flights, hotel check-in and check-out, rental pickup and return, and the bootcamp agenda appear on their days automatically and follow the booking when it is added, changed, or removed under Trip Information. Tap one to go there. &ldquo;Plan with ChatGPT&rdquo; builds a prompt from your places, dates, and interests. Open ChatGPT with it, then paste its text answer back (a trip-plan.json works too). Importing a file again keeps your checklist ticks. &ldquo;Clear itinerary&rdquo; starts over.</li>
        <li>Tap any stop to change its time, place, why it fits, or address, move it to another day, or remove it. &ldquo;+ Add stop&rdquo; on a day adds one. Saved changes show up on the Overview right away.</li>
        <li><strong>Places to visit</strong> is a checklist of spots you want to see. &ldquo;Use my places to visit&rdquo; feeds them into the ChatGPT prompt.</li>
      </ul>
      <h3>Trip Information</h3>
      <ul>
        <li>Your bookings, grouped as Flights, Hotel, Rental Car, Training, Insurance, and Other, each with dates, times, confirmation details, and notes.</li>
        <li>Adding one from a tab keeps that type. Provider suggests common airlines, hotel chains, and rental companies but takes any name; the start and end fields are date and time pickers; phone numbers are tidied as you type. Flights take From and To airport codes, which give the Overview its route and miles.</li>
        <li>&ldquo;+ PDF&rdquo; stores insurance or protection documents so they are on hand during the trip.</li>
        <li>Bookings and PDFs can be deleted from their cards. Deleting asks you to confirm first.</li>
        <li><strong>Add to calendar.</strong> The menu at the top downloads a calendar file (.ics) with the whole trip: an all-day block for your dates, every booking with a readable start, and the training days with the daily agenda. Each booking card has its own &ldquo;Add to calendar&rdquo; button, and the Training tab can add just the training days. Open the file and Apple Calendar, Google Calendar, or Outlook adds the events. If you set a calendar guest in Settings, every event invites them too.</li>
      </ul>
      <h3>Photo Route</h3>
      <ul>
        <li>Six stops around the Bay Area, each with room for one photo: Golden Gate Overlook, Ferry Building, North Beach, Mission District, Half Moon Bay, and a favorite surprise.</li>
        <li>&ldquo;+ Photo&rdquo; adds a photo to a stop. Large photos are shrunk before they are saved. Adding a photo to a filled stop replaces the old one.</li>
        <li>Every stop starts with a stock photo of the place, marked &ldquo;Stock.&rdquo; Adding your own photo replaces it. Tap a stop to see its photo full size or to delete it; deleting a stock photo removes it for good, so the app asks first.</li>
      </ul>
      <h3>Settings</h3>
      <ul>
        <li><strong>Profile:</strong> your display name, the trip name, your home address, your training location, an optional calendar invite guest (someone to invite on every calendar event you download), and the switch that mutes the loading-screen chime.</li>
        <li><strong>Trip details:</strong> destination, dates, travelers, and interests. These are the same answers the setup wizard collects.</li>
        <li><strong>Account:</strong> delete your account and everything stored with it. This cannot be undone.</li>
        <li><strong>User Guide:</strong> this page.</li>
      </ul>
      <h3>Organizer</h3>
      <p>
        Only the trip organizer sees this page. Its Accounts tab lists every attendee, and each row&rsquo;s Actions menu can email or copy a
        password reset link, sign the person out everywhere, suspend or reinstate them, or remove the account. Other tabs send a notice
        to everyone and show request performance, stored data size, and an activity log. The log keeps what people did for a year; routine page loads are kept for a week only, and polling such as weather is not logged unless it fails. The organizer is also
        notified when someone new joins and when the app crosses a health threshold: slow responses, server errors, or a database
        that is large or growing quickly. Opening one of those notifications shows the numbers behind it and what to do.
      </p>

      <h2>Around the app</h2>
      <ul>
        <li><strong>Finding pages.</strong> The sidebar groups the pages by when they matter: Get ready, Travel days, and On the trip, with Overview above them. Tap a group&rsquo;s heading to fold it away; a folded heading shows how many items are still open inside. The arrow at the top shrinks the sidebar to icons.</li>
        <li><strong>Weather.</strong> Below the pages, the sidebar shows the forecast for where you are, or for the training location until you share your location.</li>
        <li><strong>Account menu.</strong> Your initial, at the bottom left on a computer or the top right on a phone. It holds Settings, Notifications, Theme, ABC WhatsApp, Report Bug, and Sign out.</li>
        <li><strong>Notifications.</strong> Notices from the trip organizer land here, and a count on your initial shows how many are unread. Mark them all as read, delete one at a time, or clear them all.</li>
        <li><strong>Themes.</strong> &ldquo;Theme&rdquo; in the account menu opens a picker for Light, Dark, or Digital Nirvana. Digital Nirvana adds a &ldquo;Grid effects&rdquo; switch for the animated backdrop.</li>
        <li><strong>ABC WhatsApp.</strong> The group chat&rsquo;s invite link and a QR code, so you can open the group or add someone standing next to you.</li>
        <li><strong>Report Bug.</strong> Found something broken, or have an idea? &ldquo;Report Bug&rdquo; in the account menu saves your note for the trip organizer and emails it to them. A bug that gets fixed, or an idea that gets accepted, earns you stars.</li>
        <li><strong>Loading chime.</strong> The A-B-C letters on the loading screen play three notes. Browsers only allow sound after you have tapped or typed on the page, so a cold start may be silent. Mute it in Settings or with the sound button on the loading screen.</li>
        <li><strong>Save messages.</strong> Every save, add, or delete shows a short message at the bottom of the screen: green when it worked, red with the reason when it did not.</li>
        <li><strong>Web addresses.</strong> Each page has its own address, so you can bookmark one, refresh without losing your place, and use the back button.</li>
        <li><strong>Signing out.</strong> After an hour without activity you are warned, and two minutes later you are signed out. Use &ldquo;Sign out&rdquo; in the account menu to leave sooner.</li>
        <li><strong>On a phone.</strong> The pages sit in a bar along the bottom of the screen that scrolls sideways. Your account menu is the initial at the top right.</li>
      </ul>

      <h2>Stars</h2>
      <p>
        Stars are points for getting ready for the trip. The Overview strip shows your total, how close you are to 100% of what you can earn,
        and a Rank cell that cycles through everyone with stars, starting from first place. {PRIZE_NOTE}
      </p>
      <ul>
        <li><strong>Checklists.</strong> Every item you check off on Pre-checks, Packing, Departure Day, Return Day, or Places to visit adds a waiting star to that page&rsquo;s progress bar (1 per item, up to {PAGE_CAP} per list). When every item on the list is checked, the waiting stars unlock into your total. A list needs at least {MIN_ITEMS_FOR_UNLOCK} items, and the stars you get are the items on the list at that moment, so finish the list rather than shrinking it.</li>
        <li><strong>Your own items.</strong> The first {CUSTOM_LIMIT} items you ever add by hand count like any other. Check all {CUSTOM_LIMIT} off for a {CUSTOM_BONUS}-star bonus. Items added after that still count toward finishing a list but earn nothing.</li>
        <li><strong>Profile:</strong> a display name, home address, and training location in Settings earn {FIXED.profile} stars.</li>
        <li><strong>Trip details:</strong> your start and end dates plus at least one booking earn {FIXED.trip} stars.</li>
        <li><strong>This guide:</strong> tick the box at the bottom of this page for {FIXED.guide} stars.</li>
        <li><strong>Bugs and ideas:</strong> a bug report the organizer fixes earns {FIXED.bug} stars, and feedback the organizer accepts earns {FIXED.feedback}, each up to {FIXED.reportCap} times. You get a notification when that happens.</li>
        <li><strong>Once earned, stars stay.</strong> Unchecking an item or deleting one never takes stars away, and each award can only be earned once. The organizer is not ranked.</li>
      </ul>

      <h2>What&rsquo;s new</h2>
      <p className="muted">Updated {GUIDE_UPDATED}.</p>
      <ul>
        <li>&ldquo;Plan again with ChatGPT&rdquo; on the Explore page now asks for a day-by-day answer built around your dates and bookings, and importing a trip-plan.json again keeps your checklist ticks and hand-added items.</li>
        <li>The itinerary now takes flights, hotel, rental car, and bootcamp times straight from Trip Information, so adding, changing, or removing a booking updates the right day on its own. When a ChatGPT plan is imported, lines that only repeat a booking are left out. Older plans get one tidy pass with an Undo; stops you write yourself are never removed automatically.</li>
        <li>Creating an account now goes through your inbox: enter your email and the invite code, then choose your password from the link we send. If the address already has an account, the email says so and offers a reset link instead.</li>
        <li>Rankings show &ldquo;Unnamed attendee&rdquo; for anyone who has not set a display name yet, instead of part of their email.</li>
        <li>Stars: earn points for finishing checklists, filling in your profile and trip details, reading this guide, and reporting bugs or ideas the organizer acts on. The Overview shows your total, your distance to 100%, and the rankings; checklist pages show the stars waiting to unlock.</li>
        <li>Bug reports and feedback are now kept for the organizer, who can mark them fixed or accepted from the Organizer page.</li>
        <li>Add to calendar is back: Trip Information downloads calendar files for the whole trip, one booking, or the training days, and Settings has a calendar guest who gets invited on every event.</li>
        <li>The sidebar groups pages into Get ready, Travel days, and On the trip. Each group folds away, and the forecast sits under its own divider.</li>
        <li>Address fields say so when suggestions are unavailable, and the booking form&rsquo;s Address field offers suggestions too.</li>
        <li>For the organizer: each account on the Accounts tab has a single Actions menu, and the Activity tab separates what people did from routine page loads.</li>
        <li>Notifications: the organizer can send a notice to everyone, and unread ones show as a count on your initial. Open one to see its details.</li>
        <li>For the organizer: a notification when a new attendee joins, and health alerts for slow responses, server errors, and database size or growth, with a daily automatic check and a &ldquo;Check now&rdquo; button on the Organizer page.</li>
        <li>Report Bug in the account menu emails the organizer with your note.</li>
        <li>ABC WhatsApp in the account menu shows the group link and a QR code.</li>
        <li>The theme picker moved into its own window from the account menu.</li>
        <li>Every page has its own web address.</li>
        <li>Every save now confirms it worked or says why it did not.</li>
        <li>Photo Route: photos can be deleted, large photos are shrunk before saving, each stop holds one photo, and the route zig-zags between stops. Stops now start with a stock photo until you add your own.</li>
        <li>Login: a Welcome step for first-time visitors, a clearer &ldquo;Create an account&rdquo; button, and your email remembered for a year on devices you have used.</li>
        <li>Automatic sign-out after an hour of inactivity, with a two-minute warning.</li>
        <li>The loading screen plays A, B, C as three rising notes, with a mute switch in Settings.</li>
        <li>The setup wizard leads with pasting your confirmation emails into ChatGPT and explains when ChatGPT can search your email directly.</li>
        <li>Phone layout: a slimmer top bar, and the page bar stays at the bottom in every theme.</li>
      </ul>

      <label className={readAt ? "check-toggle guide-read done" : "check-toggle guide-read"}>
        <input type="checkbox" className="visually-hidden" checked={Boolean(readAt)} disabled={Boolean(readAt) || busy || !onRead} onChange={tick} />
        <span className="check-box" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
        <span className="check-title">{readAt ? `You read the guide. ${FIXED.guide} stars earned.` : `I have read the guide (${FIXED.guide} stars)`}</span>
      </label>
    </article>
  );
}
