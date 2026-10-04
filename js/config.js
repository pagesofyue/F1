/* =========================================================================
   CONFIG — this is the only file you should need to edit regularly.

   HOW TO CONNECT YOUR GOOGLE SHEET
   ---------------------------------
   Google Sheets can only publish ONE TAB per CSV link. So each tab below
   (Teams, Races, Results) needs its own "Publish to web" link:

     1. Open your Google Sheet.
     2. File > Share > Publish to web.
     3. Under "Link", choose the specific SHEET/TAB (not "Entire Document").
     4. Choose format: Comma-separated values (.csv).
     5. Click Publish, copy the link, paste it below.
     6. Google auto-updates that link whenever you edit the tab — no need
        to re-publish after every edit, only if you rename/delete the tab.

   SEASON currently shown on the site: change SEASON below to switch years.
   ========================================================================= */

const CONFIG = {
  // Shown in the page footer — lets you confirm which version of the files is live.
  BUILD: "2026-10-04-r6",
  SEASON: 2026,

  SHEET_URLS: {
    // Your existing Teams/Drivers tab (already connected)
    teams: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTJjWTxKY3fXIMaw9N27zluzLNFza8NvLd7b0GuizpaEoyFncyeLz1df2bGkWk9aHfyihr0Y4zd_oeS/pub?gid=0&single=true&output=csv",

    // Add a "Races" tab to the same spreadsheet, publish it, paste its link here.
    // Leave as null to keep using placeholder race data.
    races: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTJjWTxKY3fXIMaw9N27zluzLNFza8NvLd7b0GuizpaEoyFncyeLz1df2bGkWk9aHfyihr0Y4zd_oeS/pub?gid=1516945044&single=true&output=csv",

    // Add a "Results" tab to the same spreadsheet, publish it, paste its link here.
    // Leave as null to keep using placeholder results data.
    results: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTJjWTxKY3fXIMaw9N27zluzLNFza8NvLd7b0GuizpaEoyFncyeLz1df2bGkWk9aHfyihr0Y4zd_oeS/pub?gid=328990172&single=true&output=csv",

    // Add a "Posters" tab (Season, Round, Team, Poster URL — one row per team
    // per race). Leave as null to show placeholder tiles on every race page.
    posters: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTJjWTxKY3fXIMaw9N27zluzLNFza8NvLd7b0GuizpaEoyFncyeLz1df2bGkWk9aHfyihr0Y4zd_oeS/pub?gid=92724929&single=true&output=csv",

    // Add a "Highlights" tab (Season, Round, Category, Image URL — one row per
    // category per race: Pole Position / Race Winner / FP1 / FP2 /
    // Sprint Qualifying / Sprint Race). Leave null to hide the section.
    highlights: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTJjWTxKY3fXIMaw9N27zluzLNFza8NvLd7b0GuizpaEoyFncyeLz1df2bGkWk9aHfyihr0Y4zd_oeS/pub?gid=1892055000&single=true&output=csv",

    // Race notes now live in a Google Doc (see README section 3) — no Notes tab needed.

    // Add a "Circuits" tab (Circuit, Circuit Map URL — ONE ROW PER CIRCUIT,
    // not per race). Set up once; every race at that circuit — this year,
    // next year, every year — picks it up automatically by matching the
    // "Circuit" name already in your Races tab. Leave null to hide the map.
    circuits: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTJjWTxKY3fXIMaw9N27zluzLNFza8NvLd7b0GuizpaEoyFncyeLz1df2bGkWk9aHfyihr0Y4zd_oeS/pub?gid=1791155779&single=true&output=csv",
  },

  // Fixed category list for the Highlights tab, in display order.
  // Values in your Highlights tab's "Category" column must match one of
  // these exactly.
  HIGHLIGHT_CATEGORIES: [
    "Pole Position", "Race Winner", "FP1", "FP2", "FP3", "Sprint Qualifying", "Sprint Race",
  ],

  // Teams whose posters should render larger in the poster wall.
  // Must match "Team Name" spelling exactly as it appears in your Teams tab.
  FEATURED_TEAMS: ["Ferrari", "Red Bull", "Racing Bulls"],

  // Canonical order teams appear in across the site (also matches your sheet).
  TEAM_ORDER: [
    "Ferrari", "Red Bull", "Mercedes", "Mclaren", "Racing Bulls",
    "Williams", "Aston Martin", "Haas", "Alpine", "Audi", "Cadillac",
  ],

  // Canonical order + labels for session results on a race page.
  // "Session" values in your Results tab should match one of these keys
  // exactly (case-sensitive) for grouping/sorting to work.
  SESSION_ORDER: [
    { key: "FP1", label: "Free Practice 1" },
    { key: "FP2", label: "Free Practice 2" },
    { key: "FP3", label: "Free Practice 3" },
    { key: "Sprint Qualifying", label: "Sprint Qualifying" },
    { key: "Sprint", label: "Sprint" },
    { key: "Qualifying", label: "Qualifying" },
    { key: "Race", label: "Race" },
  ],

  /* =======================================================================
     ADMIN PANEL (admin.html)
     ------------------------
     Lets you add/edit/delete rows from the site itself instead of the
     spreadsheet directly. Requires a small Google Apps Script "Web app"
     deployed on your Sheet — see apps-script/Code.gs and README.md
     section 5 for the full one-time setup.
     ======================================================================= */
  ADMIN: {
    // Paste the Web app URL you get after deploying apps-script/Code.gs.
    // Leave null and admin.html will show setup instructions instead.
    APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwRBaU3bIHnHT753CBzsWFAUzdg5G6sjLPaDVrn_4LCUhZwJYLGQjQTWzEdoyWgnl9V/exec",

    // Map each logical tab to the EXACT sheet/tab name in your spreadsheet
    // (case-sensitive). Change the right-hand side if your tab is named
    // differently — e.g. if your Teams tab is still called "Sheet1".
    SHEET_NAMES: {
      teams: "Teams",
      races: "Races",
      results: "Results",
      posters: "Posters",
      highlights: "Highlights",
      circuits: "Circuits",
    },
  },

  // Team colors used for accents (edit freely — cosmetic only).
  TEAM_COLORS: {
    "Ferrari": "#E8002D",
    "Red Bull": "#3671C6",
    "Mercedes": "#27F4D2",
    "Mclaren": "#FF8000",
    "Racing Bulls": "#6C98FF",
    "Williams": "#00A0DE",
    "Aston Martin": "#00665E",
    "Haas": "#B6BABD",
    "Alpine": "#00A1E8",
    "Audi": "#BB0A30",
    "Cadillac": "#C6A664",
  },
};
