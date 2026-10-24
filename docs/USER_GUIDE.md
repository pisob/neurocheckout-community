# Your first steps in Community

After installation and connection, open **Overview** and follow the configuration
checklist. Installing Community alone does not configure your store's automations.

The menu and installation steps start collapsed. Use **Menu +** to show the
navigation labels and **Show steps +** to open the checklist; the **−** buttons
collapse them again. Desktop keeps numbered navigation shortcuts when collapsed.
Reloading the page starts both sections collapsed again.

1. **Account:** check that your existing Cloud account is connected.
2. **Store:** open Configuration and check the store assigned to this installation.
3. **Connector:** install the official module in your PrestaShop, WooCommerce or
   Magento store, configure it, and check that activity reaches Community.
   Creating a connector key does not by itself install the module.
4. **Emails:** review the sender settings, language and approval preferences.
   Generate a preview before using the automations. You can mark this review in
   the checklist; that acknowledgement is saved only in this browser and is not
   proof of a successful email delivery.
5. **Synchronization:** open synchronization health and check its current state.
   Use **Check again** to refresh the checklist. An unavailable check does not
   mean the configuration is complete.

## Changing your plan

Open **Plan & data**. Choose an available plan and billing period, or open
**Change plan — Upgrade / Downgrade** for an existing subscription. Review the
summary before continuing. Cancelling this review does not change billing.

Upgrading from the free Community plan does not include a new 30-day trial.
The review shows the current configured base price and offer limits when they
can be verified. This is not an invoice quote: Stripe confirms taxes, currency
conversion, discounts, adjustments and effective date before confirmation. If the
desired offer is not listed, return without cancelling your current subscription.

## Updating Community

The update area shows the installed and available versions, followed by the
current operation. A restart can briefly interrupt the connection. Wait for the
version check; do not launch another installation while the update is running.
If an update fails, retry using the button or open the update guide.

## Stopping or uninstalling

Closing the browser does not stop Community. For a terminal installation, press
**Ctrl+C** where `npm start` is running. To remove the application, follow the
[uninstall guide](UNINSTALL.md) and choose whether to keep your local data.
Uninstalling does not cancel your subscription or delete your store connector.

## Reading email history

The status tabs show each email's current status, not cumulative totals. An
unavailable original copy is different from an error while reading a saved copy.
A missing subject in the history does not prove that the delivered email lacked
a subject. Never resend an email only to restore its preview.

Original copies are encrypted locally. Community retains the latest 50 confirmed
copies and up to 50 additional copies identified as converted when their history
is viewed, for a maximum of 30 days. Delivery and conversion evidence can remain
available after an original expires. An update cannot recreate an already
removed original; recovery requires a matching private-state backup. Keep a
backup before updating or reinstalling Community.

**Usage** is not the lifetime email count. The free Community quota counts sends
and reservations for in-progress sends over the last 24 hours. Capacity becomes
available as individual entries leave this window. Updating Community does not
reset the Cloud ledger. An unavailable value is shown as **—**, not as zero.

For paid Starter/Pro plans, usage is counted per store in the current calendar
month, including when billing is annual. During a trial, the window starts at
the trial's fixed start date, with no monthly reset. Enterprise follows the
account-wide scope shown by its offer. Changing plans does not erase previous
sends that still belong to the current quota window. In-progress or uncertain
send reservations may also consume capacity until reconciled or outside the window.

Use attributed orders for recovered revenue. Recorded links appear under
**Associated orders** with the order reference, cart and amount when available.
Several emails may contribute to one order. When no exact order reference is shown, do not infer a match from
the recipient or date alone. Opening an archived preview does not create a
delivery, open, click or conversion event.

# Premiers pas en français

Après l’installation et la connexion, ouvrez **Vue d’ensemble** et suivez la
checklist : compte, boutique, connecteur, emails, puis synchronisation.

Le menu et les étapes d’installation sont repliés par défaut. Cliquez sur
**Menu +** pour ouvrir le menu et sur **Déplier +** pour afficher les étapes.
Les boutons **−** permettent de les replier. Sur ordinateur, les raccourcis
numérotés restent accessibles. Une actualisation replie les deux sections.

- Le module officiel doit être installé et configuré dans PrestaShop,
  WooCommerce ou Magento. Créer sa clé ne suffit pas.
- Vérifiez l’expéditeur, la langue et les préférences de validation des emails,
  puis générez un aperçu. La case de vérification de la checklist est votre
  confirmation personnelle, conservée dans ce navigateur uniquement.
- Dans **Offre et données**, vérifiez le récapitulatif avant de poursuivre.
  Community gratuite n’inclut pas de nouvel essai lors du passage au payant.
  Vérifiez le prix, les limites et la date d’effet dans Stripe avant confirmation.
- Pour une mise à jour, attendez la vérification de la version démarrée.
- Les statuts email sont exclusifs. Le revenu se vérifie dans les commandes
  attribuées, pas en additionnant les emails marqués comme convertis.

Les originaux sont chiffrés localement : les 50 derniers envois confirmés et
jusqu’à 50 copies supplémentaires reconnues comme converties lors de la
consultation de leur historique sont conservés pendant 30 jours au maximum.
La preuve d’envoi ou de conversion peut rester visible après expiration de
l’original. Une mise à jour ne recrée pas une copie déjà supprimée : sa
récupération nécessite une sauvegarde privée correspondante. Sauvegardez vos
données avant une mise à jour ou une réinstallation ; ne renvoyez pas un email
pour rétablir son aperçu.

**Utilisation** ne représente pas le total historique des emails. Le quota de
l’offre Community gratuite compte les envois et les réservations en cours sur
les 24 dernières heures. Les unités se libèrent individuellement à la sortie de
cette fenêtre. Une mise à jour ne remet pas le registre Cloud à zéro. Une valeur
indisponible est affichée **—**, et non zéro.

Pour Starter/Pro payants, la consommation est comptée par boutique sur le mois
calendaire, même avec une facturation annuelle. Pendant un essai, elle est comptée
depuis sa date de début, sans remise à zéro mensuelle. Enterprise suit la portée
du compte indiquée par son offre. Changer d’offre n’efface pas les envois encore
dans la fenêtre du quota. Les réservations d’envois en cours ou incertains peuvent
aussi consommer de la capacité jusqu’à rapprochement ou sortie de la fenêtre.

## Arrêter ou désinstaller

Fermer le navigateur ne suffit pas. Appuyez sur **Ctrl+C** dans le terminal où
vous avez lancé `npm start`. Pour supprimer Community, suivez le
[guide de désinstallation en français](UNINSTALL.md#arrêter-ou-désinstaller-community--français).
Il explique comment garder vos données ou repartir de zéro. La désinstallation
n’annule pas votre abonnement et ne retire pas le module de votre boutique.
# Synchronization diagnostics / Diagnostic de synchronisation

**FR :** Sync health distingue une connexion Cloud absente, une lecture locale
indisponible, une source non configurée, un contrôle trop ancien, un refus HTTP
401/403 et une réponse dont la signature est refusée. Chaque état propose une
action. Un refus HTTP ne prouve pas à lui seul que la clé est incorrecte : une
règle d’accès boutique peut aussi refuser la requête. Vérifiez Test API et les
règles d’accès avant de remplacer une clé. La version « à jour » du connecteur ne
prouve pas que son cron tourne ; vérifiez l’état du cron dans le module.

Un contrôle source vieux de plus de deux minutes devient non vérifié. Après une
erreur d’actualisation, l’ancien état vert n’est plus affiché. Une prochaine
tentative indiquée par le Cloud n’est jamais une promesse d’heure d’envoi.
Les quotas et délais de relance restent décidés par le Cloud.

Si les fiches produits nécessaires au panier sont indisponibles, l’envoi est
différé et le diagnostic indique de vérifier la synchronisation du catalogue.
Cela évite d’envoyer des articles sans leur nom ou avec une image devinée.
Gardez Community en fonctionnement et vérifiez le connecteur. Une image absente
de la boutique ne peut pas être recréée ; la messagerie du destinataire peut
aussi bloquer le chargement d’images distantes.

**EN:** Sync health distinguishes Cloud offline, unavailable local evidence,
unconfigured source, stale checks, HTTP 401/403 refusal and rejected response
signatures. Follow the suggested action; access rules can cause authentication
refusal, so do not rotate keys blindly. An up-to-date connector version does not
prove cron is running. Check cron in the store module. Source evidence older than
two minutes is unverified, and a failed refresh clears the previous green state.
Cloud retry timestamps are not guaranteed delivery times. Quotas and recovery
delays remain Cloud-authoritative.

When required cart product details are unavailable, sending is deferred and the
diagnostic asks you to check catalog synchronization. This prevents sending
unnamed products or guessed images. Keep Community running and check the store
connector. A missing merchant image cannot be recreated, and the recipient's
email client may also block remote images.
