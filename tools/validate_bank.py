# Validateur de la banque de questions — usage : python tools/validate_bank.py
# Vérifie la syntaxe JSON, les champs obligatoires, la cohérence des types
# et l'unicité des identifiants sur toute la banque.
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "questions"
TYPES = {"qcm", "multi", "assoc", "ordre", "libre", "scenario", "terminal", "tp"}

errors = []
warnings = []
all_ids = {}
stats = {}


def err(f, qid, msg):
    errors.append(f"[{f.name}] {qid or '-'}: {msg}")


def check_question(f, q, idx):
    qid = q.get("id", f"#{idx}")
    for field in ("id", "niveau", "type", "q", "explication"):
        if field not in q:
            err(f, qid, f"champ manquant : {field}")
            return
    if q["id"] in all_ids:
        err(f, qid, f"id en double (déjà dans {all_ids[q['id']]})")
    all_ids[q["id"]] = f.name
    if q["niveau"] not in (1, 2, 3, 4):
        err(f, qid, f"niveau invalide : {q['niveau']}")
    t = q["type"]
    if t not in TYPES:
        err(f, qid, f"type inconnu : {t}")
        return
    if t in ("qcm", "scenario"):
        ch = q.get("choices")
        if not isinstance(ch, list) or len(ch) < 3:
            err(f, qid, "choices absent ou < 3 propositions")
        elif not isinstance(q.get("answer"), int) or not (0 <= q["answer"] < len(ch)):
            err(f, qid, f"answer hors limites : {q.get('answer')}")
    elif t == "multi":
        ch = q.get("choices")
        ans = q.get("answer")
        if not isinstance(ch, list) or len(ch) < 3:
            err(f, qid, "choices absent ou < 3 propositions")
        elif not isinstance(ans, list) or not ans:
            err(f, qid, "answer doit être une liste non vide")
        elif any(not isinstance(a, int) or not (0 <= a < len(ch)) for a in ans):
            err(f, qid, f"answer contient un index hors limites : {ans}")
        elif len(set(ans)) != len(ans):
            err(f, qid, "answer contient des doublons")
    elif t == "assoc":
        pairs = q.get("pairs")
        if not isinstance(pairs, list) or len(pairs) < 2:
            err(f, qid, "pairs absent ou < 2 paires")
        elif any(not isinstance(p, list) or len(p) != 2 for p in pairs):
            err(f, qid, "chaque paire doit être [gauche, droite]")
        elif len({p[1] for p in pairs}) != len(pairs):
            err(f, qid, "valeurs de droite non uniques (ambigu pour l'appariement)")
    elif t == "ordre":
        steps = q.get("steps")
        if not isinstance(steps, list) or len(steps) < 3:
            err(f, qid, "steps absent ou < 3 étapes")
        elif len(set(steps)) != len(steps):
            err(f, qid, "étapes en double")
    elif t in ("libre", "terminal"):
        acc = q.get("accept")
        if not isinstance(acc, list) or not acc:
            err(f, qid, "accept absent ou vide")
        elif any(not isinstance(a, str) or not a.strip() for a in acc):
            err(f, qid, "accept contient une entrée vide")
        for champ in ("output", "error", "prompt"):
            if champ in q and not isinstance(q[champ], str):
                err(f, qid, f"{champ} doit être une chaîne (pas un tableau/objet)")
    elif t == "tp":
        steps = q.get("steps")
        if not isinstance(steps, list) or len(steps) < 2:
            err(f, qid, "steps absent ou < 2 étapes")
        else:
            for j, s in enumerate(steps):
                if not isinstance(s, dict) or "q" not in s:
                    err(f, qid, f"étape {j + 1} : objectif (q) manquant")
                    continue
                acc = s.get("accept")
                if not isinstance(acc, list) or not acc or any(not isinstance(a, str) or not a.strip() for a in acc):
                    err(f, qid, f"étape {j + 1} : accept absent ou vide")
                for champ in ("output", "error", "hint", "prompt"):
                    if champ in s and not isinstance(s[champ], str):
                        err(f, qid, f"étape {j + 1} : {champ} doit être une chaîne")
    if len(q.get("explication", "")) < 15:
        warnings.append(f"[{f.name}] {qid}: explication très courte")


def main():
    manifest_path = ROOT / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    declared = {ROOT / m["file"] for t in manifest["themes"] for m in t["modules"]}

    on_disk = {p for p in ROOT.rglob("*.json") if p.name != "manifest.json"}
    for p in sorted(on_disk - declared):
        warnings.append(f"{p.relative_to(ROOT)} existe mais n'est pas déclaré dans manifest.json")
    for p in sorted(declared - on_disk):
        errors.append(f"{p.relative_to(ROOT)} déclaré dans manifest.json mais introuvable")

    for p in sorted(on_disk):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            errors.append(f"[{p.name}] JSON invalide : {e}")
            continue
        if "module" not in data or "questions" not in data:
            errors.append(f"[{p.name}] champs module/questions manquants")
            continue
        by_level = {1: 0, 2: 0, 3: 0, 4: 0}
        by_type = {}
        for i, q in enumerate(data["questions"]):
            check_question(p, q, i)
            if q.get("niveau") in by_level:
                by_level[q["niveau"]] += 1
            by_type[q.get("type", "?")] = by_type.get(q.get("type", "?"), 0) + 1
        stats[p.name] = (data["module"], len(data["questions"]), by_level, by_type)

    print(f"{'Fichier':<34} {'Module':<38} {'Total':>5}  N1/N2/N3/N4")
    print("-" * 100)
    total = 0
    for name, (module, count, lv, bt) in sorted(stats.items()):
        total += count
        print(f"{name:<34} {module[:37]:<38} {count:>5}  {lv[1]}/{lv[2]}/{lv[3]}/{lv[4]}")
    print("-" * 100)
    print(f"TOTAL : {total} questions dans {len(stats)} modules — {len(all_ids)} ids uniques")

    if warnings:
        print(f"\n⚠ {len(warnings)} avertissement(s) :")
        for w in warnings:
            print("  " + w)
    if errors:
        print(f"\n✗ {len(errors)} ERREUR(S) :")
        for e in errors:
            print("  " + e)
        sys.exit(1)
    print("\n✓ Banque valide.")


if __name__ == "__main__":
    main()
