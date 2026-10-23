# Auto-complétion des lieux

- Artifact : https://claude.ai/artifact/SNnDuNTwkRzc4fTMxarjnT
- Issue : https://github.com/olaurendeau/fullcar/issues/237 (prérequis de #238, maquette `event-map`)
- Page : `index.html` (autonome ; maquettes à 360 px de large, et un navigateur de 1280 px à taille réelle)
- Version : v5 (v4 approuvée, cinq corrections ; v4 : re-revue de la v3 ; v3 : décision du propriétaire sur les lieux de voiture ; v2 : revue de design de la v1)

## Décisions du propriétaire (2026-10-23)

- **D2** : Photon, instance publique de komoot (OpenStreetMap), monde entier, FR/EN. Sans garantie de disponibilité : « Propositions indisponibles » est un état de premier rang.
- **D3** : toujours par notre serveur. Photon ne voit ni l'IP ni le User-Agent du visiteur.
- **D4** : latitude et longitude nullables sur `event` et `ride`, seulement après le choix d'une proposition ; rien d'autre de Photon.
- **D5** : le point exact de la proposition, voitures comprises. L'arrondi à 5 décimales (environ 1 m) est une mise en forme, pas un floutage. Une phrase sous chaque lieu d'une voiture dit qu'il est visible par tout porteur du lien.
- **D6** : la position reste après une modification du texte, sur sa propre ligne, avec « Retirer » — **pour le lieu de l'événement seulement** depuis la v3.
- **v3, lieux de voiture** : pour le lieu d'une voiture (départ, dépose, et le lieu de l'autre leg), toute modification du texte après un choix retire la position. Raison du propriétaire : une personne qui réduit « 12 rue des Lilas, 69126 Brindas » à « Brindas » ne doit pas rester épinglée chez elle pour tout porteur du lien. Conséquence : la position d'une voiture est toujours celle de son texte.
- **D9** : « position » entre au glossaire (PR de documentation, mergée par l'humain).

## Décisions du coordinateur (revue de la v1)

- Le transport est une route `POST /api/lieux` (`src/app/api/lieux/route.ts`), texte dans le corps JSON, pas une server action : Next exécute les server actions d'une page une à une, et une réponse lente de Photon retarderait l'envoi d'un formulaire ou l'actualisation de 15 s, ou serait retardée par elles.
- La position de l'événement, qui rapproche les propositions d'une voiture, part vers Photon arrondie à 1 décimale (environ 10 km), jamais exacte.

## Ce que la page montre

Le champ « Lieu » de « Créer un événement » ; le cycle de vie de la liste (frappe, pause, attente, réponse, envoi) ; « Lieu de départ » / « Lieu de dépose » de « Proposer une voiture », avec l'autre leg de « Je ramène aussi » et le clavier virtuel à 360 px ; « Modifier l'événement » (et pendant l'envoi) et « Modifier la voiture » ; « Un lieu, une valeur » (comparer, `before`, envoi groupé, refus, données de `/e/{id}`) ; l'anglais ; 1280 px ; l'anatomie et le clavier ; la route et Photon ; les tests ; les mots ; les critères ; les décisions ; le hors-périmètre ; les révisions.

## États couverts

1. Moins de 3 caractères : rien.
2. La liste (5 au plus), l'option active marquée par une barre de 3 px et `aria-selected="true"`.
3. Une proposition choisie : la ligne de position, « Position ajoutée. ».
4. Événement : le texte modifié après le choix : la position reste ; « Retirer », « Position retirée. ».
4 bis. Voiture : le texte modifié après le choix : la position part à la première frappe, « Position retirée. » (aussi dans « Modifier la voiture », où « Position enregistrée » part à la première frappe).
5. Texte libre, sans choix.
6. Une erreur, une position, la phrase de visibilité : leur ordre, et celui d'`aria-describedby`, en trois feuilles : (a) « Modifier l'événement », erreur puis position ; (b) « Modifier la voiture », erreur puis phrase ; (c) « Modifier la voiture », position puis phrase.
7. Un libellé long à 360 px ; le pays hors de France.
8. L'attente au-delà d'une seconde : « Recherche de propositions… ».
9. Aucune proposition.
10. Propositions indisponibles (hors ligne, panne, 3 s, 429, disjoncteur), annoncées une fois.
11. Voiture : la phrase de visibilité, les propositions rapprochées de l'événement ; Échap ferme la liste avant la feuille.
12. « Je ramène aussi » : le lieu de dépose suit, sa position aussi ; deux « Retirer » nommés.
13. Fenêtre de 360 × 420, clavier ouvert : le lieu de dépose et sa liste en bas de la feuille ; la liste a au plus 420 − 86 − 8 = 326 px, et ses cinq propositions et son pied y tiennent.
14. « Modifier l'événement » : « Position enregistrée », « Valider » puis « Annuler » ; pendant l'envoi, champ verrouillé et « Retirer » `aria-disabled`.
15. « Modifier la voiture » ouvert avec une position (« Position enregistrée » puis la phrase), et à la première frappe (la position part, la phrase reste).
16. « Modifier la voiture » : une voiture d'avant #237 reçoit la proposition au même texte.
17. En anglais (le lieu de dépose dans « On the return trip ») ; à 1280 px.

Dans les dessins, aucune option n'est active sans une flèche : une liste arrive sans option active (seul l'état 2 en montre une, après deux Flèche bas).

## Un lieu, une valeur

Un lieu est le couple `{ text, position }`, `position` valant `{ lat, lng }` ou `null`. Partout où le code compare, envoie, recopie ou vérifie un lieu, c'est ce couple, jamais le texte seul :

- **Voiture (v3)** : une modification du texte remet la position à `null` dans le même changement d'état.
- **Comparer** : égaux si les textes sont égaux et les positions aussi (toutes deux `null`, ou mêmes coordonnées à 5 décimales). « Valider » sans changement (M2.5, v4.4.5-6), modification simultanée (M6.1) et « Je ramène aussi » suivent ce couple.
- **« Modifier l'événement »** : `EventHeader`, donc `before`, gagne `locationPosition` ; `sameHeader` la compare sous le verrou ; le formulaire envoie toujours `location` et `locationPosition` ensemble. Un `before` sans `locationPosition` (page d'avant le déploiement) est comparé sans elle, et l'écriture garde la position enregistrée, même si le texte change (D6).
- **« Modifier la voiture »** : le lieu est un seul champ de `RIDE_FIELDS` ; changé, il part `location` et `position` ensemble. `location` sans `position` (page d'avant le déploiement) : texte égal à celui enregistré, la position ne change pas ; texte différent, **le serveur met la position à `null`** (règle des voitures, v3 ; AL5.6). La position d'une voiture est ainsi toujours celle de son texte, quelle que soit la page qui écrit.
- **Refus** (`invalid`, rien d'écrit) : une position sans `location` dans la même requête ; une position qui n'est ni `null` ni `{ lat, lng }` de nombres finis ; une latitude hors de [−90, 90] ou une longitude hors de [−180, 180].
- **`/e/{id}`** reçoit la position de l'événement et celle de chaque voiture, dans l'état de la page et son actualisation ; rien d'autre de Photon. Le libellé n'est pas stocké : à l'ouverture d'un formulaire de modification, la ligne dit « Position enregistrée ».

## Les mots

| clé (proposée) | FR | EN |
|---|---|---|
| `PlaceField.listLabel` | Propositions pour {field} | Suggestions for {field} |
| `PlaceField.count` | {count, plural, one {# proposition} other {# propositions}} | {count, plural, one {# suggestion} other {# suggestions}} |
| `PlaceField.keepText` | Ou gardez votre texte tel quel. | Or keep your text as it is. |
| `PlaceField.source` | Propositions : © les contributeurs d’OpenStreetMap | Suggestions: © OpenStreetMap contributors |
| `PlaceField.searching` | Recherche de propositions… | Looking for suggestions… |
| `PlaceField.none` | Aucune proposition. Votre texte sera gardé tel quel. | No suggestions. Your text will be kept as it is. |
| `PlaceField.unavailable` | Propositions indisponibles. Votre texte sera gardé tel quel. | Suggestions unavailable. Your text will be kept as it is. |
| `PlaceField.position` | Position : {label} | Position: {label} |
| `PlaceField.saved` | Position enregistrée | Saved position |
| `PlaceField.remove` | Retirer | Remove |
| `PlaceField.removeLabel` | Retirer la position ({field}) | Remove the position ({field}) |
| `PlaceField.added` | Position ajoutée. | Position added. |
| `PlaceField.removed` | Position retirée. | Position removed. |
| `RideForm.locationHint` | Visible par toutes les personnes qui ont le lien. | Visible to everyone who has the link. |

`PlaceField.removed` est dit par la région `status` du champ où l'on agit : après « Retirer », après la frappe qui retire la position d'une voiture, quand un champ qui a une position est vidé (événement ou voiture, AL3.3, AL3.8) ; une seule fois (le lieu de dépose qui suit le départ ne le répète pas).

Les libellés des champs ne changent pas. « Envoi en cours… » / “Sending…” est `EditEvent.sending`, défini par la décision 52 d'organizer-view mais pas encore dans `messages/*.json` sur main (82e8259) : s'il manque encore quand #237 est construit, la PR l'ajoute avec ces mots-là.

## La route et Photon (résumé)

- `POST /api/lieux`, corps `{ text, locale, near? }` de 1 Ko au plus. Refus sans appel : 405 (autre méthode), 403 (`Origin` qui n'est pas le nôtre), 400 `{ state: "invalid" }`. Réponse 200 `no-store` : `{ state: "ok", suggestions }` ou `{ state: "unavailable" }`.
- Vers Photon (`PHOTON_URL`) : `q`, `limit=5`, `lang`, et pour une voiture `lat`/`lon` à 1 décimale. User-Agent `fullcar/{version} (+https://github.com/olaurendeau/fullcar)`. Ni IP du visiteur, ni cookie, ni `Referer`, ni identifiant, ni jeton.
- Bon citoyen : 3 caractères, 300 ms, une requête à la fois (`AbortController`), 5 résultats ; cache en mémoire (500 entrées, 1 h) ; disjoncteur de 60 s (`PLACES_BREAKER_MS`, ou `Retry-After`) après un 429, un 5xx ou 3 s ; 5 appels par seconde au plus par instance.
- Rien n'est journalisé du texte ni de la réponse. Sentry : `scrub.ts` retire la query de toute URL sortante (fils d'Ariane, spans), et l'erreur levée sur un échec de Photon ne porte pas l'URL.
- Tests : Vitest pour le disjoncteur, le plafond, le cache, le délai, le libellé, l'arrondi et le retrait de la query, avec une horloge et un `fetch` injectés ; de bout en bout, un faux Photon du slot (`compose.yaml`, PR mergée par l'humain), vide par défaut, réglé par texte sur son port de contrôle, et `PLACES_BREAKER_MS=0` dans ce slot.

## Critères

AL1.1 à AL6.6, écrits en entier dans la page (section « Critères d'acceptation »). Nouveau en v5 : AL3.8 (« Position retirée. » quand un champ qui a une position est vidé) ; changés en v5 : AL3.3 (événement comme voiture), AL1.11 (la hauteur de la liste) ; critères dans l'ordre. Nouveaux en v4 : AL3.7, AL5.6 ; changés en v4 : AL1.9 (trois cas : événement erreur puis position ; voiture erreur puis phrase ; voiture sans erreur position puis phrase), AL1.11 (fenêtre de 360 × 420), AL2.4 (tests qui appuient sur Entrée dans un lieu, `e2e/aller-sheets.spec.ts` M7.6 ; W1.2 ; régions `status`), AL4.2 (une seule annonce). Nouveau en v3 : AL3.6 ; changés en v3 : AL3.1 (événement seulement), AL4.2. Nouveaux ou changés en v2 : AL1.2, AL1.5, AL1.9, AL1.10, AL1.11, AL2.2, AL2.4, AL2.5, AL2.6, AL3.4, AL3.5, AL4.1, AL5.1, AL5.3, AL5.4, AL5.5, AL6.3, AL6.4, AL6.6.

## Décisions

Dans la page (section « Décisions »). Celles de la maquette :

- Décision (v5) : vider le lieu de l'événement retire aussi sa position, et l'annonce. — Raison : un champ vide n'a pas de lieu ; c'était déjà AL3.3, le cycle de vie le dit désormais.
- Décision (v4) : une modification de voiture qui change le texte sans envoyer de position remet la position à `null`. — Raison : re-revue de la v3, bloquant 1 ; sinon un onglet d'avant le déploiement garderait une voiture épinglée chez quelqu'un qui a flouté son adresse.
- Décision (v4) : « Position retirée. » une seule fois, dans la région du champ où l'on tape. — Raison : le lieu de dépose qui suit ne fait que suivre ; deux annonces diraient deux fois la même chose.
- Décision du propriétaire (v3) : pour une voiture, toute modification du texte après un choix retire la position ; l'événement garde D6. — Raison : ne pas laisser épinglé un domicile qu'on a voulu flouter.
- Décision : la région `status` du champ est dans le formulaire, hors du panneau du leg. — Raison : les tests existants comptent une seule région `status` par panneau.
- Décision : un lieu est une seule valeur `{ text, position }` ; `before` porte la position. — Raison : revue v1, bloquant 1.
- Décision : une frappe ferme la liste ; la nouvelle arrive avec la réponse. — Raison : une liste pour un texte qui a changé ne doit pas être choisie.
- Décision : « Recherche de propositions… » après 1 s seulement, jamais annoncée. — Raison : rien ne clignote sur une réponse rapide.
- Décision : « indisponibles » annoncé une fois tant que le focus reste dans le champ. — Raison : le disjoncteur ouvert donnerait la même annonce à chaque pause.
- Décision : Échap ferme la liste avant la feuille. — Raison : dans « Modifier l'événement », Échap vaut « Annuler ».
- Décision : pendant l'envoi, le champ ne propose rien et « Retirer » ne fait rien, dans les quatre formulaires. — Raison : décision 52 d'organizer-view, étendue.
- Décision : la phrase de visibilité sous chaque lieu d'une voiture, toujours ; aucune sous le lieu de l'événement. — Raison : D5 ; l'événement est fait pour être vu.
- Décision : « Position : {libellé} » après un choix, « Position enregistrée » à l'ouverture d'un formulaire de modification. — Raison : le libellé n'est pas stocké.
- Décision : un seul message pour hors ligne, panne, lenteur, limitation et disjoncteur. — Raison : la personne fait la même chose dans tous les cas.
- Décision : le pays en fin de libellé hors de France seulement. — Raison : le cas courant reste court.
- Décision : le cache en mémoire seulement. — Raison : une table stockerait des adresses tapées.
- Décision : `/api/lieux` refuse un `Origin` qui n'est pas le nôtre. — Raison : ne pas servir de proxy Photon gratuit à d'autres sites.
- Décision : `PLACES_BREAKER_MS`, 0 dans le slot de bout en bout. — Raison : tests parallèles indépendants sans route réservée aux tests.

## Hors périmètre

Les Arrêts ; « Autour de moi » ; rattacher une position aux lieux saisis avant #237 ; « Ouvrir dans mon GPS » ; choisir la position sur une carte ; une instance Photon à nous ; sans JavaScript (sans objet : les formulaires concernés le demandent déjà).

## Révisions

- v1 (2026-10-23) : première version, après les décisions du propriétaire D1 à D9.
- v2 (2026-10-23) : revue de design de la v1, **changements demandés** (six bloquants, treize suggestions), tous appliqués : un lieu, une valeur (`before`, envoi groupé, AL5.3) ; champ verrouillé pendant l'envoi (AL5.4) ; Échap dans une feuille (AL1.5) ; route `POST /api/lieux` (décision du coordinateur, AL2.6) ; option active à 3:1 et `aria-selected` (AL1.2) ; cycle de vie de la liste et des lignes (AL1.10, AL2.2) ; `near` à 1 décimale (décision du coordinateur, AL4.1) ; testabilité ; Sentry (AL6.6) ; « Valider » puis « Annuler » ; annonces de position (AL3.4) ; noms des « Retirer » (AL3.5) ; ordre des descriptions (AL1.9) ; clavier à 360 px (AL1.11) ; liste hors portail ; sans JavaScript sans objet ; échec d'envoi (AL5.5) ; données de `/e/{id}` ; D5 sans floutage ; « Position enregistrée ».
- v3 (2026-10-23) : décision du propriétaire : pour le lieu d'une voiture, toute modification du texte après un choix retire la position (état 4 bis, AL3.6, AL4.2) ; le lieu de l'événement garde D6 (état 4, AL3.1). État 6 redessiné, exemple anglais corrigé, région `status` du champ hors du panneau du leg.
- v4 (2026-10-23) : re-revue de la v3, **changements demandés** (deux bloquants, dix suggestions), tous appliqués : une voiture modifiée depuis une page d'avant le déploiement perd sa position quand son texte change (AL5.6) ; AL1.9 en trois cas, état 6 complété ; « Modifier la voiture » ouvert avec une position et à la première frappe ; AL3.7 ; AL4.2 une seule annonce ; cycle de vie et `PlaceField.removed` ; plus d'option active sans flèche ; exemple anglais dans « On the return trip » ; `EditEvent.sending` absent de main ; AL2.4 étendu ; AL1.11 en 360 × 420 ; révisions dans l'ordre.
- v5 (2026-10-23) : après l'approbation de la v4, cinq corrections : cycle de vie et vidage du lieu de l'événement (AL3.8) ; dessin à 360 × 420 conforme à sa légende ; paragraphe de `PlaceField.removed` sorti du tableau ; critères dans l'ordre ; état 6 en trois feuilles, les voitures dans « Modifier la voiture ».
