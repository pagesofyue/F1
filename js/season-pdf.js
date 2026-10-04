(async function () {
  document.getElementById("season-tag").textContent = CONFIG.SEASON;
  const season = CONFIG.SEASON;
  const status = document.getElementById("pdf-status");
  const go = document.getElementById("pdf-go");
  const chk = document.getElementById("include-empty");
  const esc = PdfSheet.esc;

  const [racesRes, resultsRes, postersRes, highlightsRes, notesDoc, circuitsRes] = await Promise.all([
    Utils.loadTab("races", PLACEHOLDER_RACES),
    Utils.loadTab("results", PLACEHOLDER_RESULTS),
    Utils.loadTab("posters", []),
    Utils.loadTab("highlights", []),
    Utils.fetchDoc("notes"),
    Utils.loadTab("circuits", []),
  ]);

  const races = racesRes.rows
    .filter(r => String(r.Season) === String(season))
    .sort((a, b) => Number(a.Round) - Number(b.Round));
  const resultsByRound = Utils.groupBy(resultsRes.rows.filter(r => String(r.Season) === String(season)), "Round");
  const hasResults = (r) => (resultsByRound[r.Round] || []).length > 0;

  function build() {
    const list = races.filter(r => chk.checked || hasResults(r));
    if (!list.length) {
      document.getElementById("print-sheet").innerHTML = "";
      status.textContent = "No races with results yet — tick the box above to include the whole calendar.";
      go.disabled = true;
      return;
    }

    const toc = list.map(r => `
      <li><a href="#ps-race-${esc(r.Round)}">
        <span>Round ${esc(r.Round)} - ${esc(r["Race Name"] || "TBC")}</span><i></i>
        <em>${esc(Utils.formatDateRange(r["Start Date"], r["End Date"]))}</em>
      </a></li>`).join("");

    const cover = `<section class="ps-cover">
      <div class="ps-kicker">GRID</div>
      <h1>Formula ${esc(season)} Season</h1>
      <p>Circuits, posters, results and notes — race by race.</p>
      <ul class="ps-toc">${toc}</ul>
    </section>`;

    const raceHtml = list.map(r => {
      const note = notesDoc && notesDoc.notes.find(n => Number(n.round) === Number(r.Round));
      return `<article class="ps-race" id="ps-race-${esc(r.Round)}">${PdfSheet.raceHTML({
        race: r, season, bySession: Utils.groupBy(resultsByRound[r.Round] || [], "Session"),
        notesBlocks: note ? note.blocks : [],
        highlightRows: highlightsRes.rows, posterRows: postersRes.rows, circuitRows: circuitsRes.rows,
      })}</article>`;
    }).join("");

    document.getElementById("print-sheet").innerHTML = cover + raceHtml;
    status.textContent = `${list.length} race${list.length === 1 ? "" : "s"} ready.`;
    go.disabled = false;
  }

  chk.addEventListener("change", build);
  go.addEventListener("click", async () => {
    go.disabled = true;
    status.textContent = "Loading images… the print dialog will open shortly.";
    await PdfSheet.printSheet(`Formula ${season} Season`);
    status.textContent = "Done — press the button again to re-export.";
    go.disabled = false;
  });
  build();
})();
