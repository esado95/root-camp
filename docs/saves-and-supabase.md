# Sauvegardes et Supabase

Les questions sont distribuées par les fichiers JSON du dépôt. Les résultats ont deux copies possibles : le navigateur (`localStorage`, clé `root-camp-v1`) et, pour un compte connecté, le projet Supabase indiqué dans `js/config.js`.

La table `progress` contient l’état complet privé du compte : réponses, XP, niveaux, révisions, badges, examens et checkpoint. La table `profiles` contient le pseudo et les indicateurs du classement. Les scripts `supabase/setup.sql` et `supabase/hardening.sql` décrivent le schéma et les protections attendues ; leur présence dans Git ne prouve pas leur application au serveur.

## Utilisation

- Entrer dans Profil avec le même compte sur PC et téléphone pour retrouver la copie cloud.
- Un invité conserve ses résultats dans son navigateur ; effacer les données du site supprime cette copie.
- Après une coupure réseau ou une reprise de Supabase, recharger l’application et contrôler l’indicateur de synchronisation avant de changer d’appareil.
- La synchronisation retardée part environ quatre secondes après une réponse. À la fermeture, le navigateur peut interrompre les requêtes ; la copie locale conserve le résultat.
- La commande de réinitialisation efface volontairement la progression et incrémente sa génération. Elle ne sert pas à réparer une connexion.

## Projet en pause

Le 8 octobre 2026, le projet a été trouvé en pause puis repris depuis le Dashboard. Pendant sa remise en route, les API ont brièvement répondu 502/521 ; les contrôles ultérieurs d’Auth et des deux tables ont répondu 200. Root Camp utilise Auth et l’API PostgREST ; il ne s’abonne pas à Realtime.

Pour une nouvelle interruption, contrôler l’état du projet et son URL dans le Dashboard, puis les réponses d’Auth/PostgREST. [La documentation Supabase sur NXDOMAIN](https://supabase.com/docs/guides/troubleshooting/nxdomain-error-connecting-to-a-supabase-project) décrit les causes possibles d’un nom de projet inaccessible. Une erreur réseau ne démontre pas une perte des données.

## Contrôle administrateur

Pour valider une remise en service complète, vérifier avec un compte existant qu’une réponse est conservée après rechargement et retrouvée sur un deuxième navigateur connecté au même compte. Vérifier aussi qu’un autre compte ne peut pas lire cette progression. Les lectures publiques réalisées pendant la revue ne remplacent pas ces essais authentifiés.

Conserver une sauvegarde de la base avant toute migration. Une sauvegarde destinée à une restauration complète doit inclure les comptes Auth et les résultats, pas seulement les indicateurs du classement. Vérifier sa restauration dans un projet de test. [Les procédures de sauvegarde Supabase](https://supabase.com/docs/guides/platform/backups) précisent les possibilités du projet.

L’ajout des cours et les corrections du client ne nécessitent aucune migration SQL. La clé publique du client dépend des protections RLS ; une clé d’administration ne doit pas être ajoutée au code de l’application.

La synchronisation actuelle choisit une copie selon la génération, l’XP puis le nombre de réponses. Elle ne fusionne pas des branches de progression concurrentes. La garde client réduit les écrasements mais laisse une fenêtre entre lecture et écriture : une écriture atomique/versionnée côté serveur serait nécessaire pour garantir les modifications simultanées de plusieurs appareils.
