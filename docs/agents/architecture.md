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
| purge | Vercel Cron quotidienne vers une route protégée par `CRON_SECRET` |

Polices : la pile de polices système, **aucune police web**, ni distante ni servie par
l'application. Aucune requête vers un tiers, et rien à télécharger avant le premier
affichage.

## Environnements et base de données

### Tout passe par Docker

Rien n'est installé sur le poste : ni Node, ni npm, ni Postgres, ni navigateur de test. Node,
la base et Playwright tournent dans des conteneurs décrits par `compose.yaml`, et le
`Makefile` est la seule porte d'entrée. Une commande lancée à nu sur l'hôte (`npm …`,
`npx …`) est un défaut : elle ne marche que sur la machine de celui qui l'a écrite.

| commande | effet |
|---|---|
| `make ci` | tout ce que la CI exécute : `make check`, puis les tests de bout en bout contre le build de production que `make check` vient de produire (un seul build) |
| `make check` | lint, typecheck, tests, clés i18n, build de production |
| `make up` / `make down` | démarre / arrête et efface l'environnement du slot ; `make up` démarre la base, **lui applique les migrations**, puis démarre `web`, et une migration en échec l'arrête avant `web` (#27) |
| `make e2e` | construit le **build de production** du slot, puis lance les tests de bout en bout Playwright contre `next start` |
| `make shot` | construit le build de production du slot, puis prend les captures d'écran (360 px par défaut, `WIDTH=…`) contre `next start`, dans `var/shots` |
| `make npm ARGS="…"` | npm dans le conteneur, pour ajouter une dépendance par exemple ; refuse `version` (et sa variante `verison`), `publish`, `unpublish`, `dist-tag` (`dist-tags`) et `deprecate`, qui reviennent à l'humain |

Le dépôt est monté dans le conteneur, `node_modules` compris : installés par le conteneur
Linux, ils restent lisibles par l'éditeur de l'hôte pour les types.

La CI exécute le même `make ci`, avec un slot explicite (`make ci SLOT=0`) : ce qui passe
en local passe en CI. La variable `CI` est transmise aux conteneurs : en CI, Vitest et
Playwright refusent un `.only`, que le lint refuse déjà partout.

Le service Node s'appelle `web`, pas `app` : Chromium précharge HSTS pour tout le TLD `.app`
et force alors HTTPS sur `http://app:3000`, ce qui casse les tests de bout en bout.

### Slots

Chaque slot est un **projet Compose distinct** (`fullcar-slot{slot}`) : son conteneur Node (`web`),
son conteneur Postgres, ses volumes. Rien n'est partagé, donc deux développeurs en parallèle
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
  test échoue ; la cascade emporte le reste. Pour que les autres tests ne voient pas ces
  lignes passagères, `withRollback` ouvre sa transaction en `REPEATABLE READ` : un test
  qui compte des lignes ne voit pas celles qu'un test de concurrence valide en parallèle
  après sa première lecture.
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
- Les déploiements de prévisualisation (preview) n'ont pas de base pour l'instant.

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
s'attendre l'une l'autre. Ces verrous se prouvent par des tests de concurrence (voir « Base
de test (Vitest) »).

## Jetons, et pourquoi ils sont la pièce critique

Il n'y a pas de compte : **un jeton est la seule identité**. Donc un jeton qui fuit est une
prise de contrôle, et un jeton deviné l'est aussi.

- 128 bits au minimum, tirés d'un générateur cryptographique.
- **Hashés en base**, jamais stockés en clair : une copie de la base ne donne pas les accès.
- **Jamais dans le chemin ni dans la query string d'une URL.** Vercel journalise le chemin de
  chaque requête, et ces journaux ne nous appartiennent pas. Un jeton qui voyage dans une URL
  le fait dans le **fragment** (`#…`), que le navigateur n'envoie jamais au serveur : le
  client le lit et le transmet dans le corps de la requête.
  - lien admin : `/e/{id}/admin#{token}`
  - lien perso : `/e/{id}/moi#{token}`
- **Jamais journalisés**, ni en clair ni tronqués, ni côté serveur ni dans un rapport
  d'erreur.
- Comparaison à temps constant.
- `Referrer-Policy: no-referrer` sur toutes les pages : le fragment n'est pas transmis dans le
  `Referer`, mais l'identifiant de l'événement l'est.

Les deux jetons ne naissent pas au même endroit :

- Le **jeton d'organisateur** est tiré par le **serveur** (`newAdminToken`,
  `src/domain/admin-token.ts`) quand l'événement est créé, et revient une fois dans le corps
  de la réponse.
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

À partir de #66 (D2), le téléphone d'une personne n'est envoyé à un appareil que dans deux
cas :

- l'appareil a une personne **dans la même voiture, pour le même leg**, conducteur
  compris, dans les deux sens ;
- la personne est une **personne de l'appareil** (créée avec le jeton personnel que ce
  navigateur garde pour cet événement).

Le numéro est posé **voiture par voiture**, et dans la section des personnes de l'appareil,
jamais sur la personne elle-même : un passager de l'aller ne voit pas le numéro de son
conducteur sur le retour, où ils ne partagent pas de voiture. La visibilité par l'admin
arrive avec l'épic « Administrer l'événement » ; d'ici là, `/e/{id}/admin` ne montre aucun
numéro de plus que `/e/{id}`.

Cette règle ne doit exister **qu'à un seul endroit** du code, traversé par toutes les
lectures. Si deux chemins la re-dérivent, l'un des deux finira par la rater — et le défaut
sera invisible dans l'UI de celui qui l'a écrit. À partir de #66, cet endroit est
`src/domain/phone-visibility.ts`, et une seule requête lit la colonne `phone` :
`src/db/event-rows.ts`.

## i18n

next-intl, sans préfixe de langue : `/e/{id}` est le même lien pour tout le monde. La langue
vient d'un cookie s'il existe, sinon d'`Accept-Language`, sinon le français. Un lien partagé
s'ouvre dans la langue de celui qui le reçoit.

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
| jeton personnel dans le navigateur | `src/app/e/[id]/device-token.ts`, à partir de #66 | seul code navigateur qui touche au jeton personnel, comme `src/app/e/[id]/admin/admin-link.ts` pour le jeton d'organisateur |
| téléphone | `src/db/event-rows.ts` et `src/domain/phone-visibility.ts`, à partir de #66 | la seule requête qui lit la colonne `phone`, et le seul endroit de la règle de visibilité |
| composants | `src/components/<domaine>/` (ex. `src/components/event/`, que #21 crée) | n'importent pas `src/db`, ni par `@/db` ni par un chemin relatif, en `import` comme en `import()` |
| shadcn/ui | `src/components/ui/` | générés par `make npm ARGS="exec shadcn add …"` |

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
- **Heures sans fuseau.** Une heure d'événement est l'heure locale du lieu : elle est stockée
  en `timestamp(0)` (sans fuseau) et relue comme **chaîne brute** (`2026-12-12 07:30:00`),
  jamais convertie en `Date` dans le fuseau du serveur ou du navigateur. `src/db/client.ts`
  le garantit : chaque pool garde `date` et `timestamp`, et leurs tableaux, en chaînes, sans
  toucher aux `pg.types` globaux ; `src/domain/wall-clock.ts` les manipule en chaînes. Pour
  l'affichage, `wallClockAsUtc` en fait l'instant UTC qui porte les mêmes chiffres,
  next-intl est configuré avec `timeZone: "UTC"`, et 07:30 s'affiche 07:30 à Paris comme à
  New York. `timeZone: "UTC"` arrive dans `src/i18n/request.ts` avec #21.

## Contraintes permanentes

- **Aller et retour indépendants** : toute donnée liée à un déplacement porte son `leg`. Une
  requête sans `leg` est un défaut.
- **i18n** : aucune chaîne visible en dur dans une vue. FR et EN livrées ensemble, une clé
  manquante fait échouer la vérification.
- **360 px** : la largeur de référence, pas un cas limite.
- **Options** : désactivée, une option est **absente** de l'UI, pas grisée. Le code ne doit
  pas supposer qu'une option est active.
- **Purge** : chaque table a une clé étrangère vers l'Event en `ON DELETE CASCADE`. C'est
  ce qui fait marcher la purge : supprimer l'Event emporte tout le reste, et une table sans
  cette clé survivrait à la purge.
- **Autres clés étrangères** : chacune est choisie selon la relation, et écrite ici. Une
  nouvelle clé s'ajoute à ce tableau dans la même PR.

  | clé | `ON DELETE` | pourquoi |
  |---|---|---|
  | `stop.ride_id` | `CASCADE` | un Arrêt appartient à son Ride |
  | `placement (person_id, event_id)` → `person (id, event_id)` | `CASCADE` | un Placement appartient à sa Person, du même événement |
  | `placement (ride_id, event_id, leg)` → `ride (id, event_id, leg)` | `SET NULL (ride_id)` | quand un Ride est supprimé, ses passagers repassent « sans voiture » sur ce leg, au lieu de devenir « pas concernés » ; seule `ride_id` est remise à `null`, `event_id` et `leg` restent |
  | `placement.stop_id` | `SET NULL` | quand un Arrêt est supprimé, le passager monte (ou descend) au lieu du Ride |
  | `ride (driver_id, event_id)` → `person (id, event_id)` | `CASCADE` | supprimer le conducteur retire sa voiture, et ses passagers repassent « sans voiture » par la clé `placement → ride` ; rien ne supprime de personne dans #66 |

  Les clés de `ride` et de `placement`, hors `stop_id`, arrivent avec #66. Les clés
  composites empêchent un Placement de pointer vers un Ride d'un autre événement ou d'un
  autre leg (C12.7), et un Ride ou un Placement de pointer vers une Person d'un autre
  événement. Leurs cibles sont `unique (id, event_id)`
  sur `person` et `unique (id, event_id, leg)` sur `ride`. Une clé composite n'est vérifiée
  que si toutes ses colonnes sont renseignées (`MATCH SIMPLE`) : un Placement « sans
  voiture » (`ride_id` à `null`) ne l'est pas. `SET NULL (ride_id)`, limité à une colonne,
  exige Postgres 15 ou plus : 18 en local, 17 ou plus chez Neon.

  Deux déclencheurs garantissent en base qu'une conductrice n'a pas de Placement sur le leg
  où elle conduit (#66, C12.8) : `placement_driver_on_leg` sur `placement`, et
  `ride_driver_placed` sur `ride`. Chacun verrouille d'abord la ligne de la Person
  (`FOR UPDATE`), pour que deux écritures simultanées ne passent pas toutes les deux, et
  lève `23514` avec un nom de contrainte.
- **Zéro tracking** : Vercel Web Analytics et Speed Insights restent désactivés.

## Décisions à remonter à l'humain

Une dépendance nouvelle. Un changement de ce qui est **stocké**. Un changement de **qui voit
un téléphone**. Tout ce qui touche aux jetons. L'hébergement, le plan Vercel ou Neon, et le
domaine. Et toute proposition qui introduirait un compte, une adresse e-mail obligatoire, de
la publicité ou du tracking : ce sont les principes du produit, pas des arbitrages
techniques.

Le plan gratuit de Vercel est réservé à un usage non commercial : un revenu, quel qu'il soit,
impose de changer de plan.
