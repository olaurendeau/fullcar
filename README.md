# Fullcar

Covoiturage de groupe pour un événement. Sans compte, sans pub, sans tracking.

Un organisateur crée un événement, partage un lien, et chacun déclare en un geste qu'il
conduit ou qu'il cherche une place — à l'aller, au retour, ou les deux.

## Pourquoi

Les outils existants (Covievent, Covoitribu) demandent un login par e-mail à chaque
modification, affichent une interface chargée, et ne gèrent pas le retour : il faut créer
un second événement. Le cas le plus fréquent — des parents qui conduisent des enfants à
l'aller mais pas au retour — y est pénible à exprimer.

## Principes

- **Zéro compte**, aucune adresse e-mail obligatoire.
- **Un seul écran**, mobile d'abord, utilisable sur 360 px de large.
- **Aller et retour** natifs et indépendants dans le même événement.
- **i18n dès le départ** : français et anglais.
- **Sans pub ni tracking**, purge automatique des données 30 jours après l'événement.

## Stack

Next.js (App Router) en TypeScript, shadcn/ui, Postgres via Kysely, next-intl. Neon en
production, hébergement sur Vercel. En local, **tout passe par Docker** : il suffit de Docker
et de `make`, rien d'autre à installer. Le détail et les
raisons sont dans [`docs/agents/architecture.md`](docs/agents/architecture.md).

## Démarrer

Il suffit de Docker et de `make` :

```bash
make up      # serveur de dev sur http://localhost:3000, avec sa base Postgres
make check   # lint, typecheck, clés i18n, tests, build
make e2e     # tests de bout en bout (Playwright, 360 px) contre le build de production
make ci      # make check, puis les tests de bout en bout sur son build (un seul build) : ce que la CI exécute
make down    # arrête tout et efface les données locales
make help    # le reste
```

Le développement suit le plugin [ola-workflow](https://github.com/olaurendeau/ola-workflow) :
les documents que lisent les agents sont dans [`docs/agents/`](docs/agents/), et le profil
du projet dans [`.claude/workflow.json`](.claude/workflow.json).

## Variables d'environnement de Sentry

Toutes facultatives. Sans `NEXT_PUBLIC_SENTRY_DSN`, Sentry n'est ni chargé ni configuré, et
rien ne part. Les variables en `NEXT_PUBLIC_` sont lues au build : redéployer après un
changement.

| variable | rôle |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | le DSN du projet Sentry (organisation en région EU) ; active Sentry côté serveur et navigateur |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | la part des traces envoyées, entre `0` et `1` (par exemple `0.1`) ; absente ou invalide, aucune trace |
| `SENTRY_AUTH_TOKEN` | build seulement : envoie les source maps à Sentry, puis les supprime du build ; sans lui, aucune n'est produite |
| `SENTRY_ORG`, `SENTRY_PROJECT` | build seulement, avec `SENTRY_AUTH_TOKEN` : où envoyer les source maps |

La release et l'environnement viennent de Vercel (`VERCEL_GIT_COMMIT_SHA`, `VERCEL_ENV`, et
leurs versions `NEXT_PUBLIC_` dans le navigateur) : « Automatically expose System Environment
Variables » doit rester activé.
