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

## État

Projet neuf. Rien n'est encore écrit : la première tâche est de monter la boucle de
vérification (`make check`), que le profil du workflow déclare déjà comme contrat.

Le développement suit le plugin [ola-workflow](https://github.com/olaurendeau/ola-workflow) :
les documents que lisent les agents sont dans [`docs/agents/`](docs/agents/), et le profil
du projet dans [`.claude/workflow.json`](.claude/workflow.json).
