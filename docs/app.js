"use strict";
/* MH3U Hunting Log — all app logic (IIFE, no modules). Ported from the MHGU Hunting Log; the quest
   data comes from MH3U's own quest files and executable via scripts/build_data.py. */
(function () {
  const DATA = window.MH3U_LOG_DATA || { quests: [], weapons: {}, weaponIcons: {}, icons: [] };
  const $ = (id) => document.getElementById(id);
  // Every user-supplied string goes in through textContent/.value, never innerHTML.
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const APP_TITLE = "MH3U Hunting Log";

  // ── Static config ────────────────────────────────────────────────────────
  // The game's twelve weapon classes, named and ordered as the build script read them.
  const WEAPONS = Object.keys(DATA.weapons || {});

  // Every weapon name in the game, keyed by the class labels above. Read from the game's own
  // weapon text by scripts/build_data.py. Used only to fill the Weapon field's autocomplete,
  // never to validate it.
  const WEAPON_NAMES = DATA.weapons || {};

  // Locales come from the game's own text already spelled out ("Sandy Plains"), so there is
  // nothing to expand. Kept as a function so the editor's prefill logic reads as in the GU log.
  const localeFull = (name) => name || "";

  // Quest browser grouping: Type → star, keyed off q.Level. The boards and their star ranges
  // are the game's own (its Guild Card unlocks name "N★ Village Quests" 1-9, "N★ Port Quests"
  // 1-8, and "Arena Quests"). Urgent Quests sit in their star with an Urgent pill, where the
  // game lists them.
  const TYPE_ORDER = ["Village", "Port", "Arena"];
  const stars = (n) => Array.from({ length: n }, (_, i) => [i + 1, (i + 1) + "★"]);
  const RANKS = { Village: stars(9), Port: stars(8), Arena: stars(8) };
  const TYPE_LABEL = { Village: "Village Quests", Port: "Port Quests", Arena: "Arena Quests" };
  const rankLabel = (q) => {
    const row = (RANKS[q.Type] || []).find(([lv]) => lv === q.Level);
    return row ? row[1] : "Level " + q.Level;
  };

  // Theme palette: identical across the MH3U apps. Same 31 hexes as the MHGU family (each one
  // clears the white-text / white-checkbox contrast line — do not add one without checking it;
  // the MHGU Hunting Log's app.js carries the full reasoning), with 3U monster names and the
  // game's own monster icons. [label, hex, icon name when the label is abbreviated]
  const COLORS = [
    ["Volvidon", "#570B0B"], ["Rathalos", "#b51717"],
    ["R. Duramboros", "#783E0F", "Rust Duramboros"], ["Agnaktor", "#C7620E"],
    ["Uragaan", "#74631D"], ["G. Rathian", "#9C8328", "Gold Rathian"],
    ["G. Nargacuga", "#436713", "Green Nargacuga"], ["G. Plesioth", "#67922E", "Green Plesioth"],
    ["Deviljho", "#0B570F"], ["Rathian", "#39993E"],
    ["S. Uragaan", "#14503d", "Steel Uragaan"], ["Zinogre", "#279773"],
    ["A. Lagiacrus", "#0C5D68", "Abyssal Lagiacrus"], ["G. Agnaktor", "#118898", "Glacial Agnaktor"],
    ["Nargacuga", "#005984"], ["Plesioth", "#0080c1"],
    ["Brachydios", "#0B2757"], ["Lagiacrus", "#0b3f97"],
    ["Great Wroggi", "#1F0B57"], ["Great Jaggi", "#4e2fa2"],
    ["H. Jhen Mohran", "#62008f", "Hallowed Jhen Mohran"], ["P. Ludroth", "#8e50ab", "Purple Ludroth"],
    ["P. Rathian", "#D4358C", "Pink Rathian"], ["Qurupeco", "#C8679D"],
    ["Duramboros", "#5a411f"], ["Diablos", "#997c54"],
    ["Barroth", "#835A32"], ["Bullfango", "#B17A47"],
    ["S. Rathalos", "#505358", "Silver Rathalos"], ["Barioth", "#7C879B"],
    ["Forbidden", "#1E2025", "Question Mark"],
  ];
  // Retired hexes remap on read (a saved theme is a bare hex). Kept identical to the other apps.
  const LEGACY_HEX = {
    "#C8A319": "#74631D", "#57470B": "#74631D", "#5E4D0C": "#74631D",
    "#574916": "#74631D", "#68581A": "#74631D",
    "#F1D364": "#9C8328", "#B59417": "#9C8328", "#C39F19": "#9C8328",
    "#BEA031": "#9C8328",
    "#C65900": "#783E0F", "#FC933E": "#C7620E",
    "#68360D": "#783E0F", "#B5590D": "#C7620E",
    "#3A9B3F": "#39993E", "#2DAE85": "#279773",
    "#D84696": "#D4358C", "#CE79A8": "#C8679D",
    "#B57C45": "#835A32", "#CFAA87": "#B17A47",
    "#AEB5C1": "#7C879B",
  };
  const migrateHex = (h) => (h && LEGACY_HEX[h.toUpperCase()]) || h;
  const COLORS_HEX = Object.fromEntries(COLORS.map(([name, hex]) => [hex.toUpperCase(), name]));
  const COLORS_ICON = Object.fromEntries(COLORS.filter(c => c[2]).map(([name, , icon]) => [name, icon]));

  // ── Icon path helpers ────────────────────────────────────────────────────
  // Monster and quest-type icons are the game's own, cut from its icon atlas by the build script
  // (which also lists what it wrote, so an unknown name degrades to the "?" deliberately rather
  // than via a 404). The game itself draws Alatreon and Dire Miralis as the "?".
  const FALLBACK_ICON = "assets/MonsterIcons/MH3U-Question_Mark_Icon.png";
  const HAS_ICON = new Set(DATA.icons || []);
  const monsterIcon = (name) => {
    const stem = (name || "").replace(/ /g, "_");
    return HAS_ICON.has(stem) ? "assets/MonsterIcons/MH3U-" + stem + "_Icon.png" : FALLBACK_ICON;
  };
  const weaponIcon = (w) => "assets/WeaponIcons/icon_" + ((DATA.weaponIcons || {})[w] || "") + ".png";

  // ── Quest helpers ────────────────────────────────────────────────────────
  // Saved entries reference a quest by the game's own quest number. Names repeat across boards
  // and stars ("The Volcano's Fury" is a Village 5★, a Village 8★ and two Port quests), so the
  // number is the only key that is unique — and it is fixed by the game, so a data rebuild
  // can't move an entry onto a different quest.
  const questKey = (q) => "q" + q.Id;
  const questShortName = (q) => q.Name;
  // Guarded, because an entry's quest snapshot is read back from a save file as untrusted shape.
  const questTargets = (q) => Array.isArray(q.Monsters) ? q.Monsters.filter(m => typeof m === "string") : [];
  // The quest's icon is picked by the build script: the objective's monster, else the first
  // large monster, else a quest-type icon for the item delivered.
  const questIcon = (q) => q ? monsterIcon(q.Icon) : FALLBACK_ICON;
  // "Village 5★" / "Port 7★" / "Arena 3★" — the board and star the quest is filed under.
  function questRank(q) {
    if (!q || !q.Type) return "";
    const row = (RANKS[q.Type] || []).find(([lv]) => lv === q.Level);
    return row ? q.Type + " " + row[1] : "";
  }
  // "Port 7★ / Infernal Overlord / Stygian Zinogre"
  function questDisplay(q) {
    const parts = [];
    const rank = questRank(q);
    if (rank) parts.push(rank);
    parts.push(questShortName(q));
    const targets = questTargets(q);
    if (targets.length) parts.push(targets.join(" + "));
    return parts.join(" / ");
  }
  function questPills(q) {
    const p = [];
    if (q.Urgent) p.push(["Urgent", "pill-urgent"]);
    if (q.Key) p.push(["Key", "pill-key"]);
    if (q.LgMonster) p.push(["Hunt", "pill-hunt"]);
    if (q.SmMonsters) p.push(["Small Monsters", "pill-sm"]);
    if (q.Capture) p.push(["Capture", "pill-capture"]);
    if (q.Repel) p.push(["Repel", "pill-repel"]);
    if (q.Delivery) p.push(["Delivery", "pill-gathering"]);
    if (q.Harvest) p.push(["Harvest Tour", "pill-egg"]);
    if (q.Type === "Arena") p.push(["Arena", "pill-arena"]);
    return p;
  }
  // "50 min · Fee 100z · Reward 1000z · Client: Injured Villager" — the quest board's details.
  function questMeta(q) {
    if (!q || q.Minutes == null) return "";
    const parts = [q.Minutes + " min"];
    if (q.Fee) parts.push("Fee " + q.Fee + "z");
    if (q.Reward) parts.push("Reward " + q.Reward + "z");
    if (q.Client) parts.push("Client: " + q.Client);
    return parts.join(" · ");
  }
  const QUESTS_BY_KEY = new Map(DATA.quests.map(q => [questKey(q), q]));
  const QUESTS_BY_ID = new Map(DATA.quests.map(q => [q.Id, q]));
  // What opens an Urgent, and which Urgent a Key quest opens — both read from the quest files'
  // own unlock fields by the build script (its header explains the game's rule). Live data only:
  // a snapshot from a save file is never trusted to name other quests.
  function questUnlock(q) {
    const live = q && QUESTS_BY_ID.get(q.Id);
    if (!live) return "";
    const names = (ids) => ids.map(id => QUESTS_BY_ID.get(id)).filter(Boolean)
      .map(x => x.Name + " (" + x.Level + "★)").join(", ");
    if (live.Urgent && live.Unlock) {
      const { Need, From } = live.Unlock;
      return "Unlocks after clearing " + (Need >= From.length ? "all of" : Need + " of") + ": " + names(From);
    }
    if (live.Key && live.KeyFor) return "Key quest for " + names(live.KeyFor);
    return "";
  }

  // ── State ────────────────────────────────────────────────────────────────
  let entries = [];          // { id, seq, questKey, quest{}, date, locale, objective, armor, weapon, weaponType, party[], carts, outcome, clearTime, notes }
  let editingId = null;      // null while composing a new entry
  let selectedQuest = null;
  let seqCounter = 0;
  let dirty = false;
  let fileHandle = null;
  // Farming mode: a save leaves the form standing so back-to-back runs of the same quest
  // can be filed without retyping the loadout each time. Remembered, because it describes
  // how the session is being played rather than anything about one entry.
  const FARMING_KEY = "mh3u-log-farming";
  let farming = false;
  try { farming = localStorage.getItem(FARMING_KEY) === "1"; } catch (e) {}
  // Timestamp mode: the date is taken at the moment of saving rather than typed. On by
  // default — you log a hunt when you finish it, so the clock already knows the answer.
  // Read as "not explicitly off" so a fresh browser starts on.
  const STAMP_KEY = "mh3u-log-timestamp";
  let autoStamp = true;
  try { autoStamp = localStorage.getItem(STAMP_KEY) !== "0"; } catch (e) {}
  let weaponListFor = null;  // which type's names are currently in the datalist
  let localeDefault = "";    // the locale the current quest prefilled, so a user edit is never clobbered

  const newId = () => "le_" + (seqCounter + 1).toString(36) + "_" + Math.random().toString(36).slice(2, 8);

  // ── Toast ────────────────────────────────────────────────────────────────
  let toastTimer = null;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
  }

  // ── Dirty tracking + autosave ────────────────────────────────────────────
  const AUTOSAVE_KEY = "mh3u-log-autosave";
  const SAVE_APP = "mh3u-hunting-log";
  const SAVE_VERSION = 1;

  const serializeSave = () => ({ app: SAVE_APP, version: SAVE_VERSION, entries });

  function markDirty() {
    if (!dirty) {
      dirty = true;
      $("dirtyDot").classList.remove("hidden");
      document.title = "● " + APP_TITLE;
    }
    scheduleAutosave();
  }
  function clearDirty() {
    dirty = false;
    $("dirtyDot").classList.add("hidden");
    document.title = APP_TITLE;
  }
  let autosaveTimer = null;
  function writeLocalSave() {
    clearTimeout(autosaveTimer);
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(serializeSave())); } catch (e) {}
  }
  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(writeLocalSave, 500);
  }
  // ── Draft: the entry currently in the editor ─────────────────────────────
  // The logbook autosaves when an entry is committed, but the half-written entry sitting
  // in the form was only in the DOM — close the tab mid-entry and it was gone. This keeps
  // a mirror of the editor itself.
  //
  // Deliberately its own key and NOT part of serializeSave(): a draft is working state for
  // this browser, not a record, and shipping it inside a save file would resurrect someone
  // else's half-finished entry when they open that file.
  const DRAFT_KEY = "mh3u-log-draft";
  let draftTimer = null;

  const draftIsEmpty = (d) => !d.questKey && !d.quest && !d.locale && !d.objective &&
    !d.armor && !d.weapon && !d.weaponType && !d.outcome && !d.clearTime && !d.notes &&
    !d.carts && !(d.party || []).length;

  function writeDraft() {
    clearTimeout(draftTimer);
    const data = readForm();
    try {
      if (draftIsEmpty(data)) localStorage.removeItem(DRAFT_KEY);
      else localStorage.setItem(DRAFT_KEY, JSON.stringify({ editingId, data }));
    } catch (e) {}
  }
  function scheduleDraftSave() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(writeDraft, 400);
  }

  // Returns true if a draft was restored, so boot knows not to leave the blank form.
  //
  // `raw` is passed in at boot rather than read here: resetEditor() writes the draft, and
  // boot calls it first to build the blank form, which would clear the very draft this is
  // about to restore. Boot reads the value before any of that runs.
  function loadDraft(raw) {
    if (raw === undefined) {
      try { raw = localStorage.getItem(DRAFT_KEY); } catch (e) { return false; }
    }
    if (!raw) return false;
    let d;
    try { d = JSON.parse(raw); } catch (e) { return false; }
    if (!d || !d.data) return false;

    // seq is pinned so normalizeEntry's "assign the next one" path can't advance the
    // counter that real entries depend on.
    const data = normalizeEntry(Object.assign({ seq: 0 }, d.data));
    if (draftIsEmpty(data)) return false;

    selectedQuest = QUESTS_BY_KEY.get(data.questKey) || data.quest || null;
    localeDefault = selectedQuest ? localeFull(selectedQuest.Locale) : "";
    renderQuestHead(selectedQuest);
    const node = questNodes.find(n => n.q === QUESTS_BY_KEY.get(data.questKey));
    if (node) {
      node.btn.classList.add("sel");
      node.sub.classList.add("open");
      node.grp.classList.add("open");
    }
    writeForm(data);

    // Only resume editing an existing entry if it's still there — the log may have been
    // replaced by a different file since.
    editingId = (d.editingId && entries.some(e => e.id === d.editingId)) ? d.editingId : null;
    $("deleteEntryBtn").classList.toggle("hidden", !editingId);
    $("saveAsNewBtn").classList.toggle("hidden", !editingId);
    $("saveEntryBtn").textContent = editingId ? "Update Entry" : "Save Entry";
    // No markEditorClean here: a draft exists precisely because there was unsaved work, so
    // it stays measured against the blank baseline the preceding reset took, and both
    // buttons come back enabled.
    refreshEditorButtons();
    if (editingId) {
      document.querySelectorAll(".log-entry").forEach(n => n.classList.toggle("sel", n.dataset.id === editingId));
    }
    return true;
  }

  function loadAutosave() {
    let raw;
    try { raw = localStorage.getItem(AUTOSAVE_KEY); } catch (e) { return; }
    if (raw) adoptSave(raw, true);
  }

  // Accepts the parsed shape from either the autosave mirror or a picked file. Returns
  // false (and leaves the log untouched) if it isn't ours — silently replacing someone's
  // logbook with the contents of an unrelated JSON file is the one unrecoverable mistake
  // this app could make.
  function adoptSave(text, quiet) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) {
      if (!quiet) toast("That file isn't valid JSON.");
      return false;
    }
    if (!obj || obj.app !== SAVE_APP || !Array.isArray(obj.entries)) {
      if (!quiet) toast("That doesn't look like a hunting log file.");
      return false;
    }
    entries = obj.entries.map(normalizeEntry);
    seqCounter = entries.reduce((m, e) => Math.max(m, e.seq || 0), 0);
    renderLog();
    refreshPartyNames();
    // Mirror it immediately, not on the debounce. Opening a file used to leave the log in
    // memory only: it rendered, looked saved, and the next refresh restored whatever had
    // been in storage beforehand — so a freshly opened logbook silently vanished.
    writeLocalSave();
    return true;
  }
  // Anything read back off disk is treated as untrusted shape, not as our own object.
  function normalizeEntry(raw) {
    const e = raw && typeof raw === "object" ? raw : {};
    const str = (v) => (typeof v === "string" ? v : "");
    return {
      id: str(e.id) || newId(),
      seq: Number.isFinite(e.seq) ? e.seq : ++seqCounter,
      questKey: str(e.questKey),
      quest: e.quest && typeof e.quest === "object" ? e.quest : null,
      date: str(e.date),
      locale: str(e.locale),
      objective: str(e.objective),
      armor: str(e.armor),
      weapon: str(e.weapon),
      weaponType: str(e.weaponType),
      party: Array.isArray(e.party) ? e.party.filter(p => typeof p === "string") : [],
      carts: Math.max(0, Math.min(9, parseInt(e.carts, 10) || 0)),
      outcome: str(e.outcome),
      // Masked here, not just in the editor. The card and the copied text read the stored
      // value directly, so an entry written before the mask existed — or loaded from a
      // file — otherwise kept its old shape forever and copied out verbatim.
      clearTime: formatClearTime(str(e.clearTime), true),
      notes: str(e.notes),
    };
  }

  // ── Named save files ─────────────────────────────────────────────────────
  const supportsFsApi = "showSaveFilePicker" in window;
  const saveOpts = {
    suggestedName: "mh3u-hunting-log.json",
    types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
  };
  async function saveToFile() {
    const data = JSON.stringify(serializeSave(), null, 2);
    if (supportsFsApi) {
      try {
        if (!fileHandle) fileHandle = await window.showSaveFilePicker(saveOpts);
        const w = await fileHandle.createWritable();
        await w.write(data);
        await w.close();
        clearDirty();
        toast("Saved.");
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
        // Anything else (a revoked handle, a read-only location) falls through to a
        // plain download so the log is never trapped in the tab.
        fileHandle = null;
      }
    }
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "mh3u-hunting-log.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    clearDirty();
    toast("Downloaded save file.");
  }
  // Clears the log and starts over. fileHandle is dropped with it, which matters more than
  // it looks: leaving it set would point the next Save at the file that was open, and
  // quietly overwrite a full logbook with an empty one.
  function newLogbook() {
    const wipe = () => {
      entries = [];
      selected.clear();
      seqCounter = 0;
      fileHandle = null;
      renderLog();
      refreshPartyNames();
      resetEditor();
      writeLocalSave();   // so a reload doesn't restore what was just cleared
      clearDirty();
      toast("New logbook.");
    };
    if (!entries.length) return wipe();   // nothing to lose, don't ask
    const n = entries.length;
    confirmAction("Start a new logbook?",
      n + (n === 1 ? " entry" : " entries") + " will be cleared from this browser. " +
      "Save to a file first if you want to keep them.", wipe);
  }

  async function openFile() {
    if (supportsFsApi) {
      try {
        const [h] = await window.showOpenFilePicker({ types: saveOpts.types });
        const f = await h.getFile();
        if (adoptSave(await f.text(), false)) {
          fileHandle = h;
          clearDirty();
          resetEditor();
          toast("Loaded " + entries.length + " entr" + (entries.length === 1 ? "y" : "ies") + ".");
        }
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    $("importFile").click();
  }
  $("importFile").addEventListener("change", function () {
    const file = this.files[0];
    this.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (adoptSave(ev.target.result, false)) {
        fileHandle = null;
        clearDirty();
        resetEditor();
        toast("Loaded " + entries.length + " entr" + (entries.length === 1 ? "y" : "ies") + ".");
      }
    };
    reader.readAsText(file);
  });
  window.addEventListener("beforeunload", (e) => {
    if (!dirty || !entries.length) return;
    e.preventDefault();
    e.returnValue = "";
  });

  // ── Quest browser ────────────────────────────────────────────────────────
  const questNodes = [];   // { q, btn, haystack, sub, grp }

  function buildTree() {
    const wrap = $("questTree");
    const byType = new Map();
    for (const q of DATA.quests) {
      if (!byType.has(q.Type)) byType.set(q.Type, new Map());
      const ranks = byType.get(q.Type);
      const label = rankLabel(q);
      if (!ranks.has(label)) ranks.set(label, []);
      ranks.get(label).push(q);
    }
    const types = [...byType.keys()].sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a), ib = TYPE_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    for (const type of types) {
      const ranks = byType.get(type);
      const grp = el("div", "qgrp");
      const head = el("div", "qhead");
      const twist = el("span", "qtwist", "▸");
      const count = el("span", "qcount", String([...ranks.values()].reduce((n, a) => n + a.length, 0)));
      head.append(twist, el("span", null, TYPE_LABEL[type] || type), count);
      head.addEventListener("click", () => grp.classList.toggle("open"));
      const kids = el("div", "qkids");
      grp.append(head, kids);

      // Rank order follows the RANKS table, not insertion order.
      const order = (RANKS[type] || []).map(([, label]) => label);
      const rankNames = [...ranks.keys()].sort((a, b) => {
        const ia = order.indexOf(a), ib = order.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });

      for (const rname of rankNames) {
        const sub = el("div", "qgrp qsub");
        const shead = el("div", "qhead");
        const stwist = el("span", "qtwist", "▸");
        const scount = el("span", "qcount", String(ranks.get(rname).length));
        shead.append(stwist, el("span", null, rname), scount);
        shead.addEventListener("click", () => sub.classList.toggle("open"));
        const skids = el("div", "qkids");
        sub.append(shead, skids);

        for (const q of ranks.get(rname)) {
          const btn = el("button", "qitem");
          btn.type = "button";
          const icon = el("img", "qitem-icon");
          icon.src = questIcon(q);
          icon.alt = "";
          icon.addEventListener("error", () => { icon.src = FALLBACK_ICON; }, { once: true });
          btn.append(icon, el("span", "qitem-name", questShortName(q)));
          btn.title = q.Main + (q.Locale ? " — " + q.Locale : "");
          btn.addEventListener("click", () => selectQuest(q));
          skids.appendChild(btn);
          questNodes.push({
            q, btn, sub, grp, subCount: scount, grpCount: count,
            haystack: [q.Name, questTargets(q).join(" "), q.Main, localeFull(q.Locale), q.Urgent ? "urgent" : "", q.Key ? "key" : ""]
              .join(" ").toLowerCase(),
          });
        }
        kids.appendChild(sub);
      }
      wrap.appendChild(grp);
    }
  }

  function filterTree() {
    const query = $("questSearch").value.trim().toLowerCase();
    const terms = query ? query.split(/\s+/) : [];
    const subHits = new Map(), grpHits = new Map();
    let total = 0;

    for (const n of questNodes) {
      const hit = terms.every(t => n.haystack.includes(t));
      n.btn.classList.toggle("hidden", !hit);
      if (!hit) continue;
      total++;
      subHits.set(n.sub, (subHits.get(n.sub) || 0) + 1);
      grpHits.set(n.grp, (grpHits.get(n.grp) || 0) + 1);
    }
    for (const n of questNodes) {
      const sHit = subHits.get(n.sub) || 0, gHit = grpHits.get(n.grp) || 0;
      n.sub.classList.toggle("hidden", sHit === 0);
      n.grp.classList.toggle("hidden", gHit === 0);
      // A search auto-opens what it found; clearing it collapses everything back.
      n.sub.classList.toggle("open", terms.length > 0);
      n.grp.classList.toggle("open", terms.length > 0);
      n.subCount.textContent = String(sHit);
      n.grpCount.textContent = String(gHit);
    }
    $("searchCount").textContent = terms.length
      ? total + " quest" + (total === 1 ? "" : "s") + " match"
      : DATA.quests.length + " quests";
  }

  // ── Editor ───────────────────────────────────────────────────────────────
  function selectQuest(q) {
    selectedQuest = q;
    // Only overwrite Locale when the user hasn't personalised it — so "Jurassic
    // Frontier / Night" survives switching quests, but a plain prefill gets replaced.
    const cur = $("f_locale").value.trim();
    if (!cur || cur === localeDefault) $("f_locale").value = localeFull(q.Locale);
    localeDefault = localeFull(q.Locale);

    renderQuestHead(q);
    document.querySelectorAll(".qitem.sel").forEach(b => b.classList.remove("sel"));
    const node = questNodes.find(n => n.q === q);
    if (node) node.btn.classList.add("sel");
    refreshEditorButtons();
    setView("editor");
    writeDraft();
  }

  function renderQuestHead(q) {
    const icon = $("q_icon"), pills = $("q_pills");
    pills.innerHTML = "";
    if (!q) {
      $("q_name").textContent = "No quest selected";
      $("q_main").textContent = "Pick a quest from the list on the left to start an entry.";
      $("q_meta").textContent = "";
      $("q_unlock").textContent = "";
      icon.src = FALLBACK_ICON;
      return;
    }
    $("q_name").textContent = questDisplay(q);
    $("q_main").textContent = q.Main || "";
    $("q_meta").textContent = questMeta(q);
    $("q_unlock").textContent = questUnlock(q);
    icon.src = questIcon(q);
    icon.onerror = () => { icon.src = FALLBACK_ICON; icon.onerror = null; };
    for (const [label, cls] of questPills(q)) pills.appendChild(el("span", "pill " + cls, label));
  }

  // datetime-local wants "YYYY-MM-DDTHH:mm" in *local* time, which toISOString isn't.
  function toDateInput(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function formatDate(v) {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d)) return v;
    return d.toLocaleString(undefined, {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  const FIELD_IDS = ["f_date", "f_locale", "f_objective", "f_armor", "f_weapon",
    "f_weaponType", "f_carts", "f_p1", "f_p2", "f_p3", "f_p4", "f_outcome", "f_time", "f_notes"];

  function readForm() {
    const party = ["f_p1", "f_p2", "f_p3", "f_p4"].map(id => $(id).value.trim()).filter(Boolean);
    return {
      questKey: selectedQuest ? questKey(selectedQuest) : "",
      quest: selectedQuest ? {
        Id: selectedQuest.Id, Name: selectedQuest.Name, Type: selectedQuest.Type,
        Level: selectedQuest.Level, Main: selectedQuest.Main, Locale: selectedQuest.Locale,
        Monsters: questTargets(selectedQuest).slice(), Icon: selectedQuest.Icon,
        Urgent: selectedQuest.Urgent, Key: selectedQuest.Key, Capture: selectedQuest.Capture, Repel: selectedQuest.Repel,
        LgMonster: selectedQuest.LgMonster, SmMonsters: selectedQuest.SmMonsters,
        Delivery: selectedQuest.Delivery, Harvest: selectedQuest.Harvest,
      } : null,
      date: $("f_date").value,
      locale: $("f_locale").value.trim(),
      objective: $("f_objective").value.trim(),
      armor: $("f_armor").value.trim(),
      weapon: $("f_weapon").value.trim(),
      weaponType: $("f_weaponType").value,
      party,
      carts: Math.max(0, Math.min(9, parseInt($("f_carts").value, 10) || 0)),
      outcome: $("f_outcome").value,
      clearTime: $("f_time").value.trim(),
      notes: $("f_notes").value.trim(),
    };
  }

  function writeForm(e) {
    $("f_date").value = e.date || "";
    $("f_locale").value = e.locale || "";
    $("f_objective").value = e.objective || "";
    $("f_armor").value = e.armor || "";
    $("f_weapon").value = e.weapon || "";
    $("f_weaponType").value = e.weaponType || "";
    $("f_carts").value = e.carts != null ? e.carts : 0;
    ["f_p1", "f_p2", "f_p3", "f_p4"].forEach((id, i) => { $(id).value = (e.party || [])[i] || ""; });
    $("f_outcome").value = e.outcome || "";
    // Run stored values through the mask too, so an entry written before it existed
    // (or imported from the markdown diary as "6'02") shows in the same MM'SS shape.
    $("f_time").value = formatClearTime(e.clearTime, true);
    $("f_notes").value = e.notes || "";
    syncWeapon();
  }

  // ── Editor dirty state ───────────────────────────────────────────────────
  // Save and Cancel stay disabled until the form differs from what it was loaded with, so
  // neither offers to act when there is nothing to act on. The baseline is re-taken
  // whenever the editor is (re)loaded: a reset, opening an entry, or saving an edit.
  //
  // The date is inside the snapshot on purpose. It's stamped by the reset that also takes
  // the baseline, so it reads as unchanged until the hunter actually edits it.
  let editorBaseline = "";
  const editorSnapshot = () => JSON.stringify(readForm());
  function refreshEditorButtons() {
    const changed = editorSnapshot() !== editorBaseline;
    // Farming leaves the form standing after a save, so it would otherwise read as
    // unchanged and lock the button that files the next run. Filing the same form again is
    // the whole point of the mode, so the gate lifts — but only while composing, never
    // while editing, where Save as New already covers repeats.
    const repeatable = farming && !editingId;
    // Saving additionally needs a quest — an entry without one has nothing to name it.
    $("saveEntryBtn").disabled = (!changed && !repeatable) || !selectedQuest;
    $("cancelEntryBtn").disabled = !changed;
    $("saveAsNewBtn").disabled = !selectedQuest;
  }
  // Keeps the checkbox and the switch's appearance in step. Both are set here rather than
  // letting CSS read :checked off the input, so a state restored at boot renders correctly.
  function syncFarmingSwitch() {
    $("farmingToggle").checked = farming;
    $("farmingToggle").closest(".opt-toggle").classList.toggle("on", farming);
  }
  // The date field is disabled while stamping is on: whatever it held would be replaced at
  // save, and leaving it editable would invite typing a date that never survives.
  function syncStampSwitch() {
    $("stampToggle").checked = autoStamp;
    $("stampToggle").closest(".opt-toggle").classList.toggle("on", autoStamp);
    $("f_date").disabled = autoStamp;
    $("f_date").title = autoStamp ? "Set automatically when you save" : "";
  }

  function markEditorClean() {
    editorBaseline = editorSnapshot();
    refreshEditorButtons();
  }

  // Leaves edit mode without touching the fields. Split out for farming, which files the
  // form as a hunt and keeps it on screen: what's showing afterwards is an unsaved entry
  // rather than the one that was opened, so Update, Delete and Save as New have to stand
  // down even though nothing was cleared.
  function exitEditMode() {
    editingId = null;
    document.querySelectorAll(".log-entry.sel").forEach(n => n.classList.remove("sel"));
    $("deleteEntryBtn").classList.add("hidden");
    $("saveAsNewBtn").classList.add("hidden");
    $("saveEntryBtn").textContent = "Save Entry";
  }

  // Back to a blank entry: every field, the quest, and the tree selection.
  function resetEditor() {
    exitEditMode();
    $("f_date").value = toDateInput(new Date());
    ["f_locale", "f_objective", "f_armor", "f_weapon", "f_time", "f_notes",
     "f_p1", "f_p2", "f_p3", "f_p4"].forEach(id => { $(id).value = ""; });
    $("f_weaponType").value = "";
    $("f_carts").value = 0;
    $("f_outcome").value = "";
    selectedQuest = null;
    localeDefault = "";
    document.querySelectorAll(".qitem.sel").forEach(b => b.classList.remove("sel"));
    renderQuestHead(null);
    syncWeapon();
    markEditorClean();
    writeDraft();
  }

  function editEntry(entry) {
    editingId = entry.id;
    const q = QUESTS_BY_KEY.get(entry.questKey);
    // Fall back to the snapshot taken when the entry was written, so an entry survives
    // its quest being renamed or dropped by a data rebuild.
    selectedQuest = q || entry.quest || null;
    localeDefault = selectedQuest ? localeFull(selectedQuest.Locale) : "";
    renderQuestHead(selectedQuest);
    document.querySelectorAll(".qitem.sel").forEach(b => b.classList.remove("sel"));
    const node = questNodes.find(n => n.q === q);
    if (node) {
      node.btn.classList.add("sel");
      node.sub.classList.add("open");
      node.grp.classList.add("open");
      node.btn.scrollIntoView({ block: "nearest" });
    }
    writeForm(entry);
    $("deleteEntryBtn").classList.remove("hidden");
    $("saveAsNewBtn").classList.remove("hidden");
    $("saveEntryBtn").textContent = "Update Entry";
    // The entry as loaded is the baseline, so Update stays disabled until it's edited.
    markEditorClean();
    document.querySelectorAll(".log-entry").forEach(n => n.classList.toggle("sel", n.dataset.id === entry.id));
    setView("editor");
    writeDraft();
  }

  function saveEntry() {
    if (!selectedQuest) return;
    const data = readForm();
    if (editingId) {
      const i = entries.findIndex(e => e.id === editingId);
      if (i >= 0) entries[i] = Object.assign({}, entries[i], data);
      markDirty();
      renderLog();
      refreshPartyNames();
      document.querySelectorAll(".log-entry").forEach(n => n.classList.toggle("sel", n.dataset.id === editingId));
      // The edit is now the saved state, so Update goes back to disabled until it's
      // edited again — pressing it twice can't do anything the first press didn't.
      markEditorClean();
      writeDraft();
      toast("Entry updated.");
    } else {
      addEntry(data);
      toast("Entry added.");
    }
  }

  // Appends a hunt and clears the form — shared by Save Entry and Save as New so a hunt
  // recorded either way is identical, and gets its own entry number rather than a copy.
  function addEntry(data) {
    // Stamped here rather than in saveEntry, so it covers Save as New too and pointedly
    // does not cover Update: re-dating an entry you came back to correct would move a hunt
    // to whenever you noticed the typo.
    if (autoStamp) data.date = toDateInput(new Date());
    entries.push(Object.assign({ id: newId(), seq: ++seqCounter }, data));
    markDirty();
    renderLog();
    refreshPartyNames();
    if (farming) {
      // Everything stays put for the next run. Only edit mode ends, because the form now
      // represents a hunt that hasn't been filed rather than the one that was opened.
      exitEditMode();
      refreshEditorButtons();
      writeDraft();
    } else {
      resetEditor();
    }
  }

  // Farming the same quest: open the last run, adjust what differed, and file it as
  // another hunt rather than overwriting the one you opened.
  //
  // Unlike Update, this doesn't require a change. Two runs of the same quest with the same
  // loadout and the same result are a perfectly ordinary pair of entries, and refusing to
  // record the second because it matches the first would be the wrong call.
  function saveAsNewEntry() {
    if (!selectedQuest) return;
    addEntry(readForm());
    toast("Saved as a new entry.");
  }

  function deleteEntry(id) {
    const i = entries.findIndex(e => e.id === id);
    if (i < 0) return;
    entries.splice(i, 1);
    markDirty();
    renderLog();
    refreshPartyNames();
    if (editingId === id) resetEditor();
    toast("Entry deleted.");
  }

  // The Weapon field follows the type: the type supplies its icon, and it fills the
  // autocomplete with just that type's weapons (~60-200 names each, 1414 in total —
  // offering all of them at once would make the list useless).
  //
  // It stays a plain text input, so a name that isn't in the list is still accepted.
  function syncWeapon() {
    const type = $("f_weaponType").value;
    const input = $("f_weapon");
    const img = $("f_weaponIcon");

    img.classList.toggle("hidden", !type);
    if (type) {
      img.src = weaponIcon(type);
      img.onerror = () => { img.classList.add("hidden"); img.onerror = null; };
    }

    // Disabled only while there is nothing to lose: an entry that already carries a
    // weapon name but no type (imported ones do) has to stay editable.
    const lock = !type && !input.value.trim();
    input.disabled = lock;
    input.placeholder = lock ? "Pick a weapon type first" : "Dual Hatchets";

    const names = (WEAPON_NAMES[type] || []);
    if (names === weaponListFor) return;   // same type as last time — leave the DOM alone
    weaponListFor = names;
    const list = $("weaponNames");
    list.innerHTML = "";
    if (!names.length) return;
    const frag = document.createDocumentFragment();
    for (const n of names) {
      const o = document.createElement("option");
      o.value = n;
      frag.appendChild(o);
    }
    list.appendChild(frag);
  }

  // Clear Time is a digit mask in the game's own shape, MM'SS"CC — minutes, seconds,
  // hundredths. Everything that isn't a digit is dropped and the separators are placed
  // from the right, so typing 6 3 1 8 3 walks through 6, 63, 6'31, 63'18, 6'31"83 and
  // lands on exactly what the results screen showed you.
  //
  // `settle` is for when editing finishes: it pads each part out to two digits and clamps
  // minutes to 49 and seconds to 59, a quest running out at 50 minutes. Hundredths need no
  // clamp — two digits can't exceed 99.
  //
  // The clamp only runs on settle, never while typing: "1'84" is a legitimate waypoint on
  // the way to "18'42", and clamping it live to "1'59" would eat the next digit.
  const MAX_MIN = 49, MAX_SEC = 59;
  function formatClearTime(value, settle) {
    const d = String(value || "").replace(/\D/g, "").slice(0, 6);
    if (!d) return "";
    const clamp = (n, max) => String(Math.min(max, n)).padStart(2, "0");
    if (d.length <= 2) {
      return settle ? clamp(parseInt(d, 10), MAX_MIN) + "'00\"00" : d;
    }
    if (d.length <= 4) {
      const mm = d.slice(0, -2), ss = d.slice(-2);
      return settle
        ? clamp(parseInt(mm, 10), MAX_MIN) + "'" + clamp(parseInt(ss, 10), MAX_SEC) + "\"00"
        : mm + "'" + ss;
    }
    const cc = d.slice(-2), ss = d.slice(-4, -2), mm = d.slice(0, -4);
    return settle
      ? clamp(parseInt(mm, 10), MAX_MIN) + "'" + clamp(parseInt(ss, 10), MAX_SEC) + "\"" + cc
      : mm + "'" + ss + "\"" + cc;
  }

  function refreshPartyNames() {
    const names = new Set();
    for (const e of entries) for (const p of e.party || []) if (p) names.add(p);
    const list = $("partyNames");
    list.innerHTML = "";
    [...names].sort((a, b) => a.localeCompare(b)).forEach(n => {
      const o = document.createElement("option");
      o.value = n;
      list.appendChild(o);
    });
  }

  // ── Logbook ──────────────────────────────────────────────────────────────
  // `seq` is the entry number: assigned once when an entry is created and never reused,
  // so it records the order hunts were written down — which is not the order they happened
  // if you backfill a session. Deleting an entry leaves a gap on purpose; the number
  // identifies an entry rather than counting its position.
  //
  // Blank dates go last in BOTH date directions. They're a "no date recorded" bucket, not
  // a point on the timeline, so flipping them to the top on oldest-first would be claiming
  // a chronology the entry doesn't have.
  const byDate = (dir) => (a, b) => {
    if (a.date !== b.date) {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? dir : -dir;
    }
    return (b.seq || 0) - (a.seq || 0);
  };
  const SORTS = {
    dateDesc: { asc: false, cmp: byDate(1) },
    dateAsc:  { asc: true,  cmp: byDate(-1) },
    seqDesc:  { asc: false, cmp: (a, b) => (b.seq || 0) - (a.seq || 0) },
    seqAsc:   { asc: true,  cmp: (a, b) => (a.seq || 0) - (b.seq || 0) },
  };
  const SORT_KEY = "mh3u-log-sort";
  let sortBy = "dateDesc";
  try { sortBy = localStorage.getItem(SORT_KEY) || "dateDesc"; } catch (e) {}
  if (!SORTS[sortBy]) sortBy = "dateDesc";

  const sortedEntries = () => entries.slice().sort(SORTS[sortBy].cmp);

  function entryQuest(e) {
    return QUESTS_BY_KEY.get(e.questKey) || e.quest || null;
  }
  function entryQuestDisplay(e) {
    const q = entryQuest(e);
    return q ? questDisplay(q) : "(quest no longer in data)";
  }

  // ── Grouping ─────────────────────────────────────────────────────────────
  // Each mode is: a key to bucket on, a heading for that key, and how to order the
  // buckets. Entries with no value fall into the "" bucket, which always sorts last.
  //
  // Only fields the log reliably holds are offered. Clear Time is the notable omission:
  // the mask works, but nothing recorded times before it existed, so grouping on it would
  // put every entry in one nameless pile.
  const GROUP_KEY = "mh3u-log-group";
  const dayTitle = (k) => {
    const d = new Date(k + "T00:00");
    return isNaN(d) ? k : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  };
  const primaryMonster = (e) => {
    const q = entryQuest(e);
    if (!q) return "";
    return questTargets(q)[0] || "";
  };
  const OUTCOME_ORDER = ["Success", "Fail", "Abandoned"];
  const alpha = (a, b) => a.localeCompare(b);

  const GROUPINGS = {
    none: { label: "Nothing" },
    date: {
      label: "Day",
      key: (e) => (e.date || "").slice(0, 10),
      title: (k) => dayTitle(k),
      // Follows the chosen sort direction, so the days don't run newest-first while the
      // hunts inside them run oldest-first.
      order: (a, b) => SORTS[sortBy].asc ? a.localeCompare(b) : b.localeCompare(a),
    },
    rank: {
      label: "Quest rank",
      // Requires a level that maps to a real rank. An entry the importer couldn't link
      // carries Type but Level 0, which would otherwise head its own "Village Level 0"
      // group; it belongs with the rest of the unranked.
      key: (e) => {
        const q = entryQuest(e);
        if (!q || !q.Type) return "";
        const known = (RANKS[q.Type] || []).some(([lv]) => lv === q.Level);
        return known ? q.Type + "|" + q.Level : "";
      },
      title: (k) => { const [t, lv] = k.split("|"); return t + " " + rankLabel({ Type: t, Level: +lv }); },
      // Village 1★ through Port 8★ and the Arena, i.e. the order the boards open up.
      order: (a, b) => {
        const rank = (k) => {
          const [t, lv] = k.split("|");
          const i = TYPE_ORDER.indexOf(t);
          return (i < 0 ? 99 : i) * 1000 + (+lv || 0);
        };
        return rank(a) - rank(b);
      },
    },
    monster: {
      label: "Monster",
      key: (e) => primaryMonster(e),
      title: (k) => k,
      order: alpha,
    },
    quest: {
      label: "Quest",
      key: (e) => e.questKey || (e.quest && e.quest.Name) || "",
      title: (k, rows) => entryQuestDisplay(rows[0]),
      order: null,                                   // sorted by heading text instead
    },
    outcome: {
      label: "Outcome",
      key: (e) => e.outcome || "",
      title: (k) => k,
      order: (a, b) => OUTCOME_ORDER.indexOf(a) - OUTCOME_ORDER.indexOf(b),
    },
    carts: {
      label: "Carts",
      key: (e) => String(e.carts || 0),
      title: (k) => k === "1" ? "1 cart" : k + " carts",
      order: (a, b) => (+a) - (+b),
    },
  };
  const EMPTY_TITLE = {
    date: "No date", rank: "Unranked", monster: "No monster",
    quest: "Unknown quest", outcome: "No outcome",
  };

  let groupBy = "none";
  try { groupBy = localStorage.getItem(GROUP_KEY) || "none"; } catch (e) {}
  if (!GROUPINGS[groupBy]) groupBy = "none";

  // ── Selection ────────────────────────────────────────────────────────────
  // Which entries are ticked for copying. Held in memory rather than storage: it's an
  // action in progress, not a property of the log. It does survive a re-render, so
  // changing the sort or grouping mid-selection doesn't throw the ticks away.
  const selected = new Set();
  // Rendered order and the card for each id, so a shift-click can walk the range between
  // two ticks. Rebuilt by renderLog, because the order is whatever the sort and grouping
  // currently produce — a range means "everything between these two on screen".
  let renderedOrder = [];
  const cardsById = new Map();
  // The last box ticked without shift. Shift-clicking extends from here, and the anchor
  // stays put afterwards so the range can be widened or narrowed by clicking again.
  let pickAnchor = null;

  function applyPick(id, on) {
    if (on) selected.add(id); else selected.delete(id);
    const card = cardsById.get(id);
    if (!card) return;
    const box = card.querySelector(".le-pick");
    if (box) box.checked = on;
    card.classList.toggle("picked", on);
  }

  function updateSelectionUI() {
    const n = selected.size;
    const all = entries.length;
    $("copySelBtn").textContent = n ? `Copy Selected (${n})` : "Copy Selected";
    $("copySelBtn").disabled = n === 0;
    $("clearSelBtn").disabled = n === 0;
    const box = $("selectAll");
    box.checked = all > 0 && n === all;
    box.indeterminate = n > 0 && n < all;
    box.disabled = all === 0;
  }

  function renderLog() {
    const list = $("lbList");
    list.innerHTML = "";
    $("lbCount").textContent = String(entries.length);
    $("lbCountTab").textContent = String(entries.length);
    renderedOrder = [];
    cardsById.clear();
    // Drop ticks for entries that no longer exist — deleted, or replaced by a loaded file.
    const live = new Set(entries.map(e => e.id));
    for (const id of [...selected]) if (!live.has(id)) selected.delete(id);
    if (pickAnchor && !live.has(pickAnchor)) pickAnchor = null;
    updateSelectionUI();
    if (!entries.length) {
      list.appendChild(el("p", "lb-empty", "No hunts logged yet. Pick a quest, fill in the details, and press Save Entry."));
      return;
    }

    const rows = sortedEntries();
    const g = GROUPINGS[groupBy];
    if (!g || !g.key) {
      rows.forEach(e => list.appendChild(entryCard(e)));
      return;
    }

    const buckets = new Map();
    for (const e of rows) {
      const k = g.key(e);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(e);
    }
    // Resolve headings first so "quest" can order by the name it displays rather than by
    // its "Hub//Hub 6★ // …" key, which would sort by rank prefix instead of title.
    const groups = [...buckets.entries()].map(([k, rows2]) => ({
      key: k,
      rows: rows2,
      title: k ? g.title(k, rows2) : (EMPTY_TITLE[groupBy] || "—"),
    }));
    groups.sort((a, b) => {
      if (!a.key !== !b.key) return a.key ? -1 : 1;   // the empty bucket sits at the end
      if (!a.key) return 0;
      return g.order ? g.order(a.key, b.key) : alpha(a.title, b.title);
    });

    for (const grp of groups) {
      const head = el("div", "lb-group");
      head.append(el("span", "lb-group-name", grp.title), el("span", "lb-group-count", String(grp.rows.length)));
      list.appendChild(head);
      grp.rows.forEach(e => list.appendChild(entryCard(e)));
    }
  }

  function entryCard(e) {
    {
      const q = entryQuest(e);
      const card = el("div", "log-entry");
      card.dataset.id = e.id;
      renderedOrder.push(e.id);
      cardsById.set(e.id, card);

      const top = el("div", "le-top");
      // Ticking must not open the entry for editing, hence the stopPropagation on the
      // click as well as the change — the card's own click handler sits above this.
      const pick = el("input", "le-pick");
      pick.type = "checkbox";
      pick.checked = selected.has(e.id);
      pick.title = "Select for copying (shift-click for a range)";
      pick.setAttribute("aria-label", "Select entry " + (e.seq || 0) + " for copying");
      // Everything happens on click rather than change: only click carries shiftKey, and
      // it still fires when the box is toggled from the keyboard, so nothing is lost.
      pick.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const on = pick.checked;              // the browser has already toggled it
        applyPick(e.id, on);
        const from = ev.shiftKey && pickAnchor !== null ? renderedOrder.indexOf(pickAnchor) : -1;
        const to = renderedOrder.indexOf(e.id);
        if (from >= 0 && to >= 0) {
          // Whole range takes the state of the box just clicked, so shift-click un-ticks
          // a run as readily as it ticks one.
          const [lo, hi] = from < to ? [from, to] : [to, from];
          for (let i = lo; i <= hi; i++) applyPick(renderedOrder[i], on);
        } else {
          pickAnchor = e.id;                  // plain click sets the anchor
        }
        updateSelectionUI();
      });
      const icon = el("img", "le-icon");
      icon.src = questIcon(q);
      icon.alt = "";
      icon.addEventListener("error", () => { icon.src = FALLBACK_ICON; }, { once: true });
      const mid = el("div");
      mid.style.cssText = "flex:1;min-width:0";
      mid.append(el("div", "le-quest", entryQuestDisplay(e)));
      const meta = ["#" + (e.seq || 0), formatDate(e.date), "Carts: " + (e.carts || 0)]
        .filter(Boolean).join(" · ");
      mid.append(el("div", "le-date", meta));
      top.append(pick, icon, mid);
      if (e.outcome) top.append(el("span", "le-outcome " + e.outcome, e.outcome));
      card.classList.toggle("picked", pick.checked);
      card.appendChild(top);

      const dl = el("dl", "le-fields");
      const row = (label, value, cls) => {
        if (!value) return;
        const d = el("div");
        d.append(el("dt", null, label), el("dd", cls || null, value));
        dl.appendChild(d);
      };
      row("Locale", e.locale);
      row("Objective", e.objective);
      row("Armor", e.armor);
      row("Weapon", e.weapon || e.weaponType);
      row("Party", (e.party || []).join(", "));
      row("Time", e.clearTime);
      row("Notes", e.notes, "le-notes");
      if (dl.children.length) card.appendChild(dl);

      const actions = el("div", "le-actions");
      // The whole card is clickable, but that isn't reachable by keyboard — this button
      // is the accessible route to the same thing.
      const editBtn = el("button", "btn tiny", "Edit");
      editBtn.type = "button";
      editBtn.addEventListener("click", (ev) => { ev.stopPropagation(); editEntry(e); });
      const delBtn = el("button", "btn tiny", "Delete");
      delBtn.type = "button";
      delBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        confirmAction("Delete this entry?", entryQuestDisplay(e), () => deleteEntry(e.id));
      });
      actions.append(editBtn, delBtn);
      card.appendChild(actions);

      card.addEventListener("click", () => editEntry(e));
      return card;
    }
  }

  // ── Copy ─────────────────────────────────────────────────────────────────
  // Field order is deliberate — it matches the logbook format this app was built for.
  // The date is omitted from a single-entry copy (it's already visible in the UI) so
  // the text is exactly the seven-line form; Copy All leads with it instead.
  function entryToText(e, withDate) {
    const lines = [];
    if (withDate && e.date) lines.push("Date: " + formatDate(e.date));
    lines.push("Quest: " + entryQuestDisplay(e));
    if (e.locale) lines.push("Locale: " + e.locale);
    if (e.objective) lines.push("Objective: " + e.objective);
    if (e.armor) lines.push("Armor Used: " + e.armor);
    if (e.weapon || e.weaponType) lines.push("Weapon: " + (e.weapon || e.weaponType));
    if ((e.party || []).length) lines.push("Hunting Party: " + e.party.join(", "));
    lines.push("Carts: " + (e.carts || 0));
    if (e.outcome) lines.push("Outcome: " + e.outcome);
    if (e.clearTime) lines.push("Clear Time: " + e.clearTime);
    if (e.notes) lines.push("Notes: " + e.notes);
    return lines.join("\n");
  }
  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      if (!btn) return toast("Copied.");
      const orig = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = orig; }, 1500);
    }, () => toast("Couldn't reach the clipboard."));
  }

  // ── Confirm dialog ───────────────────────────────────────────────────────
  let confirmFn = null;
  function confirmAction(title, body, fn) {
    $("confirmTitle").textContent = title;
    $("confirmBody").textContent = body || "";
    confirmFn = fn;
    $("confirmModal").classList.remove("hidden");
  }
  $("confirmOk").addEventListener("click", () => {
    $("confirmModal").classList.add("hidden");
    const fn = confirmFn; confirmFn = null;
    if (fn) fn();
  });
  $("confirmCancel").addEventListener("click", () => {
    $("confirmModal").classList.add("hidden");
    confirmFn = null;
  });

  // ── Theme ────────────────────────────────────────────────────────────────
  const hexRgb = (h) => { h = h.replace("#", ""); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); };
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const rgbToHsl = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const l = (max + min) / 2;
    if (d === 0) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6
            : max === g ? ((b - r) / d + 2) / 6
            :             ((r - g) / d + 4) / 6;
    return [h, s, l];
  };
  const hslToRgb = ([h, s, l]) => {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h * 6) % 2 - 1)), m = l - c / 2;
    const hi = Math.floor(h * 6) % 6;
    const [r, g, b] = hi === 0 ? [c, x, 0] : hi === 1 ? [x, c, 0] : hi === 2 ? [0, c, x]
                    : hi === 3 ? [0, x, c] : hi === 4 ? [x, 0, c] : [c, 0, x];
    return [r + m, g + m, b + m].map(v => clamp(v * 255));
  };
  // darken/lighten only nudge lightness in HSL space, so the hue and saturation of the
  // chosen theme color are preserved — every derived shade stays "in family."
  const darken = (rgb, f) => { const [h, s, l] = rgbToHsl(rgb); return hslToRgb([h, s, clamp01(l * f)]); };
  const lighten = (rgb, b) => { const [h, s, l] = rgbToHsl(rgb); return hslToRgb([h, s, clamp01(l + (1 - l) * b)]); };
  const css = (rgb) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

  // Every shade is a fixed multiple of the chosen colour's lightness, matching the
  // Collection Tracker and the Randomizer so a theme looks like itself in all three.
  //
  // Fixed factors are the point, not a shortcut. The palette is thirteen dark/light pairs
  // of one hue — Tigrex and Rajang are the same yellow, Teostra and Rathalos the same red —
  // and a factor keeps that relationship because it scales both ends. Normalising the
  // surfaces to equal brightness instead, however even it looks in isolation, collapses
  // every pair onto the same colour and throws the palette away.

  const THEME_KEY = "mh3u-log-theme";
  function applyTheme(hex) {
    const c = hexRgb(hex), r = document.documentElement.style;
    const bright = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
    const isLight = bright > 230;
    if (isLight) {
      r.setProperty("--bg", css(darken(c, .99)));
      r.setProperty("--bg1", css(darken(c, .99)));
      r.setProperty("--bg2", css(darken(c, .99)));
      r.setProperty("--hover", css(darken(c, .99)));
      r.setProperty("--accent", css(darken(c, .99)));
      r.setProperty("--accent-hover", css(darken(c, 0.1)));
      r.setProperty("--content-bg", css(darken(c, .99)));
      r.setProperty("--panel-bg", css(darken(c, .99)));
      r.setProperty("--input-bg", css(darken(c, .99)));
      r.setProperty("--titlebar-overlay", "rgba(0,0,0,0.02)");
    } else {
      r.setProperty("--bg", css(darken(c, .70)));
      r.setProperty("--bg1", css(darken(c, .80)));
      // The two big panes, named and valued as in the Collection Tracker: its grid
      // backdrop and its detail panel are the same job as the editor and the logbook here.
      r.setProperty("--content-bg", css(darken(c, .55)));
      r.setProperty("--panel-bg", css(darken(c, .40)));
      // Form fields, at the Tracker's --grid-bg value: its grid cells do the same job,
      // small inset controls on a tinted pane, and are likewise darker than what they sit
      // on rather than lighter. At --bg2 they read as lit panels on the brighter themes.
      r.setProperty("--input-bg", css(darken(c, .35)));
      r.setProperty("--bg2", css(darken(c, .95)));
      r.setProperty("--hover", css(darken(c, .30)));
      r.setProperty("--accent", css(darken(c, .7)));
      r.setProperty("--accent-hover", css(lighten(c, .4)));
      r.setProperty("--titlebar-overlay", "rgba(0,0,0,0.18)");
    }
    r.setProperty("--text", isLight ? "#000000" : "#ffffff");
    r.setProperty("--text-dim", isLight ? "#000000" : "#fffffff5");
    r.setProperty("--line", isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.14)");
    r.setProperty("--card", isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.05)");
    try { localStorage.setItem(THEME_KEY, hex); } catch (e) {}
    document.querySelectorAll(".swatch").forEach(s => s.classList.toggle("sel", s.dataset.hex === hex));
    const titleIcon = document.querySelector(".title-icon");
    if (titleIcon) {
      const name = COLORS_HEX[hex.toUpperCase()];
      titleIcon.src = name ? monsterIcon(COLORS_ICON[name] || name) : FALLBACK_ICON;
      titleIcon.onerror = () => { titleIcon.src = FALLBACK_ICON; titleIcon.onerror = null; };
    }
  }
  function buildSwatches() {
    const wrap = $("swatches");
    wrap.innerHTML = "";
    for (const [name, hex] of COLORS) {
      const d = el("div", "swatch");
      d.dataset.hex = hex;
      d.style.background = hex;
      d.title = name;
      const img = el("img", "swatch-icon");
      img.src = monsterIcon(COLORS_ICON[name] || name);
      img.alt = "";
      img.addEventListener("error", () => { img.src = FALLBACK_ICON; }, { once: true });
      d.append(img, el("span", null, name));
      d.addEventListener("click", () => applyTheme(hex));
      wrap.appendChild(d);
    }
  }

  // ── Narrow-screen view switching ─────────────────────────────────────────
  function setView(v) {
    $("app").dataset.view = v;
    $("tabEditor").classList.toggle("sel", v === "editor");
    $("tabLog").classList.toggle("sel", v === "log");
  }

  // ── Wiring ───────────────────────────────────────────────────────────────
  const modal = (btnId, modalId, closeId) => {
    $(btnId).addEventListener("click", () => $(modalId).classList.remove("hidden"));
    $(closeId).addEventListener("click", () => $(modalId).classList.add("hidden"));
    $(modalId).addEventListener("click", (e) => { if (e.target.id === modalId) $(modalId).classList.add("hidden"); });
  };
  modal("helpBtn", "helpModal", "helpClose");
  modal("linksBtn", "linksModal", "linksClose");
  modal("aboutBtn", "aboutModal", "aboutClose");
  modal("themeBtn", "themeModal", "themeClose");
  $("confirmModal").addEventListener("click", (e) => {
    if (e.target.id === "confirmModal") { $("confirmModal").classList.add("hidden"); confirmFn = null; }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".modal:not(.hidden)").forEach(m => m.classList.add("hidden"));
    confirmFn = null;
  });

  $("questSearch").addEventListener("input", filterTree);
  $("treeExpand").addEventListener("click", () => document.querySelectorAll(".qgrp").forEach(g => g.classList.add("open")));
  $("treeCollapse").addEventListener("click", () => document.querySelectorAll(".qgrp").forEach(g => g.classList.remove("open")));

  $("newBtn").addEventListener("click", () => { resetEditor(); setView("editor"); });
  $("newLogBtn").addEventListener("click", newLogbook);
  $("saveBtn").addEventListener("click", saveToFile);
  $("openBtn").addEventListener("click", openFile);
  $("saveEntryBtn").addEventListener("click", saveEntry);
  $("saveAsNewBtn").addEventListener("click", saveAsNewEntry);
  $("stampToggle").addEventListener("change", function () {
    autoStamp = this.checked;
    try { localStorage.setItem(STAMP_KEY, autoStamp ? "1" : "0"); } catch (e) {}
    syncStampSwitch();
    toast(autoStamp ? "Timestamp on — the date is set when you save."
                    : "Timestamp off — set the date yourself.");
  });
  $("farmingToggle").addEventListener("change", function () {
    farming = this.checked;
    try { localStorage.setItem(FARMING_KEY, farming ? "1" : "0"); } catch (e) {}
    syncFarmingSwitch();
    refreshEditorButtons();
    toast(farming ? "Farming on — the form stays filled after saving."
                  : "Farming off — the form clears after saving.");
  });
  $("cancelEntryBtn").addEventListener("click", () => resetEditor());
  $("deleteEntryBtn").addEventListener("click", () => {
    if (!editingId) return;
    const e = entries.find(x => x.id === editingId);
    if (e) confirmAction("Delete this entry?", entryQuestDisplay(e), () => deleteEntry(e.id));
  });
  // Mirror the editor to the draft on every keystroke, so an entry in progress survives
  // the tab closing. Delegated, so fields added later are covered without extra wiring.
  // The draft write is debounced, but the buttons have to answer the keystroke that just
  // happened, so they refresh immediately.
  const onEditorEdit = () => { scheduleDraftSave(); refreshEditorButtons(); };
  $("editorPane").addEventListener("input", onEditorEdit);
  $("editorPane").addEventListener("change", onEditorEdit);
  $("f_weaponType").addEventListener("change", syncWeapon);
  // Reformat as they type, then pad the minutes once they leave the field.
  $("f_time").addEventListener("input", function () {
    this.value = formatClearTime(this.value, false);
  });
  $("f_time").addEventListener("blur", function () {
    this.value = formatClearTime(this.value, true);
  });
  // Copies in the order shown, so what lands in Discord matches what's on screen.
  //
  // One entry comes out as the bare seven-line form, the way the old per-entry Copy did.
  // Several get a Date line each, because a run of otherwise-similar blocks is unreadable
  // without something to separate them.
  $("copySelBtn").addEventListener("click", () => {
    const picked = sortedEntries().filter(e => selected.has(e.id));
    if (!picked.length) return;
    const text = picked.map(e => entryToText(e, picked.length > 1)).join("\n\n");
    copyText(text, $("copySelBtn"));
  });
  $("selectAll").addEventListener("change", function () {
    const on = this.checked;
    entries.forEach(e => applyPick(e.id, on));
    pickAnchor = null;   // a bulk change leaves no meaningful place to extend a range from
    updateSelectionUI();
  });
  // Worth its own button rather than leaning on the All box: while a partial selection has
  // that box indeterminate, clicking it selects everything instead of clearing, so wiping
  // a few ticks otherwise takes two clicks and passes through "all 236 selected".
  $("clearSelBtn").addEventListener("click", () => {
    entries.forEach(e => applyPick(e.id, false));
    pickAnchor = null;
    updateSelectionUI();
  });
  $("sortBy").addEventListener("change", function () {
    sortBy = SORTS[this.value] ? this.value : "dateDesc";
    try { localStorage.setItem(SORT_KEY, sortBy); } catch (e) {}
    renderLog();
    if (editingId) {
      document.querySelectorAll(".log-entry").forEach(n => n.classList.toggle("sel", n.dataset.id === editingId));
    }
  });
  $("groupBy").addEventListener("change", function () {
    groupBy = GROUPINGS[this.value] ? this.value : "none";
    try { localStorage.setItem(GROUP_KEY, groupBy); } catch (e) {}
    renderLog();
    // Keep the entry being edited highlighted through the re-render.
    if (editingId) {
      document.querySelectorAll(".log-entry").forEach(n => n.classList.toggle("sel", n.dataset.id === editingId));
    }
  });
  $("tabEditor").addEventListener("click", () => setView("editor"));
  $("tabLog").addEventListener("click", () => setView("log"));

  // ── Boot ─────────────────────────────────────────────────────────────────
  WEAPONS.forEach(w => $("f_weaponType").add(new Option(w, w)));
  buildSwatches();
  // Fall back to the default when the stored hex is no longer in the palette — a theme
  // that has since been removed would otherwise load with no swatch to match it, leaving
  // the picker showing nothing as selected.
  const DEFAULT_THEME = "#1E2025";
  let savedTheme = DEFAULT_THEME;
  try { savedTheme = migrateHex(localStorage.getItem(THEME_KEY)) || savedTheme; } catch (e) {}
  if (!COLORS_HEX[String(savedTheme).toUpperCase()]) savedTheme = DEFAULT_THEME;
  applyTheme(savedTheme);

  $("sortBy").value = sortBy;
  $("groupBy").value = groupBy;
  syncFarmingSwitch();
  syncStampSwitch();
  buildTree();
  filterTree();
  loadAutosave();
  renderLog();
  refreshPartyNames();
  // Read before resetEditor(), which writes the draft and would clear it.
  let bootDraft = null;
  try { bootDraft = localStorage.getItem(DRAFT_KEY); } catch (e) {}
  resetEditor();
  // After resetEditor, so the restored draft wins over the blank form it just built.
  if (loadDraft(bootDraft)) {
    writeDraft();   // put it back, since resetEditor just cleared the stored copy
    toast("Picked up the entry you were writing.");
  }
  setView("editor");

  // Force a repaint after the MHFU custom font loads to prevent select text clipping.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      document.querySelectorAll("select").forEach(s => {
        s.style.display = "none"; s.offsetHeight; s.style.display = "";
      });
    });
  }
})();
