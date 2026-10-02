(async function () {
  document.getElementById("season-tag").textContent = CONFIG.SEASON;

  const [teamsRes, racesRes] = await Promise.all([
    Utils.loadTab("teams", []), // teams has no placeholder fallback — it's your real tab
    Utils.loadTab("races", PLACEHOLDER_RACES),
  ]);

  renderRaces(racesRes);
  renderTeams(teamsRes.rows);
})();

function renderRaces({ rows, isPlaceholder }) {
  const list = document.getElementById("race-list");
  const note = document.getElementById("races-note");
  note.innerHTML = isPlaceholder
    ? `<span class="data-note">⚠ placeholder data — add a "Races" tab, see README</span>`
    : "";

  const races = rows
    .filter(r => String(r.Season) == String(CONFIG.SEASON))
    .sort((a, b) => Number(a.Round) - Number(b.Round));

  if (races.length === 0) {
    list.innerHTML = `<div class="empty-state">No races found for ${CONFIG.SEASON}.</div>`;
    return;
  }

  list.innerHTML = "";
  races.forEach(race => {
    const a = document.createElement("a");
    a.className = "race-row";
    a.href = `race.html?round=${encodeURIComponent(race.Round)}&season=${encodeURIComponent(race.Season)}`;

    const status = (race.Status || "Upcoming").trim();

    a.innerHTML = `
      <div class="race-row__round">R${String(race.Round).padStart(2, "0")}</div>
      <div class="race-row__name-wrap">
        <div class="race-row__name">${race["Race Name"] || "TBC"}</div>
        <div class="race-row__country">${race.Country || ""}${race.Circuit ? " — " + race.Circuit : ""}</div>
      </div>
      <div class="race-row__dates">${Utils.formatDateRange(race["Start Date"], race["End Date"])}</div>
      <div class="race-row__status" data-status="${status}">${status}</div>
      <div class="race-row__arrow">→</div>
    `;
    list.appendChild(a);
  });
}

function renderTeams(teamRows) {
  const grid = document.getElementById("teams-grid");

  const bySeason = teamRows.filter(r => String(r.Season) == String(CONFIG.SEASON) && r["Team Name"]);

  if (bySeason.length === 0) {
    grid.innerHTML = `<div class="empty-state">No teams found for ${CONFIG.SEASON}.</div>`;
    return;
  }

  const byTeam = Utils.groupBy(bySeason, "Team Name");
  const orderedTeams = CONFIG.TEAM_ORDER.filter(t => byTeam[t]);
  // include any team present in the sheet but missing from TEAM_ORDER
  Object.keys(byTeam).forEach(t => { if (!orderedTeams.includes(t)) orderedTeams.push(t); });

  grid.innerHTML = "";

  orderedTeams.forEach(teamName => {
    const drivers = byTeam[teamName].filter(d => (d.Status || "").trim() !== "Reserved" || byTeam[teamName].length === 1);
    const tc = Utils.teamColor(teamName);
    const slug = Utils.slugify(teamName);

    /* --- team card --- */
    const card = document.createElement("div");
    card.className = "team-card";
    card.style.setProperty("--tc", tc);
    card.innerHTML = `
      <a class="team-card__name" style="color:inherit" href="team.html?team=${encodeURIComponent(teamName)}">${teamName}</a>
      <div class="team-card__link">VIEW TEAM →</div>
    `;
    const driversWrap = document.createElement("div");
    driversWrap.className = "team-card__drivers";

    drivers.forEach(driver => {
      if (!driver.Driver) return;
      const chip = document.createElement("a");
      chip.className = "driver-chip";
      chip.href = `team.html?team=${encodeURIComponent(teamName)}`;
      const slot = Utils.buildImageSlot({
        key: `driver:${Utils.slugify(driver.Driver)}:photo`,
        sheetUrl: driver["Driver Photo URL"],
        label: driver.Driver,
        alt: driver.Driver,
      });
      chip.appendChild(slot);
      const nameEl = document.createElement("div");
      nameEl.className = "driver-chip__name";
      nameEl.innerHTML = `<span class="driver-chip__no">#${driver["Driver No."] || "–"}</span><br>${driver.Driver}`;
      chip.appendChild(nameEl);
      driversWrap.appendChild(chip);
    });

    card.appendChild(driversWrap);
    grid.appendChild(card);
  });
}
