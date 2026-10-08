# Mise à jour des cours du 8 octobre 2026

La banque passe de 893 à 957 questions, de 28 à 33 modules et de la version 7 à la version 10. Les dix thèmes et les identifiants des questions existantes sont conservés. Les cinq nouveaux modules couvrent chacun les niveaux 1 à 4 et utilisent les formats déjà pris en charge par le moteur.

| Thème | Module ajouté | Questions | N1 / N2 / N3 / N4 |
|---|---|---:|---|
| Sécurité | VPN & OpenVPN sur pfSense | 12 | 3 / 3 / 3 / 3 |
| Réseaux | Haute disponibilité réseau — OSPF, LACP & HSRP | 16 | 4 / 4 / 4 / 4 |
| Virtualisation | Sauvegarde, restauration & réplication — Veeam | 12 | 3 / 3 / 3 / 3 |
| Virtualisation | Cloud AWS — VPC, EC2 & supervision | 16 | 4 / 4 / 4 / 4 |
| Matériel | NAS Synology — stockage, partages & sauvegarde | 8 | 2 / 2 / 2 / 2 |

## Sources des cours

Les chemins ci-dessous sont relatifs à la collection `Formation`. Les références par identifiant sont conservées séparément dans [`course-sources.json`](course-sources.json), pour la maintenance. Elles ne font pas partie des données de questions chargées par l’application.

Les énoncés, choix, contextes et explications sont autonomes : ils ne mentionnent ni les cours d’origine, ni un TP externe, ni le lieu de formation. Les scénarios indiquent leurs propres paramètres. Le classement IaaS/PaaS/SaaS utilise un exemple de plateforme applicative gérée plutôt qu’une classification propre au support initial.

L’exercice d’ordre OpenVPN regroupe la préparation des certificats serveur et client dans une seule étape : leur ordre relatif n’est pas une dépendance technique. L’accès Internet EC2 précise qu’il est direct, et la règle MySQL cible les instances membres du groupe source, sans promettre l’exclusivité pour une machine si d’autres instances rejoignent ce groupe.

| Module | Documents utilisés |
|---|---|
| VPN | `54 - 31.08.2026 - VPN/2.8.0 - Cours - OpenVPN - Explications des différents types_V2024.docx` ; `54 - 31.08.2026 - VPN/2.8.1 - TP - Cours - OpenVPN sur PFSense_V2024 - Copie.docx` |
| HA réseau | `55 - 01-02.09.2026 - HA/01_TP_OSPF/01_Sujet/TP_HA_OSPF_2026_Sujet.docx` ; `55 - 01-02.09.2026 - HA/02_TP_Agregation_Liens_HSRP/01_Sujet/TP_HA_Agregation_Liens_FHRP_2026_Sujet_FR.docx` |
| Veeam | `61 - 15.09.2026 - BACKUP/TP Veeam.docx` |
| AWS | `63 - 17-18.09.2026 - Cloud/TP Cloud AWS 2026.docx` ; `63 - 17-18.09.2026 - Cloud/Guide_TP_Cloud_AWS_2026.docx` |
| NAS | `49 - 29.07.2026 - NAS/2 - configuration NAS synology.docx` ; `49 - 29.07.2026 - NAS/3 - serveur de fichier NAS synology.docx` ; `49 - 29.07.2026 - NAS/5 -sauvegarde NAS synology.docx` |

Les documents de cours, leurs captures et les fichiers d’accès ne sont pas copiés dans le dépôt. Les adresses et noms utilisés dans les nouveaux exercices sont des exemples de lab ; le fichier `lab.pem` est fictif.

## Précisions techniques

La question existante sur le VPN site-à-site garde son identifiant et sa bonne réponse, mais précise qu’IPsec n’est pas la seule solution et qu’OpenVPN peut aussi relier deux sites. Les nouveaux exercices distinguent le réseau du tunnel, les routes du LAN et les deux niveaux de filtrage WAN/OpenVPN. Ils ne présentent pas un VPN comme une garantie d’anonymat.

Les exercices réseau distinguent la redondance de liens, de passerelle et de chemin. Le retour d’un routeur HSRP de priorité supérieure est conditionné à la préemption. Les sorties terminal sont des exemples simulés.

Les exercices de sauvegarde distinguent le contrôle d’intégrité, le test de restauration et le retour depuis un replica. SureBackup est décrit dans son mode de test complet et sans promettre sa disponibilité dans toutes les éditions. Les exercices AWS distinguent les responsabilités du client EC2 de celles du fournisseur et la collecte des métriques système invité.

Les points sensibles ont été recoupés avec la documentation des éditeurs :

- [Netgate — règles OpenVPN](https://docs.netgate.com/pfsense/en/latest/vpn/openvpn/firewall-rules.html), [réseaux et routage du tunnel](https://docs.netgate.com/pfsense/en/latest/vpn/openvpn/configure-server-tunnel.html).
- [Cisco — LACP](https://www.cisco.com/c/en/us/td/docs/switches/lan/c9000/lyr2-fwd/etherchannel/etherchannel-configuration-guide/m_ethernetchannel.html), [HSRP et préemption](https://www.cisco.com/c/en/us/support/docs/ip/hot-standby-router-protocol-hsrp/13780-6.html), [configuration OSPF](https://netascode.cisco.com/docs/data_models/iosxe/device/ospf/).
- [Veeam — SureBackup sur Hyper-V](https://helpcenter.veeam.com/docs/vbr/userguide/surebackup_hiw_hv.html), [failback Hyper-V](https://helpcenter.veeam.com/docs/vbr/powershell/start-vbrhvreplicafailback.html).
- [AWS — Internet Gateway](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html), [Security Groups](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html), [NAT Gateway](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html), [métriques de l’agent CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/metrics-collected-by-CloudWatch-agent.html).
- [AWS — modèles de services cloud](https://aws.amazon.com/types-of-cloud-computing/), [Elastic Beanstalk](https://aws.amazon.com/elasticbeanstalk/faqs/).
- [OpenSSH — option `-i` et distinction avec `-I`](https://man.openbsd.org/ssh). L’exercice `aws-010` active `caseSensitive` : les commandes, options et noms conservent leur casse lors de la validation et de l’autocomplétion. Le comportement des commandes IOS existantes reste compatible.
- [Synology — dossiers partagés et masquage selon les permissions](https://kb.synology.com/index.php/en-us/DSM/help/DSM/AdminCenter/file_share_create?version=7).

## Périmètre

Cet ajout couvre les documents présents pour VPN, HA réseau, Veeam, AWS et NAS. Les deux dossiers Docker de septembre ne contenaient pas de support exploitable lors de cette mise à jour. Les contenus INFRA et scripting ne font pas partie de cet ajout.

La version du manifest est incrémentée pour renouveler les fichiers de questions chargés par le navigateur. Aucun changement de schéma de progression n’est nécessaire.

## Corrections des sauvegardes

La revue a reproduit des écrasements possibles à la fermeture de page, qui contournait la lecture de garde, et une confusion de progression lors du chargement d’un compte vide sur un navigateur contenant les résultats d’un autre compte. Ces chemins utilisent désormais les mêmes protections et contrôlent l’identité avant et après les opérations asynchrones. Une lecture cloud en échec suspend les écritures jusqu’à une lecture réussie.

À génération et XP égaux, la comparaison tient aussi compte du nombre de réponses : les réponses fausses peuvent ainsi rendre une sauvegarde plus récente sans augmenter l’XP. Le statut signale une sauvegarde rejetée parce que le cloud est plus avancé. Le schéma de progression reste compatible.

Cette protection demeure côté client : la lecture de garde et l’écriture ne forment pas une transaction serveur, et deux sessions réellement simultanées ne sont pas fusionnées automatiquement. Une garantie complète nécessite une écriture atomique/versionnée côté base. Les limites et les opérations de maintenance sont décrites dans [Sauvegardes et Supabase](saves-and-supabase.md).

## Vérification

- `python -X utf8 tools/validate_bank.py` : 957 questions, 957 identifiants uniques, 33 modules ; aucun avertissement ni erreur.
- `node tools/test_content.cjs` : tous les champs de questions et les étapes d’exercices sont contrôlés pour empêcher le retour de références aux cours d’origine.
- `node tools/test_runtime.cjs` : 16 tests de régression, notamment casse SSH, lecture/écriture cloud en échec, fermeture de page, réinitialisation et changement de compte. Les écritures sont simulées.
- `node tools/test_browser.cjs` : cinq graines de tirage et cinq tailles d’écran (360, 390, 768, 1280 et 1440 px). Chacun des 64 ajouts reçoit une bonne réponse et une réponse volontairement fausse par passage, soit 640 cas. Les scores, XP, révisions et explications sont contrôlés.
- 20 000 tirages d’examen : 20 questions distinctes, formats autorisés et répartition exacte des niveaux pour chacun des quatre paliers.
- Compatibilité : les 893 identifiants existants et leurs niveaux, types et réponses sont conservés. Reprise d’un checkpoint, absence de double comptage, sortie de révision après deux bonnes réponses, correction masquée pendant l’examen et résultat à l’expiration contrôlés.
- `node tools/test_storage_browser.cjs` : neuf scénarios de chargement local/cloud, dont compte vide, progression d’un autre propriétaire, ancienne clé de stockage et JSON corrompu.
- Aucun débordement horizontal ni erreur JavaScript pendant ces parcours. Edge fonctionne dans un profil de test séparé ; les requêtes externes sont bloquées et Supabase est simulé ou désactivé.
- Contrôle visuel final : le bouton Quitter garde son libellé sur une ligne avec les titres longs ; la confirmation d’abandon et le chronomètre restent accessibles sur les écrans étroits.
- L’écran `./quiz --regles` et les indications d’accueil utilisent des formulations autonomes. Les règles précisent la reprise à la question suivante, le caractère simulé du terminal, les conditions de l’Atelier, les formats d’examen et l’absence de points partiels. Navigation et disposition contrôlées dans Edge sur 360, 390, 768, 1280 et 1440 px, sans erreur JavaScript ni débordement horizontal.
- Vérification distincte du Supabase publié après reprise du projet le 8 octobre 2026 : Auth et API `profiles`/`progress` répondent HTTP 200 ; une lecture anonyme de `progress` ne retourne aucune ligne. Aucun compte de test ni écriture dans la base de production n’a été créé. L’enregistrement authentifié et les politiques effectivement déployées n’ont pas été certifiés par cette vérification publique.

Les tests navigateur nécessitent Playwright et Microsoft Edge. Ils utilisent un serveur local temporaire. `PLAYWRIGHT_MODULE` et `GIT_EXECUTABLE` permettent de désigner des installations existantes ; les captures du test principal vont dans un dossier temporaire.
