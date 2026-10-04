(async function () {
  let notesBlocks = []; // filled by renderNotes, reused by the PDF export
  let notesEditing = false;
  document.getElementById("season-tag").textContent = CONFIG.SEASON;

  const params = new URLSearchParams(location.search);
  const round = params.get("round");
  const season = params.get("season") || CONFIG.SEASON;

  const [racesRes, resultsRes, postersRes, highlightsRes, notesDoc, circuitsRes, teamsRes] = await Promise.all([
    Utils.loadTab("races", PLACEHOLDER_RACES),
    Utils.loadTab("results", PLACEHOLDER_RESULTS),
    Utils.loadTab("posters", []), // no placeholder rows — falls back to blank tiles per team
    Utils.loadTab("highlights", []),
    Utils.fetchDoc("notes"),
    Utils.loadTab("circuits", []),
    Utils.loadTab("teams", []),
  ]);

  const race = racesRes.rows.find(r => String(r.Round) === String(round) && String(r.Season) === String(season));

  if (!race) {
    document.getElementById("race-name").textContent = "Race not found";
    document.getElementById("results-note").innerHTML =
      `<span class="data-note">No race matches round ${round} for ${season}.</span>`;
    return;
  }

  const roundLabels = Utils.roundLabels(racesRes.rows.filter(r => String(r.Season) === String(season)));
  const roundLabel = roundLabels[String(race.Round)];
  document.getElementById("race-meta").textContent = roundLabel
    ? `ROUND ${String(roundLabel).padStart(2, "0")} — ${season}` : `CANCELLED — ${season}`;
  document.getElementById("race-name").textContent = race["Race Name"] || "TBC";
  document.getElementById("race-country").textContent = race.Country || "—";
  document.getElementById("race-circuit").textContent = race.Circuit || "—";
  document.getElementById("race-dates").textContent = Utils.formatDateRange(race["Start Date"], race["End Date"]);
  document.getElementById("race-status").textContent = race.Status || "—";
  document.title = `${race["Race Name"] || "Race"} — Grid`;

  let bySession = {};
  const rebuildSessions = () => {
    bySession = Utils.groupBy(resultsRes.rows.filter(
      r => String(r.Round) === String(race.Round) && String(r.Season) === String(season)), "Session");
  };
  rebuildSessions();
  const sprintOn = () => Utils.isSprintWeekend(race, Object.keys(bySession));

  renderPosters(race, postersRes.rows, season);
  renderCircuitMap(race, circuitsRes.rows);
  renderHighlights(race, highlightsRes.rows, season);
  renderNotes(race, notesDoc);

  const resultsNote = document.getElementById("results-note");
  resultsNote.innerHTML = resultsRes.isPlaceholder
    ? `<span class="data-note">⚠ placeholder data — add a "Results" tab, see README</span>`
    : "";

  /* ---------- session tabs, results table, inline results editor ---------- */
  const tabsEl = document.getElementById("session-tabs");
  const toolsEl = document.getElementById("results-tools");
  const editorEl = document.getElementById("results-editor");
  let activeKey = null;
  let editorOpen = false;
  const byPos = (a, b) => Utils.posRank(a.Position) - Utils.posRank(b.Position);
  const RACE_PTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  const SPRINT_PTS = [8, 7, 6, 5, 4, 3, 2, 1];
  const labelOf = (k) => CONFIG.SESSION_ORDER.find(s => s.key === k)?.label || k;

  // Sprint Qualifying / Sprint only exist on sprint weekends
  const sessionList = () => CONFIG.SESSION_ORDER.filter(s => sprintOn() || !Utils.SPRINT_SESSIONS.includes(s.key));

  function buildTabs() {
    const em = EditMode.isOn();
    const list = sessionList();
    if (!list.some(s => s.key === activeKey)) activeKey = null;
    tabsEl.innerHTML = "";
    list.forEach(({ key, label }) => {
      const hasData = !!bySession[key]?.length;
      const btn = document.createElement("button");
      btn.className = "session-tab";
      btn.dataset.key = key;
      btn.textContent = label;
      btn.disabled = !hasData && !em; // in edit mode every session can be opened to add results
      btn.addEventListener("click", () => setActive(key));
      tabsEl.appendChild(btn);
      if (activeKey === null && hasData) activeKey = key;
    });
    if (activeKey === null && em && list.length) activeKey = list[list.length - 1].key;
    if (activeKey) return setActive(activeKey);
    closeEditor();
    document.getElementById("results-table").style.display = "none";
    const empty = document.getElementById("results-empty");
    empty.style.display = "block";
    empty.textContent = "No session results yet for this race.";
  }

  function setActive(key) {
    activeKey = key;
    closeEditor();
    [...tabsEl.children].forEach(btn => btn.classList.toggle("is-active", btn.dataset.key === key));
    renderTable(bySession[key] || []);
  }

  function paintTools() {
    toolsEl.innerHTML = "";
    if (!EditMode.isOn() || editorOpen || !activeKey) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--ghost btn--small";
    btn.textContent = `✎ Edit ${labelOf(activeKey)} results`;
    btn.addEventListener("click", openEditor);
    toolsEl.appendChild(btn);
  }

  function closeEditor() {
    editorOpen = false;
    editorEl.innerHTML = "";
    paintTools();
  }

  function renderTable(rows) {
    const table = document.getElementById("results-table");
    const empty = document.getElementById("results-empty");
    const body = document.getElementById("results-body");
    const esc = PdfSheet.esc;

    if (!rows.length) {
      table.style.display = "none";
      empty.style.display = "block";
      empty.textContent = EditMode.isOn()
        ? "No results for this session yet — press “Edit” to add them."
        : "No results recorded for this session yet.";
      return;
    }

    table.style.display = "table";
    empty.style.display = "none";

    body.innerHTML = [...rows].sort(byPos).map(r => `
      <tr>
        <td class="pos${Utils.isStatusPos(r.Position) ? " is-status" : ""}">${esc(r.Position || "–")}</td>
        <td class="driver">${esc(r.Driver || "—")}</td>
        <td class="team"><span class="team-dot" style="background:${Utils.teamColor(r.Team)}"></span>${esc(r.Team || "—")}</td>
        <td class="points">${r.Points !== undefined && r.Points !== "" ? esc(r.Points) : "—"}</td>
      </tr>
    `).join("");
  }

  /* ---------- roster: name / number / 3-letter code -> driver + team ---------- */
  function rosterFor() {
    const rows = teamsRes.rows.filter(r => String(r["Season"]) === String(season));
    const map = new Map();
    (rows.length ? rows : teamsRes.rows).forEach(r => {
      const name = r["Driver"];
      if (!name) return;
      const explicit = String(r["Driver Code"] || r["Code"] || "").trim();
      const surname = name.trim().split(/\s+/).slice(-1)[0];
      map.set(name, { name, no: r["Driver No."] || "", team: r["Team Name"] || "",
                      code: (explicit || surname.slice(0, 3)).toUpperCase() });
    });
    return [...map.values()];
  }

  function matchDrivers(drivers, q, exclude) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    const scored = [];
    drivers.forEach(d => {
      if (exclude.has(d.name)) return;
      const name = d.name.toLowerCase(), code = d.code.toLowerCase(), no = String(d.no);
      let score = null;
      if (no === q || code === q) score = 0;
      else if (code.startsWith(q) || (/^\d+$/.test(q) && no.startsWith(q))) score = 1;
      else if (name.split(/\s+/).some(w => w.startsWith(q))) score = 2;
      else if (name.includes(q)) score = 3;
      if (score !== null) scored.push({ d, score });
    });
    return scored.sort((a, b) => a.score - b.score || a.d.name.localeCompare(b.d.name)).slice(0, 6).map(x => x.d);
  }

  // Shrinks + compresses a chosen photo so uploads stay small
  async function prepImage(file) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const png = file.type === "image/png";
    const mime = png ? "image/png" : "image/jpeg";
    return { mime, name: file.name.replace(/\.\w+$/, "") + (png ? ".png" : ".jpg"), data: c.toDataURL(mime, 0.85).split(",")[1] };
  }

  function openEditor() {
    const key = activeKey;
    const drivers = rosterFor();
    const gfx = PdfSheet.SESSION_GRAPHIC[key];
    // Race / Sprint: points by position, 0 outside the points or for DNF / DNS / DSQ. Other sessions: none.
    const autoPts = (pos) => {
      const table = key === "Race" ? RACE_PTS : key === "Sprint" ? SPRINT_PTS : null;
      if (!table) return "";
      const t = String(pos ?? "").trim();
      if (t === "") return "";
      return isNaN(Number(t)) ? 0 : (table[Number(t) - 1] ?? 0);
    };
    const currentGfx = highlightsRes.rows.find(r => r.Category === gfx.cat &&
      String(r.Round) === String(race.Round) && String(r.Season) === String(season))?.["Image URL"] || "";

    let rows = [...(bySession[key] || [])].sort(byPos).map(r => ({
      pos: r.Position, no: r["Driver No."] ?? "", driver: r.Driver ?? "", team: r.Team ?? "", pts: r.Points ?? "" }));
    if (!rows.length) {
      rows = Array.from({ length: Math.max(drivers.length, 20) }, (_, i) =>
        ({ pos: i + 1, no: "", driver: "", team: "", pts: autoPts(i + 1) }));
    }

    editorOpen = true;
    paintTools();
    document.getElementById("results-table").style.display = "none";
    document.getElementById("results-empty").style.display = "none";

    editorEl.innerHTML = `
      <datalist id="em-status"><option value="DNF">Did not finish</option><option value="DNS">Did not start</option><option value="DSQ">Disqualified</option></datalist>
      <datalist id="em-teams">${CONFIG.TEAM_ORDER.map(t => `<option value="${PdfSheet.esc(t)}"></option>`).join("")}</datalist>
      <h3 class="admin-subhead" style="margin-top:0">Editing ${PdfSheet.esc(labelOf(key))}</h3>
      <p class="section__note" style="margin:0 0 10px">Type a driver's name, number or code (LEC, 16…) and press Enter — team, number and points fill in by themselves. For Pos you can type DNF, DNS or DSQ (worth 0 points).</p>
      <div style="overflow-x:auto"><table class="em-table">
        <thead><tr><th>Pos</th><th>No.</th><th>Driver</th><th>Team</th><th>Pts</th><th></th></tr></thead>
        <tbody id="em-body"></tbody>
      </table></div>
      <div class="em-actions">
        <button type="button" class="btn btn--ghost btn--small" id="em-add">+ Add row</button>
      </div>

      <div class="em-graphic">
        <div class="em-graphic__thumb"><img id="em-gfx-img" alt="" ${currentGfx ? `src="${PdfSheet.esc(Utils.normalizeImageUrl(currentGfx))}"` : ""}></div>
        <div class="em-graphic__fields">
          <label class="em-label">${PdfSheet.esc(gfx.cap)} photo — paste a link (Pinterest, Imgur, Drive…) or upload one</label>
          <input id="em-gfx-link" class="admin-input" placeholder="https://…" value="${PdfSheet.esc(currentGfx)}">
          <div style="display:flex;gap:10px;align-items:center;margin-top:8px;flex-wrap:wrap">
            <button type="button" class="btn btn--ghost btn--small" id="em-gfx-pick">⬆ Upload photo</button>
            <input type="file" id="em-gfx-file" accept="image/*" hidden>
            <span class="section__note" id="em-gfx-name"></span>
          </div>
        </div>
      </div>

      <div class="em-actions">
        <button type="button" class="btn btn--primary" id="em-save">Save results</button>
        <button type="button" class="btn btn--ghost" id="em-cancel">Cancel</button>
        <span class="section__note" id="em-msg"></span>
      </div>
      <ul class="em-suggest" id="em-suggest" hidden></ul>`;

    const body = document.getElementById("em-body");
    const msg = document.getElementById("em-msg");
    const box = document.getElementById("em-suggest");
    let activeInput = null, items = [], hi = 0;

    /* --- driver suggestions --- */
    const usedElsewhere = (self) => new Set([...body.querySelectorAll(".em-driver")]
      .filter(i => i !== self).map(i => i.value.trim()).filter(Boolean));

    function hideBox() { box.hidden = true; activeInput = null; }
    function showBox(input) {
      activeInput = input;
      items = matchDrivers(drivers, input.value, usedElsewhere(input));
      hi = 0;
      if (!items.length) { box.hidden = true; return; }
      box.innerHTML = items.map((d, i) =>
        `<li data-i="${i}" class="${i === hi ? "is-hi" : ""}"><b>${PdfSheet.esc(d.code)}</b> <span>#${PdfSheet.esc(d.no)}</span> ${PdfSheet.esc(d.name)}
         <i style="background:${Utils.teamColor(d.team)}"></i><em>${PdfSheet.esc(d.team)}</em></li>`).join("");
      const r = input.getBoundingClientRect();
      Object.assign(box.style, { left: r.left + "px", top: r.bottom + 2 + "px", minWidth: Math.max(r.width, 300) + "px" });
      box.hidden = false;
    }
    function highlight(n) {
      hi = (n + items.length) % items.length;
      [...box.children].forEach((li, i) => li.classList.toggle("is-hi", i === hi));
    }
    function pick(tr, d) {
      tr.querySelector(".em-driver").value = d.name;
      tr.querySelector(".em-team").value = d.team;
      tr.querySelector(".em-no").value = d.no;
      hideBox();
    }
    box.addEventListener("mousedown", (e) => {
      const li = e.target.closest("li");
      if (!li || !activeInput) return;
      e.preventDefault();
      pick(activeInput.closest("tr"), items[Number(li.dataset.i)]);
    });

    function addRow(r) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input class="admin-input em-pos" list="em-status" placeholder="1, DNF…" autocomplete="off" maxlength="4"></td>
        <td><input class="admin-input em-no" inputmode="numeric"></td>
        <td><input class="admin-input em-driver" placeholder="Name, number or code" autocomplete="off"></td>
        <td><input class="admin-input em-team" list="em-teams" placeholder="Team"></td>
        <td><input class="admin-input em-pts" type="number" step="any"></td>
        <td><button type="button" class="btn btn--ghost btn--small" aria-label="Remove row">✕</button></td>`;
      const q = (c) => tr.querySelector(c);
      q(".em-pos").value = r.pos; q(".em-no").value = r.no;
      q(".em-driver").value = r.driver; q(".em-team").value = r.team; q(".em-pts").value = r.pts;
      // points follow the position unless you typed your own value
      if (r.pts !== "" && String(r.pts) !== String(autoPts(r.pos))) q(".em-pts").dataset.manual = "1";

      q(".em-pos").addEventListener("input", () => {
        q(".em-pos").value = q(".em-pos").value.toUpperCase();
        if (!q(".em-pts").dataset.manual) q(".em-pts").value = autoPts(q(".em-pos").value);
      });
      q(".em-pts").addEventListener("input", () => { q(".em-pts").dataset.manual = "1"; });

      const drv = q(".em-driver");
      drv.addEventListener("input", () => showBox(drv));
      drv.addEventListener("focus", () => { drv.select(); });
      drv.addEventListener("blur", () => setTimeout(() => { if (activeInput === drv) hideBox(); }, 120));
      drv.addEventListener("keydown", (e) => {
        const open = !box.hidden && activeInput === drv && items.length;
        if (e.key === "ArrowDown" && open) { e.preventDefault(); highlight(hi + 1); }
        else if (e.key === "ArrowUp" && open) { e.preventDefault(); highlight(hi - 1); }
        else if (e.key === "Escape") hideBox();
        else if (e.key === "Enter") {
          e.preventDefault();
          if (open) pick(tr, items[hi]);
          const next = tr.nextElementSibling?.querySelector(".em-driver");
          if (next) next.focus();
        } else if (e.key === "Tab" && open && !drivers.some(d => d.name === drv.value.trim())) {
          pick(tr, items[hi]); // let Tab carry on to the next field
        }
      });
      tr.querySelector("button").addEventListener("click", () => tr.remove());
      body.appendChild(tr);
    }
    rows.forEach(addRow);

    document.getElementById("em-add").addEventListener("click", () => {
      const max = Math.max(0, ...[...body.querySelectorAll(".em-pos")].map(i => Number(i.value) || 0));
      addRow({ pos: max + 1, no: "", driver: "", team: "", pts: autoPts(max + 1) });
      body.lastElementChild.querySelector(".em-driver").focus();
    });
    document.getElementById("em-cancel").addEventListener("click", () => { hideBox(); closeEditor(); setActive(key); });

    /* --- graphic: link or upload --- */
    const link = document.getElementById("em-gfx-link"), fileIn = document.getElementById("em-gfx-file");
    const fname = document.getElementById("em-gfx-name"), thumb = document.getElementById("em-gfx-img");
    let chosen = null;
    document.getElementById("em-gfx-pick").addEventListener("click", () => fileIn.click());
    fileIn.addEventListener("change", () => {
      chosen = fileIn.files[0] || null;
      fname.textContent = chosen ? chosen.name : "";
      if (chosen) { thumb.src = URL.createObjectURL(chosen); link.value = ""; }
    });
    link.addEventListener("change", () => { if (link.value.trim()) { chosen = null; fileIn.value = ""; fname.textContent = ""; thumb.src = Utils.normalizeImageUrl(link.value); } });

    /* --- save --- */
    document.getElementById("em-save").addEventListener("click", async () => {
      const out = [...body.children].map(tr => {
        const v = (c) => tr.querySelector(c).value.trim();
        return { Position: v(".em-pos") === "" ? "" : (isNaN(Number(v(".em-pos"))) ? v(".em-pos").toUpperCase() : Number(v(".em-pos"))), "Driver No.": v(".em-no"),
                 Driver: v(".em-driver"), Team: v(".em-team"), Points: v(".em-pts") === "" ? "" : Number(v(".em-pts")) };
      }).filter(r => r.Driver);

      try {
        // 1) the session photo (if you gave one)
        let url = link.value.trim();
        if (chosen) {
          msg.textContent = "Uploading photo…";
          const img = await prepImage(chosen);
          const up = await EditMode.post({ action: "uploadImage", ...img });
          if (!up.ok) { msg.textContent = up.error || "Photo upload failed."; return; }
          url = up.url;
        }
        if (url && (chosen || url !== currentGfx)) {
          msg.textContent = "Saving photo…";
          const h = await EditMode.post({ action: "saveHighlight", season, round: race.Round, category: gfx.cat, url });
          if (!h.ok) { msg.textContent = h.error || "Couldn't save the photo link."; return; }
          const row = highlightsRes.rows.find(r => r.Category === gfx.cat &&
            String(r.Round) === String(race.Round) && String(r.Season) === String(season));
          if (row) row["Image URL"] = h.url;
          else highlightsRes.rows.push({ Season: season, Round: race.Round, Category: gfx.cat, "Image URL": h.url });
          renderHighlights(race, highlightsRes.rows, season);
        }

        // 2) the results
        msg.textContent = "Saving results…";
        const json = await EditMode.post({ action: "saveResults", season, round: race.Round, session: key, rows: out });
        if (!json.ok) { msg.textContent = json.error || "Couldn't save."; return; }
      } catch (err) {
        msg.textContent = "Network error — check the Apps Script URL and that it's deployed.";
        return;
      }
      hideBox();
      if (resultsRes.isPlaceholder) { resultsRes.rows = []; resultsRes.isPlaceholder = false; resultsNote.innerHTML = ""; }
      resultsRes.rows = resultsRes.rows.filter(r => !(String(r.Round) === String(race.Round) &&
        String(r.Season) === String(season) && r.Session === key));
      out.forEach(r => resultsRes.rows.push({ Season: season, Round: race.Round, Session: key, ...r }));
      rebuildSessions();
      activeKey = key;
      buildTabs();
    });
  }

  buildTabs();
  syncNotesUI();
  EditMode.onChange(() => { buildTabs(); syncNotesUI(); });

  function renderPosters(race, posterRows, season) {
    const wall = document.getElementById("poster-wall");
    const note = document.getElementById("posters-note");

    const forThisRace = posterRows.filter(
      r => String(r.Round) === String(race.Round) && String(r.Season) === String(season)
    );

    if (posterRows.length === 0) {
      note.innerHTML = `Ferrari, Red Bull &amp; Racing Bulls featured <span class="data-note">⚠ no posters yet — add a "Posters" tab, see README</span>`;
    }

    wall.innerHTML = "";

    const featuredRow = document.createElement("div");
    featuredRow.className = "poster-row poster-row--featured";
    const restRow = document.createElement("div");
    restRow.className = "poster-row poster-row--rest";

    CONFIG.TEAM_ORDER.forEach(teamName => {
      const tc = Utils.teamColor(teamName);
      const isFeatured = CONFIG.FEATURED_TEAMS.includes(teamName);
      const posterUrl = forThisRace.find(p => p.Team === teamName)?.["Poster URL"];

      const tile = document.createElement("div");
      tile.className = "poster-slot";

      const slot = Utils.buildImageSlot({
        key: `poster:${season}:${race.Round}:${Utils.slugify(teamName)}`,
        sheetUrl: posterUrl,
        label: teamName,
        alt: `${teamName} poster — ${race["Race Name"] || "race"}`,
        opts: { w: 600, h: 800, bg: tc + "22", fg: tc },
      });
      tile.appendChild(slot);

      const label = document.createElement("div");
      label.className = "poster-slot__label";
      label.textContent = teamName;
      tile.appendChild(label);

      (isFeatured ? featuredRow : restRow).appendChild(tile);
    });

    wall.appendChild(featuredRow);
    wall.appendChild(restRow);
  }

  function renderCircuitMap(race, circuitRows) {
    const wrap = document.getElementById("circuit-map-wrap");
    if (!race.Circuit) return;

    // Looked up by Circuit NAME, not by race/season — one row per circuit in
    // your Circuits tab covers this race every year it returns to the calendar.
    const match = circuitRows.find(c => c.Circuit === race.Circuit);

    const figure = document.createElement("figure");
    figure.className = "circuit-map";
    const slot = Utils.buildImageSlot({
      key: `circuit:${Utils.slugify(race.Circuit)}:map`,
      sheetUrl: match?.["Circuit Map URL"],
      label: race.Circuit,
      alt: `${race.Circuit} circuit map`,
      opts: { w: 500, h: 310, bg: "none", fg: "#9A9E92" },
    });
    // inline + !important: transparent regardless of any other stylesheet
    [slot, slot.querySelector("img")].forEach(el => {
      el.style.setProperty("background", "transparent", "important");
      el.style.setProperty("border", "0", "important");
    });
    figure.appendChild(slot);
    const label = document.createElement("figcaption");
    label.className = "circuit-map__label";
    label.textContent = race.Circuit;
    figure.appendChild(label);
    wrap.appendChild(figure);
  }

  function renderHighlights(race, highlightRows, season) {
    const section = document.getElementById("highlights-section");
    const grid = document.getElementById("highlight-grid");
    const forThisRace = highlightRows.filter(
      r => String(r.Round) === String(race.Round) && String(r.Season) === String(season)
    );

    // Hide the whole section if the tab isn't connected yet — no need to
    // show 6 empty placeholder tiles for something that hasn't been set up.
    if (highlightRows.length === 0) return;
    section.style.display = "block";

    grid.innerHTML = "";
    CONFIG.HIGHLIGHT_CATEGORIES.filter(c => sprintOn() || !Utils.SPRINT_CATEGORIES.includes(c)).forEach(category => {
      const match = forThisRace.find(r => r.Category === category);
      const tile = document.createElement("div");
      tile.className = "highlight-tile";
      tile.appendChild(Utils.buildImageSlot({
        key: `highlight:${season}:${race.Round}:${Utils.slugify(category)}`,
        sheetUrl: match?.["Image URL"],
        label: category,
        alt: `${category} — ${race["Race Name"] || "race"}`,
        opts: { w: 400, h: 500, bg: "#ECEAE4", fg: "#9A9E92" },
      }));
      const label = document.createElement("div");
      label.className = "highlight-tile__label";
      label.textContent = category;
      tile.appendChild(label);
      grid.appendChild(tile);
    });
  }

  function renderNotes(race, notesDoc) {
    const link = document.getElementById("notes-doc-link");
    if (link && notesDoc && notesDoc.url) { link.href = notesDoc.url; link.style.display = "inline"; }
    const match = notesDoc && notesDoc.notes.find(n => Number(n.round) === Number(race.Round));
    notesBlocks = match ? match.blocks : [];
  }

  // Section shows when there are notes, or while edit mode is on (so you can write the first ones).
  function syncNotesUI() {
    if (notesEditing) return;
    const em = EditMode.isOn();
    document.getElementById("notes-section").style.display = (notesBlocks.length || em) ? "block" : "none";
    document.getElementById("notes-edit").style.display = em ? "inline-block" : "none";
    paintNotes();
  }

  function paintNotes() {
    const block = document.getElementById("notes-block");
    block.innerHTML = "";
    if (!notesBlocks.length) {
      block.innerHTML = EditMode.isOn() ? `<p class="data-note">No notes yet — press “Edit notes” to write some.</p>` : "";
      return;
    }
    const text = document.createElement("div");
    text.className = "notes-text";
    let list = null;

    notesBlocks.forEach(b => {
      if (b.type === "img") {
        const figure = document.createElement("figure");
        figure.className = "notes-image";
        figure.appendChild(Utils.buildImageSlot({
          key: `notes:${season}:${race.Round}:${Utils.slugify(b.url).slice(-40)}`,
          sheetUrl: b.url,
          label: race["Race Name"] || "Notes",
          alt: `Notes image — ${race["Race Name"] || "race"}`,
          opts: { w: 500, h: 350, bg: "#ECEAE4", fg: "#9A9E92" },
        }));
        block.insertBefore(figure, block.firstChild);
        return;
      }
      if (b.type === "li") {
        if (!list) { list = document.createElement("ul"); text.appendChild(list); }
        const li = document.createElement("li");
        li.textContent = b.text;
        list.appendChild(li);
        return;
      }
      list = null;
      const p = document.createElement("p");
      p.textContent = b.text;
      text.appendChild(p);
    });
    block.appendChild(text);
  }

  /* ---- type notes right on the page (saved to the Google Doc via Apps Script) ---- */
  const PW_KEY = "f1site:admin:password"; // same key admin.html uses, so you only log in once
  const notesToText = (blocks) => blocks.map(b =>
    b.type === "li" ? `- ${b.text}` : b.type === "img" ? `Image: ${b.url}` : b.text).join("\n");
  const textToNotes = (t) => t.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const img = l.match(/^image:\s*(https?:\/\/\S+)$/i), li = l.match(/^[-•*]\s+(.*)$/);
    return img ? { type: "img", url: img[1] } : li ? { type: "li", text: li[1] } : { type: "p", text: l };
  });

  document.getElementById("notes-edit").addEventListener("click", () => {
    const block = document.getElementById("notes-block");
    const editBtn = document.getElementById("notes-edit");
    notesEditing = true;
    editBtn.style.display = "none";
    block.innerHTML = `
      <textarea id="notes-input" class="admin-input admin-textarea" rows="12" style="max-width:720px"
        placeholder="One line per paragraph.&#10;- Start a line with a dash for a bullet.&#10;Image: https://... on its own line shows a picture."></textarea>
      <div style="display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap">
        <button type="button" class="btn btn--primary" id="notes-save">Save</button>
        <button type="button" class="btn btn--ghost" id="notes-cancel">Cancel</button>
        <span class="section__note" id="notes-msg"></span>
      </div>`;
    const input = document.getElementById("notes-input");
    const msg = document.getElementById("notes-msg");
    input.value = notesToText(notesBlocks);
    input.focus();

    const close = () => { notesEditing = false; syncNotesUI(); };
    document.getElementById("notes-cancel").addEventListener("click", close);
    document.getElementById("notes-save").addEventListener("click", async () => {
      msg.textContent = "Saving…";
      try {
        const json = await EditMode.post({
          action: "saveNote", round: race.Round,
          title: `Round ${race.Round} — ${race["Race Name"] || ""}`, text: input.value,
        });
        if (!json.ok) { msg.textContent = json.error || "Couldn't save."; return; }
        notesBlocks = textToNotes(input.value);
        close();
      } catch (err) {
        msg.textContent = "Network error — check the Apps Script URL and that it's deployed.";
      }
    });
  });

  /* PDF export — layout lives in js/pdf-sheet.js (shared with the season PDF) */
  document.getElementById("export-pdf").addEventListener("click", async () => {
    document.getElementById("print-sheet").innerHTML = PdfSheet.raceHTML({
      race, season, bySession, notesBlocks, roundLabel,
      highlightRows: highlightsRes.rows, posterRows: postersRes.rows, circuitRows: circuitsRes.rows,
    });
    await PdfSheet.printSheet(`${season} R${String(race.Round).padStart(2, "0")} ${race["Race Name"] || "Race"}`);
  });
})();
