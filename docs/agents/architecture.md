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
| composants | shadcn/ui (Tailwind v4, Radix, preset Nova), copiés dans `src/components/ui` ; Drawer pour les feuilles mobiles |
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
| `make ci` | tout ce que la CI exécute : `make check` puis `make e2e` |
| `make check` | lint, typecheck, tests, clés i18n, build de production |
| `make up` / `make down` | démarre / arrête et efface l'environnement du slot ; `make up` démarre la base, **lui applique les migrations**, puis démarre `web`, et une migration en échec l'arrête avant `web` (#27) |
| `make e2e` | tests de bout en bout Playwright contre le **build de production** du slot |
| `make shot` | captures d'écran (360 px par défaut) |
| `make npm ARGS="…"` | npm dans le conteneur, pour ajouter une dépendance par exemple ; refuse `version` (et sa variante `verison`), `publish`, `unpublish`, `dist-tag` (`dist-tags`) et `deprecate`, qui reviennent à l'humain |

Le dépôt est monté dans le conteneur, `node_modules` compris : installés par le conteneur
Linux, ils restent lisibles par l'éditeur de l'hôte pour les types.

La CI exécute le même `make ci`, avec un slot explicite : ce qui passe en local passe en CI. La variable `CI` est
transmise aux conteneurs : en CI, Vitest et Playwright refusent un `.only`, que le lint
refuse déjà partout.

Le service Node s'appelle `web`, pas `app` : Chromium précharge HSTS pour tout le TLD `.app`
et force alors HTTPS sur `http://app:3000`, ce qui casse les tests de bout en bout.

### Slots

Chaque slot est un **projet Compose distinct** (`fullcar-slot{slot}`) : son conteneur Node (`web`),
son conteneur Postgres, ses volumes. Rien n'est partagé, donc deux développeurs en parallèle
ne se marchent pas dessus, et `make down SLOT={slot}` efface tout ce que le slot a créé.
L'application du slot écoute sur le port `30{slot}0` de l'hôte, en `127.0.0.1` seulement ;
Postgres n'est pas exposé, il n'est joignable que par le nom `db` dans le réseau du slot. Dans
ce conteneur, la base `fullcar` sert au serveur de dev et aux tests de bout en bout, `fullcar_test` à Vitest.

`make up` lance le serveur de dev (`next dev`). Les tests de bout en bout, eux, tournent
contre le build de production (`next build` puis `next start`) : c'est ce build qui part
sur Vercel, et le serveur de dev ne se comporte pas comme lui (compilation à la demande,
rendu, cache).

**Un worktree git par slot** : chaque développeur travaille dans son propre worktree, avec
son slot. Deux slots dans le même répertoire partageraient `node_modules`, `.next` et les
fichiers en cours d'écriture.

### Base de test (Vitest)

Vitest utilise **deux bases**, jamais `fullcar`, que le serveur de dev et les tests de bout
en bout utilisent :

- `fullcar_test`, pour les tests de données, dont l'URL vient de `TEST_DATABASE_URL`. Un
  `globalSetup` remet son schéma à zéro et la migre **une seule fois** par lancement ;
  aucun test ne migre ni ne vide la base lui-même. Un test qui écrit en base s'isole avec
  `withRollback` : il reçoit une transaction, qui est annulée à la fin. Aucune donnée ne
  survit d'un test à l'autre, et l'ordre des tests ne compte pas.
- `fullcar_migrations_test`, pour le seul test d'aller-retour des migrations (montée,
  descente, remontée) : il ne touche pas `fullcar_test`, que les autres tests lisent en
  même temps.

La mise en place des tests **refuse de remettre à zéro toute autre base** que ces deux-là :
une URL mal configurée échoue au lieu d'effacer une base qui n'est pas la sienne.

Ces règles sont mises en place par #5.

### Données des tests de bout en bout

- Un test Playwright amorce ses données **directement dans la base du slot**, par une
  fixture qui appelle les fonctions de `src/db/` (par exemple `seedEvent`). Jamais par une
  route HTTP réservée aux tests : une telle route finirait par exister en production.
- **Chaque test possède son événement** : il le crée, et ne lit ni ne modifie celui d'un
  autre test. Les tests restent indépendants et peuvent tourner en parallèle.

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

Un téléphone n'est visible que par l'admin, et par les détenteurs d'un jeton ayant une
personne **dans la même voiture, pour le même leg**. Cette règle ne doit exister **qu'à un
seul endroit** du code, traversé par toutes les lectures. Si deux chemins la re-dérivent,
l'un des deux finira par la rater — et le défaut sera invisible dans l'UI de celui qui l'a
écrit.

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
| domaine | `src/domain/` | fonctions pures : n'importe ni `kysely`, ni `pg`, ni `next/*`, ni `react`, ni `@/db/*` (le lint l'impose, #9) |
| accès aux données | `src/db/<entité>.ts` (ex. `src/db/events.ts`) | chaque fonction reçoit `db: Kysely<Database>` en paramètre, pour qu'un test lui passe sa transaction ; aucune règle métier |
| migrations | `src/db/migrations/` | seul endroit où `sql.raw` est permis |
| server actions | `src/app/…/actions.ts`, à côté de la route qui s'en sert | minces : valider l'entrée, déléguer au domaine et aux données |
| composants | `src/components/<domaine>/` (ex. `src/components/event/`) | n'importent pas `@/db/*` |
| shadcn/ui | `src/components/ui/` | générés par `make npm ARGS="exec shadcn add …"` |

Une server action renvoie des **données simples** (sérialisables) et des **clés d'erreur**
(traduites par la vue), jamais un message rédigé ni le détail d'une erreur Postgres. Elle
n'appelle **jamais `redirect()` vers une URL qui contient un jeton** : la redirection passe
par l'en-tête `Location`. Le jeton revient dans le corps de la réponse, et c'est le client
qui navigue vers `…#{jeton}`.

## Règles d'exécution

- **Pas de `loading.tsx` sur une route qui peut répondre 404.** Avec un `loading.tsx`, Next
  envoie la réponse en streaming dès le début, avec un statut 200 ; un `notFound()` appelé
  ensuite ne peut plus changer le statut. Sous `/e/[id]`, la page attend sa lecture en base
  et répond un vrai 404.
- **Heures sans fuseau.** Une heure d'événement est l'heure locale du lieu : elle est stockée
  en `timestamp without time zone` et relue comme **chaîne brute** (`2026-12-12 07:30:00`),
  jamais convertie en `Date` dans le fuseau du serveur ou du navigateur. Pour l'affichage,
  next-intl est configuré avec `timeZone: "UTC"`, et l'heure est mise en forme comme une
  heure UTC : 07:30 s'affiche 07:30 à Paris comme à New York.

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
  | `placement.person_id` | `CASCADE` | un Placement appartient à sa Person |
  | `placement.ride_id` | `SET NULL` | quand un Ride est supprimé, ses passagers repassent « sans voiture » sur ce leg, au lieu de devenir « pas concernés » |
  | `placement.stop_id` | `SET NULL` | quand un Arrêt est supprimé, le passager monte (ou descend) au lieu du Ride |
  | `ride.driver_id` | à trancher | à trancher dans l'epic « Proposer une voiture » (supprimer la voiture, ou refuser la suppression) |

  Empêcher un Placement de pointer vers un Ride d'un autre événement ou d'un autre leg (clé
  étrangère composite) est à concevoir avec l'epic « S'inscrire et prendre une place ».
- **Zéro tracking** : Vercel Web Analytics et Speed Insights restent désactivés.

## Décisions à remonter à l'humain

Une dépendance nouvelle. Un changement de ce qui est **stocké**. Un changement de **qui voit
un téléphone**. Tout ce qui touche aux jetons. L'hébergement, le plan Vercel ou Neon, et le
domaine. Et toute proposition qui introduirait un compte, une adresse e-mail obligatoire, de
la publicité ou du tracking : ce sont les principes du produit, pas des arbitrages
techniques.

Le plan gratuit de Vercel est réservé à un usage non commercial : un revenu, quel qu'il soit,
impose de changer de plan.
