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
  const nextUp = document.getElementById("next-up");
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

  const labels = Utils.roundLabels(races);
  const esc = (v) => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---- Next up: first race that is neither completed nor cancelled ---- */
  const next = races.find(r => !["completed", "cancelled"].includes(String(r.Status || "").trim().toLowerCase()));
  if (next && nextUp) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = Utils.parseDate(next["Start Date"]), end = Utils.parseDate(next["End Date"]) || start;
    const live = String(next.Status || "").trim().toLowerCase() === "live" || (start && today >= start && today <= end);
    const days = start ? Math.round((start - today) / 86400000) : null;
    const line = live ? "Race weekend is here 🏁"
      : days !== null && days > 0 ? `Lights out in ${days} day${days === 1 ? "" : "s"} · ${Utils.formatDateRange(next["Start Date"], next["End Date"])}`
      : Utils.formatDateRange(next["Start Date"], next["End Date"]);
    nextUp.innerHTML = `
      <a class="next-up__card" href="race.html?round=${encodeURIComponent(next.Round)}&season=${encodeURIComponent(next.Season)}">
        <span class="next-up__tape next-up__tape--l"></span><span class="next-up__tape next-up__tape--r"></span>
        <span class="next-up__label">NEXT UP</span>
        <span class="next-up__name">${esc(next["Race Name"] || "TBC")}</span>
        <span class="next-up__circuit">${esc(next.Circuit || next.Country || "")}</span>
        <span class="next-up__line">${esc(line)}</span>
      </a>`;
  }

  /* ---- compact calendar cards ---- */
  list.innerHTML = "";
  races.forEach(race => {
    const cancelled = Utils.isCancelled(race);
    const sprint = !cancelled && Utils.isSprintWeekend(race, []);
    const label = labels[String(race.Round)];

    const a = document.createElement("a");
    a.className = "race-card" + (cancelled ? " is-cancelled" : "");
    a.href = `race.html?round=${encodeURIComponent(race.Round)}&season=${encodeURIComponent(race.Season)}`;
    a.title = Utils.formatDateRange(race["Start Date"], race["End Date"]);
    a.innerHTML = `
      ${sprint ? '<span class="race-card__sprint">SPRINT</span>' : ""}
      <div class="race-card__round">${cancelled ? "—" : "ROUND " + label}</div>
      <div class="race-card__name">${esc(race["Race Name"] || "TBC")}</div>
      <div class="race-card__circuit">${esc(race.Circuit || race.Country || "")}</div>
      ${cancelled ? '<span class="race-card__stamp">CANCELLED</span>' : ""}
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
      requestAnimationFrame(() => fitOneLine(nameEl));
    });

    card.appendChild(driversWrap);
    grid.appendChild(card);
  });
}

// Keep a driver's name on a single line: shrink the font until it fits the chip.
function fitOneLine(el) {
  let size = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > el.clientWidth + 0.5 && size > 8.5) {
    size -= 0.5;
    el.style.fontSize = size + "px";
  }
}
