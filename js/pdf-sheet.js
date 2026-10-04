/* Shared PDF layout used by race.html (one race) and season-pdf.html (whole season).
   PdfSheet.raceHTML(ctx) returns the print markup for one race:
     header + circuit map, posters, FP1-3 (3 columns), Sprint Quali / Sprint /
     Qualifying / Race (2 columns: graphic left, results right), race notes.
   ctx = { race, season, bySession, highlightRows, posterRows, circuitRows, notesBlocks } */
const PdfSheet = (function () {
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

  const byPos = (rows) => [...rows].sort((a, b) => Number(a.Position) - Number(b.Position));

  function graphicFor(c, sessionKey, rows) {
    const g = SESSION_GRAPHIC[sessionKey];
    const top = byPos(rows)[0] || {};
    const match = c.highlightRows.find(r =>
      r.Category === g.cat && String(r.Round) === String(c.race.Round) && String(r.Season) === String(c.season));
    const tc = Utils.teamColor(top.Team);
    const src = Utils.resolveImageSrc(
      `highlight:${c.season}:${c.race.Round}:${Utils.slugify(g.cat)}`,
      match?.["Image URL"], top.Driver || g.cat,
      { w: 400, h: 500, bg: tc + "22", fg: tc });
    return `<figure class="ps-graphic">
      <img src="${esc(src)}" alt="${esc(g.cat)}" />
      <figcaption><span>${esc(g.cap)}</span> ${esc(top.Driver || "")}</figcaption>
    </figure>`;
  }

  function tableFor(rows, { compact }) {
    const sorted = byPos(rows);
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

  function raceHTML(c) {
    const { race, season, bySession } = c;
    const has = (k) => !!bySession[k]?.length;
    const label = (k) => CONFIG.SESSION_ORDER.find(s => s.key === k)?.label || k;
    const circuitMatch = c.circuitRows.find(x => x.Circuit === race.Circuit);
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

    // Posters — featured teams (3 across), then the rest (4 across)
    const posterTile = (teamName) => {
      const tc = Utils.teamColor(teamName);
      const url = c.posterRows.find(p => p.Team === teamName &&
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
        <div class="ps-col"><h2>${esc(label(k))}</h2>${graphicFor(c, k, bySession[k])}${tableFor(bySession[k], { compact: true })}</div>`).join("")}
      </div></section>`;
    }

    // Sprint Quali, Sprint, Qualifying, Race — 2 columns (graphic left, results right)
    const sprint = Utils.isSprintWeekend(race, Object.keys(bySession));
    ["Sprint Qualifying", "Sprint", "Qualifying", "Race"]
      .filter(k => has(k) && (sprint || !Utils.SPRINT_SESSIONS.includes(k))).forEach(k => {
      html += `<section class="ps-block"><h2>${esc(label(k))}</h2>
        <div class="ps-cols ps-cols--2">
          ${graphicFor(c, k, bySession[k])}
          ${tableFor(bySession[k], { compact: false })}
        </div></section>`;
    });

    // Notes
    if (c.notesBlocks && c.notesBlocks.length) {
      html += `<section class="ps-block ps-notes"><h2>Race Notes</h2>${c.notesBlocks.map(b =>
        b.type === "img" ? `<img class="ps-note-img" src="${esc(b.url)}" alt="" />`
        : b.type === "li" ? `<p class="ps-li">• ${esc(b.text)}</p>`
        : `<p>${esc(b.text)}</p>`).join("")}</section>`;
    }
    return html;
  }

  /* Waits for the font + every image in the sheet, then opens the print dialog. */
  async function printSheet(title) {
    const prev = document.title;
    if (title) document.title = title; // becomes the suggested file name
    try { await document.fonts.load('16px "Special Elite"'); } catch {}
    const imgs = [...document.querySelectorAll("#print-sheet img")];
    await Promise.race([
      Promise.all(imgs.map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; }))),
      new Promise(r => setTimeout(r, 25000)),
    ]);
    window.print();
    setTimeout(() => { document.title = prev; }, 500);
  }

  return { esc, raceHTML, printSheet };
})();
