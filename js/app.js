"use strict";

/* ============ Constantes ============ */

const LS_KEY = "quiz-tssr2601-v1";
const POINTS = { 1: 1, 2: 2, 3: 3, 4: 5 };
const LEVEL_NAMES = { 1: "connaissance", 2: "compréhension", 3: "application", 4: "analyse" };
const LEVEL_COLORS = { 1: "#63D471", 2: "#38BDF8", 3: "#FBBF24", 4: "#F87171" };
const UNLOCK_MIN_ATTEMPTS = 8;
const UNLOCK_RATE = 0.7;
const SESSION_SIZE = 10;
const EXAM_SIZE = 20;
const EXAM_MINUTES = 20;

const GRADES = [
  { xp: 0, name: "stagiaire", icon: "ti-plug" },
  { xp: 250, name: "technicien junior", icon: "ti-tool" },
  { xp: 750, name: "technicien systèmes", icon: "ti-device-desktop" },
  { xp: 1500, name: "administrateur junior", icon: "ti-server" },
  { xp: 3000, name: "administrateur systèmes et réseaux", icon: "ti-server-2" },
  { xp: 5000, name: "expert infrastructure", icon: "ti-topology-star-3" },
  { xp: 8000, name: "root@tssr", icon: "ti-terminal-2" }
];

const BADGES = [
  { id: "dora", name: "DORA maîtrisée", desc: "90 % de réussite au module DHCP (20 réponses min.)", icon: "ti-refresh", color: "var(--green)",
    test: s => moduleStats("DHCP").a >= 20 && moduleStats("DHCP").c / moduleStats("DHCP").a >= 0.9 },
  { id: "masques", name: "Chasseur de masques", desc: "20 bonnes réponses en adressage IP", icon: "ti-calculator", color: "var(--cyan)",
    test: s => moduleStats("Adressage IP & CIDR").c >= 20 },
  { id: "serie7", name: "Série de 7 jours", desc: "Jouer 7 jours d'affilée", icon: "ti-flame", color: "var(--amber)",
    test: s => dayStreak(s) >= 7 },
  { id: "cent", name: "Première centaine", desc: "Donner 100 réponses (répétitions comprises)", icon: "ti-stack-2", color: "var(--violet)",
    test: s => s.cnt.total >= 100 },
  { id: "sansfilet", name: "Sans filet", desc: "20 bonnes réponses d'affilée", icon: "ti-target-arrow", color: "var(--red)",
    test: s => s.cnt.best >= 20 },
  { id: "exam90", name: "Examen blanc 90 %", desc: "Obtenir au moins 90 % en mode examen", icon: "ti-trophy", color: "var(--amber)",
    test: s => s.cnt.examBest >= 90 },
  { id: "nuit", name: "Oiseau de nuit", desc: "Répondre à une question entre minuit et 5 h", icon: "ti-moon", color: "var(--blue)",
    test: s => s.cnt.night === true },
  { id: "root", name: "root access", desc: "Niveau 4 débloqué dans tous les thèmes disponibles", icon: "ti-key", color: "var(--cyan)",
    test: s => MANIFEST.themes.filter(t => t.modules.length).every(t => unlockedLevel(t.id) >= 4) }
];

/* ============ État ============ */

let MANIFEST = null;
let BANK = [];
let state = load();

function defaultState() {
  return {
    v: 1, xp: 0, gen: 0, owner: null,
    q: {},
    lv: {},
    review: [],
    cnt: { total: 0, ok: 0, streak: 0, best: 0, exams: 0, examBest: 0, night: false, days: [] },
    badges: []
  };
}

/* Normalisation profonde : tout état (local, cloud, ancien schéma) est reconstruit
   champ par champ sur defaultState() — jamais de sous-objet remplacé en bloc. */
function normalizeState(raw) {
  const d = defaultState();
  if (!raw || typeof raw !== "object") return d;
  d.xp = Math.max(0, Number(raw.xp) || 0);
  d.gen = Math.max(0, Number(raw.gen) || 0);
  d.owner = typeof raw.owner === "string" ? raw.owner : null;
  if (raw.q && typeof raw.q === "object") {
    for (const k in raw.q) {
      const s = raw.q[k];
      if (s && typeof s === "object") d.q[k] = { a: Number(s.a) || 0, c: Number(s.c) || 0, s: Number(s.s) || 0 };
    }
  }
  if (raw.lv && typeof raw.lv === "object") {
    for (const t in raw.lv) {
      const lv = raw.lv[t];
      if (!lv || typeof lv !== "object") continue;
      d.lv[t] = {};
      for (const n in lv) {
        const x = lv[n];
        if (x && typeof x === "object") d.lv[t][n] = { a: Number(x.a) || 0, c: Number(x.c) || 0 };
      }
    }
  }
  if (Array.isArray(raw.review)) d.review = raw.review.filter(x => typeof x === "string");
  if (Array.isArray(raw.badges)) d.badges = raw.badges.filter(x => typeof x === "string");
  const c = (raw.cnt && typeof raw.cnt === "object") ? raw.cnt : {};
  d.cnt = {
    total: Number(c.total) || 0, ok: Number(c.ok) || 0,
    streak: Number(c.streak) || 0, best: Number(c.best) || 0,
    exams: Number(c.exams) || 0, examBest: Number(c.examBest) || 0,
    night: c.night === true,
    days: Array.isArray(c.days) ? c.days.filter(x => typeof x === "string") : []
  };
  return d;
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return normalizeState(JSON.parse(raw));
  } catch (e) { /* état corrompu → repartir de zéro */ }
  return defaultState();
}
function persist() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  catch (e) { console.warn("Stockage local indisponible :", e); }
}
function save() {
  persist();
  if (typeof onlinePushSoon === "function") onlinePushSoon(state, gradeIndex() + 1);
}

/* ============ Aides ============ */

const $ = sel => document.querySelector(sel);
const screen = $("#screen");
const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

function dayStreak(s) {
  const days = new Set(s.cnt.days);
  let streak = 0;
  const d = new Date();
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function moduleStats(moduleName) {
  let a = 0, c = 0;
  for (const q of BANK) {
    if (q.module !== moduleName) continue;
    const st = state.q[q.id];
    if (st) { a += st.a; c += st.c; }
  }
  return { a, c };
}

function themeLevelStats(themeId, niveau) {
  const lv = state.lv[themeId];
  return (lv && lv[niveau]) ? lv[niveau] : { a: 0, c: 0 };
}

function unlockedLevel(themeId) {
  let max = 1;
  for (let n = 1; n <= 3; n++) {
    const count = BANK.filter(q => q.theme === themeId && q.niveau === n).length;
    if (count === 0) {
      if (max === n) max = n + 1;
      continue;
    }
    const st = themeLevelStats(themeId, n);
    if (st.a >= UNLOCK_MIN_ATTEMPTS && st.c / st.a >= UNLOCK_RATE) max = n + 1;
    else break;
  }
  return max;
}

function gradeIndex() {
  let idx = 0;
  for (let i = 0; i < GRADES.length; i++) if (state.xp >= GRADES[i].xp) idx = i;
  return idx;
}

function setPath(p) { $("#tb-path").textContent = p; }

function toast(html) {
  const el = document.createElement("div");
  el.className = "toast-item";
  el.innerHTML = html;
  $("#toast").appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

let pendingToasts = [];

function checkBadges() {
  for (const b of BADGES) {
    if (!state.badges.includes(b.id) && b.test(state)) {
      state.badges.push(b.id);
      const html = `<i class="ti ${b.icon}"></i> Badge débloqué : <b>${esc(b.name)}</b>`;
      if (session && session.exam) pendingToasts.push(html);
      else toast(html);
    }
  }
}

function updateNavPill(force) {
  if (!force && session && session.exam) return;
  const pill = $("#rev-count");
  if (state.review.length) { pill.hidden = false; pill.textContent = state.review.length; }
  else pill.hidden = true;
}

/* ============ Enregistrement d'une réponse ============ */

function recordAnswer(q, correct, exam) {
  const st = state.q[q.id] || (state.q[q.id] = { a: 0, c: 0, s: 0 });
  st.a++;
  if (correct) { st.c++; st.s++; } else st.s = 0;

  const lv = state.lv[q.theme] || (state.lv[q.theme] = {});
  const ls = lv[q.niveau] || (lv[q.niveau] = { a: 0, c: 0 });
  ls.a++;
  if (correct) ls.c++;

  state.cnt.total++;
  if (correct) {
    state.cnt.ok++;
    state.cnt.streak++;
    if (state.cnt.streak > state.cnt.best) state.cnt.best = state.cnt.streak;
    state.xp += POINTS[q.niveau] * (exam ? 2 : 1) * (q.type === "tp" ? 2 : 1);
  } else {
    state.cnt.streak = 0;
    if (!state.review.includes(q.id)) state.review.push(q.id);
  }

  const h = new Date().getHours();
  if (h >= 0 && h < 5) state.cnt.night = true;
  const today = todayStr();
  if (!state.cnt.days.includes(today)) {
    state.cnt.days.push(today);
    if (state.cnt.days.length > 400) state.cnt.days = state.cnt.days.slice(-400);
  }

  if (state.review.includes(q.id)) {
    if (correct && st.s >= 2) state.review = state.review.filter(id => id !== q.id);
  }

  checkBadges();
  save();
  updateNavPill();
}

/* ============ Chargement de la banque ============ */

async function loadBank() {
  const res = await fetch("questions/manifest.json", { cache: "no-cache" });
  MANIFEST = await res.json();
  for (const theme of MANIFEST.themes) {
    for (const mod of theme.modules) {
      const data = await (await fetch("questions/" + mod.file + "?v=" + MANIFEST.version)).json();
      for (const q of data.questions) {
        q.theme = theme.id;
        q.themeName = theme.name;
        q.themeColor = theme.color;
        q.module = data.module;
        q.src = data.source;
        BANK.push(q);
      }
    }
  }
}

/* ============ Écrans ============ */

let navToken = 0;

function updateOnlineBadge() {
  const el = document.getElementById("online-badge");
  if (!el) return;
  const st = (typeof onlineStatus === "function") ? onlineStatus() : "local";
  if (st === "ok") { el.textContent = "● " + onlineUser.pseudo; el.style.color = "var(--green)"; }
  else if (st === "erreur") { el.textContent = "● synchro en échec"; el.style.color = "var(--amber)"; }
  else { el.textContent = "● local"; el.style.color = "var(--dim)"; }
}

function nav(page) {
  navToken++;
  document.querySelectorAll(".nav button").forEach(b => b.classList.toggle("active", b.dataset.nav === page));
  if (page === "home") showHome();
  else if (page === "exam") showExamIntro();
  else if (page === "review") showReview();
  else if (page === "board") showBoard();
  else if (page === "profile") showProfile();
}

function showHome() {
  setPath("./quiz --themes");
  const g = GRADES[gradeIndex()];
  let cards = "";
  for (const t of MANIFEST.themes) {
    const count = BANK.filter(q => q.theme === t.id).length;
    const off = t.modules.length === 0;
    const icon = t.icon.startsWith("devicon") ? `<i class="${t.icon}"></i>` : `<i class="${t.icon}"></i>`;
    cards += `
      <div class="card ${off ? "off" : ""}" data-theme="${t.id}" style="--c:${t.color}">
        <div class="chip" style="background:${t.color}22; color:${t.color}">${icon}</div>
        <h3>${esc(t.name)}</h3>
        <p>${esc(t.sub)}</p>
        <p class="count" style="color:${off ? "var(--dim)" : t.color}">${off ? "bientôt disponible" : count + " questions"}</p>
      </div>`;
  }
  const pct = state.cnt.total ? Math.round(state.cnt.ok / state.cnt.total * 100) : 0;
  screen.innerHTML = `
    <h1 style="margin-bottom:14px">Root Camp</h1>
    <div class="grid">${cards}</div>
    <div class="wide" id="go-exam" style="${examUnlocked().ok ? "" : "opacity:.65"}">
      <div class="chip"><i class="ti ${examUnlocked().ok ? "ti-clock-bolt" : "ti-lock"}"></i></div>
      <div><h3>Mode examen</h3><p>${examUnlocked().ok
        ? `${EXAM_SIZE} questions aléatoires · ${EXAM_MINUTES} min · XP doublés`
        : "verrouillé — validez le niveau 1 de chaque thème"}</p></div>
      <i class="ti ti-chevron-right arrow"></i>
    </div>
    <div class="wide" id="go-rules" style="background:var(--panel); border-color:var(--line2)">
      <div class="chip" style="background:var(--panel2); color:var(--cyan)"><i class="ti ti-book-2"></i></div>
      <div><h3 style="color:var(--txt)">Règles du jeu</h3><p style="color:var(--dim)">niveaux · points · grades · badges · classement</p></div>
      <i class="ti ti-chevron-right arrow" style="color:var(--dim)"></i>
    </div>
    <div class="stats">
      <div class="stat"><p style="color:var(--cyan2)">réponses</p><b>${state.cnt.total}</b></div>
      <div class="stat"><p style="color:var(--green)">réussite</p><b>${pct}%</b></div>
      <div class="stat"><p style="color:var(--amber)">à revoir</p><b>${state.review.length}</b></div>
    </div>`;
  document.querySelectorAll(".card[data-theme]").forEach(c => {
    const t = MANIFEST.themes.find(x => x.id === c.dataset.theme);
    if (t.modules.length) c.onclick = () => showTheme(t);
  });
  $("#go-exam").onclick = () => nav("exam");
  $("#go-rules").onclick = showRules;
}

function showRules() {
  setPath("./quiz --regles");
  const lvRows = [1, 2, 3, 4].map(n => `
    <div class="rank-row">
      <span class="lvl" style="width:26px; height:26px; border-radius:6px; display:inline-flex; align-items:center; justify-content:center;
        background:${LEVEL_COLORS[n]}22; color:${LEVEL_COLORS[n]}; font-weight:600">${n}</span>
      <span>${LEVEL_NAMES[n]}</span>
      <span class="xp">${POINTS[n]} XP / bonne réponse</span>
    </div>`).join("");
  screen.innerHTML = `
    <div class="qhead">
      <button class="btn small" id="back"><i class="ti ti-arrow-left"></i> Accueil</button>
      <span class="qmeta" style="color:var(--cyan)">règles du jeu</span>
    </div>
    <h1 style="margin-bottom:14px">Comment ça marche</h1>

    <p class="section-title"># le principe</p>
    <div class="feedback" style="margin-top:0">
      Chaque thème (Réseaux, Windows/AD, Linux...) regroupe des questions générées à partir des fiches du cours TSSR.
      Vous choisissez un thème puis un niveau : chaque session propose jusqu'à ${SESSION_SIZE} questions,
      avec la correction et l'explication après chaque réponse.
    </div>

    <p class="section-title"># les 4 niveaux de difficulté</p>
    ${lvRows}
    <div class="feedback">
      Chaque thème démarre à son premier niveau disponible. Pour débloquer le niveau suivant :
      donner au moins ${UNLOCK_MIN_ATTEMPTS} réponses au niveau en cours avec
      <b style="color:var(--green)">${Math.round(UNLOCK_RATE * 100)} % de réussite</b>.
    </div>

    <p class="section-title"># les types de questions</p>
    <div class="feedback" style="margin-top:0">
      <p style="margin-bottom:6px"><i class="ti ti-list-check" style="color:var(--cyan)"></i> <b>QCM</b> — une seule bonne réponse</p>
      <p style="margin-bottom:6px"><i class="ti ti-checkbox" style="color:var(--cyan)"></i> <b>Choix multiples</b> — cochez toutes les bonnes réponses, puis validez</p>
      <p style="margin-bottom:6px"><i class="ti ti-arrows-left-right" style="color:var(--cyan)"></i> <b>Association</b> — reliez chaque élément de gauche à sa correspondance à droite</p>
      <p style="margin-bottom:6px"><i class="ti ti-sort-ascending-numbers" style="color:var(--cyan)"></i> <b>Remise en ordre</b> — cliquez les étapes dans le bon ordre</p>
      <p style="margin-bottom:6px"><i class="ti ti-keyboard" style="color:var(--cyan)"></i> <b>Champ libre</b> — tapez la réponse exacte (valeur ou commande)</p>
      <p style="margin-bottom:6px"><i class="ti ti-stethoscope" style="color:var(--cyan)"></i> <b>Scénario</b> — une situation réelle à diagnostiquer, comme le jour J</p>
      <p style="margin-bottom:6px"><i class="ti ti-terminal" style="color:var(--cyan)"></i> <b>Terminal simulé</b> — tapez la commande dans une vraie console : si elle est juste, son résultat s'affiche comme en réel</p>
      <p><i class="ti ti-flask" style="color:var(--cyan)"></i> <b>Mini-TP</b> — une session guidée en plusieurs étapes (IOS, Bash, PowerShell) : le prompt évolue comme en vrai, indice après une erreur, <b>XP doublés</b></p>
    </div>

    <p class="section-title"># examen blanc</p>
    <div class="feedback" style="margin-top:0">
      L'examen se débloque une fois le niveau 1 validé dans chaque thème.
      ${EXAM_SIZE} questions tirées de tous les thèmes (hors Atelier TP), ${EXAM_MINUTES} minutes chrono, aucune correction pendant l'épreuve.
      Les bonnes réponses rapportent <b style="color:var(--cyan)">le double d'XP</b>.
      À la fin : le corrigé de vos erreurs et des questions non traitées. Seuil de réussite : 60 %.
    </div>

    <p class="section-title"># révision (à revoir)</p>
    <div class="feedback" style="margin-top:0">
      Chaque erreur envoie la question dans la pile « à revoir ».
      Pour l'en sortir : <b style="color:var(--amber)">2 bonnes réponses d'affilée</b> sur cette question.
      Le principe : on retravaille ce qu'on rate, pas ce qu'on sait déjà.
    </div>

    <p class="section-title"># grades et classement</p>
    <div class="feedback" style="margin-top:0">
      L'XP cumulé fait monter votre grade : de <b>stagiaire</b> à <b style="color:var(--cyan)">root@tssr</b> (7 échelons —
      détail dans l'onglet Profil). Les examens blancs et les mini-TP rapportent le double d'XP.
      Créez un compte (pseudo + mot de passe, onglet Profil) pour apparaître dans le <b>classement du groupe</b>
      et synchroniser votre progression entre PC et téléphone. Sans compte, tout reste enregistré localement.
    </div>

    <p class="section-title"># badges</p>
    <div class="feedback" style="margin-top:0">
      ${BADGES.length} badges à débloquer : maîtrise d'un module, régularité, exploits...
      La collection complète est visible dans l'onglet Profil.
    </div>

    <button class="btn accent" id="rules-go" style="width:100%; text-align:center; padding:12px; margin-top:16px">
      <i class="ti ti-player-play"></i> C'est parti
    </button>`;
  $("#back").onclick = () => nav("home");
  $("#rules-go").onclick = () => nav("home");
}

function showTheme(theme) {
  setPath(`./quiz --theme ${theme.id}`);
  const unlocked = unlockedLevel(theme.id);
  let rows = "";
  for (let n = 1; n <= 4; n++) {
    const count = BANK.filter(q => q.theme === theme.id && q.niveau === n).length;
    const st = themeLevelStats(theme.id, n);
    const vide = count === 0;
    const locked = n > unlocked || vide;
    const rate = st.a ? Math.round(st.c / st.a * 100) : null;
    rows += `
      <div class="level-row ${locked ? "locked" : ""}" data-lvl="${n}">
        <div class="lvl" style="background:${LEVEL_COLORS[n]}22; color:${LEVEL_COLORS[n]}">${vide ? "–" : (locked ? '<i class="ti ti-lock"></i>' : n)}</div>
        <div>
          <h3>Niveau ${n} — ${LEVEL_NAMES[n]}</h3>
          <p>${vide ? "aucune question à ce niveau" : count + " questions" + (locked ? ` · pour débloquer : ≥ ${UNLOCK_MIN_ATTEMPTS} réponses au niveau ${n - 1} avec ${Math.round(UNLOCK_RATE * 100)} % de réussite` : "")}</p>
        </div>
        <div class="right">${rate !== null ? rate + " %<br>" + st.a + " rép." : ""}</div>
      </div>`;
  }
  const modules = theme.modules.map(m => {
    const ms = moduleStats(m.name);
    const rate = ms.a ? ` · ${Math.round(ms.c / ms.a * 100)} %` : "";
    return `<span class="badge-pill" style="background:${theme.color}22; color:${theme.color}">${esc(m.name)}${rate}</span>`;
  }).join(" ");
  screen.innerHTML = `
    <div class="qhead">
      <button class="btn small" id="back"><i class="ti ti-arrow-left"></i> Thèmes</button>
      <span class="qmeta" style="color:${theme.color}">${esc(theme.name)}</span>
    </div>
    <p class="comment"># choisissez un niveau de difficulté</p>
    <div class="level-list">${rows}</div>
    <p class="section-title"># modules couverts</p>
    <p>${modules}</p>`;
  $("#back").onclick = () => nav("home");
  document.querySelectorAll(".level-row:not(.locked)").forEach(r => {
    r.onclick = () => {
      const n = parseInt(r.dataset.lvl, 10);
      const pool = drawPreferUnseen(BANK.filter(q => q.theme === theme.id && q.niveau === n), SESSION_SIZE);
      if (!pool.length) return;
      startSession(pool, { title: `${theme.name} · niveau ${n}`, color: theme.color, back: () => showTheme(theme) });
    };
  });
}

/* ============ Session de questions ============ */

let session = null;

function startSession(questions, opts) {
  session = {
    qs: questions, idx: 0, ok: 0, xpStart: state.xp,
    exam: !!opts.exam, title: opts.title, color: opts.color || "var(--cyan)",
    back: opts.back || (() => nav("home")),
    wrong: [], answered: [], review: !!opts.review,
    reviewStart: state.review.length,
    done: false, nextTimer: null,
    deadline: opts.exam ? Date.now() + EXAM_MINUTES * 60000 : null, timer: null
  };
  renderQuestion();
}

function endTimer() { if (session && session.timer) { clearInterval(session.timer); session.timer = null; } }

function renderQuestion() {
  endTimer();
  if (!session || session.idx >= session.qs.length) return showResult();
  const q = session.qs[session.idx];
  setPath(session.exam ? "./quiz --examen" : `./quiz --session`);

  const head = `
    <div class="qhead">
      <button class="btn small" id="quit"><i class="ti ti-x"></i> Quitter</button>
      <span class="qmeta" style="color:${session.color}">${esc(session.title)} · ${session.idx + 1}/${session.qs.length}</span>
      ${session.exam ? '<span class="qmeta" id="timer" style="color:var(--amber)"></span>' : ""}
    </div>
    <div class="progress"><div style="width:${Math.round(session.idx / session.qs.length * 100)}%; background:${session.color}"></div></div>
    <span class="badge-pill" style="background:${LEVEL_COLORS[q.niveau]}22; color:${LEVEL_COLORS[q.niveau]}; margin-bottom:10px">niveau ${q.niveau} · ${LEVEL_NAMES[q.niveau]}</span>
    ${q.context ? `<div class="context">${esc(q.context)}</div>` : ""}
    <p class="question">${esc(q.q)}</p>`;

  let body = "";
  if (q.type === "qcm" || q.type === "scenario") body = `<div class="answers" id="answers"></div>`;
  else if (q.type === "multi") body = `<div class="answers" id="answers"></div><button class="btn accent" id="validate" style="margin-top:12px">Valider</button>`;
  else if (q.type === "assoc") body = `<div class="pairs"><div class="col" id="colL"></div><div class="col" id="colR"></div></div>`;
  else if (q.type === "ordre") body = `<p class="comment"># cliquez les éléments dans le bon ordre</p><div class="answers" id="answers"></div>`;
  else if (q.type === "libre") body = `<div class="libre-row"><input id="libre" autocomplete="off" spellcheck="false" placeholder="votre réponse..."><button class="btn accent" id="validate">Valider</button></div>`;
  else if (q.type === "terminal" || q.type === "tp") body = `
    <div class="term">
      <div class="term-head">
        <span class="dot red"></span><span class="dot amber"></span><span class="dot green"></span>
        <span style="margin-left:6px">${q.type === "tp" ? "mini-TP guidé — une commande par étape" : "simulation — tapez la commande puis Entrée"}</span>
      </div>
      <div class="term-body" id="term-body"></div>
    </div>`;

  screen.innerHTML = head + body + `<div id="fb"></div>`;
  $("#quit").onclick = () => {
    endTimer();
    if (session.nextTimer) clearTimeout(session.nextTimer);
    pendingToasts.forEach(toast);
    pendingToasts = [];
    const back = session.back;
    session = null;
    updateNavPill();
    back();
  };

  if (session.exam) {
    const tick = () => {
      const left = Math.max(0, session.deadline - Date.now());
      const m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
      $("#timer").textContent = `⏱ ${m}:${String(s).padStart(2, "0")}`;
      if (left <= 0) { endTimer(); showResult(true); }
    };
    tick();
    session.timer = setInterval(tick, 1000);
  }

  if (q.type === "qcm" || q.type === "scenario") renderQCM(q);
  else if (q.type === "multi") renderMulti(q);
  else if (q.type === "assoc") renderAssoc(q);
  else if (q.type === "ordre") renderOrdre(q);
  else if (q.type === "libre") renderLibre(q);
  else if (q.type === "terminal") renderTerminal(q);
  else if (q.type === "tp") renderTP(q);
}

function letters(i) { return String.fromCharCode(65 + i); }

function renderQCM(q) {
  const box = $("#answers");
  const order = shuffle(q.choices.map((c, i) => i));
  order.forEach(i => {
    const b = document.createElement("button");
    b.className = "btn full";
    b.innerHTML = `<span class="letter" style="background:${session.color}22; color:${session.color}">${letters(box.children.length)}</span>${esc(q.choices[i])}`;
    b.onclick = () => {
      const correct = i === q.answer;
      [...box.children].forEach(x => x.disabled = true);
      if (session.exam) {
        b.classList.add("picked");
      } else {
        [...box.children].forEach((x, k) => { if (order[k] === q.answer) x.classList.add("good"); });
        if (!correct) b.classList.add("bad");
      }
      finishQuestion(q, correct);
    };
    box.appendChild(b);
  });
}

function renderMulti(q) {
  const box = $("#answers");
  const order = shuffle(q.choices.map((c, i) => i));
  const picked = new Set();
  order.forEach(i => {
    const b = document.createElement("button");
    b.className = "btn full";
    b.innerHTML = `<span class="letter" style="background:${session.color}22; color:${session.color}">${letters(box.children.length)}</span>${esc(q.choices[i])}`;
    b.onclick = () => {
      if (picked.has(i)) { picked.delete(i); b.classList.remove("picked"); }
      else { picked.add(i); b.classList.add("picked"); }
    };
    box.appendChild(b);
  });
  $("#validate").onclick = () => {
    const good = new Set(q.answer);
    const correct = picked.size === good.size && [...picked].every(x => good.has(x));
    [...box.children].forEach(x => x.disabled = true);
    if (!session.exam) {
      [...box.children].forEach((x, k) => {
        if (good.has(order[k])) x.classList.add("good");
        else if (picked.has(order[k])) x.classList.add("bad");
      });
    }
    $("#validate").remove();
    finishQuestion(q, correct);
  };
}

function renderAssoc(q) {
  const colL = $("#colL"), colR = $("#colR");
  const rights = shuffle(q.pairs.map(p => p[1]));
  let selL = null, selR = null, done = 0, errors = 0;
  const mk = (txt, col) => {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = txt;
    col.appendChild(b);
    return b;
  };
  const check = () => {
    if (!selL || !selR) return;
    const ok = q.pairs.some(p => p[0] === selL.textContent && p[1] === selR.textContent);
    const L = selL, R = selR;
    selL = selR = null;
    if (ok) {
      [L, R].forEach(x => { x.classList.remove("sel"); x.classList.add("done"); x.disabled = true; });
      if (++done === q.pairs.length) finishQuestion(q, errors === 0);
    } else {
      errors++;
      [L, R].forEach(x => { x.classList.remove("sel"); x.classList.add("err"); });
      setTimeout(() => [L, R].forEach(x => x.classList.remove("err")), 500);
    }
  };
  q.pairs.forEach(p => {
    const b = mk(p[0], colL);
    b.onclick = () => { if (b.disabled) return; if (selL) selL.classList.remove("sel"); selL = b; b.classList.add("sel"); check(); };
  });
  rights.forEach(r => {
    const b = mk(r, colR);
    b.onclick = () => { if (b.disabled) return; if (selR) selR.classList.remove("sel"); selR = b; b.classList.add("sel"); check(); };
  });
}

function renderOrdre(q) {
  const box = $("#answers");
  let expect = 0, errors = 0;
  shuffle(q.steps).forEach(step => {
    const b = document.createElement("button");
    b.className = "btn full";
    b.textContent = step;
    b.onclick = () => {
      if (b.disabled) return;
      if (q.steps[expect] === step) {
        b.classList.add("good");
        b.disabled = true;
        b.textContent = `${expect + 1}. ${step}`;
        if (++expect === q.steps.length) finishQuestion(q, errors === 0);
      } else {
        errors++;
        b.classList.add("bad");
        setTimeout(() => b.classList.remove("bad"), 500);
      }
    };
    box.appendChild(b);
  });
}

function normalize(t) { return t.toLowerCase().trim().replace(/\s+/g, " "); }

function renderLibre(q) {
  const input = $("#libre");
  input.focus();
  const submit = () => {
    const val = normalize(input.value);
    if (!val) return;
    const correct = q.accept.map(normalize).includes(val);
    input.disabled = true;
    if (!session.exam) input.style.borderColor = correct ? "var(--green)" : "var(--red)";
    $("#validate").remove();
    if (!correct && !session.exam) {
      const fb = $("#fb");
      fb.insertAdjacentHTML("afterbegin",
        `<p class="comment" style="margin-top:10px">réponse attendue : <b style="color:var(--green)">${esc(q.accept[0])}</b></p>`);
    }
    finishQuestion(q, correct);
  };
  $("#validate").onclick = submit;
  input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
}

function renderTerminal(q) {
  const body = $("#term-body");
  const promptTxt = q.prompt || "$";
  const addLine = (txt, cls) => {
    const d = document.createElement("div");
    d.className = "line" + (cls ? " " + cls : "");
    d.textContent = txt;
    body.appendChild(d);
    return d;
  };
  const inputLine = document.createElement("div");
  inputLine.className = "line";
  inputLine.innerHTML = `<span class="term-prompt">${esc(promptTxt)} </span>`;
  const input = document.createElement("input");
  input.className = "term-input";
  input.autocomplete = "off";
  input.spellcheck = false;
  inputLine.appendChild(input);
  body.appendChild(inputLine);
  input.focus();

  input.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    const val = input.value;
    if (!normalize(val)) return;
    input.disabled = true;
    inputLine.remove();
    addLine(promptTxt + " " + val);
    const correct = q.accept.map(normalize).includes(normalize(val));
    if (session.exam) {
      addLine("# réponse enregistrée", "cmt");
    } else if (correct) {
      if (q.output) q.output.split("\n").forEach(l => addLine(l, "out"));
      addLine("# commande acceptée ✓", "ok");
    } else {
      addLine(q.error || "'" + val.trim() + "' : commande incorrecte ou incomplète", "ko");
      addLine("# commande attendue : " + q.accept[0], "cmt");
      if (q.output) q.output.split("\n").forEach(l => addLine(l, "out"));
    }
    finishQuestion(q, correct);
  });
}

function renderTP(q) {
  const body = $("#term-body");
  let idx = 0, errors = 0, attempts = 0;
  const histoire = [];
  let histIdx = -1;
  const brancheHistorique = input => {
    input.addEventListener("keydown", e => {
      if (e.key === "ArrowUp") {
        if (!histoire.length) return;
        e.preventDefault();
        histIdx = histIdx < 0 ? histoire.length - 1 : Math.max(0, histIdx - 1);
        input.value = histoire[histIdx];
        requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
      } else if (e.key === "ArrowDown") {
        if (histIdx < 0) return;
        e.preventDefault();
        histIdx++;
        if (histIdx >= histoire.length) { histIdx = -1; input.value = ""; }
        else input.value = histoire[histIdx];
      }
    });
  };
  const addLine = (txt, cls) => {
    const d = document.createElement("div");
    d.className = "line" + (cls ? " " + cls : "");
    d.textContent = txt;
    body.appendChild(d);
    return d;
  };
  const askInput = st => {
    const line = document.createElement("div");
    line.className = "line";
    line.innerHTML = `<span class="term-prompt">${esc(st.prompt || "$")} </span>`;
    const input = document.createElement("input");
    input.className = "term-input";
    input.autocomplete = "off";
    input.spellcheck = false;
    line.appendChild(input);
    body.appendChild(line);
    input.focus();
    input.scrollIntoView({ block: "nearest" });
    brancheHistorique(input);
    input.addEventListener("keydown", e => {
      if (e.key !== "Enter") return;
      const val = input.value;
      if (!normalize(val)) return;
      histoire.push(val);
      histIdx = -1;
      line.remove();
      addLine((st.prompt || "$") + " " + val);
      if (st.accept.map(normalize).includes(normalize(val))) {
        attempts = 0;
        if (st.output) st.output.split("\n").forEach(l => addLine(l, "out"));
        idx++;
        if (idx >= q.steps.length) {
          addLine(errors === 0 ? "# TP terminé sans erreur ✓" : `# TP terminé — ${errors} erreur(s) en route`, errors === 0 ? "ok" : "cmt");
          finishQuestion(q, errors === 0);
        } else nextStep();
      } else {
        errors++;
        attempts++;
        addLine(st.error || "% Commande incorrecte ou incomplète", "ko");
        if (attempts === 1 && st.hint) addLine("# indice : " + st.hint, "cmt");
        if (attempts >= 3) addLine("# solution : " + st.accept[0], "cmt");
        askInput(st);
      }
    });
  };
  const nextStep = () => {
    const st = q.steps[idx];
    addLine(`# étape ${idx + 1}/${q.steps.length} — ${st.q}`, "cmt");
    askInput(st);
  };
  nextStep();
}

function finishQuestion(q, correct) {
  recordAnswer(q, correct, session.exam);
  if (correct) session.ok++;
  else session.wrong.push(q);
  session.answered.push(q.id);

  const fb = $("#fb");
  const last = session.idx + 1 >= session.qs.length;
  if (session.exam) {
    const s = session;
    s.nextTimer = setTimeout(() => {
      s.nextTimer = null;
      if (session !== s || s.done) return;
      s.idx++;
      renderQuestion();
    }, 600);
    return;
  }
  const pts = POINTS[q.niveau] * (q.type === "tp" ? 2 : 1);
  fb.insertAdjacentHTML("beforeend", `
    <div class="feedback">
      <p class="verdict" style="color:${correct ? "var(--green)" : "var(--red)"}">
        ${correct ? `✓ correct · +${pts} XP` : "✗ incorrect · la question part en révision"}
      </p>
      ${esc(q.explication)}
      <span class="src">source : ${esc(q.src)}</span>
    </div>
    <button class="btn accent" id="next" style="margin-top:12px">
      ${last ? "Voir le résultat" : "Question suivante"} <i class="ti ti-arrow-right"></i>
    </button>`);
  $("#next").onclick = () => { session.idx++; renderQuestion(); };
  $("#next").focus();
}

function showResult(timeout) {
  if (!session || session.done) return;
  session.done = true;
  if (session.nextTimer) { clearTimeout(session.nextTimer); session.nextTimer = null; }
  endTimer();
  const total = session.qs.length;
  const answered = session.ok + session.wrong.length;
  const pct = total ? Math.round(session.ok / total * 100) : 0;
  const good = pct >= 60;
  const gained = state.xp - session.xpStart;
  const filled = Math.round(pct / 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);

  if (session.exam) {
    state.cnt.exams++;
    if (pct > state.cnt.examBest) state.cnt.examBest = pct;
    checkBadges();
    save();
    updateNavPill(true);
    pendingToasts.forEach(toast);
    pendingToasts = [];
  }

  let wrongList = "";
  if (session.wrong.length) {
    wrongList = `<p class="section-title" style="text-align:left"># à retravailler</p>` +
      session.wrong.map(q => `
        <div class="feedback" style="text-align:left; margin-top:8px">
          <p class="verdict" style="color:var(--red)">${esc(q.q)}</p>
          ${esc(q.explication)}
        </div>`).join("");
  }
  if (session.exam) {
    const repondu = new Set(session.answered);
    const nonTraitees = session.qs.filter(q => !repondu.has(q.id));
    if (nonTraitees.length) {
      wrongList += `<p class="section-title" style="text-align:left"># non traitées (comptées fausses)</p>` +
        nonTraitees.map(q => `
          <div class="feedback" style="text-align:left; margin-top:8px">
            <p class="verdict" style="color:var(--amber)">${esc(q.q)}</p>
            ${esc(q.explication)}
          </div>`).join("");
    }
  }

  screen.innerHTML = `
    <div class="result">
      <div class="medal" style="background:${good ? "#0F2A1A" : "#2A2010"}">
        <i class="ti ${good ? "ti-trophy" : "ti-barbell"}" style="color:${good ? "var(--green)" : "var(--amber)"}"></i>
      </div>
      <p class="score">${session.ok}/${total}</p>
      <p class="bar" style="color:${good ? "var(--green)" : "var(--amber)"}">[${bar}] ${pct} %</p>
      <p class="note">
        ${timeout ? "Temps écoulé ! " : ""}${answered < total ? `${total - answered} question(s) sans réponse. ` : ""}
        +${gained} XP${session.exam ? " (bonus examen ×2 inclus)" : ""} ·
        ${session.review ? `${Math.max(0, session.reviewStart - state.review.length)} question(s) sortie(s) de la pile — les autres attendent une 2e bonne réponse d'affilée` :
          (good ? "continuez comme ça" : "les erreurs sont parties en révision")}
      </p>
      <div class="actions">
        <button class="btn" id="res-back"><i class="ti ti-arrow-left"></i> Retour</button>
        <button class="btn accent" id="res-again"><i class="ti ti-refresh"></i> Recommencer</button>
      </div>
      ${wrongList}
    </div>`;
  $("#res-back").onclick = () => { const b = session.back; session = null; b(); };
  $("#res-again").onclick = () => {
    const opts = { title: session.title, color: session.color, back: session.back, exam: session.exam };
    const qs = session.exam ? drawExam() : shuffle(session.qs);
    session = null;
    startSession(qs, opts);
  };
}

/* ============ Examen blanc ============ */

const EXAM_TYPES = ["qcm", "multi", "libre", "scenario", "terminal"];

/* L'examen blanc se mérite : niveau 1 validé (donc niveau 2 débloqué)
   dans chaque thème présent dans le tirage. */
function examUnlocked() {
  const themesExamen = MANIFEST.themes.filter(t =>
    BANK.some(q => q.theme === t.id && EXAM_TYPES.includes(q.type)));
  const restants = themesExamen.filter(t => unlockedLevel(t.id) < 2);
  return { ok: restants.length === 0, restants, total: themesExamen.length };
}

/* Tirage qui privilégie les questions jamais vues (puis les moins vues) —
   le hasard ne départage que les ex æquo. */
function drawPreferUnseen(pool, n) {
  const vues = q => (state.q[q.id] && state.q[q.id].a) || 0;
  return shuffle(pool).sort((a, b) => vues(a) - vues(b)).slice(0, n);
}

function drawExam() {
  const weights = { 1: 0.2, 2: 0.3, 3: 0.3, 4: 0.2 };
  const pool = BANK.filter(q => EXAM_TYPES.includes(q.type));
  let picked = [];
  for (const n of [1, 2, 3, 4]) {
    const want = Math.round(EXAM_SIZE * weights[n]);
    picked = picked.concat(drawPreferUnseen(pool.filter(q => q.niveau === n), want));
  }
  const rest = drawPreferUnseen(pool.filter(q => !picked.includes(q)), EXAM_SIZE);
  let i = 0;
  while (picked.length < EXAM_SIZE && i < rest.length) picked.push(rest[i++]);
  return shuffle(picked).slice(0, EXAM_SIZE);
}

function showExamIntro() {
  setPath("./quiz --examen");
  const acces = examUnlocked();
  if (!acces.ok) {
    const faits = acces.total - acces.restants.length;
    screen.innerHTML = `
      <h1 style="margin-bottom:14px">Examen blanc</h1>
      <div class="feedback" style="margin-bottom:16px">
        <p style="margin-bottom:8px"><i class="ti ti-lock" style="color:var(--amber)"></i>
        <b>Examen verrouillé</b> — validez d'abord le niveau 1 de chaque thème (${faits}/${acces.total} thèmes prêts).</p>
        <p>L'examen mélange toutes les matières : il se tente une fois les bases posées partout.</p>
      </div>
      <p class="section-title"># thèmes restants</p>
      <div class="level-list">
        ${acces.restants.map(t => `
          <div class="level-row" data-theme="${t.id}">
            <div class="chip" style="width:34px; height:34px; border-radius:8px; background:${t.color}22; color:${t.color}; display:flex; align-items:center; justify-content:center; flex-shrink:0"><i class="${t.icon}"></i></div>
            <div><h3>${esc(t.name)}</h3><p>valider le niveau 1 — ${UNLOCK_MIN_ATTEMPTS} réponses à ${Math.round(UNLOCK_RATE * 100)} %</p></div>
            <i class="ti ti-chevron-right" style="margin-left:auto; color:var(--dim)"></i>
          </div>`).join("")}
      </div>`;
    document.querySelectorAll(".level-row[data-theme]").forEach(r => {
      r.onclick = () => {
        const t = MANIFEST.themes.find(x => x.id === r.dataset.theme);
        if (t) showTheme(t);
      };
    });
    return;
  }
  screen.innerHTML = `
    <h1 style="margin-bottom:14px">Examen blanc</h1>
    <div class="feedback" style="margin-bottom:16px">
      <p style="margin-bottom:8px"><i class="ti ti-clock-bolt" style="color:var(--violet)"></i> <b>${EXAM_SIZE} questions</b> tirées de tous les thèmes (hors Atelier TP)</p>
      <p style="margin-bottom:8px"><i class="ti ti-hourglass" style="color:var(--amber)"></i> <b>${EXAM_MINUTES} minutes</b> — le chrono tourne, les questions sans réponse comptent faux</p>
      <p style="margin-bottom:8px"><i class="ti ti-bolt" style="color:var(--cyan)"></i> <b>XP doublés</b> pour chaque bonne réponse</p>
      <p><i class="ti ti-eye-off" style="color:var(--red)"></i> Les explications ne s'affichent qu'à la fin</p>
    </div>
    <p class="comment"># meilleur score : ${state.cnt.examBest} % · examens passés : ${state.cnt.exams}</p>
    <button class="btn accent" id="start-exam" style="width:100%; text-align:center; padding:12px">
      <i class="ti ti-player-play"></i> Lancer l'examen
    </button>`;
  $("#start-exam").onclick = () => {
    startSession(drawExam(), { exam: true, title: "Examen blanc", color: "var(--violet)", back: () => nav("exam") });
  };
}

/* ============ Révision ============ */

function showReview() {
  setPath("./quiz --revision");
  const qs = BANK.filter(q => state.review.includes(q.id));
  if (!qs.length) {
    screen.innerHTML = `
      <h1>À revoir</h1>
      <p class="comment"># pile de révision</p>
      <div class="result">
        <div class="medal" style="background:#0F2A1A"><i class="ti ti-check" style="color:var(--green)"></i></div>
        <p class="note">Rien à revoir — toutes vos erreurs sont corrigées.<br>Les questions ratées arriveront ici automatiquement.</p>
      </div>`;
    return;
  }
  screen.innerHTML = `
    <h1>À revoir</h1>
    <p class="comment"># ${qs.length} question(s) en attente — 2 bonnes réponses d'affilée pour en sortir</p>
    <div class="level-list">
      ${qs.slice(0, 8).map(q => {
        const s = (state.q[q.id] && state.q[q.id].s) || 0;
        return `
        <div class="level-row" style="cursor:default">
          <div class="lvl" style="background:${LEVEL_COLORS[q.niveau]}22; color:${LEVEL_COLORS[q.niveau]}">${q.niveau}</div>
          <div><h3 style="font-size:13px">${esc(q.q)}</h3><p>${esc(q.module)}</p></div>
          <div class="right" style="color:${s >= 1 ? "var(--green)" : "var(--dim)"}">${s >= 1 ? "✓ 1/2" : "0/2"}</div>
        </div>`;
      }).join("")}
      ${qs.length > 8 ? `<p class="comment">… et ${qs.length - 8} autre(s)</p>` : ""}
    </div>
    <button class="btn accent" id="start-rev" style="width:100%; text-align:center; padding:12px; margin-top:14px">
      <i class="ti ti-flame"></i> Réviser maintenant
    </button>`;
  $("#start-rev").onclick = () => {
    startSession(shuffle(qs).slice(0, SESSION_SIZE), { title: "Révision", color: "var(--amber)", back: () => nav("review"), review: true });
  };
}

/* ============ Classement ============ */

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return "il y a " + Math.max(1, Math.round(s / 60)) + " min";
  if (s < 86400) return "il y a " + Math.round(s / 3600) + " h";
  return "il y a " + Math.round(s / 86400) + " j";
}

async function showBoard() {
  setPath("./quiz --classement");
  screen.innerHTML = `<h1>Classement TSSR2601</h1><p class="comment"># chargement...</p>`;
  const tk = navToken;
  const rows = (typeof onlineBoard === "function") ? await onlineBoard() : null;
  if (tk !== navToken) return;
  if (!rows) {
    screen.innerHTML = `
      <h1>Classement TSSR2601</h1>
      <p class="comment"># classement du groupe</p>
      <div class="feedback">Classement indisponible pour le moment — vérifiez votre connexion Internet.</div>`;
    return;
  }
  const me = (typeof onlineUser !== "undefined" && onlineUser) ? onlineUser : null;
  const list = rows.map((r, i) => {
    const mine = me && r.id === me.id;
    const g = GRADES[Math.min(Math.max((r.grade || 1) - 1, 0), GRADES.length - 1)];
    const medal = i === 0 ? '<i class="ti ti-crown" style="color:var(--amber)"></i>' : "#" + (i + 1);
    return `
      <div class="rank-row ${mine ? "cur" : ""}">
        <span style="width:26px; text-align:center">${medal}</span>
        <span style="flex:1">${esc(r.pseudo)}${mine ? " (vous)" : ""}<br>
          <span style="font-size:11px; color:${mine ? "var(--cyan2)" : "var(--dim)"}">${esc(g.name)} · ${r.badges} badge(s) · examen ${r.exam_best} % · ${timeAgo(r.updated_at)}</span>
        </span>
        <span class="xp">${(r.xp || 0).toLocaleString("fr-FR")} XP</span>
      </div>`;
  }).join("");
  screen.innerHTML = `
    <h1>Classement TSSR2601</h1>
    <p class="comment"># ${rows.length} participant(s) · trié par XP</p>
    ${rows.length ? list : '<div class="feedback">Personne au classement pour l\'instant — soyez le premier !</div>'}
    ${me ? "" : `<div class="feedback" style="margin-top:14px"><i class="ti ti-info-circle" style="color:var(--cyan)"></i>
      Créez un compte dans l'onglet Profil pour apparaître ici et synchroniser votre progression.</div>`}`;
}

/* ============ Profil ============ */

function showProfile() {
  setPath("./quiz --profil");
  const gi = gradeIndex();
  const g = GRADES[gi];
  const next = GRADES[gi + 1];
  const span = next ? next.xp - g.xp : 1;
  const prog = next ? Math.min(100, Math.round((state.xp - g.xp) / span * 100)) : 100;
  const pct = state.cnt.total ? Math.round(state.cnt.ok / state.cnt.total * 100) : 0;

  const ranks = GRADES.map((r, i) => `
    <div class="rank-row ${i === gi ? "cur" : ""}">
      <i class="ti ${r.icon}"></i>
      <span>${i + 1}. ${esc(r.name)}${i === gi ? " ← vous" : ""}</span>
      <span class="xp">${r.xp.toLocaleString("fr-FR")} XP</span>
    </div>`).join("");

  const badges = BADGES.map(b => {
    const on = state.badges.includes(b.id);
    return `
      <div class="badge ${on ? "" : "locked"}">
        <i class="ti ${on ? b.icon : "ti-lock"}" style="color:${on ? b.color : "var(--dim)"}"></i>
        <h4 style="color:${on ? "var(--txt)" : "var(--dim)"}">${esc(b.name)}</h4>
        <p>${esc(b.desc)}</p>
      </div>`;
  }).join("");

  const me = (typeof onlineUser !== "undefined" && onlineUser) ? onlineUser : null;
  const pseudo = me ? me.pseudo : "Invité";
  const initials = pseudo.slice(0, 2).toUpperCase();
  screen.innerHTML = `
    <h1 style="margin-bottom:14px">Profil</h1>
    <div style="display:flex; align-items:center; gap:14px; margin-bottom:4px">
      <span style="width:52px; height:52px; border-radius:14px; background:var(--panel2); border:1px solid var(--cyan);
        display:flex; align-items:center; justify-content:center; font-family:var(--mono); font-size:18px; color:var(--cyan)">${esc(initials)}</span>
      <div style="flex:1">
        <p style="font-weight:600">${esc(pseudo)}</p>
        <p class="qmeta" style="color:var(--cyan)"><i class="ti ${g.icon}"></i> ${esc(g.name)} · grade ${gi + 1}/${GRADES.length}</p>
      </div>
      <div style="text-align:right; font-family:var(--mono)">
        <p style="font-size:18px; font-weight:600">${state.xp.toLocaleString("fr-FR")} XP</p>
        <p style="font-size:11px; color:var(--dim)">${next ? (next.xp - state.xp).toLocaleString("fr-FR") + " XP → grade " + (gi + 2) : "grade maximal"}</p>
      </div>
    </div>
    <div class="xpbar"><div style="width:${prog}%"></div></div>

    <p class="section-title"># statistiques</p>
    <div class="stats" style="margin-top:0">
      <div class="stat"><p style="color:var(--cyan2)">réponses</p><b>${state.cnt.total}</b></div>
      <div class="stat"><p style="color:var(--green)">réussite</p><b>${pct}%</b></div>
      <div class="stat"><p style="color:var(--red)">meilleure série</p><b>${state.cnt.best}</b></div>
    </div>

    <p class="section-title"># échelle des grades</p>
    ${ranks}

    <p class="section-title"># badges — ${state.badges.length}/${BADGES.length} débloqués</p>
    <div class="badges">${badges}</div>

    <p class="section-title"># compte en ligne</p>
    ${me ? `
    <div class="feedback" style="margin-top:0">
      <i class="ti ti-cloud-check" style="color:var(--green)"></i>
      Connecté en tant que <b>${esc(me.pseudo)}</b> — progression synchronisée entre vos appareils,
      visible dans le classement.
      ${(typeof onlineStatus === "function" && onlineStatus() === "erreur") ? `
      <br><span style="color:var(--amber)"><i class="ti ti-alert-triangle"></i>
      Dernière synchronisation en échec — vérifiez votre connexion ou reconnectez-vous.</span>` : ""}
    </div>
    <button class="btn small" id="logout" style="margin-top:10px"><i class="ti ti-logout"></i> Se déconnecter</button>
    ` : `
    <div class="feedback" style="margin-top:0">
      Créez un compte (pseudo + mot de passe) pour synchroniser votre progression entre PC et téléphone
      et apparaître dans le classement du groupe. Sans compte, tout reste enregistré dans ce navigateur.
    </div>
    <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px; max-width:340px">
      <input id="auth-pseudo" autocomplete="username" placeholder="pseudo (2 à 20 caractères)"
        style="background:var(--frame); border:1px solid var(--line2); border-radius:8px; color:var(--txt); font-size:14px; padding:9px 12px; outline:none">
      <input id="auth-pass" type="password" autocomplete="new-password" placeholder="mot de passe (6 caractères min.)"
        style="background:var(--frame); border:1px solid var(--line2); border-radius:8px; color:var(--txt); font-size:14px; padding:9px 12px; outline:none">
      <div style="display:flex; gap:8px">
        <button class="btn accent" id="signup" style="flex:1">Créer mon compte</button>
        <button class="btn" id="signin" style="flex:1">Se connecter</button>
      </div>
      <p id="auth-msg" style="font-family:var(--mono); font-size:12px; color:var(--red); min-height:16px"></p>
      <p style="font-size:12px; color:var(--dim)">Mot de passe oublié ? Demandez à l'administrateur (Said) de le réinitialiser.</p>
    </div>
    `}

    <p class="section-title"># données</p>
    <button class="btn small" id="reset" style="color:var(--red); border-color:var(--red)">
      <i class="ti ti-trash"></i> Réinitialiser ma progression
    </button>`;
  if (me) {
    $("#logout").onclick = async () => {
      await onlineSignOut();
      updateOnlineBadge();
      nav("profile");
    };
  } else if ($("#signup")) {
    let authBusy = false;
    const doAuth = async signup => {
      if (authBusy) return;
      const p = $("#auth-pseudo").value.trim();
      const pass = $("#auth-pass").value;
      const msg = $("#auth-msg");
      if (!p || !pass) { msg.textContent = "Renseignez le pseudo et le mot de passe."; return; }
      authBusy = true;
      $("#signup").disabled = true;
      $("#signin").disabled = true;
      msg.style.color = "var(--dim)";
      msg.textContent = signup ? "création du compte..." : "connexion...";
      const err = signup ? await onlineSignUp(p, pass) : await onlineSignIn(p, pass);
      if (err) {
        authBusy = false;
        $("#signup").disabled = false;
        $("#signin").disabled = false;
        msg.style.color = "var(--red)";
        msg.textContent = err;
        return;
      }
      const lecture = await onlineFetchState();
      if (lecture.ok) {
        const cloud = lecture.state ? normalizeState(lecture.state) : null;
        const etranger = state.owner && state.owner !== onlineUser.id;
        const cg = cloud ? cloud.gen : 0, sg = state.gen || 0;
        if (etranger) state = cloud || defaultState();
        else if (cloud && (cg > sg || (cg === sg && cloud.xp >= state.xp))) state = cloud;
        state.owner = onlineUser.id;
        persist();
        await onlinePushState(state, gradeIndex() + 1);
        toast(`<i class="ti ti-cloud-check"></i> ${signup ? "Compte créé" : "Connecté"} : <b>${esc(onlineUser.pseudo)}</b>`);
      } else {
        toast(`<i class="ti ti-cloud-off"></i> Connecté, mais cloud injoignable — synchronisation en pause`);
      }
      updateNavPill();
      updateOnlineBadge();
      nav("profile");
    };
    $("#signup").onclick = () => doAuth(true);
    $("#signin").onclick = () => doAuth(false);
    $("#auth-pass").addEventListener("keydown", e => { if (e.key === "Enter") doAuth(false); });
  }

  let resetArmed = false;
  $("#reset").onclick = async () => {
    if (!resetArmed) {
      resetArmed = true;
      $("#reset").innerHTML = '<i class="ti ti-alert-triangle"></i> Cliquez à nouveau pour tout effacer';
      setTimeout(() => {
        resetArmed = false;
        const btn = $("#reset");
        if (btn) btn.innerHTML = '<i class="ti ti-trash"></i> Réinitialiser ma progression';
      }, 3000);
      return;
    }
    const gen = (state.gen || 0) + 1;
    const owner = state.owner;
    state = defaultState();
    state.gen = gen;
    state.owner = owner;
    persist();
    if (typeof onlineCancelPending === "function") onlineCancelPending();
    if (typeof onlineUser !== "undefined" && onlineUser) await onlinePushState(state, 1);
    updateNavPill();
    nav("profile");
  };
}

/* ============ Démarrage ============ */

document.querySelectorAll(".nav button").forEach(b => {
  b.onclick = () => {
    if (session) {
      endTimer();
      if (session.nextTimer) clearTimeout(session.nextTimer);
      session = null;
      pendingToasts.forEach(toast);
      pendingToasts = [];
    }
    nav(b.dataset.nav);
  };
});

(async () => {
  const avecDelai = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
  const partieEnLigne = (async () => {
    try {
      if (typeof onlineInit === "function" && onlineInit()) {
        await onlineRestore();
        if (typeof onlineUser !== "undefined" && onlineUser) {
          const lecture = await onlineFetchState();
          if (lecture.ok && lecture.state && !session) {
            const cloud = normalizeState(lecture.state);
            const etranger = state.owner && state.owner !== onlineUser.id;
            const cg = cloud.gen || 0, sg = state.gen || 0;
            if (etranger || cg > sg || (cg === sg && cloud.xp > state.xp)) {
              state = cloud;
            }
            state.owner = onlineUser.id;
            persist();
          }
        }
      }
    } catch (e) { console.warn("Mode hors ligne :", e); }
  })();
  try {
    await Promise.all([loadBank(), avecDelai(partieEnLigne, 6000)]);
    const connus = new Set(BANK.map(q => q.id));
    const avantPurge = state.review.length;
    state.review = state.review.filter(id => connus.has(id));
    if (state.review.length !== avantPurge) persist();
    updateOnlineBadge();
    updateNavPill();
    nav("home");
  } catch (err) {
    screen.innerHTML = `<p class="loading" style="color:var(--red)"># erreur de chargement : ${esc(err.message)}<br># ouvrez le site via un serveur web (http), pas en fichier local.</p>`;
  }
})();
