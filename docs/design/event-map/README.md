# Carte de l'événement

- Artifact : https://claude.ai/artifact/DjdkT16tMW6UqwPmLbxvHD
- Issue : https://github.com/olaurendeau/fullcar/issues/238 (dépend de #237, maquette `place-autocomplete` v5)
- Page : `index.html` (autonome ; maquettes à 360 px de large, et un navigateur de 1280 px à taille réelle)
- Version : v11 (v10 approuvée ; corrections de texte : « (à vérifier) » retiré, « octet pour octet » dans la note des tests ; v10 : revue de la v9 : coût à l'étranger aligné sur la page, correspondance sur l'attribut `exceptionCode`, 400/403/429 dans « Des tuiles en échec » ; v9 : correction de texte : couverture à l'étranger répondue par #473 ; v8 : décision du coordinateur sur #238 après le relevé de #473 : tuiles absentes en 404 `Not Found` ; v7 : v6 approuvée ; corrections de texte : décision sur les Arrêts dans la liste, « points de RDV » en minuscules ; v6 : section « Plus tard : les Arrêts » ; v5 : corrections de texte notées sur #238 ; v4 : quatre corrections ; v3 : re-revue de la v2 ; v2 : revue de la v1 et décision du propriétaire sur les lieux de voiture)

## Décisions du propriétaire (2026-10-23)

- **D1** : la carte sort du hors-périmètre V1 ; `product.md` est amendé dans la première PR de #238 (mergée par l'humain).
- **D5** : le point exact, voitures comprises : pas de plafond de zoom, pas de centre de commune.
- **D7** : de vraies tuiles, par une route de notre origine en cache au CDN de Vercel, avec Leaflet (dépendance nouvelle, accord de l'humain à la PR).
- **D8** : une ligne droite.
- **D9** : « Carte » pour la carte, « fiche » pour la fiche d'une voiture (PR de documentation, mergée par l'humain).
- **Lieux de voiture (#237 v3)** : toute modification du texte d'un lieu de voiture retire sa position. Une voiture sur la carte est donc exactement là où son texte le dit.
- **Arrêts** : Décision : les Arrêts (points de RDV) ne sont pas dans cette maquette ; ils viendront avec l'epic [#68](https://github.com/olaurendeau/fullcar/issues/68). — Raison : faire avancer la carte sans attendre [#68](https://github.com/olaurendeau/fullcar/issues/68).

## Décision du coordinateur (revue de la v1)

La carte se met à jour quand la page applique un nouvel état : la réponse d'une action, ou « Actualiser » sur `/e/{id}/admin`. Il n'y a pas de rafraîchissement automatique sur main (#67).

## Ce que la page montre

Dans chaque leg (et dans la section unique d'un événement sans retour), entre les actions et la première fiche, un `<button aria-expanded aria-controls>` au libellé fixe « Carte » (le chevron dit l'état), masqué sans JavaScript (`noscript:hidden`), puis la carte dans un conteneur `hidden`. Ouverte : le drapeau de l'événement (une image nommée, pas un bouton), un point par voiture de ce leg qui a une position (départ à l'aller, dépose au retour), une ligne droite vers l'événement, et sous la carte le nombre de voitures qui n'y sont pas, plus, au toucher, la phrase « deux doigts ». Chaque point de voiture est un vrai `<button>` (Entrée et Espace) qui mène à la fiche de sa voiture. Des voitures à moins de 25 m l'une de l'autre forment un seul point ; une voiture à moins de 25 m du drapeau n'a pas de ligne. Sous la carte, dans cet ordre : l'avis de tuiles, `notOnMap` (absent à 0), la phrase « deux doigts ». Hauteur : 240 px, 280 px à partir d'une fenêtre de 448 px.

## États couverts

Replié ; ouvert (aller, au toucher) ; événement sans retour ; un point au clavier puis sa fiche ; deux voitures au même point (bulle avec « Fermer ») ; l'onglet Retour (démarré à l'affichage) ; le chargement ; beaucoup de voitures autour d'un village ; une voiture au lieu de l'événement ; un prénom de 40 caractères et deux « Claire » ; un leg vide (`EmptyLeg`) ; des voitures sans position ; l'événement sans position (participant, et organisateur avec son bouton « Modifier l'événement ») ; des tuiles en échec ; Leaflet en échec à 360 px ; sans JavaScript ; un événement hors de France ; le retour supprimé, la carte ouverte ; en anglais ; à 1280 px. Plus une table « Mises à jour et focus ».

## Les tuiles

- **Source** : Plan IGN v2, WMTS public de la Géoplateforme (`GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2`, grille `PM_0_19`, celle que la couche déclare, style `normal`, PNG), URL amont dans `IGN_WMTS_URL`. Sans clé, sans compte, « non soumis à limite d'usage ». Licence Ouverte / Etalab 2.0 par défaut selon les CGU : redistribution permise avec la mention de la source et de la date de dernière mise à jour, donc un proxy avec cache.
- **Attribution** : « Leaflet | Source : IGN – Plan IGN v2, {mois année} », en texte sans lien ; la date vient d'une constante (`PLAN_IGN_UPDATED`), aujourd'hui `"2026-10"` (révision du 2026-10-08 de la fiche `IGNF_PLAN-IGN`, mise à jour mensuelle) ; un test Vitest échoue quand elle a plus de 12 mois (CA3.4).
- **Écartées** : tile.openstreetmap.org, Thunderforest, Stadia Maps, MapTiler, OpenFreeMap, Geoapify et CARTO (raisons dans la page).
- **Route** `/tuiles/{z}/{x}/{y}` : entiers validés, sinon 404 sans appel. Une tuile : 200, `CDN-Cache-Control: public, s-maxage=2592000`. Une tuile qui n'existe pas, **et seulement** un 404 : le vrai service répond ainsi à toute tuile absente (hors de la couche, hors de la grille, au-delà du zoom 19, à l'étranger), avec un rapport d'exception OWS dont l'`Exception` porte `exceptionCode="Not Found"` (relevé de #473 sur #238, où figure le corps exact). La route lit l'attribut `exceptionCode` d'un élément `Exception` OWS (dans un `ExceptionReport` d'espace de noms `http://www.opengis.net/ows/1.1`), sans comparer le corps comme une chaîne. Réponse : **200 avec un PNG transparent de 256 × 256** ; avec ce rapport, en cache un jour (`Cache-Control: public, max-age=86400` et `CDN-Cache-Control: public, s-maxage=86400`) ; sans ce rapport (une `IGN_WMTS_URL` fausse), `no-store` (décision du coordinateur sur #238). Tout le reste est un échec, 403 et 429 compris (l'IGN qui bloquerait les IP de Vercel), ainsi que tout 400 (dont `InvalidParameterValue`, une couche inconnue ou retirée), un 5xx, le réseau, 5 s : 502 `no-store`, seule réponse qui déclenche `tileerror`.
- **Qui voit quoi** : l'IGN voit l'IP de Vercel et les tuiles qui ne sont pas dans le cache ; tout le trafic part des quelques IP de Vercel (une limite par IP toucherait tout le monde) ; le navigateur ne parle qu'à notre origine.
- **Tests** : un faux IGN dans `compose.yaml` (PR mergée par l'humain), réglé sur son port de contrôle (404 avec le corps réel relevé par #473, rendu octet pour octet, 404 sans, 400 `InvalidParameterValue`, 403, 429, 500, lenteur) ; Vitest pour la traduction : 404 `Not Found` → PNG vide en cache un jour, autre 404 → PNG vide en `no-store` ; tout 400, 403, 429, 5xx → 502.

## Mises à jour et focus

| ce qui change | la carte | le focus, s'il était dans ce qui change |
|---|---|---|
| voiture ajoutée, ou position ajoutée | un point de plus, à sa place dans l'ordre des fiches ; recadrage seulement si la carte n'a pas été touchée | — |
| voiture retirée, ou position retirée | son point disparaît | au conteneur de la carte |
| la position d'une voiture change | le point se déplace (même élément) | reste |
| regroupement ou séparation | points recréés | au point qui contient cette voiture |
| bulle ouverte, sa liste change | la bulle se ferme | au point à cette position, sinon au conteneur |
| places libres | le nom change | reste |
| position de l'événement retirée | carte et bouton disparaissent ; phrase de l'organisateur sur `/admin` | `focusLandmark` |
| position de l'événement ajoutée | bouton, replié | sur `/admin`, après « Valider » depuis la phrase : « Carte » de ce leg |
| position de l'événement change | drapeau et lignes se déplacent ; recadrage si la carte n'a pas été touchée | reste |
| feuille ouverte depuis la phrase de l'organisateur, fermée | — | au bouton de la phrase ; « Événement modifié. » sans position : même cible ; avec : « Carte » |
| tuiles : avis retiré après une vue sans échec | l'avis part | si « Réessayer » l'avait : au conteneur |
| Leaflet : « Réessayer » | « Chargement de la carte… » remplace l'avis | à la boîte de chargement (`tabindex="-1"`) |
| Leaflet : réussite | la carte s'affiche | au bouton « Carte » |
| Leaflet : second échec | l'avis revient | à son « Réessayer » |
| retour supprimé | onglets et carte du retour disparaissent | `focusTitle` |

Le focus n'est jamais laissé sur `<body>` : à défaut, `focusLandmark`. Après chaque mise à jour, les points sont remis dans l'ordre des fiches, et un point qui avait le focus le retrouve. Aucune animation (décision 24 d'organizer-view) : `zoomAnimation`, `fadeAnimation`, `markerZoomAnimation`, `inertia` à `false`, cadrages `{ animate: false }` ; aucun élément de la carte n'a `leaflet-zoom-anim`, `leaflet-zoom-animated` ni `leaflet-proxy` (CA1.10).

## Les mots

| clé (proposée) | FR | EN |
|---|---|---|
| `EventMap.title` | Carte | Map |
| `EventMap.label.aller` | Carte de l’aller : le lieu de l’événement et {count, plural, =0 {aucune voiture} one {# voiture} other {# voitures}} | Outbound map: the event place and {count, plural, =0 {no cars} one {# car} other {# cars}} |
| `EventMap.label.retour` | Carte du retour : le lieu de l’événement et {count, plural, =0 {aucune voiture} one {# voiture} other {# voitures}} | Return map: the event place and {count, plural, =0 {no cars} one {# car} other {# cars}} |
| `EventMap.event` | Lieu de l’événement : {location} | Event place: {location} |
| `EventMap.car.aller` | {car}, départ : {location}, {seats} | {car}, departs from {location}, {seats} |
| `EventMap.car.retour` | {car}, dépose : {location}, {seats} | {car}, drops off at {location}, {seats} |
| `EventMap.freeSeats` | {free, plural, one {# place libre} other {# places libres}} | {free, plural, one {# free seat} other {# free seats}} |
| `EventMap.group` | {count, plural, other {# voitures}} : {drivers} | {count, plural, other {# cars}}: {drivers} |
| `EventMap.notOnMap` | {count, plural, one {# voiture n’est pas sur la carte : son lieu n’a pas de position.} other {# voitures ne sont pas sur la carte : leurs lieux n’ont pas de position.}} | {count, plural, one {# car is not on the map: its place has no position.} other {# cars are not on the map: their places have no position.}} |
| `EventMap.touchHint` | Deux doigts pour déplacer ou zoomer la carte. | Use two fingers to move or zoom the map. |
| `EventMap.organiserHint` | Pour afficher la carte, choisissez le lieu de l’événement parmi les propositions. | To show the map, pick the event’s place from the suggestions. |
| `EventMap.loading` | Chargement de la carte… | Loading the map… |
| `EventMap.failed.title` | La carte n’a pas pu se charger. | The map could not load. |
| `EventMap.tilesFailed.title` | Le fond de carte n’a pas pu se charger. | The map background could not load. |
| `EventMap.failed.body` | Vérifiez la connexion, puis réessayez. | Check your connection, then try again. |
| `EventMap.retry` | Réessayer | Try again |
| `EventMap.zoomIn` / `zoomOut` | Zoom avant / Zoom arrière | Zoom in / Zoom out |
| `EventMap.attribution` | Source : IGN – Plan IGN v2, {date} | Source: IGN – Plan IGN v2, {date} |

`{car}` est `Board.car.title` ; `{seats}` est `EventMap.freeSeats` ou, sans place libre, `Board.car.full` (« Complet » / “Full”). `count` compte les voitures **sur la carte** ; `notOnMap` est absent à 0. Sans JavaScript, aucun mot de la carte : le bouton est masqué, `Board.needsJavaScript` reste la seule phrase. « Fermer » / “Close” est le mot des feuilles ; « Modifier l’événement » / “Edit the event” est `Admin.edit`.

## Critères

CA1.1 à CA3.4, écrits en entier dans la page (section « Critères d'acceptation »), dans l'ordre. Changés en v8 : CA2.6 et CA3.2 (404 `Not Found` en cache un jour, autre 404 en `no-store`, plus de 400 `TileOutOfRange`, `TILEMATRIXSET=PM_0_19`). Changés en v4 : CA2.6 et CA3.2. Nouveaux en v3 : CA1.17 (ordre des lignes), CA3.4 (date d'attribution) ; changés en v3 : CA1.1, CA1.2, CA1.4, CA1.6, CA1.8, CA1.10, CA1.14, CA1.15, CA2.1, CA2.3, CA2.4, CA2.5, CA2.6, CA2.8, CA3.2. Nouveaux en v2 : CA1.10 (aucune animation), CA1.11 (deux doigts), CA1.12 (sans retour), CA1.13 (onglet caché), CA1.14 (chargement), CA1.15 (voiture au lieu de l'événement), CA1.16 (prénom long, prénoms identiques), CA2.8 (Leaflet en échec), CA2.9 (retour ajouté). Changés : CA1.2, CA1.4, CA1.6, CA1.7, CA1.9, CA2.1, CA2.2, CA2.4, CA2.6, CA2.7, CA3.2.

## Décisions

Dans la page (section « Décisions »). Celles de la maquette :

- Décision : Plan IGN v2 comme source des tuiles. — Raison : la seule source lue dont la licence permet un proxy avec cache, sans clé ni compte.
- Décision du coordinateur (v8, sur #238) : un 404 dont le rapport porte `exceptionCode="Not Found"` est une tuile absente, en cache un jour ; tout autre 404, `no-store` ; la branche 400 `TileOutOfRange` disparaît ; grille `PM_0_19`. — Raison : c'est ce que l'IGN répond vraiment (relevé de #473) ; sans cache, la carte à l'étranger coûterait un appel Vercel et un appel IGN par tuile à chaque affichage ; une URL fausse ne blanchit toujours pas la carte un jour. Remplace la décision de la v4.
- Décision : seul un 404 est une tuile manquante (PNG transparent) ; tout le reste est un échec (502). — Raison : `tileerror` ne donne pas le statut ; un 403 ou un 429 de l'IGN doit se voir, pas devenir un fond blanc d'un jour.
- Décision : libellé fixe « Carte ». — Raison : le motif des autres replis.
- Décision : points en vrais `<button>`. — Raison : Entrée et Espace sans code à nous.
- Décision : regroupement à 25 m. — Raison : en dessous, deux points se confondent même au zoom maximal.
- Décision : sans JavaScript, le bouton est masqué, sans phrase de plus. — Raison : une seule phrase « JavaScript » par panneau.
- Décision : la feuille ouverte depuis la phrase de l'organisateur rend le focus à cette phrase, ou à « Carte » quand une position arrive. — Raison : le bouton de l'espace organisateur peut être caché.
- Décision : l'avis de tuiles apparaît quand une vue a fini de charger avec un échec, part quand une vue finit sans échec, et n'est pas annoncé. — Raison : pas de clignotement ; les tuiles sont décoratives pour un lecteur d'écran.
- Décision : deux avis distincts, Leaflet et fond de carte. — Raison : dans le second cas, les points marchent.
- Décision : le drapeau n'est pas un bouton. — Raison : il ne mène nulle part.
- Décision : au toucher, un doigt fait défiler la page, deux doigts la carte, et une phrase le dit. — Raison : ne pas piéger le défilement ; sans plugin.
- Décision : aucune animation de Leaflet. — Raison : décision 24 d'organizer-view.
- Décision : pas de nouvelle région `status`. — Raison : une seule par panneau de leg, et des tests s'y fient.
- Décision : la phrase de l'organisateur porte son propre bouton « Modifier l'événement ». — Raison : l'espace organisateur peut être replié.
- Décision : une voiture au lieu de l'événement n'a pas de ligne, et son étiquette va sous le drapeau. — Raison : les deux restent visibles.
- Décision : étiquette coupée à 120 px ; deux prénoms identiques restent identiques. — Raison : la place, et ce que fait la fiche.
- Décision : attribution datée par une constante, vérifiée par un test qui échoue après 12 mois. — Raison : la Licence Ouverte demande la date de dernière mise à jour.
- Inchangées depuis la v1 : la carte sous les actions, repliée par défaut, état non retenu, aussi sous l'espace organisateur ; pas de regroupement au-delà de 25 m ; le nom d'un point utilise le texte du lieu ; recadrage seulement si la carte n'a pas été touchée ; pas de carte sans position d'événement.

## Plus tard : les Arrêts

Les Arrêts (les points de RDV sur la route d'une voiture, option « points de RDV ») ne sont pas dans cette maquette. Ils sont attendus plus tard, avec l'epic [#68](https://github.com/olaurendeau/fullcar/issues/68), qui les dessinera sur la carte s'il y a lieu. Rien n'est dessiné ici pour eux : aucun état, aucun critère, aucun mot de cette maquette ne parle d'Arrêts. Décision du propriétaire.

## Pour le propriétaire

- Aucun compte ni clé à créer.
- La couverture de Plan IGN hors de France : **répondu** par le relevé de #473 ([#238](https://github.com/olaurendeau/fullcar/issues/238#issuecomment-6368674599)) : en Suisse et en Italie, Plan IGN répond 404 `Not Found`, que la carte montre comme un fond blanc, sans avis. Si un fond blanc ne suffit pas, l'autre voie reste un hébergeur avec clé et accord écrit (Geoapify, CARTO), dont le compte et la clé seraient les vôtres.
- La licence exacte, la mention et la date attendues sont à confirmer dans les métadonnées de Plan IGN v2.
- Le transfert et les appels de fonction de Vercel sont à surveiller ; tout le trafic vers l'IGN part de ses IP. Hors de sa couverture, l'IGN répond 404 `Not Found` (relevé de #473) : ces tuiles vides sont en cache un jour, donc une zone à l'étranger coûte un appel de fonction et un appel à l'IGN par tuile et par jour au CDN, pas à chaque vue.
- PR mergées par l'humain : Leaflet (environ 40 Ko compressés), le faux IGN et `IGN_WMTS_URL` dans `compose.yaml`, `product.md` (D1), le glossaire (D9).

## Hors périmètre

Itinéraire, distance, durée ; les Arrêts (voir « Plus tard : les Arrêts », #68) ; « Autour de moi » et le tri par proximité ; choisir une position sur la carte ; carte hors ligne ou imprimable ; rafraîchissement automatique (#67) ; carte sur l'accueil ou les vignettes ; « Ouvrir dans mon GPS » ; regroupement des points proches.

## Révisions

- v1 (2026-10-23) : première version, après les décisions du propriétaire D1 à D9.
- v2 (2026-10-23) : revue de design de la v1, **changements demandés** (sept bloquants, vingt-et-une suggestions), tous appliqués, et la décision du propriétaire sur les lieux de voiture (#237 v3). Tuile manquante en PNG vide, échec en 502 ; avis de tuiles (déclenchement, fin, silence) ; Leaflet en échec dessiné ; événement sans retour, retour supprimé et ajouté ; table du focus aux mises à jour et ordre de Tab ; mises à jour à l'application d'un nouvel état (coordinateur) ; aucune animation ; drapeau non bouton ; 672 px calculé ; `button[aria-expanded]` + `hidden` + `<noscript>` ; états vides d'aujourd'hui ; textes anglais de Leaflet remplacés, attribution sans lien ; cas difficiles dessinés ; `count` = voitures sur la carte ; `Board.car.full` ; ordre de Tab ; deux doigts au toucher ; onglet caché démarré à l'affichage ; observables de CA1.2 ; pas de région `status` de plus ; faux IGN ; attribution avec source et date ; IP de sortie ; utilisateur à l'étranger ; phrase de l'organisateur avec son bouton.
- v3 (2026-10-23) : re-revue de la v2, **changements demandés** (trois bloquants, dix-sept suggestions), tous appliqués : seuls 404 et 400 `TileOutOfRange` donnent une tuile vide, tout autre 4xx est un échec ; focus quand « Réessayer » disparaît ; focus autour du bouton de la phrase de l'organisateur ; classes d'animation de Leaflet 1.9.4 ; libellé fixe « Carte » ; points en vrais boutons ; `notOnMap` absent à 0 ; regroupement à 25 m, texte à 12 px au moins ; CA1.2 en avant/après ; `aria-busy` sur la boîte ; ordre des lignes sous la carte ; position d'événement qui change ; seuil du drapeau ; bulle ; sans JavaScript masqué ; maquette sans retour ; test de la date d'attribution ; contraste du chargement ; 448 px pour la hauteur.
- v4 (2026-10-23) : après l'approbation de la v3 : tuile vide tirée d'un 404 en `no-store`, d'un 400 `TileOutOfRange` en cache un jour (décision du coordinateur ; CA2.6, CA3.2, section des tuiles) ; la ligne des tests corrigée ; critères dans l'ordre ; dépend de `place-autocomplete` v5.
- v5 (2026-10-23) : v4 approuvée. Corrections de texte notées sur #238 : en-tête de cache navigateur d'une tuile `TileOutOfRange` ; « un autre 400 » dans la ligne des tests ; le faux IGN répond aussi 403, 429 et un autre 400 ; le coût Vercel des tuiles vides tirées d'un 404.
- v6 (2026-10-23) : décision du propriétaire sur les Arrêts : section « Plus tard : les Arrêts », renvoi à l'epic #68 ; rien n'est dessiné pour eux, aucun état, critère ni mot ajouté.
- v7 (2026-10-23) : v6 approuvée. Corrections de texte : la décision du propriétaire sur les Arrêts est ajoutée aux « Décisions du propriétaire » ; « points de RDV » en minuscules, comme le glossaire et `product.md`.
- v8 (2026-10-23) : décision du coordinateur sur #238 (option B du relevé de #473) : branche 400 `TileOutOfRange` retirée ; 404 `Not Found` → PNG transparent en cache un jour, autre 404 → PNG transparent `no-store`, tout 400 (dont `InvalidParameterValue`) → 502 ; grille `PM_0_19`, style `normal` ; `PLAN_IGN_UPDATED` à `"2026-10"` ; faux IGN avec le rapport `Not Found`. Rien ne change à l'écran. Les mentions de `TileOutOfRange` des révisions v3 à v5 décrivent ces versions.
- v9 (2026-10-23) : correction de texte : dans « Pour le propriétaire », la couverture en Suisse et en Italie est marquée répondue par le relevé de #473 (404 `Not Found`, un fond blanc sans avis).
- v10 (2026-10-23) : revue de la v9, changements demandés : la ligne de coût de « Pour le propriétaire » dit ce que dit la page (tuiles vides `Not Found` en cache un jour) ; correspondance sur l'attribut `exceptionCode` d'une `Exception` OWS, le faux IGN rend le corps réel octet pour octet (CA2.6, CA3.2, « Les tuiles ») ; « Des tuiles en échec » cite aussi 400, 403 et 429.
- v11 (2026-10-23) : v10 approuvée. Corrections de texte de la page : « (à vérifier) » retiré de l'état « Un événement hors de France », réglé par le relevé de #473 ; la note des tests dit « octet pour octet ».
