# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A static single-page web app: a hunting logbook for Monster Hunter 3 Ultimate, ported from the
[MHGU Hunting Log](../MHGU%20Hunting%20Log) (`C:\Coding Repos\MHGU Hunting Log`). The user picks a
quest and records what they were after, what they wore, who came along and how it went; entries
accumulate into a running log they can copy out as plain text.

No build step for the app, no framework, no modules. `docs/app.js` is one IIFE, `docs/styles.css`
is hand-written, `docs/data.js` is generated.

GitHub Pages serves `docs/` through the "Deploy Pages" Actions workflow on push to `master`, like
the other MH3U apps.

## Relationship to the GU Hunting Log

A port, not a fork that tracks it. The editor, logbook, farming/timestamp modes, drafts, save
files and copy format are the GU app's, and its CLAUDE.md explains the reasoning behind each
(resetEditor vs exitEditMode, the dirty gate, why Locale survives a quest switch, the clear-time
mask). What changed for 3U:

- **Quest data** comes from the game via `scripts/build_data.py`, not the Randomizer's JSON.
- **Quest key** is `"q" + Id`, the game's own quest number. Names repeat across boards and
  stars, so `Type//Name` (the GU key) is not unique here.
- **Icons** are cut from the game's atlas by the build script; `q.Icon` names the quest's icon,
  so the app no longer derives one from the objective text.
- **Locales** are already full names (the game's text), so `localeFull` is the identity.
- No Hyper, Prowler, Special Permits or Pub/Hub split. Urgent and Key pills come from the game's
  own unlock fields (see Data), not from Kiranico.
- Storage keys are `mh3u-log-*`; save files are `{ app: "mh3u-hunting-log", version: 1, entries }`.
- The theme palette and LEGACY_HEX are the MH3U apps' shared copy (same hexes as the MHGU family).

## Data

`python scripts/build_data.py "C:\MH3U-Extract"` rewrites `docs/data.js`
(`window.MH3U_LOG_DATA = { quests, weapons, weaponIcons, icons }`) and the icon folders. The script
header documents the quest file layout and the executable tables it reads. Findings worth knowing:

- `romfs/quest/us/q_NNNNN.quest` are the real quests. Numbers below 1000 are dev stubs
  ("Moga Quest 1") and are skipped. 0xxxx Village, 1xxxx Port, 6xxxx Arena; x2xxx are Urgent.
- 2906 repeats Urgent 2902 (as 1814/1913 repeat 2801/2901); only the first copy keeps Urgent.
- Targets come from the objective records; "Hunt all large monsters" adds every large-monster
  record. The large-monster records also hold intruders (Lagiacrus in the 1★ Monster Guts
  delivery), which is why they are not used as targets directly.
- Unlocks ARE decoded (header of `build_data.py`, "UNLOCKS"): tail `+0x1a9` u64 = groups a
  quest requires, `+0x1b1` u64 = groups its clear counts toward, `+0x1b9` u8 = clears needed.
  The game recounts per board (Village 1000-10999, Port 11000-12899) and shows a quest once the
  counts over its required groups reach the number. `Key` / `KeyFor` / `Unlock` are derived from
  that. They match 63 of Kiranico's 65 Key badges. The differences are explained in the header,
  so don't "fix" them toward Kiranico.
- The count is for the board you're standing on: the arrival handlers set the mode byte (Port 1,
  Moga 0) and rebuild the boards. 15 quests the count can't open (1508-1514, 1712, 1810, 1903,
  1904, 1907, 1908, 2904, 11510, 11511) are added directly by story flags (`EVENT_QUESTS`, read
  from 0x635e54). That's documented only. The app labels Urgents and Keys, and Raven doesn't
  need it to explain how other quests unlock.
- A real Wii U save (AHDP08 `user1`) has its quest clear bits at file offset 0x6e9c, big-endian
  words, indexed by the 0xc43370 order. The unlock counters are not saved; the game rebuilds them.

## Critical: cache busting

Bump the `?v=N` on `styles.css`, `app.js` or `data.js` in `docs/index.html` whenever that file
changes.

## Conventions

All user text goes into the DOM via `textContent`/`.value` through `el()` — never `innerHTML`.
An entry's `quest` snapshot is read back from save files as untrusted shape (`questTargets`
guards it).
