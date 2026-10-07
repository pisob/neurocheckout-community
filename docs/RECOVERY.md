# Update safety and recovery / Mise à jour et restauration

## Français

Le contrôle de santé exige `ok=true`, le service Community et la version attendue.
Avant l’activation, la sauvegarde est restaurée dans un dossier temporaire privé,
vérifiée puis cette copie de contrôle est supprimée. La sauvegarde reste conservée.
Prévoyez l’espace pour deux copies du coffre, plus la préparation de la release.
Les erreurs de sauvegarde et de santé sont distinguées, sans publier les chemins
privés ou les messages techniques bruts. Un retour arrière concerne le **code** :
il ne rembobine jamais automatiquement les données ni les envois déjà effectués.

Avant la préparation, le lanceur vérifie les permissions et au moins 2 Go libres.
La release reste vérifiée par signature. L’ancienne application continue pendant
le téléchargement et la compilation. Avant de lancer la nouvelle version, le
serveur s’arrête brièvement et crée `.community-updates/backup-<date>` :
tous les coffres des boutiques, leurs clés et `.env.local`. L’intégrité SQLite
et les empreintes des fichiers sont contrôlées. Un échec de sauvegarde empêche
le lancement de la nouvelle version et redémarre l’ancienne.

Ces sauvegardes sont privées (dossiers 700, fichiers 600), **pas un export
entièrement chiffré** : elles contiennent les clés et la configuration.
Ne les publiez pas et conservez une copie hors machine sur un support chiffré.
Elles ne sont pas supprimées automatiquement ; surveillez l’espace disponible.

Une activation non saine revient à l’ancien code. Au redémarrage, le lanceur
vérifie aussi la santé de la version sélectionnée et peut revenir à la précédente.
Ce mécanisme ne garantit pas la compatibilité avec une migration destructive :
les releases doivent préserver la compatibilité du coffre avec la version précédente.

Pour vérifier une restauration, sans toucher aux données actives :

```sh
node scripts/restore-update-backup.mjs /chemin/backup-123 /chemin/nouvelle-restauration
```

La destination doit être nouvelle. `state/` contient le coffre multiboutique et
`config/.env.local` la configuration. Pour utiliser cette copie, arrêtez Community,
conservez les données actuelles, puis configurez `NC_COMMUNITY_STATE_DIRECTORY`
vers le chemin absolu du `state/` restauré. Ne remplacez la configuration qu’après
vérification et gardez ses permissions 600. Vérifiez les boutiques, archives et
files en attente avant de reprendre les envois. Une ancienne sauvegarde ne doit
jamais servir à forcer le renvoi d’emails déjà acceptés par le serveur mail.

Ces protections nécessitent ce nouveau **lanceur**. Une installation utilisant
encore un ancien `scripts/start-standalone.mjs` doit être mise à niveau selon le
guide manuel puis redémarrée ; la seule bascule de l’interface ne remplace pas
un lanceur déjà en cours d’exécution.

## English

Health requires explicit success, the Community service and the expected version.
Before activation, a private temporary restoration is verified and removed; the
original backup is retained. Allow space for two vault copies plus release build.
Safe error codes distinguish backup failure from an unhealthy candidate. Rollback
selects previous **code**, never automatically rewinds data or email delivery.

The updated launcher checks private permissions and at least 2 GB free space,
verifies the signed release, and keeps the old application running during build.
Before activation it stops the server and snapshots all store vaults, keys and
`.env.local` into a private `backup-<timestamp>` directory. File hashes and SQLite
integrity are checked; a failed snapshot restarts the previous application.

Backups contain secrets: permissions protect them but do not encrypt the entire
export. Keep an encrypted off-machine copy and manage retention manually.
Use `node scripts/restore-update-backup.mjs BACKUP NEW_DESTINATION` to verify and
restore without overwriting live data. Stop Community before selecting the restored
`state/` via `NC_COMMUNITY_STATE_DIRECTORY`; preserve current data and reconcile
pending/sent work before resuming. Application rollback does not automatically
rewind data, and releases must retain backward-compatible vault schemas.
Existing installations must update and restart the launcher itself to gain these
protections; switching only the served build does not update a running launcher.
