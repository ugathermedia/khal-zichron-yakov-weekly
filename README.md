# Khal Zichron Yakov Weekly

A purpose-built weekly production tool for Khal Zichron Yakov.

## Goal

Produce the complete weekly Letter-sized sheet in the browser. Select a Shabbos/week, review the existing KZY schedule and KosherZmanim values, add announcements, then print or save as PDF. The SVG panel remains available for Affinity.

## Current milestone

The weekly preview uses `assets/weekly-zmanim-background.png` as locked stationery with live announcement and schedule columns. Existing calculations, overrides and hidden-row rules feed the sheet directly. The provided artwork is 1582 × 2048; an original 2550 × 3300 PNG can replace it without changing calculation code.

Announcements support title, subtitle, multiline body, visibility and ordering. They and the optional sheet/parsha title are saved per selected Friday in localStorage. Copying the previous week and restoring JSON backups append announcements, preserving existing work. These drafts do not sync between browsers. Replacement backgrounds are stored in IndexedDB in the current browser; the repository artwork is the default for all visitors.

The top-right slate header carries the automatic Hebrew parsha in large white Heebo, Mevorchim when appropriate, and Hebrew/English dates. The editable title is an optional override. Body rows combine both Sof Zman Krias Shema opinions; vacant fixed Shiur slots are omitted while timed morning and afternoon shiurim remain. Weekdays use English day ranges, a “Week of” Sunday heading, Rosh Chodesh explanations with changed 6:30 times emphasized, and a single Maariv row including shkiah.

Sunday Shacharis has a Neitz limit: use the later of the regular/Rosh Chodesh start and sea-level Neitz minus 22 minutes. Round that earliest start upward to a whole minute so Shemone Esrei after 22 minutes cannot precede Neitz. The limit also applies to custom Sunday start times. Other weekdays retain their ordinary/Rosh Chodesh times. Neitz-adjusted starts are emphasized on the sheet and explained in the weekday editor; a Sunday can therefore split from otherwise matching weekday rows.

An additional seasonal Neitz minyan qualifies when the calculated Neitz-minus-22 start is at least five minutes after an earlier scheduled minyan. With the ordinary 6:45 start, this means 6:50 or later; with Rosh Chodesh's 6:30, it means 6:35 or later. Once qualified, the exact Neitz-minus-22 time is rounded to the nearest five minutes (halfway rounds later), and the rounded start must remain at least five minutes from every other minyan. The ordinary 6:45 (or Rosh Chodesh 6:30) remains. A Sunday minyan already shifted to Neitz is not duplicated. Added seasonal starts are bold and labeled on the sheet; consecutive days with matching rounded schedules and explanations are bundled.

Neitz times carry an asterisk, including Sunday's Neitz-adjusted start. A single “*Seasonal Neitz Minyan” footnote follows all Shacharis days, before Mincha; it appears only when a marked minyan is present. Rosh Chodesh explanations remain beside the relevant days. The same markers and footnote appear in the weekly sheet, schedule panel and SVG export; underlying time values stay unchanged.

Monday October 12, '26 is a confirmed exception to the automatic legal-holiday 8:45 minyan. Its default Shacharis schedule is 6:30, seasonal Neitz rounded to 6:45, and 7:30 for Rosh Chodesh; manual day overrides remain available.

`calendar-data.json` contains Diaspora parsha, Mevorchim and Rosh Chodesh labels for 2026–2028, provided by [Hebcal](https://www.hebcal.com/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). `calendar.js` shares this data with the weekday planner and requests other date ranges from Hebcal's API. It never supplies astronomical times. Heebo regular/bold font files are served locally; their SIL Open Font License is included in `assets/fonts/OFL.txt`.

Print / Save PDF waits for fonts and artwork, verifies that both columns fit, and prints only a US Letter sheet. Font sizes shrink within bounded readable sizes; excessive content blocks the print button. Use Letter, 100% scale and disable browser headers/footers. Physical printer margins may trim the full-bleed artwork. Column coordinates and typography are in `weekly-sheet.css`.

The KosherZmanim/KosherJava-compatible calculation layer is active and calibrated for KZY's saved location. Weekly rules include seasonal Shabbos Mincha/shiur timing, weekday Shacharis adjustments, Rosh Chodesh and U.S. legal-holiday handling, and later-weekday Mincha calculated at a minimum 13 minutes before shkiah rounded down to the prior :05. The completed Succos 5787 planner is retained in the codebase but only appears when a Succos week is selected.

## Data sources

- KZY schedule/configuration: `https://kzy.zmanimscreens.com/api/data`
- Astronomical engine target: KosherJava / KosherZmanim
- Hebrew calendar/parsha metadata: to be added separately; it is not the astronomical source of truth.

## Affinity workflow target

Place `KZY-Weekly-Zmanim.svg` into Affinity Publisher as a **linked** resource. Each week's export uses the same filename so the placed panel can be updated without Data Merge or backwards-Hebrew text boxes.
