(async function () {
  let notesBlocks = []; // filled by renderNotes, reused by the PDF export
  document.getElementById("season-tag").textContent = CONFIG.SEASON;

  const params = new URLSearchParams(location.search);
  const round = params.get("round");
  const season = params.get("season") || CONFIG.SEASON;

  const [racesRes, resultsRes, postersRes, highlightsRes, notesDoc, circuitsRes] = await Promise.all([
    Utils.loadTab("races", PLACEHOLDER_RACES),
    Utils.loadTab("results", PLACEHOLDER_RESULTS),
    Utils.loadTab("posters", []), // no placeholder rows — falls back to blank tiles per team
    Utils.loadTab("highlights", []),
    Utils.fetchDoc("notes"),
    Utils.loadTab("circuits", []),
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

  renderPosters(race, postersRes.rows, season);
  renderCircuitMap(race, circuitsRes.rows);
  renderHighlights(race, highlightsRes.rows, season);
  renderNotes(race, notesDoc);

  const resultsNote = document.getElementById("results-note");
  resultsNote.innerHTML = resultsRes.isPlaceholder
    ? `<span class="data-note">⚠ placeholder data — add a "Results" tab, see README</span>`
    : "";

  const raceResults = resultsRes.rows.filter(
    r => String(r.Round) === String(race.Round) && String(r.Season) === String(season)
  );

  const bySession = Utils.groupBy(raceResults, "Session");

  const tabsEl = document.getElementById("session-tabs");
  tabsEl.innerHTML = "";
  let activeKey = null;

  CONFIG.SESSION_ORDER.forEach(({ key, label }) => {
    const hasData = !!bySession[key]?.length;
    const btn = document.createElement("button");
    btn.className = "session-tab";
    btn.textContent = label;
    btn.disabled = !hasData;
    btn.addEventListener("click", () => setActive(key));
    tabsEl.appendChild(btn);
    if (hasData && activeKey === null) activeKey = key;
  });

  function setActive(key) {
    activeKey = key;
    [...tabsEl.children].forEach((btn, i) => {
      btn.classList.toggle("is-active", CONFIG.SESSION_ORDER[i].key === key);
    });
    renderTable(bySession[key] || []);
  }

  if (activeKey) {
    setActive(activeKey);
  } else {
    document.getElementById("results-table").style.display = "none";
    const empty = document.getElementById("results-empty");
    empty.style.display = "block";
    empty.textContent = "No session results yet for this race.";
  }

  function renderTable(rows) {
    const table = document.getElementById("results-table");
    const empty = document.getElementById("results-empty");
    const body = document.getElementById("results-body");

    if (!rows.length) {
      table.style.display = "none";
      empty.style.display = "block";
      empty.textContent = "No results recorded for this session yet.";
      return;
    }

    table.style.display = "table";
    empty.style.display = "none";

    const sorted = [...rows].sort((a, b) => Number(a.Position) - Number(b.Position));
    body.innerHTML = sorted.map(r => `
      <tr>
        <td class="pos">${r.Position || "–"}</td>
        <td class="driver">${r.Driver || "—"}</td>
        <td class="team"><span class="team-dot" style="background:${Utils.teamColor(r.Team)}"></span>${r.Team || "—"}</td>
        <td class="points">${r.Points !== undefined && r.Points !== "" ? r.Points : "—"}</td>
      </tr>
    `).join("");
  }

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
    figure.appendChild(Utils.buildImageSlot({
      key: `circuit:${Utils.slugify(race.Circuit)}:map`,
      sheetUrl: match?.["Circuit Map URL"],
      label: race.Circuit,
      alt: `${race.Circuit} circuit map`,
      opts: { w: 500, h: 310, bg: "#ECEAE4", fg: "#9A9E92" },
    }));
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
    CONFIG.HIGHLIGHT_CATEGORIES.forEach(category => {
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
    const section = document.getElementById("notes-section");
    const block = document.getElementById("notes-block");
    const link = document.getElementById("notes-doc-link");
    if (!notesDoc) return; // script not connected, or Doc not set up yet
    if (link && notesDoc.url) { link.href = notesDoc.url; link.style.display = "inline"; }

    const match = notesDoc.notes.find(n => Number(n.round) === Number(race.Round));
    if (!match || !match.blocks.length) return;
    notesBlocks = match.blocks;
    section.style.display = "block";
    block.innerHTML = "";

    const text = document.createElement("div");
    text.className = "notes-text";
    let list = null;

    match.blocks.forEach(b => {
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

  /* =====================================================================
     PDF EXPORT
     Builds a print-only layout (#print-sheet) and opens the browser's print
     dialog — choose "Save as PDF". Layout:
       • header + circuit map
       • FP1 / FP2 / FP3 .......... 3 columns (graphic on top, results below)
       • Sprint Quali, Sprint, Qualifying, Race ... 2 columns
         (left: pole sitter / winner graphic, right: results)
       • race notes
     Font: Special Elite. Sessions with no results are skipped.
     ===================================================================== */
  const esc = (v) => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Results session -> Highlights category (image) + caption
  const SESSION_GRAPHIC = {
    "FP1": { cat: "FP1", cap: "Fastest" },
    "FP2": { cat: "FP2", cap: "Fastest" },
    "FP3": { cat: "FP3", cap: "Fastest" },
    "Sprint Qualifying": { cat: "Sprint Qualifying", cap: "Sprint Pole" },
    "Sprint": { cat: "Sprint Race", cap: "Sprint Winner" },
    "Qualifying": { cat: "Pole Position", cap: "Pole Sitter" },
    "Race": { cat: "Race Winner", cap: "Race Winner" },
  };

  function graphicFor(sessionKey, rows) {
    const g = SESSION_GRAPHIC[sessionKey];
    const top = [...rows].sort((a, b) => Number(a.Position) - Number(b.Position))[0] || {};
    const match = highlightsRes.rows.find(r =>
      r.Category === g.cat && String(r.Round) === String(race.Round) && String(r.Season) === String(season));
    const tc = Utils.teamColor(top.Team);
    const src = Utils.resolveImageSrc(
      `highlight:${season}:${race.Round}:${Utils.slugify(g.cat)}`,
      match?.["Image URL"], top.Driver || g.cat,
      { w: 400, h: 500, bg: tc + "22", fg: tc });
    return `<figure class="ps-graphic">
      <img src="${esc(src)}" alt="${esc(g.cat)}" />
      <figcaption><span>${esc(g.cap)}</span> ${esc(top.Driver || "")}</figcaption>
    </figure>`;
  }

  function tableFor(rows, { compact }) {
    const sorted = [...rows].sort((a, b) => Number(a.Position) - Number(b.Position));
    const showPts = sorted.some(r => r.Points !== undefined && r.Points !== "");
    return `<table class="ps-table">
      <thead><tr><th>Pos</th><th>Driver</th>${compact ? "" : "<th>Team</th>"}${showPts && !compact ? '<th class="r">Pts</th>' : ""}</tr></thead>
      <tbody>${sorted.map(r => `<tr>
        <td>${esc(r.Position || "–")}</td>
        <td><i style="background:${Utils.teamColor(r.Team)}"></i>${esc(r.Driver || "—")}</td>
        ${compact ? "" : `<td>${esc(r.Team || "—")}</td>`}
        ${showPts && !compact ? `<td class="r">${esc(r.Points ?? "")}</td>` : ""}
      </tr>`).join("")}</tbody>
    </table>`;
  }

  function buildPrintSheet() {
    const has = (k) => !!bySession[k]?.length;
    const label = (k) => CONFIG.SESSION_ORDER.find(s => s.key === k)?.label || k;
    const circuitMatch = circuitRows().find(c => c.Circuit === race.Circuit);
    const mapSrc = Utils.resolveImageSrc(
      `circuit:${Utils.slugify(race.Circuit)}:map`, circuitMatch?.["Circuit Map URL"],
      race.Circuit || "Circuit", { w: 500, h: 310, bg: "none" });

    let html = `
      <header class="ps-head">
        <div>
          <div class="ps-kicker">ROUND ${String(race.Round).padStart(2, "0")} — ${esc(season)}</div>
          <h1>${esc(race["Race Name"] || "Race")}</h1>
          <p>${esc(race.Country || "")} · ${esc(race.Circuit || "")}<br>${esc(Utils.formatDateRange(race["Start Date"], race["End Date"]))}</p>
        </div>
        <figure class="ps-map"><img src="${esc(mapSrc)}" alt="Circuit map" /></figure>
      </header>`;

    // Posters — straight after the circuit: featured teams (3 across), then the rest (4 across)
    const posterTile = (teamName) => {
      const tc = Utils.teamColor(teamName);
      const url = postersRes.rows.find(p => p.Team === teamName &&
        String(p.Round) === String(race.Round) && String(p.Season) === String(season))?.["Poster URL"];
      const src = Utils.resolveImageSrc(`poster:${season}:${race.Round}:${Utils.slugify(teamName)}`,
        url, teamName, { w: 600, h: 800, bg: tc + "22", fg: tc });
      return `<figure class="ps-poster"><img src="${esc(src)}" alt="${esc(teamName)} poster" /><figcaption>${esc(teamName)}</figcaption></figure>`;
    };
    const featured = CONFIG.TEAM_ORDER.filter(t => CONFIG.FEATURED_TEAMS.includes(t));
    const rest = CONFIG.TEAM_ORDER.filter(t => !CONFIG.FEATURED_TEAMS.includes(t));
    html += `<section class="ps-block ps-posters"><h2>Race Posters</h2>
      <div class="ps-posters__row ps-posters__row--featured">${featured.map(posterTile).join("")}</div>
      <div class="ps-posters__row ps-posters__row--rest">${rest.map(posterTile).join("")}</div>
    </section>`;

    // Free practice — 3 columns
    const fps = ["FP1", "FP2", "FP3"].filter(has);
    if (fps.length) {
      html += `<section class="ps-block"><div class="ps-cols ps-cols--3">${fps.map(k => `
        <div class="ps-col"><h2>${esc(label(k))}</h2>${graphicFor(k, bySession[k])}${tableFor(bySession[k], { compact: true })}</div>`).join("")}
      </div></section>`;
    }

    // Sprint Quali, Sprint, Qualifying, Race — 2 columns (graphic left, results right)
    ["Sprint Qualifying", "Sprint", "Qualifying", "Race"].filter(has).forEach(k => {
      html += `<section class="ps-block"><h2>${esc(label(k))}</h2>
        <div class="ps-cols ps-cols--2">
          ${graphicFor(k, [...bySession[k]].sort((a, b) => Number(a.Position) - Number(b.Position)))}
          ${tableFor(bySession[k], { compact: false })}
        </div></section>`;
    });

    // Notes
    if (notesBlocks.length) {
      html += `<section class="ps-block ps-notes"><h2>Race Notes</h2>${notesBlocks.map(b =>
        b.type === "img" ? `<img class="ps-note-img" src="${esc(b.url)}" alt="" />`
        : b.type === "li" ? `<p class="ps-li">• ${esc(b.text)}</p>`
        : `<p>${esc(b.text)}</p>`).join("")}</section>`;
    }

    document.getElementById("print-sheet").innerHTML = html;
  }

  function circuitRows() { return circuitsRes.rows; }

  document.getElementById("export-pdf").addEventListener("click", async () => {
    buildPrintSheet();
    const prevTitle = document.title;
    document.title = `${season} R${String(race.Round).padStart(2, "0")} ${race["Race Name"] || "Race"}`; // suggested file name
    try { await document.fonts.load('16px "Special Elite"'); } catch {}
    // wait for images in the sheet so they appear in the PDF
    await Promise.all([...document.querySelectorAll("#print-sheet img")].map(img =>
      img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
    window.print();
    setTimeout(() => { document.title = prevTitle; }, 500);
  });
})();
