# Compte organisateur

- Artifact : https://claude.ai/artifact/C4oCKHoLzqe6654AYpWCap
- Epic : https://github.com/olaurendeau/fullcar/issues/581 (réponses et décisions : https://github.com/olaurendeau/fullcar/issues/581#issuecomment-6394945895)
- Page : `index.html` (autonome ; maquettes à 360 px, et deux navigateurs de 1280 px à 55 %)
- Version : v4
- Voisines : `organizer-view` v3.3.9 (l’espace organisateur, dont cette maquette retire le lien d’organisateur et « Gardez ce lien ») ; `home` v2.1 (accueil et `/nouveau`) ; `github-link` (bas de page).
- Couleurs : remplacées par `visual-identity` v3 (#651). Ce que cette page dessine en `--app-primary` (#171717) est désormais #005a5b, sauf la barre de message réussie, qui reste #171717 ; l’onglet sélectionné, les tuiles teintées et la marque y sont décrits.

## Ce que la page montre

Un compte obligatoire pour administrer un événement, sans mot de passe : l’organisateur donne son adresse en créant son premier événement, l’événement est créé tout de suite, sans attendre l’e-mail, et un lien de confirmation arrive par e-mail. En attendant, le navigateur de création administre l’événement, et le retrouve par le lien à partager. Ensuite, une session de 90 jours ; sur un autre appareil, un lien de connexion par e-mail. « Mes événements » liste ses événements, à venir puis passés. Le lien d’organisateur disparaît. 30 jours après le dernier leg (heure de Paris), les données des participants sont effacées ; le titre, le lieu et les dates restent dans l’historique. Un compte sans visite pendant 3 ans est supprimé, après un e-mail d’avertissement.

## Le parcours de création, et les 30 s

**Créer d’abord, confirmer ensuite.** Sans session, le formulaire a un champ de plus, l’adresse e-mail ; « Créer » mène tout de suite à l’espace organisateur, dans ce navigateur. Ni la confirmation ni l’envoi de l’e-mail ne sont sur le chemin : la création n’attend pas Brevo, et chaque envoi l’attend 10 s au plus.

Le critère « créer un événement en moins de 30 s » tient. Il se mesure comme A2.2 de #232, de `page.goto("/")` au lien à partager visible : **8 actions** pour un nouvel organisateur (l’adresse en plus), **7** avec une session (OA1.2, OA1.3) ; le même chemin avec un fournisseur d’e-mail qui ne répond jamais reste sous 30 s.

## Réponses du propriétaire

- **Q1, co-organisateur** : (a) : le lien d’organisateur est supprimé ; la session le remplace.
- **Q2, navigateur de création** : (a) : jusqu’à l’anonymisation ou « Se déconnecter » ; ce navigateur garde un jeton, avec l’accord du propriétaire.
- **Q3, événement anonymisé vu par un participant** : (a) : « Événement terminé », le titre et la date, sans le lieu. Décision du coordinateur ([#581, commentaire 6394717528](https://github.com/olaurendeau/fullcar/issues/581#issuecomment-6394717528)).
- **Q4, conservation** : (b) : suppression après 3 ans sans visite avec une session, après un e-mail d’avertissement.
- **Q5, suppression d’un compte avec des événements ouverts** : (a) : ils restent ouverts aux participants, sans organisateur, puis sont supprimés au jour 30.

Reste à l’humain : l’adresse d’expédition et le nom de domaine.

## États couverts

| état | section | critères |
|---|---|---|
| /nouveau sans session, avec session, adresse non valide, session terminée, après « Se déconnecter », échec de la déconnexion | Créer un événement | OA1.1–OA1.5, OA1.8 |
| Arrivée : envoi en cours, envoyé, échec ou pas de réponse, limite par adresse, adresse longue ; renvoyé, hors ligne, trop d’envois ; panneau en échec ; sur ordinateur, en attente et avec session | Événement en attente | OA1.6, OA1.7, OA1.9, OA2.1, OA2.4, OA7.3, OA7.8 |
| Après un rechargement ou le lendemain : envoyé, échec, limite par adresse, envoi resté en cours | Événement en attente | OA1.7, OA1.10 |
| Feuille « Corriger l’adresse » : ouverte, adresse non valide, hors ligne, trop d’envois | Événement en attente | OA2.5 |
| Retour du navigateur de création par /e/{id} ; un autre navigateur sur /admin (« Adresse pas encore confirmée ») | Retrouver un événement en attente | OA2.2, OA7.4, OA7.7 |
| Les quatre e-mails, FR et EN | Les e-mails | OA3.1–OA3.6 |
| /connexion : formulaire, envoi en cours, regardez vos e-mails, renvoyé, hors ligne, erreur, trop de demandes, déjà une session, session fermée, sans JavaScript, depuis l’espace organisateur | Se connecter | OA4.1–OA4.7, OA7.1, OA9.1 |
| Page du lien : connexion, confirmation, ouverture en cours, hors ligne, erreur, expiré (×2), renvoi trop d’envois, confirmation renvoyée, déjà servi (×2), non valide, arrivée | La page du lien | OA5.1–OA5.9 |
| Mes événements : rempli avec les trois sortes de lignes, vide, aucun à venir, chargement, échec, textes longs à 360 px | Mes événements | OA6.1–OA6.9 |
| Espace organisateur : avec session, sans accès, pas le vôtre, sans organisateur (tout visiteur) ; /e/{id} avec le lien | L’espace organisateur | OA7.1–OA7.4, OA7.9, OA9.5 |
| Jour 30 : organisateur, participant, introuvable | Au jour 30 | OA8.3–OA8.5 |
| Mon compte : supprimer (avec et sans événements ouverts), échec, après la suppression, échec de déconnexion | Mon compte | OA9.1–OA9.5 |
| Accueil et bas de page | Accueil et bas de page | OA10.1–OA10.3 |
| Confidentialité : la structure | Confidentialité | OA10.4 |

## Les mots

Les clés sont proposées ; « modifiée » remplace une clé existante. Clés retirées : `Admin.adminLink.*`, `Admin.keep.*`, `Admin.invalid.*`. Une seule phrase d’échec réseau, celle de l’application : « Vérifiez la connexion, puis réessayez. »

| clé | fr | en | où |
|---|---|---|---|
| Home.tagline (modifiée) | Le covoiturage de groupe, aller et retour, sans compte pour les participants. | Group carpooling, there and back, no account for participants. | accueil, OA10.1 |
| Home.steps.create.text (modifiée) | Un titre, un lieu, l’heure de début et, s’il y a un retour, l’heure de fin. Et votre adresse e-mail, pour retrouver vos événements. | A title, a place, the start time and, if there is a return trip, the end time. And your email address, to find your events again. | accueil, OA10.1 |
| Home.steps.share.text (modifiée) | Par SMS ou dans le groupe. Chacun s’inscrit sans compte, propose une voiture ou prend une place libre. | By text message or in the group chat. Everyone signs up without an account, offers a car or takes a free seat. | accueil, OA10.1 |
| Home.deleted (modifiée) | 30 jours après l’événement, les inscriptions sont effacées. | 30 days after the event, sign-ups are erased. | accueil, OA10.1 |
| Home.myEvents | Mes événements | My events | accueil, sous « Créer un événement », OA10.2 |
| Home.accountDeleted | Votre compte a été supprimé. | Your account has been deleted. | accueil, une fois, après la suppression, OA9.5 |
| Contact.privacy | Confidentialité | Privacy | bas de page, ligne 1, et après `CreateEvent.email.hint`, OA10.3, OA1.1 |
| EventNotFound.deleted (modifiée) | Il a peut-être été supprimé. | It may have been deleted. | Événement introuvable, OA8.5 |
| CreateEvent.email.label | Votre adresse e-mail | Your email address | /nouveau sans session, OA1.1 |
| CreateEvent.email.hint | Pour retrouver vos événements, sans mot de passe. Les participants n’ont jamais à en donner. | To find your events again, with no password. Participants never have to give one. | suivie du lien « Confidentialité », OA1.1 |
| CreateEvent.email.invalid | Adresse e-mail non valide. | Invalid email address. | OA1.4, OA2.5 (vide : FormErrors « Champ requis. » ; trop longue : « 254 caractères au maximum. ») |
| CreateEvent.email.sessionEnded | Votre session a pris fin : saisissez votre adresse e-mail, puis « Créer ». | Your session has ended: enter your email address, then “Create”. | OA1.5 |
| CreateEvent.signedIn | Session ouverte avec {email} : l’événement sera dans Mes événements. | Signed in as {email}: the event will be in My events. | /nouveau avec session, sous le titre, OA1.3 |
| CreateEvent.notYou | Ce n’est pas vous ? Se déconnecter | Not you? Sign out | « Se déconnecter » est un bouton, OA1.8 |
| CreateEvent.signedOut | Session fermée. Ce que vous avez saisi est gardé. | Signed out. What you typed is kept. | à la place de la ligne, au-dessus du champ e-mail, OA1.8 |
| Admin.pending.title | Confirmez votre adresse | Confirm your email address | espace organisateur en attente, OA2.1 |
| Admin.pending.sending | Envoi du lien à {email}… | Sending the link to {email}… | corps de l’avis tant que l’envoi n’a pas répondu (10 s au plus), OA1.7 |
| Admin.pending.body | Nous avons envoyé un lien à {email}. Ouvrez-le, sur n’importe quel appareil, pour retrouver cet événement dans Mes événements. D’ici là, l’espace organisateur ne s’ouvre que dans ce navigateur. | We sent a link to {email}. Open it, on any device, to find this event in My events. Until then, the organiser area only opens in this browser. | OA2.1 |
| Admin.pending.resend | Renvoyer l’e-mail | Resend the email | OA2.4 |
| Admin.pending.fix | Corriger l’adresse | Fix the address | OA2.5 |
| Admin.pending.resent | E-mail renvoyé à {email}. | Email sent again to {email}. | barre, OA2.4 |
| Admin.pending.offline | L’e-mail n’a pas été renvoyé. Vérifiez la connexion, puis réessayez. | The email was not sent again. Check your connection, then try again. | barre, OA2.4 |
| Admin.pending.tooMany | Trop d’envois. Réessayez dans une heure. | Too many emails. Try again in an hour. | barre, feuille, page du lien expiré, OA2.4, OA2.5, OA5.6 |
| Admin.pending.sendFailed.title | L’e-mail n’a peut-être pas été envoyé | The email may not have been sent | OA1.7, OA1.10 |
| Admin.pending.sendFailed.body | Votre événement est créé, mais le lien pour confirmer {email} n’a peut-être pas été envoyé. Utilisez « Renvoyer l’e-mail » : si le premier arrive quand même, les deux liens restent valables. D’ici là, l’espace organisateur ne s’ouvre que dans ce navigateur. | Your event is created, but the link to confirm {email} may not have been sent. Use “Resend the email”: if the first one arrives anyway, both links stay valid. Until then, the organiser area only opens in this browser. | OA1.7, OA1.10 |
| Admin.pending.addressLimit.title | L’e-mail n’est pas parti | The email did not go out | titre de l’avis à la limite par adresse : là, on sait que rien n’est parti, OA1.9 |
| Admin.pending.addressLimit.body | Votre événement est créé, mais trop d’e-mails sont partis vers {email} cette heure-ci. Dans une heure, utilisez « Renvoyer l’e-mail ». D’ici là, l’espace organisateur ne s’ouvre que dans ce navigateur. | Your event is created, but too many emails went to {email} this hour. In an hour, use “Resend the email”. Until then, the organiser area only opens in this browser. | corps de l’avis, sous `addressLimit.title`, OA1.9 |
| FixEmail.title | Corriger l’adresse | Fix the address | feuille, OA2.5 |
| FixEmail.note | Le lien envoyé à {email} ne marchera plus. | The link sent to {email} will stop working. | feuille, OA2.5 |
| FixEmail.send | Envoyer le lien | Send the link | feuille, OA2.5 |
| FixEmail.cancel | Annuler | Cancel | feuille, OA2.5 |
| FixEmail.offline | L’e-mail n’est pas parti. Vérifiez la connexion, puis réessayez. | The email did not go out. Check your connection, then try again. | alerte dans la feuille, et page du lien expiré, OA2.5, OA5.6 |
| Admin.failed.title (modifiée) | L’espace organisateur n’a pas pu être chargé. | The organiser area could not be loaded. | alerte d’`AdminLinkProblem`, corps inchangé, avec « Réessayer », OA7.3 |
| AdminLogin.body (modifiée) | Connectez-vous avec l’adresse e-mail de la personne qui organise cet événement. | Sign in with the email address of the person who organises this event. | /e/{id}/admin sans accès, sous « Espace organisateur », OA7.1 |
| AdminPending.title | Adresse pas encore confirmée | Email address not confirmed yet | /e/{id}/admin d’un événement en attente, hors navigateur de création, OA7.7 |
| AdminPending.body | Cet événement attend que la personne qui l’a créé confirme son adresse e-mail. Si c’est vous, ouvrez le lien de confirmation reçu par e-mail : l’événement rejoindra Mes événements, et l’espace organisateur s’ouvrira dans le navigateur qui l’ouvre. | This event is waiting for the person who created it to confirm their email address. If that is you, open the confirmation link you received by email: the event will join My events, and the organiser area will open in the browser that opens it. | OA7.7 |
| AdminPending.expired | Lien expiré ? Ouvrez-le quand même : la page proposera d’en envoyer un nouveau. | Link expired? Open it anyway: the page will offer to send a new one. | OA7.7 |
| AdminNotYours.title | Cet espace organisateur n’est pas le vôtre | This organiser area is not yours | OA7.2 |
| AdminNotYours.body | La session est ouverte avec {email}, qui n’organise pas cet événement. | You are signed in as {email}, who does not organise this event. | OA7.2 |
| AdminNotYours.see | Voir l’événement | See the event | OA7.2, OA7.7, OA9.5 |
| AdminNotYours.switch | Se connecter avec une autre adresse | Sign in with another address | OA7.2 |
| AdminOrphan.title | Cet événement n’a plus d’organisateur | This event no longer has an organiser | /e/{id}/admin après la suppression du compte, pour tout visiteur, OA7.9, OA9.5 |
| AdminOrphan.body | Le compte qui l’organisait a été supprimé. L’événement reste ouvert aux participants jusqu’à sa suppression, 30 jours après sa date. | The account that organised it has been deleted. The event stays open to participants until it is deleted, 30 days after its date. | OA9.5 |
| Admin.myEvents | Mes événements | My events | lien retour, en haut de /e/{id}/admin avec session, OA7.3 |
| Event.organiserSpace | Espace organisateur | Organiser area | lien sur /e/{id}, après le tableau : navigateur qui garde le jeton d’admin, ou session du compte de l’événement, OA7.4 |
| Login.title | Se connecter | Sign in | /connexion, OA4.1 |
| Login.intro | Pas de mot de passe : nous vous envoyons un lien de connexion par e-mail. | No password: we email you a sign-in link. | OA4.1 |
| Login.email | Adresse e-mail | Email address | OA4.1 |
| Login.send | Recevoir le lien | Send me the link | OA4.1 |
| Login.sending | Envoi en cours… | Sending… | libellé du bouton pendant l’envoi, OA4.1 |
| Login.noAccount | Pas encore de compte ? Il se crée avec votre premier événement. | No account yet? It is created with your first event. | suivi du lien « Créer un événement », OA4.1 |
| Login.signedOut | Session fermée. | Signed out. | après « Se déconnecter », OA9.1 |
| Login.already | Session ouverte avec {email}. | Signed in as {email}. | suivi du lien « Mes événements », OA4.6 |
| Login.offline | Le lien n’a pas été envoyé. Vérifiez la connexion, puis réessayez. | The link was not sent. Check your connection, then try again. | OA4.5 |
| Login.failed | Le lien n’a peut-être pas été envoyé. Une erreur est survenue : réessayez dans quelques minutes. | The link may not have been sent. Something went wrong: try again in a few minutes. | OA4.5 |
| Login.tooMany | Trop de demandes pour cette adresse. Réessayez dans une heure. | Too many requests for this address. Try again in an hour. | OA4.5 |
| Login.needsJavaScript | Se connecter nécessite JavaScript : activez-le, puis rechargez la page. | Signing in needs JavaScript: turn it on, then reload the page. | /connexion et la page du lien sans JavaScript, OA4.7 |
| Check.title | Regardez vos e-mails | Check your email | OA4.2 |
| Check.body | Nous avons envoyé un e-mail à {email}. Ouvrez le lien qu’il contient : la session s’ouvrira dans le navigateur qui l’ouvre. Il est valable 1 heure. | We sent an email to {email}. Open the link inside: the session will open in the browser that opens it. It is valid for 1 hour. | OA4.2 |
| Check.confirmBody | Nous avons envoyé un nouveau lien de confirmation à l’adresse qui a créé l’événement. Il est valable 7 jours. Ouvrez-le dans le navigateur où vous voulez administrer l’événement. | We sent a new confirmation link to the address that created the event. It is valid for 7 days. Open it in the browser where you want to manage the event. | après le lien de confirmation expiré, OA5.6 |
| Check.spam | Rien reçu ? Regardez dans les indésirables. | Nothing? Check your spam folder. | OA4.2 |
| Check.resend | Renvoyer l’e-mail | Resend the email | OA4.3 |
| Check.change | Changer d’adresse | Use another address | OA4.3 |
| Check.resent | E-mail renvoyé. | Email sent again. | ligne sous les boutons, OA4.3 |
| LinkPage.login.title | Se connecter à Fullcar | Sign in to Fullcar | /connexion/lien, OA5.1 |
| LinkPage.login.body | La session s’ouvrira dans ce navigateur. Sur un appareil partagé, fermez-la ensuite avec « Se déconnecter », dans Mes événements. | The session will open in this browser. On a shared device, close it afterwards with “Sign out”, in My events. | OA5.1 |
| LinkPage.login.button | Se connecter | Sign in | OA5.1 |
| LinkPage.confirm.title | Confirmer votre adresse | Confirm your email address | /connexion/confirmer, OA5.3 |
| LinkPage.confirm.body | L’événement sera ajouté à Mes événements, et la session s’ouvrira dans ce navigateur. | The event will be added to My events, and the session will open in this browser. | OA5.3 |
| LinkPage.confirm.button | Confirmer et se connecter | Confirm and sign in | OA5.3 |
| LinkPage.working | Ouverture de la session… | Signing in… | libellé du bouton pendant la requête, OA5.8 |
| LinkPage.offline | La session n’a pas été ouverte. Vérifiez la connexion, puis réessayez. | You were not signed in. Check your connection, then try again. | OA5.8 |
| LinkPage.failed | La session n’a pas été ouverte. Une erreur est survenue : réessayez dans quelques minutes. | You were not signed in. Something went wrong: try again in a few minutes. | OA5.8 |
| LinkPage.expired.title | Ce lien a expiré | This link has expired | OA5.5, OA5.6 |
| LinkPage.expired.login | Un lien de connexion est valable 1 heure. Demandez-en un nouveau. | A sign-in link is valid for 1 hour. Ask for a new one. | OA5.5 |
| LinkPage.expired.confirm | Un lien de confirmation est valable 7 jours. Nous pouvons en envoyer un nouveau à la même adresse. | A confirmation link is valid for 7 days. We can send a new one to the same address. | OA5.6 |
| LinkPage.newLink | Recevoir un nouveau lien | Send me a new link | OA5.5, OA5.6, OA5.7 |
| LinkPage.used.title | Ce lien a déjà servi | This link has already been used | OA5.4 |
| LinkPage.used.login | Un lien ne sert qu’une fois. Si vous venez de l’utiliser, votre session est peut-être déjà ouverte. | A link works only once. If you have just used it, you may already be signed in. | OA5.4 |
| LinkPage.used.confirm | Cette adresse est déjà confirmée, et l’événement est dans Mes événements. | This address is already confirmed, and the event is in My events. | OA5.4 |
| LinkPage.invalid.title | Ce lien n’est pas valide | This link is not valid | OA5.7 |
| LinkPage.invalid.body | Vérifiez qu’il a été copié en entier, ou demandez un nouveau lien. | Check that it was copied in full, or ask for a new link. | OA5.7 |
| Session.signedInAs | Session ouverte avec {email}. | Signed in as {email}. | barre, à l’arrivée après le lien, OA5.2, OA5.9 |
| MyEvents.title | Mes événements | My events | /mes-evenements, OA6.1 |
| MyEvents.signedInAs | Session ouverte avec {email} | Signed in as {email} | OA6.1 |
| MyEvents.upcoming | À venir ({count}) | Upcoming ({count}) | OA6.1 |
| MyEvents.past | Passés ({count}) | Past ({count}) | OA6.1 |
| MyEvents.noUpcoming | Aucun événement à venir. | No upcoming events. | OA6.5 |
| MyEvents.empty.title | Aucun événement pour l’instant | No events yet | OA6.5 |
| MyEvents.empty.body | Créez un événement : il apparaîtra ici. | Create an event: it will show up here. | OA6.5 |
| MyEvents.persons | {count, plural, =0 {Personne ne s’est encore inscrit.} one {# personne inscrite} other {# personnes inscrites}} | {count, plural, =0 {Nobody has signed up yet.} one {# person signed up} other {# people signed up}} | OA6.2 |
| MyEvents.withoutCar | {leg} : {count} sans voiture | {leg}: {count} without a car | pastille ambre, une par leg, OA6.2 |
| MyEvents.erasedOn | Les inscriptions seront effacées le {date}. | Sign-ups will be erased on {date}. | passé, pas encore anonymisé, OA6.3 |
| MyEvents.erased | Inscriptions effacées | Sign-ups erased | anonymisé, OA6.4 |
| MyEvents.more | {count, plural, one {Afficher l’autre} other {Afficher les # autres}} | {count, plural, one {Show the other one} other {Show the # others}} | = Admin.list.more, OA6.6 |
| MyEvents.loading | Chargement de vos événements… | Loading your events… | OA6.7 |
| MyEvents.failed.title | Vos événements n’ont pas pu être chargés | Your events could not be loaded | OA6.7 |
| MyEvents.failed.body | Vérifiez la connexion, puis réessayez. | Check your connection, then try again. | OA6.7, bouton « Réessayer » |
| Account.title | Mon compte | My account | OA9.1 |
| Account.signOut | Se déconnecter | Sign out | OA9.1 |
| Account.signOutFailed | La session n’a pas été fermée. Vérifiez la connexion, puis réessayez. | You were not signed out. Check your connection, then try again. | barre, et sous la ligne de /nouveau, OA9.2, OA1.8 |
| Account.delete | Supprimer mon compte | Delete my account | OA9.3 |
| DeleteAccount.title | Supprimer votre compte ? | Delete your account? | OA9.3 |
| DeleteAccount.erased | Votre adresse e-mail et l’historique de vos événements seront effacés. | Your email address and the history of your events will be erased. | OA9.3 |
| DeleteAccount.open | {count, plural, one {L’événement dont les inscriptions ne sont pas encore effacées reste ouvert aux participants, sans organisateur, et sera supprimé 30 jours après sa date.} other {Les # événements dont les inscriptions ne sont pas encore effacées restent ouverts aux participants, sans organisateur, et seront supprimés 30 jours après leur date.}} | {count, plural, one {The event whose sign-ups are not erased yet stays open to participants, with no organiser, and will be deleted 30 days after its date.} other {The # events whose sign-ups are not erased yet stay open to participants, with no organiser, and will be deleted 30 days after their date.}} | seulement si count > 0, OA9.3 |
| DeleteAccount.final | C’est définitif. | This cannot be undone. | OA9.3 |
| DeleteAccount.confirm | Supprimer mon compte | Delete my account | OA9.3 |
| DeleteAccount.cancel | Annuler | Cancel | OA9.3 |
| DeleteAccount.failed | Le compte n’a pas été supprimé. Vérifiez la connexion, puis réessayez. | The account was not deleted. Check your connection, then try again. | OA9.4 |
| Anonymized.title | Inscriptions effacées | Sign-ups erased | /e/{id}/admin anonymisé, OA8.4 |
| Anonymized.body | Le {date}, 30 jours après l’événement, les prénoms, les numéros, les voitures et les inscriptions ont été effacés. Il reste le titre, le lieu et les dates. | On {date}, 30 days after the event, first names, phone numbers, cars and sign-ups were erased. The title, place and dates remain. | OA8.4 |
| EventEnded.title | Événement terminé | Event over | /e/{id} anonymisé, OA8.3 |
| EventEnded.body | Les inscriptions ont été effacées 30 jours après l’événement. | Sign-ups were erased 30 days after the event. | OA8.3 |
| EventEnded.create | Créer un événement | Create an event | OA8.3 |
| Privacy.title | Confidentialité | Privacy | /confidentialite, OA10.4 |
| Privacy.draft | Texte à rédiger par le propriétaire. | Text to be written by the owner. | maquette seulement : jamais en production |

## Les e-mails

Quatre, et aucun autre. Aucun texte saisi par quelqu’un (ni titre, ni lieu, ni prénom), aucune image, aucun suivi. `[…]` est le bouton, un lien vers `{hôte}`. Pied de chaque e-mail : « Fullcar · Confidentialité : https://{hôte}/confidentialite » / « Fullcar · Privacy: https://{host}/confidentialite ».

### Confirmation, à la création sans session

**FR — Confirmez votre adresse pour Fullcar**

> Bonjour,

> Un événement vient d’être créé sur Fullcar avec cette adresse. Confirmez-la pour le retrouver dans Mes événements, sur n’importe quel appareil :

> [Confirmer mon adresse]

> Ce lien est valable 7 jours et ne sert qu’une fois. Ne le transférez pas : il ouvre l’espace organisateur, qui montre des numéros de téléphone.

> Ce n’était pas vous ? Ignorez cet e-mail : sans clic, cet événement n’est rattaché à aucun compte, et il est supprimé, avec l’adresse qu’il porte, 30 jours après sa date.

> Si le bouton ne marche pas, copiez ce lien dans votre navigateur :  
> https://{hôte}/connexion/confirmer#{jeton}

**EN — Confirm your email address for Fullcar**

> Hello,

> An event has just been created on Fullcar with this address. Confirm it to find the event in My events, on any device:

> [Confirm my address]

> This link is valid for 7 days and works once. Do not forward it: it opens the organiser area, which shows phone numbers.

> Wasn’t you? Ignore this email: without a click, this event is linked to no account, and it is deleted, with the address it holds, 30 days after its date.

> If the button does not work, copy this link into your browser:  
> https://{host}/connexion/confirmer#{token}

### Lien de connexion

**FR — Votre lien de connexion à Fullcar**

> Bonjour,

> Voici votre lien pour vous connecter à Fullcar :

> [Se connecter]

> Il est valable 1 heure et ne sert qu’une fois. Ne le transférez pas : il donne accès à vos événements.

> Vous n’avez rien demandé ? Ignorez cet e-mail : sans clic, aucune session ne s’ouvre.

> Si le bouton ne marche pas, copiez ce lien dans votre navigateur :  
> https://{hôte}/connexion/lien#{jeton}

**EN — Your Fullcar sign-in link**

> Hello,

> Here is your link to sign in to Fullcar:

> [Sign in]

> It is valid for 1 hour and works once. Do not forward it: it gives access to your events.

> Didn’t ask for anything? Ignore this email: without a click, nobody is signed in.

> If the button does not work, copy this link into your browser:  
> https://{host}/connexion/lien#{token}

### Demande de connexion, adresse sans compte

**FR — Connexion à Fullcar**

> Bonjour,

> Quelqu’un a demandé à se connecter à Fullcar avec cette adresse, mais aucun compte n’y est rattaché. Un compte se crée avec un premier événement :

> [Créer un événement]

> Vous n’avez rien demandé ? Ignorez cet e-mail : aucun compte n’a été créé.

> Le bouton mène à https://{hôte}/nouveau

**EN — Signing in to Fullcar**

> Hello,

> Someone asked to sign in to Fullcar with this address, but no account is linked to it. An account is created with a first event:

> [Create an event]

> Didn’t ask for anything? Ignore this email: no account was created.

> The button leads to https://{host}/nouveau

### Avertissement, 30 jours avant la suppression d’un compte inactif

**FR — Votre compte Fullcar sera supprimé le {date}**

> Bonjour,

> Votre compte Fullcar n’a pas servi depuis bientôt 3 ans. Sans visite d’ici le {date}, il sera supprimé, avec l’historique de vos événements.

> Pour le garder, connectez-vous :

> [Se connecter]

> Pour qu’il soit supprimé, il n’y a rien à faire.

> Le bouton mène à https://{hôte}/connexion : il n’ouvre aucune session tout seul.

**EN — Your Fullcar account will be deleted on {date}**

> Hello,

> Your Fullcar account has not been used for almost 3 years. Without a visit by {date}, it will be deleted, along with the history of your events.

> To keep it, sign in:

> [Sign in]

> To have it deleted, there is nothing to do.

> The button leads to https://{host}/connexion: it signs nobody in by itself.


## Le focus

- `/connexion`, après « Recevoir le lien » : le titre « Regardez vos e-mails » (`tabindex="-1"`). « Changer d’adresse » : le champ.
- Page du lien : après la réussite, le titre de la page d’arrivée ; après un échec, le bouton, l’alerte étant `role="alert"`.
- Feuille « Corriger l’adresse » : le champ à l’ouverture ; à la fermeture (réussite, « Annuler », Échap), « Corriger l’adresse ».
- « Renvoyer l’e-mail » : le focus reste sur le bouton ; la barre est annoncée (`role="status"`, ou `alert` pour un échec).
- Confirmation « Supprimer votre compte ? » : « Annuler » à l’ouverture ; à la fermeture sans suppression, « Supprimer mon compte ».
- `/nouveau`, « Se déconnecter » : le champ e-mail qui apparaît.
- Formulaires en erreur : le premier champ en erreur (C1.6).
- « Réessayer » (Mes événements, panneau) : après la réussite, le premier titre du contenu chargé (« À venir », « Aucun événement pour l’instant » quand la liste est vide, ou « Espace organisateur ») ; après un nouvel échec, « Réessayer ».
- « Afficher les autres » : la première ligne qui apparaît.
- Arrivée sur `/` après la suppression du compte : la ligne « Votre compte a été supprimé. » (`tabindex="-1"`, `role="status"`).
- Arrivée sur `/connexion` après « Se déconnecter » : la ligne « Session fermée. » (`tabindex="-1"`, `role="status"`).
- L’avis « Confirmez votre adresse » ne prend pas le focus : son changement est annoncé par sa région `aria-live="polite"`, et un échec par `role="alert"`.

## Critères d’acceptation

Chacun est prouvé par un test, sauf la partie d’OA3.3 qui le dit. Les durées se testent avec des dates amorcées dans le passé, pas en avançant l’horloge.

### Créer un événement (/nouveau)

- **OA1.1** Sans session, `/nouveau` a un champ « Votre adresse e-mail » (`type="email"`, `autocomplete="email"`, requis), placé juste au-dessus de « Créer », décrit par `CreateEvent.email.hint` (`aria-describedby`), que suit un lien « Confidentialité » vers `/confidentialite`. Aucune page de participant (`/e/{id}`, ses feuilles, `/e/{id}/moi`) n’a de champ `type="email"`.
- **OA1.2** **Chemin le plus court, sans session** : depuis `page.goto("/")`, le test fait au plus **8 actions** (« Créer un événement », titre, lieu, date de début, heure de début, heure de fin, adresse e-mail, « Créer ») et le lien à partager est visible ; le scénario, réponse du serveur comprise, dure moins de 30 s. **Le même chemin, avec un fournisseur d’e-mail simulé qui ne répond jamais, dure aussi moins de 30 s** : la création n’attend pas l’envoi. Remplace A2.2 de #232 (sept actions).
- **OA1.3** **Avec session** : pas de champ e-mail ; sous le titre « Créer un événement », la ligne `CreateEvent.signedIn` montre l’adresse du compte, suivie de « Ce n’est pas vous ? » et du bouton « Se déconnecter ». Le chemin depuis `/` reste à **7 actions**, en moins de 30 s. Après « Créer », l’événement est dans Mes événements et aucun e-mail n’est parti (boîte de test vide).
- **OA1.4** Adresse vide : « Champ requis. » ; « abc » : « Adresse e-mail non valide. » ; 255 caractères : « 254 caractères au maximum. ». Aucun événement créé, valeurs gardées, focus sur le premier champ en erreur (C1.6). Le serveur applique les mêmes règles (Vitest sur l’action).
- **OA1.5** Session terminée entre l’affichage et l’envoi (cookie supprimé dans le test) : aucun événement créé ; le champ e-mail apparaît avec `CreateEvent.email.sessionEnded`, toutes les autres valeurs gardées.
- **OA1.6** Sans session, après « Créer » : exactement un e-mail de confirmation à l’adresse saisie, dans la langue de la page ; l’URL d’arrivée est `/e/{id}/admin`, **sans fragment**.
- **OA1.7** L’envoi se fait sur le serveur, même si l’onglet est fermé, et **son résultat est gardé avec l’événement en attente** : en cours, envoyé, échec, ou limite par adresse. L’avis montre toujours le résultat gardé, à l’arrivée comme à chaque chargement. Tant que l’envoi n’a pas répondu : `Admin.pending.sending`. Fournisseur en erreur : `Admin.pending.sendFailed`. Fournisseur qui ne répond pas : l’envoi est abandonné après 10 s, et l’avis devient `sendFailed` moins de 15 s après l’arrivée, sans recharger la page. Un envoi resté « en cours » plus de 30 s (serveur interrompu) se lit comme un échec. Un envoi abandonné à 10 s peut encore être accepté par Brevo : c’est pourquoi l’avis dit « n’a peut-être pas été envoyé », et tout lien arrivé reste valable. Dans tous les cas, l’événement existe. Le changement de l’avis est annoncé : région `aria-live="polite"`, et `role="alert"` pour un échec.
- **OA1.8** Avec session, « Se déconnecter » sur `/nouveau` : on reste sur `/nouveau`, toutes les valeurs sont gardées, la ligne laisse place à `CreateEvent.signedOut` et au champ e-mail vide, qui prend le focus. Hors ligne : `Account.signOutFailed` sous la ligne, rien d’autre ne change.
- **OA1.9** **Limite par adresse** : 5 e-mails de confirmation au plus par heure vers une même adresse, tous événements confondus. La 6e création dans l’heure avec cette adresse crée l’événement, n’envoie rien, et l’avis dit `Admin.pending.addressLimit.title` avec `Admin.pending.addressLimit.body`, à chaque chargement, jusqu’à un renvoi réussi.
- **OA1.10** **Onglet fermé pendant l’envoi** (réponse du fournisseur retenue), puis `/e/{id}/admin` rouvert dans le même contexte : fournisseur relâché avec succès, l’avis dit `Admin.pending.body` ; relâché en erreur, `sendFailed`. Avec un résultat amorcé de la veille (échec, limite par adresse, envoi resté en cours depuis 1 heure), l’avis dit respectivement `sendFailed`, `addressLimit`, `sendFailed` : jamais « Nous avons envoyé » pour un e-mail qui n’est pas parti, jamais « Envoi du lien… » qui ne finit pas. Un renvoi réussi remplace le résultat gardé.

### Événement en attente

- **OA2.1** Après une création sans session, l’espace organisateur montre, après le lien à partager, l’avis « Confirmez votre adresse » avec l’adresse, puis « Renvoyer l’e-mail » et « Corriger l’adresse » (≥ 44 px). Ni « Lien d’organisateur », ni « Gardez ce lien ». Une adresse de 60 caractères sans point de coupure passe à la ligne sans débordement à 360 px.
- **OA2.2** Onglet fermé, le **navigateur de création** ouvre `/e/{id}` (le lien à partager) : le lien « Espace organisateur » est visible et mène au panneau (OA7.4). Dans un **autre** contexte, avec ou sans session : l’écran d’OA7.7.
- **OA2.3** Tant que son lien de confirmation n’a pas servi, l’événement n’est dans Mes événements d’aucun compte, y compris celui de la même adresse, avec une session ouverte ailleurs.
- **OA2.4** « Renvoyer l’e-mail » : un e-mail de plus, et la barre dit `Admin.pending.resent`. **Limites** : 3 e-mails de confirmation au plus par heure pour un événement (création, renvois et corrections compris), et la limite par adresse d’OA1.9. Au-delà : la barre dit `Admin.pending.tooMany`, rien ne part. Hors ligne : `Admin.pending.offline`.
- **OA2.5** « Corriger l’adresse » ouvre une feuille, adresse préremplie et focus dans le champ, avec `FixEmail.note`, « Envoyer le lien » et « Annuler ». Adresse non valide : erreur sous le champ, rien ne part. Hors ligne : `FixEmail.offline` au-dessus d’« Envoyer le lien », la feuille reste ouverte avec la saisie. Limite atteinte : `Admin.pending.tooMany`, au même endroit. Une correction compte dans les limites d’OA2.4. Réussite : la feuille se ferme, le focus revient sur « Corriger l’adresse », l’avis montre la nouvelle adresse, et le lien envoyé à l’ancienne répond « Ce lien n’est pas valide ». « Annuler » ou Échap : rien ne change, focus sur « Corriger l’adresse ».
- **OA2.6** Lien de confirmation utilisé dans un autre contexte : l’événement est dans Mes événements de ce contexte ; dans le navigateur de création, le panneau s’ouvre toujours, et l’avis a disparu au chargement suivant.
- **OA2.7** Jamais confirmé, au jour 30 après le dernier leg (heure de Paris) : l’événement est supprimé en entier. `/e/{id}` répond « Événement introuvable », et aucune ligne ne le référence en base (Vitest, événement amorcé avec des dates passées).
- **OA2.8** Panneau replié (organizer-view v3.2) : l’avis est caché avec le reste du contenu repliable. L’arrivée après la création se fait toujours dépliée (O4.2).

### E-mails

- **OA3.1** Chacun des **quatre** e-mails (confirmation, connexion, adresse sans compte, avertissement d’inactivité) a exactement le sujet et le texte de « Les e-mails », dans la langue de la page qui l’a demandé (un navigateur `de-DE` reçoit le français). L’avertissement part dans la langue du compte : celle de sa dernière visite avec une session.
- **OA3.2** Aucun texte saisi : un événement titré `Zorglub <b>x</b>`, au lieu `Zorglub-lieu`, produit un e-mail de confirmation dont ni le sujet, ni le texte, ni le HTML ne contiennent « Zorglub ».
- **OA3.3** Le HTML ne contient aucune `<img>` ; chaque `href` commence par `https://{hôte}/`. La requête envoyée à Brevo désactive le suivi d’ouverture et de clic. **Ce dernier point n’est pas prouvable par nos tests** : Brevo réécrit l’e-mail après l’envoi. Preuve demandée : l’humain reçoit un vrai e-mail de production et vérifie que ses liens pointent vers `{hôte}` et qu’il n’a pas d’image.
- **OA3.4** Le lien d’un e-mail de confirmation ou de connexion a pour chemin `/connexion/confirmer` ou `/connexion/lien`, aucune query string, et le jeton après `#`. L’avertissement d’inactivité ne porte aucun jeton : son lien est `https://{hôte}/connexion`.
- **OA3.5** Une demande de connexion pour une adresse sans compte envoie l’e-mail « adresse sans compte » et ne crée aucune ligne de compte.
- **OA3.6** Chaque envoi attend Brevo 10 s au plus ; au-delà, il compte comme un échec (test avec un fournisseur simulé qui ne répond pas).

### Se connecter

- **OA4.1** `/connexion` : h1 « Se connecter », `Login.intro`, champ « Adresse e-mail » (`autocomplete="email"`), bouton « Recevoir le lien » ≥ 44 px, puis `Login.noAccount` et le lien « Créer un événement » vers `/nouveau`. Pendant l’envoi : le bouton dit « Envoi en cours… », a `aria-disabled="true"`, et un second clic n’envoie rien.
- **OA4.2** Après l’envoi, une adresse avec compte et une adresse sans compte donnent **le même écran** « Regardez vos e-mails » (même texte à l’adresse près, même statut HTTP). Le focus va sur son titre.
- **OA4.3** « Renvoyer l’e-mail » : un e-mail de plus, et `Check.resent` sous les boutons. « Changer d’adresse » : retour au formulaire, adresse préremplie, focus dans le champ. Tout lien non expiré et non utilisé reste valable.
- **OA4.4** Après la connexion par le lien, on arrive sur la page d’où la connexion a été demandée : `/mes-evenements` par défaut, `/e/{id}/admin` si on venait de là.
- **OA4.5** Hors ligne : `Login.offline`, champ gardé. Erreur du fournisseur, ou pas de réponse en 10 s : `Login.failed`. La 6e demande en une heure pour une adresse : `Login.tooMany`, aucun e-mail. L’alerte est au-dessus du bouton, `role="alert"`.
- **OA4.6** Avec session, `/connexion` montre `Login.already` et le lien « Mes événements » au-dessus du formulaire.
- **OA4.7** Sans JavaScript, `/connexion`, `/connexion/lien` et `/connexion/confirmer` montrent `Login.needsJavaScript`, sans formulaire ni bouton.

### La page du lien

- **OA5.1** Ouvrir le lien, puis recharger la page deux fois, ne change rien en base : aucune session ouverte, jeton non consommé. Puis « Se connecter » réussit. (Un scanner d’e-mails qui suit le lien ne le consomme pas.)
- **OA5.2** « Se connecter » : arrivée selon OA4.4, avec une session ; la barre dit `Session.signedInAs` ; le focus est sur le titre de la page d’arrivée ; le fragment n’est plus dans la barre d’adresse ni dans l’historique.
- **OA5.3** Lien de confirmation, « Confirmer et se connecter » : arrivée sur `/e/{id}/admin` de cet événement, avec une session, et l’événement est dans Mes événements.
- **OA5.4** Un lien utilisé une deuxième fois : « Ce lien a déjà servi », avec `LinkPage.used.login` ou `LinkPage.used.confirm` selon la sorte de lien, et le bouton « Mes événements ».
- **OA5.5** Lien de connexion amorcé avec une date de création d’il y a 61 minutes : « Ce lien a expiré », `LinkPage.expired.login`, « Recevoir un nouveau lien » mène à `/connexion`.
- **OA5.6** Lien de confirmation amorcé il y a 7 jours et 1 minute : « Ce lien a expiré », `LinkPage.expired.confirm`. « Recevoir un nouveau lien » envoie, sans rien saisir, un nouvel e-mail de confirmation à l’adresse de l’événement en attente, puis montre « Regardez vos e-mails » avec **`Check.confirmBody`** (ni l’adresse, ni « 1 heure »). Limite atteinte (OA2.4) : `Admin.pending.tooMany` au-dessus du bouton, qui reste actif. Hors ligne : `FixEmail.offline`.
- **OA5.7** Fragment absent, tronqué d’un caractère ou inconnu : « Ce lien n’est pas valide ».
- **OA5.8** Pendant la requête : le bouton dit `LinkPage.working`, `aria-disabled="true"`. Requête interrompue : `LinkPage.offline`, bouton de nouveau actif, focus dessus. Erreur serveur : `LinkPage.failed`.
- **OA5.9** Session ouverte avec A, lien de B utilisé : la session devient celle de B (Mes événements dit « Session ouverte avec B »).
- **OA5.10** Le jeton d’un lien n’apparaît dans aucun chemin, aucune query string, aucun en-tête, ni dans le HTML servi (comme C4.8 de #3), ni dans les journaux du serveur ou un événement Sentry.

### Mes événements

- **OA6.1** `/mes-evenements` : h1 « Mes événements », `MyEvents.signedInAs`, « Créer un événement » (bouton secondaire, `outline`), puis « À venir (n) » triés par début croissant, puis « Passés (n) » triés par début décroissant. Un événement est passé quand la date et l’heure de son dernier leg sont passées **à l’heure de Paris** (`Europe/Paris`).
- **OA6.2** Une ligne est un lien vers `/e/{id}/admin`, d’au moins 44 px : titre, début, lieu, `MyEvents.persons`, et une pastille ambre `MyEvents.withoutCar` par leg qui a au moins une personne sans voiture.
- **OA6.3** Passé, pas encore anonymisé : la ligne dit `MyEvents.erasedOn` avec la date du jour 30 (heure de Paris).
- **OA6.4** Anonymisé : titre, début, lieu, « Inscriptions effacées » ; ni nombre de personnes ni pastille.
- **OA6.5** Aucun événement : `MyEvents.empty`, sans titres de section ; son titre « Aucun événement pour l’instant » est la cible du focus après « Réessayer » (`tabindex="-1"`). Aucun à venir mais des passés : « À venir (0) » et `MyEvents.noUpcoming`.
- **OA6.6** 12 événements passés : 10 visibles, puis « Afficher les 2 autres » ; le tap les montre.
- **OA6.7** Pendant la lecture (requête retenue) : sous « Créer un événement », la ligne `MyEvents.loading` avec l’icône qui tourne, et rien d’autre. Échec : l’alerte `MyEvents.failed` et « Réessayer ».
- **OA6.8** Sans session, `/mes-evenements` mène à `/connexion` ; après la connexion par le lien, retour à `/mes-evenements`.
- **OA6.9** Un titre de 80 caractères sans espace, un lieu de 120 et une adresse de 60 caractères sans point de coupure ne débordent pas à 360 px.

### Espace organisateur

- **OA7.1** `/e/{id}/admin` d’un événement **confirmé dont le compte existe**, sans session de son organisateur ni jeton d’admin : h1 « Espace organisateur », `AdminLogin.body`, puis le formulaire de connexion. Le HTML ne contient rien du panneau.
- **OA7.2** Session ouverte avec un compte qui n’organise pas l’événement (confirmé, dont le compte existe) : `AdminNotYours`, avec l’adresse, « Voir l’événement » (`/e/{id}`) et « Se connecter avec une autre adresse » (`/connexion`). Rien du panneau.
- **OA7.3** Session de l’organisateur : le panneau, sans « Lien d’organisateur » ni « Gardez ce lien » ; au-dessus, le lien « Mes événements ». Lecture du panneau en échec (session ou navigateur de création) : l’alerte d’`AdminLinkProblem` avec `Admin.failed.title` modifiée, son corps et « Réessayer ».
- **OA7.4** Sur `/e/{id}`, **après le tableau** (au-dessus de l’en-tête, ses 60 px décaleraient la page à l’affichage, CA1.19, DS2.9), un lien « Espace organisateur » vers `/e/{id}/admin` pour **la session du compte de l’événement et pour le navigateur qui garde le jeton d’admin** de l’événement. Le jeton se lit dans le navigateur, sans requête ; la session, le navigateur la fait vérifier par le serveur, son jeton dans le corps de la requête, comme « Mes événements ». Le jeton d’admin ne part jamais vers `/e/{id}` (O6.1). Un participant, la session d’un autre compte, un navigateur qui ne garde ni l’un ni l’autre ne le voient pas.
- **OA7.5** Un ancien lien `/e/{id}/admin#{jeton}` ne donne aucun accès : le fragment est ignoré.
- **OA7.6** La règle de visibilité du téléphone ne change pas : « l’admin » est désormais la session de l’organisateur ou le jeton d’admin du navigateur de création (Vitest sur la règle unique).
- **OA7.7** `/e/{id}/admin` d’un événement **en attente**, dans un navigateur sans son jeton, avec ou sans session, quel que soit le compte : `AdminPending` (titre, corps, `AdminPending.expired`) et « Voir l’événement ». Ni formulaire de connexion, ni adresse, ni rien du panneau.
- **OA7.8** À partir de 1024 px : la première rangée du panneau a le lien à partager à gauche ; à droite, l’avis « Confirmez votre adresse » si l’événement est en attente. Sinon la colonne de droite est vide, et le lien à partager garde sa largeur de colonne. « Modifier l’événement » reste sous la rangée (M1.1).
- **OA7.9** **Événement sans organisateur** : `/e/{id}/admin` d’un événement confirmé dont le compte a été supprimé (par « Supprimer mon compte » ou après 3 ans sans visite) montre `AdminOrphan` et « Voir l’événement » à **tout** visiteur : n’importe quel navigateur, avec ou sans session, l’ancien organisateur compris, sur un autre appareil. Ni formulaire de connexion, ni « pas le vôtre ». Sur `/e/{id}`, plus personne ne voit le lien « Espace organisateur ».

### Au jour 30

- **OA8.1** Au jour 30 après le dernier leg (heure de Paris), pour un événement confirmé : plus aucune Person, aucun Placement, Ride, Arrêt ni jeton personnel ; la Position de l’Event est effacée ; les jetons d’admin de l’événement sont révoqués. Restent le titre, le texte du lieu, le début, la fin et les options (Vitest : un numéro de téléphone et un prénom amorcés n’apparaissent plus dans aucune table).
- **OA8.2** Au jour 29, rien n’est touché. Une deuxième exécution ne change rien. Une exécution interrompue laisse chaque événement soit intact, soit anonymisé en entier.
- **OA8.3** `/e/{id}` d’un événement anonymisé : « Événement terminé », puis le titre et le début, `EventEnded.body`, et « Créer un événement » vers `/nouveau`. Ni lieu, ni prénom. `/e/{id}/moi` donne la même page. Le statut HTTP est au choix de l’architecte, sans middleware ; la page reste `noindex`.
- **OA8.4** `/e/{id}/admin` anonymisé, session de l’organisateur : « Mes événements », titre, lieu, Début et Fin, et l’avis « Inscriptions effacées » avec la date. Aucune action.
- **OA8.5** « Événement introuvable » dit `EventNotFound.deleted` modifiée.

### Mon compte

- **OA9.1** En bas de Mes événements : « Mon compte », l’adresse, « Se déconnecter », « Supprimer mon compte ». « Se déconnecter » mène, sans confirmation, à `/connexion` avec `Login.signedOut`. Ensuite : `/mes-evenements` mène à `/connexion`, et ce navigateur a perdu ses jetons d’admin (un événement qu’il a créé n’ouvre plus son panneau). Un autre contexte du même compte garde sa session.
- **OA9.2** Déconnexion hors ligne : `Account.signOutFailed` dans la barre, la session reste ouverte.
- **OA9.3** « Supprimer mon compte » ouvre une confirmation, focus sur « Annuler » : `DeleteAccount.erased`, `DeleteAccount.open` si au moins un événement n’est pas encore anonymisé, puis « C’est définitif. ». « Annuler » ou Échap ne change rien, focus sur « Supprimer mon compte ».
- **OA9.4** Suppression hors ligne : `DeleteAccount.failed` dans la confirmation ; rien n’est effacé (tout ou rien).
- **OA9.5** Après « Supprimer mon compte » : arrivée sur `/` avec `Home.accountDeleted`, une fois ; l’adresse n’est plus dans aucune table ; les événements anonymisés répondent « Événement introuvable » ; les autres restent ouverts aux participants ; toutes les sessions du compte sont fermées **et tous les jetons d’admin de ses événements sont révoqués** : sur `/e/{id}/admin` de ces événements, tout visiteur, le navigateur de création compris, voit `AdminOrphan` (OA7.9).
- **OA9.6** Une session dure 90 jours après la dernière visite : une session amorcée avec une dernière visite il y a 91 jours mène `/mes-evenements` à `/connexion`.
- **OA9.7** **Inactivité**, mesurée à la **dernière visite avec une session** (tout chargement de page qui prolonge la session), jamais à l’ouverture de la session (Vitest, dates amorcées). Un compte dont la dernière visite date de 3 ans moins 30 jours reçoit l’avertissement, une seule fois (une deuxième exécution n’envoie rien). À 3 ans sans visite, il est supprimé comme en OA9.5. Une visite entre les deux annule la suppression. **Un compte dont la session a été ouverte il y a 3 ans, mais qui a servi hier, ne reçoit rien et n’est pas supprimé.**

### Accueil, bas de page, confidentialité

- **OA10.1** L’accueil affiche les mots modifiés de `Home.tagline`, `Home.steps.create.text`, `Home.steps.share.text` et `Home.deleted`.
- **OA10.2** Sous « Créer un événement », un lien « Mes événements » vers `/mes-evenements`, ≥ 44 px, avec ou sans session.
- **OA10.3** Le bas de page, ligne 1 : « Accueil », langue, « Confidentialité » (`/confidentialite`, même onglet). Présent sur toutes les pages, `/` comprise.
- **OA10.4** `/confidentialite` existe en FR et en EN, avec les titres de section de la structure (h2), et répond 200. Le texte juridique est celui du propriétaire : la PR qui l’ajoute est mergée par l’humain.

### Transverse

- **OA11.1** Une adresse unique saisie dans chaque formulaire de l’épic n’apparaît dans aucun journal du serveur ni aucun événement Sentry du scénario (comme #94).
- **OA11.2** Captures à 360 px sans débordement horizontal : chaque écran de cette maquette, FR et EN, dont une adresse de 60 caractères sans point de coupure dans l’avis, « Regardez vos e-mails » et Mes événements. Chaque bouton et chaque ligne de liste fait au moins 44 px.
- **OA11.3** FR et EN livrés ensemble ; la vérification des clés i18n passe.
- **OA11.4** Le focus suit la section « Le focus » : chaque règle a son test Playwright (`toBeFocused`). Le changement de l’avis « Confirmez votre adresse » est annoncé (OA1.7).


## Décisions

1. Decision : Créer d’abord, confirmer ensuite. Sans session, l’organisateur donne son adresse dans le formulaire ; l’événement est créé tout de suite, et un lien de confirmation part par e-mail. — Reason : Le lien à partager reste à moins de 30 s (OA1.2). Se connecter d’abord mettrait la boîte mail, et le délai d’un e-mail, avant le premier événement.
2. Decision : La création n’attend pas l’envoi de l’e-mail. L’envoi se fait sur le serveur, même onglet fermé, et attend Brevo 10 s au plus. Son résultat (en cours, envoyé, échec, limite par adresse) est gardé avec l’événement en attente, et l’avis le lit à chaque chargement ; un envoi « en cours » depuis plus de 30 s se lit comme un échec. — Reason : Revue v1, point 10 : sinon les 30 s dépendent d’un tiers. Revue v2, point 3 : un résultat qui ne vivrait que dans l’onglet ferait dire « Nous avons envoyé » à une visite du lendemain pour un e-mail jamais parti, ou laisserait « Envoi du lien… » sans fin.
3. Decision : La confirmation est un lien **par événement**, pas une connexion générale : seul le lien envoyé pour cet événement le rattache à un compte. Une connexion ordinaire ne rattache aucun événement en attente, ni la confirmation d’un autre événement. — Reason : Sinon, quiconque tape votre adresse en créant un événement ajouterait cet événement à votre liste.
4. Decision : Un événement en attente, ouvert sur `/e/{id}/admin` hors du navigateur de création, montre son propre écran (« Adresse pas encore confirmée »), qui renvoie à l’e-mail de confirmation, et jamais le formulaire de connexion ni « pas le vôtre ». — Reason : Revue v1, point 1 : se connecter ne rattache pas l’événement (décision précédente). La créatrice arriverait sur « Cet espace organisateur n’est pas le vôtre » à propos de son propre événement.
5. Decision : Décidé par le propriétaire (Q2 = a) : le navigateur de création administre l’événement en attente grâce à son jeton d’admin, gardé dans ce navigateur et jamais dans une URL, jusqu’à l’anonymisation ou « Se déconnecter ». Sur `/e/{id}`, ce navigateur voit le lien « Espace organisateur ». — Reason : L’organisateur partage le lien et suit les inscriptions avant d’ouvrir sa boîte mail. Revue v1, point 2 : onglet fermé, le lien à partager, qu’il retrouve dans la conversation du groupe, est son chemin de retour.
6. Decision : Décidé par le propriétaire (Q1 = a) : le lien d’organisateur disparaît, avec « Gardez ce lien », les clés `Admin.adminLink.*`, `Admin.keep.*` et `Admin.invalid.*`. `Admin.failed.title` ne nomme plus le lien. Pas de co-organisateur dans cet épic. — Reason : Un compte est obligatoire pour administrer. Des invitations par e-mail pourront venir dans un épic ultérieur.
7. Decision : La page du lien a un bouton ; elle ne consomme jamais le lien au chargement. — Reason : Les scanners d’e-mails et les aperçus de messagerie suivent les liens : ils ouvriraient la session, ou useraient le lien, à la place de l’organisateur.
8. Decision : Lien de connexion : 1 heure. Lien de confirmation : 7 jours. Chacun ne sert qu’une fois ; plusieurs liens non utilisés restent valables en même temps. — Reason : La connexion est attendue maintenant ; la confirmation, l’organisateur l’ouvre quand il a fini de partager. Invalider les anciens liens punirait celui qui ouvre le premier e-mail reçu.
9. Decision : Limites d’envoi : 3 e-mails de confirmation par heure et par événement (création, renvois et corrections compris) ; 5 par heure vers une même adresse, tous événements confondus ; 5 demandes de connexion par heure et par adresse. À la création, la limite par adresse n’empêche pas de créer : l’événement existe, l’e-mail ne part pas, et l’avis le dit. — Reason : Décision du coordinateur : on ne doit pas pouvoir inonder une adresse en créant des événements. Refuser la création bloquerait un club qui crée ses matchs à la suite.
10. Decision : Quand l’envoi a été abandonné (10 s sans réponse) ou a échoué, l’avis et « Se connecter » disent que l’e-mail « n’a peut-être pas été envoyé ». À la limite par adresse, où l’on sait que rien n’est parti, l’avis dit « L’e-mail n’est pas parti ». — Reason : Brevo peut accepter un message après que nous avons cessé d’attendre : affirmer « n’a pas été envoyé » serait parfois faux. Un second lien reste valable avec le premier (décision 8).
11. Decision : Une demande de connexion donne le même écran, et envoie un e-mail, que l’adresse ait un compte ou non. Seul le texte de l’e-mail change. Aucun compte n’est créé sans événement. — Reason : La page ne dit pas qui a un compte. Un compte vide serait une adresse gardée pour rien.
12. Decision : Une session dure 90 jours après la dernière visite. « Se déconnecter » ne ferme que ce navigateur, et lui retire aussi ses jetons d’admin. — Reason : Un organisateur crée quelques événements par an. Repasser par sa boîte mail à chaque modification, c’est le défaut des concurrents. Après « Se déconnecter », ce navigateur n’ouvre plus aucun espace organisateur.
13. Decision : Sur `/nouveau`, la ligne « Session ouverte avec … » est sous le titre, avant les champs. « Se déconnecter » y reste sur la page, garde la saisie et fait apparaître le champ e-mail. — Reason : Revue v1, point 11 : placée près de « Créer », elle était lue après la saisie, et la déconnexion menait à `/connexion` en perdant tout.
14. Decision : Mes événements : « À venir », du plus proche au plus lointain, puis « Passés », du plus récent au plus ancien ; 10 passés, puis « Afficher les autres ». « Créer un événement » y est un bouton secondaire. — Reason : L’organisateur vient chercher le prochain événement : la liste est l’action principale de la page.
15. Decision : « Passé » et le jour 30 se calculent à l’heure de Paris (`Europe/Paris`). — Reason : Décision du coordinateur : les heures sont stockées sans fuseau ; sur 30 jours, l’écart pour un événement à l’étranger est sans effet.
16. Decision : Au jour 30 restent le titre, le texte du lieu, le début, la fin et les options. La Position du lieu est effacée, et les jetons d’admin de l’événement sont révoqués. — Reason : Ce que le propriétaire a demandé, et rien de plus. Il n’y a plus rien à administrer.
17. Decision : Un événement anonymisé, ouvert par le lien à partager : « Événement terminé », le titre et la date, sans le lieu (Q3 = a). Le statut HTTP est au choix de l’architecte, sans middleware. — Reason : Les participants reconnaissent l’événement. Le lieu peut être une adresse personnelle. Décision du coordinateur pour le statut.
18. Decision : Décidé par le propriétaire (Q5 = a) : « Supprimer mon compte » efface l’adresse, l’historique, toutes les sessions et **tous les jetons d’admin** de ses événements. Les événements pas encore anonymisés restent ouverts aux participants, sans organisateur, puis sont supprimés en entier au jour 30. Leur `/e/{id}/admin` dit « Cet événement n’a plus d’organisateur » à **tout** visiteur, l’ancien organisateur compris ; le même vaut après la suppression pour inactivité. — Reason : Revue v1, point 8 : un jeton laissé vivant donnerait le panneau, numéros compris, sur un événement que la page dit sans organisateur. Revue v2, point 2 : le formulaire de connexion serait faux pour un événement que personne n’organise, et mènerait l’ancienne organisatrice à l’e-mail « adresse sans compte » ; une fois les jetons révoqués, le serveur ne distingue d’ailleurs plus le navigateur de création des autres.
19. Decision : Décidé par le propriétaire (Q4 = b) : un compte **sans visite** depuis 3 ans est supprimé comme par « Supprimer mon compte ». La visite, c’est tout chargement de page avec une session du compte ; c’est elle qui prolonge la session, et c’est elle qu’on mesure, jamais l’ouverture de la session. Un e-mail d’avertissement part 30 jours avant, une seule fois, dans la langue du compte ; il mène à `/connexion`, sans jeton. — Reason : Une durée sans limite est difficile à justifier pour une adresse e-mail. Revue v2, point 1 : une session glisse de 90 jours à chaque visite ; mesurer son ouverture supprimerait une organisatrice qui vient tous les mois. L’avertissement ne doit rien ouvrir tout seul.
20. Decision : Le compte garde sa langue : celle de sa dernière visite avec une session. Elle sert à l’avertissement d’inactivité, et la page Confidentialité la cite. — Reason : Suggestion de la revue v2 : l’avertissement part sans page qui le demande.
21. Decision : Un événement sans compte existe : en attente et jamais confirmé, ou laissé par un compte supprimé. Au jour 30, il est supprimé en entier. — Reason : Décision du propriétaire. Avec un compte obligatoire, ce cas n’existe que par ces deux chemins.
22. Decision : Quatre e-mails, et aucun autre. Aucun texte saisi par quelqu’un (ni titre, ni lieu, ni prénom), aucune image, aucun suivi d’ouverture ou de clic. Ils partent dans la langue de la page qui les demande ; l’avertissement, dans celle du compte. — Reason : Un titre, c’est n’importe qui qui écrit dans un e-mail envoyé en notre nom à une adresse qu’il a choisie. Et la promesse « zéro tracking ».
23. Decision : L’entrée vers le compte est le lien « Mes événements », sur l’accueil et en haut de l’espace organisateur. Il mène à la connexion sans session. Le bas de page gagne « Confidentialité » sur sa ligne 1, pas « Se connecter ». — Reason : Un seul mot pour un seul endroit. La ligne 1 du bas de page est ce qui reste dans l’application (#489).
24. Decision : Des mots épicènes : « Session ouverte avec {email} », « Session fermée », « La session n’a pas été ouverte ». Et une seule phrase d’échec réseau, celle de l’application : « Vérifiez la connexion, puis réessayez. » — Reason : Suggestions de la revue v1. Avec « session » pour le compte, « la connexion » ne se lit plus que comme le réseau.
25. Decision : En anglais, « Espace organisateur » reste « Organiser area », comme `Admin.title`. — Reason : Revue v1, point 6 : un concept, un nom.
26. Decision : Sur ordinateur (≥ 1024 px), l’avis « Confirmez votre adresse » prend la colonne de droite de la première rangée, là où était le lien d’organisateur ; sans avis, cette colonne reste vide. — Reason : Revue v1, point 14. « Modifier l’événement » ne bouge pas (M1.1).
27. Decision : Panneau replié : l’avis est caché avec le reste ; l’arrivée après la création est toujours dépliée. — Reason : La règle de la v3.2 d’organizer-view, sans exception : replier est un choix de l’organisateur, et il a vu l’avis à l’arrivée.
28. Decision : Le champ e-mail de `/nouveau` ne part en production qu’avec la page `/confidentialite` et son texte. — Reason : On ne demande pas une adresse sans dire ce qu’on en fait.
29. Decision : Le lien connecte le navigateur qui l’ouvre, et l’écran « Regardez vos e-mails » le dit. Pas de code à six chiffres dans cet épic. — Reason : Limite connue : certaines applications de messagerie ouvrent les liens dans leur propre navigateur, et la session y reste. À reprendre si le support le signale.
30. Decision : Une adresse mal tapée à la création envoie le lien de confirmation à quelqu’un d’autre. L’avis montre l’adresse et propose « Corriger l’adresse » ; l’e-mail dit de l’ignorer. — Reason : Risque accepté : celui qui clique quand même obtient l’espace organisateur, numéros compris. Corriger invalide l’ancien lien (OA2.5).

## Hors périmètre

- Co-organisateurs, et invitation par e-mail d’un second organisateur (Q1 = a).
- « Retirer de Mes événements », et toute suppression d’un événement par l’organisateur (décision du coordinateur).
- Un compte pour les participants, et l’envoi du lien perso par e-mail (#67).
- Mot de passe, connexion par Google ou Apple, code à six chiffres.
- Changer l’adresse d’un compte confirmé.
- « Se déconnecter de tous les appareils », hors suppression du compte.
- Tout autre e-mail que les quatre de cette maquette : rappel, notification, lettre d’information, e-mail après la suppression d’un compte.
- Une liste des événements en attente d’un navigateur sans session : le lien à partager y mène.
- Rattacher, à la confirmation d’un événement, les autres événements en attente que le même navigateur a créés avec la même adresse (décision du coordinateur, v4) : le prouver sans danger demanderait des règles de présence des jetons, des tests de déconnexion et de stockage effacé, une exception à OA2.3 et une phrase qui dépend d’un nombre. C’est trop de surface pour un cas rare. Chaque lien de confirmation ne rattache que son événement.
- Reprendre un événement passé comme modèle.
- Migrer les liens d’organisateur existants : la production ne contient que des données de test (décision du propriétaire).
- Le texte juridique de la politique de confidentialité, qui revient au propriétaire.
- Des statistiques d’usage.

## Documentation à mettre à jour

La section « Jetons » d’`architecture.md` revient à l’architecte.

### `docs/agents/product.md`

```diff
## Pour qui
+ L'organisateur a un compte : une adresse e-mail, sans mot de passe. Les participants n'en
+ ont jamais.

## Ce qui est pénible ailleurs
(inchangé : le login à chaque modification reste la chose à ne pas reproduire. Une session
qui dure 90 jours y répond.)

## Promesses
- **Zéro compte.** Aucune adresse e-mail obligatoire, à aucun moment. L'identité, c'est un
-  lien et un jeton dans le navigateur.
+ **Zéro compte pour les participants.** Un participant ne donne jamais d'adresse e-mail et
+  n'a jamais de compte : son identité, c'est un lien et un jeton dans le navigateur.
+ **Un compte léger pour l'organisateur.** Une adresse e-mail, pas de mot de passe : un lien
+  de connexion par e-mail, puis une session qui dure. Il retrouve ses événements dans
+  « Mes événements », sur n'importe quel appareil, sans repasser par sa boîte mail pour
+  modifier un événement. Créer un événement n'attend ni la confirmation de l'adresse, ni
+  l'envoi de l'e-mail.
- **Rien à nettoyer.** Les données disparaissent 30 jours après l'événement.
+ **Effacé à 30 jours.** 30 jours après le dernier leg (heure de Paris), tout ce qui concerne
+  les participants est effacé : prénoms, téléphones, voitures, lieux de départ, notes,
+  inscriptions. Restent le titre, le lieu et les dates, dans l'historique de l'organisateur,
+  jusqu'à la suppression de son compte, par lui ou après 3 ans sans visite. Un événement
+  sans compte est supprimé en entier.
+ **Des e-mails, pas de courrier.** Quatre e-mails seulement : confirmer l'adresse, se
+  connecter, la réponse à une demande de connexion sans compte, et l'avertissement avant la
+  suppression d'un compte inactif. Aucun texte saisi par quelqu'un, aucune image, aucun suivi.

## Ce qui compte comme fait
- | créer un événement en moins de 30 s | test de bout en bout, chemin le plus court compté |
+ | créer un événement en moins de 30 s | test de bout en bout depuis `/` : 8 actions pour un nouvel organisateur (l'adresse comprise), 7 avec une session ; aucun e-mail ni aucune réponse du fournisseur attendus sur ce chemin |

## États qui ne sont pas des cas limites
- jeton perdu (appareil changé) — le « lien perso » et son QR code sont la réponse ;
- lien d'admin perdu : rien à faire, et il faut le dire honnêtement avant.
+ jeton perdu (appareil changé) — le « lien perso » et son QR code sont la réponse ;
+ organisateur sur un autre appareil : il se connecte, et « Mes événements » le ramène à
+  l'espace organisateur ;
+ adresse pas encore confirmée : l'événement marche, l'espace organisateur ne s'ouvre que
+  dans le navigateur de création (le lien à partager y ramène), et ailleurs l'écran renvoie
+  à l'e-mail de confirmation ;
+ e-mail qui ne part pas : l'événement existe quand même, et l'avis le dit ;
+ lien de connexion expiré ou déjà utilisé : la page le dit, et en redemande un en un tap ;
+ événement anonymisé, ouvert par le lien à partager ;
+ événement dont le compte a été supprimé : ouvert aux participants, sans organisateur.

## Hors périmètre V1
- Notifications, appariement automatique, paiement, messagerie, comptes.
+ Notifications, appariement automatique, paiement, messagerie, comptes pour les
+ participants, co-organisateurs. Les quatre e-mails du compte ne sont pas des
+ notifications.
```

### `docs/agents/glossary.md`

```diff
+ | **Organisateur** | la personne qui a créé un événement et l'administre. Elle a un **compte**. Une Person n'est jamais un organisateur : si l'organisateur s'inscrit aussi, c'est une Person comme les autres, sans lien avec son compte. |
+ | **Compte** | une adresse e-mail confirmée, et rien d'autre : ni mot de passe, ni nom. Seul l'organisateur en a un. Il naît quand un premier lien de confirmation sert. Il garde sa langue (celle de sa dernière visite). Il est supprimé par « Supprimer mon compte », ou après 3 ans sans visite (un e-mail d'avertissement part 30 jours avant). |
+ | **Session** | la connexion d'un navigateur à un compte. Ouverte par un lien de connexion ou de confirmation, fermée par « Se déconnecter », par la suppression du compte, ou 90 jours après la dernière **visite**. Une visite est un chargement de page avec cette session : elle prolonge la session, et c'est elle, jamais l'ouverture de la session, qui mesure l'inactivité du compte. Dans l'interface : « Session ouverte avec {email} ». |
+ | **Lien de connexion** | envoyé par e-mail depuis `/connexion` : `/connexion/lien#{jeton}`. Il ouvre une session quand on touche « Se connecter ». Un seul usage, valable 1 heure. |
+ | **Lien de confirmation** | envoyé par e-mail à la création d'un événement sans session : `/connexion/confirmer#{jeton}`. Il rattache **cet** événement, et lui seul, au compte de l'adresse (et crée le compte au besoin), puis ouvre une session. Un seul usage, valable 7 jours. |
+ | **Événement en attente** | un événement dont le lien de confirmation n'a pas encore servi. Absent de « Mes événements » ; administré seulement par le navigateur qui l'a créé. |
+ | **Mes événements** | la liste des événements d'un compte : « À venir », puis « Passés ». Un événement est **passé** quand la date et l'heure de son dernier leg sont passées, à l'heure de Paris. |
- | **Jeton d'admin** | créé avec l'événement, permet de tout modifier, et donne les numéros des personnes sans voiture (DO1). Voyage dans le fragment de l'URL, `/e/{id}/admin#{token}`, jamais dans le chemin. |
+ | **Jeton d'admin** | créé avec un événement en attente, gardé par le navigateur qui l'a créé, et jamais dans une URL. Il donne à ce navigateur les droits de l'organisateur sur cet événement, numéros compris (DO1). Révoqué par « Se déconnecter » dans ce navigateur, par l'anonymisation, et par la suppression du compte. Il n'y a plus de lien d'organisateur. |
- | **Purge** | suppression des données 30 jours après la date du **dernier leg** : celle du retour si l'événement en a un, sinon celle de l'aller. |
+ | **Anonymisation** | 30 jours après la date du **dernier leg** (celle du retour s'il y en a un, sinon celle de l'aller), à l'heure de Paris : les Persons, Placements, Rides, Arrêts, jetons personnels et jetons d'admin sont supprimés, et la Position de l'Event est effacée. Restent le titre, le texte du lieu, le début, la fin et les options. Dans l'interface : « Inscriptions effacées » pour l'organisateur, « Événement terminé » pour les autres. |
+ | **Suppression** | un événement qui disparaît en entier : en attente au jour 30, laissé par un compte supprimé au jour 30, ou anonymisé quand son compte est supprimé. `/e/{id}` répond alors « Événement introuvable ». |
+ | **Sans organisateur** | un événement confirmé dont le compte a été supprimé. Ouvert aux participants jusqu'au jour 30, puis supprimé. Son espace organisateur dit « Cet événement n'a plus d'organisateur » à tout visiteur. |
+ | **Purge** | la tâche quotidienne qui fait l'anonymisation et la suppression au jour 30, et la suppression des comptes inactifs. |
```

## Confidentialité : la structure de `/confidentialite`

Le texte juridique revient au propriétaire. Un h2 par section, dans cet ordre. Le champ e-mail de `/nouveau` ne part en production qu’avec cette page et son texte.

| section | ce qu’elle doit dire | texte |
|---|---|---|
| Qui est responsable | Nom et contact du responsable du traitement. | propriétaire |
| Ce que nous gardons | Deux colonnes : **participants** (prénom, téléphone facultatif, besoin de rehausseur, voitures, lieux et heures, notes, participation aux frais, jeton personnel) et **organisateurs** (adresse e-mail, langue, date de la dernière visite, événements : titre, lieu, Position, dates, options ; sessions ; jetons d’admin ; résultat du dernier envoi d’un e-mail de confirmation). Ni nom, ni mot de passe. Les journaux de l’hébergeur (adresse IP, chemin demandé) : durée à vérifier par le propriétaire. | propriétaire, d’après cette ligne |
| Pourquoi | Organiser un covoiturage ; permettre à l’organisateur de retrouver ses événements. Base légale de chaque traitement. | propriétaire |
| Combien de temps | Participants : jusqu’au jour 30 après le dernier leg. Événement en attente, et son adresse : jusqu’au jour 30, puis supprimés. Organisateur : l’adresse et l’historique jusqu’à « Supprimer mon compte », ou 3 ans sans visite, après un e-mail d’avertissement 30 jours avant. Liens de connexion : 1 heure ; liens de confirmation : 7 jours ; sessions : 90 jours après la dernière visite. | propriétaire, d’après cette ligne |
| Qui voit quoi | La règle du téléphone, en une phrase : l’organisateur voit les numéros des personnes sans voiture ; une personne voit ceux de sa voiture ; personne d’autre. L’adresse e-mail de l’organisateur n’est montrée à personne d’autre que lui. | propriétaire, d’après cette ligne |
| Les services que nous utilisons | Vercel (hébergement), Neon (base de données, Europe), Brevo (envoi des e-mails : reçoit l’adresse et le lien), Sentry (erreurs, sans données personnelles), Photon de Komoot (propositions de lieux, interrogé par notre serveur), Geoapify (fonds de carte, servis par notre origine), Crisp (« Nous contacter », sur la page de Crisp). Pour chacun : ce qu’il reçoit, et où. | propriétaire, d’après cette ligne |
| Ce que nous ne faisons pas | Pas de publicité, pas de mesure d’audience, pas de suivi d’ouverture ou de clic dans les e-mails, aucune revente. | propriétaire, d’après cette ligne |
| Cookies et stockage du navigateur | Le cookie de session de l’organisateur ; le jeton personnel d’un participant et le jeton d’admin d’un événement en attente (stockage du navigateur) ; la langue choisie ; le repli de l’espace organisateur. Tous nécessaires au service : pas de bandeau de consentement. | propriétaire, d’après cette ligne |
| Vos droits | Accès, rectification, effacement : « Supprimer mon compte » pour l’organisateur ; pour un participant, depuis son appareil, ou par « Nous contacter ». Réclamation auprès de la CNIL. | propriétaire |
| Nous contacter | Le lien « Nous contacter ». | propriétaire, d’après cette ligne |
| Mise à jour | Date de la dernière version. | propriétaire, d’après cette ligne |

## Révisions

- v1 (2026-10-25) : première version, d’après les décisions du propriétaire sur #581. Revue de design : changements demandés (14 bloquants, 12 suggestions).
- v2 (2026-10-25) : réponses du propriétaire (Q1 a, Q2 a, Q4 b, Q5 a ; Q3 a) et décisions du coordinateur ([commentaire sur #581](https://github.com/olaurendeau/fullcar/issues/581#issuecomment-6394945895)) appliquées. « Retirer de Mes événements » sort du périmètre ; « passé » et le jour 30 à l’heure de Paris ; plus de statut 410 exigé ; limite d’envoi par adresse à la création. Bloquants de la revue : 1, écran « Adresse pas encore confirmée » (OA7.7) ; 2, le navigateur de création retrouve son panneau par `/e/{id}` (OA7.4, dessiné) ; 3, « Regardez vos e-mails » après un lien de confirmation expiré (`Check.confirmBody`) et son « trop d’envois » ; 4, états dessinés : chargement de Mes événements, « Envoi en cours… », « Ouverture de la session… », `Login.failed`/`tooMany`, `LinkPage.failed`, `used.confirm`, `pending.resent`/`offline`, `Check.resent` ; 5, feuille « Corriger l’adresse » : non valide, hors ligne, trop d’envois, « Annuler », et la correction compte dans la limite ; 6, « Organiser area » en anglais ; 7, `Admin.failed.title` modifiée et l’échec du panneau dessiné ; 8, la suppression du compte révoque les jetons d’admin, écran « Cet événement n’a plus d’organisateur » ; 9, quatrième e-mail (avertissement d’inactivité) et « quatre » partout ; 10, la création n’attend pas l’envoi, 10 s au plus par envoi, cas du fournisseur muet testé sous 30 s ; 11, « Se déconnecter » sur `/nouveau` reste sur la page ; 12 et 13, tranchés par le coordinateur ; 14, le panneau sur ordinateur dessiné. Suggestions appliquées : règle du panneau replié, phrase de l’e-mail de confirmation corrigée, adresses longues, mots épicènes, « Vérifiez la connexion » partout, 200 ms retirés d’OA4.2, dates amorcées au lieu d’avancer l’horloge, section « Le focus », sans JavaScript, lien « Confidentialité » sous le champ e-mail et livraison avec la page, « Créer un événement » secondaire sur Mes événements, README.
- v3 (2026-10-25) : revue de la v2 (changements demandés, 3 bloquants). 1, l’inactivité se mesure à la dernière visite avec une session, pas à l’ouverture de la session : OA9.7 (et son test de la session ouverte il y a 3 ans mais utilisée hier), l’e-mail d’avertissement, le glossaire. 2, « Cet événement n’a plus d’organisateur » pour tout visiteur (OA7.9) ; OA7.1 et OA7.2 ne valent que pour un événement dont le compte existe. 3, le résultat de l’envoi est gardé avec l’événement en attente ; l’avis le lit à chaque chargement, dessiné après un rechargement dans chaque cas ; OA1.10, onglet fermé pendant l’envoi. Suggestions appliquées : région annoncée pour l’avis, focus de « Réessayer », d’« Afficher les autres », de l’arrivée sur `/` et sur `/connexion`, langue du compte gardée et citée, phrase de l’e-mail de confirmation, mots d’`AdminPending.body`. Rattachement des autres événements en attente du même navigateur à la confirmation (OA2.9), limité à ce navigateur. Q3 : décision du coordinateur (commentaire 6394717528).
- v4 (2026-10-25) : revue de la v3 (changements demandés, 3 bloquants, tous sur OA2.9). Décision du coordinateur : OA2.9 est retiré, et passe hors périmètre avec sa raison ; chaque lien de confirmation ne rattache que son événement (décision 3, `LinkPage.confirm.body`, glossaire « Lien de confirmation » revenus à la règle d’un seul événement ; OA2.3 inchangé). Suggestions appliquées : « Aucun événement pour l’instant » est la cible du focus après « Réessayer » sur une liste vide (OA6.5) ; un envoi abandonné à 10 s peut encore arriver, donc `sendFailed` et `Login.failed` disent « n’a peut-être pas été envoyé » en FR et en EN, et l’avis de la limite par adresse prend son propre titre, « L’e-mail n’est pas parti ».
