(function () {
  document.getElementById("season-tag").textContent = CONFIG.SEASON;

  const APPS_SCRIPT_URL = CONFIG.ADMIN.APPS_SCRIPT_URL;
  const SHEET_NAMES = CONFIG.ADMIN.SHEET_NAMES;

  if (!APPS_SCRIPT_URL) {
    document.getElementById("setup-needed").style.display = "block";
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
    if (!btn) return;
    [...document.querySelectorAll(".admin-tab")].forEach(b => b.classList.toggle("is-active", b === btn));
    activeTabKey = btn.dataset.tab;
    loadTab(activeTabKey);
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
      renderAddForm();
    } catch (err) {
      wrap.innerHTML = `<div class="empty-state">Couldn't load this tab: ${escapeHtml(String(err.message || err))}</div>`;
    }
  }

  function renderTable() {
    const wrap = document.getElementById("admin-table-wrap");
    if (currentHeaders.length === 0) {
      wrap.innerHTML = `<div class="empty-state">No "${SHEET_NAMES[activeTabKey]}" tab found, or it has no header row yet.</div>`;
      return;
    }
    if (currentRows.length === 0) {
      wrap.innerHTML = `<div class="empty-state">No rows yet — add one below.</div>`;
      return;
    }

    const table = document.createElement("table");
    table.className = "results-table admin-table";
    table.innerHTML = `
      <thead><tr>
        ${currentHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join("")}
        <th></th>
      </tr></thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");

    currentRows.forEach(row => {
      const tr = document.createElement("tr");
      tr.dataset.row = row._row;

      currentHeaders.forEach(h => {
        const td = document.createElement("td");
        td.appendChild(createFieldElement(h, row[h] ?? "", tr));
        tr.appendChild(td);
      });

      const actionsTd = document.createElement("td");
      actionsTd.style.whiteSpace = "nowrap";

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn btn--small btn--primary";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", () => updateRow(tr));

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn--small btn--danger";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => deleteRow(tr));

      actionsTd.appendChild(saveBtn);
      actionsTd.appendChild(delBtn);
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    });

    wrap.innerHTML = "";
    wrap.appendChild(table);
  }

  function renderAddForm() {
    const form = document.getElementById("admin-add-form");
    form.innerHTML = "";
    currentHeaders.forEach(h => {
      const field = document.createElement("label");
      field.className = "admin-field";
      field.innerHTML = `<span>${escapeHtml(h)}</span>`;
      field.appendChild(createFieldElement(h, "", form));
      form.appendChild(field);
    });
    const btn = document.createElement("button");
    btn.type = "submit";
    btn.className = "btn btn--primary";
    btn.textContent = "Add row";
    form.appendChild(btn);
  }

  document.getElementById("admin-add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {};
    [...e.target.querySelectorAll(".admin-input")].forEach(input => {
      data[input.dataset.field] = input.value;
    });
    await sendWrite({ action: "add", tab: SHEET_NAMES[activeTabKey], data });
  });

  async function updateRow(tr) {
    const data = {};
    [...tr.querySelectorAll(".admin-input")].forEach(input => {
      data[input.dataset.field] = input.value;
    });
    await sendWrite({ action: "update", tab: SHEET_NAMES[activeTabKey], row: tr.dataset.row, data });
  }

  async function deleteRow(tr) {
    if (!confirm("Delete this row? This can't be undone.")) return;
    await sendWrite({ action: "delete", tab: SHEET_NAMES[activeTabKey], row: tr.dataset.row });
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
        return;
      }
      toast(payload.action === "add" ? "Row added." : payload.action === "update" ? "Saved." : "Deleted.");
      if (activeTabKey === "teams") await loadRoster(); // keep dropdowns elsewhere in sync
      loadTab(activeTabKey);
    } catch (err) {
      toast("Network error — check the Apps Script URL and that it's deployed.", true);
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

    // Status means different things on different tabs.
    if (header === "Status") {
      const options = activeTabKey === "teams"
        ? ["", "Full Time", "Reserved"]
        : ["", "Upcoming", "Completed", "Live"];
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
    if (el) el.value = value;
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
