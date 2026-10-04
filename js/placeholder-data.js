/* =========================================================================
   PLACEHOLDER DATA
   -----------------
   Used automatically whenever CONFIG.SHEET_URLS.races / .results is null.
   Replace by adding "Races" and "Results" tabs to your Google Sheet using
   the exact column headers shown in README.md, then pasting the published
   CSV links into js/config.js. This file will then be ignored.
   ========================================================================= */

const PLACEHOLDER_RACES = [
  { Season: 2026, Round: 1, "Race Name": "Australian Grand Prix", Country: "Australia", Circuit: "Albert Park Circuit", "Start Date": "2026-03-06", "End Date": "2026-03-08", Status: "Upcoming", "Sprint Weekend": "No" },
  { Season: 2026, Round: 2, "Race Name": "Chinese Grand Prix", Country: "China", Circuit: "Shanghai International Circuit", "Start Date": "2026-03-13", "End Date": "2026-03-15", Status: "Upcoming", "Sprint Weekend": "Yes" },
  { Season: 2026, Round: 3, "Race Name": "Japanese Grand Prix", Country: "Japan", Circuit: "Suzuka International Racing Course", "Start Date": "2026-03-27", "End Date": "2026-03-29", Status: "Upcoming" },
  { Season: 2026, Round: 4, "Race Name": "Bahrain Grand Prix", Country: "Bahrain", Circuit: "Bahrain International Circuit", "Start Date": "2026-04-10", "End Date": "2026-04-12", Status: "Upcoming" },
  { Season: 2026, Round: 5, "Race Name": "Saudi Arabian Grand Prix", Country: "Saudi Arabia", Circuit: "Jeddah Corniche Circuit", "Start Date": "2026-04-17", "End Date": "2026-04-19", Status: "Upcoming" },
  { Season: 2026, Round: 6, "Race Name": "Miami Grand Prix", Country: "United States", Circuit: "Miami International Autodrome", "Start Date": "2026-05-01", "End Date": "2026-05-03", Status: "Upcoming" },
  { Season: 2026, Round: 7, "Race Name": "Canadian Grand Prix", Country: "Canada", Circuit: "Circuit Gilles Villeneuve", "Start Date": "2026-05-22", "End Date": "2026-05-24", Status: "Upcoming" },
  { Season: 2026, Round: 8, "Race Name": "Monaco Grand Prix", Country: "Monaco", Circuit: "Circuit de Monaco", "Start Date": "2026-06-05", "End Date": "2026-06-07", Status: "Upcoming" },
];

const PLACEHOLDER_RESULTS = [
  // Round 1 — sample rows so the race page renders every session type once.
  { Season: 2026, Round: 1, Session: "FP1", Position: 1, "Driver No.": 16, Driver: "Charles Leclerc", Team: "Ferrari", Points: "" },
  { Season: 2026, Round: 1, Session: "FP1", Position: 2, "Driver No.": 3, Driver: "Max Verstappen", Team: "Red Bull", Points: "" },
  { Season: 2026, Round: 1, Session: "FP2", Position: 1, "Driver No.": 1, Driver: "Lando Norris", Team: "Mclaren", Points: "" },
  { Season: 2026, Round: 1, Session: "Qualifying", Position: 1, "Driver No.": 16, Driver: "Charles Leclerc", Team: "Ferrari", Points: "" },
  { Season: 2026, Round: 1, Session: "Qualifying", Position: 2, "Driver No.": 3, Driver: "Max Verstappen", Team: "Red Bull", Points: "" },
  { Season: 2026, Round: 1, Session: "Race", Position: 1, "Driver No.": 16, Driver: "Charles Leclerc", Team: "Ferrari", Points: 25 },
  { Season: 2026, Round: 1, Session: "Race", Position: 2, "Driver No.": 3, Driver: "Max Verstappen", Team: "Red Bull", Points: 18 },
  { Season: 2026, Round: 1, Session: "Race", Position: 3, "Driver No.": 1, Driver: "Lando Norris", Team: "Mclaren", Points: 15 },
];

const IS_PLACEHOLDER = {
  races: !CONFIG.SHEET_URLS.races,
  results: !CONFIG.SHEET_URLS.results,
};
