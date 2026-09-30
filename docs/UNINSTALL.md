# Stop or uninstall Community

**Uninstalling Community does not cancel a paid subscription, delete your Cloud
account or uninstall your store connector.** Manage billing separately in Cloud.
Stopping Community interrupts services that depend on this installation.

## On your computer (installed with npm)

1. **Find the installation folder** you used for `npm start`, usually named
   `neurocheckout-community`. Do not delete your store or another development copy.
2. **Stop Community:** in the terminal running `npm start`, press **Ctrl+C** and
   wait for the command prompt. Closing the browser does not stop the application.
   Reload `http://localhost:3400`: the dashboard should no longer respond. Use
   your configured port if you changed it. If it still responds, find and stop
   the other Community process or service before deleting files.
3. **Decide whether to keep your local data.** With Community stopped, copy the
   complete `.community-state/` folder and `.env.local` to a private location
   outside the installation folder. Enable hidden-file display in your file
   manager. Keep the vault and its encryption keys together; losing the keys
   makes encrypted local data unreadable. If you configured
   `NC_COMMUNITY_STATE_DIRECTORY`, use that location instead. Never post these
   files in GitHub or send them in a support message.
4. **Remove the installation:** use your file manager to move only the identified
   `neurocheckout-community` folder to the Trash. This also removes its installed
   dependencies, builds, update files and default local state. Emptying the Trash
   is a separate, irreversible decision. External state folders and backups are
   not removed by deleting the installation folder.
5. **Remove Cloud access if you are retiring the installation:** in the matching
   Cloud environment, open **Community installations**, identify this installation
   and revoke it. The **Disconnect** button alone does not uninstall Community.

For a temporary stop, only step 2 is needed. For a reinstall of the same instance,
you can retain its registration and Client ID if they have not been revoked;
follow the installation guide and reconnect. For a new installation or a revoked
registration, register it in Cloud and use the new Client ID. Deleting local files
does not automatically remove the Cloud registration or free its store assignment.
An empty reinstall does not guarantee recovery of old local email previews.

## On a Linux server (systemd)

If you installed the service supplied by this repository:

```bash
sudo systemctl disable --now neurocheckout-community
sudo systemctl status neurocheckout-community
```

Check that it is inactive. Use your actual unit name if you renamed it. Preserve
the private data as described above, then remove only the unit installed for this
instance and reload systemd:

```bash
sudo rm /etc/systemd/system/neurocheckout-community.service
sudo systemctl daemon-reload
```

Remove the exact installation directory only after checking the service's
`WorkingDirectory` and any external state directory. Do not remove shared Node.js,
npm, web-server configuration or other applications. Remove a dedicated proxy
route only if it belongs exclusively to this Community instance. Revoke its Cloud
registration if it will no longer be used.

## With Docker Compose

From the directory containing this installation's `compose.yaml`:

```bash
docker compose ps
docker compose down
```

Confirm the project is Community, not your store or Cloud stack. This stops and
removes its containers but **keeps the named data volume**. The repository's
default project stores the vault in `neurocheckout-community_community-state`;
a custom project name changes this volume name. Copying `.community-state/` from
the host installation folder is not a backup of this Docker volume.

For complete data removal, first confirm the exact volume belongs only to this
installation and decide whether to preserve its contents and `.env.local`.
Then, from the same verified Compose project, run `docker compose down --volumes`.
This deletes its declared named and anonymous volumes and is not recoverable
without a backup. Do not use a global Docker prune command. Finally remove the
installation folder and revoke its Cloud registration if retiring the instance.

# Arrêter ou désinstaller Community — français

**Désinstaller Community n’annule pas l’abonnement et ne supprime ni le compte
Cloud, ni la boutique, ni son module connecteur.** Gérez l’abonnement séparément
dans Cloud. Les services qui dépendent de Community s’interrompent quand il est arrêté.

## Sur votre ordinateur

1. Repérez le dossier `neurocheckout-community` depuis lequel vous avez lancé
   `npm start`. Vérifiez qu’il s’agit de l’installation à supprimer.
2. Dans le terminal où Community fonctionne, appuyez sur **Ctrl+C**. Attendez le
   retour de l’invite de commande. Fermer le navigateur ne suffit pas. Rechargez
   `http://localhost:3400` (ou votre port personnalisé) : Community ne doit plus
   répondre. Sinon, arrêtez l’autre processus ou service avant de continuer.
3. Si vous souhaitez conserver vos données, Community étant arrêté, copiez
   **`.community-state/` et `.env.local`** dans un emplacement privé hors du dossier
   d’installation. Affichez les fichiers cachés pour les voir. Conservez ensemble
   le coffre et ses clés : sans les clés, les données chiffrées sont illisibles.
   Si vous avez défini `NC_COMMUNITY_STATE_DIRECTORY`, sauvegardez ce dossier.
   Ne partagez jamais ces fichiers dans GitHub ou avec le support.
4. Dans le gestionnaire de fichiers, mettez uniquement le dossier de cette
   installation à la **corbeille**. Cela retire l’application, ses mises à jour
   et ses données locales par défaut. Les sauvegardes et dossiers de données
   externes restent en place. Ne videz la corbeille que si vous êtes certain de
   ne plus avoir besoin de son contenu.
5. Pour un départ définitif, ouvrez **Cloud → Installations Community**, dans le
   bon environnement, puis révoquez l’installation concernée. **Déconnexion**
   ne désinstalle pas l’application.

Pour simplement arrêter Community, l’étape 2 suffit. Pour réinstaller la même
instance, conservez son Client ID si son inscription Cloud est toujours valide,
puis suivez le guide d’installation et reconnectez-vous. Si vous avez révoqué
l’installation, créez-en une nouvelle et utilisez son nouveau Client ID.
Supprimer les fichiers locaux ne libère pas automatiquement l’affectation de la
boutique dans Cloud. Une installation vide ne garantit pas la récupération des
anciens aperçus d’emails.

## Serveur ou Docker

- **Service Linux :** utilisez les commandes systemd ci-dessus pour arrêter et
  désactiver le service. Vérifiez son chemin avant de retirer l’unité et le dossier
  d’installation. Ne supprimez pas les logiciels partagés avec d’autres services.
- **Docker :** dans le dossier Compose de Community uniquement, utilisez
  `docker compose down`. Les données du volume sont conservées. Pour tout effacer,
  vérifiez d’abord le projet et ses volumes, sauvegardez ce que vous voulez garder,
  puis utilisez `docker compose down --volumes` depuis ce même dossier. Cette
  suppression des volumes est irréversible sans sauvegarde. Le coffre Docker est
  dans son volume, pas dans le dossier `.community-state/` de l’ordinateur.

WooCommerce, PrestaShop, Magento et leurs connecteurs se désinstallent séparément.
