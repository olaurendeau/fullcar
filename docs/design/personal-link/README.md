# Lien perso

- Artifact : https://claude.ai/artifact/KGLC6jZvd52gSpiXUdsTh3
- Epic : https://github.com/olaurendeau/fullcar/issues/67
- Page : `index.html` (autonome ; maquettes à 360 px ; QR codes dessinés, qui n'encodent rien ; 6 sections : où, la feuille, ouvrir, échecs, anglais, les mots)
- Version : v1.1 (revue de la v1 prise en compte ; **non republiée** : la republication attend la demande du propriétaire)
- Voisine : `event-board` v5.3 (la section « Vos inscriptions »). Cette page ne la remplace pas : elle y ajoute une phrase, un bouton et une feuille.

## Problème

Les inscriptions d'un appareil tiennent dans un jeton personnel gardé par un seul navigateur (`localStorage`, `fullcar:personal-token:{id}`). Qui change de téléphone, vide son navigateur ou se connecte ailleurs retrouve « Vos inscriptions » vide, et ne peut plus modifier ses personnes, qui restent comptées. Se connecter ne rend que l'espace organisateur. Aujourd'hui, il n'y a rien à faire : le « lien perso » (`/e/{id}/moi#{jeton}`) et son QR code, nommés dans `product.md` et le glossaire, ne sont pas construits.

## Périmètre de cette spécification

Reste de l'épic #67 : l'affichage du lien perso, son ouverture sur un autre appareil, « on garde les deux », le lien faux ou périmé, la mise en garde, `localStorage` indisponible.

- **Retirer une personne** : livré (#645, `remove-person`, PR #793, #852, #874). Écarté.
- **Fraîcheur de la page** : **pas livrée**, malgré le commentaire de l'épic. `product.md` (« Fraîcheur ») la décrit, mais aucun code ne la fait (ni `visibilitychange`, ni interrogation périodique). Elle n'est pas spécifiée ici : voir « Décisions ».
- **Rattacher les inscriptions à un compte** : abandonné par le propriétaire. Le lien perso reste la seule voie.

## Décisions (déjà prises par le propriétaire)

- **On garde les deux** : ouvert sur un appareil qui a déjà ses inscriptions, le lien s'y ajoute. L'appareil range plusieurs jetons pour un même événement.

## Histoires et critères

Chaque critère se prouve par un test (unitaire, composant ou Playwright). « Le jeton » est le jeton personnel ; « l'appareil » un navigateur.

### LP1. Trouver son lien perso
En tant que participant, je trouve mon lien perso là où je gère mes inscriptions.
- LP1.1 « Vos inscriptions » dépliée se termine **toujours** par la phrase de LP3.1 puis un bouton « Mon lien perso » (44 px de haut, pleine largeur), qui ouvre la feuille. Cela vaut pour chaque maquette de section dépliée (1.1, 3.2 à 3.5, 5.10).
- LP1.2 Repliée, la section n'affiche rien de plus que son titre et son résumé.
- LP1.3 Sans personne sur l'appareil (la section n'existe pas), pendant le chargement, ou si la lecture a échoué (mots existants de event-board), il n'y a ni phrase ni bouton (maquette 1.3).
- LP1.4 Un lien n'existe que pour un jeton rangé ; la feuille ne tire jamais de jeton nouveau.

### LP2. Le copier sur soi
- LP2.1 La feuille montre un QR code, « Copier le lien » et « Fermer ». Avec **un** lien, il n'y a pas de légende « Lien {i} sur {n} » : elle n'existe qu'à partir de 2 liens (LP5.3). Le QR code est produit dans le navigateur, sans service tiers. Nom accessible du QR code : `PersonalLink.sheet.qr` (1 lien), `PersonalLink.sheet.qrMany` (2 liens ou plus).
- LP2.2 « Copier le lien » met l'URL `/e/{id}/moi#{jeton}` complète dans le presse-papiers ; le bouton dit « Lien copié » 3 s, avec l'icône de validation, puis redit « Copier le lien ». La région d'état (invisible) annonce `PersonalLink.sheet.copied` (maquette 2.2, 2.5). Avec 2 liens, seul le bouton du lien copié change, et son nom accessible est `copyMany` / `copiedMany` (« Copier le lien 1 sur 2 », « Lien copié 1 sur 2 ») ; le texte visible reste « Copier le lien » / « Lien copié ».
- LP2.3 Si la copie est refusée, l'alerte `PersonalLink.sheet.copyFailed` s'affiche sous le bouton concerné ; le bouton ne change pas, le lien n'est pas affiché pour être recopié (maquette 2.3).
- LP2.4 *(retiré en v1.1)* Il n'y a pas de bouton « Envoyer le lien » : voir « Décisions », 2.
- LP2.5 Fermée, la feuille rend le focus à « Mon lien perso ». Échap et le geste « retour » la ferment, comme les autres feuilles (v4.7).
- LP2.6 La feuille ne dépasse jamais 90 % de la hauteur de l'écran ; son corps défile, l'en-tête et « Fermer » restent visibles (maquette 2.4 : deux liens sur 640 px, le corps de 736 px défile dans 475 px).

### LP3. La mise en garde, avant tout incident
- LP3.1 La section dit : « Pour retrouver ces inscriptions sur un autre appareil, gardez votre lien perso. Sans lui, elles ne peuvent pas être récupérées. » (`PersonalLink.section.hint`).
- LP3.2 Le formulaire d'une personne **et** celui d'une voiture disent où sera le lien, dès la première inscription, avant qu'elle existe : `PersonForm.remember` (change) et `RideForm.remember` (nouveau), au-dessus de « Valider » (maquettes 1.4 et 1.5).
- LP3.3 La feuille répète que, sans le lien, les inscriptions ne se récupèrent pas si l'on change d'appareil ou vide son navigateur (`intro`, `introMany`).

### LP4. Ouvrir le lien perso sur un autre appareil
- LP4.1 `/e/{id}/moi#{jeton}` lit le jeton dans le fragment, vérifie sa forme (22 caractères base64url canoniques), puis demande au serveur, dans le **corps** d'une requête, si une personne de l'événement le porte. Pas d'autre requête ni d'autre champ.
- LP4.2 Pendant la vérification : `PersonalLink.open.checking`. Rien n'est rangé avant une réponse « oui ».
- LP4.3 Sur « oui » : le jeton est rangé, la page mène à `/e/{id}` par `router.replace` (le fragment quitte la barre d'adresse et l'historique), « Vos inscriptions » montre les personnes du lien, et la barre dit `open.found` avec les prénoms.
- LP4.4 Ouvrir le lien ne demande aucun geste de confirmation (le fragment n'atteint aucun serveur : un scanner de liens ne l'use pas) et ne s'use pas : on peut le rouvrir.
- LP4.5 Les personnes du lien se modifient et se retirent depuis l'appareil d'arrivée, comme celles qu'on y a inscrites.

### LP5. On garde les deux
- LP5.1 Si l'appareil a déjà un jeton pour cet événement et que le lien en porte un autre, l'appareil garde **les deux**. « Vos inscriptions » montre toutes les personnes, sans distinguer leur jeton.
- LP5.2 La barre dit `open.added`.
- LP5.3 À partir de 2 jetons, la feuille s'intitule `titleMany`, son intro est `introMany` (« … ouvrez-les tous. Sans ces liens, … »), et elle montre **par jeton** : la légende `caption` (« Lien 1 sur 2 : Léa, Tom »), un QR code et « Copier le lien ». La légende « Scannez-le avec l'autre appareil. » n'est dite qu'avec un seul lien.
- LP5.4 Une nouvelle inscription faite sur l'appareil prend toujours le **premier** jeton rangé (le plus ancien), jamais un jeton ajouté par un lien.
- LP5.5 Un lien dont le jeton est déjà rangé n'est pas rangé deux fois : la barre dit `open.already`, sans erreur.
- LP5.6 Un jeton qui ne porte plus personne (personne retirée) n'a pas de ligne dans la feuille ; rouverte avec un seul jeton restant, la feuille redevient « Votre lien perso », sans légende (maquette 2.6). Sans aucune personne, la section n'existe plus (LP1.3).

### LP6. Lien faux, incomplet, périmé, injoignable
Aucun de ces cas ne range un jeton, et aucun ne montre le jeton.
- LP6.1 **Un seul écran** « Ce lien perso ne fonctionne pas » pour : pas de fragment, fragment mal formé (sans requête), jeton bien formé que personne ne porte (mauvais lien, personnes retirées, jeton d'un autre événement). Les causes ne se distinguent pas. Bouton « Voir l'événement ». (Remplace LP6.1 et LP6.2 de la v1.)
- LP6.2 Événement anonymisé : l'écran « Événement terminé » existant, inchangé (« Créer un événement » ; pas de « Voir l'événement », qui reboucle sur le même écran).
- LP6.3 Événement inconnu, mal recopié, ou supprimé : l'écran « Événement introuvable » existant, inchangé.
- LP6.4 Réseau ou serveur en échec : `open.network.*`, « Réessayer » relance la vérification avec le même fragment, « Voir l'événement » mène à `/e/{id}`.
- LP6.5 Sans JavaScript : `open.noscript.*`.
- LP6.6 Dans tous les cas **sauf LP6.4**, le fragment quitte la barre d'adresse et l'historique : la page remplace l'adresse par `/e/{id}/moi` (`router.replace`). Seul LP6.4 le garde, parce que « Réessayer » en a besoin. Les écrans LP6.1, LP6.4 et LP6.5 portent « Voir l'événement » (`/e/{id}`).

### LP7. `localStorage` indisponible
- LP7.1 La feuille « Votre lien perso » reste disponible (le jeton est en mémoire, D5) et commence par l'avis `PersonalLink.sheet.noStorage`, avant l'explication (maquette 2.7).
- LP7.2 Ouvrir un lien perso sans stockage garde le jeton en mémoire pour la page, comme une inscription le ferait ; la barre est une alerte qui ne se ferme pas seule, avec l'icône d'avertissement : `open.foundNoStorage` (maquette 3.5).
- LP7.3 Les avis de stockage de `PersonForm` et de `RideForm` gardent leur titre et reçoivent une dernière phrase renvoyant au lien perso : `PersonForm.storage.body`, `RideForm.storage.body` (maquette 1.6). Le lien n'existant qu'après la première inscription, la phrase dit « une fois l'inscription faite » / « une fois la voiture ajoutée ».

### LP8. Le jeton est un secret
- LP8.1 Le jeton n'est jamais dans le texte de la page, ni dans un champ, un attribut `href`, un message d'erreur ou un nom accessible ; il n'est ni journalisé ni mis dans une réponse du serveur. Test : le DOM de chaque écran de cette page, rendu avec un jeton connu, ne le contient pas.
- LP8.2 Il n'est que dans : le QR code, le presse-papiers (sur « Copier le lien »), le corps de la requête de LP4.1 et le stockage de l'appareil.
- LP8.3 La page `/e/{id}/moi` ne charge aucun script, image ni lien tiers, et n'a aucun lien sortant. `Referrer-Policy: no-referrer` s'y applique (déjà global).
- LP8.4 Observabilité : `src/observability/scrub.ts` connaît déjà le segment `moi` (`scrubUrl(personalUrl)` rend `/e/[id]/moi`, test existant). À ajouter : un test que la mesure d'audience (`analyticsBeforeSend`) ne laisse partir aucune vue de `/e/[id]/moi` (sa liste de routes ne l'a pas), et un test qui rend un rapport d'erreur levé depuis la page avec `location.hash` renseigné.
- LP8.5 La requête de LP4.1 : les journaux serveur ne contiennent ni le jeton ni le prénom des personnes trouvées.

### LP9. Les mots
- LP9.1 Tous les textes de « Les mots » (ci-dessous) existent en `fr` et en `en` dans `messages/*.json`, sous les clés données ; `keys.test.ts` et `epicene.test.ts` passent. Les prénoms sont séparés par « , ». Un écran ou un état qui n'est pas dans cette liste n'a pas de texte nouveau.

## Les mots

Clés des fichiers `messages/fr.json` et `messages/en.json`. `{…}` : paramètre. Espace de noms `PersonalLink` : nouveau. `PersonForm.*` : change un texte existant de `event-board` v5.3 ; `RideForm.remember` : nouveau. Les écrans « Événement terminé » et « Événement introuvable » gardent leurs mots existants. Les mêmes lignes sont dans la section 6 de `index.html`.

| Clé | fr | en | Où |
|---|---|---|---|
| `PersonalLink.section.hint` | Pour retrouver ces inscriptions sur un autre appareil, gardez votre lien perso. Sans lui, elles ne peuvent pas être récupérées. | To find these sign-ups on another device, keep your personal link. Without it, they cannot be recovered. | Section « Vos inscriptions » dépliée, avant le bouton |
| `PersonalLink.section.open` | Mon lien perso | My personal link | Bouton de la section |
| `PersonalLink.sheet.titleOne` | Votre lien perso | Your personal link | Titre de la feuille, 1 lien |
| `PersonalLink.sheet.titleMany` | Vos liens perso | Your personal links | Titre de la feuille, 2 liens ou plus |
| `PersonalLink.sheet.intro` | Ouvrez ce lien sur un autre appareil pour y retrouver vos inscriptions et les modifier. Sans lui, elles ne peuvent pas être récupérées si vous changez d’appareil ou videz votre navigateur. | Open this link on another device to find your sign-ups there and edit them. Without it, they cannot be recovered if you switch devices or clear your browser. | Feuille, 1 lien |
| `PersonalLink.sheet.introMany` | Cet appareil garde {n} liens perso, un par groupe d’inscriptions. Pour tout retrouver ailleurs, ouvrez-les tous. Sans ces liens, les inscriptions ne peuvent pas être récupérées si vous changez d’appareil ou videz votre navigateur. | This device keeps {n} personal links, one per group of sign-ups. To find everything elsewhere, open them all. Without these links, the sign-ups cannot be recovered if you switch devices or clear your browser. | Feuille, 2 liens ou plus |
| `PersonalLink.sheet.caption` | Lien {i} sur {n} : {names} | Link {i} of {n}: {names} | Légende au-dessus de chaque QR code, seulement à partir de 2 liens. Prénoms séparés par « , » |
| `PersonalLink.sheet.qr` | QR code de votre lien perso | Your personal link’s QR code | Nom accessible du QR code, 1 lien |
| `PersonalLink.sheet.qrMany` | QR code du lien perso {i} sur {n} | QR code of personal link {i} of {n} | Nom accessible du QR code, 2 liens ou plus |
| `PersonalLink.sheet.scan` | Scannez-le avec l’autre appareil. | Scan it with the other device. | Sous le QR code, avec un seul lien (absent à partir de 2 liens) |
| `PersonalLink.sheet.copy` | Copier le lien | Copy link | Bouton, état repos |
| `PersonalLink.sheet.copied` | Lien copié | Link copied | Bouton pendant 3 s ; texte de la région d’état |
| `PersonalLink.sheet.copyMany` | Copier le lien {i} sur {n} | Copy link {i} of {n} | Nom accessible du bouton, 2 liens ou plus (le texte visible reste « Copier le lien ») |
| `PersonalLink.sheet.copiedMany` | Lien copié {i} sur {n} | Link {i} of {n} copied | Nom accessible et région d’état après la copie, 2 liens ou plus (texte visible : « Lien copié ») |
| `PersonalLink.sheet.copyFailed` | La copie a échoué. Scannez le QR code avec l’autre appareil. | Copying failed. Scan the QR code with the other device. | Alerte sous le bouton concerné |
| `PersonalLink.sheet.warning` | Toute personne qui ouvre ce lien peut modifier ces inscriptions : gardez-le pour vous. | Anyone who opens this link can edit these sign-ups: keep it to yourself. | Pied de la feuille, avec 1 lien comme avec plusieurs |
| `PersonalLink.sheet.noStorage` | Votre navigateur bloque le stockage : ce lien est le seul moyen de retrouver ces inscriptions après la fermeture de la page. Copiez-le maintenant. | Your browser blocks storage: this link is the only way to find these sign-ups after the page is closed. Copy it now. | Avis en tête de feuille, stockage indisponible |
| `PersonalLink.sheet.close` | Fermer | Close | Bouton |
| `PersonalLink.open.checking` | Vérification de votre lien perso… | Checking your personal link… | Écran d’ouverture, région d’état |
| `PersonalLink.open.found` | Inscriptions retrouvées sur cet appareil : {names}. | Sign-ups found on this device: {names}. | Barre, appareil sans jeton pour cet événement |
| `PersonalLink.open.added` | Inscriptions ajoutées à celles de cet appareil : {names}. | Sign-ups added to this device’s: {names}. | Barre, on garde les deux |
| `PersonalLink.open.already` | Ces inscriptions sont déjà sur cet appareil. | These sign-ups are already on this device. | Barre, jeton déjà rangé |
| `PersonalLink.open.foundNoStorage` | Inscriptions retrouvées, mais cet appareil ne pourra pas s’en souvenir : votre navigateur bloque le stockage. Après la fermeture de la page, rouvrez votre lien perso. | Sign-ups found, but this device will not remember them: your browser blocks storage. After the page is closed, open your personal link again. | Barre-alerte (ne se ferme pas seule), icône d’avertissement |
| `PersonalLink.open.broken.title` | Ce lien perso ne fonctionne pas | This personal link does not work | Titre : lien incomplet OU aucune inscription ne correspond |
| `PersonalLink.open.broken.body` | Il est incomplet, les personnes qu’il ouvrait ont été retirées de l’événement, ou il vient d’un autre événement. Demandez-le de nouveau à l’appareil qui l’a affiché (« Mon lien perso », dans « Vos inscriptions »), ou scannez son QR code. | It is incomplete, the people it opened were removed from the event, or it comes from another event. Ask for it again from the device that showed it (“My personal link”, in “Your sign-ups”), or scan its QR code. | Corps, sans distinguer les causes |
| `PersonalLink.open.network.title` | Lien perso non vérifié | Personal link not checked | Titre, réseau ou serveur en échec |
| `PersonalLink.open.network.body` | La connexion a échoué. Rien n’a été enregistré sur cet appareil. Vérifiez la connexion, puis réessayez. | The connection failed. Nothing was saved on this device. Check your connection, then try again. | Corps |
| `PersonalLink.open.retry` | Réessayer | Try again | Bouton, relance avec le même fragment |
| `PersonalLink.open.noscript.title` | Lien perso | Personal link | Titre, sans JavaScript |
| `PersonalLink.open.noscript.body` | Activez JavaScript pour ouvrir votre lien perso. | Turn on JavaScript to open your personal link. | Corps |
| `PersonalLink.open.seeEvent` | Voir l’événement | See the event | Bouton, vers /e/{id} (écrans « ne fonctionne pas », « non vérifié », « sans JavaScript ») |
| `PersonForm.remember` | Sans compte ni e-mail : cet appareil s’en souviendra pour cet événement. Pour les retrouver sur un autre appareil, gardez ensuite votre lien perso : il sera dans « Vos inscriptions ». | No account, no e-mail: this device will remember it for this event. To find them on another device, keep your personal link afterwards: it will be in “Your sign-ups”. | CHANGE le texte existant (event-board v5.3). Au-dessus de « Valider » |
| `RideForm.remember` | Sans compte ni e-mail : cet appareil s’en souviendra pour cet événement. Pour retrouver cette voiture sur un autre appareil, gardez ensuite votre lien perso : il sera dans « Vos inscriptions ». | No account, no e-mail: this device will remember it for this event. To find this car on another device, keep your personal link afterwards: it will be in “Your sign-ups”. | NOUVEAU. Au-dessus de « Valider », même place que PersonForm.remember |
| `PersonForm.storage.body` | Votre navigateur bloque le stockage : après la fermeture de la page, ces inscriptions ne pourront plus être modifiées depuis cet appareil. Une fois l’inscription faite, copiez votre lien perso (dans « Vos inscriptions ») pour les retrouver. | Your browser blocks storage: once this page is closed, these sign-ups can no longer be changed from this device. Once you have signed up, copy your personal link (in “Your sign-ups”) to find them again. | CHANGE le corps existant ; le titre « Cet appareil ne pourra pas s’en souvenir » ne change pas |
| `RideForm.storage.body` | Votre navigateur bloque le stockage : après la fermeture de la page, cette voiture et la personne qui conduit ne pourront plus être modifiées depuis cet appareil. Une fois la voiture ajoutée, copiez votre lien perso (dans « Vos inscriptions ») pour la retrouver. | Your browser blocks storage: once this page is closed, this car and its driver can no longer be changed from this device. Once the car is added, copy your personal link (in “Your sign-ups”) to find it again. | CHANGE le corps existant ; le titre ne change pas |

## Hors périmètre

- Rattacher les inscriptions à un compte, les envoyer par e-mail ou SMS depuis l'application (hors périmètre V1).
- Un lien perso **par personne**, ou révoquer un lien : il n'y a pas de révocation. Une personne retirée ne rend plus rien avec son lien.
- Regrouper deux jetons en un seul (« fusionner »).
- Un lien perso pour l'organisateur : il se connecte (voir `organizer-account`).
- La fraîcheur de la page (voir « Décisions »).
- La PWA, l'impression du QR code, le téléchargement du QR code en image.

## États couverts par la page

Section dépliée / repliée ; sans personne, chargement, échec de la lecture (1.3) ; formulaire d'une personne et d'une voiture avant inscription (1.4, 1.5) et avec stockage bloqué (1.6) ; feuille à un lien, copié, copie refusée, à deux liens (défilement), copié à deux liens, après retrait, sans stockage (2.1 à 2.7) ; vérification, retrouvées (appareil neuf, on garde les deux, déjà là, sans stockage) (3.1 à 3.5) ; lien qui ne fonctionne pas, événement terminé, introuvable, réseau, sans JavaScript (4.1 à 4.5) ; en anglais : feuille à un et deux liens, copié / refusé, stockage, vérification, les quatre barres, échecs, section et formulaire (5.1 à 5.10). Vérifié en rendu à 360 px : aucun débordement horizontal ; la feuille à deux liens plafonne à 576 px (90 % de 640) et son corps défile.

## Pour l'architecte (conséquences à trancher, non décidées ici)

- **Stockage de plusieurs jetons** : décision du propriétaire prise. La clé `fullcar:personal-token:{id}` reste le jeton propre de l'appareil ; les jetons ajoutés vont dans une seconde clé, par événement. Ce choix, la borne à ne pas dépasser (le corps de la lecture porte une liste de jetons ; la borner côté serveur) et la mise à jour de `architecture.md` (« Jetons ») sont à lui. Zone sensible : mergée par l'humain.
- La lecture des personnes de l'appareil doit passer de un à plusieurs jetons et rendre pour chaque personne le rang de son jeton (pour LP5.3), sans autre donnée.
- La vérification de LP4.1 : une réponse `ended` / `none` / `found` avec les prénoms ; jamais le jeton, jamais de numéro.

## Décisions

1. **Qui n'est pas tranché** (voir le rapport) : la dépendance pour le QR code, et la fraîcheur.
2. **Pas de « Envoyer le lien » (Web Share)** (v1.1) — Raison : la copie plus le QR code suffisent (coller le lien dans ses notes ou une messagerie, ou scanner depuis le nouvel appareil), et le bouton ajoutait une branche (navigateur sans partage), un message d'échec et un nom de plus. Retirer ce bouton est la simplification demandée par le propriétaire ; si l'on veut le réintroduire, c'est un ajout isolé (LP2.4 de la v1). Un e-mail ou un SMS de l'application reste hors périmètre V1.
3. **Pas de lien affiché à recopier** : un texte lisible est un jeton qu'on capture à l'écran, qu'une synchronisation de lecteur d'écran lit à voix haute. Le QR code couvre le cas.
4. **Pas de confirmation à l'ouverture** : contrairement au lien de connexion, ouvrir ce lien ne crée pas de session ; c'est une lecture, puis un rangement local.
5. **Un lien « trop bon marché »** : la feuille dit que toute personne qui l'ouvre peut modifier les inscriptions (LP8, glossaire « Jeton personnel »).

## Révisions

- v1 (2026-11-05) : première version, publiée.
- v1.1 (2026-11-05), non republiée, revue de design (demande de modifications) :
  - bloquants : la légende `('',)` (un tuple Python fuité) est supprimée, la légende « Lien i sur n » n'existe qu'à partir de 2 liens ; ajout de la section « Les mots » au README, avec les clés ; maquettes anglaises pour tous les états (5.1 à 5.10) ; formulaire de voiture dessiné (1.5) et avis de stockage des deux formulaires (1.6) ; LP1.1 tranché : la phrase est toujours dans la section dépliée, les maquettes 3.2 à 3.5 la montrent ; « Lien copié » dessiné (2.2) ; états sans maquette ajoutés : section sans personne, chargement, échec (1.3), feuille après retrait (2.6) ; le cas « sans Web Share » et l'échec d'envoi disparaissent avec le bouton.
  - suggestions : « Envoyer le lien » retiré (LP2.4) ; LP6.1 et LP6.2 fusionnés en « Ce lien perso ne fonctionne pas » (les LP6.3 à LP6.7 de la v1 deviennent LP6.2 à LP6.6) ; « Sans lui » devient « Sans ces liens » avec plusieurs liens ; « Lien 1 sur 2 » dans le nom accessible de chaque QR code et bouton ; icône d'avertissement en 3.5 ; « Voir l'événement » retiré de « Événement terminé » ; adresse remplacée par `/e/{id}/moi` dans tous les cas sauf le réseau (LP6.6) ; la feuille défile au-delà de 90 % de la hauteur (LP2.6).
  - ajouté par le designer : `RideForm.remember` ; le texte de stockage des formulaires dit « une fois l'inscription faite », car le lien n'existe qu'après la première inscription (LP1.4).
