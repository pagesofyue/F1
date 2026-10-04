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

  document.getElementById("race-meta").textContent = `ROUND ${String(race.Round).padStart(2, "0")} — ${season}`;
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
  const byPos = (a, b) => Number(a.Position) - Number(b.Position);
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
        <td class="pos">${esc(r.Position || "–")}</td>
        <td class="driver">${esc(r.Driver || "—")}</td>
        <td class="team"><span class="team-dot" style="background:${Utils.teamColor(r.Team)}"></span>${esc(r.Team || "—")}</td>
        <td class="points">${r.Points !== undefined && r.Points !== "" ? esc(r.Points) : "—"}</td>
      </tr>
    `).join("");
  }

  function rosterFor() {
    const rows = teamsRes.rows.filter(r => String(r["Season"]) === String(season));
    const map = new Map();
    (rows.length ? rows : teamsRes.rows).forEach(r => {
      if (r["Driver"]) map.set(r["Driver"], { no: r["Driver No."] || "", team: r["Team Name"] || "" });
    });
    return [...map.entries()].map(([name, v]) => ({ name, ...v }));
  }

  function openEditor() {
    const key = activeKey;
    const drivers = rosterFor();
    const ptsFor = (pos) => (key === "Race" ? RACE_PTS : key === "Sprint" ? SPRINT_PTS : [])[pos - 1] ?? "";
    let rows = [...(bySession[key] || [])].sort(byPos).map(r => ({
      pos: r.Position, no: r["Driver No."] ?? "", driver: r.Driver ?? "", team: r.Team ?? "", pts: r.Points ?? "" }));
    if (!rows.length) {
      rows = Array.from({ length: Math.max(drivers.length, 20) }, (_, i) =>
        ({ pos: i + 1, no: "", driver: "", team: "", pts: ptsFor(i + 1) }));
    }

    editorOpen = true;
    paintTools();
    document.getElementById("results-table").style.display = "none";
    document.getElementById("results-empty").style.display = "none";

    editorEl.innerHTML = `
      <datalist id="em-drivers">${drivers.map(d => `<option value="${PdfSheet.esc(d.name)}"></option>`).join("")}</datalist>
      <datalist id="em-teams">${CONFIG.TEAM_ORDER.map(t => `<option value="${PdfSheet.esc(t)}"></option>`).join("")}</datalist>
      <h3 class="admin-subhead" style="margin-top:0">Editing ${PdfSheet.esc(labelOf(key))}</h3>
      <div style="overflow-x:auto"><table class="em-table">
        <thead><tr><th>Pos</th><th>No.</th><th>Driver</th><th>Team</th><th>Pts</th><th></th></tr></thead>
        <tbody id="em-body"></tbody>
      </table></div>
      <div class="em-actions">
        <button type="button" class="btn btn--ghost btn--small" id="em-add">+ Add row</button>
        <button type="button" class="btn btn--primary" id="em-save">Save results</button>
        <button type="button" class="btn btn--ghost" id="em-cancel">Cancel</button>
        <span class="section__note" id="em-msg"></span>
      </div>
      <p class="section__note">Type or pick a driver — team and number fill in automatically. Rows with no driver are ignored.</p>`;

    const body = document.getElementById("em-body");
    const msg = document.getElementById("em-msg");

    function addRow(r) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input class="admin-input em-pos" type="number" min="1"></td>
        <td><input class="admin-input em-no" inputmode="numeric"></td>
        <td><input class="admin-input em-driver" list="em-drivers" placeholder="Driver"></td>
        <td><input class="admin-input em-team" list="em-teams" placeholder="Team"></td>
        <td><input class="admin-input em-pts" type="number" step="any"></td>
        <td><button type="button" class="btn btn--ghost btn--small" aria-label="Remove row">✕</button></td>`;
      const q = (c) => tr.querySelector(c);
      q(".em-pos").value = r.pos; q(".em-no").value = r.no;
      q(".em-driver").value = r.driver; q(".em-team").value = r.team; q(".em-pts").value = r.pts;
      q(".em-driver").addEventListener("input", () => {
        const d = drivers.find(x => x.name.toLowerCase() === q(".em-driver").value.trim().toLowerCase());
        if (d) { q(".em-team").value = d.team; q(".em-no").value = d.no; }
      });
      tr.querySelector("button").addEventListener("click", () => tr.remove());
      body.appendChild(tr);
    }
    rows.forEach(addRow);

    document.getElementById("em-add").addEventListener("click", () => {
      const max = Math.max(0, ...[...body.querySelectorAll(".em-pos")].map(i => Number(i.value) || 0));
      addRow({ pos: max + 1, no: "", driver: "", team: "", pts: ptsFor(max + 1) });
    });
    document.getElementById("em-cancel").addEventListener("click", () => { closeEditor(); setActive(key); });

    document.getElementById("em-save").addEventListener("click", async () => {
      const out = [...body.children].map(tr => {
        const v = (c) => tr.querySelector(c).value.trim();
        return { Position: v(".em-pos") === "" ? "" : Number(v(".em-pos")), "Driver No.": v(".em-no"),
                 Driver: v(".em-driver"), Team: v(".em-team"), Points: v(".em-pts") === "" ? "" : Number(v(".em-pts")) };
      }).filter(r => r.Driver);

      msg.textContent = "Saving…";
      try {
        const json = await EditMode.post({ action: "saveResults", season, round: race.Round, session: key, rows: out });
        if (!json.ok) { msg.textContent = json.error || "Couldn't save."; return; }
      } catch (err) {
        msg.textContent = "Network error — check the Apps Script URL and that it's deployed.";
        return;
      }
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
      race, season, bySession, notesBlocks,
      highlightRows: highlightsRes.rows, posterRows: postersRes.rows, circuitRows: circuitsRes.rows,
    });
    await PdfSheet.printSheet(`${season} R${String(race.Round).padStart(2, "0")} ${race["Race Name"] || "Race"}`);
  });
})();
