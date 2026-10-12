# Architecture

## Forme

Monolithe JavaScript, SQLite, **un seul conteneur**, PWA. Hébergement Clever Cloud ou
Scalingo. Pas de service séparé, pas de file d'attente, pas de cache externe : l'application
tient dans un processus et un fichier.

Ce choix n'est pas une étape vers autre chose. Il est dicté par le produit : un événement
est lu par trente personnes pendant trois jours, puis purgé.

## Pourquoi SQLite change le découpage

- Un fichier, pas un hôte. Il n'y a pas d'« adresse de base » à autoriser ou interdire : le
  danger est le **chemin du fichier**, et le fichier de production n'est jamais accessible
  depuis une session de développement.
- Les écritures sont sérialisées. Inutile de concevoir pour la concurrence d'écriture, mais
  les écritures longues (purge) ne doivent pas tenir une transaction ouverte.
- Chaque worktree a sa propre base, dérivée du slot. Deux développeurs en parallèle ne se
  marchent pas dessus.

## Jetons, et pourquoi ils sont la pièce critique

Il n'y a pas de compte : **un jeton est la seule identité**. Donc un jeton qui fuit est une
prise de contrôle, et un jeton deviné l'est aussi.

- 128 bits au minimum, tirés d'un générateur cryptographique.
- **Hashés en base**, jamais stockés en clair : une copie de la base ne donne pas les accès.
- `Referrer-Policy: no-referrer`, puisque les jetons sont dans l'URL.
- **Jamais journalisés**, ni en clair ni tronqués, ni dans les URL des logs d'accès.
- Comparaison à temps constant.

Toute PR qui touche la génération, le stockage, la comparaison ou la journalisation d'un
jeton est une zone sensible : elle est mergée par l'humain.

## Visibilité du téléphone : une règle, un seul endroit

Un téléphone n'est visible que par l'admin, et par les détenteurs d'un jeton ayant une
personne **dans la même voiture, pour le même leg**. Cette règle ne doit exister **qu'à un
seul endroit** du code, traversé par toutes les lectures. Si deux chemins la re-dérivent,
l'un des deux finira par la rater — et le défaut sera invisible dans l'UI de celui qui l'a
écrit.

## Découpage d'une fonctionnalité

Dans cet ordre, parce que chaque étape rend la suivante vérifiable :

1. **Migration** (schéma), avec sa descente testée.
2. **Domaine** : les règles en fonctions pures, sans HTTP ni SQL — c'est là que vivent
   « une Person a au plus un Placement par leg » et la visibilité du téléphone.
3. **Accès aux données** : requêtes isolées, aucune règle métier.
4. **HTTP** : routes minces, qui valident l'entrée et délèguent.
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
- **Purge** : toute nouvelle table porte de quoi la rattacher à un événement, sinon elle
  survivra à la purge.

## Décisions à remonter à l'humain

Une dépendance nouvelle. Un changement de ce qui est **stocké**. Un changement de **qui voit
un téléphone**. Tout ce qui touche aux jetons. L'hébergement et le domaine. Et toute
proposition qui introduirait un compte, une adresse e-mail obligatoire, de la publicité ou
du tracking : ce sont les principes du produit, pas des arbitrages techniques.
