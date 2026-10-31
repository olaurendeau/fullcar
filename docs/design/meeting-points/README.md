# Points de RDV à l’aller

- Artifact : https://claude.ai/artifact/PCinu9DcFBdAHrhjfaZyCk
- Issue : https://github.com/olaurendeau/fullcar/issues/881 (voir aussi l’épic #68, « Les options à l’écran », dont les Arrêts sont la part non faite)
- Page : `index.html` (autonome, maquettes à 360 px, clair)
- Version : v2.2

## Problème

À l’aller, on n’a pas tout le monde sous la main pour s’organiser. Un conducteur qui passe par plusieurs villages (Champcella 08:00, Prelles 08:25, Briançon 08:35, Monétier 08:50) ne peut dire qu’un seul lieu ; il écrit le reste dans la note, et chaque passager doit lui demander où et quand monter. Les passagers sans voiture ne voient pas non plus sur la carte quelles voitures passent près d’eux.

## Ce qui existe

`event.stops_enabled` (option « Points de RDV », absente de l’écran si désactivée) ; glossaire : **Arrêt** (`Stop`), lieu + heure, ordonnés ; `placement.stop_id` (SET NULL) prévu par #68 ; le lieu d’une voiture est un `PlaceField` (texte libre, position `lat/lng` facultative, #237 livré) ; la carte (`event-map`) dessine voitures et drapeau, et compte `notOnMap` ; le jour 30 supprime Placements, Rides, Persons (`anonymiseEvent`) ou l’événement (`deleteEvent`). Aucune table `stop` n’est créée.

## Décisions (le propriétaire, #881)

Aller seulement ; sur la carte ; choix du point en prenant la place, modifiable ensuite ; effacés au jour 30 ; aucun numéro ni donnée de plus.

## Décisions de la maquette

D1 à D3 et les règles sont en tête de `index.html`. Tranchées par le propriétaire (#881) : **D1** (l’option s’active aussi dans « Modifier l’événement », jamais désactivable tant que des points existent), **D2** (sur une voiture avec points, le tap ouvre toujours la feuille ; sans point, tap unique), **D3** (« Points de RDV » à l’écran, `Stop`/Arrêt dans le code).

**À faire dans la tâche (cases à cocher)** : [ ] amender `docs/agents/product.md`, « Arrêts » (D2 : le tap ouvre la feuille sur une voiture à Arrêts, départ coché ; le geste reste unique sans Arrêt) ; [ ] y ajouter D1 (activable dans Modifier l’événement, jamais désactivable tant que des Arrêts existent). Chemin protégé : le propriétaire fusionne.

## Histoires et critères

**Conducteur** : en tant que conductrice de l’aller, j’ajoute à ma voiture des points de RDV avec une heure, pour que mes passagers sachent où monter.
**Passager** : en prenant une place, je choisis où je monte ; je peux le changer ensuite.
**Autres participants** : je vois les points d’une voiture sur sa fiche et sur la carte, pour choisir celle qui passe près de moi.
**Organisateur** : je vois les points sur la carte ; rien d’autre à faire que l’option ; tout part au jour 30.

### RV1, le formulaire (aller, option active)
- RV1.1 Dans « Proposer une voiture » et « Modifier la voiture » de l’aller, la section « Points de RDV » est présente avec « Ajouter un point de RDV » ; sur le retour, ou option désactivée, elle est absente du DOM.
- RV1.2 « Ajouter » ajoute une ligne vide (lieu, heure) et lui donne le focus dans « Lieu du point n » ; à 6 points le bouton est remplacé par « 6 points au maximum. ».
- RV1.3 Le lieu d’un point est un `PlaceField` (même comportement que le lieu de départ) ; sans proposition choisie, le texte est gardé sans position.
- RV1.4 Lieu requis (« Champ requis. »), 1 à 120 caractères ; heure requise (« Heure non valide. ») et strictement après l’heure de départ (« L’heure doit être après 08:00, l’heure de départ. ») ; une erreur empêche l’envoi et la première ligne en erreur prend le focus.
- RV1.5 En quittant le champ heure, les lignes sont classées par heure (égalité : ordre de saisie) et `status` dit « Points classés par heure. » seulement si l’ordre a changé ; une voiture enregistrée relit ses points dans cet ordre.
- RV1.6 « Retirer » enlève la ligne sans rien supprimer avant « Valider » ; le focus va au « Retirer » précédent, sinon à « Ajouter ».
- RV1.7 Le formulaire sans point enregistre une voiture sans point, comme aujourd’hui.
- RV1.8 Un point dont le lieu a une position affiche « Position enregistrée » et un bouton « Retirer » (nom : « Retirer la position du point {n} », cible de 44 px) ; « Retirer » efface la position, garde le texte, et le point n’est plus sur la carte.
- RV1.9 (`stopsOff`) Une voiture envoyée avec des points alors que l’option vient d’être désactivée est refusée, rien n’est écrit, aucun point n’est supprimé ; le formulaire reste ouvert avec sa saisie, dit dans un `role="alert"` « L’option « Points de RDV » vient d’être désactivée : votre voiture n’a pas été enregistrée. Rechargez la page, puis réessayez. » (`RideForm.stops.off`), et le focus va à « Valider ».
- RV1.10 (`afterStop`) Une heure de départ déplacée à l’heure d’un point enregistré ou après, par une page qui n’envoie pas ses points, est refusée, rien n’est écrit ; l’erreur est sur le champ « Heure de départ » (`aria-invalid="true"`, focus) : « L’heure doit être avant {heure}, l’heure du premier point de RDV. » (`RideForm.stops.afterStop`, `{heure}` = l’heure du premier point enregistré, ex. « 08:25 »), sans toucher aux points.

### RV9, l’option dans « Modifier l’événement » (D1)
- RV9.1 La feuille « Modifier l’événement » montre une case « Points de RDV » avec son aide, reflétant l’état enregistré ; option désactivée : la cocher puis « Valider » l’active, et la section « Points de RDV » apparaît dans les formulaires de voiture de l’aller ; aucune donnée existante n’est touchée.
- RV9.2 Option activée, aucun point (aucune voiture n’en a) : la case est modifiable ; la décocher puis « Valider » désactive l’option et supprime la section, sans rien supprimer.
- RV9.3 Option activée, au moins un point existe : la case reste cochée et verrouillée (`aria-disabled="true"`, jamais `disabled`, focusable, `aria-describedby` vers la raison visible, un pluriel (`EditEvent.stops.locked`) : « 1 voiture a des points de RDV : l’option reste active tant qu’ils existent. » ou « {n} voitures ont des points de RDV : l’option reste active tant qu’ils existent. ») ; la toucher ne change rien ; le serveur refuse aussi la désactivation, même envoyée par un appareil (course), et répond avec « L’option « Points de RDV » reste active : des voitures ont des points de RDV. » ; aucun point n’est supprimé.
- RV9.4 Échec de « Valider » : dans la feuille ouverte, « Action impossible, vérifiez la connexion » (mots actuels) ; feuille fermée avant la réponse, la barre dit « L’option « Points de RDV » n’a pas été modifiée. » suivi de la raison de `Actions.why.*` (hors ligne : « Vérifiez la connexion, puis réessayez. »). L’option affichée est l’option enregistrée.
- RV9.5 L’accès au formulaire est celui de « Modifier l’événement » actuel (jeton organisateur) ; aucune donnée de plus.

### RV2, la fiche
- RV2.1 Une voiture à points montre, sous son lieu, la liste « Points de RDV » : heure + lieu, par heure ; sans point, aucune liste ni titre.
- RV2.2 Un passager d’un point porte « monte à {lieu} » ; au départ, rien, sauf sur les personnes de l’appareil (RV4.1).
- RV2.3 Les lieux longs passent à la ligne, aucun défilement horizontal.

### RV3, prendre une place
- RV3.1 Sur une voiture sans point, le tap sur une place libre garde exactement le comportement actuel (un tap, ou la feuille).
- RV3.2 Sur une voiture avec points, le tap ouvre toujours la feuille « Qui monte… », avec le groupe « Point de montée » : le départ coché, puis chaque point avec son heure.
- RV3.3 « Placer » crée les Placements de toutes les personnes cochées avec le point choisi (ou sans, pour le départ), en une écriture ; la barre dit « {prénom} est dans la voiture de {conducteur} » et « Annuler » rend la place comme avant.
- RV3.4 Si le point a disparu avant l’envoi, les personnes sont placées au départ, la feuille se ferme et la barre dit « Ce point n’existe plus : {prénom} monte au lieu de départ. » ; aucun refus, aucune place perdue.
- RV3.5 Les refus actuels gardent leurs mots, avec ou sans point choisi, sans le mentionner : `Actions.notDone.seats` + `Actions.why.seatTaken`, `rideGone` (« Cette voiture n’est plus proposée. »), `notEnoughSeats`, `alreadyInCar`, `forbidden`, `eventNotFound`.
- RV3.6 Échec de « Placer » (hors ligne, 500) : feuille ouverte, elle reste ouverte avec le choix de point et les cases gardés, et dit « Action impossible, vérifiez la connexion » ; le focus va à « Placer » ; rien n’est écrit. Feuille fermée avant la réponse : la barre dit « {prénom} n’a pas pu monter dans la voiture de {conducteur}. Vérifiez la connexion, puis réessayez. » (`why.offline`, ou `why.failed` : « Une erreur est survenue : réessayez dans un instant. »), sans nommer le point.

### RV4, changer
- RV4.1 Sur une voiture à points, chaque passager de l’appareil a « Changer le point » (nom : « Changer le point de montée de {prénom} ») et « monte au départ » ou « monte à {lieu} » ; les autres passagers n’ont pas le bouton.
- RV4.2 La feuille « Où monte {prénom} ? » coche le choix actuel ; « Valider » l’enregistre, la barre dit « {prénom} monte à {lieu} » (ou « …au lieu de départ ») avec « Annuler » ; choisir le même point ferme sans écrire.
- RV4.3 Échec : feuille ouverte, elle garde le choix et dit « Action impossible, vérifiez la connexion », focus sur « Valider » ; feuille fermée, la barre dit « Le point de {prénom} n’a pas été changé. » + `why.offline` / `why.failed` / `why.rideGone` ; la fiche garde l’ancien point ; point disparu : mots de RV3.4.
- RV4.4 Changer de point ne change ni la place ni la couverture.

### RV5, la carte
- RV5.1 Seulement sur la carte de l’aller : un rond et une étiquette « heure + prénom » par point **avec position** ; nom accessible « Point de RDV de {conducteur} : {lieu}, {heure} ».
- RV5.2 Le trait de la voiture passe par ses points, dans l’ordre de l’heure, jusqu’au drapeau.
- RV5.3 Un point sans position, ou d’une voiture sans position, n’est pas dessiné et compte dans « {n} point(s) de RDV n’est/ne sont pas sur la carte… ».
- RV5.4 La bulle d’un point a pour titre « {lieu}, {heure} » et un bouton par voiture qui l’ouvre (comme une bulle de voiture) ; les points de voitures différentes à moins de 25 m l’un de l’autre partagent un seul rond (RV5.6), mais ne sont jamais regroupés avec une voiture ni avec le drapeau ; l’ordre de survol et de focus de event-map (CA1.23) vaut pour eux.
- RV5.5 Une position ajoutée ou retirée sur un point se voit à l’actualisation suivante, sans recharger.
- RV5.6 Les points de plusieurs voitures à moins de 25 m l’un de l’autre forment un seul rond, avec une bulle de titre « {n} voitures » (lieu et heure dessous) et une ligne-bouton « Voiture de {conducteur} · {n} place(s) libre(s) » par voiture, suivie de « · {lieu}, {heure} » (`EventMap.stopLineAt`) quand le lieu ou l’heure de cette voiture diffère de ceux du titre ; l’étiquette du rond (« {heure} · {n} voitures ») et son nom accessible ne montrent que la première voiture ; ce rond n’est jamais regroupé avec une voiture ni avec le drapeau.
- RV5.7 Si aucun point n’a de position, la carte se dessine comme avant, sans rond de point, et dit « {n} points de RDV ne sont pas sur la carte : leurs lieux n’ont pas de position. ».

### RV6, point retiré
- RV6.1 Retirer un point dont {n} personnes ont fait leur point de montée affiche, avant « Valider », « {n} personne(s) monte(nt) ici : … au lieu de départ » ; après « Valider », ces personnes sont au départ, toujours dans la voiture, et la page dit « Personne n’est prévenu : pensez à le leur dire. ».
- RV6.2 Changer le lieu ou l’heure d’un point garde ses passagers ; l’heure reste après le départ (RV1.4) ; retirer la voiture retire ses points.
- RV6.3 Moins de points au total qu’avant : la voiture ne perd ni passager ni place.

### RV7, 360 px
- RV7.1 À 360 px, avec 6 points aux lieux de 120 caractères et 3 passagers, formulaire, fiche, feuilles et bulle n’ont aucun débordement horizontal ; chaque cible mesure 44 px au moins.
- RV7.2 Le groupe de choix est une liste radio au clavier (flèches, Espace) ; le focus entre dans la feuille sur le choix coché, qui porte un anneau visible de 2 px.
- RV7.3 Contraste : un texte de 12 à 13 px sur fond gris ou teinté (lignes de passagers, choix coché, raison de l’option verrouillée) mesure au moins 4,5:1. Vérifié sur les jetons réels : `--muted-foreground` (#737373) fait 4,35:1 sur `--muted` (#f5f5f5), donc la maquette y prend #595959 (6,4:1) ; les jetons ne changent pas.

### RV8, jour 30 et stockage
- RV8.1 Après le jour 30, `purgeDayThirty` sur un événement avec compte (anonymisé) ou sans (supprimé) ne laisse aucun point ni choix de point ; la page « Inscriptions effacées » est inchangée.
- RV8.2 Un point stocke lieu, heure, position facultative et sa voiture ; une inscription stocke le point choisi ; aucun numéro, aucune autre donnée de personne.
- RV8.3 Les points d’un événement dont l’option est désactivée ne sont ni lus ni écrits ; une action sur un point d’un événement terminé est refusée comme les autres actions.

### Limites sans critère prouvable
« La liste se lit facilement » : non couvert ; seul RV7.1 le remplace.

## Hors périmètre

Retour ; arrivée estimée par point, itinéraire ; capacité ou compte par point ; notification ; changement de l’auto-complétion ; regroupement de points avec une voiture ou avec le drapeau ; téléphone ou donnée de plus ; désactiver l’option avec des points existants (refusé, RV9.3) ; l’organisateur qui retire les points d’un conducteur.

## Révisions

- v1 : première version (epic #881).
- v2 : D1 à D3 tranchées par le propriétaire. Ajoutés : « Modifier l’événement » (option désactivée, activée sans point, verrouillée avec ses mots et son état accessible, échec ; RV9) ; clés FR/EN de l’option, de la raison, de l’échec, de « Position enregistrée · Retirer », de la bulle « 2 voitures » ; états d’échec de « Placer » et de « Valider » avec les refus réutilisés nommés (RV3.5, RV3.6, RV4.3) ; anneau de focus, carte sans aucune position, contraste #737373 sur #f5f5f5 vérifié (4,35:1, RV7.3), amendement de `product.md` en cases à cocher.
- v2.1 : trois corrections de #894 reprises (RV5.6 scindé en RV5.6 et RV5.7 ; pluriel ICU de `EditEvent.stops.locked` dans RV9.3 ; hors-périmètre « regroupement de points avec une voiture ou avec le drapeau »). Q2 confirmée (#881) : les points de voitures différentes à moins de 25 m partagent un rond (« 2 voitures »), jamais regroupés avec une voiture ni avec le drapeau (RV5.4, RV5.6) ; `index.html` corrigé (note de la bulle, hors-périmètre) pour ne plus la contredire. Q1 : mots de `stopsOff` et `afterStop` (RV1.9, RV1.10, `RideForm.stops.off`, `RideForm.stops.afterStop`).
- v2.2 (#918) : Q1 : l’heure et le lieu d’une autre voiture d’un rond partagé sont dans la ligne-bouton de la bulle, seulement quand ils diffèrent du titre (RV5.6) ; rien de plus sur la carte. Q2 : au repos, un Arrêt est sur une couche positive sous la couche survolée ou focalisée (`z-1!`, RV5.4) : il peut couvrir une partie d’une étiquette de voiture, jamais l’inverse au repos ; un Arrêt n’est plus entièrement caché au premier affichage.
