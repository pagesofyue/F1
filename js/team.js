(async function () {
  document.getElementById("season-tag").textContent = CONFIG.SEASON;

  const params = new URLSearchParams(location.search);
  const teamName = params.get("team");

  const teamsRes = await Utils.loadTab("teams", []);
  const rows = teamsRes.rows.filter(
    r => r["Team Name"] === teamName && String(r.Season) == String(CONFIG.SEASON)
  );

  if (!teamName || rows.length === 0) {
    document.getElementById("team-name").textContent = "Team not found";
    return;
  }

  const tc = Utils.teamColor(teamName);
  document.title = `${teamName} — Grid`;

  const nameEl = document.getElementById("team-name");
  nameEl.textContent = teamName;
  nameEl.style.setProperty("--tc", tc);

  const grid = document.getElementById("driver-grid");
  grid.innerHTML = "";
  rows.forEach(driver => {
    if (!driver.Driver) return;
    const card = document.createElement("div");
    card.className = "driver-card";
    card.style.setProperty("--tc", tc);

    const slot = Utils.buildImageSlot({
      key: `driver:${Utils.slugify(driver.Driver)}:photo`,
      sheetUrl: driver["Driver Photo URL"],
      label: driver.Driver,
      alt: driver.Driver,
    });
    card.appendChild(slot);

    const meta = document.createElement("div");
    meta.innerHTML = `
      <div class="driver-card__no">#${driver["Driver No."] || "–"}</div>
      <div class="driver-card__name">${driver.Driver}</div>
      <div class="driver-card__status">${(driver.Status || "").toUpperCase()}</div>
    `;
    card.appendChild(meta);
    grid.appendChild(card);
  });
})();
