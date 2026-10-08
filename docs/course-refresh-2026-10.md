# Mise à jour des cours du 8 octobre 2026

La banque passe de 893 à 957 questions, de 28 à 33 modules et de la version 7 à la version 8. Les dix thèmes et les identifiants des questions existantes sont conservés. Les cinq nouveaux modules couvrent chacun les niveaux 1 à 4 et utilisent les formats déjà pris en charge par le moteur.

| Thème | Module ajouté | Questions | N1 / N2 / N3 / N4 |
|---|---|---:|---|
| Sécurité | VPN & OpenVPN sur pfSense | 12 | 3 / 3 / 3 / 3 |
| Réseaux | Haute disponibilité réseau — OSPF, LACP & HSRP | 16 | 4 / 4 / 4 / 4 |
| Virtualisation | Sauvegarde, restauration & réplication — Veeam | 12 | 3 / 3 / 3 / 3 |
| Virtualisation | Cloud AWS — VPC, EC2 & supervision | 16 | 4 / 4 / 4 / 4 |
| Matériel | NAS Synology — stockage, partages & sauvegarde | 8 | 2 / 2 / 2 / 2 |

## Sources des cours

Les chemins ci-dessous sont relatifs à la collection `Formation`. Le champ `source` de chaque nouvelle question précise le fichier et la section concernés. Ces références servent à la maintenance du contenu ; le moteur affiche l’explication, sans ouvrir le document de cours.

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
- [Synology — dossiers partagés et masquage selon les permissions](https://kb.synology.com/index.php/en-us/DSM/help/DSM/AdminCenter/file_share_create?version=7).

## Périmètre

Cet ajout couvre les documents présents pour VPN, HA réseau, Veeam, AWS et NAS. Les deux dossiers Docker de septembre ne contenaient pas de support exploitable lors de cette mise à jour. Les contenus INFRA et scripting ne font pas partie de cet ajout.

La version du manifest est incrémentée pour renouveler les fichiers de questions chargés par le navigateur. Aucun changement de schéma de progression n’est nécessaire.

## Vérification

- `python -X utf8 tools/validate_bank.py` : 957 questions, 957 identifiants uniques, 33 modules ; aucun avertissement ni erreur.
- Navigateur Edge sur un serveur statique local : chargement des cinq nouveaux modules, soumission de la réponse attendue pour chacun des 64 ajouts et affichage de chaque explication.
- Tirage des quatre paliers : 20 questions distinctes par épreuve, formats et niveaux compatibles avec le palier.
- Compatibilité : les 893 identifiants existants et leurs niveaux, types et réponses sont conservés ; une progression enregistrée est retrouvée après rechargement.
- Contrôle du rendu mobile à 390 px et absence d’erreur JavaScript durant ces vérifications. La connexion Supabase était désactivée dans cette session de test.
