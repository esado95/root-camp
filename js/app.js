"use strict";

/* ============ Constantes ============ */

const LS_KEY = "root-camp-v1";
const LS_KEY_ANCIEN = "quiz-tssr2601-v1";
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
    v: 1, xp: 0, gen: 0, owner: null, accueilVu: false, checkpoint: null,
    q: {},
    lv: {},
    review: [],
    cnt: { total: 0, ok: 0, streak: 0, best: 0, exams: 0, examBest: 0, palierBest: {}, night: false, days: [] },
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
  d.accueilVu = raw.accueilVu === true;
  const cp = raw.checkpoint;
  if (cp && typeof cp === "object" && Array.isArray(cp.qs) && cp.qs.every(x => typeof x === "string") && cp.qs.length) {
    d.checkpoint = {
      qs: cp.qs.slice(0, 50),
      idx: Math.max(0, Number(cp.idx) || 0),
      ok: Math.max(0, Number(cp.ok) || 0),
      wrongIds: Array.isArray(cp.wrongIds) ? cp.wrongIds.filter(x => typeof x === "string") : [],
      answered: Array.isArray(cp.answered) ? cp.answered.filter(x => typeof x === "string") : [],
      title: typeof cp.title === "string" ? cp.title : "Session",
      color: typeof cp.color === "string" ? cp.color : "var(--cyan)",
      themeId: typeof cp.themeId === "string" ? cp.themeId : null,
      review: cp.review === true,
      ts: Number(cp.ts) || 0
    };
  }
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
    palierBest: (c.palierBest && typeof c.palierBest === "object")
      ? Object.fromEntries(Object.entries(c.palierBest)
          .filter(([k, v]) => ["1", "2", "3", "4"].includes(String(k)) && Number.isFinite(Number(v)))
          .map(([k, v]) => [k, Math.max(0, Math.min(100, Number(v)))]))
      : {},
    night: c.night === true,
    days: Array.isArray(c.days) ? c.days.filter(x => typeof x === "string") : []
  };
  return d;
}

function load() {
  try {
    let raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      raw = localStorage.getItem(LS_KEY_ANCIEN);
      if (raw) {
        localStorage.setItem(LS_KEY, raw);
        localStorage.removeItem(LS_KEY_ANCIEN);
      }
    }
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
  const gradeAvant = gradeIndex();
  const nivAvant = unlockedLevel(q.theme);
  const palierAvant = plusHautPalier();
  const atelierAvant = atelierAccess().ok;
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

  const nivApres = unlockedLevel(q.theme);
  if (nivApres > nivAvant) toastOuDiffere(`<i class="ti ti-lock-open"></i> Niveau ${nivApres} débloqué — <b>${esc(q.themeName)}</b>`);
  const palierApres = plusHautPalier();
  if (palierApres > palierAvant) toastOuDiffere(`<i class="ti ti-trophy"></i> Examen palier ${palierApres} débloqué !`);
  if (!atelierAvant && atelierAccess().ok) toastOuDiffere(`<i class="ti ti-flask"></i> <b>Atelier TP débloqué</b> — le terminal vous attend !`);
  const gradeApres = gradeIndex();
  if (gradeApres > gradeAvant) toastOuDiffere(`<i class="ti ti-chevrons-up"></i> Nouveau grade : <b>${esc(GRADES[gradeApres].name)}</b>`);

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
        BANK.push(q);
      }
    }
  }
}

/* ============ Écrans ============ */

let navToken = 0;
let currentPage = "home";
let bootDone = false;

function resetScroll() {
  const m = document.querySelector("main");
  if (m) m.scrollTop = 0;
}

function toastOuDiffere(html) {
  if (session && session.exam) pendingToasts.push(html);
  else toast(html);
}

function plusHautPalier() {
  for (let p = 4; p >= 1; p--) if (palierAccess(p).ok) return p;
  return 0;
}

function updateOnlineBadge() {
  const el = document.getElementById("online-badge");
  if (!el) return;
  const st = (typeof onlineStatus === "function") ? onlineStatus() : "local";
  if (st === "ok") { el.textContent = "● " + onlineUser.pseudo; el.style.color = "var(--green)"; }
  else if (st === "erreur") { el.textContent = "● synchro en échec"; el.style.color = "var(--amber)"; }
  else { el.textContent = "● local"; el.style.color = "var(--dim)"; }
  const u = document.getElementById("tb-user");
  if (u) u.textContent = (typeof onlineUser !== "undefined" && onlineUser)
    ? onlineUser.pseudo.toLowerCase()
    : "invite";
}

function nav(page) {
  navToken++;
  currentPage = page;
  resetScroll();
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
    const verrou = t.id === "atelier" && !atelierAccess().ok;
    const icon = verrou ? '<i class="ti ti-lock"></i>' : `<i class="${t.icon}"></i>`;
    cards += `
      <div class="card ${off ? "off" : ""}" data-theme="${t.id}" style="--c:${t.color}">
        <div class="chip" style="background:${t.color}22; color:${t.color}">${icon}</div>
        <h3>${esc(t.name)}</h3>
        <p>${esc(t.sub)}</p>
        <p class="count" style="color:${off || verrou ? "var(--dim)" : t.color}">${off ? "bientôt disponible" : (verrou ? "verrouillé — niveau 3 requis" : count + " questions")}</p>
      </div>`;
  }
  const pct = state.cnt.total ? Math.round(state.cnt.ok / state.cnt.total * 100) : 0;
  let reprise = "";
  const cp = state.checkpoint;
  if (cp) {
    const dispo = cp.qs.filter(id => BANK.some(q => q.id === id)).length;
    if (!dispo) { state.checkpoint = null; persist(); }
    else reprise = `
    <div class="wide" id="go-reprise" style="background:#2A2010; border-color:var(--amber); margin:0 0 12px">
      <div class="chip" style="background:#3A2D12; color:var(--amber)"><i class="ti ti-player-pause"></i></div>
      <div><h3 style="color:var(--amber)">Reprendre : ${esc(cp.title)}</h3>
      <p style="color:var(--amber); opacity:.85">question ${Math.min(cp.idx + 1, cp.qs.length)}/${cp.qs.length} · ${cp.ok} bonne(s) réponse(s)</p></div>
      <button class="btn small" id="cp-annuler" style="margin-left:auto; flex-shrink:0" aria-label="abandonner la session sauvegardée"><i class="ti ti-x"></i></button>
    </div>`;
  }
  screen.innerHTML = `
    <h1 style="margin-bottom:14px">Root Camp</h1>
    ${reprise}
    <div class="grid">${cards}</div>
    ${(() => {
      let dispo = 0;
      for (let p = 4; p >= 1; p--) if (palierAccess(p).ok) { dispo = p; break; }
      return `
    <div class="wide" id="go-exam" style="${dispo ? "" : "opacity:.65"}">
      <div class="chip"><i class="ti ${dispo ? "ti-clock-bolt" : "ti-lock"}"></i></div>
      <div><h3>Examens blancs</h3><p>${dispo
        ? `palier ${dispo}/4 accessible · ${EXAM_SIZE} questions · XP doublés`
        : "verrouillés — validez le niveau 1 de chaque thème"}</p></div>
      <i class="ti ti-chevron-right arrow"></i>
    </div>`;
    })()}
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
  const rep = $("#go-reprise");
  if (rep) {
    rep.onclick = reprendreCheckpoint;
    $("#cp-annuler").onclick = e => {
      e.stopPropagation();
      state.checkpoint = null;
      persist();
      nav("home");
    };
  }
}

function showBienvenue() {
  setPath("./welcome.sh");
  screen.innerHTML = `
    <h1 style="margin-bottom:14px">Bienvenue sur Root Camp</h1>
    <div class="feedback" style="margin-top:0">
      De <b>stagiaire</b> à <b style="color:var(--cyan)">root@tssr</b> : révisez tout le programme TSSR
      en répondant à des questions générées depuis les cours de la promo.
    </div>
    <div class="level-list" style="margin-top:14px">
      <div class="level-row" style="cursor:default">
        <div class="lvl" style="background:#38BDF822; color:var(--cyan)"><i class="ti ti-layout-grid"></i></div>
        <div><h3>${BANK.length} questions · 10 thèmes · 4 niveaux</h3>
        <p>chaque thème se débloque niveau par niveau (70 % de réussite)</p></div>
      </div>
      <div class="level-row" style="cursor:default">
        <div class="lvl" style="background:#A78BFA22; color:var(--violet)"><i class="ti ti-clock-bolt"></i></div>
        <div><h3>Examens blancs à paliers</h3>
        <p>validez le niveau 1 de chaque thème pour ouvrir le premier examen</p></div>
      </div>
      <div class="level-row" style="cursor:default">
        <div class="lvl" style="background:#2DD4BF22; color:#2DD4BF"><i class="ti ti-flask"></i></div>
        <div><h3>Atelier TP — terminal simulé</h3>
        <p>tapez de vraies commandes IOS, Bash et PowerShell, avec leurs sorties</p></div>
      </div>
      <div class="level-row" style="cursor:default">
        <div class="lvl" style="background:#63D47122; color:var(--green)"><i class="ti ti-cloud"></i></div>
        <div><h3>Compte facultatif</h3>
        <p>pseudo + mot de passe (onglet Profil) : synchronisation PC/téléphone et classement du groupe — sinon, tout reste local</p></div>
      </div>
    </div>
    <p class="comment" style="margin-top:12px"># astuce : répondez au clavier — touches 1-4 ou A-D, Entrée pour continuer</p>
    <div style="display:flex; gap:10px; margin-top:14px">
      <button class="btn" id="bv-regles" style="flex:1"><i class="ti ti-book-2"></i> Les règles en détail</button>
      <button class="btn accent" id="bv-go" style="flex:1"><i class="ti ti-player-play"></i> C'est parti</button>
    </div>`;
  const marquer = () => { state.accueilVu = true; persist(); };
  $("#bv-regles").onclick = () => { marquer(); showRules(); };
  $("#bv-go").onclick = () => { marquer(); nav("home"); };
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
      avec la correction et l'explication après chaque réponse. Interrompez quand vous voulez :
      la session est sauvegardée après chaque question, et la carte
      <b style="color:var(--amber)">« Reprendre »</b> sur l'accueil vous remet exactement où vous étiez —
      comme un point de contrôle dans un jeu (examens exclus, chrono oblige).
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
      <p style="margin-bottom:6px"><i class="ti ti-flask" style="color:var(--cyan)"></i> <b>Mini-TP</b> — une session guidée en plusieurs étapes (IOS, Bash, PowerShell) : le prompt évolue comme en vrai, indice après une erreur, <b>XP doublés</b></p>
      <p><i class="ti ti-keyboard" style="color:var(--cyan)"></i> <b>Au clavier</b> — touches 1-4 ou A-D pour répondre, Entrée pour valider et passer à la suite ; dans le terminal : Tab complète le mot en cours, flèches ↑/↓ pour l'historique</p>
    </div>

    <p class="section-title"># examen blanc</p>
    <div class="feedback" style="margin-top:0">
      Quatre paliers : le palier N se débloque quand le niveau N est validé dans chaque thème,
      et n'interroge que les niveaux déjà travaillés (palier 1 = fondamentaux seuls, palier 4 = tout).
      ${EXAM_SIZE} questions (hors Atelier TP), ${EXAM_MINUTES} minutes chrono, aucune correction pendant l'épreuve.
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
  if (theme.id === "atelier") {
    const acces = atelierAccess();
    if (!acces.ok) {
      screen.innerHTML = `
        <div class="qhead">
          <button class="btn small" id="back"><i class="ti ti-arrow-left"></i> Thèmes</button>
          <span class="qmeta" style="color:${theme.color}">${esc(theme.name)}</span>
        </div>
        ${theme.intro ? `<div class="feedback" style="margin:0 0 14px"><i class="ti ti-sparkles" style="color:${theme.color}"></i> ${esc(theme.intro)}</div>` : ""}
        <div class="feedback" style="margin:0 0 14px">
          <i class="ti ti-lock" style="color:var(--amber)"></i>
          <b>Atelier verrouillé</b> — comme les examens, il se mérite : débloquez le niveau 3
          dans les trois thèmes qu'il met en pratique (${acces.total - acces.restants.length}/${acces.total} prêts).
        </div>
        <p class="section-title"># thèmes à faire progresser</p>
        <div class="level-list">
          ${acces.restants.map(t => `
            <div class="level-row" data-theme="${t.id}">
              <div class="chip" style="width:34px; height:34px; border-radius:8px; background:${t.color}22; color:${t.color}; display:flex; align-items:center; justify-content:center; flex-shrink:0"><i class="${t.icon}"></i></div>
              <div><h3>${esc(t.name)}</h3><p>niveau atteint : ${unlockedLevel(t.id)}/3 requis</p></div>
              <i class="ti ti-chevron-right" style="margin-left:auto; color:var(--dim)"></i>
            </div>`).join("")}
        </div>`;
      $("#back").onclick = () => nav("home");
      document.querySelectorAll(".level-row[data-theme]").forEach(r => {
        r.onclick = () => {
          const t = MANIFEST.themes.find(x => x.id === r.dataset.theme);
          if (t) showTheme(t);
        };
      });
      return;
    }
  }
  const unlocked = unlockedLevel(theme.id);
  let rows = "";
  let precedent = null;
  for (let n = 1; n <= 4; n++) {
    const count = BANK.filter(q => q.theme === theme.id && q.niveau === n).length;
    if (count === 0) continue;
    const st = themeLevelStats(theme.id, n);
    const locked = n > unlocked;
    const rate = st.a ? Math.round(st.c / st.a * 100) : null;
    rows += `
      <div class="level-row ${locked ? "locked" : ""}" data-lvl="${n}">
        <div class="lvl" style="background:${LEVEL_COLORS[n]}22; color:${LEVEL_COLORS[n]}">${locked ? '<i class="ti ti-lock"></i>' : n}</div>
        <div>
          <h3>Niveau ${n} — ${LEVEL_NAMES[n]}</h3>
          <p>${count + " questions" + (locked ? ` · pour débloquer : ≥ ${UNLOCK_MIN_ATTEMPTS} réponses au niveau ${precedent} avec ${Math.round(UNLOCK_RATE * 100)} % de réussite` : "")}</p>
        </div>
        <div class="right">${rate !== null ? rate + " %<br>" + st.a + " rép." : ""}</div>
      </div>`;
    precedent = n;
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
    ${theme.intro ? `<div class="feedback" style="margin:0 0 14px"><i class="ti ti-sparkles" style="color:${theme.color}"></i> ${esc(theme.intro)}</div>` : ""}
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
      startSession(pool, { title: `${theme.name} · niveau ${n}`, color: theme.color, themeId: theme.id, back: () => showTheme(theme) });
    };
  });
}

/* ============ Session de questions ============ */

let session = null;

/* Point de contrôle : la session en cours (hors examen) est sauvegardée après
   chaque question — on peut quitter et reprendre plus tard, comme dans un jeu. */
function majCheckpoint() {
  if (!session || session.exam) return;
  state.checkpoint = {
    qs: session.qs.map(q => q.id),
    idx: session.idx + 1,
    ok: session.ok,
    wrongIds: session.wrong.map(q => q.id),
    answered: session.answered.slice(),
    title: session.title,
    color: session.color,
    themeId: session.themeId || null,
    review: session.review,
    ts: Date.now()
  };
}

function reprendreCheckpoint() {
  const cp = state.checkpoint;
  if (!cp) return;
  const qs = cp.qs.map(id => BANK.find(q => q.id === id)).filter(Boolean);
  if (!qs.length) { state.checkpoint = null; persist(); nav("home"); return; }
  const themeObj = cp.themeId ? MANIFEST.themes.find(t => t.id === cp.themeId) : null;
  session = {
    qs, idx: Math.min(cp.idx, qs.length), ok: cp.ok, xpStart: state.xp,
    exam: false, title: cp.title, color: cp.color,
    back: themeObj ? () => showTheme(themeObj) : () => nav("home"),
    wrong: cp.wrongIds.map(id => BANK.find(q => q.id === id)).filter(Boolean),
    answered: cp.answered.slice(),
    review: cp.review, palier: 4, themeId: cp.themeId,
    reviewStart: state.review.length,
    done: false, nextTimer: null, deadline: null, timer: null
  };
  renderQuestion();
}

function startSession(questions, opts) {
  session = {
    qs: questions, idx: 0, ok: 0, xpStart: state.xp,
    exam: !!opts.exam, title: opts.title, color: opts.color || "var(--cyan)",
    back: opts.back || (() => nav("home")),
    wrong: [], answered: [], review: !!opts.review,
    palier: opts.palier || 4,
    themeId: opts.themeId || null,
    reviewStart: state.review.length,
    done: false, nextTimer: null,
    deadline: opts.exam ? Date.now() + EXAM_MINUTES * 60000 : null, timer: null
  };
  renderQuestion();
}

function endTimer() { if (session && session.timer) { clearInterval(session.timer); session.timer = null; } }

function renderQuestion() {
  endTimer();
  resetScroll();
  if (!session || session.idx >= session.qs.length) return showResult();
  const q = session.qs[session.idx];
  setPath(session.exam ? "./quiz --examen" : `./quiz --session`);

  const head = `
    <div class="qhead">
      <button class="btn small" id="quit"><i class="ti ti-x"></i> Quitter</button>
      <span class="qmeta" style="color:${session.color}">${esc(session.title)} · ${session.idx + 1}/${session.qs.length}</span>
      ${session.exam ? '<span class="qmeta" id="timer" style="color:var(--amber)"></span>' : ""}
    </div>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${session.qs.length}" aria-valuenow="${session.idx}" aria-label="progression de la session"><div style="width:${Math.round(session.idx / session.qs.length * 100)}%; background:${session.color}"></div></div>
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
      <div class="term-body" id="term-body" role="log" aria-live="polite"></div>
    </div>`;

  screen.innerHTML = head + body + `<div id="fb"></div>`;
  $("#quit").onclick = () => {
    if (session.exam && !session.done && !session.quitArm) {
      session.quitArm = true;
      $("#quit").innerHTML = '<i class="ti ti-alert-triangle"></i> Confirmer l\'abandon ?';
      setTimeout(() => {
        const b = $("#quit");
        if (b && session && session.quitArm) { session.quitArm = false; b.innerHTML = '<i class="ti ti-x"></i> Quitter'; }
      }, 2500);
      return;
    }
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
      if (left <= 0) { endTimer(); showResult(session.answered.length < session.qs.length); }
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
  if (q.type === "terminal" || q.type === "tp") {
    const term = screen.querySelector(".term");
    if (term) term.addEventListener("click", () => {
      const sel = window.getSelection();
      if (sel && sel.toString()) return;
      const inp = term.querySelector(".term-input:not(:disabled)");
      if (inp) inp.focus();
    });
  }
  shieldClicks();
}

function letters(i) { return String.fromCharCode(65 + i); }

/* Bouclier anti double-clic : après chaque rendu d'écran interactif, les clics
   ET les réponses clavier sont ignorés 250 ms — le « rebond » d'un double-clic
   ou d'une touche maintenue ne peut plus répondre à la question suivante. */
let lastShield = 0;
function shieldClicks() {
  lastShield = Date.now();
  screen.style.pointerEvents = "none";
  setTimeout(() => { screen.style.pointerEvents = ""; }, 250);
}

/* Réponses au clavier : 1-9 ou A-E sélectionnent une proposition,
   Entrée déclenche « suivant » ou « valider ». Inactif dans les champs de saisie. */
document.addEventListener("keydown", e => {
  if (e.repeat) return;
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
  if (!session || Date.now() - lastShield < 250) return;
  if (e.key === "Enter") {
    const next = document.getElementById("next");
    if (next && !next.disabled) { e.preventDefault(); next.click(); return; }
    const val = document.getElementById("validate");
    if (val) { e.preventDefault(); val.click(); }
    return;
  }
  const answers = document.getElementById("answers");
  if (!answers) return;
  let idx = -1;
  if (/^[1-9]$/.test(e.key)) idx = Number(e.key) - 1;
  else if (/^[a-eA-E]$/.test(e.key)) idx = e.key.toLowerCase().charCodeAt(0) - 97;
  if (idx < 0) return;
  const btns = answers.querySelectorAll(".btn");
  if (idx < btns.length && !btns[idx].disabled) { e.preventDefault(); btns[idx].click(); }
});

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
    if (!picked.size) {
      const v = $("#validate");
      v.textContent = "Cochez au moins une réponse";
      setTimeout(() => { const b = $("#validate"); if (b) b.textContent = "Valider"; }, 1500);
      return;
    }
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
    const skl = document.getElementById("skip");
    if (skl) skl.remove();
    if (!correct && !session.exam) {
      const fb = $("#fb");
      fb.insertAdjacentHTML("afterbegin",
        `<p class="comment" style="margin-top:10px">réponse attendue : <b style="color:var(--green)">${esc(q.accept[0])}</b></p>`);
    }
    finishQuestion(q, correct);
  };
  $("#validate").onclick = submit;
  input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.repeat) submit(); });
  if (session.exam) {
    $("#fb").insertAdjacentHTML("beforeend",
      `<button class="btn small" id="skip" style="margin-top:10px; color:var(--dim)">Passer — la question comptera fausse</button>`);
    $("#skip").onclick = () => {
      input.disabled = true;
      const v = $("#validate"); if (v) v.remove();
      $("#skip").remove();
      finishQuestion(q, false);
    };
  }
}

/* Autocomplétion Tab : complète le MOT en cours (jamais la commande entière —
   sinon Tab donnerait la réponse). Plusieurs candidats → plus long préfixe
   commun, comme bash/IOS. Retourne null s'il n'y a rien à compléter. */
function completerCommande(saisie, variantes) {
  const m = saisie.match(/^(.*?)(\S*)$/);
  const avant = m[1], partiel = m[2];
  if (!partiel) return null;
  const idx = avant.trim() ? avant.trim().split(/\s+/).length : 0;
  const precedents = avant.trim() ? avant.trim().split(/\s+/) : [];
  const candidats = new Set();
  for (const v of variantes) {
    const toks = v.trim().split(/\s+/);
    if (toks.length <= idx) continue;
    if (!precedents.every((t, i) => toks[i] && toks[i].toLowerCase() === t.toLowerCase())) continue;
    if (toks[idx].toLowerCase().startsWith(partiel.toLowerCase())) candidats.add(toks[idx]);
  }
  if (!candidats.size) return null;
  const arr = [...candidats];
  let commun = arr[0];
  for (const c of arr.slice(1)) {
    let k = 0;
    while (k < commun.length && k < c.length && commun[k].toLowerCase() === c[k].toLowerCase()) k++;
    commun = commun.slice(0, k);
  }
  if (commun.length <= partiel.length) return null;
  const motComplet = arr.length === 1 && commun.length === arr[0].length;
  return avant + commun + (motComplet ? " " : "");
}

function brancheTab(input, getVariantes) {
  input.addEventListener("keydown", e => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const r = completerCommande(input.value, getVariantes());
    if (r !== null) {
      input.value = r;
      requestAnimationFrame(() => input.setSelectionRange(r.length, r.length));
    }
  });
}

/* Caret IOS : ligne d'espaces + « ^ » aligné sous le premier mot de la commande
   tapée qui diverge de la commande attendue (comme un vrai routeur Cisco). */
function ligneCaret(promptTxt, val, reference) {
  const tokens = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(val)) !== null) tokens.push({ t: m[0], i: m.index });
  if (!tokens.length) return null;
  const ref = (reference || "").trim().split(/\s+/);
  let idx = 0;
  while (idx < tokens.length && ref[idx] && tokens[idx].t.toLowerCase() === ref[idx].toLowerCase()) idx++;
  if (idx >= tokens.length) idx = tokens.length - 1;
  return " ".repeat(promptTxt.length + 1 + tokens[idx].i) + "^";
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
  brancheTab(input, () => q.accept);

  input.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    const val = input.value;
    if (!normalize(val)) return;
    input.disabled = true;
    inputLine.remove();
    const skt = document.getElementById("skip");
    if (skt) skt.remove();
    addLine(promptTxt + " " + val);
    const correct = q.accept.map(normalize).includes(normalize(val));
    if (session.exam) {
      addLine("# réponse enregistrée", "cmt");
    } else if (correct) {
      if (q.output) q.output.split("\n").forEach(l => addLine(l, "out"));
      addLine("# commande acceptée ✓", "ok");
    } else {
      const msgErr = q.error || "'" + val.trim() + "' : commande incorrecte ou incomplète";
      if (msgErr.includes("'^'")) {
        const caret = ligneCaret(q.prompt || "$", val, q.accept[0]);
        if (caret) addLine(caret, "ko");
      }
      addLine(msgErr, "ko");
      addLine("# commande attendue : " + q.accept[0], "cmt");
      if (q.output) q.output.split("\n").forEach(l => addLine(l, "out"));
    }
    finishQuestion(q, correct);
  });
  if (session.exam) {
    $("#fb").insertAdjacentHTML("beforeend",
      `<button class="btn small" id="skip" style="margin-top:10px; color:var(--dim)">Passer — la question comptera fausse</button>`);
    $("#skip").onclick = () => {
      input.disabled = true;
      addLine("# question passée", "cmt");
      $("#skip").remove();
      finishQuestion(q, false);
    };
  }
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
    brancheTab(input, () => st.accept);
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
        const msgErr = st.error || "% Commande incorrecte ou incomplète";
        if (msgErr.includes("'^'")) {
          const caret = ligneCaret(st.prompt || "$", val, st.accept[0]);
          if (caret) addLine(caret, "ko");
        }
        addLine(msgErr, "ko");
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
  if (!session.exam) { majCheckpoint(); persist(); }

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
    </div>
    <button class="btn accent" id="next" style="margin-top:12px">
      ${last ? "Voir le résultat" : "Question suivante"} <i class="ti ti-arrow-right"></i>
    </button>`);
  const nextBtn = $("#next");
  nextBtn.onclick = () => { session.idx++; renderQuestion(); };
  nextBtn.disabled = true;
  setTimeout(() => { nextBtn.disabled = false; }, 400);
}

function showResult(timeout) {
  if (!session || session.done) return;
  session.done = true;
  if (session.nextTimer) { clearTimeout(session.nextTimer); session.nextTimer = null; }
  endTimer();
  resetScroll();
  const total = session.qs.length;
  const answered = session.ok + session.wrong.length;
  const pct = total ? Math.round(session.ok / total * 100) : 0;
  const good = pct >= 60;
  const gained = state.xp - session.xpStart;
  const filled = Math.round(pct / 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);

  if (!session.exam && state.checkpoint) {
    state.checkpoint = null;
    persist();
  }
  if (session.exam) {
    state.cnt.exams++;
    if (pct > state.cnt.examBest) state.cnt.examBest = pct;
    if (!state.cnt.palierBest) state.cnt.palierBest = {};
    if (pct > (state.cnt.palierBest[session.palier] || 0)) state.cnt.palierBest[session.palier] = pct;
    checkBadges();
    save();
    updateNavPill(true);
    pendingToasts.forEach((h, i) => setTimeout(() => toast(h), i * 900));
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
  shieldClicks();
  $("#res-back").onclick = () => { const b = session.back; session = null; b(); };
  $("#res-again").onclick = () => {
    const opts = { title: session.title, color: session.color, back: session.back, exam: session.exam, palier: session.palier, review: session.review };
    const qs = session.exam ? drawExam(session.palier) : shuffle(session.qs);
    session = null;
    startSession(qs, opts);
  };
}

/* ============ Examen blanc ============ */

const EXAM_TYPES = ["qcm", "multi", "libre", "scenario", "terminal"];

/* Examens à paliers : le palier N se débloque quand le niveau N est validé
   dans chaque thème, et n'interroge que les niveaux déjà travaillés. */
const PALIER_WEIGHTS = {
  1: { 1: 1 },
  2: { 1: 0.4, 2: 0.6 },
  3: { 1: 0.2, 2: 0.4, 3: 0.4 },
  4: { 1: 0.2, 2: 0.3, 3: 0.3, 4: 0.2 }
};

function levelValide(themeId, n) {
  const st = themeLevelStats(themeId, n);
  return st.a >= UNLOCK_MIN_ATTEMPTS && st.c / st.a >= UNLOCK_RATE;
}

/* L'Atelier TP se mérite, comme les examens : niveau 3 débloqué dans les
   trois thèmes que les TP mettent en pratique. */
const ATELIER_REQUIS = ["reseau", "linux", "windows"];
function atelierAccess() {
  const restants = ATELIER_REQUIS
    .map(id => MANIFEST.themes.find(t => t.id === id))
    .filter(t => t && unlockedLevel(t.id) < 3);
  return { ok: restants.length === 0, restants, total: ATELIER_REQUIS.length };
}

function examThemes() {
  return MANIFEST.themes.filter(t => BANK.some(q => q.theme === t.id && EXAM_TYPES.includes(q.type)));
}

function palierAccess(p) {
  const restants = examThemes().filter(t => {
    const aDesQuestions = BANK.some(q => q.theme === t.id && q.niveau === p && EXAM_TYPES.includes(q.type));
    if (!aDesQuestions) return false;
    if (p === 4) return !(unlockedLevel(t.id) >= 4 && levelValide(t.id, 4));
    return unlockedLevel(t.id) < p + 1;
  });
  return { p, ok: restants.length === 0, restants, total: examThemes().length };
}

/* Tirage qui privilégie les questions jamais vues (puis les moins vues) —
   le hasard ne départage que les ex æquo. */
function drawPreferUnseen(pool, n) {
  const vues = q => (state.q[q.id] && state.q[q.id].a) || 0;
  return shuffle(pool).sort((a, b) => vues(a) - vues(b)).slice(0, n);
}

function drawExam(palier) {
  const weights = PALIER_WEIGHTS[palier] || PALIER_WEIGHTS[4];
  const pool = BANK.filter(q => EXAM_TYPES.includes(q.type) && weights[q.niveau]);
  let picked = [];
  for (const n of Object.keys(weights)) {
    const want = Math.round(EXAM_SIZE * weights[n]);
    picked = picked.concat(drawPreferUnseen(pool.filter(q => q.niveau === Number(n)), want));
  }
  const rest = drawPreferUnseen(pool.filter(q => !picked.includes(q)), EXAM_SIZE);
  let i = 0;
  while (picked.length < EXAM_SIZE && i < rest.length) picked.push(rest[i++]);
  return shuffle(picked).slice(0, EXAM_SIZE);
}

function showExamIntro() {
  setPath("./quiz --examen");
  const paliers = [1, 2, 3, 4].map(p => palierAccess(p));
  const best = state.cnt.palierBest || {};
  const DESC = {
    1: "niveau 1 uniquement — les fondamentaux",
    2: "mélange des niveaux 1 et 2",
    3: "mélange des niveaux 1 à 3",
    4: "tous les niveaux — l'épreuve finale"
  };
  const rows = paliers.map(a => {
    if (a.ok) return `
      <div class="level-row" data-palier="${a.p}">
        <div class="lvl" style="background:${LEVEL_COLORS[a.p]}22; color:${LEVEL_COLORS[a.p]}">${a.p}</div>
        <div><h3>Examen palier ${a.p}</h3><p>${DESC[a.p]} · ${EXAM_SIZE} questions · ${EXAM_MINUTES} min</p></div>
        <div class="right">${best[a.p] != null ? "meilleur<br>" + best[a.p] + " %" : ""}</div>
      </div>`;
    const faits = a.total - a.restants.length;
    return `
      <div class="level-row locked">
        <div class="lvl" style="background:${LEVEL_COLORS[a.p]}22; color:${LEVEL_COLORS[a.p]}"><i class="ti ti-lock"></i></div>
        <div><h3>Examen palier ${a.p}</h3><p>valider le niveau ${a.p} de chaque thème — ${faits}/${a.total} thèmes prêts</p></div>
      </div>`;
  }).join("");
  screen.innerHTML = `
    <h1 style="margin-bottom:14px">Examens blancs</h1>
    <div class="level-list">${rows}</div>
    <div class="feedback" style="margin-top:16px">
      <i class="ti ti-info-circle" style="color:var(--cyan)"></i>
      Chaque palier n'interroge que les niveaux déjà validés partout : le palier 1 reste sur les
      fondamentaux, le palier 4 mélange tout. ${EXAM_MINUTES} minutes chrono, aucune correction pendant
      l'épreuve, les questions sans réponse comptent faux, XP doublés. Corrigé des erreurs et des
      questions non traitées à la fin. Seuil de réussite : 60 %.
    </div>
    <p class="comment" style="margin-top:10px"># examens passés : ${state.cnt.exams} · meilleur score : ${state.cnt.examBest} %</p>`;
  document.querySelectorAll(".level-row[data-palier]").forEach(r => {
    r.onclick = () => {
      const p = parseInt(r.dataset.palier, 10);
      startSession(drawExam(p), { exam: true, palier: p, title: "Examen palier " + p, color: "var(--violet)", back: () => nav("exam") });
    };
  });
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
        <div class="level-row" data-qid="${esc(q.id)}">
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
  document.querySelectorAll(".level-row[data-qid]").forEach(r => {
    r.onclick = () => {
      const q = BANK.find(x => x.id === r.dataset.qid);
      if (q) startSession([q], { title: "Révision ciblée", color: "var(--amber)", back: () => nav("review"), review: true });
    };
  });
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
  screen.innerHTML = `<h1>Classement de la promo</h1><p class="comment"># chargement...</p>`;
  const tk = navToken;
  const rows = (typeof onlineBoard === "function") ? await onlineBoard() : null;
  if (tk !== navToken) return;
  if (!rows) {
    screen.innerHTML = `
      <h1>Classement de la promo</h1>
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
    <h1>Classement de la promo</h1>
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
      const b = $("#logout");
      b.disabled = true;
      const tk = navToken;
      await onlineSignOut();
      updateOnlineBadge();
      if (tk === navToken) nav("profile");
    };
  } else if ($("#signup")) {
    let authBusy = false;
    const doAuth = async signup => {
      if (authBusy) return;
      const tk = navToken;
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
        const bs = $("#signup"), bc = $("#signin");
        if (bs) bs.disabled = false;
        if (bc) bc.disabled = false;
        if (msg && document.contains(msg)) {
          msg.style.color = "var(--red)";
          msg.textContent = err + (!signup && err.includes("incorrect")
            ? " Nouveau sur Root Camp ? Utilisez « Créer mon compte »." : "");
        }
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
      if (tk === navToken) nav("profile");
    };
    $("#signup").onclick = () => doAuth(true);
    $("#signin").onclick = () => doAuth(false);
    $("#auth-pseudo").addEventListener("keydown", e => { if (e.key === "Enter") $("#auth-pass").focus(); });
    $("#auth-pass").addEventListener("keydown", e => { if (e.key === "Enter" && !e.repeat) doAuth(false); });
  }

  let resetArmed = false;
  let resetArmedAt = 0;
  $("#reset").onclick = async () => {
    if (!resetArmed) {
      resetArmed = true;
      resetArmedAt = Date.now();
      $("#reset").innerHTML = '<i class="ti ti-alert-triangle"></i> Cliquez à nouveau pour tout effacer';
      setTimeout(() => {
        resetArmed = false;
        const btn = $("#reset");
        if (btn) btn.innerHTML = '<i class="ti ti-trash"></i> Réinitialiser ma progression';
      }, 3000);
      return;
    }
    if (Date.now() - resetArmedAt < 400) return;
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

let examAbandonArm = 0;
document.querySelectorAll(".nav button").forEach(b => {
  b.onclick = () => {
    if (session && session.exam && !session.done) {
      const now = Date.now();
      if (now - examAbandonArm > 2500) {
        examAbandonArm = now;
        toast('<i class="ti ti-alert-triangle"></i> Examen en cours — cliquez à nouveau pour l\'abandonner');
        return;
      }
    }
    examAbandonArm = 0;
    if (session) {
      endTimer();
      if (session.nextTimer) clearTimeout(session.nextTimer);
      session = null;
      pendingToasts.forEach(toast);
      pendingToasts = [];
      updateNavPill();
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
            if (bootDone && !session) {
              updateNavPill();
              updateOnlineBadge();
              toast('<i class="ti ti-cloud-download"></i> Progression synchronisée depuis le cloud');
              nav(currentPage);
            }
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
    if (!state.accueilVu && state.cnt.total === 0) showBienvenue();
    else nav("home");
    bootDone = true;
  } catch (err) {
    screen.innerHTML = `<p class="loading" style="color:var(--red)"># erreur de chargement : ${esc(err.message)}<br># ouvrez le site via un serveur web (http), pas en fichier local.</p>`;
  }
})();
