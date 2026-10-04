/* =========================================================================
   SHARED UTILITIES
   ========================================================================= */

const Utils = (() => {

  /* ---------- CSV fetching ---------- */

  async function fetchCSV(url) {
    if (!url) return null;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load sheet (${res.status})`);
    const text = await res.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    return parsed.data;
  }

  /* Loads a tab's data, falling back to placeholder rows if no URL is set
     in CONFIG, or if the fetch fails for any reason. */
  async function loadTab(tabKey, placeholderRows) {
    // Results are read live from the Apps Script when it's connected, so edits made
    // on the race page show up immediately (the published CSV can lag by minutes).
    const live = CONFIG.ADMIN && CONFIG.ADMIN.APPS_SCRIPT_URL;
    if (live && ["results", "highlights", "posters", "circuits"].includes(tabKey)) {
      try {
        const name = CONFIG.ADMIN.SHEET_NAMES[tabKey];
        const res = await fetch(`${live}?tab=${encodeURIComponent(name)}`, { cache: "no-store" });
        const json = await res.json();
        if (json.ok && json.rows.length) return { rows: json.rows, isPlaceholder: false };
      } catch (err) { console.warn("Live results unavailable, using the CSV.", err); }
    }
    const url = CONFIG.SHEET_URLS[tabKey];
    if (!url) return { rows: placeholderRows, isPlaceholder: true };
    try {
      const rows = await fetchCSV(url);
      if (!rows || rows.length === 0) return { rows: placeholderRows, isPlaceholder: true };
      return { rows, isPlaceholder: false };
    } catch (err) {
      console.warn(`Could not load "${tabKey}" tab, using placeholder data.`, err);
      return { rows: placeholderRows, isPlaceholder: true };
    }
  }

  /* Reads from the Google Docs bridge in apps-script/Code.gs.
     kind = "notes" | "links". Returns null if the script isn't connected. */
  async function fetchDoc(kind) {
    const base = CONFIG.ADMIN && CONFIG.ADMIN.APPS_SCRIPT_URL;
    if (!base) return null;
    try {
      const res = await fetch(`${base}?doc=${kind}`, { cache: "no-store" });
      const json = await res.json();
      return json.ok ? json : null;
    } catch (err) {
      console.warn(`Could not load "${kind}" doc.`, err);
      return null;
    }
  }

  /* Sprint weekend? Uses the "Sprint Weekend" column in the Races tab (Yes/No).
     Blank or missing column -> infer from whether any sprint results exist. */
  function isSprintWeekend(race, sessionKeysWithData) {
    const v = String(race["Sprint Weekend"] ?? "").trim().toLowerCase();
    if (["yes", "y", "true", "1", "sprint"].includes(v)) return true;
    if (["no", "n", "false", "0"].includes(v)) return false;
    return (sessionKeysWithData || []).some(k => k === "Sprint" || k === "Sprint Qualifying");
  }
  const SPRINT_SESSIONS = ["Sprint Qualifying", "Sprint"];
  const SPRINT_CATEGORIES = ["Sprint Qualifying", "Sprint Race"];

  /* ---------- text helpers ---------- */

  function slugify(str) {
    return String(str || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  function initials(name) {
    return String(name || "?")
      .split(" ")
      .filter(Boolean)
      .map(w => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase();
  }

  // Accepts 2026-03-06, 2026-03-06T00:00:00Z, or 3/6/2026 (CSV) -> local Date at midnight
  function parseDate(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    const str = String(v).trim();
    let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
    const d = new Date(str);
    return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // "Oct 10", "Oct 10–12", "Oct 30–Nov 1"
  function formatDateRange(startStr, endStr) {
    const start = parseDate(startStr), end = parseDate(endStr);
    if (!start && !end) return "TBC";
    const md = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (!start || !end || start.getTime() === end.getTime()) return md(start || end);
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      return `${md(start)}–${end.getDate()}`;
    }
    return `${md(start)}–${md(end)}`;
  }

  // Classification order: finishers by number, then DNF, DSQ, DNS
  const STATUS_RANK = { DNF: 1000, DSQ: 1001, DNS: 1002 };
  function posRank(pos) {
    const t = String(pos ?? "").trim().toUpperCase();
    if (t !== "" && !isNaN(Number(t))) return Number(t);
    return STATUS_RANK[t] ?? 2000;
  }
  const isStatusPos = (pos) => { const t = String(pos ?? "").trim(); return t !== "" && isNaN(Number(t)); };

  const isCancelled = (race) => String(race.Status || "").trim().toLowerCase() === "cancelled";

  // Round numbers as shown on the site: cancelled races get no number and the rest close the gap.
  // Underlying sheet Round values (used for results, notes, links) never change.
  function roundLabels(races) {
    const labels = {};
    let n = 0;
    [...races].sort((a, b) => Number(a.Round) - Number(b.Round)).forEach(r => {
      labels[String(r.Round)] = isCancelled(r) ? null : ++n;
    });
    return labels;
  }

  function teamColor(teamName) {
    return CONFIG.TEAM_COLORS[teamName] || "#8A8F94";
  }

  function groupBy(rows, key) {
    return rows.reduce((acc, row) => {
      const k = row[key];
      (acc[k] = acc[k] || []).push(row);
      return acc;
    }, {});
  }

  /* ---------- placeholder image (SVG data URI, no network needed) ---------- */

  function placeholderImage(label, { w = 400, h = 400, bg = "#ECEAE4", fg = "#9A9E92" } = {}) {
    const text = initials(label);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
        <rect width="${w}" height="${h}" fill="${bg}"/>
        <text x="50%" y="50%" font-family="monospace" font-size="${Math.round(h * 0.22)}"
              fill="${fg}" text-anchor="middle" dominant-baseline="central" letter-spacing="2">${text}</text>
      </svg>`.trim();
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  /* ---------- local upload overrides ----------
     Lets the user click an image and drop in their own file as an instant
     preview. Stored only in this browser via localStorage (as a data URL),
     so it's for previewing layout/sizing — it will NOT appear for other
     visitors until the image is hosted online and its URL added to the
     Sheet. Each image slot has a stable key so overrides persist on reload.
  */

  const LS_PREFIX = "f1site:img:";

  function getOverride(key) {
    try { return localStorage.getItem(LS_PREFIX + key); } catch { return null; }
  }

  function setOverride(key, dataUrl) {
    try { localStorage.setItem(LS_PREFIX + key, dataUrl); } catch (e) {
      alert("Couldn't save this preview locally — the image may be too large for browser storage. Try a smaller file, or host it online instead.");
    }
  }

  function clearOverride(key) {
    try { localStorage.removeItem(LS_PREFIX + key); } catch {}
  }

  /* Turns common "share" links into direct image links (Drive, Dropbox, Imgur pages).
     Pinterest/other page links can't be read from the browser — the Apps Script converts
     those when you paste them into the sheet. */
  function normalizeImageUrl(u) {
    u = String(u || "").trim();
    let m = u.match(/drive\.google\.com\/file\/d\/([\w-]+)/) || u.match(/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([\w-]+)/);
    if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1600`;
    if (/^https?:\/\/(www\.)?dropbox\.com\//i.test(u)) return u.replace(/[?&]dl=0/, "").replace(/(\?|$)/, (x) => (x === "?" ? "?raw=1&" : "?raw=1"));
    m = u.match(/^https?:\/\/(?:www\.)?imgur\.com\/(?:gallery\/)?([A-Za-z0-9]{5,8})\/?$/);
    if (m) return `https://i.imgur.com/${m[1]}.jpg`;
    return u;
  }

  /* Resolves the final image src for a slot: local override > sheet URL > placeholder */
  function resolveImageSrc(key, sheetUrl, placeholderLabel, placeholderOpts) {
    const override = getOverride(key);
    if (override) return override;
    if (sheetUrl && sheetUrl.trim()) return normalizeImageUrl(sheetUrl);
    return placeholderImage(placeholderLabel, placeholderOpts);
  }

  /* Attaches a small "upload" affordance over an <img> wrapped in a
     .img-slot container. Call this after inserting the image into the DOM. */
  function attachUploader(containerEl, key, onChange) {
    const btn = document.createElement("label");
    btn.className = "img-slot__upload";
    btn.title = "Preview your own image (saved in this browser only)";
    btn.innerHTML = `
      <input type="file" accept="image/*" hidden />
      <span>⤒ Upload</span>
    `;
    const input = btn.querySelector("input");
    input.addEventListener("change", () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 3_500_000) {
        alert("That image is a bit large for a local preview. Try one under ~3MB, or host it online for the real site.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setOverride(key, reader.result);
        onChange && onChange(reader.result);
      };
      reader.readAsDataURL(file);
    });
    containerEl.appendChild(btn);

    if (getOverride(key)) {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "img-slot__clear";
      clear.title = "Remove local preview";
      clear.textContent = "✕";
      clear.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearOverride(key);
        onChange && onChange(null);
      });
      containerEl.appendChild(clear);
    }
  }

  /* Builds a self-contained image slot: <figure class="img-slot"><img/></figure>
     with upload affordance wired up. Returns the figure element. */
  function buildImageSlot({ key, sheetUrl, label, alt, opts, className }) {
    const figure = document.createElement("figure");
    figure.className = "img-slot" + (className ? " " + className : "");

    const img = document.createElement("img");
    img.alt = alt || label || "";
    img.loading = "lazy";
    img.src = resolveImageSrc(key, sheetUrl, label, opts);
    figure.appendChild(img);

    attachUploader(figure, key, (newSrc) => {
      img.src = newSrc || resolveImageSrc(key, sheetUrl, label, opts);
    });

    return figure;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const foot = document.querySelector(".site-footer .wrap");
    if (foot && CONFIG.BUILD) foot.insertAdjacentHTML("beforeend", ` <span style="opacity:.55">· build ${CONFIG.BUILD}</span>`);
  });

  return {
    fetchCSV, loadTab, fetchDoc, posRank, isStatusPos, normalizeImageUrl, parseDate, isCancelled, roundLabels, isSprintWeekend, SPRINT_SESSIONS, SPRINT_CATEGORIES, slugify, initials, formatDateRange, teamColor, groupBy,
    placeholderImage, getOverride, setOverride, clearOverride,
    resolveImageSrc, attachUploader, buildImageSlot,
  };
})();
