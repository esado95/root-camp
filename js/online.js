"use strict";

/* Couche en ligne : authentification, synchronisation, classement.
   Tout est facultatif — si Supabase est injoignable, l'application
   continue en mode invité sans aucune erreur visible.

   Règles de sûreté (issues de la revue) :
   - une lecture cloud en échec n'est JAMAIS traitée comme « pas de sauvegarde » ;
   - aucun push tant qu'une lecture cloud n'a pas réussi (syncOk) ;
   - avant chaque push, garde anti-écrasement : génération puis XP ;
   - toutes les erreurs { error } de supabase-js sont vérifiées explicitement. */

let sb = null;
let onlineUser = null;
let pushTimer = null;
let lastPushArgs = null;
let syncOk = false;
let syncError = false;

function onlineInit() {
  if (typeof supabase === "undefined" || !ONLINE_CONFIG.url || !ONLINE_CONFIG.key) return false;
  try {
    sb = supabase.createClient(ONLINE_CONFIG.url, ONLINE_CONFIG.key);
    return true;
  } catch (e) {
    console.warn("Supabase indisponible :", e);
    return false;
  }
}

function onlineStatus() {
  if (!sb || !onlineUser) return "local";
  return syncError ? "erreur" : "ok";
}

function pseudoToEmail(pseudo) {
  return pseudo.toLowerCase() + "@" + ONLINE_CONFIG.emailDomain;
}

function pseudoValide(pseudo) {
  return /^[a-zA-Z0-9_-]{2,20}$/.test(pseudo);
}

function authErrorMessage(error) {
  const m = (error && error.message) || "";
  if (!navigator.onLine || (error && error.name === "AuthRetryableFetchError") ||
      /fetch|network|load failed/i.test(m)) return "Connexion impossible — vérifiez votre accès Internet.";
  if (m.includes("already registered")) return "Ce pseudo est déjà pris.";
  if (m.includes("at least")) return "Mot de passe trop court (6 caractères minimum).";
  if (m.includes("Invalid login credentials")) return "Pseudo ou mot de passe incorrect.";
  if (m.includes("security purposes")) return "Trop de tentatives — patientez une minute.";
  if (m.includes("not confirmed")) return "Compte non confirmé — signalez-le à l'administrateur.";
  return "Erreur : " + m;
}

async function onlineRestore() {
  if (!sb) return;
  try {
    const { data } = await sb.auth.getSession();
    if (!data.session) return;
    const uid = data.session.user.id;
    const email = data.session.user.email || "";
    onlineUser = { id: uid, pseudo: email.split("@")[0], pseudoConfirme: false };
    const { data: prof, error } = await sb.from("profiles").select("pseudo").eq("id", uid).maybeSingle();
    if (error) { console.warn("Profil illisible :", error); return; }
    onlineUser.pseudoConfirme = true;
    if (prof) onlineUser.pseudo = prof.pseudo;
    else {
      const { error: ie } = await sb.from("profiles").upsert({ id: uid, pseudo: onlineUser.pseudo });
      if (ie) console.warn("Création du profil :", ie);
    }
  } catch (e) {
    console.warn("Restauration de session impossible :", e);
  }
}

async function onlineSignUp(pseudo, password) {
  if (!sb) return "Partie en ligne indisponible.";
  if (!pseudoValide(pseudo)) return "Pseudo invalide : 2 à 20 caractères, lettres/chiffres/-/_ uniquement.";
  const { data, error } = await sb.auth.signUp({ email: pseudoToEmail(pseudo), password });
  if (error) return authErrorMessage(error);
  if (!data.session) return "Compte créé mais session absente — vérifiez que « Confirm email » est désactivé dans Supabase.";
  const { error: pe } = await sb.from("profiles").upsert({ id: data.user.id, pseudo });
  if (pe) {
    console.warn("Création du profil :", pe);
    if (String(pe.code) === "23505") {
      try { await sb.auth.signOut(); } catch (e) { console.warn(e); }
      onlineUser = null;
      return "Ce pseudo est déjà pris.";
    }
  }
  onlineUser = { id: data.user.id, pseudo };
  syncOk = true;
  syncError = false;
  return null;
}

async function onlineSignIn(pseudo, password) {
  if (!sb) return "Partie en ligne indisponible.";
  const { data, error } = await sb.auth.signInWithPassword({ email: pseudoToEmail(pseudo), password });
  if (error) return authErrorMessage(error);
  onlineUser = { id: data.user.id, pseudo };
  const { data: prof, error: se } = await sb.from("profiles").select("pseudo").eq("id", data.user.id).maybeSingle();
  if (!se && prof) onlineUser.pseudo = prof.pseudo;
  else if (!se && !prof) {
    const { error: ie } = await sb.from("profiles").upsert({ id: data.user.id, pseudo });
    if (ie) console.warn("Création du profil :", ie);
  }
  return null;
}

async function onlineSignOut() {
  if (!sb) return;
  await onlineFlush();
  clearTimeout(pushTimer);
  pushTimer = null;
  lastPushArgs = null;
  try { await sb.auth.signOut(); } catch (e) { console.warn(e); }
  onlineUser = null;
  syncOk = false;
  syncError = false;
}

/* Retourne { ok, state } : ok=false signifie ÉCHEC DE LECTURE (réseau, session),
   à ne jamais confondre avec « pas encore de sauvegarde » (ok=true, state=null). */
async function onlineFetchState() {
  if (!sb || !onlineUser) return { ok: false, state: null };
  try {
    const { data, error } = await sb.from("progress").select("state").eq("id", onlineUser.id).maybeSingle();
    if (error) {
      console.warn("Lecture du cloud impossible :", error);
      syncError = true;
      return { ok: false, state: null };
    }
    syncOk = true;
    syncError = false;
    return { ok: true, state: data ? data.state : null };
  } catch (e) {
    console.warn("Lecture du cloud impossible :", e);
    syncError = true;
    return { ok: false, state: null };
  }
}

async function onlinePushState(st, gradeNum) {
  if (!sb || !onlineUser || !syncOk) return;
  try {
    const { data: cur, error: re } = await sb.from("progress").select("state").eq("id", onlineUser.id).maybeSingle();
    if (re) { syncError = true; console.warn("Garde de push :", re); return; }
    const cloud = cur ? cur.state : null;
    if (cloud) {
      const cg = Number(cloud.gen) || 0, sg = Number(st.gen) || 0;
      if (cg > sg || (cg === sg && (Number(cloud.xp) || 0) > st.xp)) {
        console.warn("Push ignoré : le cloud est plus avancé (autre appareil).");
        return "stale";
      }
    }
    const now = new Date().toISOString();
    const payload = {
      id: onlineUser.id, xp: st.xp, grade: gradeNum,
      badges: st.badges.length, exam_best: st.cnt.examBest, updated_at: now
    };
    if (onlineUser.pseudoConfirme !== false) payload.pseudo = onlineUser.pseudo;
    const { error: e1 } = await sb.from("profiles").upsert(payload);
    const { error: e2 } = await sb.from("progress").upsert({ id: onlineUser.id, state: st, updated_at: now });
    if (e1 || e2) {
      console.warn("Synchronisation en échec :", e1 || e2);
      syncError = true;
      return;
    }
    syncError = false;
  } catch (e) {
    console.warn("Synchronisation impossible :", e);
    syncError = true;
  }
}

function onlinePushSoon(st, gradeNum) {
  if (!sb || !onlineUser) return;
  lastPushArgs = [st, gradeNum];
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; onlinePushState(st, gradeNum); }, 4000);
}

async function onlineFlush() {
  if (pushTimer && lastPushArgs) {
    clearTimeout(pushTimer);
    pushTimer = null;
    await onlinePushState(lastPushArgs[0], lastPushArgs[1]);
  }
}

function flushSync() {
  if (pushTimer && lastPushArgs) {
    clearTimeout(pushTimer);
    pushTimer = null;
    onlinePushState(lastPushArgs[0], lastPushArgs[1]);
  }
}
window.addEventListener("pagehide", flushSync);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSync(); });

async function onlineBoard() {
  if (!sb) return null;
  try {
    const { data, error } = await sb.from("profiles")
      .select("id,pseudo,xp,grade,badges,exam_best,updated_at")
      .order("xp", { ascending: false })
      .limit(50);
    if (error) { console.warn(error); return null; }
    return data;
  } catch (e) {
    console.warn("Classement indisponible :", e);
    return null;
  }
}
