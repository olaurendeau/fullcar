# Architecture

## Forme

Une seule application Next.js (App Router) en TypeScript, et une base Postgres. Hébergée sur
**Vercel** (fonctions serverless) avec **Neon** en production, sur les plans gratuits. Pas de
service séparé, pas de file d'attente, pas de cache externe.

Ce choix n'est pas une étape vers autre chose. Il est dicté par le produit : un événement
est lu par trente personnes pendant trois jours, puis purgé.

| besoin | choix |
|---|---|
| framework | Next.js, App Router, TypeScript strict |
| composants | shadcn/ui (Tailwind, Radix), copiés dans le dépôt ; Drawer pour les feuilles mobiles |
| base | Postgres : Docker en local, Neon en production |
| accès aux données | Kysely (query builder typé, pas d'ORM) et le driver `pg` |
| migrations | le migrateur de Kysely, chaque migration a un `up` et un `down` |
| i18n | next-intl, **sans préfixe de langue** dans l'URL |
| tests | Vitest (domaine, données), Playwright (bout en bout, capture à 360 px) |
| PWA | manifeste et service worker minimal, pas de mode hors ligne en V1 |
| purge | Vercel Cron quotidienne vers une route protégée par `CRON_SECRET` |

Polices servies par l'application (`next/font` en local ou police système) : aucune requête
vers un tiers.

## Environnements et base de données

- **Local** : un conteneur Postgres décrit dans `compose.yaml`. Chaque slot a ses propres
  bases, `fullcar_slot{slot}` pour le serveur de dev et les tests de bout en bout,
  `fullcar_slot{slot}_test` pour Vitest. Deux développeurs en parallèle ne se marchent pas
  dessus.
- **Production** : Neon, région Europe, fonctions Vercel dans la même région. Connexion par
  l'URL **poolée** de Neon, puisque chaque invocation serverless ouvre sa connexion.
- L'URL de la base vient de `DATABASE_URL`, jamais écrite en dur. Une session de
  développement ne se connecte qu'à `localhost` : la base Neon n'est jamais accessible
  depuis un poste de dev ou un agent.
- Neon met la base en veille quand elle ne sert pas : la première requête après une pause
  coûte un peu moins d'une seconde. C'est accepté.

## Concurrence

Contrairement à SQLite, Postgres accepte des écritures simultanées. Deux personnes peuvent
taper la même dernière place au même moment : l'occupation d'une place est donc une
**écriture conditionnelle dans une transaction** (verrou sur le Ride, ou insertion qui
vérifie la capacité restante), et le perdant reçoit un message clair, pas une voiture
surchargée.

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

Il doit aussi être **court** : 8 caractères tirés d'un générateur cryptographique, dans un
alphabet sans caractères ambigus (ni `0/O`, ni `1/l/I`), soit environ 46 bits. Avec une
limite de débit sur les lectures, c'est hors de portée d'une énumération.

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

## Contraintes permanentes

- **Aller et retour indépendants** : toute donnée liée à un déplacement porte son `leg`. Une
  requête sans `leg` est un défaut.
- **i18n** : aucune chaîne visible en dur dans une vue. FR et EN livrées ensemble, une clé
  manquante fait échouer la vérification.
- **360 px** : la largeur de référence, pas un cas limite.
- **Options** : désactivée, une option est **absente** de l'UI, pas grisée. Le code ne doit
  pas supposer qu'une option est active.
- **Purge** : toute nouvelle table se rattache à un événement par une clé étrangère en
  `ON DELETE CASCADE`, sinon elle survivra à la purge.
- **Zéro tracking** : Vercel Web Analytics et Speed Insights restent désactivés.

## Décisions à remonter à l'humain

Une dépendance nouvelle. Un changement de ce qui est **stocké**. Un changement de **qui voit
un téléphone**. Tout ce qui touche aux jetons. L'hébergement, le plan Vercel ou Neon, et le
domaine. Et toute proposition qui introduirait un compte, une adresse e-mail obligatoire, de
la publicité ou du tracking : ce sont les principes du produit, pas des arbitrages
techniques.

Le plan gratuit de Vercel est réservé à un usage non commercial : un revenu, quel qu'il soit,
impose de changer de plan.
