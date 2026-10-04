# 2026 Grid — F1 Season Site

A static site (no build step) backed by Google Sheets, deployable on GitHub Pages.

- **Homepage** — race calendar + teams grid (click a driver → team page)
- **Race page** — session-tabbed results (FP1/FP2/FP3/Sprint/Qualifying/Race) with points,
  that race's 11 team posters (Ferrari/Red Bull/Racing Bulls shown bigger), a circuit map,
  pole/winner/session highlight graphics, and your personal race notes
- **Team page** — driver roster for that team
- **Standings page** (`standings.html`) — Driver and Constructor championship standings,
  **auto-computed** by summing every Points value in your Results tab, and also written out to a **Google Doc** each time results change
- **Admin panel** (`admin.html`) — add/edit/delete rows in the sheet tabs from the site itself
  (needs a one-time Apps Script setup — see section 3 below)

Right now the calendar and results are running on **placeholder data** (you'll see a small
`⚠ placeholder data` tag on those sections) so you can see the site fully working. Follow the
steps below whenever you're ready to plug in real data — nothing else in the code needs to change.

---

## 1. Deploy to GitHub Pages

1. Create a new GitHub repo (e.g. `f1-2026-grid`).
2. Upload everything in this folder to the repo root (keep the folder structure — `index.html`,
   `race.html`, `team.html`, `css/`, `js/` all at the top level).
3. In the repo: **Settings → Pages → Source → Deploy from a branch → `main` / root**.
4. Your site will be live at `https://<your-username>.github.io/<repo-name>/` within a minute or two.

Any time you edit files, just commit + push — Pages redeploys automatically.

---

## 2. Connect the rest of your Google Sheet

Google Sheets only publishes **one tab per CSV link**, so each tab below needs its own
"Publish to web" link. Your existing Teams tab is already connected — you're adding two more.

### (Optional) Add a Driver Photo URL column to your existing "Teams" tab

| Season | Team Name | Driver | Driver No. | Status | **Driver Photo URL** |
|---|---|---|---|---|---|
| 2026 | Ferrari | Charles Leclerc | 16 | Full Time | `https://.../leclerc.jpg` |

- Leave blank (or skip the column entirely) to use an auto-generated placeholder tile.
- **Team Name spelling must exactly match** across every tab (case-sensitive) — this is what
  links results and posters back to the right team. Use exactly:
  `Ferrari, Red Bull, Mercedes, Mclaren, Racing Bulls, Williams, Aston Martin, Haas, Alpine, Audi, Cadillac`

### Add a new "Races" tab

Columns (exact header spelling matters):

| Season | Round | Race Name | Country | Circuit | Start Date | End Date | Status |
|---|---|---|---|---|---|---|---|
| 2026 | 1 | Australian Grand Prix | Australia | Albert Park Circuit | 2026-03-06 | 2026-03-08 | Upcoming |

- **Round**: plain integer, 1, 2, 3… — this is how race pages are linked (`race.html?round=1`).
- **Start/End Date**: format `YYYY-MM-DD` (e.g. `2026-03-06`).
- **Status**: use `Upcoming`, `Completed`, or `Live` for the colored badge to look right (any
  other text still works, just renders in grey).

Then: **File → Share → Publish to web → select the "Races" sheet → CSV → Publish**, copy the
link, and paste it into `js/config.js` as `SHEET_URLS.races`.

### Add a new "Results" tab

| Season | Round | Session | Position | Driver No. | Driver | Team | Points |
|---|---|---|---|---|---|---|---|
| 2026 | 1 | Race | 1 | 16 | Charles Leclerc | Ferrari | 25 |

- **Session** must be exactly one of: `FP1`, `FP2`, `FP3`, `Sprint Qualifying`, `Sprint`,
  `Qualifying`, `Race` — this is what drives the tabs on the race page and their order. (You can
  add/rename/reorder these in `CONFIG.SESSION_ORDER` inside `js/config.js` if you want different
  sessions.)
- **Driver** and **Team** should match the spelling used in your Teams tab.
- **Points**: leave blank for practice/qualifying sessions where points don't apply.
- One row = one driver's result in one session of one race.

Publish this tab the same way, and paste the link into `SHEET_URLS.results` in `js/config.js`.

### Add a new "Posters" tab (only if/when you add poster images)

Posters vary **per race, per team** — not one static image per team. One row per team per race:

| Season | Round | Team | Poster URL |
|---|---|---|---|
| 2026 | 1 | Ferrari | `https://.../ferrari-round1.jpg` |
| 2026 | 1 | Red Bull | `https://.../redbull-round1.jpg` |
| … | … | … | … |

- Across a 24-race season × 11 teams that's ~264 rows total — all in this **one** tab (you only
  publish it once; no need for a separate link per race).
- **Team** must match the spelling used in your Teams tab exactly.
- Ferrari, Red Bull, and Racing Bulls render larger automatically on the race page — no extra
  column needed for that, it's controlled by `CONFIG.FEATURED_TEAMS` in `js/config.js`.
- You mentioned you're not adding these yet — that's completely fine. Every race page will just
  show 11 placeholder tiles (with the featured 3 already sized bigger) until this tab exists.

Publish this tab the same way, and paste the link into `SHEET_URLS.posters` in `js/config.js`.

### Add a new "Highlights" tab (optional — pole/winner/session graphics)

One row per category per race:

| Season | Round | Category | Image URL |
|---|---|---|---|
| 2026 | 1 | Pole Position | `https://.../round1-pole.jpg` |
| 2026 | 1 | Race Winner | `https://.../round1-winner.jpg` |

- **Category** must be exactly one of: `Pole Position`, `Race Winner`, `FP1`, `FP2`, `FP3`,
  `Sprint Qualifying`, `Sprint Race` (edit this list in `CONFIG.HIGHLIGHT_CATEGORIES` in
  `js/config.js` if your categories differ).
- The whole section is hidden on a race page until this tab has at least one row — no empty
  placeholder tiles cluttering things up before you're ready.

Paste the link into `SHEET_URLS.highlights`.

### Race notes (Google Doc — no sheet tab)

Notes now live in a **Google Doc**, created for you by `setupDocs()` (section 3). One Doc for the
season, one **Heading 1** per round:

```
Round 1 — Australian Grand Prix      <- Heading 1
Great strategy call on lap 32...     <- normal paragraphs / bullets
Image: https://.../round1-note.jpg   <- optional, own line, shows as a picture
```

- Keep the words `Round N` in each Heading 1 — that's how a note is matched to a race page.
- Edit the Doc like any other; the race page picks changes up on next load.
- A race with nothing written under its heading shows no notes section.

### Add a new "Circuits" tab (optional — circuit maps, set up ONCE per track)

This one works differently from the others — **one row per circuit, not per race.** Since the
same tracks come back every season, you only enter each circuit once and every race held there —
this year, next year, every year — picks up the map automatically by matching the **Circuit**
name you already have in your Races tab.

| Circuit | Circuit Map URL |
|---|---|
| Albert Park Circuit | `https://.../albert-park-map.png` |
| Suzuka International Racing Course | `https://.../suzuka-map.png` |

- **Circuit** must match the spelling in your Races tab's Circuit column exactly.
- Add ~24 rows once (or however many distinct circuits you run) and you're done for good — new
  seasons re-use the same rows automatically as long as the Circuit name matches.

Paste the link into `SHEET_URLS.circuits`.

### Update `js/config.js`

```js
SHEET_URLS: {
  teams:      "...(already set)...",
  races:      "PASTE YOUR RACES CSV LINK HERE",
  results:    "PASTE YOUR RESULTS CSV LINK HERE",
  posters:    "PASTE YOUR POSTERS CSV LINK HERE",    // optional, can stay null
  highlights: "PASTE YOUR HIGHLIGHTS CSV LINK HERE", // optional, can stay null
  circuits:   "PASTE YOUR CIRCUITS CSV LINK HERE",   // optional, can stay null
},
```

Once the links are in place, the placeholder warnings disappear automatically and the site
reads live from your sheet. You never need to touch HTML/CSS/JS again for routine updates —
just edit the spreadsheet.

---

## Export a race page to PDF

Every race page has an **⤓ Export PDF** button. It opens the print dialog with a purpose-built
layout — choose **Save as PDF** as the destination (turn on "Background graphics" if your browser
offers it). The PDF contains: circuit map (no background or border), the team posters (Ferrari / Red Bull / Racing Bulls larger, then the other eight), FP1–FP3 in three columns, then Sprint Qualifying, Sprint,
Qualifying and Race in two columns (pole sitter / winner graphic on the left, results on the right),
then your race notes — all in Special Elite. Sessions with no results are skipped.

The graphics come from the **Highlights** tab: `Pole Position` → Qualifying, `Race Winner` → Race,
`Sprint Qualifying`, `Sprint Race`, and `FP1`/`FP2`/`FP3` for practice. Missing ones fall back to a
coloured initials tile.

## Season PDF (all races + table of contents)

**Season PDF** in the top menu (`season-pdf.html`) builds one PDF for the whole season: a cover
titled "Formula 2026 Season" with a clickable table of contents (Round 1 - Australian Grand Prix …),
then every race in the same layout as the single-race export. By default only races that already
have results are included; tick the box to include the whole calendar. Click **Save season as PDF**,
choose **Save as PDF** in the print dialog and turn on **Background graphics**. Page numbers print at
the bottom right (Chrome/Edge); the contents entries are links, but don't show page numbers.

## Editing on the page (results + notes) — no separate admin needed

1. Open any race page and press **🔒 Edit** in the top menu. Type the admin password once
   (it's remembered for that browser session; press **✎ Editing — lock** to lock again).
2. **Results:** pick a session tab (in edit mode every session can be opened), press
   **✎ Edit … results**, type or pick drivers (team and number fill in), set Pos/Pts, **Save results**.
   Race and Sprint rows are pre-filled with the standard F1 points. Rows with no driver are ignored.
   Saving replaces that session's rows in your Results tab and refreshes the standings Doc.
3. **Notes:** press **✎ Edit notes**, type, **Save** — written into the Google Doc under that round.
   (One line = one paragraph, `- ` = bullet, `Image: https://…` = picture.)

Visitors never see the edit buttons — they only appear after the password is entered.
When the Apps Script is connected, results are read live from it, so edits show instantly.

### Sprint weekends
The Races tab gets a **Sprint Weekend** column (the script adds the header automatically the first
time admin loads Races). Set it to **Yes** or **No** per round in `admin.html`. When it's No,
Sprint Qualifying, Sprint, their highlight tiles and their PDF sections are hidden. If the cell is
blank, the site guesses from whether any sprint results exist.

After changing `Code.gs`, redeploy (Deploy → Manage deployments → ✎ → New version → Deploy).

## Pasting image links (Pinterest, Imgur, Drive…)

In any image column (Poster URL, Image URL, Circuit Map URL, Driver Photo URL) you can paste a
normal **page link** — e.g. a Pinterest pin or pin.it link. The Apps Script finds the picture and
replaces the cell with the direct image link (the original is kept as a cell note).

- **Set up once:** in Apps Script run **`installTriggers`** and accept the permissions (including
  "connect to an external service"), then redeploy. After that, pasting into the sheet converts it.
- Links added through `admin.html` are converted automatically on save.
- Already have page links in the sheet? Use the sheet menu **Grid → Convert all image links**.
- Google Drive links work if the file is shared "Anyone with the link"; Dropbox and Imgur page
  links are tidied automatically even without the script.
- If a site blocks the lookup (Instagram, some Pinterest pins), the cell gets a note saying so —
  then right-click the image → **Copy image address** and paste that instead.

## Admin saves once per page

Each admin tab is one editable grid. Change as many cells as you want, add rows with **+ Add row**,
mark rows with **Delete** (press **Undo** to take it back), then press **Save changes** once — the
whole page is written in one go. Edited rows turn yellow, and the button shows how many changes are
waiting. Leaving the tab or page with unsaved changes asks first.

## What changed in build r6

- **Dates:** the Races tab in admin has date pickers. The site shows them as `Mar 6–8` / `Oct 10`.
- **Status:** Races now has **Cancelled**. Cancelled rounds get a stamp and no round number; the
  other rounds are numbered as if it wasn't there (the sheet's Round column never changes).
- **Calendar:** compact 4-across cards with a SPRINT tag and a "Next up" note.
- **Driver photos:** cropped from the top; names stay on one line.
- **Results editor:** type a driver's name, number or 3-letter code (LEC, 16) and press Enter —
  team, number and points fill in. Points follow the position (Race 25–1, Sprint 8–1) unless you
  type your own. Each session also has a photo field: paste a link (Pinterest etc.) or upload a file;
  it is saved to the Highlights tab (uploads go to a "Grid uploads" folder in your Google Drive).
  Optional: add a `Driver Code` column to Teams if a driver's code isn't the first 3 letters of the surname.

## Classification statuses and the tally

In the results editor, **Pos** accepts a number or **DNF** (did not finish), **DNS** (did not start)
or **DSQ** (disqualified). They sort below the finishers (DNF, DSQ, DNS) and are worth 0 points.
Standings are tallied from the Points column: Race 25-18-15-12-10-8-6-4-2-1, Sprint 8-7-6-5-4-3-2-1,
0 for everyone else; practice and qualifying score nothing. Driver and constructor totals
(and the standings Doc) update on every save.

## 3. Admin panel (edit everything from the site)

`admin.html` is now **back-end setup only** — drivers (Teams), rounds (Races, incl. Sprint Weekend), Circuits, Posters and Highlights. Results and notes are edited on the race page. It lets you add/edit/delete rows in those tabs directly from
the site, without opening the spreadsheet. It still reads and writes to your actual Google
Sheet — it just gives you a form instead of spreadsheet cells.

Since GitHub Pages is a static host with no server of its own, this works via a small **Google
Apps Script "Web app"** attached to your spreadsheet, which the admin page talks to.

### One-time setup

1. Open your Google Sheet → **Extensions → Apps Script**.
2. Delete the default `myFunction() {}` stub and paste in the entire contents of
   `apps-script/Code.gs` from this folder.
3. In `setAdminPassword()`, change `'CHANGE-ME-TO-A-REAL-PASSWORD'` to a real password of your
   choosing.
4. In the function dropdown at the top of the Apps Script editor, select `setAdminPassword`,
   then click **Run**. The first time, Google will show an "unverified app" warning — this is
   normal for a script you wrote yourself; click **Advanced → Go to (project name)** to allow it.
   This step stores your password in the script, not in your website's code.
5. Click **Deploy → New deployment**. Choose type **Web app**. Set "Execute as" to **Me** and
   "Who has access" to **Anyone**. Click **Deploy**, then copy the **Web app URL**.
6. Paste that URL into `js/config.js` as `ADMIN.APPS_SCRIPT_URL`.
7. In the same `ADMIN.SHEET_NAMES` block, make sure each key points to your **actual** tab name
   (case-sensitive) — e.g. if your Teams tab is still called `Sheet1`, set `teams: "Sheet1"`.
8. Open `admin.html` on your deployed site and enter the password from step 3.

### Google Docs setup (race notes + standings export)

After step 5 above is working (the Web app URL is in `config.js`):

1. In Apps Script, select **`setupDocs`** and click **Run**. Google will ask for permission to
   manage Docs — allow it. This creates two Docs and fills the notes Doc with a heading per round
   from your Races tab. Open **View → Logs** (or Execution log) for both links.
2. *(Optional)* Run **`installTriggers`** once so typing directly in the Results tab also
   refreshes the standings Doc. Edits made through `admin.html` refresh it automatically.
3. **Redeploy**: Deploy → Manage deployments → ✎ → Version: New version → Deploy.
4. The Docs are private to your Google account. The website reads them through the Apps Script, so
   visitors see the notes without needing access. To let others open the standings Doc itself,
   use the Doc's Share button.

**If you ever edit `Code.gs` again:** go to **Deploy → Manage deployments → ✎ (edit) → Version:
New version → Deploy**. This keeps the same URL working with your changes (a brand new
deployment would give you a different URL you'd have to re-paste into `config.js`).

### Dropdowns instead of retyping names

This is automatic, no extra setup: every driver and team listed under the **current season**
(`CONFIG.SEASON` in `js/config.js`) in your Teams tab becomes a dropdown option everywhere else
in the admin panel (Results, Posters) — not the full historical list, just who's active now.
Picking a driver also auto-fills their Driver No. and Team. If someone genuinely new isn't in the
list yet (including anyone from a past season, if you're back-filling old results), choose
**"+ Add new…"** in the dropdown to type them in directly.

### Worth knowing

- **Reads are not password-protected** — anyone with the Apps Script URL can view the data, but
  that's no more exposed than your published CSV links already are.
- **Writes require the password**, checked inside the Apps Script, not in the website's code —
  so the real password is never visible in your GitHub repo.
- This is a single shared password, not individual logins. Fine for personal/hobby use; don't
  treat it as enterprise-grade access control, and don't share the password widely.
- `admin.html` isn't linked from the public pages — it's only reachable if you (or someone) types
  its URL directly.

---

## 4. About the "Upload" feature on images

Every image on the site (driver photos, posters) has a small **⤒ Upload** button that appears
on hover. Clicking it lets you pick a file from your computer and see it in place immediately.

**Important:** this preview is saved only in *your* browser (via `localStorage`), so it's for
checking how an image will look/crop/size before committing to it — **it will not appear for
other visitors**, and it won't survive clearing your browser data. To make an image show up for
everyone:

1. Host the image file somewhere public — easiest option is adding it to the `assets/` folder
   in this same GitHub repo, then using its raw GitHub URL (or any image host you like).
2. Paste that URL into the matching column in your Sheet (`Driver Photo URL` on the Teams tab,
   or `Poster URL` on the Posters tab).

This two-step (local preview → real hosted URL) avoids needing a backend server just to accept
uploads, which a GitHub Pages + Google Sheets site doesn't have.

---

## 5. File structure

```
index.html            Homepage: calendar + teams grid
race.html             Race detail: session-tabbed results + posters
team.html             Team detail: driver roster
standings.html        Driver & Constructor standings (auto-computed from Results)
admin.html            Admin panel: add/edit/delete rows from the site
css/style.css         All styling
js/config.js           ← your Sheet links + settings live here
js/placeholder-data.js   Fallback data used until races/results are connected
js/utils.js            CSV loading, image resolution, upload widget
js/home.js / race.js / team.js / standings.js   Page-specific rendering logic
js/admin.js            Admin panel logic (talks to apps-script/Code.gs)
js/vendor/papaparse.min.js   CSV parser (bundled, no CDN dependency)
apps-script/Code.gs    Paste into Extensions > Apps Script on your Sheet
```
