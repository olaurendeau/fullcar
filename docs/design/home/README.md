# Page d’accueil et lien « Accueil »

- Artifact : https://claude.ai/artifact/7it5PhfKCw8CNcREG4hAc7
- Epic : https://github.com/olaurendeau/fullcar/issues/232
- Voisines : `language-switch` (#113) décrit le bas de page avant ce changement ; elle n’est
  pas republiée, cette maquette la complète pour la ligne du bas de page.
- Page : `index.html` (autonome, maquettes à 360 px de large)
- Couleurs : remplacées par `visual-identity` v3 (#651). Ce que cette page dessine en `--app-primary` (#171717) est désormais #005a5b, sauf la barre de message réussie, qui reste #171717 ; l’onglet sélectionné, les tuiles teintées et la marque y sont décrits.

## Ce que la page montre

Aujourd’hui `/` est le formulaire de création. Demain :

- `/` est une page d’accueil : le titre et l’accroche d’aujourd’hui, un paragraphe, un seul
  lien-bouton « Créer un événement » vers `/nouveau`, puis « Comment ça marche » en trois
  étapes, puis la durée de conservation. Colonne `max-w-md`, comme aujourd’hui.
- `/nouveau` est le formulaire d’aujourd’hui, inchangé, sous un h1 « Créer un événement ».
- Le bas de page partagé (`src/components/contact/contact-footer.tsx`) gagne un lien
  « Accueil » vers `/`, premier de la ligne : « Accueil », bouton de langue, « Nous
  contacter ». Absent de `/`.

## États couverts

| état | section | critères |
|---|---|---|
| accueil FR et EN à 360 × 780, pli marqué | « L’accueil » | A1.1, A1.2, A1.3, A1.5, A3.2 |
| accueil sur un ordinateur, 1280 × 800 : colonne en haut, bouton de 416 px | « L’accueil sur un ordinateur » | A1.2 |
| `/nouveau`, haut et bas de page | « Créer un événement » | A2.1, A3.1, A3.3, A3.4 |
| bas de page FR, EN, focus clavier, sur `/` | « Le bas de page » | A3.1 à A3.6 |
| depuis `/e/{id}/admin#{jeton}`, avant et après le tap | « Depuis l’espace organisateur » | A3.7 |
| sans JavaScript (`/nouveau`), bas de page compris : « Accueil » actif, langue grisée | « Quand ça ne se passe pas comme prévu » | A1.4, A3.9 |
| Événement introuvable (tuile `SearchX`, centrage vertical), bouton vers `/nouveau` | idem | A2.5, A3.1 |
| échec du changement de langue avec « Accueil » | idem | (#129, inchangé) |
| hors ligne | note, rien d’ajouté | — |

## Les mots

| clé (proposée) | fr | en |
|---|---|---|
| `Home.title` (inchangé) | Fullcar | Fullcar |
| `Home.tagline` (inchangé) | Le covoiturage de groupe, aller et retour, sans compte. | Group carpooling, there and back, no account needed. |
| `Home.intro` | Un match, un mariage, un week-end au ski : partagez un seul lien, et chacun voit qui conduit, où il reste des places et qui n’a pas encore de voiture. | A match, a wedding, a ski weekend: share one link, and everyone sees who is driving, where seats are free and who still has no car. |
| `Home.create` | Créer un événement | Create an event |
| `Home.howItWorks` | Comment ça marche | How it works |
| `Home.steps.create.title` | Créez l’événement | Create the event |
| `Home.steps.create.text` | Un titre, un lieu, l’heure de début et, s’il y a un retour, l’heure de fin. Sans compte ni adresse e-mail. | A title, a place, the start time and, if there is a return trip, the end time. No account, no email address. |
| `Home.steps.share.title` | Partagez le lien | Share the link |
| `Home.steps.share.text` | Par SMS ou dans le groupe. Chacun s’inscrit, propose une voiture ou prend une place libre. | By text message or in the group chat. Everyone signs up, offers a car or takes a free seat. |
| `Home.steps.follow.title` | Suivez qui reste sans voiture | See who still has no car |
| `Home.steps.follow.text` | Un bandeau dit combien de personnes sont encore sans voiture, et s’il manque des places. | A banner shows how many people still have no car, and whether seats are missing. |
| `Home.deleted` | Les événements sont supprimés 30 jours après leur date. | Events are deleted 30 days after their date. |
| `NewEvent.title` (h1 et titre du document) | Créer un événement | Create an event |
| `Contact.home` | Accueil | Home |

## Décisions

Les mêmes, dans le même ordre, que la section « Décisions » de `index.html`.

1. Décision : le formulaire part à `/nouveau`. — Raison : court, chemin sans langue comme
   les autres (`/e/{id}/moi`), hors de `/e/` (un événement, `noindex`). `/e/nouveau` reste un
   identifiant invalide (7 caractères au lieu de 8) : « Événement introuvable », 404.
2. Décision : aucune redirection ; les favoris de `/` arrivent sur l’accueil, à un tap du
   formulaire, visible sans défiler. — Raison : une redirection effacerait l’accueil demandé.
3. Décision : sur un écran large, la colonne de 448 px reste en haut, centrée
   horizontalement, et le bouton prend toute sa largeur (416 px). — Raison : comme le
   formulaire de `/` aujourd’hui et `/e/{id}` ; l’accueil se lit de haut en bas, ce n’est
   pas un message court comme « Événement introuvable » ; le h1 ne bouge pas de `/` à
   `/nouveau`.
4. Décision : un seul bouton « Créer un événement », au-dessus des étapes. — Raison : la
   page tient presque dans un écran de 360 × 780 ; un doublon charge l’interface.
5. Décision : C1.4 de #3 amendé : six actions depuis `/nouveau`, sept depuis `/`, moins de
   30 s depuis `/`. — Raison : conséquence directe du bouton demandé.
6. Décision : « Accueil » absent de `/` (pas d’`aria-current`). — Raison : un lien vers la
   page courante ne mène nulle part.
7. Décision : présent partout ailleurs, « Événement introuvable » comprise. — Raison : un bas
   de page identique ; son bouton mène à `/nouveau`, « Accueil » à `/`.
8. Décision : ordre « Accueil », langue, « Nous contacter ». — Raison : on lit d’abord où
   aller ; K1 de #69 tient. Prolongé par `github-link` (#489) en « Accueil », langue, « Code
   source sur GitHub », « Nous contacter ».
9. Décision : le focus de « Accueil » est l’anneau du bouton de langue, seul
   (`outline-none focus-visible:ring-3 focus-visible:ring-ring/50`, `rounded-lg`). — Raison :
   un seul style de focus dans la ligne.
10. Décision : pas de `<nav>`. — Raison : un seul lien interne n’est pas un bloc de
    navigation.
11. Décision : rien de plus pour la confidentialité. — Raison : adresse fixe `/`, fragment
    jamais transmis, `Referrer-Policy: no-referrer` déjà partout ; A3.7 le prouve.
12. Décision : « Accueil » est un mot d’interface, pas un terme du domaine. — Raison : le
    glossaire n’en a pas besoin.

## Révisions

- v1 (2026-10-20) : première version, publiée.
  Revue de design : changements demandés (bloquant : écran large non dessiné ; cinq
  suggestions).
- v2 (2026-10-20) : accueil à 1280 × 800 dessiné (colonne en haut, bouton de 416 px) et
  A1.2 précisé ; focus de « Accueil » réduit à l’anneau du bouton de langue (A3.5) ;
  « Événement introuvable » redessinée avec sa tuile `SearchX` et son centrage vertical ;
  étape 3 réécrite, vraie pour un événement sans retour ; bas de page sans JavaScript dessiné
  (A3.9) ; epic #232. Étape 1 marquée provisoire, en attente du nom des dates. Toutes les
  remarques appliquées, aucune contestée. Non republiée, sur consigne du coordinateur :
  l’artifact reste en v1.
  Revue de design : approuvée, sans bloquant.
- v2.1 (2026-10-20) : étape 1 arrêtée selon #235 (« Début » / « Fin », pas de fin sans
  retour), marqueur « provisoire » retiré ; étape 3 vraie pour les quatre textes
  `Board.banner.*` ; listes de décisions du README et de la page alignées (le focus de
  « Accueil » ajouté à la page, le mot « Accueil » au README). Republiée à la même URL.
