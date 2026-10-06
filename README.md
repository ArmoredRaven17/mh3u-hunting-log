# MH3U Hunting Log

A logbook for **Monster Hunter 3 Ultimate**. Pick a quest, record what you were after, what you
wore, who came along and how it went, and build up a running record of your hunts. A port of the
[MHGU Hunting Log](https://github.com/ArmoredRaven17/MHGU-Hunting-Log), with its quest data read
from the game itself.

```
Quest: Port 7★ / Infernal Overlord / Stygian Zinogre
Locale: Tundra
Objective: Farming Stygian Zinogre Horns.
Armor Used: Lagiacrus
Weapon: Hidden Saber
Hunting Party: Raven, TJ
Carts: 0
```

That's what **Copy Selected** produces, ready to paste into Discord.

## Features

- **Quest browser** — all 342 quests on the cartridge (122 Village, 208 Port, 12 Arena, the 22
  Urgent Quests among them), grouped by board and star in the game's own order, searchable by
  name, monster or locale. Picking one fills in its locale and shows its objective, time limit,
  fee, reward and client.
- **Per-entry fields** — date, locale, your own objective, armor, weapon (with a class picker
  that supplies the game's class icon and every weapon name as autocomplete), a party of up to
  four, carts, outcome, clear time and notes.
- **Farming** and **Timestamp** switches, autosave, `.json` save files, and the MH3U monster-icon
  themes shared with the other MH3U apps — all as in the GU log.

Downloadable Event and Challenge Quests aren't on the cartridge, so they aren't listed.

## Where the data comes from

[scripts/build_data.py](scripts/build_data.py) reads a local extract of a personally owned copy of
the game: the quest files (`romfs/quest/us/q_NNNNN.quest` — names, objectives, star, map, monsters,
objective records, money), the English message files (monster, item, weapon and locale names), and
two tables in the executable (each monster's icon cell, and the quest order). The script's header
documents every field and the game-code address that reads it. Star, board and Urgent status were
cross-checked against Kiranico's MH3U quest list (all 329 Village/Port quests agree); no data is
taken from it.

**Urgent and Key quests** come from the game's own unlock rule. Each quest file says which
groups of quests it requires and how many clears it needs, and the game's code counts clears per
board. An Urgent shows which quests open it ("2 of" these five, or "all of" these), and a Key
quest shows which Urgent it opens.

## Running it

No build step for the app. Open `docs/index.html`, or serve `docs/`:

```
python -m http.server 5581 --directory docs
```

## Regenerating data

Needs the extract laid out like `C:\MH3U-Extract` (romfs unpacked, arcs extracted, `code.bin`
decompressed), Python 3.10+, Pillow and numpy:

```
python scripts/build_data.py "C:\MH3U-Extract"
```

This rewrites `docs/data.js`, `docs/assets/MonsterIcons/` and `docs/assets/WeaponIcons/`.

## Cache busting

GitHub Pages caches assets by full URL. When you change `styles.css`, `app.js` or `data.js`, bump
the `?v=N` query string on its tag in `docs/index.html`.

## AI assistance

Most of this project — the port, the quest decode and this README — was written with
[Claude Code](https://claude.com/claude-code), Anthropic's AI coding tool, working from the author's
direction and reviewed before landing.

## Licensing

Code is MIT (see [LICENSE](LICENSE)). Game data and icons are Capcom's — see [NOTICE.md](NOTICE.md).
Monster Hunter 3 Ultimate is © Capcom Co., Ltd.; this is an unofficial fan project.
