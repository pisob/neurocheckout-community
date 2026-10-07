# Your first steps in Community

After installation and connection, open **Overview** and follow the configuration
checklist. Installing Community alone does not configure your store's automations.

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

Use attributed orders for recovered revenue. Recorded links appear under
**Associated orders** with the order reference, cart and amount when available.
Several emails may contribute to one order. When no exact order reference is shown, do not infer a match from
the recipient or date alone. Opening an archived preview does not create a
delivery, open, click or conversion event.

# Premiers pas en français

Après l’installation et la connexion, ouvrez **Vue d’ensemble** et suivez la
checklist : compte, boutique, connecteur, emails, puis synchronisation.

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

**EN:** Sync health distinguishes Cloud offline, unavailable local evidence,
unconfigured source, stale checks, HTTP 401/403 refusal and rejected response
signatures. Follow the suggested action; access rules can cause authentication
refusal, so do not rotate keys blindly. An up-to-date connector version does not
prove cron is running. Check cron in the store module. Source evidence older than
two minutes is unverified, and a failed refresh clears the previous green state.
Cloud retry timestamps are not guaranteed delivery times. Quotas and recovery
delays remain Cloud-authoritative.
