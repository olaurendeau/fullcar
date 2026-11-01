# Céder un événement

- Artifact : https://claude.ai/artifact/SLyYb5mrQFupHk4EPmHCxH
- Epic : #935. Épic parent : #581. La section « Texte de l’épic » ci-dessous est l’état v1 ; les changements de la v1.1 sont dans « Révisions » et dans les lignes marquées v1.1.
- Page : `index.html` (autonome ; 41 maquettes à 360 px, la section du focus et l’e-mail FR/EN)
- Version : v1.1
- Voisines : `organizer-account` v4.1 (décision 6 et Q1 = a : pas de lien d’organisateur, pas de co-organisateur ; « Corriger l’adresse », OA2.5, #933 ; le lien de confirmation, OA5, #932/#608 ; `AdminNotYours`, `AdminOrphan`) ; `organizer-view` (le panneau).

## Texte de l’épic

### Problème

Depuis le compte organisateur (#581), il n’y a plus de lien d’organisateur à transmettre. Une organisatrice qui ne peut plus tenir l’événement (maladie, départ du club, relève d’un chef de troupe à l’autre) n’a aucun moyen de le confier : l’événement et ses inscriptions sont liés à son compte, la seule autre voie est de le recréer et de redemander à chacun de s’inscrire. La personne qui reprend ne peut ni voir les numéros de téléphone, ni modifier l’horaire. Aujourd’hui, l’organisatrice partage sa boîte mail, ou abandonne l’événement.

### Ce que l’épic livre

« Céder l’événement » : l’organisateur indique l’adresse e-mail d’une autre personne ; elle reçoit un lien ; quand elle l’accepte, l’événement passe à son compte, quitte « Mes événements » du premier organisateur et son accès prend fin. Un compte à la fois. Co-organisateurs, invitation par e-mail d’un second organisateur, « reprendre un événement passé comme modèle » : hors périmètre (décision 6 et Q1 d’`organizer-account`).

### Les six questions, avec la réponse proposée

1. **Pendant l’attente** : le premier organisateur garde tout l’accès (panneau, numéros de téléphone, modification). Il peut renvoyer l’e-mail, changer l’adresse (le lien précédent cesse de marcher) et annuler la cession à tout moment, sans confirmation. Une seule cession par événement. Le lien vaut 7 jours (comme la confirmation) ; passé ce délai l’avis le dit, le cédant garde l’accès et choisit : un nouveau lien, une autre adresse, ou annuler.
2. **Adresse sans compte** : même écran et même e-mail que l’adresse ait un compte ou non (le cédant n’apprend pas qui en a un). Le compte naît à l’acceptation, avec la langue de la page du lien ; avant, aucune ligne de compte n’existe pour cette adresse.
3. **Événement en attente de la confirmation de son créateur** : pas de cession (section absente, demande refusée par le serveur). Deux liens et deux adresses pour un événement ne diraient pas qui l’organise. Pour confier un événement à quelqu’un d’autre dans cet état, « Corriger l’adresse » existe déjà.
4. **Événement terminé ou anonymisé** : un événement passé mais pas encore anonymisé peut être cédé (il y a encore des inscriptions à administrer jusqu’au jour 30). Un événement anonymisé, ou sans organisateur (compte supprimé), ne peut pas l’être : section absente, demande refusée. Si le jour 30 passe pendant l’attente, la cession disparaît avec l’anonymisation et le lien devient non valide.
5. **Ce que voit le premier organisateur ensuite** : l’événement n’est plus dans Mes événements ; sa session sur `/e/{id}/admin` voit l’écran existant « Cet espace organisateur n’est pas le vôtre » ; son navigateur de création, dont le jeton d’admin est révoqué, voit l’écran de connexion ; le lien « Espace organisateur » disparaît de `/e/{id}`. Aucune mémoire de la cession n’est conservée pour lui, et aucun e-mail ne lui est envoyé. Les participants ne voient aucun changement.
6. **L’e-mail** : un seul, le cinquième de l’épic parent. Texte en FR et EN ci-dessous ; sans titre, sans lieu, sans adresse du cédant.

### Points qui reviennent au propriétaire (liste d’escalade du brief)

- **Qui peut voir un numéro de téléphone** : le destinataire voit les numéros de tous les participants dès qu’il accepte ; le cédant les perd au même instant. La règle d’accès reste unique (`organiser-access.ts`) ; la cession change seulement qui est « l’organisateur ». Jamais deux comptes à la fois.
- **Jeton, génération, stockage, journalisation** : un nouveau type de lien (`cession`), tiré par `server-token.ts`, stocké en empreinte, dans le fragment seulement, comme `confirmation` ; aucun mécanisme nouveau, mais un nouveau jeton. Le jeton d’admin de l’événement est révoqué à l’acceptation (son hash passe à nul) : c’est une écriture sur un jeton. La page du lien lit le titre et le début de l’événement avec le jeton, sans le consommer : une lecture par jeton de plus.
- **Ce qui est stocké** : l’adresse du destinataire est gardée sur l’événement tant que la cession est en attente (au plus jusqu’au jour 30), et dans `email_send` comme toute adresse destinataire (pour les limites). C’est l’adresse d’un tiers qui n’a rien demandé. La page `/confidentialite` doit le dire (le texte revient au propriétaire).
- **Un e-mail de plus** (« quatre, et aucun autre » devient cinq).
- **Mot nouveau** : « Cession » / « céder » entre au glossaire.

### Limites d’envoi proposées

Celles de la confirmation : 3 e-mails de cession par heure et par événement (envoi, renvoi et changement d’adresse compris), 5 par heure vers une même adresse tous types confondus, plafond global inchangé. Chaque envoi attend Brevo 10 s au plus.

### Stories et critères d’acceptation

Préfixe **OT**. Chaque critère se prouve par Vitest (règle, base) ou Playwright (écran), sauf mention.

**OT1 — Je cède mon événement**

- **OT1.1** Dans le panneau d’un événement confirmé, non anonymisé, ouvert par la session de son organisateur ou par le jeton du navigateur de création : section « Céder l’événement » en bas, avec `Transfer.section.body` et le bouton « Choisir une adresse ». Absente pour un événement en attente, anonymisé ou sans organisateur (OT5).
- **OT1.2** Le bouton ouvre une feuille, champ vide, focus dans le champ, avec `Transfer.sheet.note`, `Transfer.email.hint`, « Envoyer le lien » et « Annuler ». « Annuler » ou Échap : rien ne change, le focus revient sur « Choisir une adresse ».
- **OT1.3** Adresse vide : « Champ requis. » ; non valide ou de plus de 254 caractères : `CreateEvent.email.invalid` (« Adresse e-mail non valide. ») ; chaque fois l’erreur est sous le champ (trois maquettes), rien ne part, rien n’est écrit (aucune ligne modifiée en base). v1.1
- **OT1.4** L’adresse du compte de l’événement (comparée après normalisation : minuscules, espaces retirés) : `Transfer.email.self`, rien ne part.
- **OT1.5** Succès : la feuille se ferme ; l’avis `Transfer.pending.*` apparaît en haut du panneau, annoncé (`role="status"`), et le focus y va ; la section du bas disparaît. En base : l’adresse du destinataire est sur l’événement, exactement un lien de cession non utilisé existe, l’événement garde son compte et son jeton d’admin ; le panneau et les numéros restent lisibles par le cédant.
- **OT1.6** Échecs : hors ligne → `FixEmail.offline` dans la feuille, saisie gardée ; limite → `Admin.pending.tooMany` au même endroit ; envoi échoué ou sans réponse après 10 s → l’avis `Transfer.sendFailed` ; limite par adresse → l’avis `Transfer.addressLimit`. Dans les deux derniers cas la cession existe (le cédant peut renvoyer, changer, annuler). Un envoi « en cours » depuis plus de 30 s se lit comme un échec (règle de l’épic parent).
- **OT1.7** Aucune ligne de compte n’est créée pour l’adresse du destinataire à cette étape (Vitest : nombre de comptes avant = après).
- **OT1.8** Même réponse, même écran et même e-mail (texte et sujet) pour une adresse qui a un compte et pour une qui n’en a pas (Vitest : deux demandes, corps de réponse et message égaux).

**OT2 — Pendant que ça attend**

- **OT2.1** Le cédant lit, modifie et retire des personnes comme avant : numéros de téléphone visibles, `editEvent` accepté.
- **OT2.2** L’avis (haut du panneau ; à partir de 1024 px, colonne de droite de la première rangée, comme l’avis « Confirmez votre adresse », OA7.8) montre : l’envoi en cours (`Transfer.pending.sending`), envoyé (`Transfer.pending.body`), échec, limite par adresse, expiré. Il se relit à chaque chargement et sur un autre appareil du même compte (état gardé côté serveur).
- **OT2.3** « Renvoyer l’e-mail » : un nouveau lien part, les précédents non utilisés restent valables ; barre `Admin.pending.resent` (`role="status"`) ; hors ligne `Admin.pending.offline` et limite `Admin.pending.tooMany` (`role="alert"`) : trois maquettes (v1.1). Le focus ne bouge pas.
- **OT2.4** « Changer l’adresse » ouvre la même feuille, préremplie, avec `FixEmail.note` ; les liens de cession envoyés à l’ancienne adresse sont supprimés (l’ouvrir donne OT3.6 « non valide ») ; l’ancienne adresse n’est plus dans aucune table de l’événement. Une correction compte dans les limites d’OT1.6.
- **OT2.5** « Annuler la cession » : sans confirmation ; tous les liens de cession de l’événement sont supprimés et l’adresse effacée de l’événement ; barre `Transfer.cancelled` ; la section « Céder l’événement » revient et le focus va sur « Choisir une adresse ». Hors ligne : `Transfer.cancelFailed`, rien n’a changé. v1.1 : dès l’appui, et jusqu’à la réponse, le bouton dit `Transfer.cancelling` (« Annulation… ») et les trois boutons de l’avis sont `aria-disabled` ; un second appui n’envoie aucune requête (test : une seule requête). Pendant l’envoi (`Transfer.pending.sending`), « Annuler la cession » reste actif et suit la même règle.
- **OT2.6** Le lien vaut 7 jours (Vitest, dates amorcées : à 6 j 23 h il sert, à 7 j 1 h non). Passé ce délai : l’avis `Transfer.expired.*`, le cédant garde l’accès, « Envoyer un nouveau lien » fonctionne comme « Renvoyer l’e-mail ».
- **OT2.7** Une seule cession par événement : demander une cession alors qu’une est en attente (deux onglets) la remplace, comme OT2.4, sans erreur.
- **OT2.8** Mes événements : la ligne porte `MyEvents.transferPending` tant que la cession est en attente, expirée comprise (même texte, dessinée dans les deux états en v1.1) ; la ligne reste un lien d’au moins 44 px.
- **OT2.9** « Se déconnecter » ne touche pas à la cession.
- **OT2.10** « Renvoyer », « Changer l’adresse » ou « Annuler » alors qu’aucune cession n’est en attente (annulée dans un autre onglet, acceptée) : rien n’est écrit, la réponse est la barre `Transfer.gone` (`role="alert"`) et le panneau se relit : l’avis a disparu et la section « Céder l’événement » est revenue, focus sur « Choisir une adresse » ; si la cession a été acceptée, la relecture donne `AdminNotYours`, sans la barre. v1.1

**OT3 — Je reprends un événement**

- **OT3.1** `/connexion/cession#{jeton}` : le chargement de la page ne change rien en base (test : charger puis lire les lignes). v1.1 : pendant la lecture, la page montre son titre, `Transfer.page.loading` (`role="status"`) à la place du titre et de la date, et le bouton « Accepter l’événement » `aria-disabled` ; si la lecture échoue (hors ligne, erreur serveur), `Transfer.page.loadFailed` (`role="alert"`) et « Réessayer », sans bouton « Accepter », le focus sur « Réessayer » ; la page n’est jamais vide, et le fragment n’est pas retiré tant que le serveur n’a pas répondu. Il lit, sans consommer, le titre et le début de l’événement pour un lien valable et non utilisé ; pour tout autre cas la réponse ne porte ni titre ni date. Le fragment est retiré de la barre d’adresse et de l’historique après lecture (comme OA5.2).
- **OT3.2** « Accepter l’événement », en une seule transaction, sous le verrou de l’événement : le compte de l’adresse existe (créé au besoin, langue de la page) ; l’événement passe à ce compte ; son jeton d’admin est révoqué ; l’adresse en attente est effacée ; le lien est marqué utilisé et les autres liens de cession de l’événement sont supprimés ; une session s’ouvre dans ce navigateur. Arrivée sur `/e/{id}/admin` avec le panneau et la barre `Session.signedInAs` suivie de `Transfer.arrived`. L’événement est dans « À venir » ou « Passés » du nouveau compte. Tout ou rien (Vitest : échec simulé en cours de route, rien n’a changé).
- **OT3.3** Le nouveau compte peut à son tour céder l’événement.
- **OT3.4** Un compte déjà existant et un compte créé par ce lien arrivent au même écran.
- **OT3.5** Si le navigateur a la session d’un autre compte, elle est remplacée par celle du destinataire dans ce navigateur seulement (comme un lien de connexion) ; les autres appareils de l’autre compte n’en sont pas touchés.
- **OT3.6** Autres états : ouverture en cours (`LinkPage.working`, libellé du bouton, qui devient `aria-disabled`; ni alerte ni second bouton), hors ligne (`LinkPage.offline`, alerte au-dessus du bouton actif, focus dessus), échec (`LinkPage.failed`, même place) : trois maquettes distinctes (v1.1), expiré (`LinkPage.expired.title` + `Transfer.page.expired`), déjà servi (`LinkPage.used.title` + `Transfer.page.used`, bouton « Mes événements »), non valide (`LinkPage.invalid.title` + `Transfer.page.invalid`) : lien inconnu, annulé, remplacé, événement anonymisé ou supprimé, ou compte du cédant supprimé.
- **OT3.7** Course : deux acceptations simultanées → une seule réussit, l’autre lit « déjà servi » ; une annulation et une acceptation simultanées → exactement l’une des deux a lieu (Vitest, deux transactions).
- **OT3.8** Les participants ne voient aucun changement sur `/e/{id}` (Vitest : la réponse publique est identique avant et après).

**OT4 — Je n’ai plus l’événement**

- **OT4.1** Après l’acceptation : Mes événements du cédant ne liste plus l’événement ; `/e/{id}/admin` avec sa session montre `AdminNotYours` avec son adresse ; avec le jeton du navigateur de création et sans session il montre l’écran de connexion d’OA7.1 (jeton nul : aucun jeton ne correspond) ; `/e/{id}` n’affiche plus « Espace organisateur » dans ses navigateurs.
- **OT4.2** Aucune réponse du serveur au cédant ne porte un numéro de téléphone après l’acceptation (extension du test de fuite de l’espace organisateur).
- **OT4.3** Un panneau resté ouvert : la prochaine écriture est refusée avec le message existant `noOrganiserAccess`, rien n’est écrit (même mécanisme que #836 : l’accès est décidé de nouveau sous le verrou).
- **OT4.4** Aucun e-mail n’est envoyé au cédant.

**OT5 — Ce qui ne se cède pas**

- **OT5.1** Événement en attente de la confirmation de son créateur : pas de section ; la demande de cession est refusée (`pending`) et n’écrit rien, y compris depuis le navigateur de création.
- **OT5.2** Événement anonymisé : l’écran `Anonymized.*`, pas de section ; demande refusée. Événement passé mais pas anonymisé : proposée (la section reste, même feuille). Les deux sont dessinés (v1.1).
- **OT5.3** Événement sans organisateur : l’écran `AdminOrphan`, pas de section ; demande refusée. Dessiné (v1.1).
- **OT5.4** Une demande sans accès d’organisateur (aucune session ni jeton, ou autre compte) est refusée, sans rien écrire et sans envoyer d’e-mail.

**OT6 — L’e-mail**

- **OT6.1** Sujet et texte exactement ceux ci-dessous (v1.1 : le texte ne promet ni l’effacement « 30 jours après la date » seul ni, sans réserve, l’absence de compte), dans la langue de la page qui a demandé l’envoi.
- **OT6.2** Aucun texte saisi : un événement titré `Zorglub <b>x</b>`, au lieu `Zorglub-lieu`, cédé par `cedant@exemple.fr`, produit un e-mail dont ni le sujet, ni le texte, ni le HTML ne contiennent « Zorglub » ni `cedant@exemple.fr`.
- **OT6.3** Aucune `<img>` ; chaque `href` commence par `https://{hôte}/` ; le lien est `/connexion/cession`, sans query string, le jeton après `#`. Le non-suivi chez Brevo n’est pas prouvable par nos tests : comme OA3.3, l’humain vérifie un vrai e-mail de production.
- **OT6.4** Chaque envoi attend Brevo 10 s au plus (fournisseur simulé muet).
- **OT6.5** Limites d’envoi : la quatrième demande d’une heure pour un événement est refusée (`Admin.pending.tooMany`) ; la sixième vers une même adresse l’est aussi.

**OT7 — Ce qui est effacé**

- **OT7.1** Jour 30 : l’adresse en attente et les liens de cession de l’événement sont effacés avec l’anonymisation (Vitest : l’adresse amorcée n’est plus dans `event` ni `email_link`).
- **OT7.2** Suppression du compte du cédant (« Supprimer mon compte » ou 3 ans sans visite) avec une cession en attente : la cession est annulée (liens supprimés, adresse effacée), l’événement reste ouvert sans organisateur (OA7.9, Q5), et le lien du destinataire est non valide.
- **OT7.3** L’adresse du destinataire reste dans `email_send` comme tout destinataire, pour les limites seulement, et suit la durée de conservation que le propriétaire fixera pour cette table. L’e-mail le dit sans annoncer de durée et renvoie à `/confidentialite` (v1.1).

**OT8 — Transverse**

- **OT8.1** La règle d’accès (`organiser-access.ts`) reste la seule : Vitest sur la matrice « session du cédant / session du destinataire / jeton du navigateur de création / personne », avant et après l’acceptation. À aucun instant deux comptes ne sont organisateurs.
- **OT8.2** Le jeton d’un lien de cession n’est ni dans une URL de serveur, ni dans un journal, ni dans Sentry ; l’adresse du destinataire non plus (extension d’OA11.1).
- **OT8.3** Captures à 360 px sans débordement horizontal (`scrollWidth <= clientWidth`), adresse de 60 caractères : dans l’avis, la barre et la ligne de Mes événements elle passe à la ligne, entière, sans rien couper ni déborder (`overflow-wrap`, la pastille grandit) ; dans la feuille « Changer l’adresse » l’adresse entière est dans la phrase `FixEmail.note`, et le champ de saisie, natif, défile au lieu de passer à la ligne ; chaque bouton et chaque ligne d’au moins 44 px. v1.1 : trois maquettes à 360 px. Voir « Questions pour le propriétaire » (le champ).
- **OT8.4** FR et EN livrés ensemble ; la vérification des clés i18n passe.
- **OT8.5** Focus : ouverture de la feuille → champ ; fermeture → « Choisir une adresse » ; succès → l’avis ; annulation de la cession → « Choisir une adresse ». Chaque règle a son `toBeFocused`. v1.1 : dans l’avis, l’ordre de tabulation est « Renvoyer l’e-mail » (ou « Envoyer un nouveau lien »), « Changer l’adresse », « Annuler la cession » (le dernier, texte et bordure en rouge) ; les boutons `aria-disabled` restent dans l’ordre. La liste complète est la section « Le focus et le clavier » de la page.
- **OT8.6** Le temps de réponse de la demande ne dépend pas de l’existence d’un compte pour l’adresse (pas de différence observable : OT1.8).

### Hors périmètre

- Co-organisateurs, invitation d’un second organisateur par e-mail.
- Reprendre la cession (le nouvel organisateur peut seulement la céder à son tour).
- Un e-mail au cédant à l’acceptation, ou un message pour lui dire où est parti l’événement.
- Céder plusieurs événements à la fois, céder « tous mes événements ».
- Changer l’adresse d’un compte.
- Choisir l’adresse dans un carnet ou une liste de comptes.
- Un code à six chiffres à la place du lien.
- Prévenir les participants.

## Les mots

| clé | fr | en | où |
|---|---|---|---|
| Transfer.section.title | Céder l’événement | Hand over the event | bas du panneau, OT1.1 |
| Transfer.section.body | Une autre personne reprend l’organisation avec son adresse e-mail. Dès qu’elle ouvre le lien, l’événement quitte Mes événements et vous n’y avez plus accès. | Another person takes over the organising with their email address. As soon as they open the link, the event leaves My events and you no longer have access. | OT1.1 |
| Transfer.start | Choisir une adresse | Choose an address | bouton, OT1.1 |
| Transfer.sheet.title | Céder l’événement | Hand over the event | feuille (aussi pour « Changer l’adresse »), OT1.2 |
| Transfer.sheet.note | Tant que le lien n’est pas ouvert, vous gardez l’accès et vous pouvez annuler. Une fois ouvert, l’événement quitte Mes événements et vous n’y avez plus accès. | Until the link is opened, you keep access and can cancel. Once it is opened, the event leaves My events and you no longer have access. | feuille vide, OT1.2 |
| Transfer.email.label | Adresse e-mail de la personne qui reprend | Email address of the person taking over | OT1.2 |
| Transfer.email.hint | Elle n’a pas besoin d’avoir un compte : il sera créé quand elle ouvrira le lien. | They do not need an account: it will be created when they open the link. | sous le champ, OT1.2 |
| Transfer.email.self | C’est l’adresse de votre compte. Indiquez celle de la personne qui reprend. | That is your account’s address. Enter the address of the person taking over. | OT1.4 |
| Transfer.send | Envoyer le lien | Send the link | = `FixEmail.send` (réutilisée) |
| Transfer.cancelSheet | Annuler | Cancel | = `FixEmail.cancel` (réutilisée) |
| Transfer.pending.title | Cession en attente | Handover pending | avis, OT2.2 |
| Transfer.pending.sending | Envoi du lien à {email}… | Sending the link to {email}… | OT1.5 |
| Transfer.pending.body | Nous avons envoyé un lien à {email}. Tant qu’il n’est pas ouvert, vous gardez l’accès à cet événement. | We sent a link to {email}. Until it is opened, you keep access to this event. | OT2.2 |
| Transfer.pending.change | Changer l’adresse | Change the address | OT2.4 |
| Transfer.pending.cancel | Annuler la cession | Cancel the handover | OT2.5 |
| Transfer.sendFailed.title | L’e-mail n’a peut-être pas été envoyé | The email may not have been sent | OT1.6 |
| Transfer.sendFailed.body | Le lien pour {email} n’a peut-être pas été envoyé. Utilisez « Renvoyer l’e-mail » : si le premier arrive quand même, les deux liens restent valables. Vous gardez l’accès. | The link for {email} may not have been sent. Use “Resend the email”: if the first one arrives anyway, both links stay valid. You keep access. | OT1.6 |
| Transfer.addressLimit.title | L’e-mail n’est pas parti | The email did not go out | OT1.6 |
| Transfer.addressLimit.body | Trop d’e-mails sont partis vers {email} cette heure-ci. Dans une heure, utilisez « Renvoyer l’e-mail ». Vous gardez l’accès. | Too many emails went to {email} this hour. In an hour, use “Resend the email”. You keep access. | OT1.6 |
| Transfer.expired.title | Le lien a expiré | The link has expired | OT2.6 |
| Transfer.expired.body | Le lien envoyé à {email} n’est plus valable. Envoyez-en un nouveau, ou annulez la cession. Vous gardez l’accès. | The link sent to {email} is no longer valid. Send a new one, or cancel the handover. You keep access. | OT2.6 |
| Transfer.expired.send | Envoyer un nouveau lien | Send a new link | OT2.6 |
| Transfer.cancelled | Cession annulée. Le lien envoyé à {email} ne marche plus. | Handover cancelled. The link sent to {email} no longer works. | barre, OT2.5 |
| Transfer.cancelling | Annulation… | Cancelling… | libellé du bouton « Annuler la cession » pendant la requête, OT2.5 (v1.1, nouvelle clé) |
| Transfer.cancelFailed | La cession n’a pas été annulée. Vérifiez la connexion, puis réessayez. | The handover was not cancelled. Check your connection, then try again. | barre, OT2.5 |
| Transfer.gone | Cette cession n’est plus en attente. | This handover is no longer pending. | barre, OT2.10 |
| MyEvents.transferPending | Cession en attente de {email} | Handover pending to {email} | ligne de Mes événements, OT2.8 |
| Transfer.page.title | Un événement vous est cédé | An event is being handed over to you | `/connexion/cession`, OT3.1 |
| Transfer.page.body | En l’acceptant, vous organisez cet événement : il est ajouté à Mes événements, vous voyez les numéros de téléphone des participants, et la session s’ouvre dans ce navigateur. La personne qui vous le cède n’y a plus accès. | By accepting, you organise this event: it is added to My events, you see the participants’ phone numbers, and the session opens in this browser. The person handing it over no longer has access. | OT3.1 |
| Transfer.page.button | Accepter l’événement | Accept the event | OT3.2 |
| Transfer.page.expired | Un lien de cession est valable 7 jours. Demandez à la personne qui vous l’a envoyé d’en envoyer un nouveau. | A handover link is valid for 7 days. Ask the person who sent it to send a new one. | OT3.6 |
| Transfer.page.used | Cet événement a déjà été accepté. Si c’était vous, il est dans Mes événements. | This event has already been accepted. If that was you, it is in My events. | OT3.6 |
| Transfer.page.invalid | Vérifiez qu’il a été copié en entier. S’il l’est, la personne qui vous l’a envoyé l’a peut-être annulé ou remplacé : demandez-lui. | Check that it was copied in full. If it was, the person who sent it may have cancelled or replaced it: ask them. | OT3.6 |
| Transfer.page.loading | Chargement de l’événement… | Loading the event… | à la place du titre et de la date, OT3.1 (v1.1, nouvelle clé) |
| Transfer.page.loadFailed | L’événement n’a pas pu être chargé. Vérifiez la connexion, puis réessayez. | The event could not be loaded. Check your connection, then try again. | alerte, avec le bouton `Admin.retry` « Réessayer », OT3.1 (v1.1, nouvelle clé) |
| Transfer.arrived | Cet événement est maintenant dans Mes événements. | This event is now in My events. | barre après `Session.signedInAs`, OT3.2 |

Réutilisées telles quelles (textes pris sur `origin/main`, `messages/fr.json`, ou dans `organizer-account` pour celles de la page du lien) : `Admin.retry` (« Réessayer »), `CreateEvent.email.invalid`, « Champ requis. », `FixEmail.offline`, `FixEmail.note`, `Admin.pending.resend`, `Admin.pending.resent`, `Admin.pending.offline`, `Admin.pending.tooMany`, `LinkPage.working`, `LinkPage.offline`, `LinkPage.failed`, `LinkPage.expired.title`, `LinkPage.used.title`, `LinkPage.invalid.title`, `Session.signedInAs`, `AdminNotYours.*`, `noOrganiserAccess`, « Mes événements ». Le glossaire gagne (v1.1, trois lignes) **Cession en attente** (une cession dont le lien n’a pas encore servi : l’événement reste confirmé, administré par son compte et visible dans Mes événements ; ne pas confondre avec **Événement en attente**, un événement dont le *créateur* n’a pas encore confirmé son adresse, qui est absent de Mes événements ; les deux ne coexistent jamais, OT5.1), puis **Cession** (le passage d’un événement d’un compte à un autre, par un lien envoyé à l’adresse du destinataire) et **Lien de cession** (`/connexion/cession#{jeton}`, un seul usage, 7 jours).

### L’e-mail

**FR — Un événement vous est cédé sur Fullcar**

> Bonjour,
>
> Quelqu’un souhaite vous céder l’organisation d’un événement de covoiturage sur Fullcar. Ouvrez le lien pour l’accepter : l’événement rejoindra Mes événements, sur n’importe quel appareil.
>
> [Voir l’événement cédé]
>
> Ce lien est valable 7 jours et ne sert qu’une fois. Ne le transférez pas : il ouvre l’espace organisateur, qui montre des numéros de téléphone.
>
> Cet événement ne vous concerne pas ? Ignorez cet e-mail : tant que vous n’ouvrez pas le lien, rien ne change pour vous et aucun compte n’est créé. Si le lien ne marche plus, la personne qui vous l’a envoyé l’a peut-être annulé.
>
> Votre adresse : nous la gardons sur l’événement tant que la cession attend, 30 jours après sa date au plus, puis nous l’en effaçons. Elle reste aussi dans la liste des e-mails envoyés, qui sert à limiter les envois. Le détail est dans la page de confidentialité, ci-dessous.
>
> Si le bouton ne marche pas, copiez ce lien dans votre navigateur :
> https://{hôte}/connexion/cession#{jeton}
>
> Fullcar · Confidentialité : https://{hôte}/confidentialite

**EN — An event is being handed over to you on Fullcar**

> Hello,
>
> Someone would like to hand over the organising of a carpooling event on Fullcar to you. Open the link to accept it: the event will join My events, on any device.
>
> [See the event handed over]
>
> This link is valid for 7 days and works once. Do not forward it: it opens the organiser area, which shows phone numbers.
>
> Not for you? Ignore this email: until you open the link, nothing changes for you and no account is created. If the link no longer works, the person who sent it may have cancelled it.
>
> Your address: we keep it on the event while the handover is pending, 30 days after its date at the latest, then we erase it from the event. It also stays in the list of emails sent, which is used to limit how many go out. The details are on the privacy page, below.
>
> If the button does not work, copy this link into your browser:
> https://{host}/connexion/cession#{token}
>
> Fullcar · Privacy: https://{host}/confidentialite

(Le bouton dit « Voir » et non « Accepter » : l’e-mail ne montre rien de l’événement, et l’acceptation se fait sur la page, après avoir lu ce qu’on accepte.)

## Décisions

1. Decision : Pendant la cession, le cédant garde tout l’accès et peut annuler à tout moment. — Reason : tant que le destinataire n’a rien accepté, rien n’a changé ; exclure deux organisateurs à la fois (pas de co-organisateur).
2. Decision : Une cession par événement ; une nouvelle adresse remplace la précédente, son lien est supprimé. — Reason : même geste et mêmes mots que « Corriger l’adresse » (OA2.5).
3. Decision : Même e-mail et même écran que l’adresse ait un compte ou non ; le compte naît à l’acceptation. — Reason : le cédant n’apprend pas qui a un compte (décision 11 d’`organizer-account`) ; pas de compte vide.
4. Decision : Pas de cession tant que le créateur n’a pas confirmé, ni après l’anonymisation ni sans organisateur. — Reason : pas de deux liens pour un événement ; rien à administrer après le jour 30.
5. Decision : À l’acceptation, le jeton d’admin du navigateur de création est révoqué. — Reason : sinon le premier organisateur garderait l’accès et les numéros par ce navigateur (décision 5 d’`organizer-account`).
6. Decision : Lien valable 7 jours, un seul usage, comme la confirmation. — Reason : le destinataire l’ouvre quand il a le temps ; le cédant garde le contrôle par l’annulation.
7. Decision : La page du lien montre le titre et le début, pas le lieu ni l’adresse du cédant. — Reason : on n’accepte pas à l’aveugle ; le lieu peut être une adresse personnelle.
8. Decision : Aucun e-mail ni mémoire pour le cédant après l’acceptation ; il lit `AdminNotYours`. — Reason : cinq e-mails, pas six ; l’écran existant dit vrai sans rien stocker de plus.
9. Decision : Pas de bouton « nouveau lien » côté destinataire ; il le demande au cédant. — Reason : le destinataire n’est pas l’organisateur ; un renvoi côté destinataire ouvrirait un envoi à une adresse par n’importe qui détenant l’ancien lien.
10. Decision : Un événement passé mais pas encore anonymisé peut être cédé. — Reason : la règle la plus simple : tant qu’il y a quelque chose à administrer.
11. Decision : Quand le navigateur du destinataire a la session d’un autre compte, la page du lien ne l’avertit pas : elle la remplace, comme la page du lien de connexion (OT3.5). — Reason : même comportement que la page existante, qui n’avertit pas non plus. Décision du coordinateur (v1.1).
12. Decision : « Annuler la cession » est rouge et dernière dans l’avis ; pendant son exécution les trois boutons sont `aria-disabled` et il dit « Annulation… ». — Reason : trois boutons au même poids ne disent pas lequel défait le geste ; un second appui ne doit rien envoyer (v1.1).
13. Decision : Le fragment du lien n’est retiré qu’une fois que le serveur a répondu ; une lecture qui échoue faute de réseau le garde pour « Réessayer ». — Reason : sinon un échec de réseau perdrait le jeton et rendrait le lien inutilisable (v1.1).
14. Decision : Le libellé « Cession en attente » est gardé ; le glossaire le distingue d’« Événement en attente ». — Reason : le mot décrit exactement l’état, et les deux états ne se voient jamais ensemble (v1.1).

## Questions pour le propriétaire

- **Q1 — Le destinataire voit les numéros de téléphone** dès l’acceptation, sans autre vérification que l’accès à sa boîte mail (comme tout organisateur). Une adresse mal tapée donne l’événement à un inconnu qui ouvre le lien. Recommandation : accepter ce risque (7 jours, annulable, e-mail sans texte saisi, le cédant voit l’adresse dans l’avis), comme pour la décision 30 d’`organizer-account`. Alternative : exiger que le cédant confirme l’adresse en la saisissant deux fois.
- **Q2 — Nommer le cédant dans l’e-mail ?** Recommandation : non (on ne donne pas son adresse à quelqu’un qui a peut-être été mal tapé), au prix d’un e-mail d’expéditeur « anonyme ». Alternative : « {adresse du cédant} vous cède… ».
- **Q3 — Un e-mail au cédant à l’acceptation ?** Recommandation : non (OT4.4). Alternative : un sixième e-mail « Votre événement a été repris ».
- **Q4 — La page du lien montre le titre et le début** avec le seul jeton, sans consommer (OT3.1). Recommandation : oui. Alternative : rien du tout, au risque d’accepter à l’aveugle.
- **Q5 — Le mot « cession » / « Céder l’événement »** au glossaire et dans l’interface (EN : « Hand over the event »).
- **Q6 — Conservation de l’adresse dans `email_send`** (limites d’envoi) et texte de `/confidentialite` : les deux reviennent au propriétaire.
- **Q7 — Le champ de saisie à 60 caractères (OT8.3).** Un champ e-mail natif ne passe pas à la ligne : il défile. Recommandation : accepter, car l’adresse entière se lit dans la phrase au-dessus (« Changer l’adresse ») et dans l’avis. Alternative : un champ multiligne, inhabituel pour une adresse (v1.1).

## Révisions

- v1 : première version.
- v1.1 (2026-10-31) : revue de la v1, changements demandés (7 bloquants, 6 suggestions), tous corrigés. Bloquants : adresse de 60 caractères dessinée dans la feuille, l’avis, la barre et Mes événements, `.badge` qui passe à la ligne, `overflow-wrap` partout ; réponses au renvoi dessinées (`resent`, `offline`, `tooMany` de l’avis) ; `Admin.pending.tooMany` dessiné dans la feuille avec son texte réel (« Trop d’envois. Réessayez dans une heure. », pris sur `origin/main`) ; `Transfer.gone` en barre avec le panneau relu ; page du lien : chargement, travail (libellé du bouton), hors ligne et échec séparés ; « Champ requis. » et plus de 254 caractères dessinés ; e-mail corrigé (adresse gardée sur l’événement tant que la cession attend, aussi dans la liste des envois, renvoi à `/confidentialite`, sans durée). Suggestions : écrans « passé pas anonymisé », `Anonymized`, `AdminOrphan` dessinés ; ligne expirée dans Mes événements ; chargement et échec de la lecture du titre (deux clés nouvelles) ; glossaire « Cession en attente » ; « Annulation… » (une clé nouvelle) ; « Annuler la cession » en rouge et section « Le focus et le clavier ». OT3.5 : pas d’avertissement (décision 11).
