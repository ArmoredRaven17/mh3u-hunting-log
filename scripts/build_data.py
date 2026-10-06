r"""Build the hunting log's quest data and icons from a local MH3U extract.

    python scripts/build_data.py [C:\MH3U-Extract]

Reads only the game itself and writes:

    docs/data.js                          window.MH3U_LOG_DATA = { quests, weapons, icons }
    docs/assets/MonsterIcons/MH3U-*.png   the game's monster and quest-type icons
    docs/assets/WeaponIcons/icon_*.png    the game's weapon-class icons

Sources, all in the extract:

  romfs/quest/us/q_NNNNN.quest   one file per quest (the cartridge's own; DLC quests are not on it).
      'QTDS', u32 language count (5), then length-prefixed UTF-8 strings, five languages each:
        name x5, u16 quest number, main objective x5, u8 star, u8 map, sub objective x5,
        u16 time limit (minutes), failure condition x5, 6 bytes, client x5, description x5,
      then a binary tail (442 bytes; the Arena quests append their loaner equipment). In the tail:
        +0x00  u8 x2         the quest's small monsters
        +0x0a  11 bytes x5   large monsters present: u16 monster number, ..., u8 count at +3
        +0x147 u32 x4        contract fee, reward, reward lost per faint, HRP
        +0x18f u32, u16      objective header; the u16 joins the records (0 one, 1 AND, 2 OR)
        +0x195 8 bytes x2    objective records: u8 kind, u8 flags, u16, u16 target, u16 count
               kind 0x01 hunt/slay, 0x81 capture, 0x02 deliver (target = item number),
               0x04 repel, 0x14/0x15 slay or repel
        +0x1a9 u64           unlock groups required   } the quest's unlock condition; see
        +0x1b1 u64           unlock groups it counts  } UNLOCKS below
        +0x1b9 u8            clears required
      Star and map were checked against Kiranico's quest list: all 329 Village and Port quests
      land on the same star (only its capitalisation of a few names differs; the game's is used).
  Monster_eng.gmd    monster names by monster number.
  Item00_eng.gmd     item names by item number (delivery targets).
  exefs/code.decompressed.bin
      0xb91572  u16 icon cell per monster number, 86 entries. READ 0x51b380: cell -> atlas
                (cell % 9 * 54, cell / 9 * 54) in td_icon_m_ID_eng.tex. Numbers 86-94 continue the
                table onto the atlas's quest-type cells 72-80.
      0xc43370  u16 quest numbers, 0xffff-terminated. READ 0x9988d0: quest number -> index, which
                0x9988a0 uses as the quest's clear bit in the save. The quests' board order.

UNLOCKS -- what makes a quest, and in particular an Urgent Quest, appear. All READ:
  The serializer 0x15c140 puts the three tail fields at quest +0x798 / +0x7a0 / +0x7a8.
  0x624080 zeroes 64 byte counters in the save (+0x81c2), then 0x6240a8-0x6241f4 walks every
  quest: if it is cleared (0x99b62c) and on the current board, each bit k of its +0x7a0 mask
  adds 1 to counter k. "Current board" is a quest-number range from the table at 0xbeae98:
  1000-10999 in the Village, 11000-12899 at the Port (picked by the mode byte read at 0x58e194),
  so the two boards keep separate counts. 0x6282d4 then fills a few counters from other state
  (56 = an HR tier, 57/60/62 = hunting milestones), which gate Port 8* quests.
  0x624340 then sums the counters over the bits of a quest's +0x798 mask and shows the quest
  only if the sum >= its +0x7a8 count (bits 1 and 2 of +0x798 are also tested as flags).
  So an Urgent's unlock pool is the same-board quests sharing a bit with its +0x798 mask, and
  it needs `count` of them cleared. A quest is KEY when the Urgent cannot appear without it:
  the pool (only quests at or below the Urgent's star, which exist by then) is no bigger than
  the count, applied again to each key quest's own unlock. That reproduces 63 of Kiranico's 65
  Key badges; it adds 11706, 11708 and 11718 (prerequisites of the 7* Urgent's pool, which
  Kiranico marks elsewhere, e.g. 1101 and 1205) and does not mark 1508 and 1509, which no Urgent
  depends on in the data.
  The mode byte [0xc3b978]+0x41 is written only by the two arrival handlers, 0x8718e8 (writes
  1, then sets up stage 0x1b, the Port) and 0x93acfc (writes 0, stage 0x1a, Moga Village), each
  followed by the board rebuild 0x623ec8: the counts are those of the board you stand on.
  EVENT QUESTS: some quests never pass the gate -- their groups are fed only from the other
  board, or (1903/1904/1907/1908) they need 1 from no group at all -- yet a real save has them all
  cleared. 0x635e54 adds them to the boards directly (0x629aac) once story flags are set (flag =
  bit of save +0x5e46, read by 0x99889c; conditions 0x5e0214(n) = every flag in the list at
  [0xbffdb8 + 4n]). EVENT_QUESTS below is that function's table. Which story event sets each flag
  is not traced (the event table at 0xb019c0 links quest clears to events). Kept as notes only:
  the log labels Urgents and Keys, and doesn't show how other quests unlock.

Locale names are the game's own text: the five hunting grounds the Guild Card names
(CardEdit 21-26), "Great Desert" (CardEdit 116), and the quest-info map labels (QuestMap) for the
arenas and the one-off maps, which the game never spells out further.

Needs: Python 3.10+, Pillow, numpy; pica_tex.py from the extract decodes the icon atlases.
"""
import json, os, re, struct, sys

EXTRACT = sys.argv[1] if len(sys.argv) > 1 else r'C:\MH3U-Extract'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, 'docs')
sys.path.insert(0, EXTRACT)

CODE = open(os.path.join(EXTRACT, 'exefs', 'code.decompressed.bin'), 'rb').read()
BASE = 0x100000
QUEST_DIR = os.path.join(EXTRACT, 'romfs', 'quest', 'us')
FONT = os.path.join(EXTRACT, 'arcx', 'arc', 'ID', 'ID_lb_eng', 'GUI', 'font')
MONSTER_TEX = os.path.join(EXTRACT, 'arcx', 'arc', 'ID', 'ID_com_eng', 'GUI', 'Texture', 'common', 'td_icon_m_ID_eng.tex')
ITEM_TEX = os.path.join(EXTRACT, 'arcx', 'arc', 'ID', 'ID_lb_eng', 'GUI', 'Texture', 'common', 'td_icon_ID.tex')

ICON_CELL = 0xb91572      # u16 per monster number (see above)
ICON_CELLS = 95           # 0-85 monsters, 86-94 the quest-type cells
QUEST_ORDER = 0xc43370
ICON_BY_TYPE = 0xb9154e   # READ 0x51d6cc: u8 item-icon index per item type; 22 px cells, 10 per row


def gmd(path):
    """GMD v0x010201 message table -> list of strings (index = message id)."""
    b = open(path, 'rb').read()
    nlab, nstr, labsz, strsz, namelen = struct.unpack_from('<5I', b, 12)
    o = 0x20 + namelen + 1 + 8 * nlab + labsz
    return [s.decode('utf-8', 'replace') for s in b[o:o + strsz].split(b'\0')[:nstr]]


def font(name):
    for dp, _, fns in os.walk(os.path.join(EXTRACT, 'arcx', 'arc', 'ID')):
        if name + '_eng.gmd' in fns and '_eng' in dp:
            return gmd(os.path.join(dp, name + '_eng.gmd'))
    raise FileNotFoundError(name)


MONSTERS = font('Monster')
ITEMS = font('Item00')
MENU = font('Menu')
CARD = font('CardEdit')
QMAP = font('QuestMap')

# map number -> locale (index = the u8 after the main objective)
LOCALES = {1: CARD[21], 2: CARD[22], 3: CARD[23], 4: CARD[25], 5: CARD[26], 13: CARD[24],
           6: re.search(r'(Great Desert)', CARD[116]).group(1)}
for m in (7, 8, 9, 10, 11, 12, 14, 15):
    LOCALES[m] = QMAP[m]

# Quest-type cells 72-80, named for what they show. Which quest the game puts each on is not
# read; the log picks one for delivery quests by the item delivered (quest_icon below).
QUEST_ICONS = {72: 'Chest', 73: 'Cloth', 74: 'Mushroom', 75: 'Bone', 76: 'Fish', 77: 'Ore', 78: 'Egg', 80: 'Scroll'}

# Weapon classes in the GU log's order: (class, slug, weapon-name message file). Label = Menu 236 + class.
CLASSES = [
    (0, 'great_sword', 'Lsword'), (7, 'long_sword', 'Lsword2'), (1, 'sword_and_shield', 'Sword'),
    (11, 'dual_blades', 'WSword'), (2, 'hammer', 'Hammer'), (12, 'hunting_horn', 'Pipe'),
    (3, 'lance', 'Lance'), (9, 'gunlance', 'Gunlance'), (8, 'switch_axe', 'Axe'),
    (6, 'light_bowgun', 'Lbg'), (4, 'heavy_bowgun', 'Hbg'), (10, 'bow', 'Bow'),
]


def u16(va): return struct.unpack_from('<H', CODE, va - BASE)[0]


def strings(b, o):
    out = []
    for _ in range(5):
        n = struct.unpack_from('<I', b, o)[0]
        out.append(b[o + 4:o + 4 + n].decode('utf-8'))
        o += 4 + n
    return out[0], o


def one_line(s):
    return re.sub(r'\s+', ' ', s).strip()


def read_quest(path):
    b = open(path, 'rb').read()
    assert b[:4] == b'QTDS' and struct.unpack_from('<I', b, 4)[0] == 5, path
    name, o = strings(b, 8)
    qid = struct.unpack_from('<H', b, o)[0]
    main, o = strings(b, o + 2)
    star, mapno = b[o], b[o + 1]
    _, o = strings(b, o + 2)                       # sub objective (empty on every quest)
    minutes = struct.unpack_from('<H', b, o)[0]
    _, o = strings(b, o + 2)                       # failure condition
    client, o = strings(b, o + 6)
    _, o = strings(b, o)                           # description
    t = b[o:]
    large = []
    for k in range(5):
        r = t[0x0a + 11 * k:0x15 + 11 * k]
        em = r[0] | r[1] << 8
        if em:
            large.append(em)
    fee, reward, _, hrp = struct.unpack_from('<4I', t, 0x147)
    need_mask, count_mask = struct.unpack_from('<QQ', t, 0x1a9)
    objs = []
    for k in range(2):
        kind, flags, _, target, count = struct.unpack_from('<BBHHH', t, 0x195 + 8 * k)
        if kind:
            objs.append((kind, target, count))
    return dict(id=qid, name=one_line(name), main=one_line(main), star=star, map=mapno,
                minutes=minutes, client=one_line(client), large=large, objs=objs, fee=fee, reward=reward, hrp=hrp,
                need_mask=need_mask, count_mask=count_mask, need=t[0x1b9])


def category(qid):
    """Quest number ranges: 0xxxx Village, 1xxxx Port, 6xxxx Arena; x2xxx are the Urgent Quests
    (Kiranico's Urgent badges fall on exactly those). The CardEdit unlock text names the boards:
    'all N★ Village Quests' (1-9), 'all N★ Port Quests' (1-8), 'Arena Quests'."""
    if qid >= 60000:
        return 'Arena', False
    return ('Port' if qid >= 10000 else 'Village'), (qid // 1000) % 10 == 2


def monster_name(em, main):
    """Sharq are monster number 32, which the game's monster list calls just "Fish"; the
    objective names them ("Slay 30 Sharq"), so take the name from there."""
    m = re.match(r'Slay \d+ (.+)$', main)
    return m.group(1) if MONSTERS[em] == 'Fish' and m else MONSTERS[em]


# READ 0x635e54: story flag(s) -> quests added to the boards directly, bypassing the gate.
EVENT_QUESTS = {
    1712: 0x4c, 11510: 0x4c,                 # flag 0x4c: the Jhen Mohran quests, Village and Port
    1810: 0x50, 2904: 0x59, 11511: 0x17c,
    1903: 0x54, 1904: 0x54, 1907: 0x54, 1908: 0x54,          # condition 0x28 = flag 0x54
    1508: 0x2a, 1509: 0x2a, 1510: 0x2a,                      # condition 0x18 = flag 0x2a
    1511: (0x2d, 0x2e), 1512: (0x2d, 0x2e), 1514: (0x2d, 0x2e),   # condition 0x1a = flags 0x2d, 0x2e
}


def delivery_icon(item):
    n = item.lower()
    if 'mushroom' in n: return 'Mushroom'
    if 'fish' in n: return 'Fish'
    if 'egg' in n: return 'Egg'
    if 'stone' in n or 'ore' in n: return 'Ore'
    if 'ticket' in n: return 'Chest'               # Harvest Tours: survive, or hand in a Paw Pass Ticket
    return 'Bone'                                  # monster parts: guts, horns, bones, oils, antlers


def main():
    order = {}
    va = QUEST_ORDER
    while u16(va) != 0xffff:
        order.setdefault(u16(va), len(order))
        va += 2
    cells = [u16(ICON_CELL + 2 * i) for i in range(ICON_CELLS)]

    raw = []
    for fn in sorted(os.listdir(QUEST_DIR)):
        if fn.endswith('.quest'):
            q = read_quest(os.path.join(QUEST_DIR, fn))
            if q['id'] >= 1000:                    # below are the dev stubs ("Moga Quest 1", "Tutorial 1")
                raw.append(q)
    large_ems = {em for q in raw for em in q['large']}

    quests, used_icons, missing = [], set(), []
    for q in sorted(raw, key=lambda q: (order.get(q['id'], 1 << 20), q['id'])):
        if q['id'] not in order:
            missing.append(q['id'])
        typ, urgent = category(q['id'])
        obj_mons = [monster_name(t, q['main']) for k, t, _ in q['objs'] if k != 0x02 and t < 86]
        targets = list(obj_mons)
        if 'all large monsters' in q['main']:
            targets += [MONSTERS[em] for em in q['large']]
        targets = list(dict.fromkeys(targets))
        delivered = [ITEMS[t] for k, t, _ in q['objs'] if k == 0x02]
        if obj_mons:
            icon = MONSTERS[next(t for k, t, _ in q['objs'] if k != 0x02 and t < 86)]
        elif targets:
            icon = targets[0]
        elif delivered:
            icon = delivery_icon(delivered[0]) + '_Quest'
        else:
            icon = 'Scroll_Quest'
        used_icons.add(icon)
        kinds = {k for k, _, _ in q['objs']}
        target_ems = [t for k, t, _ in q['objs'] if k != 0x02 and t < 86]
        quests.append({
            'Id': q['id'], 'Type': typ, 'Level': q['star'], 'Name': q['name'], 'Main': q['main'],
            'Locale': LOCALES.get(q['map'], ''), 'Monsters': targets, 'Icon': icon,
            'Urgent': urgent,
            'Capture': 0x81 in kinds,
            'Repel': bool(kinds & {0x04, 0x14, 0x15}),
            'LgMonster': any(em in large_ems for em in target_ems) or 'all large monsters' in q['main'],
            'SmMonsters': any(em not in large_ems for em in target_ems),
            'Delivery': any(d != 'Paw Pass Ticket' for d in delivered),
            'Harvest': 'Paw Pass Ticket' in delivered,
            'Minutes': q['minutes'], 'Fee': q['fee'], 'Reward': q['reward'], 'HRP': q['hrp'],
            'Client': q['client'],
        })
    # 2906 repeats Urgent 2902 word for word, and sits in the order table's later block beside
    # 1814 and 1913, the repeatable copies of Urgents 2801 and 2901. Only the first copy of a quest
    # is the Urgent one (Kiranico lists the pair once, as Urgent).
    seen = set()
    for q in quests:
        sig = (q['Type'], q['Name'], q['Main'])
        if sig in seen:
            q['Urgent'] = False
        seen.add(sig)
    add_unlocks(quests, {q['id']: q for q in raw})
    if missing:
        print('WARNING: not in the quest order table, sorted last:', missing)
    unknown_maps = sorted({q['Name'] for q in quests if not q['Locale']})
    if unknown_maps:
        print('WARNING: no locale for', unknown_maps)

    icons = write_monster_icons(cells)
    for name in sorted(used_icons - set(icons)):
        print('WARNING: no icon file for', name)

    weapons = {}
    for cls, slug, msg in CLASSES:
        names = [n for n in gmd(os.path.join(FONT, msg + '_eng.gmd'))[1:]
                 if n and not n.startswith('DUMMY') and n != '(None)']
        weapons[MENU[236 + cls]] = list(dict.fromkeys(names))
    write_weapon_icons()

    data = {'quests': quests, 'weapons': weapons, 'weaponIcons': {MENU[236 + c]: s for c, s, _ in CLASSES},
            'icons': sorted(n.replace(' ', '_') for n in icons)}
    with open(os.path.join(DOCS, 'data.js'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('// Generated by scripts/build_data.py from the game itself. Do not edit by hand.\n')
        fh.write('window.MH3U_LOG_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    from collections import Counter
    print(len(quests), 'quests', dict(Counter((q['Type'], q['Urgent']) for q in quests)),
          sum(len(v) for v in weapons.values()), 'weapon names,', len(icons), 'icons')


def add_unlocks(quests, raw):
    """Urgent Quests get Unlock = {Need, From: [quest numbers]}; quests an Urgent cannot appear
    without get Key = True and KeyFor = [Urgent numbers]. See UNLOCKS in the header."""
    info = {q['Id']: q for q in quests}
    port = lambda i: i >= 10000

    def pool(u):
        r = raw[u]
        return [i for i in info if i != u and raw[i]['count_mask'] & r['need_mask'] and port(i) == port(u)
                and info[i]['Level'] <= info[u]['Level'] and info[i]['Type'] == info[u]['Type']]

    def mandatory(u):
        p = pool(u)
        return p if raw[u]['need'] and len(p) <= raw[u]['need'] else []

    def walk(u, root, seen):
        for m in mandatory(u):
            if m in seen:
                continue
            seen.add(m)
            if not info[m]['Urgent']:
                info[m]['Key'] = True
                info[m].setdefault('KeyFor', []).append(root)
                walk(m, root, seen)

    for q in quests:
        q['Key'] = False
    for q in quests:
        if q['Urgent']:
            p = pool(q['Id'])
            if p:
                q['Unlock'] = {'Need': raw[q['Id']]['need'], 'From': p}
            walk(q['Id'], q['Id'], set())
    print(sum(q['Key'] for q in quests), 'key quests;',
          'Urgents with no unlock pool:', [q['Id'] for q in quests if q['Urgent'] and 'Unlock' not in q])


def square(cell):
    """Trim to the drawn pixels, then centre on a square so every icon scales alike."""
    from PIL import Image
    box = cell.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
    cell = cell.crop(box)
    side = max(cell.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(cell, ((side - cell.width) // 2, (side - cell.height) // 2))
    return sq


def write_monster_icons(cells):
    """One file per monster name the icon table covers, plus the quest-type cells, plus the "?"
    (cell 35) as the fallback. Returns the icon names written."""
    from PIL import Image
    import pica_tex
    img, _ = pica_tex.decode(open(MONSTER_TEX, 'rb').read())
    atlas = Image.fromarray(img).convert('RGBA')
    out = os.path.join(DOCS, 'assets', 'MonsterIcons')
    os.makedirs(out, exist_ok=True)
    named = {}
    for em in range(86):
        n = MONSTERS[em]
        if n in ('NO_DATA', 'Rock', 'Giggi Sac') or n in named:
            continue
        named[n] = cells[em]
    for c, n in QUEST_ICONS.items():
        named[n + '_Quest'] = c
    named['Question_Mark'] = 35
    for n, c in named.items():
        r, k = divmod(c, 9)
        cell = atlas.crop((k * 54, r * 54, k * 54 + 54, r * 54 + 54))
        square(cell).save(os.path.join(out, 'MH3U-%s_Icon.png' % n.replace(' ', '_')), optimize=True)
    return list(named)


def write_weapon_icons():
    """The game's weapon-class icons (the grey masks it tints by rarity), at 2x."""
    from PIL import Image
    import pica_tex
    img, _ = pica_tex.decode(open(ITEM_TEX, 'rb').read())
    out = os.path.join(DOCS, 'assets', 'WeaponIcons')
    os.makedirs(out, exist_ok=True)
    for cls, slug, _ in CLASSES:
        idx = CODE[ICON_BY_TYPE - BASE + 7 + cls]
        x, y = idx % 10 * 22, idx // 10 * 22
        Image.fromarray(img[y:y + 22, x:x + 22]).resize((44, 44), Image.NEAREST).save(
            os.path.join(out, 'icon_%s.png' % slug), optimize=True)


if __name__ == '__main__':
    main()
