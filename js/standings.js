(async function () {
  document.getElementById("season-tag").textContent = CONFIG.SEASON;

  Utils.fetchDoc("links").then(links => {
    const a = document.getElementById("standings-doc-link");
    if (links && links.standingsUrl && a) { a.href = links.standingsUrl; a.style.display = "inline"; }
  });

  const resultsRes = await Utils.loadTab("results", PLACEHOLDER_RESULTS);
  document.getElementById("drivers-note").innerHTML = resultsRes.isPlaceholder
    ? `<span class="data-note">⚠ placeholder data — connect your Results tab, see README</span>`
    : "";

  const scored = resultsRes.rows.filter(r =>
    String(r.Season) === String(CONFIG.SEASON) &&
    r.Points !== undefined && r.Points !== "" && !isNaN(Number(r.Points))
  );

  /* ---------- drivers ---------- */
  const driverTotals = new Map(); // name -> { points, team }
  scored.forEach(r => {
    const name = r.Driver;
    if (!name) return;
    const pts = Number(r.Points) || 0;
    const existing = driverTotals.get(name) || { points: 0, team: r.Team || "" };
    existing.points += pts;
    if (r.Team) existing.team = r.Team; // keep most recently seen team
    driverTotals.set(name, existing);
  });

  const driverStandings = [...driverTotals.entries()]
    .map(([name, info]) => ({ name, ...info }))
    .sort((a, b) => b.points - a.points);

  renderTable({
    rows: driverStandings,
    tableId: "drivers-table",
    bodyId: "drivers-body",
    emptyId: "drivers-empty",
    rowHtml: (row, i) => `
      <tr>
        <td class="pos">${i + 1}</td>
        <td class="driver">${row.name}</td>
        <td class="team"><span class="team-dot" style="background:${Utils.teamColor(row.team)}"></span>${row.team || "—"}</td>
        <td class="points">${row.points}</td>
      </tr>
    `,
  });

  /* ---------- constructors ---------- */
  const teamTotals = new Map(); // team -> points
  scored.forEach(r => {
    if (!r.Team) return;
    teamTotals.set(r.Team, (teamTotals.get(r.Team) || 0) + (Number(r.Points) || 0));
  });

  const teamStandings = [...teamTotals.entries()]
    .map(([team, points]) => ({ team, points }))
    .sort((a, b) => b.points - a.points);

  renderTable({
    rows: teamStandings,
    tableId: "teams-table",
    bodyId: "teams-body",
    emptyId: "teams-empty",
    rowHtml: (row, i) => `
      <tr>
        <td class="pos">${i + 1}</td>
        <td class="team"><span class="team-dot" style="background:${Utils.teamColor(row.team)}"></span>${row.team}</td>
        <td class="points">${row.points}</td>
      </tr>
    `,
  });

  function renderTable({ rows, tableId, bodyId, emptyId, rowHtml }) {
    const table = document.getElementById(tableId);
    const empty = document.getElementById(emptyId);
    const body = document.getElementById(bodyId);

    if (rows.length === 0) {
      table.style.display = "none";
      empty.style.display = "block";
      empty.textContent = "No scored results yet this season.";
      return;
    }

    table.style.display = "table";
    empty.style.display = "none";
    body.innerHTML = rows.map(rowHtml).join("");
  }
})();
