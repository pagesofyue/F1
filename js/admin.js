(function () {
  document.getElementById("season-tag").textContent = CONFIG.SEASON;

  const APPS_SCRIPT_URL = CONFIG.ADMIN.APPS_SCRIPT_URL;
  const SHEET_NAMES = CONFIG.ADMIN.SHEET_NAMES;

  if (!APPS_SCRIPT_URL) {
    document.getElementById("setup-needed").style.display = "block";
    document.getElementById("setup-diag").textContent =
      `What this page sees → config.js build: ${CONFIG.BUILD || "none (old config.js is live)"} · ` +
      `APPS_SCRIPT_URL: ${String(APPS_SCRIPT_URL)}`;
    document.getElementById("gate").style.display = "none";
    return;
  }

  const SESSION_KEY = "f1site:admin:password";
  let activeTabKey = "teams";
  let currentHeaders = [];
  let currentRows = [];

  /* ---------- roster (built from the Teams tab, reused everywhere) ----------
     This is the "set up once, select forever" piece: every driver and team
     that has ever appeared in the Teams tab becomes a dropdown option on
     every other tab, instead of retyping names/numbers by hand. */
  let roster = { drivers: [], teams: [], circuits: [] };

  async function fetchTabRows(sheetName) {
    try {
      const res = await fetch(`${APPS_SCRIPT_URL}?tab=${encodeURIComponent(sheetName)}`);
      const json = await res.json();
      return json.ok ? json.rows : [];
    } catch {
      return [];
    }
  }

  async function loadRoster() {
    const [teamRows, raceRows] = await Promise.all([
      fetchTabRows(SHEET_NAMES.teams),
      fetchTabRows(SHEET_NAMES.races),
    ]);

    const driverMap = new Map(); // name -> { no, team }
    const teamSet = new Set();

    // Only the active roster — rows from the current CONFIG.SEASON — show up
    // in driver/team dropdowns, not every name who's ever appeared historically.
    teamRows
      .filter(row => String(row["Season"]) === String(CONFIG.SEASON))
      .forEach(row => {
        const name = row["Driver"];
        const team = row["Team Name"];
        if (team) teamSet.add(team);
        if (!name) return;
        driverMap.set(name, { no: row["Driver No."] || "", team: team || "" });
      });

    roster.drivers = [...driverMap.entries()]
      .map(([name, info]) => ({ name, ...info }))
      .sort((a, b) => a.name.localeCompare(b.name));
    roster.teams = [...teamSet].sort((a, b) => {
      const ai = CONFIG.TEAM_ORDER.indexOf(a), bi = CONFIG.TEAM_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    // Circuits are NOT filtered by season — tracks repeat year after year, so
    // every circuit that's ever appeared in Races stays selectable forever.
    roster.circuits = [...new Set(raceRows.map(r => r["Circuit"]).filter(Boolean))].sort();
  }

  /* ---------- password gate ---------- */

  const gateForm = document.getElementById("gate-form");
  const gateError = document.getElementById("gate-error");

  const savedPassword = sessionStorage.getItem(SESSION_KEY);
  if (savedPassword) showPanel();

  gateForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const pw = document.getElementById("gate-password").value;
    sessionStorage.setItem(SESSION_KEY, pw);
    gateError.style.display = "none";
    showPanel();
  });

  document.getElementById("signout-btn").addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    document.getElementById("panel").style.display = "none";
    document.getElementById("gate").style.display = "block";
    document.getElementById("gate-password").value = "";
  });

  async function showPanel() {
    document.getElementById("gate").style.display = "none";
    document.getElementById("panel").style.display = "block";
    await loadRoster();
    loadTab(activeTabKey);
  }

  function getPassword() {
    return sessionStorage.getItem(SESSION_KEY) || "";
  }

  /* ---------- tab switching ---------- */

  document.getElementById("admin-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".admin-tab");
    if (!btn || btn.dataset.tab === activeTabKey) return;
    if (countChanges() > 0 && !confirm("You have unsaved changes on this page. Leave without saving?")) return;
    [...document.querySelectorAll(".admin-tab")].forEach(b => b.classList.toggle("is-active", b === btn));
    activeTabKey = btn.dataset.tab;
    loadTab(activeTabKey);
  });

  window.addEventListener("beforeunload", (e) => {
    if (countChanges() > 0) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ---------- data loading ---------- */

  async function loadTab(tabKey) {
    const wrap = document.getElementById("admin-table-wrap");
    wrap.innerHTML = `<div class="empty-state">Loading…</div>`;
    try {
      const sheetName = SHEET_NAMES[tabKey];
      const res = await fetch(`${APPS_SCRIPT_URL}?tab=${encodeURIComponent(sheetName)}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to load");
      currentHeaders = json.headers;
      currentRows = json.rows;
      renderTable();
    } catch (err) {
      wrap.innerHTML = `<div class="empty-state">Couldn't load this tab: ${escapeHtml(String(err.message || err))}</div>`;
    }
  }

  /* ---------- the page grid: edit anything, then ONE save for the whole page ---------- */

  const readRow = (tr) => {
    const d = {};
    tr.querySelectorAll(".admin-input").forEach(i => { d[i.dataset.field] = i.value; });
    return d;
  };

  function buildRow(row) {
    const tr = document.createElement("tr");
    if (row) tr.dataset.row = row._row; else tr.dataset.new = "1";
    currentHeaders.forEach(h => {
      const td = document.createElement("td");
      td.appendChild(createFieldElement(h, row ? (row[h] ?? "") : "", tr));
      tr.appendChild(td);
    });
    tr.dataset.orig = JSON.stringify(readRow(tr));

    const td = document.createElement("td");
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "btn btn--small btn--ghost";
    rm.textContent = row ? "Delete" : "✕";
    rm.addEventListener("click", () => {
      if (!row) tr.remove(); else {
        tr.classList.toggle("is-deleted");
        rm.textContent = tr.classList.contains("is-deleted") ? "Undo" : "Delete";
      }
      refreshDirty();
    });
    td.appendChild(rm);
    tr.appendChild(td);
    return tr;
  }

  function renderTable() {
    const wrap = document.getElementById("admin-table-wrap");
    if (currentHeaders.length === 0) {
      wrap.innerHTML = `<div class="empty-state">No "${SHEET_NAMES[activeTabKey]}" tab found, or it has no header row yet.</div>`;
      return;
    }
    wrap.innerHTML = `
      <table class="results-table admin-table">
        <thead><tr>${currentHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join("")}<th></th></tr></thead>
        <tbody id="admin-body"></tbody>
      </table>
      <div class="admin-bar">
        <button type="button" class="btn btn--ghost" id="admin-add-row">+ Add row</button>
        <button type="button" class="btn btn--primary" id="admin-save" disabled>Save changes</button>
        <span class="section__note" id="admin-dirty"></span>
      </div>`;
    const body = document.getElementById("admin-body");
    currentRows.forEach(r => body.appendChild(buildRow(r)));
    if (!currentRows.length) body.appendChild(buildRow(null));

    document.getElementById("admin-add-row").addEventListener("click", () => {
      const tr = buildRow(null);
      body.appendChild(tr);
      tr.querySelector(".admin-input")?.focus();
      refreshDirty();
    });
    document.getElementById("admin-save").addEventListener("click", savePage);
    wrap.addEventListener("input", refreshDirty);
    wrap.addEventListener("change", refreshDirty);
    refreshDirty();
  }

  // What this page would send: edited rows, new rows (ignoring blank ones), deleted rows.
  function collectChanges() {
    const updates = [], adds = [], deletes = [];
    document.querySelectorAll("#admin-body tr").forEach(tr => {
      if (tr.dataset.new) {
        const data = readRow(tr);
        if (Object.values(data).some(v => String(v).trim() !== "")) adds.push(data);
      } else if (tr.classList.contains("is-deleted")) {
        deletes.push(Number(tr.dataset.row));
      } else {
        const data = readRow(tr);
        if (JSON.stringify(data) !== tr.dataset.orig) updates.push({ row: Number(tr.dataset.row), data });
      }
    });
    return { updates, adds, deletes };
  }

  function countChanges() {
    if (!document.getElementById("admin-body")) return 0;
    const c = collectChanges();
    return c.updates.length + c.adds.length + c.deletes.length;
  }

  function refreshDirty() {
    const save = document.getElementById("admin-save");
    if (!save) return;
    document.querySelectorAll("#admin-body tr").forEach(tr => {
      const dirty = tr.dataset.new ? Object.values(readRow(tr)).some(v => String(v).trim() !== "")
        : JSON.stringify(readRow(tr)) !== tr.dataset.orig;
      tr.classList.toggle("is-dirty", dirty && !tr.classList.contains("is-deleted"));
    });
    const c = collectChanges(), n = c.updates.length + c.adds.length + c.deletes.length;
    save.disabled = n === 0;
    save.textContent = n ? `Save changes (${n})` : "Save changes";
    document.getElementById("admin-dirty").textContent = n
      ? `${c.updates.length} edited · ${c.adds.length} new · ${c.deletes.length} to delete — not saved yet` : "";
  }

  async function savePage() {
    const c = collectChanges();
    if (!c.updates.length && !c.adds.length && !c.deletes.length) return;
    if (c.deletes.length && !confirm(`Delete ${c.deletes.length} row(s)? This can't be undone.`)) return;
    const btn = document.getElementById("admin-save");
    btn.disabled = true; btn.textContent = "Saving…";
    const ok = await sendWrite({ action: "saveBatch", tab: SHEET_NAMES[activeTabKey], ...c });
    if (!ok) refreshDirty();
  }

  async function sendWrite(payload) {
    payload.password = getPassword();
    try {
      // text/plain avoids a CORS preflight that Apps Script doesn't handle.
      const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) {
        toast(json.error || "Something went wrong.", true);
        return false;
      }
      toast(`Page saved — ${json.updated} edited, ${json.added} added, ${json.deleted} deleted.`);
      if (activeTabKey === "teams") await loadRoster(); // keep dropdowns elsewhere in sync
      await loadTab(activeTabKey);
      return true;
    } catch (err) {
      toast("Network error — check the Apps Script URL and that it's deployed.", true);
      return false;
    }
  }

  function toast(msg, isError) {
    const el = document.getElementById("admin-toast");
    el.textContent = msg;
    el.style.display = "block";
    el.classList.toggle("admin-toast--error", !!isError);
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.style.display = "none"; }, 4000);
  }

  /* ---------- smart fields: dropdowns sourced from the roster instead of
     free typing, with Driver -> Team / Driver No. auto-fill ---------- */

  function createFieldElement(header, value, root) {
    // Driver: pick from everyone who has ever appeared in the Teams tab.
    if (header === "Driver") {
      return buildSelect(header, value, ["", ...roster.drivers.map(d => d.name)], {
        allowCustom: true,
        onChange: (val) => {
          const driver = roster.drivers.find(d => d.name === val);
          if (!driver) return;
          setSiblingValue(root, "Driver No.", driver.no);
          setSiblingValue(root, "Team", driver.team);
          setSiblingValue(root, "Team Name", driver.team);
        },
      });
    }

    // Team / Team Name: pick from every team that's ever appeared.
    if (header === "Team" || header === "Team Name") {
      return buildSelect(header, value, ["", ...roster.teams], { allowCustom: true });
    }

    // Sprint Weekend: Yes/No on the Races tab (hides Sprint Quali + Sprint when "No").
    if (header === "Sprint Weekend") {
      return buildSelect(header, value, ["", "Yes", "No"]);
    }

    // Session: fixed, known list — keeps values consistent for the race page tabs.
    if (header === "Session") {
      return buildSelect(header, value, ["", ...CONFIG.SESSION_ORDER.map(s => s.key)]);
    }

    // Category: fixed list for the Highlights tab (pole/winner/FP1/FP2/sprint...).
    if (header === "Category") {
      return buildSelect(header, value, ["", ...CONFIG.HIGHLIGHT_CATEGORIES]);
    }

    // Circuit: pick from every circuit that's ever been entered in Races —
    // not season-filtered, since the same tracks come back every year.
    if (header === "Circuit") {
      return buildSelect(header, value, ["", ...roster.circuits], { allowCustom: true });
    }

    // Dates: a date picker (stored as YYYY-MM-DD, shown on the site as "Oct 10").
    if (header === "Start Date" || header === "End Date") {
      const input = document.createElement("input");
      input.type = "date";
      input.className = "admin-input";
      input.dataset.field = header;
      const d = Utils_parseDate(value);
      input.value = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
      return input;
    }

    // Status means different things on different tabs.
    if (header === "Status") {
      const options = activeTabKey === "teams"
        ? ["", "Full Time", "Reserved"]
        : ["", "Upcoming", "Live", "Completed", "Cancelled"];
      return buildSelect(header, value, options);
    }

    // Everything else: plain input, numeric keyboard for number-ish columns.
    const input = document.createElement("input");
    input.className = "admin-input";
    input.dataset.field = header;
    input.value = value;
    if (["Season", "Round", "Position", "Driver No.", "Points"].includes(header)) {
      input.type = "number";
      input.inputMode = "numeric";
    }
    input.placeholder = fieldHint(header);
    return input;
  }

  // admin.html doesn't load utils.js, so a tiny local copy of the date parsing
  function Utils_parseDate(v) {
    if (!v) return null;
    const str = String(v).trim();
    let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
    const d = new Date(str);
    return isNaN(d) ? null : d;
  }

  function buildSelect(header, value, optionValues, { onChange, allowCustom } = {}) {
    const select = document.createElement("select");
    select.className = "admin-input";
    select.dataset.field = header;
    optionValues.forEach(optVal => {
      const opt = document.createElement("option");
      opt.value = optVal;
      opt.textContent = optVal || "—";
      select.appendChild(opt);
    });
    // keep the current value visible even if it's since fallen out of the roster/list
    if (value && !optionValues.includes(String(value))) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = `${value} (not in current list)`;
      select.appendChild(opt);
    }
    if (allowCustom) {
      const opt = document.createElement("option");
      opt.value = "__custom__";
      opt.textContent = "+ Add new…";
      select.appendChild(opt);
    }
    select.value = value ?? "";
    select.addEventListener("change", () => {
      if (select.value === "__custom__") {
        const input = document.createElement("input");
        input.className = "admin-input";
        input.dataset.field = header;
        input.placeholder = `Type the new ${header.toLowerCase()}`;
        select.replaceWith(input);
        input.focus();
        return;
      }
      onChange && onChange(select.value);
    });
    return select;
  }

  function setSiblingValue(root, fieldName, value) {
    const el = root.querySelector(`[data-field="${CSS.escape(fieldName)}"]`);
    if (el) { el.value = value; refreshDirty(); }
  }

  function fieldHint(header) {
    const hints = {
      "Start Date": "YYYY-MM-DD",
      "End Date": "YYYY-MM-DD",
    };
    return hints[header] || "";
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
})();
