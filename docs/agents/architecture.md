# Architecture

## Forme

Une seule application Next.js (App Router) en TypeScript, et une base Postgres. Hébergée sur
**Vercel** (fonctions serverless) avec **Neon** en production, sur les plans gratuits. Pas de
service séparé, pas de file d'attente, pas de cache externe.

Ce choix n'est pas une étape vers autre chose. Il est dicté par le produit : un événement
est lu par trente personnes pendant trois jours, puis purgé.

| besoin | choix |
|---|---|
| framework | Next.js 16, App Router, TypeScript strict ; Cache Components désactivé (tout est personnel et par requête) |
| composants | shadcn/ui (Tailwind v4, Radix, preset Nova), copiés dans `src/components/ui` ; une feuille mobile est un `Sheet` avec `side="bottom"` (sur `radix-ui`, déjà installé), pas le Drawer de `vaul` |
| outillage local | Docker uniquement, piloté par `make` ; rien d'installé sur l'hôte |
| base | Postgres : conteneur par slot en local, Neon en production |
| accès aux données | Kysely (query builder typé, pas d'ORM) et le driver `pg` |
| migrations | le migrateur de Kysely, chaque migration a un `up` et un `down` |
| i18n | next-intl, **sans préfixe de langue** dans l'URL |
| tests | Vitest (domaine, données), Playwright (bout en bout, capture à 360 px) |
| PWA | manifeste et service worker minimal, pas de mode hors ligne en V1 |
| purge | Vercel Cron quotidienne vers une route protégée par `CRON_SECRET` (voir « La purge ») |
| e-mail | Brevo, son API d'e-mails transactionnels, appelée par notre serveur seulement, en `fetch` simple (voir « Les e-mails ») |
| lieux | Photon (instance publique de komoot, OpenStreetMap), appelé par notre serveur seulement, derrière `POST /api/lieux` (voir « Auto-complétion des lieux ») |
| carte | Leaflet 1.9.4, version exacte, chargé par `import()` au premier démarrage d'une carte ; tuiles raster de Geoapify (OpenStreetMap, style `positron` en @2x), demandées par notre serveur seulement, avec notre clé, derrière `GET /tuiles/{z}/{x}/{y}`, en cache au CDN de Vercel (voir « La carte de l'événement ») |

Polices : la pile de polices système, **aucune police web**, ni distante ni servie par
l'application. Aucune requête du navigateur vers un tiers, et rien à télécharger avant le
premier affichage. Avec un DSN Sentry (#234), le navigateur envoie ses rapports d'erreur à
notre origine, `/monitoring`, que Vercel réécrit vers Sentry. La réécriture peut transmettre
l'IP du visiteur (`X-Forwarded-For`) : ce qui la tient hors de Sentry, c'est
`infer_ip: "never"`, que le SDK du navigateur pose avec `userInfo` coupé, et le réglage
« Prevent Storing of IP Addresses » du projet Sentry. Vercel Web Analytics (#346) charge son
script et envoie ses pages vues à notre origine aussi (`/_vercel/insights/…`, ou un chemin
propre au projet). Les propositions de lieux (#425) passent par notre origine elles aussi,
`POST /api/lieux` : c'est notre serveur qui appelle Photon, qui ne voit ni l'IP ni le
navigateur du visiteur. Les tuiles de la carte (#474) aussi, `GET /tuiles/{z}/{x}/{y}` : c'est
notre serveur qui appelle Geoapify, qui voit l'IP de Vercel, notre clé et les tuiles qui ne
sont pas au cache, jamais l'IP ni le navigateur du visiteur. Leaflet et
sa feuille de style viennent de notre build, servis par notre origine. Les e-mails du compte
organisateur (#581) partent de notre serveur vers Brevo, qui voit notre clé, l'expéditeur,
l'adresse du destinataire et l'e-mail, jamais l'IP ni le navigateur du visiteur.

## Environnements et base de données

### Tout passe par Docker

Rien n'est installé sur le poste : ni Node, ni npm, ni Postgres, ni navigateur de test. Node,
la base et Playwright tournent dans des conteneurs décrits par `compose.yaml`, et le
`Makefile` est la seule porte d'entrée. Une commande lancée à nu sur l'hôte (`npm …`,
`npx …`) est un défaut : elle ne marche que sur la machine de celui qui l'a écrite.

| commande | effet |
|---|---|
| `make ci` | l'équivalent local de la CI, sur une seule machine : `make check`, puis les tests de bout en bout contre le build de production que `make check` vient de produire (un seul build, là où la CI en fait cinq : un job statique et quatre shards) |
| `make check` | lint, typecheck, tests, clés i18n, build de production |
| `make up` / `make down` | démarre / arrête et efface l'environnement du slot ; `make up` démarre la base, **lui applique les migrations**, puis démarre `web`, et une migration en échec l'arrête avant `web` (#27) |
| `make e2e` | construit le **build de production** du slot, puis lance les tests de bout en bout Playwright contre `next start` |
| `make shot` | construit le build de production du slot, puis prend les captures d'écran (360 px par défaut, `WIDTH=…`) contre `next start`, dans `var/shots` |
| `make npm ARGS="…"` | npm dans le conteneur, pour ajouter une dépendance par exemple ; refuse `version` (et sa variante `verison`), `publish`, `unpublish`, `dist-tag` (`dist-tags`) et `deprecate`, qui reviennent à l'humain |

Le dépôt est monté dans le conteneur, `node_modules` compris : installés par le conteneur
Linux, ils restent lisibles par l'éditeur de l'hôte pour les types.

La CI exécute les mêmes commandes que `make ci`, avec un slot explicite, réparties sur
plusieurs machines (#636) : un job `static` lance `make check SLOT=0`, et quatre jobs `e2e`
lancent chacun `make e2e SLOT=0 ARGS="--shard=i/4"`, qui construit son propre build de
production puis joue un quart des tests de bout en bout. Ce qui passe en local avec
`make ci` passe en CI. Un dernier job, `checks`, tourne dans tous les cas et échoue si l'un
des autres n'a pas réussi : c'est lui que lit la fusion, parce qu'un job requis sauté
compte comme réussi sur GitHub. La variable `CI` est transmise aux conteneurs : en CI, Vitest et
Playwright refusent un `.only`, que le lint refuse déjà partout.

Le service Node s'appelle `web`, pas `app` : Chromium précharge HSTS pour tout le TLD `.app`
et force alors HTTPS sur `http://app:3000`, ce qui casse les tests de bout en bout.

### Slots

Chaque slot est un **projet Compose distinct** (`fullcar-slot{slot}`) : son conteneur Node (`web`),
son conteneur Postgres, son faux Photon (`photon`) et son faux fournisseur de tuiles (`tiles`, voir plus bas), ses volumes. Rien n'est partagé, donc deux développeurs en parallèle
ne se marchent pas dessus, et `make down SLOT={slot}` efface tout ce que le slot a créé.
L'application du slot écoute sur le port `30{slot}0` de l'hôte, en `127.0.0.1` seulement ;
Postgres n'est pas exposé, il n'est joignable que par le nom `db` dans le réseau du slot. Dans
ce conteneur, la base `fullcar` sert au serveur de dev et aux tests de bout en bout,
`fullcar_test` et `fullcar_migrations_test` à Vitest.

`make up` lance le serveur de dev (`next dev`). Les tests de bout en bout, eux, tournent
contre le build de production (`next build` puis `next start`) : c'est ce build qui part
sur Vercel, et le serveur de dev ne se comporte pas comme lui (compilation à la demande,
rendu, cache). `make e2e`, `make ci` et `make shot` remplacent donc le serveur de dev du
slot par `next start` ; `make up` le remet. Les captures en ont besoin aussi : depuis le
conteneur Playwright, `next dev` bloque ses propres scripts (origine croisée) et la page
n'hydrate jamais. Ce `next start` tourne dans le fuseau `Pacific/Kiritimati` (UTC+14), pas
en UTC comme Vercel : une heure mise en forme dans le fuseau du serveur s'y voit (C1.12).

**Le faux Photon du slot (#419).** Le service `photon` lance `e2e/fake-photon.mjs` (Node
seul, sans dépendance) : l'API de recherche de Photon, en GeoJSON, sur le port 2322, et son
contrôle sur le port 2323. Aucun de ses ports n'est publié sur l'hôte : il n'est joignable que
par le nom `photon` dans le réseau du slot. `web` y est branché dans **tous** les slots
(`PHOTON_URL=http://photon:2322/api/`, `PLACES_BREAKER_MS=0`), `make up` compris, dans le
slot 0 de l'humain aussi : un slot n'appelle jamais l'instance publique. Le faux est vide par
défaut, et la route répond alors `{ state: "ok", suggestions: [] }` à tout texte valide. Pour voir des
propositions en local, on le règle depuis son propre conteneur, avec `docker compose exec`,
pour un texte que l'application n'a pas encore demandé (son cache garde aussi une réponse
vide pendant une heure) :

```sh
SLOT=0 docker compose exec photon node -e 'fetch("http://localhost:2323/answers", { method: "POST", body: JSON.stringify({ text: "Annecy", answer: { features: [{ type: "Feature", geometry: { type: "Point", coordinates: [6.1294, 45.8992] }, properties: { name: "Annecy", postcode: "74000", type: "city", countrycode: "FR" } }] } }) }).then((r) => console.log(r.status))'
```

Le faux répond `204`, puis propose « Annecy (74000) » au texte `Annecy`, exactement, tant
qu'il tourne.

**Le faux fournisseur de tuiles du slot (#554, #555).** Le service `tiles` lance
`e2e/fake-tiles.mjs` (Node seul, sans dépendance) : les tuiles raster de Geoapify sur le port
2324 (`GET /v1/tile/{style}/{z}/{x}/{y}@2x.png?apiKey=…`), et son contrôle sur le port 2325.
Comme le faux Photon, il n'est joignable que par son nom dans le réseau du slot, et `web` y est
branché dans tous les slots, `make up` compris (`TILE_UPSTREAM_URL=http://tiles:2324/v1/tile`,
`TILES_BREAKER_MS=0`) : un slot ne demande jamais une tuile à Geoapify. `web` reçoit aussi une
clé de test, `GEOAPIFY_API_KEY=fullcar-test-key-7f3a9c2e`, qu'on ne peut prendre pour rien
d'autre, et `next build` tourne dans ce même conteneur : le build l'a dans son environnement,
ce qui donne sa valeur à la vérification de CA3.5 (voir « Les tuiles »). Par défaut, le faux
répond à toute tuile une tuile PNG grise de 512 × 512, si bien qu'une carte s'affiche en local
sans réglage ; sans `apiKey`, un 401 ; une requête qu'il ne sait pas lire, un 400.

**Un worktree git par slot** : chaque développeur travaille dans son propre worktree, avec
son slot. Deux slots dans le même répertoire partageraient `node_modules`, `.next` et les
fichiers en cours d'écriture.

### Base de test (Vitest)

Vitest utilise **deux bases**, jamais `fullcar`, que le serveur de dev et les tests de bout
en bout utilisent :

- `fullcar_test`, pour les tests de données, dont l'URL vient de `TEST_DATABASE_URL`.
  `vitest.config.ts` y fait pointer `DATABASE_URL`, si bien que `getDb()` n'atteint
  qu'elle, et refuse de se connecter si `TEST_DATABASE_URL` manque. Le `globalSetup`
  (`src/db/test-setup.ts`) remet son schéma à zéro et la migre **une seule fois** par
  lancement ; aucun test ne migre ni ne vide la base lui-même. Un test qui écrit en base
  s'isole avec `withRollback` (`src/db/test-db.ts`) : il reçoit une transaction, qui est
  annulée à la fin, et la passe au code testé au lieu que celui-ci appelle `getDb()`.
  Aucune donnée ne survit d'un test à l'autre, et l'ordre des tests ne compte pas.

  **Tests de concurrence**, à partir de #66 : une transaction annulée ne peut pas montrer
  deux écritures simultanées, et vérifier que le SQL contient `FOR UPDATE` ne prouve rien.
  Un test de concurrence (deux prises simultanées de la dernière place, par exemple)
  s'exécute donc sur des **données validées**, sous un événement qui n'appartient qu'à
  lui : `withCommittedEvent` (`src/db/test-committed.ts`) l'amorce avec `getDb()`, passe
  la connexion et l'identifiant au test, puis supprime l'événement à la fin, même si le
  test échoue ; la cascade emporte le reste.

  Ces lignes validées sont visibles des autres tests tant qu'elles existent. Un test sous
  `withRollback` ne lit donc **que les lignes de son propre événement** (filtre sur son
  identifiant), ou compare deux comptages faits dans sa propre transaction. Pour ces
  comptages, `withRollback` ouvre sa transaction en `REPEATABLE READ` (#79) : l'instantané
  est pris à la première requête, et une ligne validée ensuite par un test de concurrence
  ne fausse pas l'écart. Ce niveau ne cache pas une ligne validée **avant** cette première
  requête : il ne remplace pas le filtre. Depuis #79, `src/db/events.test.ts` et
  `src/db/event-table.test.ts` ne lisent `event` que filtré sur un identifiant : celui
  d'un de leurs propres événements, ou un identifiant inconnu dont ils vérifient
  l'absence. Seule exception, un comptage de `events.test.ts`, comparé à un second
  comptage de la même transaction.
- `fullcar_migrations_test`, dont l'URL vient de `MIGRATIONS_TEST_DATABASE_URL`, pour le
  seul test d'aller-retour des migrations (`src/db/migrations.test.ts` : montée, descente,
  remontée, puis descente complète sans table restante). Le `globalSetup` la vide (et la
  crée si le volume du slot est plus ancien qu'elle) ; le test ne touche pas
  `fullcar_test`, que les autres tests lisent en même temps.

La mise en place des tests **refuse de remettre à zéro toute autre base** que ces deux-là :
`resetSchema` compare `current_database()` au nom attendu avant de vider quoi que ce
soit, et le test des migrations vérifie le nom de sa base avant de commencer. Une URL mal
configurée échoue au lieu d'effacer une base qui n'est pas la sienne.

### Données des tests de bout en bout

- Un test Playwright amorce ses données **directement dans la base du slot**, par une
  fixture qui appelle les fonctions de `src/db/` (par exemple `seedEvent`, dans
  `src/db/test-events.ts`). Jamais par une route HTTP réservée aux tests : une telle
  route finirait par exister en production.
- **Chaque test possède son événement** : il le crée, et ne lit ni ne modifie celui d'un
  autre test. Les tests restent indépendants et peuvent tourner en parallèle.
- Le conteneur Playwright atteint la base `fullcar` du slot, à l'hôte `db` (#20). Un test
  importe `test` et `expect` de `e2e/fixtures.ts` : la fixture `seededEvent` y crée son
  événement avant le test et le supprime après. Avant de se connecter, `e2eDatabaseUrl`
  refuse toute URL qui n'a pas exactement la forme
  `postgres[ql]://[identifiants@]db[:port]/fullcar` : schéma `postgres` ou `postgresql`,
  identifiants facultatifs, hôte `db`, port facultatif, base `fullcar`, et rien après. Ni
  query string ni fragment, donc, puisque `pg` y lit aussi un hôte, un port ou un socket.
- Les propositions de lieux viennent du **faux Photon du slot** (voir « Slots »), jamais de
  l'instance publique. Un test le règle **par texte** (`q` exact) au travers de son port de
  contrôle, que le conteneur Playwright reçoit en `PHOTON_CONTROL_URL` : `answerFor` fixe
  les propositions, le statut ou le délai de la réponse à un texte, `requestsFor` rend les
  requêtes reçues pour ce texte (chemin, query telle qu'envoyée, en-têtes), et
  `photonFeature` écrit un élément GeoJSON (`e2e/photon.ts`). Là non plus, aucune route
  réservée aux tests. Le faux garde ce qu'on lui dit tant qu'il tourne, et l'application
  garde une réponse une heure : **chaque test choisit ses propres textes**.
  `PLACES_BREAKER_MS=0` empêche le 429 ou le 500 d'un test d'ouvrir le disjoncteur pour les
  autres. `make e2e` sert `web` sans ses dépendances : c'est le conteneur Playwright, qui
  dépend de `photon` et de `tiles`, qui démarre les deux faux.
- Les tuiles viennent du **faux fournisseur du slot** (voir « Slots »), jamais de Geoapify.
  Un test le règle **par tuile** (`z/x/y`, comme Leaflet et `/tuiles` la nomment), jamais pour
  toutes, au travers de son port de contrôle, que le conteneur Playwright reçoit en
  `TILES_CONTROL_URL` (`e2e/tiles.ts`) : `answerTiles` fixe la réponse à des tuiles, et
  `requestsForTile` rend les requêtes reçues pour une tuile (chemin, query telle qu'envoyée,
  en-têtes), enregistrées à l'arrivée, avec ou sans clé. Les réponses : `tile` (par défaut, la
  tuile grise), `unauthorized` (401), `forbidden` (403), `notFound` (404), `tooMany` (429, avec
  `retryAfter` envoyé tel quel en `Retry-After` s'il est donné), `error` (500), `notPng` (un
  200 `text/html`), chacune avec un délai facultatif (`delayMs`, de 0 à 2³¹ − 1 ms). Aucune
  route réservée aux tests. `TILES_BREAKER_MS=0` empêche le 429 d'un test d'ouvrir le
  disjoncteur pour les autres.
- **Chaque test de la carte a ses tuiles** (règle de capacité, #472 sur #238) : le faux
  n'oublie rien avant `make down`. `placeOf(eventId)` (`e2e/tiles.ts`) tire de l'identifiant
  de l'événement amorcé une position dans un rectangle de la France métropolitaine (97 818
  tuiles à z 14), sans aléa, et `tileOf(eventId, dx)` une tuile de z 18 qui n'est qu'à
  ce test. Un test ne règle **que les tuiles qu'il vérifie lui-même**, jamais une zone
  entière : à z 14, trente tests d'une tuile se chevauchent avec une probabilité de 0,5 %,
  trente tests d'une vue de 3 × 3 tuiles de 10 %. Si beaucoup de tests de la carte finissent
  par régler des tuiles, on agrandit le rectangle de `placeOf`. `e2e/event-map-points.ts`
  amorce l'événement du test à `placeOf` son identifiant (fixture `placed`), et ses voitures
  autour (`seedCar`, `around`).

### Production

- Neon, région Europe, fonctions Vercel dans la même région. Connexion par l'URL **poolée**
  de Neon, puisque chaque invocation serverless ouvre sa connexion.
- L'URL de la base vient de `DATABASE_URL` (poolée) ou `DATABASE_URL_UNPOOLED` (non
  poolée, pour les migrations seulement), jamais écrite en dur. Une session de
  développement ne se connecte qu'à la base de son slot : la base Neon n'est jamais
  accessible depuis un poste de dev ou un agent.
- Neon met la base en veille quand elle ne sert pas : la première requête après une pause
  coûte un peu moins d'une seconde. C'est accepté.
- **Migrations** : le build Vercel les applique, pour l'environnement de production
  seulement, avec l'URL **non poolée** de Neon, lue dans `DATABASE_URL_UNPOOLED` (les
  verrous et le DDL d'une migration ne passent pas par le pooler). Le nouveau schéma est donc en place avant que le nouveau code
  serve, mais l'ancien code sert encore pendant le déploiement, et c'est vers lui qu'un
  retour arrière ramène : chaque migration reste **compatible avec le code déjà déployé**.
  On procède par expansion puis contraction : ajouter (colonne nullable ou avec défaut,
  table), déployer le code qui s'en sert, et ne retirer l'ancien que dans un déploiement
  suivant. Renommer ou supprimer une colonne encore lue d'un seul coup est un défaut.
- Il n'y a pas de déploiement de prévisualisation (preview) : le `vercel.json` de la racine
  (#344, PR #348) coupe le déploiement automatique de toute branche sauf `main`.

## Concurrence

Contrairement à SQLite, Postgres accepte des écritures simultanées. Deux personnes peuvent
taper la même dernière place au même moment. Prendre une place se fait donc dans une
transaction qui **verrouille d'abord la ligne du Ride** (`SELECT … FROM ride … FOR UPDATE`),
puis compte les places restantes, puis écrit le Placement. Les deux taps sont ainsi
sérialisés sur le Ride : le second voit la place prise et reçoit un message clair, pas une
voiture surchargée.

Une insertion conditionnelle sans verrou (`INSERT … SELECT … WHERE` comptage `< places`)
ne suffit pas : sous `READ COMMITTED`, le niveau par défaut de Postgres, deux transactions
simultanées voient la même place libre et insèrent toutes les deux.

À partir de #66, valider la feuille (tout ou rien) et réduire les places d'un Ride
verrouillent de même d'abord la ligne du Ride. Une écriture qui verrouille aussi une Person
(les déclencheurs de #66, C12.8, voir « Contraintes permanentes ») le fait **après** le Ride :
l'ordre est Ride, puis Person, dans tout le code, sans quoi deux transactions peuvent
s'attendre l'une l'autre ; depuis #260, l'Event vient avant les deux (voir « L'Event
d'abord »). Ainsi, dans `src/db/placements.ts`, `setPlacement` (un Placement
dans une voiture) et `removePassengers` verrouillent d'abord le Ride avec `lockRide`
(`src/db/rides.ts`, `SELECT … FROM ride … FOR UPDATE`), dans la transaction de l'appelant
ou dans celle qu'ouvre `atomically` (`src/db/transaction.ts`). `deletePlacement`, lui, ne
verrouille pas le Ride et n'en a pas besoin : un `DELETE` ne déclenche pas
`placement_driver_on_leg` et ne contrôle pas la clé `placement → ride`, donc il ne
verrouille ni Ride ni Person. Au pire, une prise de place simultanée compte encore la place
qui se libère et la refuse, sans jamais surcharger la voiture.

Une écriture qui verrouille **plusieurs** Rides les verrouille par identifiant croissant,
quel que soit leur leg (`lockRides`, `src/db/rides.ts`), puis les Persons par identifiant
croissant (`lockPersons`, `src/db/persons.ts`). Ainsi, proposer une voiture sur les deux
legs (`offerRide`, `src/app/e/[id]/offer-ride.ts`) verrouille les Rides que qui conduit
quitte, sur ce leg et sur l'autre, puis sa Person et celles des personnes qui montent avec
elle. Verrouillés par leg, deux propositions qui quittent les deux mêmes Rides dans des
rôles inverses tiendraient chacune l'un et attendraient l'autre. Une écriture qui ne
verrouille qu'un Ride, comme une prise de place, suit déjà cet ordre. Les Rides qu'une
écriture crée ne sont pas verrouillés avant les Persons : personne ne les voit avant la
validation. Y placer des passagers (`setPlacement`) les verrouille ensuite, après les
Persons, sans attente possible pour la même raison.

Le déclencheur `placement_driver_on_leg` tient lui-même cet ordre : quand `ride_id` est
renseigné, il prend le Ride `FOR KEY SHARE`, le verrou que la clé `placement → ride`
prend à l'insertion, **avant** la Person `FOR UPDATE`. Une écriture qui aurait oublié
`lockRide` attend donc le Ride sans tenir la Person, au lieu de se bloquer mutuellement
avec une prise de place. Ces verrous se prouvent par des tests de concurrence (voir « Base
de test (Vitest) ») : `src/db/rides.test.ts`, `src/db/placements.test.ts`,
`src/db/participant-tables.test.ts` et `src/app/e/[id]/offer-ride.test.ts`.

### L'Event d'abord (#260)

À partir de #260 (epic #250), l'organisateur peut supprimer le retour pendant qu'un
participant écrit dessus. L'ordre des verrous devient donc **Event, puis Ride, puis
Person**, dans tout le code :

- Toute écriture de `seats.ts`, `persons.ts`, `offer-ride.ts` et `change-ride.ts`
  (`src/app/e/[id]/`) commence sa transaction par `lockEvent(trx, id, "share")`
  (`src/db/events.ts`, `SELECT … FROM event … FOR SHARE`), au travers de `lockLegs`
  (`src/app/e/[id]/retour.ts`). Ces verrous partagés ne s'attendent pas entre eux : deux
  prises de place restent sérialisées sur le Ride seulement.
- Une modification de l'événement prend `lockEvent(trx, id, "noKeyUpdate")`
  (`FOR NO KEY UPDATE`). Elle attend les écritures sur les legs en cours, et celles qui
  arrivent l'attendent. Pour supprimer le retour, elle recompte ses lignes sous ce verrou
  (`countLegRows`, `src/db/legs.ts`), les supprime (`deleteLegRows` : les Placements, puis
  les Rides) par `removeRetour`, puis écrit `retour_at` à `null` (`writeEventFields`), dans
  la même transaction.
- Sous `READ COMMITTED`, un verrou obtenu après une attente rend la ligne validée : une
  écriture qui a attendu la suppression voit `retour_at` à `null`. Une écriture sur un leg
  que l'événement n'a pas répond `noRetour` avec l'état, avant tout autre refus de la
  transaction, `rideGone` et `forbidden` compris. Seules la passent une requête mal formée
  (`invalid`, qu'aucune page n'envoie), où qu'elle soit lue : avant la transaction, ou dans
  la transaction après `lockLegs`, comme dans `addPerson` et `setPersonLeg` (`persons.ts`) ;
  et les erreurs de champs, lues avant la transaction.
- La suppression tourne en `READ COMMITTED`, le niveau qu'ouvre `atomically`. En
  `REPEATABLE READ`, le recomptage garderait l'instantané pris avant le verrou : il ne
  verrait pas une écriture sur le retour validée pendant l'attente, trouverait les mêmes
  nombres, et laisserait sa ligne cachée sous un `retour_at` à `null`.
- La modification de l'événement est `updateEvent` (`src/app/e/[id]/admin/actions.ts`),
  dont le cas d'usage est `editEvent` (`src/app/e/[id]/edit-event.ts`, #263). Elle compare
  `before` à la ligne que rend le verrou, jamais à un instantané pris avant lui, puis
  supprime le retour s'il est décoché, et écrit les champs, dans la même transaction
  d'`atomically`.

Ainsi, lancées ensemble, une suppression du retour et une écriture sur le retour se
terminent de deux façons seulement : la suppression refusée parce que les nombres ont changé
(`confirmRetour`), ou l'écriture refusée par `noRetour`. Aucune ligne du retour ne reste
sous un `retour_at` à `null` : cachée, elle reviendrait le jour où le retour est rajouté.
La preuve est dans `src/app/e/[id]/retour.test.ts` (M3.6, données validées), dans les deux
ordres, pour une prise de place, « sans voiture », une voiture proposée et une personne
ajoutée « Aller et retour ». `src/app/e/[id]/edit-event.test.ts` refait la preuve au travers
d'`editEvent`, pour une prise de place et une voiture proposée.

### Retirer une personne (#645)

À partir de l'épique #645 (maquette `docs/design/remove-person/` v2, RP2.8), une Person peut
être retirée d'un événement : sa ligne `person`, ses Rides et ses Placements sont supprimés
dans une seule transaction d'`atomically`, en `READ COMMITTED`. Le retrait suit l'ordre
Event, puis Ride, puis Person, en quatre temps :

1. L'Event en partage, par `lockEvent(trx, id, "share")` (`src/db/events.ts`), comme
   `lockLegs` sans leg. Un retrait et une suppression du retour se suivent donc dans l'ordre
   où ils prennent l'Event, et deux retraits ne s'attendent pas sur lui.
2. Les Rides que la personne conduit, sur les deux legs, lus (`findDrivenRides`) puis
   verrouillés par identifiant croissant (`lockRides`, `src/db/rides.ts`).
3. Sa Person (`lockPersons`, `src/db/persons.ts`).
4. Ensuite seulement, la suppression : ses Rides, dont les passagers repassent « sans
   voiture » par la clé `placement → ride`, ses Placements, puis la Person.

Un simple `DELETE` de la Person, laissé à la cascade de `ride (driver_id, event_id)`,
inverserait cet ordre. Postgres verrouille d'abord la ligne `person` qu'il supprime, puis la
cascade verrouille ses Rides : la Person passe avant le Ride. Une écriture qui tient l'un de
ces Rides et attend ensuite cette Person (`lockPersons` après `lockRides`, ou les
déclencheurs de C12.8) attendrait le retrait pendant que le retrait l'attend. Postgres
romprait cet interblocage en faisant échouer l'une des deux (`40P01`) : c'est un `failed`,
que RP2.8 exclut.

Sous `READ COMMITTED`, un verrou obtenu après une attente rend la ligne validée. Le retrait
relit donc sous ses verrous ce qu'il a lu avant eux :

- **La Person.** `lockPersons` rend les identifiants qu'il a verrouillés. S'il ne rend rien,
  la personne a été retirée pendant l'attente, par l'autre chemin ou par la même requête
  renvoyée. La réponse est alors `alreadyRemoved`, et rien n'est écrit (RP2.6). Lancés
  ensemble depuis l'appareil et depuis l'espace organisateur, deux retraits donnent ainsi un
  `removed` et un `alreadyRemoved`.
- **Ses Rides.** Ils sont relus une fois la Person verrouillée. À partir de là, aucune
  écriture ne peut plus lui donner de voiture : `offerRide` verrouille la Person de qui
  conduit avant de créer son Ride, et `ride_driver_placed` la verrouille aussi. Une voiture
  apparue entre la lecture et le verrou, c'est-à-dire une offre validée pendant l'attente,
  n'est pas verrouillée. La transaction est alors annulée et reprise du début, comme
  `DriverMoved` dans `offerRide`, au lieu de verrouiller ce Ride après la Person. Decision :
  reprendre la transaction plutôt que verrouiller tard. — Reason : c'est le précédent
  d'`offerRide`, et l'ordre Ride, puis Person, reste vrai sans exception.
- **La borne de la reprise (#665).** Une seule reprise. La première tentative tient l'Event
  en partage. La reprise le tient en `FOR NO KEY UPDATE` (`lockEvent(trx, id,
  "noKeyUpdate")`), comme une modification de l'événement : toute écriture sur ses legs, dont
  `offerRide`, prend l'Event en partage dès sa première instruction, donc aucune ne tourne
  pendant la reprise, et aucune voiture de la personne ne peut plus y apparaître. Il n'y a
  rien au-delà de la borne, donc jamais de `failed` (RP2.8). Decision : une reprise, sous le
  verrou exclusif de l'Event, plutôt que trois essais en partage comme `offerRide`. —
  Reason : trois essais en partage finissent en `failed` si la voiture apparaît à chaque
  fois, ce que RP2.8 exclut ; sous le verrou exclusif, la reprise ne peut pas échouer pour
  cette raison. Elle ne coûte qu'une attente des écritures en cours sur l'événement, pour un
  cas rare : une voiture proposée par cette personne au moment même où on la retire. Avec
  une transaction passée par un test, il n'y a pas de reprise, comme dans `offerRide`.

Les autres écritures voient un retrait de la même façon. Avec une requête et un jeton bien
formés, une personne absente de l'événement donne `personGone`, avec l'état, et non plus
`forbidden`. La personne d'un autre jeton garde `forbidden`, et `noRetour` passe toujours
avant les deux. C'est le cas d'`updatePerson` et de `setPersonLeg` (`persons.ts`), de
`takeSeats` (`seats.ts`, tout ou rien : une seule personne retirée refuse tout) et
d'`offerRide` (`offer-ride.ts`, un conducteur ou un passager coché retiré). Le contrôle se
fait sur ce que rend `lockPersons`, jamais sur la seule lecture d'avant le verrou : une
personne retirée pendant que l'écriture attendait sa Person est vue absente. Une prise de
place n'insère donc jamais un Placement vers une Person supprimée, ce qui serait une
violation de clé (`23503`), donc un `failed`. `undoSeats` laisse de côté une personne
retirée et rend les autres (C7.4), et répond `Seat.alreadyOut` s'il ne reste personne à
rendre. `change-ride.ts` ne change pas : la voiture d'un conducteur retiré donne `rideGone`,
et un sortant retiré donne `passengersChanged` si le retrait est validé avant que la réduction
lise ses passagers. S'il est encore en cours, la réduction, qui l'a lu parmi eux, attend pour le
sortir, trouve sa ligne effacée et réussit : le retrait ne verrouille pas le Ride où la personne
est assise, et le résultat est celui qu'a choisi le conducteur (décision du coordinateur, #767).
La preuve est un test de concurrence sur
données validées, dans les deux ordres, pour les huit cas de RP2.8 (#667).

### L'adresse après l'Event (#581)

Les limites d'envoi (3 e-mails de confirmation par heure et par événement, 5 par heure vers
une même adresse, 5 demandes de connexion par heure et par adresse, et un plafond global
horaire, inférieur au quota de Brevo) se comptent sur `email_send`, et l'envoi s'y inscrit
dans la même transaction que le comptage. Compter puis écrire sans verrou laisserait passer
deux envois simultanés au-delà de la limite, comme deux taps sur la dernière place. Le
comptage se fait donc sous verrou, et l'ordre devient **Event, puis adresse** :

- Un envoi pour un événement (création, « Renvoyer l'e-mail », « Corriger l'adresse »,
  nouveau lien après un lien de confirmation expiré) verrouille d'abord l'Event
  (`lockEvent`), puis l'adresse, puis compte la limite de l'événement et celle de l'adresse.
- Une demande de connexion, qui n'a pas d'événement, ne verrouille que l'adresse. Venue de
  `/e/{id}/admin`, elle tient d'abord la clé de cet Event (`holdEventKey`, `FOR KEY SHARE`,
  #603) : la purge ne le supprime pas avant que le lien, qui y mène (OA4.4), soit écrit, et
  aucune écriture sur l'Event n'attend. Puis l'adresse, puis le plafond global, puis le
  lien dans la même transaction ; l'e-mail part après la validation
  (`src/app/connexion/request-link.ts`).
- Le plafond global se compte dans la même transaction. S'il prend un verrou, ce verrou
  vient après celui de l'adresse. Deux décisions de la relecture de #623 :
  - les avertissements d'inactivité (#616) ne comptent pas dans le plafond global ; la
    tâche quotidienne en envoie 20 au plus par passage (voir « La purge ») ;
  - une création que le plafond global bloque (#599) s'inscrit
    `send_status = address_limit`, et son avis dit « L'e-mail n'est pas parti », comme à la
    limite par adresse.
- Une adresse n'est jamais verrouillée avant l'Event. Le verrou d'adresse ne dure que la
  transaction, et il est pris sur l'adresse telle que `src/domain/email-address.ts` la lit,
  pas sur une ligne de compte : une adresse sans compte se limite aussi (OA3.5).

La preuve est un test de concurrence (#594), sur données validées, comme ceux des Rides.
Un lien de connexion ou de confirmation ne sert qu'une fois, même quand deux requêtes le
présentent ensemble : un test de concurrence le prouve aussi.

À partir de #594, `recordSend` (`src/db/email-sends.ts`) prend l'Event en `noKeyUpdate` (#599
et #602 écrivent sa ligne dans la même transaction : deux `share` s'interbloqueraient en
passant à l'exclusif), puis l'adresse et le plafond global (`pg_advisory_xact_lock`), et
l'e-mail part **après** la validation. À partir de #599, un lien de confirmation ne naît que
par `claimConfirmation` (`src/db/email-links.ts`) : l'Event en `noKeyUpdate`, puis
`recordSend`, puis le lien, si l'envoi est accepté, dans la même transaction. Sans ce
verrou, l'insertion du lien ne prendrait l'Event qu'en `FOR KEY SHARE`, par sa clé
étrangère, que le verrou de la purge n'attend pas : un lien inséré pendant l'anonymisation
y survivrait. Un Event supprimé ou anonymisé pendant l'attente ne reçoit ni envoi ni lien.
`useLink` (`src/db/email-links.ts`) s'use en un
`update … where … and used_at is null … returning`, après l'Event pour une confirmation.
Les deux ne sont justes qu'en `READ COMMITTED`, le niveau qu'ouvre `atomically`.

## Jetons, et pourquoi ils sont la pièce critique

Un participant n'a pas de compte, et l'organisateur n'a pas de mot de passe (#581) : **un
jeton est la seule identité**. Donc un jeton qui fuit est une prise de contrôle, et un jeton
deviné l'est aussi.

- 128 bits au minimum, tirés d'un générateur cryptographique.
- **Hashés en base**, jamais stockés en clair : une copie de la base ne donne pas les accès.
- **Jamais dans le chemin ni dans la query string d'une URL.** Vercel journalise le chemin de
  chaque requête, et ces journaux ne nous appartiennent pas. Un jeton qui voyage dans une URL
  le fait dans le **fragment** (`#…`), que le navigateur n'envoie jamais au serveur : le
  client le lit et le transmet dans le corps de la requête. Pour le lien admin, ce corps est
  celui de `loadOrganiserPanel`, qui répond `{ state: "invalid" }` sans aucune donnée, ou le
  panneau, et rien d'autre (amendement de #3 C4.9). À partir de #596, ce corps est
  `{ adminToken, session }`, et la réponse est le panneau ou l'état que décide
  `organiser-access.ts`, sans aucune autre donnée : `invalid` pour un événement inconnu,
  `signIn`, `notYours` avec l'adresse de la session du visiteur, `pending`, `orphan` ou
  `ended`. Le panneau n'est jamais dans le HTML.
  À partir de #263, c'est aussi celui d'`updateEvent`, la modification de l'événement : un
  jeton refusé répond `invalid` sans rien écrire, et aucune réponse ne porte le jeton.
  - lien admin : `/e/{id}/admin#{token}`, jusqu'à #597 ; ensuite il n'y a plus de lien
    d'organisateur, et un fragment sur `/e/{id}/admin` est ignoré (OA7.5)
  - lien perso : `/e/{id}/moi#{token}`
  - lien de connexion : `/connexion/lien#{token}`, et lien de confirmation :
    `/connexion/confirmer#{token}`, à partir de #605 et #608
- **Jamais journalisés**, ni en clair ni tronqués, ni côté serveur ni dans un rapport
  d'erreur. À partir de #234, un rapport part vers Sentry seulement si un DSN est configuré,
  et il est reconstruit par les hooks de `src/observability/scrub.ts` (voir « Emplacement du
  code »).
- Comparaison à temps constant.
- `Referrer-Policy: no-referrer` sur toutes les pages : le fragment n'est pas transmis dans le
  `Referer`, mais l'identifiant de l'événement l'est.

Les jetons ne naissent pas tous au même endroit :

- Le **jeton d'organisateur** est tiré par le **serveur** (`newAdminToken`,
  `src/domain/admin-token.ts`) quand l'événement est créé, et revient une fois dans le corps
  de la réponse. Les jetons de **session** et de **lien** (#581) sont tirés par le serveur
  eux aussi (voir « Session, liens et jeton d'admin »).
- Le **jeton personnel** est tiré par le **navigateur**, à partir de #66 (D1, D4) : une
  réponse perdue après l'écriture ne doit pas emporter le seul jeton qui permet de modifier
  la personne créée.
  - Il est tiré avec `crypto.getRandomValues` : 16 octets, soit 128 bits, écrits en
    22 caractères base64url canoniques (`^[A-Za-z0-9_-]{21}[AQgw]$`). Le serveur refuse
    toute autre forme : trop court, trop long, caractère hors alphabet, absent, ou autre
    chose qu'une chaîne.
  - Il est rangé dans `localStorage` sous une clé propre à l'événement
    (`fullcar:personal-token:{id}`), **avant** l'envoi de la requête qui le crée. Si
    `localStorage` est indisponible, il est gardé en mémoire le temps de la page, avec un
    avertissement avant l'inscription (D5).
  - Dans une requête, il voyage dans le **corps**, jamais ailleurs : ni chemin, ni query
    string, ni en-tête, ni cookie.
  - Il est stocké en empreinte SHA-256 et comparé à temps constant, comme le jeton
    d'organisateur.

Un jeton dans `localStorage` est lisible par tout script de l'origine : aucun script tiers
ne s'y exécute (#64).

Toute PR qui touche la génération, le stockage, la comparaison, le transport ou la
journalisation d'un jeton est une zone sensible : elle est mergée par l'humain.

### Session, liens et jeton d'admin (#581)

À partir de l'épique #581 (maquette `docs/design/organizer-account/`, critères OA1 à OA11),
l'organisateur a un compte, et trois jetons de plus servent à l'organisateur. Les règles
ci-dessus valent pour chacun.

- **Tirés par le serveur**, 128 bits d'un générateur cryptographique, par
  `src/domain/server-token.ts` (#593), que `newAdminToken` partage. Ils sont stockés en
  empreinte SHA-256 (`hashToken`, `src/domain/token-hash.ts`), comme les autres : `session` pour le jeton de session, `email_link` pour le jeton d'un lien,
  `event.admin_token_hash` pour le jeton d'admin. À partir de #586, `admin_token_hash` peut
  être nul, et un hash nul se lit « pas de jeton » : aucun jeton ne lui correspond.
- **Dans le corps seulement.** Le jeton de session et le jeton d'admin voyagent dans le corps
  de la server action qui en a besoin (la visite, Mes événements, l'espace organisateur, la
  création, « Se déconnecter », « Supprimer mon compte »), jamais dans un chemin, une query
  string, un en-tête ou un cookie. Le jeton de session ne revient dans une réponse qu'une
  fois, dans le corps de l'action qui ouvre la session. Le HTML d'une page ne dépend
  d'aucune session : ce qu'un jeton ouvre est lu après le chargement, comme le panneau.
  Ainsi « Session ouverte avec {email}. » de `/connexion` (OA4.6, #604) : l'action
  `signedInAs` (`src/app/connexion/actions.ts`) reçoit le jeton dans le corps et ne répond
  que l'adresse de la session ouverte, ou rien ; elle ne compte pas comme une visite.
- **Pas de cookie, pas de middleware.** Aucun cookie ne porte une session ni un jeton : le
  seul cookie reste celui de la langue. Aucun `middleware.ts` ni `src/proxy.ts` ne lit une
  session. Une session terminée entre l'affichage d'une page et son envoi se voit donc en
  base, par l'action qui reçoit le jeton (OA1.5, décision 3 du coordinateur sur #581).
- **La session dans le navigateur** : dans `localStorage`, sous la clé `fullcar:session`,
  au travers de `src/app/session-token.ts` seulement (#595). Une session dure 90 jours après
  la dernière **visite**. La visite s'enregistre à chaque chargement de page :
  `src/components/account/session-visit.tsx`, monté par `src/app/layout.tsx`, envoie le
  jeton à l'action `visit` (`src/app/actions.ts`), qui prolonge la session et note la date
  et la langue de la visite sur le compte (`last_visit_at`, `locale`). C'est cette date,
  jamais l'ouverture de la session, qui mesure l'inactivité du compte (OA9.7). La visite
  part une fois par document chargé, pas à chaque navigation dans l'application, et rien ne
  part sans jeton. Elle ne répond que `open` ou `ended` : ni le compte, ni son adresse. Une
  session terminée ne revient pas, et le navigateur oublie alors son jeton, seulement s'il
  n'a pas changé entre-temps (un autre onglet a pu ouvrir une session). Une visite en échec
  garde le jeton.
- **Le jeton d'admin dans le navigateur de création** : à partir de #597, il est rangé dans
  `localStorage` sous la clé `fullcar:admin-token:{id}`, au travers de
  `src/app/e/[id]/admin/admin-token-store.ts` seulement, qui remplace `admin-link.ts`. La
  création mène à `/e/{id}/admin`, sans fragment. Le jeton est révoqué (son hash passe à
  nul) par « Se déconnecter » dans ce navigateur, qui envoie les jetons d'admin qu'il garde
  et les efface, par l'anonymisation, et par la suppression du compte.
- **Les liens** : un lien de connexion vaut 1 heure, un lien de confirmation 7 jours, et
  celui-ci ne rattache que son propre événement. Chacun ne sert qu'une fois, et plusieurs
  liens non utilisés restent valables ensemble. La page du lien lit le jeton dans
  `location.hash` et ne l'envoie qu'à l'appui sur le bouton, jamais au chargement : un
  scanner d'e-mails qui suit le lien ne l'use pas (OA5.1). Elle retire ensuite le fragment
  de la barre d'adresse et de l'historique (OA5.2). « Corriger l'adresse » supprime les
  liens de l'événement envoyés à l'ancienne adresse (OA2.5). Le jeton d'un lien de
  connexion ou de confirmation passe aussi par Brevo et par la boîte de l'organisateur, où
  il est en clair. Le lien perso, et le lien admin jusqu'à #597, sont en clair partout où
  la personne les copie.
- **Une seule règle d'accès** à l'espace organisateur : `src/domain/organiser-access.ts`
  (#596). Elle donne l'accès à la session du compte de l'événement, ou au jeton d'admin du
  navigateur de création. `withOrganiserPhones` n'accepte qu'une autorisation produite par
  cette règle (voir « Visibilité du téléphone »).
- **Le retrait d'une personne par l'organisateur** (#645, `removeAsOrganiser`,
  `src/app/e/[id]/remove-person.ts`). Le droit de retirer vient du seul jeton d'admin :
  aujourd'hui par `adminTokenMatches`, comme `editEvent`, puis par `organiser-access.ts`
  seul (#675). La requête porte aussi le jeton personnel de l'appareil, mais seulement pour
  relire le tableau que la page montre (`readEventState`), dont « Vos inscriptions » et les
  numéros visibles dépendent de ce jeton. Ce jeton ne donne aucun droit sur ce chemin : un
  jeton personnel n'ouvre jamais le retrait par l'organisateur, pas même celui du navigateur
  de création (RP3.3). L'identifiant de la personne voyage dans le corps, jamais dans l'URL.
  Après le retrait, le panneau est relu, avec la section « Personnes inscrites »
  d'organizer-view v3.5. Le focus suit O5.8, tel qu'amendé par organizer-view v3.5. Le
  repère de la barre est le bouton de l'espace organisateur replié (O8) quand le panneau est
  replié.
- **Jamais journalisés**, ni les jetons ni les adresses e-mail (OA11.1) : un journal ne
  porte que des mots fixes et des nombres.

## Identifiant public

L'identifiant de `/e/{id}` est aléatoire et non devinable : on ne doit pas pouvoir parcourir
les événements pour récolter des prénoms. Ce n'est pas un jeton (il ne donne aucun droit
d'écriture), mais il n'est jamais séquentiel.

Il doit aussi être **court** : 8 caractères tirés d'un générateur cryptographique, sensibles
à la casse, dans un alphabet de **57 symboles** sans caractères ambigus (ni `0`, ni `O`, ni
`1`, ni `l`, ni `I`) :

```
23456789 ABCDEFGHJKLMNPQRSTUVWXYZ abcdefghijkmnopqrstuvwxyz
```

soit `^[2-9A-HJ-NP-Za-km-z]{8}$`, 57⁸ ≈ 1,1·10¹⁴ valeurs, environ 46,7 bits. C'est assez pour
que l'énumération reste hors de portée **sans limite de débit** : même à mille requêtes par
seconde, tomber sur un événement parmi mille en cours prend plus de trois ans.

## Visibilité du téléphone : une règle, un seul endroit

À partir de #66 (D2), le téléphone d'une personne n'est envoyé que dans trois cas :

- l'appareil a une personne **dans la même voiture, pour le même leg**, conducteur
  compris, dans les deux sens ;
- la personne est une **personne de l'appareil** (créée avec le jeton personnel que ce
  navigateur garde pour cet événement) ;
- à partir de #154 (DO1), la personne est **sans voiture sur un leg**, et la requête est
  celle de l'espace organisateur, dont le corps porte le jeton d'admin de l'événement,
  vérifié par le serveur : son numéro n'est posé que dans la liste « Sans voiture » de ce
  leg.

Le numéro est posé **voiture par voiture**, et dans la section des personnes de l'appareil,
jamais sur la personne elle-même : un passager de l'aller ne voit pas le numéro de son
conducteur sur le retour, où ils ne partagent pas de voiture. Pour l'organisateur (DO1,
#154), le numéro n'est posé que dans la réponse de l'espace organisateur, dans la liste
« Sans voiture » d'un leg. Du numéro de la personne qui conduit, cette réponse ne dit que
s'il existe, jamais lequel. Elle ne porte le numéro d'aucun conducteur, d'aucun
passager placé, d'aucune personne pas concernée. Le tableau des participants de
`/e/{id}/admin` suit la règle des appareils, comme `/e/{id}`. Un jeton d'admin faux, absent
ou mal formé ne donne aucun numéro de plus.

Cette règle ne doit exister **qu'à un seul endroit** du code, traversé par toutes les
lectures. Si deux chemins la re-dérivent, l'un des deux finira par la rater — et le défaut
sera invisible dans l'UI de celui qui l'a écrit. À partir de #66, cet endroit est
`src/domain/phone-visibility.ts`, et une seule requête lit la colonne `phone` :
`src/db/event-rows.ts`. Un test de présence de `phone` sous le verrou de la Person est
permis (`phone IS NOT NULL`, qui rend un booléen, jamais la valeur, #766) ; lire sa valeur
hors de cette requête reste bloquant. `event-rows.ts` renvoie les téléphones **à part** des autres données
(`phonesById`), et seuls `withVisiblePhones` et `withOrganiserPhones` (`phone-visibility.ts`)
les reçoivent et les posent : un `row.phone` recopié ailleurs, dans le board par exemple,
re-dériverait la règle. Depuis #596, `withOrganiserPhones` ne reçoit plus le jeton mais une
autorisation, que seule `src/domain/organiser-access.ts` produit : la session de
l'organisateur ou le jeton d'admin du navigateur de création (OA7.6). Il ne rend rien pour
une autorisation que la règle n'a pas donnée, pour cet événement : un objet de même forme,
une copie, ou l'autorisation d'un autre événement. Une liste de colonnes qui
contient `phone` reste privée à `event-rows.ts` (non exportée) : un `.select(cette liste)`
ailleurs serait une nouvelle lecture.

Ce test, à partir de #776, est `hasPhone` (`src/db/persons.ts`) : `offerRide` l'appelle
après `lockPersons`, dans la même transaction, pour la personne de l'appareil qui conduit.
Hors d'`event-rows.ts`, `phone` n'apparaît que dans ce test et dans les écritures
(`insertPerson`, `updatePerson`). Sans numéro en base et sans numéro envoyé, c'est le refus
`driverWithoutPhone`, qui porte l'état (C11.6). Le numéro envoyé est écrit par
`updatePerson` après tous les refus d'avant les écritures, et avant `deletePlacement` : dans
la même écriture que les voitures. Une offre renvoyée (C4.10) n'écrit rien de plus.

## Auto-complétion des lieux (#237)

À partir de l'épic #237 (maquette `docs/design/place-autocomplete/`), le lieu de l'événement
et celui d'une voiture peuvent recevoir une **position**, choisie parmi des propositions. Sur
main : la position dans le domaine et en base, l'événement (#420) et les voitures (#421) qui
l'enregistrent, l'état de la page qui la porte (#422), la route des propositions et son appel à
Photon, l'état du champ dans le navigateur, et les quatre formulaires qui montrent le champ :
« Créer un événement » (#428), « Proposer une voiture » (#430), « Modifier la voiture » (#431)
et « Modifier l’événement » (#432).

### Un lieu, une valeur

`src/domain/place.ts` (#418) : un lieu est **une seule valeur**, `{ text, position }`, où
`position` vaut `{ lat, lng }` ou `null`. La position voyage avec son texte : le serveur
reçoit et écrit le lieu d'une voiture en couple, `location` et `position` (voir « La position
d'une voiture »).

- `positionOf` lit une position reçue : `null` reste `null` ; un objet de deux nombres finis
  exactement, `lat` entre −90 et 90 et `lng` entre −180 et 180, devient la position arrondie à
  5 décimales (environ un mètre). Tout le reste est `invalid`, pas une exception. `undefined`
  n'est pas une valeur : chaque appelant le lit comme « pas envoyée ».
- `samePlace` compare deux lieux : même texte et même position (`samePosition`, à
  5 décimales) ; le même texte avec une autre position est un changement. « Modifier la
  voiture » compare ainsi son lieu (`rideChange`, `src/components/event/ride-change.ts`,
  #431) : changé, il part `location` et `position` ensemble ; non changé, ni l'un ni l'autre.
  Côté serveur, `ridePositionChange` compare **le texte seul**, et c'est voulu (voir « La
  position d'une voiture »).
- En base (migration `0003_positions`, #417) : `location_lat` et `location_lng`,
  `double precision` nullables, sur `event` et sur `ride`. La base vérifie la paire (les deux
  ou aucune) et les bornes, pas l'arrondi : c'est le domaine qui arrondit, parce que l'égalité
  d'un flottant arrondi n'est pas fiable en SQL.
- **La position d'une voiture est toujours celle de son texte.** Dans le champ, `typed`
  (`src/components/event/place-field-state.ts`, #427) retire la position d'une voiture
  (règle `car`) à la première frappe qui change le texte ; celle de l'événement (règle
  `event`) reste, jusqu'à « Retirer » (`removed`) ou jusqu'à ce que le champ soit vidé. Le
  serveur applique la même règle (voir « La position d'une voiture »).

### La position d'une voiture (#421)

Le lieu reste un seul champ de la voiture, `location` ; sa position voyage avec lui, sous la
clé `position`, et une position envoyée est lue par `positionOf`, donc arrondie à 5 décimales.

- **Proposer une voiture** (`offerRide`, `src/app/e/[id]/offer-ride.ts`) : `position` à côté
  de `location`, et `otherLeg.position` pour la voiture de l'autre leg (`kind: "drive"`).
  Absente, elle vaut `null`. Mal formée, hors bornes, ou envoyée sans `location` : l'offre
  est `invalid`, et rien n'est écrit.
- **Modifier la voiture** (`updateRide`, `src/app/e/[id]/change-ride.ts`) : `readChange` lit
  `position` (absente, elle n'est pas envoyée ; mal formée, `invalid`). Sous le verrou du
  Ride, `lockRide` (`src/db/rides.ts`) rend aussi le `location` enregistré, et
  `ridePositionChange` (`src/domain/ride.ts`, fonction pure) décide :
  - `location` et `position` envoyées : les deux sont écrites, `null` compris ;
  - `location` seule (une page d'avant le déploiement) : sous le même texte que celui
    enregistré, la position ne change pas ; sous un autre, elle devient `null`, puisque la
    position d'une voiture est toujours celle de son texte ;
  - `position` seule : `invalid`, qu'aucun formulaire n'envoie.

  La comparaison du texte seul (`sent.location === storedLocation`) est **voulue** : une page
  d'avant le déploiement n'envoie pas de position, il n'y a donc que le texte à comparer. Ce
  n'est pas un oubli de `samePlace`, et elle ne se « corrige » pas.
- **Accès aux données** (`src/db/rides.ts`) : `insertRide` écrit la position et `StoredRide`
  la rend ; `updateRide` n'écrit `location_lat` et `location_lng` que si `position` est
  donnée. `seedRide` (`src/db/test-participants.ts`) crée une voiture sans position, sauf si
  le test en donne une.
- **Lecture** (#422) : `readEventRows` (`src/db/event-rows.ts`) lit `location_lat` et
  `location_lng` de chaque voiture, et `RideRow` et `BoardCar` (`src/domain/board.ts`)
  portent `position`, `null` quand il n'y en a pas. L'état de la page porte ainsi la position
  de chaque voiture, pour les appareils (`withVisiblePhones` recopie la voiture entière) comme
  pour l'organisateur (`withOrganiserPhones` la recopie champ par champ, `position` comprise).

### Le chemin d'une proposition

Le navigateur ne joint jamais Photon : il appelle notre route, qui appelle Photon.

- **Une route, pas une server action** : Next exécute les server actions d'une page l'une
  après l'autre, et un appel lent à Photon bloquerait les autres. Le texte voyage dans le
  **corps** JSON, `{ text, locale, near? }`, jamais dans une URL, que Vercel journalise.
- **La route** : `src/app/api/lieux/route.ts` n'exporte que `POST` (Next répond lui-même 204 à
  `OPTIONS`, sans l'appeler, et 405 aux autres méthodes, `HEAD` compris), qui délègue à `handlePlaces` (`src/app/api/lieux/handle.ts`, #425) :
  - 403, sans appel, si `Origin` manque ou n'a pas l'hôte de la requête
    (`x-forwarded-host`, à défaut `Host`) : la règle que Next applique à ses server actions ;
  - 400 `{ state: "invalid" }` pour un corps de plus de 1 024 octets, qui n'est pas de
    l'UTF-8 ou du JSON, ou que `placeQueryOf` refuse (`src/domain/suggestion.ts` : texte de
    3 à 120 caractères après `trim`, `locale` `fr` ou `en`, `near` facultatif) ;
  - sinon 200, `{ state: "ok", suggestions }` ou `{ state: "unavailable" }`.

  Toujours `Cache-Control: no-store`. La route ne journalise rien : le corps porte ce que la
  personne a tapé.
- **Ce que Photon reçoit** (`photonQuery`, #423) : `q`, `limit=5`, `lang`, et la zone de
  l'événement en `lat` et `lon` arrondis à **1 décimale** (environ 10 km, `nearOf`) : la
  position exacte de l'événement ne part jamais. En en-têtes, le code ne pose que
  `User-Agent: fullcar/{version} (+https://github.com/olaurendeau/fullcar)` et `Accept` ; les
  autres sont les valeurs par défaut de `fetch` (`accept-language`, `sec-fetch-mode`,
  `pragma`, `cache-control`, `accept-encoding`), et rien n'est recopié de la requête du
  visiteur.
- **Ce qui revient** : `suggestionsOf` fait de la réponse GeoJSON au plus 5 propositions
  `{ label, lat, lng }`, libellées comme la maquette les écrit, sans doublon ni libellé de
  plus de 120 caractères.

### L'appel à Photon

`src/app/api/lieux/photon.ts` (#424). L'instance publique de komoot ne promet rien :
`unavailable` est un **état normal**, jamais une exception levée. `createPhoton` crée une
instance à chaque appel ; `route.ts` l'appelle une seule fois, au chargement du module, d'où
une instance par instance serveur : son cache, son plafond et son disjoncteur vivent autant
qu'elle.

- **Cache** : en mémoire, 500 entrées, 1 h, la moins récemment lue sortie la première. Clé
  (`cacheKey`) : le texte en minuscules et ses espaces réduits, la langue, la zone. Seules les
  réponses `ok` y entrent, vides comprises.
- **Plafond** : 5 appels par seconde ; au-delà, `unavailable` sans appel.
- **Délai** : 3 s.
- **Disjoncteur** : un 429, un 5xx ou 3 s sans réponse l'ouvrent, pour la durée de
  `Retry-After` bornée entre `PLACES_BREAKER_MS` et 1 h ; un `Retry-After` absent ou illisible
  (`retryAfterMs`, voir « Les tuiles ») donne `PLACES_BREAKER_MS`. Ouvert, il répond
  `unavailable` sans appel. À `0`, il ne s'ouvre jamais, `Retry-After` compris.
- **Défenses** : `cache: "no-store"` (le cache de données de Next garderait la réponse sous
  l'URL qui porte le texte), `redirect: "error"` (une redirection porterait le texte à un
  autre hôte), réponse lue jusqu'à 64 Kio, 20 éléments au plus.
- **Journal** : un échec écrit `photon: unavailable (…)`, avec un mot fixe (`timeout`,
  `no answer`, `unreadable answer`, `answer too large`) ou le statut HTTP, jamais le texte,
  l'URL ni la réponse. Pour Sentry, `scrubUrl` garde `/api/lieux` et le chemin de Photon, et
  retire la query et le fragment (#449).

| variable | sans elle | effet |
|---|---|---|
| `PHOTON_URL` | `https://photon.komoot.io/api/` | l'adresse de recherche de Photon ; chaque slot pointe vers son faux Photon |
| `PLACES_BREAKER_MS` | `60000` (aussi pour une valeur qui n'est pas un entier) | la durée minimale du disjoncteur, en millisecondes ; `0` le coupe (les slots) |

### Dans le navigateur

`src/components/event/place-search.ts` (#427) envoie `POST /api/lieux` 300 ms après la
dernière frappe, une requête à la fois par champ, 3 s au plus, et aucune hors ligne ; tout ce
qui n'est pas un `ok` lisible est `unavailable`. `place-field-state.ts` tient l'état du champ
en fonctions pures. Le champ, `place-field.tsx`, s'en sert dans les quatre formulaires.

## La carte de l'événement (#238)

À partir de l'épic #238 (« maquette approuvée, v27 », puis v32 pour #653 et #655, `docs/design/event-map/`, qui fait foi
pour l'écran, les mots, les critères et la table « Mises à jour et focus »), chaque leg a sa
**Carte** quand le lieu de l'événement a une position. Rien de plus n'est stocké, et le
serveur ne reçoit rien de nouveau, sauf les demandes de tuiles : la carte lit la position de l'événement
(`EventHeader.locationPosition`, que `headerFrom` lit, `src/app/e/[id]/event.ts`) et celle de
chaque voiture (`BoardCar.position`, voir « La position d'une voiture »), dans l'état que la
page applique déjà. Les Arrêts (#68) ne sont pas sur la carte.

### Les tuiles : `/tuiles/{z}/{x}/{y}` (#473, #474, #554)

Le navigateur ne joint jamais Geoapify : Leaflet demande chaque tuile à notre route, qui la
demande aux tuiles raster de Geoapify (OpenStreetMap, style `positron` par défaut, en @2x :
une image de 512 × 512 px pour une tuile de 256 px à l'écran) et la rend avec les en-têtes de
cache du CDN de Vercel (`CDN-Cache-Control`). Geoapify voit l'IP de Vercel, notre clé et les
tuiles qui ne sont pas au cache, jamais l'IP ni le navigateur du visiteur.

- **Le domaine** (`src/domain/tile.ts`) : `tileOf`, seul, lit les trois segments, en écriture
  décimale canonique (`^(0|[1-9]\d*)$` : une tuile n'a qu'une URL au cache du CDN), `z` de 0
  à 18, `x` et `y` de 0 à 2^z − 1, et rend `null` pour tout le reste. L'URL du fournisseur
  n'est pas au domaine : `geoapify.ts` l'écrit.
- **La route** : `src/app/tuiles/[z]/[x]/[y]/route.ts` n'exporte que `GET`. Next répond
  lui-même à `HEAD` en l'appelant (un `HEAD` qui n'est pas au cache du CDN appelle donc
  Geoapify, ce qui est accepté, décision du coordinateur sur #238), 204 à `OPTIONS` et 405 aux
  autres méthodes. `GET` délègue à `handleTile` (`handle.ts`), qui ne reçoit que les trois
  segments : ni en-tête ni query du visiteur. `route.ts` crée le client de Geoapify une fois,
  au chargement du module : un client, donc un disjoncteur, par instance serveur.
- **L'appel à Geoapify** (`geoapify.ts`) : `geoapifySettings` lit les quatre variables (table
  plus bas), `createGeoapify` crée le client. La requête est
  `{TILE_UPSTREAM_URL}/{TILE_STYLE}/{z}/{x}/{y}@2x.png?apiKey={clé}` : la base sans sa propre
  query, son fragment ni sa barre finale, la clé encodée (`encodeURIComponent`), seule query,
  qui ne peut pas en ajouter une autre. En en-têtes, le code ne pose que
  `User-Agent: fullcar/{version} (+https://github.com/olaurendeau/fullcar)` et
  `Accept: image/png`, et rien n'est recopié de la requête du visiteur. `cache: "no-store"`
  (le cache est celui du CDN ; le cache de données de Next garderait la tuile sous l'URL qui
  porte la clé), `redirect: "error"` (une redirection porterait la clé à l'hôte qu'elle
  nomme), 5 s corps compris, une tuile lue jusqu'à 2 Mio, jamais au-delà. Rien n'est levé :
  le client rend `{ state: "tile", png }` ou `{ state: "failed" }`.

| Geoapify répond | la route répond | `Cache-Control` | `CDN-Cache-Control` |
|---|---|---|---|
| 200 `image/png` (en toute casse, paramètres permis), qui commence par la signature PNG, 2 Mio au plus | 200 `image/png`, la tuile telle quelle | `public, max-age=86400` | `public, s-maxage=2592000` |
| tout le reste : 401, 403, 404, 429, 5xx, tout autre statut, un 200 qui n'est pas `image/png`, pas un PNG ou de plus de 2 Mio, pas de réponse, 5 s ; et, sans appel, sans clé ou disjoncteur ouvert | 502, sans corps | `no-store` | — |
| rien : les segments que `tileOf` refuse ne l'appellent pas | 404, sans corps | `no-store` | — |

- **Aucune tuile vide** : le 502 et une tuile perdue par le réseau (hors ligne) lèvent le
  `tileerror` de Leaflet, que lit l'avis de tuiles (`tilesStep`, voir « Dans le
  navigateur »). Une panne, le quota ou une clé refusée ne se cachent donc pas sous un fond
  blanc, et rien de cela ne reste au cache.
- **Le disjoncteur** : seul un 429 l'ouvre (ni un 5xx, ni un 401, un 403 ou un 404, ni le
  délai, ni une connexion refusée), pour la durée de `Retry-After` bornée entre
  `TILES_BREAKER_MS` (10 s par défaut) et 1 h ; un `Retry-After` absent ou illisible donne
  `TILES_BREAKER_MS`. Ouvert, il répond `failed` sans appel ni ligne de journal. Un 429 qui
  revient après un autre ne raccourcit pas ce que le premier a ouvert. À `0`, il ne s'ouvre
  jamais, `Retry-After` compris (les slots).
- **`Retry-After`** : `retryAfterMs` (`src/domain/retry-after.ts`), que partagent les
  disjoncteurs de Photon et des tuiles, lit un entier de secondes ou une date HTTP écrite
  comme RFC 9110 l'écrit (IMF-fixdate) et qui nomme un vrai jour ; tout le reste est
  `undefined`. `Date.parse` seul ne suffit pas : Node lit « -1 » comme une date de 2001.
- **Journal** : une tuile n'écrit rien ; un échec écrit `tiles: tile failed (…)`, avec un mot
  fixe (`timeout`, `no answer`, `not a PNG`, `answer too large`) ou `HTTP {statut}` ; sans
  clé, chaque demande écrit `tiles: no key`, sans appel ; disjoncteur ouvert, rien. Jamais la
  clé, l'URL ni la tuile : l'URL porte la clé, et une tuile dit la zone regardée. Une erreur
  de `fetch` autre que le délai n'est pas lue (son message ou sa cause peut porter l'URL) :
  elle s'écrit `no answer`. Pour Sentry, `scrubUrl` garde `/tuiles` et masque les trois nombres
  (`/tuiles/[id]/[id]/[id]`).
- **La clé reste au serveur** (CA3.5) : seul `geoapify.ts` lit `GEOAPIFY_API_KEY`, au
  chargement de `route.ts`. Elle est rognée (collée dans Vercel avec un saut de ligne final,
  elle ferait de chaque tuile un 401), et vide ou blanche, il n'y a pas de clé.
  `geoapify.test.ts` vérifie qu'aucune ligne de journal ne la porte ; `e2e/tiles-key.spec.ts`,
  avec la clé de test de `compose.yaml`, qu'elle n'est dans aucun fichier de `.next/static`,
  ni dans le HTML, ni dans une réponse de notre origine (en-têtes et corps, un 502 compris),
  ni dans une URL que le navigateur demande, et que le faux l'a reçue, comme seule query.
- **Changer `TILE_STYLE`** impose de vider le cache du CDN de Vercel : l'URL de nos tuiles
  ne porte pas le style, et le CDN garde une tuile 30 jours (le navigateur, un jour). Sans
  cela, l'ancien style et le nouveau se mêlent sur une même carte.
- **Les crédits** (#558, décision du propriétaire du 24/10 sur #549) : une ligne posée sur la
  carte, en bas à droite, `EventMap.attribution` puis le lien `EventMap.osmLink`, « Geoapify ·
  © OpenMapTiles.org · © OpenStreetMap », vers https://www.openstreetmap.org/copyright, dans un
  nouvel onglet que dit `Contact.newTab` en `sr-only`. C'est notre propre élément (`Credits`,
  `event-map.tsx`), pas un `L.Control` : le contrôle d'attribution de Leaflet est coupé
  (`attributionControl: false`), et son préfixe « Leaflet » n'est nulle part sur la carte. Sa
  licence, BSD 2-Clause, demande sa notice avec le build : `public/licences.txt` la sert depuis
  notre origine, copie du `LICENSE` du paquet, et `e2e/licences.spec.ts` la compare à celui de
  la version installée. L'en-tête `@preserve` de Leaflet ne suffirait pas : il ne porte que le
  copyright, sans les conditions ni l'avertissement.

| variable | sans elle | effet |
|---|---|---|
| `TILE_UPSTREAM_URL` | `https://maps.geoapify.com/v1/tile` (aussi quand elle est vide) | la base des tuiles ; chaque slot pointe vers son faux fournisseur |
| `TILE_STYLE` | `positron` (aussi quand elle est vide, ou n'est pas un seul segment `[a-z0-9-]`) | le style des tuiles ; le changer impose de vider le cache du CDN |
| `GEOAPIFY_API_KEY` | aucune clé : aucun appel, chaque tuile en 502, `tiles: no key` (aussi quand elle est vide ou blanche) | la clé de Geoapify, réservée au serveur, rognée ; les slots ont une clé de test |
| `TILES_BREAKER_MS` | `10000` (aussi pour une valeur qui n'est pas faite que de chiffres) | la durée minimale du disjoncteur, en millisecondes ; `0` le coupe (les slots) |

### Les points (#476, #481, #655)

`src/domain/event-map.ts`, en fonctions pures, sans mots ni Leaflet. `mapOf(flag, cars)` lit
les voitures d'un leg dans l'ordre des fiches : une voiture sans position n'est pas sur la carte
(`notOnMap`) ; **le drapeau d'abord** (v18) : toute voiture à moins de 25 m du drapeau
(`SAME_POSITION_METRES`, distance `distanceMetres`, haversine) est dans son seul point
(`atFlag` : pas de ligne, l'étiquette sous le drapeau), même à 25 m ou plus d'une autre ;
toute autre rejoint le premier point, dans l'ordre des fiches, hors du drapeau, à moins de
25 m de la position de sa première voiture, ou en ouvre un. `onMap` compte les voitures sur
la carte, le nombre que dit son nom. `freeSeatsOf(point)` donne les places libres d'un point
(v28, #655) : celles de sa voiture (`freeSeats` du tableau, celles de la fiche), ou la somme de
celles de ses voitures, 0 quand toutes sont pleines. `event-map.tsx` les met en chiffres
(`format.number`) dans la **pastille** de l'étiquette, après le prénom ou le nombre de voitures :
un trait de 1 px, l'icône « armchair » de Lucide (`aria-hidden`), le nombre, dans le même bouton,
du même style pour tout nombre, jamais ambre ; chaque bouton de voiture de la bulle a celle de sa
voiture. Les noms disent le nombre une fois, par `EventMap.freeSeats`, 0 compris (« 0 place
libre », et non plus `Board.car.full`) ; celui d'un point groupé est `EventMap.group`, « 2 voitures :
Nina, Paul, 3 places libres ». Une place prise ou libérée ne change que la pastille et le nom
du même élément, sans recadrage (`mapUpdate`). `framing` cadre le drapeau seul au zoom 14, ou
l'emprise du drapeau et des points, au zoom 15 au plus, avec une marge par côté : 32 px, et en
bas la hauteur des crédits `h` plus 32 px, ou plus 64 px quand le drapeau a un point sous lui
(v22 : son bouton descend à 60 px sous le drapeau). `bubbleMaxHeight` donne à la bulle la
hauteur de la carte moins `2 · BUBBLE_INSET` (10 px) moins `h` : elle s'arrête au-dessus des
crédits. `h` est l'`offsetHeight` des crédits, lu par `leaflet-map.ts` à chaque cadrage et à
chaque placement de la bulle (24 px sur une ligne, 48 sur deux). Les 64 px valent pour un rem
de 16 px : avec un texte agrandi, le bouton du point du drapeau grandit, pas cette marge.
À gauche et à droite, la marge est la moitié de l'étiquette la plus large quand elle dépasse
32 px (#655) : une étiquette est centrée sur son point, et sa pastille, à son bout droit, ne
doit pas être coupée par le bord de la carte (CA1.3). `leaflet-map.ts` mesure les boutons à la
fraction de pixel près (`getBoundingClientRect().width`, #829), et `framing` arrondit la marge
vers le haut ; à la première vue, ils n'entrent dans la page qu'une fois la carte cadrée :
elle est cadrée de nouveau, dans la même tâche, sans rien peindre entre les deux. Le zoom de
l'emprise est choisi par `fittingZoom` (#820) : le plus haut zoom entier, 15 au plus, où elle
tient dans ses marges, en EPSG:3857, donné à `fitBounds` comme `maxZoom`. Le zoom de Leaflet
seul (`getBoundsZoom`) prend le zoom suivant quand l'emprise n'a besoin que de moins de 1 %
de zoom en moins, et dépasse alors sa marge.

### Dans le navigateur (#478 à #485)

- **`src/components/event/leaflet-map.ts`** est le seul fichier qui importe `leaflet` et
  `leaflet/dist/leaflet.css`, et on ne l'atteint que par l'`import()` de
  `src/components/event/leaflet-import.ts`, un seul pour la page et ses deux legs (#553,
  CA2.10), au premier démarrage d'une carte : avant, la page ne charge ni l'un ni l'autre
  (CA1.2, `e2e/event-map.spec.ts`). Aucun lint ne l'impose : la revue le tient. `createEventMap`
  rend `{ update, resize, retryTiles, destroy }`, et n'a aucun mot : `event-map.tsx` les lui
  donne traduits.
- **`src/components/event/event-map.tsx`** : `EventMap`, **le conteneur** (#562, maquette
  v24 à v27) : bordé (`rounded-[14px] border`), au motif de « Vos inscriptions », masqué
  entier sans JavaScript (`noscript:hidden`), pas un repère, dont le bouton « Carte »
  (`aria-expanded`) est l'en-tête ; la partie qu'il replie (`hidden`) : la boîte de 240 px,
  280 px à partir d'une fenêtre de 448 px, d'un bord à l'autre du conteneur (`-mx-3`), un
  trait au-dessus, puis les avis et les phrases sous la carte ; et `OrganiserHint`. Dans la
  boîte, **la région de la carte** (`role="region"`, l'élément que Leaflet reçoit, sans rien
  dedans de React que les crédits), le texte de chargement, opaque, et **un seul élément d'anneau**
  (`pointer-events-none absolute inset-0`, z-index 1002, `focus-ring -outline-offset-2`),
  au-dessus des panneaux de Leaflet, des crédits, de la bulle et du texte de chargement, affiché tant que
  la région ou la boîte de chargement (`tabindex="-1"`) a le focus clavier : tracé sur l'une
  ou l'autre, l'anneau passerait sous les panneaux ou sous le texte. Jamais pour le lien des
  crédits, qui a son propre anneau, à l'intérieur, sur fond blanc opaque.
- **Les crédits dans la région** (#558) : React les y rend dès le départ, en bas à droite, à
  z-index 1000, au-dessus du texte de chargement et des panneaux de Leaflet, points et bulle
  compris : la bulle est dans un `.leaflet-pane` (z-index 400, son propre contexte
  d'empilement), et son z-index 1001 ne compte que dedans (#578). Rien ne se voit, car
  `bubbleMaxHeight` l'arrête au-dessus de leur bande. Cachés avec la boîte sous un
  avis de Leaflet. `createEventMap` reçoit l'élément (`credits`) et le remet en dernier dans
  la région, après les panneaux et les contrôles que Leaflet y ajoute : le lien vient en
  dernier dans l'ordre de Tab, après « Zoom arrière ». React n'a pas d'autre enfant dans la
  région, et le déplacement reste dans le même parent. Dans le conteneur de Leaflet, un
  `touchstart` y remonte jusqu'au zoom à deux doigts : c'est ce qu'il faut pour qu'un
  pincement dont un doigt se pose sur les crédits zoome. Leurs gestes sont ceux des points
  (`holdPress`, voir « Au toucher ») ; un glisser à la souris qui commence sur eux ne déplace
  pas la carte. `.leaflet-container a` colorerait le lien : sa couleur porte `!`. D'une voiture, la carte
  ne reçoit que son identifiant, son lieu, sa position, ses places libres et le prénom de qui
  conduit, jamais un numéro.
- **L'état ouvert ou replié** est celui de la page : `EventView` le tient (`useState`), un
  seul pour les deux legs, en mémoire, déplié à chaque arrivée, dès le HTML du serveur (#653),
  et replié quand la position de l'événement part : une position qui revient donne le bouton
  replié. Il passe par `LegTabs` puis `LegPanel`, ou droit à `LegPanel` pour un
  événement sans retour ; `LegPanel` pose la carte après les actions et le `<noscript>`,
  avant les fiches. Tenu par la page, il survit au remontage du panneau de l'aller quand le
  retour part (CA2.7).
- **Le démarrage** (#653, v29) : Leaflet ne démarre que carte ouverte, **page posée**, et
  boîte dans l'écran ou touchant son bord et d'une largeur non nulle, puisqu'un onglet caché n'a
  pas de taille (CA1.13). Le bord compte, comme pour l'`IntersectionObserver` (seuil 0) : une
  boîte au ras du bas refusée, un défilement d'un pixel ne changerait rien de ce qu'il dit, et
  la carte attendrait pour toujours (#788). La page est posée (`pageSettled`, `event-map-state.ts`) quand le statut
  de l'appareil est `none`, `ready` ou `failed`, et, sur `/e/{id}/admin`, quand la première
  vérification du lien est finie : `OrganiserScreen` passe `linkChecking`
  (`screen.state === "loading"`, pas `link.check.state`, que le réducteur applique dans un
  effet de mise en page, avec l'espace organisateur) à `ParticipantBoard`. Avant, « Vos
  inscriptions » et l'espace organisateur, à venir au-dessus, pousseraient la boîte sous le pli.
  `EventView` tient ce verrou : posée une fois, posée pour de bon ; il passe par
  `LegMap.settled`. `event-map.tsx` observe la boîte (`ResizeObserver`,
  `IntersectionObserver`) et la mesure de nouveau (`getBoundingClientRect` contre
  `innerHeight`) dans l'effet qui suit le passage à posée, jamais d'après une entrée d'observateur
  d'avant. L'`IntersectionObserver` est recréé à ce passage, et à l'ouverture : il ne dit qu'un
  changement depuis ce qu'il a vu, et la boîte, vue dans l'écran avant, peut en sortir et y
  revenir entre deux de ses regards ; l'effet l'aurait mesurée dehors, et rien ne l'aurait
  démarrée (#769). Le démarrage appelle `leafletImport.open()` ; « Réessayer » démarre aussi le leg qui
  ne l'était pas. Avant, la boîte attend, sans « Chargement de la carte… », sans `aria-busy` ni
  `tabindex` (CA1.14) ; rien ne prend le focus ni ne fait défiler à l'arrivée (CA2.11). Repliée
  par la personne avant d'entrer dans l'écran, elle ne demande rien. Une carte démarrée
  reste, remontée hors de l'écran comprise (CA1.20) ; montrée de nouveau, elle prend sa taille (`resize`). Elle n'est cadrée qu'une fois
  son conteneur d'une taille non nulle (`frame`, #480) : repliée ou dans un onglet caché,
  elle cadrerait ses points dans 0 × 0 px ; #482 étend cette garde aux recadrages après une
  mise à jour (CA1.3).
- **Les tuiles** : `L.tileLayer("/tuiles/{z}/{x}/{y}")`, avec `noWrap`, l'emprise du monde et
  le zoom 18 au plus : Leaflet ne demande jamais une tuile hors de la grille.
- **Aucune animation** (CA1.10, décision 24 d'organizer-view, #479) : `zoomAnimation`,
  `fadeAnimation`, `markerZoomAnimation` et `inertia` à `false`, chaque cadrage
  `{ animate: false }` ; `boxZoom` et `doubleClickZoom` à `false`, parce qu'ils finissent par
  un `setView` animé ; la molette fait défiler la page (`scrollWheelZoom: false`). Leaflet n'a
  pas d'option pour les flèches : `StillKeyboard` étend `L.Map.Keyboard` et le remplace ; il
  appelle son `_onKeyDown` avec un `panBy` immédiat le temps de la touche, et garde ainsi Maj
  (trois fois la distance), `maxBounds` et + / −. Il remplace aussi son `_onMouseDown` (#577) :
  Leaflet y donne le focus à la région par script, et Chrome rend ce focus `:focus-visible`
  quand l'élément quitté l'était ; après Tab vers un point, un clic sur le fond allumait
  l'anneau. Le nôtre garde la garde `_focused` et appelle
  `focus({ preventScroll: true, focusVisible: false })` : `focusVisible`, qu'un navigateur
  sans l'option ignore, pour l'anneau ; `preventScroll` à la place du `window.scrollTo` de
  Leaflet, pour que la page ne saute pas vers une carte coupée par le bord de la fenêtre. Il
  surcharge des internes de Leaflet, et ne tient que grâce à la version exacte de `leaflet`
  dans `package.json`, 1.9.4, épinglée par #471 avant lui, comme toute dépendance du projet :
  une montée de version le relit (`e2e/event-map-touch.spec.ts` teste les flèches, Maj, + et
  −, `e2e/event-map-container.spec.ts` l'anneau et le défilement au clic).
- **Au toucher** (CA1.11, #479, #484) : `dragging` suit `(pointer: coarse)`, même quand elle
  change, la carte restant la même : un doigt fait défiler la page, deux déplacent et zooment
  la carte. Sur un point ou sur les crédits (`holdPress`), un `touchstart` à un doigt s'arrête
  là : ni un glisser ni le `tapHold` de Leaflet (Safari sur iPhone), qui annulerait le clic
  d'un appui long, ne le voient. À deux doigts, il passe : un pincement dont le second doigt
  se pose sur un point ou sur les crédits zoome la carte. La phrase « deux doigts » est dans le
  HTML du serveur, toujours, et seule la requête média la montre (`hidden
  pointer-coarse:block`, #720, v29) : pas de hook qui vaudrait `false` sur le serveur et la
  ferait arriver à l'hydratation, 28 px plus bas pour la première fiche (CA1.19). Elle suit
  le pointeur quand il change, comme `dragging`, que `touchQuery` donne à Leaflet. Les tests
  lisent la page du serveur en n'abandonnant que les `.js` de `/_next/static/chunks/`
  (`serverPage`, `e2e/event-map-points.ts`) : avec Turbopack, la feuille de style est sous le
  même chemin et doit charger.
- **Les points, le drapeau, les lignes** (#480, #481) : chaque point est un vrai `<button>`
  dans un `divIcon`, son marqueur en `keyboard: false` ; seul, il mène à la fiche de sa
  voiture (`showCar`, `src/components/event/focus.ts`) ; groupé, il ouvre notre bulle
  (`role="group"`, pas la popup de Leaflet, dont « Close popup » est en anglais), un bouton
  par voiture dans l'ordre des fiches, puis « Fermer ». Le drapeau est une image nommée
  (`role="img"`), pas un bouton. Les lignes sont des `L.polyline` sans interaction.
- **L'empilement des étiquettes** (#722, event-map v32, CA1.23) : les points restent à leur
  position exacte et des étiquettes peuvent se recouvrir. Chaque icône de Leaflet est son
  propre contexte d'empilement (elle porte un `transform`) : c'est l'icône qu'on monte, par une
  seule classe à la fois, que choisit `pointLayer` (`event-map-state.ts`, fonction pure) et que
  `leaflet-map.ts` met **à la place** de la précédente, jamais à côté : deux classes `!important`
  sur `z-index` laisseraient décider l'ordre de la feuille de style. `z-auto!` par défaut :
  l'ordre du DOM, celui des fiches, la dernière dessus, quelle que soit la latitude ; `z-999!`
  quand une souris survole le bouton du point (`pointerenter` dont le `pointerType` est
  `mouse` : un toucher ne survole rien) ou que le focus est dans l'icône, sa bulle comprise
  (`focusin`, `focusout` sur l'icône, écoutés une fois l'icône créée, à l'`add` du marqueur) ;
  `z-1001!` tant que sa bulle est ouverte. Le drapeau est en `z-1000!` (`FLAG_LAYER`) : au-dessus
  de toute étiquette, survolée ou focalisée comprise, sous le point d'une bulle ouverte, que
  rien ne recouvre (amendement 6 du coordinateur sur #653, qui l'emporte sur « sous le
  drapeau »). Les marqueurs restent `interactive: false` (#484) : `riseOnHover` et
  `setZIndexOffset` n'y feraient rien contre la classe. Après chaque mise à jour, chaque icône
  est relue, un focus perdu par un élément déplacé n'envoyant pas toujours de `focusout`.
- **Les mises à jour** (#482) : la carte suit l'état que la page applique (la réponse d'une
  action, « Actualiser » sur `/e/{id}/admin`) ; il n'y a pas de rafraîchissement automatique
  (#67). `event-map.tsx` compare en JSON ce que la carte montre (`MapState`) : un état qui
  n'en change rien ne la touche pas. Sinon, `update` applique `mapUpdate`
  (`src/components/event/event-map-state.ts`, fonctions pures) à la même carte, jamais
  recréée : un point est ses voitures (`pointKey`), gardé, déplacé (le même élément), créé ou
  retiré ; les éléments sont remis dans l'ordre des fiches, qui est l'ordre de Tab ; le
  recadrage n'a lieu que si une voiture arrive ou si le drapeau bouge, et si personne n'a
  déplacé ni zoomé la carte ; la bulle se ferme quand sa liste change ; le focus va où la
  table le dit, jamais à `<body>`. Une carte démarrée suit aussi repliée ou dans un onglet
  caché, et son cadrage attend une taille. Partie avec la position de l'événement ou avec son
  leg, elle rend à `focusLandmark` le focus qu'elle avait, si rien d'autre ne l'a pris.
- **Les échecs** (#483), sans région `status` de plus : le panneau d'un leg n'en a qu'une,
  celle du bandeau. `leafletStep` : un `import()` refusé (hors ligne, ou le morceau
  d'un ancien build après un déploiement) met « La carte n’a pas pu se charger. » à la place
  de la boîte, et son « Réessayer » importe de nouveau (CA2.8). Après un déploiement, ce
  morceau répond 404 pour toujours et « Réessayer » ne peut pas réussir : à partir du second
  échec de suite, en ligne, l'avis devient « … toujours … » avec « Recharger la page »
  (`location.reload()`, qui garde l'adresse et son fragment) avant « Réessayer » (#553).
  L'état de l'import est celui de la page (`leaflet-import.ts`, lu par
  `useSyncExternalStore`) : un essai à la fois, et une réussite depuis un leg vaut pour
  l'autre ; une page quittée par une navigation côté client ne laisse pas son échec derrière
  elle (#567), un module chargé reste ; `leafletFocus` dit où va le focus, dans le leg montré seulement.
  `tilesStep` : l'avis de tuiles apparaît quand une vue finit de charger (`load`) avec au
  moins un `tileerror`, part quand une vue finit sans, jamais entre les deux, et son
  « Réessayer » redemande toutes les tuiles (CA2.4).
- **L'organisateur** (#485) : sur `/e/{id}/admin`, une fois le lien vérifié, un événement sans
  position montre dans chaque leg, à la place de la carte, la phrase `EventMap.organiserHint`
  et son propre « Modifier l’événement » (`OrganiserHint`), qui ouvre la même feuille que
  l'espace organisateur, sauf pendant qu'une modification part. `OrganiserScreen` retient
  d'où la feuille a été ouverte (`editFrom`) : à sa fermeture, et pour le repère de
  « Événement modifié. », le focus va à « Carte » de ce leg si l'événement a maintenant une
  position, sinon au bouton de la phrase. Sur `/e/{id}`, sans position, ni carte ni phrase.

Les tests de bout en bout de la carte sont `e2e/event-map*.spec.ts` (la mise en page à 360
et à 1280 px dans `event-map-layout.spec.ts`, CA1.8 et CA1.9 ; les crédits dans
`event-map-credits.spec.ts`, CA3.7 ; le démarrage une fois la page posée et le focus à
l'arrivée dans `event-map-start.spec.ts`, CA1.20 et CA2.11 ; `arriveWaiting`, dans
`e2e/event-map-points.ts`, arrive la lecture de l'appareil retenue, la carte pas démarrée), ceux de la notice de Leaflet `e2e/licences.spec.ts`, ceux de la route
`e2e/tiles.spec.ts`, ceux de la clé `e2e/tiles-key.spec.ts`, ceux du faux fournisseur
`e2e/fake-tiles.spec.ts`, et les captures de la maquette `e2e/event-map.shot.ts`.

## Les e-mails (#581)

Quatre e-mails, et aucun autre : la confirmation d'une adresse, le lien de connexion, la
réponse à une demande de connexion pour une adresse sans compte, et l'avertissement avant la
suppression d'un compte inactif. Leurs textes sont dans `src/email/messages.ts` (#592), dans
la langue de la page qui les demande, l'avertissement dans celle du compte. Leur type
d'entrée n'a aucun champ pour un texte saisi par quelqu'un : ni titre, ni lieu, ni prénom.

- **L'appel à Brevo** : `src/email/brevo.ts` (#591), sur le modèle de `photon.ts` et de
  `geoapify.ts`. Un e-mail, un destinataire, `POST {BREVO_URL}` avec la clé dans l'en-tête
  `api-key`. `cache: "no-store"`, `redirect: "error"` (une redirection porterait la clé et
  l'adresse à un autre hôte), et chaque envoi borné à 10 s par son propre
  `AbortSignal.timeout(10_000)` (OA3.6). Le corps de la réponse n'est pas lu. Rien n'est
  levé : le client rend `{ state: "sent" }` (201 ou 202) ou `{ state: "failed" }` (tout le
  reste, le délai compris). Un envoi abandonné à 10 s peut encore être accepté par Brevo :
  c'est pourquoi l'interface dit « n'a peut-être pas été envoyé ».
- **Aucun suivi** (OA3.3) : la requête ne demande aucun suivi des ouvertures ni des clics,
  et le suivi est coupé dans le compte Brevo, un réglage du propriétaire, qui vérifie le
  premier e-mail de production à la main (décision 1 du coordinateur sur #581).
- **La création n'attend pas l'envoi** : l'envoi de la confirmation passe par `after()` de
  Next (#599), et son résultat s'écrit dans `event.send_status` (en cours, envoyé, échec,
  limite par adresse). L'avis le relit à chaque chargement ; un envoi « en cours » depuis
  plus de 30 s se lit comme un échec (OA1.7). `createEventFor` (`src/app/create-event.ts`)
  crée l'événement dans une transaction : avec une session vivante, il est au compte et
  confirmé, et rien ne part (OA1.3) ; avec une adresse, `claimConfirmation`
  (`src/db/email-links.ts`) inscrit l'envoi et crée le lien, puis `send_status` passe à
  `sending`, ou à `address_limit` si une limite l'arrête. Après la validation, sans aucun
  verrou, `after()` appelle Brevo, puis `writeSendResult` écrit `sent` ou `failed`, mais
  seulement sur le `sending` que cette création a écrit : un renvoi écrit depuis garde le
  sien. Une session envoyée mais terminée, sans adresse, ne crée rien et répond
  `sessionEnded` sur le champ e-mail (OA1.5).
- **Les limites** se comptent sous verrou, Event puis adresse (voir « L'adresse après
  l'Event »).
- **Journal** : en mots fixes seulement, `email: no key`, `email: no sender`,
  `email: send failed (timeout | no answer | HTTP {statut})`. Jamais l'adresse, la clé,
  l'URL ni l'e-mail, qui porte le jeton d'un lien. L'erreur de `fetch` n'est pas lue : son
  message ou sa cause peut porter l'URL, l'adresse ou la clé.
- **Le faux Brevo du slot** (#591) : le service `brevo` lance `e2e/fake-brevo.mjs`, l'API
  sur le port 2326 et son contrôle sur le port 2327, joignables seulement par le nom `brevo`
  dans le réseau du slot. `web` y est branché dans tous les slots, avec une clé de test : un
  slot n'envoie jamais un vrai e-mail. Un test lit et règle la boîte d'une adresse qui
  n'est qu'à lui (`e2e/mailbox.ts`, `BREVO_CONTROL_URL`).

| variable | sans elle | effet |
|---|---|---|
| `BREVO_URL` | `https://api.brevo.com/v3/smtp/email` (aussi quand elle est vide) | l'adresse d'envoi de Brevo ; chaque slot pointe vers son faux Brevo |
| `BREVO_API_KEY` | aucune clé : aucun appel, chaque envoi `failed`, `email: no key` (aussi quand elle est vide ou blanche) | la clé de Brevo, réservée au serveur, rognée ; les slots ont une clé de test |
| `EMAIL_FROM` | aucun expéditeur : aucun appel, chaque envoi `failed`, `email: no sender` (aussi quand elle n'a pas la forme `Nom <adresse>`, `<adresse>` ou `adresse`) | l'expéditeur des quatre e-mails |

## La purge (#581)

La purge est une tâche quotidienne : Vercel Cron appelle `GET /api/purge`
(`src/app/api/purge/route.ts`, `handle.ts`, #589 ; `crons` dans `vercel.json`). La route
n'exporte que `GET`. Vercel Cron envoie `Authorization: Bearer {CRON_SECRET}`, que la route
compare à temps constant ; un en-tête absent ou faux, ou un `CRON_SECRET` non configuré, est
refusé sans rien purger. Le journal de la purge ne porte que des nombres.

- **Le jour 30** (#588, `src/app/api/purge/day-thirty.ts` et `src/db/day-thirty.ts`) :
  chaque événement dont le jour 30 a commencé à Paris (`purgeCutoff`, voir « Heures sans
  fuseau ») est traité dans **sa propre transaction**, sous `lockEvent(trx, id,
  "noKeyUpdate")`. Avec un compte, il est **anonymisé** : ses Persons, Rides, Placements,
  Arrêts et liens de confirmation sont supprimés, sa position, sa description et le hash de
  son jeton d'admin passent à nul, et `anonymised_at` est écrit. Sans compte, en attente ou laissé par un
  compte supprimé, il est **supprimé**, et la cascade emporte le reste. Une exécution
  interrompue laisse chaque événement intact ou traité en entier, et une deuxième exécution
  ne change rien (OA8.2). Aucune transaction ne couvre toute la purge.
- **Après l'anonymisation**, les écritures sont refusées : une écriture qui a attendu le
  verrou de l'Event voit `anonymised_at` (`retour.ts`, `edit-event.ts`). `/e/{id}` répond
  200 avec « Événement terminé » et `noindex` (#590, #797), un statut qui ne demande pas de
  middleware (décision du coordinateur sur #581). Les écritures répondent `eventEnded` avant
  leurs propres refus. `editEvent` le répond avant de contrôler le jeton d'admin, puisque
  l'événement anonymisé n'a plus de hash de jeton à comparer : seul l'identifiant mal formé
  ou inconnu (`eventNotFound`) passe avant. Les écritures sur un leg (`addPerson`,
  `updatePerson`, `setPersonLeg`, `offerRide`, `updateRide`, `removeRide`, `takeSeats`,
  `undoSeats`) le répondent dès le verrou de l'Event pris par `lockLegs`, avant `noRetour`,
  le contrôle du jeton personnel (`forbidden`) et tout autre refus de leur transaction : ne
  passent avant que `eventNotFound` et ce qu'elles vérifient avant la transaction, les
  erreurs de champs et, pour certaines, la requête mal formée (`invalid`). Un appel sans
  jeton, ou avec un faux, apprend donc que l'événement est anonymisé, ce que `/e/{id}` dit
  déjà à tout le monde. L'état que ces refus joignent est celui de l'événement terminé, son
  titre et son début, sans le lieu ni personne : `readEventState` le rend pour tout
  événement anonymisé (OA8.3, #806). `removePerson` ne répond pas encore `eventEnded` (RP2.9, #674).
- **Les sessions, les envois et les liens** (`session`, `email_send`, `email_link`) sont
  nettoyés par âge, par la même tâche (#589, `src/db/expired-rows.ts`) : une ligne part quand
  aucune règle ne la lit plus. Une ligne effacée plus tôt changerait la réponse d'une règle.
  Chaque passage supprime :
  - une **session** terminée, 90 jours après sa dernière visite (`sessionIsAlive`) ;
  - un **envoi** (adresse, sorte, heure), sorti de l'heure des limites (`inSendWindow`) :
    gardé 1 heure, il part au passage suivant, en temps normal moins de 26 heures après
    l'envoi (le cron passe une fois par jour ; sur le plan Hobby, à n'importe quelle minute
    de l'heure prévue) ;
  - un **lien de connexion**, utilisé ou non, **30 jours après son expiration**
    (`linkDeletedAt`), soit 30 jours et 1 heure après l'envoi. D'ici là, sa page dit encore
    « Ce lien a expiré » ou « Ce lien a déjà servi » (OA5.4, OA5.5) à un e-mail ouvert en
    retard ;
  - un **lien de confirmation** : **tant que son événement est en attente, jamais** par âge.
    Expiré, il sert encore à recevoir un nouveau lien (OA5.6, `AdminPending.expired` d'OA7.7),
    et il part avec son événement au jour 30, par la cascade ou par `anonymiseEvent`. Une fois
    l'événement confirmé, la règle des liens de connexion s'applique : 30 jours après son
    expiration, soit 37 jours après l'envoi, ou au jour 30 de l'événement si celui-ci vient
    avant. Le nettoyage lit `event` sans verrou : l'ordre Event, puis lien, reste entier.

  Un lien ne garde aucune adresse.
- **La route** (`handle.ts`) : un en-tête faux ou absent, ou un `CRON_SECRET` vide ou non
  configuré, donne 401 et rien ne tourne. Le secret n'est lu que dans l'en-tête, jamais
  dans l'URL, et `Bearer {secret}` est comparé par `tokenMatches`, haché des deux côtés. Le
  nettoyage tourne **d'abord**, puis le jour 30, au même instant : le nettoyage est court
  (trois instructions), et un passage coupé par la durée maximale de la fonction a ainsi
  déjà effacé les adresses des envois. L'échec de l'un n'empêche pas l'autre, et donne 500.
  Le cron est `0 3 * * *` (UTC), dans `vercel.json`.
- **Les comptes inactifs** (#616, `src/app/api/purge/inactive-accounts.ts`) : l'avertissement
  part 30 jours avant les 3 ans sans visite, une seule fois, et le compte n'est supprimé
  qu'après l'envoi effectif de cet avertissement (`warned_at` ; décision 5 du coordinateur
  sur #581). Le supprimer suit le même chemin que « Supprimer mon compte ». Les
  avertissements ne comptent pas dans le plafond global d'envois, et un passage en envoie 20
  au plus (décision de la relecture de #623).
- **Supprimer un compte** (`deleteAccount`, `src/db/accounts.ts`, #610) efface l'adresse de
  toutes les tables, y compris l'adresse en attente d'un événement créé ailleurs avec elle
  (décision 4 du coordinateur sur #581), ferme toutes ses sessions et révoque les jetons
  d'admin de ses événements. Ses événements anonymisés sont supprimés ; les autres restent
  ouverts aux participants, sans organisateur, jusqu'à leur jour 30 (`event.account_id` en
  `SET NULL`).

| variable | sans elle | effet |
|---|---|---|
| `CRON_SECRET` | tout appel refusé : rien n'est purgé | le secret que Vercel Cron envoie à `/api/purge` ; jamais écrit en dur ni journalisé |

## i18n

next-intl, sans préfixe de langue : `/e/{id}` est le même lien pour tout le monde. La langue
vient d'un cookie s'il existe, sinon d'`Accept-Language`, sinon le français. Un lien partagé
s'ouvre dans la langue de celui qui le reçoit.

`negotiateLocale` (`src/i18n/negotiate.ts`, appelée par `src/i18n/request.ts`) prend le
cookie `NEXT_LOCALE` s'il vaut exactement `fr` ou `en`, et ignore toute autre valeur ; puis
la première langue d'`Accept-Language` reconnue, par qualité puis par ordre, sous-étiquette
de région ignorée ; puis `fr`.

**Le cookie de langue (#113).** Seule la server action `setLocale` (`src/app/actions.ts`) le
pose, et seul le bouton du bas de page l'appelle, sur un tap
(`src/components/i18n/language-switch.tsx`, qui nomme `otherLocale` de la langue affichée).
Une valeur autre que `fr` ou `en` ne pose rien. Ses attributs viennent de
`localeCookieOptions` (`src/i18n/locales.ts`) : `Path=/`, `SameSite=Lax`, 365 jours,
renouvelés à chaque changement, pas d'`HttpOnly`. `Secure` vaut `true` seulement si
l'en-tête `x-forwarded-proto` vaut `https` : Vercel l'envoie, alors que `next start` pose
`http`, et un cookie `Secure` y serait ignoré.

Poser un cookie dans une action fait rendre la page courante à nouveau par Next, et ce
rendu, déjà dans la nouvelle langue, arrive dans la réponse de l'action. Le client
l'applique sur place : pas de rechargement du document, pas de `router.refresh()`, pas de
navigation. Le fragment (`#{jeton}`) et ce qui est saisi restent, et le jeton n'est pas
revérifié. Jamais de `redirect()` ni de langue dans l'URL.

**Quand le changement échoue** (`src/components/i18n/language-switch.tsx`, #129). Un
message s'affiche au-dessus de la ligne 1 du bas de page, en `role="alert"`, dans la langue
demandée et avec son `lang` (les messages `LanguageSwitch` sont écrits dans l'autre
langue, décision 4 de #113) :
- hors ligne, ou quand le serveur échoue, l'appel à `setLocale` lève une erreur, que le
  composant attrape : il affiche `LanguageSwitch.failed` ;
- si `navigator.cookieEnabled` vaut `false`, il affiche `LanguageSwitch.cookiesBlocked`
  sans appeler `setLocale` : aucune requête ne part.

Dans les deux cas, la page reste telle quelle et le bouton redevient actif (sans cookies,
il le reste, puisque rien n'est parti). Chaque tap efface le message précédent et reçoit un
numéro, qui sert de `key` à l'alerte : un second échec pour la même raison est un nouveau
nœud, qu'un lecteur d'écran annonce de nouveau. Si le re-rendu échoue après la pose du
cookie, le cookie reste posé : cas accepté dans #113.

`experimental.useOffline` doit rester désactivé (sa valeur par défaut, `next.config.ts` ne
le pose pas). Activé, une action lancée hors ligne attendrait le réseau puis serait rejouée,
au lieu d'échouer : la langue changerait au retour du réseau, ce qui casse L4.1 de #113.

## Découpage d'une fonctionnalité

Dans cet ordre, parce que chaque étape rend la suivante vérifiable :

1. **Migration** (schéma), avec sa descente testée.
2. **Domaine** : les règles en fonctions pures, sans HTTP ni SQL — c'est là que vivent
   « une Person a au plus un Placement par leg » et la visibilité du téléphone.
3. **Accès aux données** : requêtes Kysely isolées, aucune règle métier.
4. **HTTP** : server actions et routes minces, qui valident l'entrée et délèguent.
5. **UI** : un écran, les états vides compris.
6. **i18n** : les deux langues en même temps que la vue, jamais après.
7. **Test de bout en bout** du critère d'acceptation visé.

## Emplacement du code

| quoi | où | règle |
|---|---|---|
| domaine | `src/domain/` | fonctions pures : n'importe ni `kysely`, ni `pg`, ni `next`, ni `react`, ni `react-dom` (ni leurs sous-chemins), ni `src/db`, par `@/db` ou par un chemin relatif, en `import` comme en `import()` ; le lint l'impose (`eslint.config.mjs`, #28 et #39) |
| socle des données | `src/db/client.ts`, `src/db/schema.ts`, `src/db/migrator.ts` | `getDb()` est la connexion de l'application, appelée par une page, une action ou une route, qui la passe aux fonctions d'accès aux données ; `schema.ts` grandit avec chaque migration |
| accès aux données | `src/db/<entité>.ts` (ex. `src/db/events.ts`) | chaque fonction reçoit `db: Kysely<Database>` en paramètre, pour qu'un test lui passe sa transaction ; aucune règle métier |
| erreur de base | `src/db/failure.ts` | `databaseFailure` journalise un message fixe et le seul code de l'erreur (SQLSTATE, ou errno d'une erreur système), jamais son message, sa requête ni ses valeurs, et renvoie l'erreur à lever, qui ne porte que ce message ; une server action s'en sert quand la base échoue |
| migrations | `src/db/migrations/`, listées dans `src/db/migrations/index.ts` | seul endroit où `sql.raw` est permis, mais pas dans leurs tests |
| server actions | `src/app/…/actions.ts`, à côté de la route qui s'en sert | minces : valider l'entrée, déléguer au domaine et aux données |
| cas d'usage de l'événement | `src/app/e/[id]/*.ts` (précédent : `src/app/e/[id]/event.ts`) | reçoivent `db` en paramètre, composent le domaine et l'accès aux données ; testés avec `withRollback`, comme une fonction d'accès aux données |
| jeton personnel dans le navigateur | `src/app/e/[id]/device-token.ts`, à partir de #66 | seul code navigateur qui touche au jeton personnel, comme `src/app/e/[id]/admin/admin-link.ts` pour le jeton d'organisateur, que remplace `admin-token-store.ts` à partir de #597 |
| jeton d'admin dans le navigateur | `src/app/e/[id]/admin/admin-token-store.ts`, à partir de #597 | seul code navigateur qui touche au jeton d'admin, rangé sous `fullcar:admin-token:{id}` (voir « Session, liens et jeton d'admin ») |
| jeton de session dans le navigateur | `src/app/session-token.ts` ; `src/components/account/session-visit.tsx`, à partir de #595 | seul code navigateur qui touche au jeton de session, rangé sous `fullcar:session` ; `session-visit.tsx`, monté par le layout racine, envoie la visite à chaque chargement de page |
| jetons tirés par le serveur | `src/domain/server-token.ts`, à partir de #593 | seul tirage des jetons d'admin, de session et de lien, 128 bits de `randomBytes` ; `newAdminToken` s'en sert |
| règles du compte | `src/domain/email-address.ts`, `account-rules.ts` et `send-limits.ts`, à partir de #593 | la lecture d'une adresse, les durées (lien de connexion 1 h, de confirmation 7 jours, session 90 jours, inactivité 3 ans) et le résultat d'un lien ; la limite par événement, la limite par adresse et le plafond global horaire, à partir de #623 ; la limite des demandes de connexion par adresse (OA4.5, `LOGINS_PER_ADDRESS`), à partir de #594 |
| accès à l'espace organisateur | `src/domain/organiser-access.ts`, à partir de #596 | la seule règle d'accès : session du compte de l'événement, ou jeton d'admin du navigateur de création ; seule à produire l'autorisation que `withOrganiserPhones` accepte |
| retrait d'une personne | `src/app/e/[id]/remove-person.ts` et `src/domain/person-removal.ts`, à partir de #665 | le cas d'usage, sans server action exportée : `removeFromDevice` (le droit par `devicePersonIds`) et `removeAsOrganiser` (le droit par le seul jeton d'admin, puis `organiser-access.ts`, #675), l'ordre des réponses (RP3.4) et celui des verrous (voir « Retirer une personne ») ; le domaine, en fonctions pures : ce que devient chaque leg, et les lignes de la confirmation, lues dans l'état que la page montre |
| compte dans la base | `src/db/accounts.ts`, `sessions.ts`, `email-links.ts`, `email-sends.ts`, à partir de #594 ; `src/db/my-events.ts`, à partir de #606 | les comptes, les sessions, les liens (un seul usage, même en concurrence) et les envois (limites sous verrou, Event puis adresse) ; Mes événements en agrégats, sans aucun téléphone |
| connexion | `src/app/connexion/` (`page.tsx`, `actions.ts`, `lien/`, `confirmer/`), à partir de #603 ; `src/app/mes-evenements/`, à partir de #607 | les pages et actions de connexion et des liens ; la page Mes événements |
| création | `src/app/create-event.ts`, à partir de #599 | le cas d'usage de la création, avec une adresse ou une session ; l'envoi de la confirmation par `after()` |
| e-mails | `src/email/brevo.ts`, à partir de #591 ; `src/email/messages.ts`, à partir de #592 | seul `brevo.ts` lit `BREVO_URL`, `BREVO_API_KEY` et `EMAIL_FROM` et appelle Brevo ; `messages.ts` écrit les quatre e-mails, sans aucun texte saisi (voir « Les e-mails ») |
| jour 30 et « passé » | `src/domain/day-thirty.ts`, à partir de #587 | le seul calcul de « aujourd'hui », « passé » et du jour 30, à l'heure de Paris (voir « Heures sans fuseau ») |
| purge | `src/app/api/purge/` (`route.ts`, `handle.ts`, `day-thirty.ts`, `inactive-accounts.ts`), à partir de #589 ; `src/db/day-thirty.ts`, à partir de #588 ; `src/db/expired-rows.ts`, à partir de #589 | la route n'exporte que `GET` et vérifie `CRON_SECRET` ; l'anonymisation et la suppression au jour 30, le nettoyage par âge, les comptes inactifs (voir « La purge ») |
| téléphone | `src/db/event-rows.ts` et `src/domain/phone-visibility.ts`, à partir de #66 | la seule requête qui lit la colonne `phone`, qui renvoie les téléphones à part (`phonesById`) sans exporter sa liste de colonnes, et le seul endroit de la règle de visibilité, dont `withVisiblePhones` et `withOrganiserPhones` sont les seuls à recevoir ces téléphones ; à partir de #776, `hasPhone` (`src/db/persons.ts`) n'en lit que la présence, un booléen, sous le verrou de la Person |
| lieu | `src/domain/place.ts`, à partir de #418 | un lieu est `{ text, position }` ; `positionOf` lit et arrondit une position ; `samePlace` compare deux lieux (texte et position) |
| description | `src/domain/description.ts`, à partir de #707 | `DESCRIPTION_MAX` (1000 points de code) ; `normalizeDescription`, la seule normalisation, partagée par le serveur (`description`, les règles de `text()`) et le compteur (`descriptionCount`) ; `guessFolds`, la devinette du pli que rend le serveur |
| propositions de lieux | `src/domain/suggestion.ts` ; `src/app/api/lieux/` (`route.ts`, `handle.ts`, `photon.ts`), à partir de #425 | le domaine lit la requête, écrit l'URL de Photon et les libellés ; la route n'exporte que `POST` ; seul `photon.ts` appelle Photon, avec son cache, son plafond et son disjoncteur (voir « Auto-complétion des lieux ») |
| champ de lieu | `src/components/event/place-field-state.ts` et `place-search.ts`, à partir de #427 | l'état du champ en fonctions pures, et la seule requête du navigateur vers `/api/lieux` |
| tuiles | `src/domain/tile.ts` ; `src/app/tuiles/[z]/[x]/[y]/` (`route.ts`, `handle.ts`, `geoapify.ts`), à partir de #473, #474 et #554 | le domaine lit la tuile ; la route n'exporte que `GET` ; seul `geoapify.ts` lit `GEOAPIFY_API_KEY` et appelle Geoapify, avec son disjoncteur (voir « La carte de l'événement ») |
| `Retry-After` | `src/domain/retry-after.ts`, à partir de #554 | `retryAfterMs`, la seule lecture de `Retry-After`, partagée par les disjoncteurs de Photon et des tuiles |
| liens de la description | `src/domain/description-links.ts`, à partir de #708 | `descriptionPieces` découpe la description en texte et en liens `http(s)` stricts ; une URL trompeuse (un `@` où que ce soit, décision du coordinateur sur #725 ; un caractère Cf, Cc ou bidirectionnel, hôte non ASCII ou `xn--`, `host` de `new URL()` différent de l'autorité tapée) reste du texte ; aucun appel réseau, `URL.host` seul est lu |
| carte | `src/domain/event-map.ts` ; `src/components/event/event-map.tsx`, `event-map-state.ts` et `leaflet-map.ts`, à partir de #476 | les points et le cadrage en fonctions pures ; les mises à jour, le chargement et les tuiles en fonctions pures ; seul `leaflet-map.ts` importe `leaflet`, et seulement par `import()` |
| composants | `src/components/<domaine>/` (ex. `src/components/event/`, que #21 crée) | n'importent pas `src/db`, ni par `@/db` ni par un chemin relatif, en `import` comme en `import()` |
| shadcn/ui | `src/components/ui/` | générés par `make npm ARGS="exec shadcn add …"` |
| rapports d'erreur | `src/observability/`, à partir de #234 | Sentry, seulement avec `NEXT_PUBLIC_SENTRY_DSN` : `register()` (`src/instrumentation.ts`) et `src/instrumentation-client.ts` importent le SDK dynamiquement, et sans DSN ne le chargent pas ; `options.ts` coupe `dataCollection`, la propagation de trace et toute intégration hors d'une liste exacte (`server.ts`, `client.ts`) ; les hooks de `scrub.ts` reconstruisent chaque envoi, et `registerHooks` y ajoute `createDsc` et `beforeEnvelope` ; une erreur de base part en `database error (SQLSTATE x)` |
| mesure d'audience | `src/components/analytics/web-analytics.tsx` et `src/observability/analytics.ts`, à partir de #346 | `<Analytics />` de `@vercel/analytics/next`, monté par le layout racine seulement si `NEXT_PUBLIC_VERCEL_ENV` vaut `production` ; `analyticsBeforeSend` réduit chaque page vue à l'origine et à la route (`/`, `/nouveau`, `/e/[id]`, `/e/[id]/admin`), sans query ni fragment, et ne laisse partir ni une autre page ni un événement personnalisé |

Une server action renvoie des **données simples** (sérialisables) et des **clés d'erreur**
(traduites par la vue), jamais un message rédigé ni le détail d'une erreur Postgres. Elle
n'appelle **jamais `redirect()` vers une URL qui contient un jeton** : la redirection
passerait par un en-tête de réponse (`Location`, ou `x-action-redirect` pour une action
appelée en JavaScript), et aucun en-tête de réponse ne porte de jeton (#3, C1.5 et C4.8).
Le jeton revient dans le corps de la réponse, et c'est le client qui navigue vers
`…#{token}`.

## Règles d'exécution

- **Pas de `loading.tsx` sur une route qui peut répondre 404.** Avec un `loading.tsx`, Next
  envoie la réponse en streaming dès le début, avec un statut 200 ; un `notFound()` appelé
  ensuite ne peut plus changer le statut. Sous `/e/[id]`, la page attend sa lecture en base
  et répond un vrai 404.
- **Le contenu du 404 de `/e/[id]` arrive avec les scripts (#142), limite acceptée.** Avec
  Next 16.4, un `notFound()` levé pendant le rendu serveur d'une page dynamique, hors de
  toute limite `<Suspense>`, arrête le rendu HTML. React n'a pas de limite d'erreur côté
  serveur, et Next répond alors un document d'erreur vide (`<html id="__next_error__">`),
  avec le statut 404. Le contenu de `not-found.tsx` est dans les données du rendu, et c'est
  le navigateur qui l'affiche ; sans JavaScript, la page est vide. Dans une `<Suspense>`,
  c'est la règle précédente qui s'applique : statut 200. Écarté : un `src/proxy.ts` qui
  vérifie l'événement et pose le 404 avant le rendu, la page affichant alors
  `not-found.tsx` sans lever `notFound()`. Il marche, mais coûte une lecture de base de plus
  à chaque page d'événement, pour un cas rare (un lien mort ouvert sans JavaScript). Ce qui
  reste vrai : `/e/{id}` et `/e/{id}/admin` inconnus répondent 404 avec ou sans JavaScript,
  et avec JavaScript le titre, le texte et le bas de page s'affichent (`e2e/event.spec.ts`).
  Le même test fixe le document vide : il échoue le jour où Next rend ce 404 côté serveur,
  et ce paragraphe est alors à revoir. Un critère « sans JavaScript » ne se prouve donc pas
  sur cette page.
- **Heures sans fuseau.** Une heure d'événement est l'heure locale du lieu : elle est stockée
  en `timestamp(0)` (sans fuseau) et relue comme **chaîne brute** (`2026-12-12 07:30:00`),
  jamais convertie en `Date` dans le fuseau du serveur ou du navigateur. `src/db/client.ts`
  le garantit : chaque pool garde `date` et `timestamp`, et leurs tableaux, en chaînes, sans
  toucher aux `pg.types` globaux ; `src/domain/wall-clock.ts` les manipule en chaînes. Pour
  l'affichage, `wallClockAsUtc` en fait l'instant UTC qui porte les mêmes chiffres,
  next-intl est configuré avec `timeZone: "UTC"`, et 07:30 s'affiche 07:30 à Paris comme à
  New York. `timeZone: "UTC"` arrive dans `src/i18n/request.ts` avec #21.

  **Le fuseau de référence, `Europe/Paris` (#581).** Pour comparer une heure d'événement à
  maintenant, c'est maintenant qu'on lit en heure de Paris, jamais l'heure de l'événement
  qu'on convertit : « aujourd'hui », « passé » (Mes événements) et le jour 30 (la purge)
  se calculent à l'heure de Paris, quel que soit le fuseau du serveur ou du navigateur
  (décision du coordinateur sur #581 : sur 30 jours, l'écart pour un événement à l'étranger
  est sans effet). Le seul endroit est `src/domain/day-thirty.ts` (#587) : `REFERENCE_ZONE`,
  `parisNow` et `parisToday` lisent maintenant à Paris ; `isPast` compare l'heure du dernier
  leg (`lastLegAt` : le retour s'il y en a un, sinon l'aller) ; `dayThirty` est la date du
  dernier leg plus 30 jours, `isDayThirtyReached` vaut vrai dès son minuit à Paris, et
  `purgeCutoff` donne la dernière date de dernier leg que la purge prend, quelle que soit
  son heure. Les résultats restent des chaînes, comparées comme celles de l'événement. Ses
  tests tournent aussi sous `Pacific/Kiritimati`, le fuseau des tests de bout en bout.

## Contraintes permanentes

- **Aller et retour indépendants** : toute donnée liée à un déplacement porte son `leg`. Une
  requête sans `leg` est un défaut.
- **i18n** : aucune chaîne visible en dur dans une vue. FR et EN livrées ensemble, une clé
  manquante fait échouer la vérification.
- **360 px** : la largeur de référence, pas un cas limite.
- **Un lieu, une valeur** : un lieu est le couple `{ text, position }`, et sa position voyage
  avec son texte ; la position d'une voiture est toujours celle de son texte. Exception
  voulue, côté serveur : `ridePositionChange` compare le texte seul quand une page d'avant le
  déploiement n'envoie pas de position (voir « Auto-complétion des lieux »).
- **Aucun tiers depuis le navigateur** : Photon et Geoapify ne sont appelés que par notre
  serveur, et la clé de Geoapify ne quitte pas le serveur ; Leaflet et sa feuille de style viennent de notre build.
- **Options** : désactivée, une option est **absente** de l'UI, pas grisée. Le code ne doit
  pas supposer qu'une option est active.
- **Purge** : chaque table qui tient à un événement a une clé étrangère vers l'Event en
  `ON DELETE CASCADE`. C'est ce qui fait marcher la suppression : supprimer l'Event emporte
  tout le reste, et une table sans cette clé y survivrait. Amendement de #581 : une table qui
  ne tient à aucun événement, comme `account`, `session` ou `email_send`, n'a pas cette clé ;
  la tâche quotidienne la nettoie par âge, et le compte par inactivité (voir « La purge »).
  Une nouvelle table sans clé vers l'Event arrive avec son nettoyage, dans la même PR.
  L'anonymisation, elle, supprime les lignes des participants table par table : une nouvelle
  table de données de participants s'y ajoute dans la même PR.
- **Autres clés étrangères** : chacune est choisie selon la relation, et écrite ici. Une
  nouvelle clé s'ajoute à ce tableau dans la même PR.

  | clé | `ON DELETE` | pourquoi |
  |---|---|---|
  | `stop.ride_id` | `CASCADE` | un Arrêt appartient à son Ride |
  | `placement (person_id, event_id)` → `person (id, event_id)` | `CASCADE` | un Placement appartient à sa Person, du même événement |
  | `placement (ride_id, event_id, leg)` → `ride (id, event_id, leg)` | `SET NULL (ride_id)` | quand un Ride est supprimé, ses passagers repassent « sans voiture » sur ce leg, au lieu de devenir « pas concernés » ; seule `ride_id` est remise à `null`, `event_id` et `leg` restent |
  | `placement.stop_id` | `SET NULL` | quand un Arrêt est supprimé, le passager monte (ou descend) au lieu du Ride |
  | `ride (driver_id, event_id)` → `person (id, event_id)` | `CASCADE` | supprimer le conducteur retire sa voiture, et ses passagers repassent « sans voiture » par la clé `placement → ride` ; à partir de #645, le retrait d'une personne supprime sa Person, mais verrouille et supprime d'abord ses Rides, pour garder l'ordre Ride, puis Person (voir « Retirer une personne ») |
  | `event.account_id` | `SET NULL` | un événement survit à son compte : il reste ouvert aux participants, sans organisateur, jusqu'à son jour 30 (OA9.5) ; il garde `confirmed_at` (#586) |
  | `session.account_id` | `CASCADE` | une session appartient à son compte : le supprimer ferme toutes ses sessions (#586) |
  | `email_link.account_id` | `CASCADE` | un lien de connexion appartient à son compte ; un lien de confirmation, lui, appartient à son Event (`email_link.event_id`, en `CASCADE` comme toute table qui tient à un événement) (#586) |
  | `email_link.return_event_id` | `SET NULL` | la page d'arrivée d'un lien de connexion, `/e/{id}/admin` de cet Event (OA4.4) ; l'Event supprimé, le lien sert encore et mène à `/mes-evenements`, l'arrivée par défaut. Un lien de confirmation n'en a pas : il mène à son propre Event (OA5.3) (#586) |
  | `email_send.event_id` | `SET NULL` | un envoi ne tient pas à son événement : supprimé, l'Event laisse l'envoi compté dans la limite de son adresse et dans le plafond global, jusqu'à son nettoyage par âge (#586) |

  Les clés de `ride` et de `placement`, hors `stop_id`, arrivent avec #66. Les clés
  composites empêchent un Placement de pointer vers un Ride d'un autre événement ou d'un
  autre leg (C12.7), et un Ride ou un Placement de pointer vers une Person d'un autre
  événement. Leurs cibles sont `unique (id, event_id)`
  sur `person` et `unique (id, event_id, leg)` sur `ride`. Une clé composite n'est vérifiée
  que si toutes ses colonnes sont renseignées (`MATCH SIMPLE`) : un Placement « sans
  voiture » (`ride_id` à `null`) ne l'est pas. `SET NULL (ride_id)`, limité à une colonne,
  exige Postgres 15 ou plus : 18 en local, 17 ou plus chez Neon.

  Une adresse e-mail (`account.email`, `event.pending_email`, `email_send.email`) n'est
  acceptée en base que telle que `src/domain/email-address.ts` l'écrit : rognée, en
  minuscules, en NFC, 254 points de code au plus (#586). Une adresse, un compte :
  `account.email` est unique. Les minuscules se vérifient avec la collation `pg_c_utf8`,
  quelle que soit la locale de la base, ce qui exige Postgres 17 ou plus.

  Deux déclencheurs garantissent en base qu'une conductrice n'a pas de Placement sur le leg
  où elle conduit (#66, C12.8) : `placement_driver_on_leg` sur `placement` (insertion, ou
  mise à jour de `person_id` ou de `leg`), et `ride_driver_placed` sur `ride` (insertion,
  ou mise à jour de `driver_id` ou de `leg`). Chacun verrouille la ligne de la Person
  (`FOR UPDATE`) avant de vérifier, pour que deux écritures simultanées ne passent pas
  toutes les deux, et lève `23514` avec un nom de contrainte. Quand `ride_id` est
  renseigné, `placement_driver_on_leg` verrouille d'abord le Ride (`FOR KEY SHARE`) :
  l'ordre reste Ride, puis Person (voir « Concurrence »).
- **Mesure d'audience** : à partir de #346, Vercel Web Analytics, sur le déploiement de
  production seulement, sans cookie, et une page vue ne porte que son origine et sa route
  (voir « Emplacement du code »). Speed Insights reste désactivé.

## Décisions à remonter à l'humain

Une dépendance nouvelle. Un changement de ce qui est **stocké**. Un changement de **qui voit
un téléphone**. Tout ce qui touche aux jetons. L'hébergement, le plan Vercel ou Neon, et le
domaine. Et toute proposition qui introduirait un compte ou une demande d'adresse e-mail
pour les participants, de la publicité ou du tracking : ce sont les principes du produit, pas
des arbitrages techniques. Un participant n'a pas de compte, et on ne lui demande jamais
d'adresse. Le compte de l'organisateur et son adresse e-mail obligatoire sont décidés
(#581) : ils ne sont plus à remonter, mais ce qu'ils stockent et qui le voit l'est toujours.

Le plan gratuit de Vercel est réservé à un usage non commercial : un revenu, quel qu'il soit,
impose de changer de plan.
