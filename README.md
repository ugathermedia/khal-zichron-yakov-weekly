# Khal Zichron Yakov Weekly

A purpose-built weekly production tool for Khal Zichron Yakov.

## Goal

Replace the fragile Affinity Data Merge workflow with a small web app that selects a Shabbos/week, reads KZY's ZmanimScreens schedule configuration, combines fixed shul times with validated KosherJava/KosherZmanim astronomical values, allows manual overrides, and exports a finished vector SVG panel for placement as a linked resource in Affinity Publisher.

## Current milestone

The first build establishes the production UI, live KZY API import, editable schedule rows, RTL Hebrew preview, and `KZY-Weekly-Zmanim.svg` export.

Astronomical `AUTO` rows are intentionally **not yet calculated**. They remain visibly marked until the KosherJava-compatible calculation layer is implemented and validated against the official KosherJava map. This avoids silently shipping approximate zmanim.

## Data sources

- KZY schedule/configuration: `https://kzy.zmanimscreens.com/api/data`
- Astronomical engine target: KosherJava / KosherZmanim
- Hebrew calendar/parsha metadata: to be added separately; it is not the astronomical source of truth.

## Affinity workflow target

Place `KZY-Weekly-Zmanim.svg` into Affinity Publisher as a **linked** resource. Each week's export uses the same filename so the placed panel can be updated without Data Merge or backwards-Hebrew text boxes.
