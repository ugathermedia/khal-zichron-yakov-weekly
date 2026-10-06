# Khal Zichron Yakov Weekly

A purpose-built weekly production tool for Khal Zichron Yakov.

## Goal

Replace the fragile Affinity Data Merge workflow with a small web app that selects a Shabbos/week, reads KZY's ZmanimScreens schedule configuration, combines fixed shul times with validated KosherJava/KosherZmanim astronomical values, allows manual overrides, and exports a finished vector SVG panel for placement as a linked resource in Affinity Publisher.

## Current milestone

The app is now in regular weekly production mode. Choose the Friday/week, confirm the seasonal and special-Shabbos settings, review weekday adjustments, then update or export `KZY-Weekly-Zmanim.svg` for Affinity Publisher.

The KosherZmanim/KosherJava-compatible calculation layer is active and calibrated for KZY's saved location. Weekly rules include seasonal Shabbos Mincha/shiur timing, weekday Shacharis adjustments, Rosh Chodesh and U.S. legal-holiday handling, and later-weekday Mincha calculated at a minimum 13 minutes before shkiah rounded down to the prior :05. The completed Succos 5787 planner is retained in the codebase but only appears when a Succos week is selected.

## Data sources

- KZY schedule/configuration: `https://kzy.zmanimscreens.com/api/data`
- Astronomical engine target: KosherJava / KosherZmanim
- Hebrew calendar/parsha metadata: to be added separately; it is not the astronomical source of truth.

## Affinity workflow target

Place `KZY-Weekly-Zmanim.svg` into Affinity Publisher as a **linked** resource. Each week's export uses the same filename so the placed panel can be updated without Data Merge or backwards-Hebrew text boxes.
