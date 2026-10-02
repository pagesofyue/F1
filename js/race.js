(async function () {
  document.getElementById("season-tag").textContent = CONFIG.SEASON;

  const params = new URLSearchParams(location.search);
  const round = params.get("round");
  const season = params.get("season") || CONFIG.SEASON;

  const [racesRes, resultsRes, postersRes, highlightsRes, notesRes, circuitsRes] = await Promise.all([
    Utils.loadTab("races", PLACEHOLDER_RACES),
    Utils.loadTab("results", PLACEHOLDER_RESULTS),
    Utils.loadTab("posters", []), // no placeholder rows — falls back to blank tiles per team
    Utils.loadTab("highlights", []),
    Utils.loadTab("notes", []),
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
  renderNotes(race, notesRes.rows, season);

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
    CONFIG.TEAM_ORDER.forEach(teamName => {
      const tc = Utils.teamColor(teamName);
      const isFeatured = CONFIG.FEATURED_TEAMS.includes(teamName);
      const posterUrl = forThisRace.find(p => p.Team === teamName)?.["Poster URL"];

      const tile = document.createElement("div");
      tile.className = "poster-slot" + (isFeatured ? " is-featured" : "");
      tile.style.position = "relative";

      const slot = Utils.buildImageSlot({
        key: `poster:${season}:${race.Round}:${Utils.slugify(teamName)}`,
        sheetUrl: posterUrl,
        label: teamName,
        alt: `${teamName} poster — ${race["Race Name"] || "race"}`,
        opts: { w: 600, h: 600, bg: tc + "22", fg: tc },
      });
      tile.appendChild(slot);

      const label = document.createElement("div");
      label.className = "poster-slot__label";
      label.textContent = teamName;
      tile.appendChild(label);

      wall.appendChild(tile);
    });
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

  function renderNotes(race, notesRows, season) {
    const section = document.getElementById("notes-section");
    const block = document.getElementById("notes-block");
    const match = notesRows.find(
      r => String(r.Round) === String(race.Round) && String(r.Season) === String(season)
    );
    if (!match || !match.Notes) return;
    section.style.display = "block";
    block.textContent = match.Notes;
  }
})();
