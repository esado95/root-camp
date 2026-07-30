# Root Camp — quiz TSSR2601

**Root Camp** : de stagiaire à `root@tssr`. Application web de révision pour la préparation au titre professionnel **TSSR** (Technicien Supérieur Systèmes et Réseaux). Les questions (858, sur 9 thèmes) sont générées à partir des fiches de cours de la promotion TSSR2601, avec examens blancs chronométrés, terminal simulé pour les commandes, révision espacée, grades et badges.

## Fonctionnalités

- **Entraînement par thème** : Réseaux, Windows/AD, Linux, Sécurité... 4 niveaux de difficulté (connaissance → compréhension → application → analyse), le niveau suivant se débloque à 70 % de réussite.
- **6 types de questions** : QCM, choix multiples, association, remise en ordre, champ libre, scénario de diagnostic.
- **Examen blanc** : 20 questions, 20 minutes, sans correction pendant l'épreuve, XP doublés.
- **Révision espacée** : chaque erreur part dans la pile « à revoir » ; 2 bonnes réponses d'affilée pour en sortir.
- **Progression** : XP, 7 grades (de *stagiaire* à *root@tssr*), badges à débloquer. Sauvegarde locale (localStorage), aucun serveur requis.

## Lancer en local

```bash
python -m http.server 8123
```

puis ouvrir <http://localhost:8123>. (N'importe quel serveur statique convient — le site ne fonctionne pas en `file://` à cause du chargement des JSON.)

## Structure

```
index.html              application (une seule page)
css/style.css           thème « console » sombre
js/app.js               logique : sessions, examen, XP, badges
questions/
├── manifest.json       liste des thèmes et modules + version de la banque
└── <theme>/<module>.json   banque de questions par module
```

## Format d'une question

```json
{
  "id": "dhcp-001",
  "niveau": 2,
  "type": "qcm",
  "q": "Énoncé ?",
  "choices": ["A", "B", "C", "D"],
  "answer": 1,
  "explication": "Pourquoi c'est la bonne réponse.",
  "context": "(optionnel — sortie de commande pour les scénarios)"
}
```

Types : `qcm` (answer = index), `multi` (answer = liste d'index), `assoc` (`pairs`), `ordre` (`steps` dans le bon ordre), `libre` (`accept` = réponses acceptées), `scenario` (qcm + `context`).

Pour ajouter un module : créer le JSON, le déclarer dans `manifest.json` — rien d'autre à modifier.
