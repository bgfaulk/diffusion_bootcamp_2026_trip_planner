const pages = [...document.querySelectorAll(".page")];
const navItems = [...document.querySelectorAll("[data-page]")];
let state = { settings: {}, items: [], photos: {}, spots: [], phoneUrl: "" };

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" })
    }
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function showPage(id) {
  pages.forEach(page => page.classList.toggle("active", page.id === id));
  document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.page === id));
  document.getElementById("profile-popover").hidden = true;
}

navItems.forEach(item => item.addEventListener("click", () => showPage(item.dataset.page)));
document.getElementById("profile-button").addEventListener("click", () => {
  const popover = document.getElementById("profile-popover");
  popover.hidden = !popover.hidden;
});

async function load() {
  state = await api("/api/bootstrap");
  renderSettings();
  renderLists();
  renderGallery();
  renderMetrics();
  maybeShowWizard();
}

function renderSettings() {
  const name = state.settings.profileName || "Traveler";
  const tripName = state.settings.tripName || "Trip dashboard";
  document.getElementById("profile-name").textContent = name;
  document.getElementById("profile-initial").textContent = name.trim().charAt(0).toUpperCase() || "T";
  document.getElementById("trip-name").textContent = tripName;
  document.getElementById("overview-title").textContent = tripName === "Trip dashboard" ? "Plan the trip, keep the memories." : tripName;
  document.getElementById("phone-url").textContent = state.phoneUrl || "Start the local server to get a phone URL.";
  const form = document.getElementById("settings-form");
  [...form.elements].forEach(el => {
    if (el.name && state.settings[el.name] !== undefined) el.value = state.settings[el.name];
  });
}

function groupedItems(page) {
  return state.items
    .filter(item => item.page === page)
    .sort((a, b) => Number(a.checked) - Number(b.checked) || a.position - b.position || a.id - b.id);
}

function renderLists() {
  document.querySelectorAll("[data-list-page]").forEach(section => {
    const page = section.dataset.listPage;
    const panel = section.querySelector(".list-panel");
    const items = groupedItems(page);
    panel.innerHTML = `
      <form class="item-form" data-add-page="${page}">
        <input name="title" placeholder="Add a custom item">
        <button class="btn primary" type="submit">Add</button>
      </form>
      <div class="list-items">
        ${items.map(item => `
          <div class="list-item ${item.checked ? "done" : ""}" data-item-id="${item.id}">
            <input type="checkbox" ${item.checked ? "checked" : ""} aria-label="Mark item complete">
            <label>${escapeHtml(item.title)}</label>
            <button class="delete-item" type="button" aria-label="Delete item">Delete</button>
          </div>
        `).join("")}
      </div>
    `;
  });
}

function renderMetrics() {
  const done = state.items.filter(item => item.checked).length;
  document.getElementById("metric-done").textContent = done;
  document.getElementById("metric-open").textContent = state.items.length - done;
  document.getElementById("metric-photos").textContent = Object.keys(state.photos).length;
}

function renderGallery() {
  const select = document.getElementById("photo-spot");
  select.innerHTML = state.spots.map(spot => `<option value="${spot.id}">${escapeHtml(spot.title)}</option>`).join("");
  const route = document.getElementById("photo-route");
  route.innerHTML = state.spots.map(spot => {
    const photo = state.photos[spot.id];
    const caption = photo?.caption || spot.hint;
    return `
      <button class="photo-stop" type="button" data-spot="${spot.id}">
        <span class="photo-frame">${photo ? `<img src="${photo.imageUrl}" alt="${escapeHtml(spot.title)}">` : escapeHtml(spot.title)}</span>
        <span class="photo-copy"><strong>${escapeHtml(spot.title)}</strong><span class="muted">${escapeHtml(caption || "")}</span><span class="status-text">Open viewer</span></span>
      </button>
    `;
  }).join("");
}

document.addEventListener("submit", async event => {
  if (event.target.matches(".item-form")) {
    event.preventDefault();
    const page = event.target.dataset.addPage;
    const title = event.target.title.value.trim();
    if (!title) return;
    await api("/api/items", { method: "POST", body: JSON.stringify({ page, title }) });
    await load();
  }
  if (event.target.id === "settings-form") {
    event.preventDefault();
    await saveSettings(new FormData(event.target));
  }
  if (event.target.id === "wizard-form") {
    event.preventDefault();
    await saveSettings(new FormData(event.target));
    document.getElementById("first-run-dialog").close();
  }
  if (event.target.id === "photo-form") {
    event.preventDefault();
    const file = document.getElementById("photo-file").files[0];
    if (!file) {
      document.getElementById("photo-status").textContent = "Choose or take a photo first.";
      return;
    }
    document.getElementById("photo-status").textContent = "Saving photo...";
    await api("/api/photos", { method: "POST", body: new FormData(event.target) });
    event.target.reset();
    document.getElementById("photo-status").textContent = "Photo saved.";
    await load();
  }
  if (event.target.id === "teardown-form") {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    try {
      await api("/api/teardown", { method: "POST", body: JSON.stringify(data) });
      document.querySelector(".content").innerHTML = `<section class="callout"><h1>Local teardown started</h1><p>The local database is being deleted and the app folder is being moved aside. You can close this browser tab.</p></section>`;
    } catch {
      alert("The confirmation text did not match. Nothing was deleted.");
    }
  }
});

document.addEventListener("change", async event => {
  if (event.target.closest(".list-item") && event.target.type === "checkbox") {
    const row = event.target.closest(".list-item");
    await api(`/api/items/${row.dataset.itemId}/toggle`, {
      method: "POST",
      body: JSON.stringify({ checked: event.target.checked })
    });
    await load();
  }
});

document.addEventListener("click", async event => {
  if (event.target.matches(".delete-item")) {
    const id = event.target.closest(".list-item").dataset.itemId;
    await api(`/api/items/${id}`, { method: "POST", body: JSON.stringify({}) });
    await load();
  }
  const stop = event.target.closest(".photo-stop");
  if (stop) openViewer(stop.dataset.spot);
});

async function saveSettings(formData) {
  await api("/api/settings", { method: "POST", body: JSON.stringify(Object.fromEntries(formData.entries())) });
  await load();
}

function maybeShowWizard() {
  if (!state.settings.profileName || !state.settings.tripName) {
    document.getElementById("first-run-dialog").showModal();
  }
}

function openViewer(spotId) {
  const spot = state.spots.find(item => item.id === spotId);
  const photo = state.photos[spotId];
  document.getElementById("viewer-title").textContent = spot?.title || "Photo stop";
  document.getElementById("viewer-caption").textContent = photo?.caption || spot?.hint || "";
  document.getElementById("viewer-media").innerHTML = photo
    ? `<img src="${photo.imageUrl}" alt="${escapeHtml(spot?.title || "Trip photo")}">`
    : escapeHtml(spot?.title || "Photo stop");
  document.getElementById("photo-viewer").hidden = false;
}

document.getElementById("viewer-close").addEventListener("click", () => document.getElementById("photo-viewer").hidden = true);
document.getElementById("photo-viewer").addEventListener("click", event => {
  if (event.target.id === "photo-viewer") event.currentTarget.hidden = true;
});
document.getElementById("open-teardown").addEventListener("click", () => document.getElementById("teardown-dialog").showModal());
document.getElementById("cancel-teardown").addEventListener("click", () => document.getElementById("teardown-dialog").close());

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

load().catch(error => {
  document.querySelector(".content").innerHTML = `<section class="callout"><h1>Could not start dashboard</h1><p>${escapeHtml(error.message)}</p></section>`;
});
