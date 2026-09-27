// The User Guide shown on Settings > User Guide. Plain prose for attendees: what the planner is, how to get
// in, what each page and control is for, and what changed recently. Keep it current when features change.

export const APP_URL = "https://diffusion-bootcamp-2026-trip-planne.vercel.app";
export const GUIDE_UPDATED = "September 27, 2026";

export function UserGuide() {
  return (
    <article className="callout guide">
      <h2>What this planner is</h2>
      <p>
        The ABC Fitness Diffusion Bootcamp Trip Planner keeps everything for the San Francisco training trip in one place: your bookings,
        your checklists, a day-by-day itinerary, the local weather, and a photo route to fill in along the way. Each attendee has a private
        account, and everything you save is stored encrypted under it. Nothing you enter is shared with other attendees.
      </p>
      <p>
        Reach it at <a href={APP_URL}>{APP_URL}</a>. It works in any browser, on a computer or a phone, and there is nothing to install.
      </p>

      <h2>Getting started</h2>
      <ul>
        <li><strong>Create an account.</strong> Enter your email, choose a password, and type the invite code from the trip organizer. The first visit on a new device leads with this step.</li>
        <li><strong>Sign in later.</strong> Once a device has signed in, the login page opens on the sign-in form and remembers your email. Use &ldquo;Forgot your password?&rdquo; to get a reset link by email.</li>
        <li><strong>Choose how to plan.</strong> &ldquo;Plan with ChatGPT&rdquo; asks a few questions, hands ChatGPT one prompt, and reads back the trip-plan.json file it produces. &ldquo;Set it up myself&rdquo; walks you through the same details by hand.</li>
        <li><strong>Leave setup whenever you like.</strong> Your answers are saved as you go. A &ldquo;Finish setup&rdquo; banner on the Overview brings you back to where you left off.</li>
      </ul>

      <h2>The pages</h2>
      <h3>Overview</h3>
      <ul>
        <li>Shows your trip name, your dates, and what is next: the closest booking or itinerary stop.</li>
        <li>Lists today&rsquo;s schedule. Earlier items sit under &ldquo;Earlier today,&rdquo; and finished ones under &ldquo;Done.&rdquo;</li>
        <li>&ldquo;Edit itinerary&rdquo; opens the same planning tools as the Explore page.</li>
      </ul>
      <h3>Pre-checks, Packing, Departure Day, and Return Day</h3>
      <ul>
        <li>Four checklists: confirmations to tie up before you fly, what goes in the bag, your morning-of runbook, and the checkout routine for the way home.</li>
        <li>Type in the box and press Add to add an item. Tap an item to check it off, and checked items drop to the bottom. Use the &times; to delete one.</li>
        <li>The number beside each page in the navigation is how many items are still open.</li>
      </ul>
      <h3>Explore San Francisco</h3>
      <ul>
        <li><strong>Itinerary</strong> shows your day-by-day plan. &ldquo;Plan with ChatGPT&rdquo; builds a prompt from your places, dates, and interests. Open ChatGPT with it, then paste the answer back or upload the trip-plan.json file. &ldquo;Clear itinerary&rdquo; starts over.</li>
        <li><strong>Places to visit</strong> is a checklist of spots you want to see. &ldquo;Use my places to visit&rdquo; feeds them into the ChatGPT prompt.</li>
      </ul>
      <h3>Trip Information</h3>
      <ul>
        <li>Your bookings, grouped as Flights, Hotel, Rental Car, Training, Insurance, and Other, each with dates, times, confirmation details, and notes.</li>
        <li>&ldquo;+ PDF&rdquo; stores insurance or protection documents so they are on hand during the trip.</li>
        <li>Bookings and PDFs can be deleted from their cards. Deleting asks you to confirm first.</li>
      </ul>
      <h3>Photo Route</h3>
      <ul>
        <li>Six stops around the Bay Area, each with room for one photo: Golden Gate Overlook, Ferry Building, North Beach, Mission District, Half Moon Bay, and a favorite surprise.</li>
        <li>&ldquo;+ Photo&rdquo; adds a photo to a stop. Large photos are shrunk before they are saved. Adding a photo to a filled stop replaces the old one.</li>
        <li>Tap a stop to see its photo full size or to delete it.</li>
      </ul>
      <h3>Settings</h3>
      <ul>
        <li><strong>Profile:</strong> your display name, the trip name, your home address, your training location, and the switch that mutes the loading-screen chime.</li>
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
        <li><strong>Report Bug.</strong> Found something broken, or have an idea? &ldquo;Report Bug&rdquo; in the account menu sends your note straight to the trip organizer&rsquo;s email.</li>
        <li><strong>Loading chime.</strong> The A-B-C letters on the loading screen play three notes. Browsers only allow sound after you have tapped or typed on the page, so a cold start may be silent. Mute it in Settings or with the sound button on the loading screen.</li>
        <li><strong>Save messages.</strong> Every save, add, or delete shows a short message at the bottom of the screen: green when it worked, red with the reason when it did not.</li>
        <li><strong>Web addresses.</strong> Each page has its own address, so you can bookmark one, refresh without losing your place, and use the back button.</li>
        <li><strong>Signing out.</strong> After an hour without activity you are warned, and two minutes later you are signed out. Use &ldquo;Sign out&rdquo; in the account menu to leave sooner.</li>
        <li><strong>On a phone.</strong> The pages sit in a bar along the bottom of the screen that scrolls sideways. Your account menu is the initial at the top right.</li>
      </ul>

      <h2>What&rsquo;s new</h2>
      <p className="muted">Updated {GUIDE_UPDATED}.</p>
      <ul>
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
        <li>Photo Route: photos can be deleted, large photos are shrunk before saving, each stop holds one photo, and the route zig-zags between stops.</li>
        <li>Login: a Welcome step for first-time visitors, a clearer &ldquo;Create an account&rdquo; button, and your email remembered for a year on devices you have used.</li>
        <li>Automatic sign-out after an hour of inactivity, with a two-minute warning.</li>
        <li>The loading screen plays A, B, C as three rising notes, with a mute switch in Settings.</li>
        <li>The setup wizard leads with pasting your confirmation emails into ChatGPT and explains when ChatGPT can search your email directly.</li>
        <li>Phone layout: a slimmer top bar, and the page bar stays at the bottom in every theme.</li>
      </ul>
    </article>
  );
}
