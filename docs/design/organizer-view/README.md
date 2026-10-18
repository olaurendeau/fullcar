# Vue organisateur

- Artifact : https://claude.ai/artifact/6WQ2cPNX5cxh4UAA8hqtJF
- Epic : https://github.com/olaurendeau/fullcar/issues/154
- Origine : revue de design de l'humain sur #66 (section « Administrateur (vue globale) »), décision https://github.com/olaurendeau/fullcar/issues/66#issuecomment-6250124984
- Tableau des participants dessiné dessous : #66 v4.1 (`event-board`, approuvée)
- Page : `index.html` (autonome ; maquettes à 360 px de large, et des navigateurs de 1280 px montrés à 75 % et à 55 %)
- Version : v3.1

## Décisions de l'humain (2026-10-18)

- **DO1 = (a) : visibilité du téléphone.** L'organisateur voit le numéro de chaque personne **sans voiture sur un leg**, pour ce leg seulement. Pour une voiture, il voit seulement si son conducteur a un numéro, jamais ce numéro. Partout ailleurs, tableau sous le panneau compris, la règle d'aujourd'hui (#66 C10.1) reste. `Admin.adminLink.hint` est modifiée.
- **DO2 = (c) : pas de QR code dans cet epic.** Le lien à partager garde la disposition d'aujourd'hui. L'epic #67 (lien perso) aura besoin d'un QR code et décidera comment le produire.

## Ce que la page montre

L'espace organisateur de `/e/{id}/admin#{jeton}`, au-dessus de l'en-tête de l'événement et du tableau des participants (#66 v4.1, inchangé, C11.7).

### Ordre sous 1024 px

1. « Espace organisateur » (h2) et « Actualiser » (`outline`, 44 px), sur une même ligne. Le titre est la cible du focus après « Réessayer » (`tabIndex={-1}`).
2. **Vignettes**, une par leg, en grille de deux colonnes même à 360 px. Absentes tant qu'aucun leg n'a ni voiture ni personne ; sans retour, une seule, sur toute la largeur. Voir « Les vignettes ».
3. **Lien à partager** : libellé, phrase, le lien, puis « Copier » et « Partager » (inchangés).
4. Lien d'organisateur, puis « Gardez ce lien » (inchangés). La phrase du lien d'organisateur change (`Admin.adminLink.hint`, DO1).
5. **Une section par leg** (h3), séparée par une bordure haute :
   - date et heure (`LegTime`) ;
   - bandeau : `CoverageBanner` réutilisé, avec une nouvelle prop `live={false}` qui retire `role="status"` (le tableau annonce déjà le sien) ;
   - « Sans voiture ({count}) » (h4) avec la phrase de confidentialité, puis une ligne par personne ;
   - « Voitures sans numéro ({count}) » (h4) avec sa phrase, puis une ligne par voiture.

   La phrase sous un titre de liste n'apparaît que si la liste a des lignes ; une liste vide garde son titre « (0) » et prend sa phrase vide.
   - **Leg vide** (ni voiture ni personne) : l'état vide du tableau, extrait de `leg-panel.tsx` en un composant partagé (`EmptyLeg` : icône, `Event.noCar.*`, `Event.nobody`), sans bandeau ni liste.
   - **Leg avec des personnes sans voiture mais aucune voiture** : le bandeau, puis la phrase `Event.noCar.*` (`text-sm text-muted-foreground`, comme `leg-panel.tsx`), puis « Sans voiture » ; pas de liste « Voitures sans numéro » (O1.6).

### À partir de 1024 px

Le panneau fait au plus `max-w-5xl` (1024 px), centré. Première rangée, deux colonnes : le lien à partager ; le lien d'organisateur avec l'avertissement. Puis une ligne de séparation. Deuxième rangée : Aller | Retour côte à côte (`grid-cols-2`, `items-start`, sans la bordure haute des sections), sans vignettes. Sans retour, la section unique occupe la colonne de gauche et celle de droite reste vide. L'en-tête de l'événement et le tableau restent en `max-w-md`, centrés.

Largeurs des états (O7.5) :

- avant que le panneau existe, ce qui tient sa place (chargement, échec et « Réessayer », lien invalide, sans JavaScript) a la largeur du tableau, `max-w-md`, centré au-dessus de l'en-tête ;
- une fois le panneau là, l'alerte d'actualisation (O5.4) et la phrase de retrait (O1.10) prennent toute sa largeur : **le cadre** va d'un bord à l'autre du panneau, et **le texte** à l'intérieur est limité à `max-w-prose` (mesuré à 1280 px : cadre de 957 px pour 959 px de panneau, texte de 574 px).

### Les vignettes

Un `<button type="button">` par leg, **jamais un lien `#…`** : il appelle `scrollIntoView` sur la section, puis `focus()` sur son titre (`tabIndex={-1}`). Une ancre remplacerait le jeton dans le fragment, et `hashchange` relancerait la vérification, qui répondrait « invalide » (O6.3).

- Fond blanc (`bg-background`), bordure (`border`), `rounded-lg`, `px-3 py-2`, 44 px au moins, **sans icône**.
- De haut en bas :
  - le nom du leg (`Event.legs.*`, 14 px, `font-semibold`) ;
  - quand N > 0, la **pastille ambre** des onglets de la v4.1 (`Board.tabCount`, « 4 sans voiture », `amber-100` / `amber-950`, 12 px) ;
  - les places, 13 px : `Board.banner.everyoneSeated` (N = 0), `Admin.tile.free` (N > 0 et M ≥ N), ou `Admin.tile.missing` en `font-semibold` (M < N).
- Leg vide à côté d'un leg rempli : le nom du leg, puis `Event.nobody` en `text-muted-foreground` sur blanc (4,74:1), sans pastille.
- Nom accessible : le texte visible, dans l'ordre (« Retour 4 sans voiture Il manque 2 places »).

### L'ambre

Le panneau ne crée pas de sens nouveau pour l'ambre : il reprend les deux de la v4.1, chacun sur son élément.

- **Pastille ambre** : quelqu'un est sans voiture (N > 0). Onglets du tableau, vignettes du panneau.
- **Fond ambre du bandeau** : il manque des places (M < N). Bandeau du tableau, bandeau des sections du panneau.

La vignette n'a donc jamais de fond ambre.

### Les lignes

- **« Sans voiture »** : une grille `minmax(0,1fr) auto`, 44 px au moins, séparateur haut.
  - À gauche, le prénom (`font-medium`, `wrap-anywhere`), qui passe à la ligne **dans sa colonne**.
  - À droite, **toujours**, le numéro : `phone-link.tsx` de #66 réutilisé (lien `tel:` de 44 px, texte = le numéro tel que saisi, `whitespace-nowrap`, nom accessible `Board.call`), ou « Pas de numéro » (`text-muted-foreground`, 13 px).
  - Le prénom est dans un `<span>` en ligne : c'est lui qui reçoit le focus (`tabIndex={-1}`) quand la liste se déplie, et l'anneau de focus suit le texte, pas la ligne.
- **« Voitures sans numéro »** : `Board.car.title` (`font-medium`, en ligne, cible du focus de la même façon), puis « {heure} · {lieu} » (`text-muted-foreground`, 13 px, `wrap-anywhere`), puis `Admin.car.summary`. Aucune action.
- **Listes longues** : 5 lignes, puis un bouton `outline` pleine largeur `Admin.list.more`. Une fois la liste dépliée, il devient `Admin.list.less`.
  - L'état replié ou déplié est gardé par (leg, liste) dans l'état du composant du panneau. Il survit aux relectures, pas au rechargement, et n'est stocké nulle part.
  - Une relecture qui ramène la liste à 5 lignes ou moins retire le bouton et remet la liste à l'état replié.

### Lire et relire : une lecture de l'écran

Une **lecture de l'écran** relit le panneau (requête qui porte le jeton d'admin) et le tableau (lecture de #66 qui porte le jeton personnel). Elle n'applique rien tant que les deux n'ont pas abouti : un seul état, un seul message, jamais un panneau et un tableau qui se contredisent (décision du coordinateur sur la revue v2).

**Exigence pour l'architecte** : le mécanisme doit signaler l'échec de **chacune** des deux lectures. `router.refresh()` seul ne suffit pas, puisqu'il ne dit pas s'il a échoué. Le mécanisme lui-même (deux server actions lues en parallèle, une action qui renvoie les deux, ou autre) est laissé à l'architecte.

- **« Actualiser »** lance une lecture de l'écran.
  - Pendant la lecture, le libellé ne change pas, l'icône tourne (`animate-spin`), et le bouton est `aria-disabled="true"` : il n'est **pas** `disabled`, il garde donc le focus, et un nouveau toucher est ignoré. La région `status` masquée dit `Admin.refreshing`. Rien ne bouge : la ligne du titre mesure 32 px dans tous les états à 360 px.
  - Réussite : panneau et tableau remplacés ensemble, et la région `status` dit `Admin.refreshed`.
  - Échec (l'une ou l'autre lecture) : rien n'est appliqué. L'alerte `Admin.refreshFailed.*` apparaît sous la ligne du titre, **sans bouton** : « Actualiser », juste au-dessus, est la seule façon de réessayer.
- **Relecture après une action du tableau** : l'action renvoie déjà l'état du tableau (#66), puis le panneau est relu.
  - Si la relecture échoue, le panneau retire ses vignettes et ses sections et affiche `Admin.stale`, dans un cadre pointillé de toute la largeur du panneau, sans région vivante. Les liens restent.
  - Si « Actualiser » échoue ensuite, rien n'est appliqué. L'alerte d'actualisation **remplace** la phrase de retrait, avec `Admin.refreshFailed.bodyWithdrawn` : le panneau n'affiche plus rien de lu, et « date du dernier chargement » ne tiendrait plus. Le focus reste sur « Actualiser ».
  - Le seul message annoncé est celui de l'action, dans la barre de #66, en bas de l'écran, là où est l'organisateur.
  - « Actualiser » relit ensuite tout.
- **Régions vivantes** : une région `status` masquée (`sr-only`) dans la ligne du titre, et une région `alert` sous la ligne du titre. Toutes les deux sont toujours montées, et ne contiennent que du texte. L'`alert` est **vidée au début de chaque lecture** et remplie en cas d'échec, pour que deux échecs de suite soient annoncés deux fois.
- **Première lecture** (« Chargement », puis l'alerte d'échec d'`AdminLinkProblem` avec « Réessayer ») :
  - « Réessayer » suit les mêmes règles qu'« Actualiser » : libellé gardé, icône qui tourne, `aria-disabled`, et la région `status` dit `Admin.loading`.
  - Réussite : le panneau remplace l'alerte, et le focus va sur son titre.
  - Échec : l'alerte est vidée puis remplie, et le focus reste sur « Réessayer ».

### Le tableau ne bouge pas (exigence pour l'architecte)

Quand le panneau change de hauteur au-dessus de ce que l'organisateur regarde, **le tableau ne doit pas bouger à l'écran** (O1.11). C'est le cas quand des sections sont retirées (O1.10) ou rendues, et quand une lecture fait grandir ou rétrécir une liste. Chrome et Firefox ont l'ancrage de défilement (`overflow-anchor`), mais **Safari iOS ne l'a pas**. Deux réponses possibles, au choix de l'architecte :

- compenser le défilement de la différence de hauteur, mesurée avant et après le rendu ;
- ou ne pas retirer de hauteur : garder la place des sections (vide) jusqu'au prochain geste de l'organisateur.

Preuve : Playwright avec `overflow-anchor: none` injecté. La position à l'écran du titre de la voiture que l'organisateur regarde varie de 1 px au plus.

### Le focus

| action | focus après | annonce |
|---|---|---|
| une vignette | le titre de la section du leg | — |
| « Actualiser », réussite | reste sur « Actualiser » | `status` : `Admin.refreshed` |
| « Actualiser », échec | reste sur « Actualiser » | `alert` : `Admin.refreshFailed.*` |
| « Réessayer » (première lecture), réussite | le titre du panneau | — |
| « Réessayer », échec | reste sur « Réessayer » | l'alerte, vidée puis remplie |
| « Afficher les {n} autres » | la 6ᵉ ligne (prénom, ou « Voiture de … ») | — |
| « Réduire la liste » | reste sur le bouton | — |
| une relecture retire le bouton ou la ligne qui a le focus | le titre de la liste (`tabIndex={-1}`) ; si la liste a disparu, le titre de la section | — |
| une action du tableau dont la relecture du panneau échoue | les règles de #66, inchangées | le message de l'action, dans la barre de #66 |
| panneau retiré, puis « Actualiser » échoue | reste sur « Actualiser » | `alert` : `Admin.refreshFailed.title` et `bodyWithdrawn` |

### Les alertes

`AdminLinkProblem` (`admin-panel.tsx`) porte les deux alertes, lien invalide et échec de la vérification : **cet epic les redessine toutes les deux** sans fond teinté, comme les alertes de #66. Elles ont une bordure `destructive`, un fond `background`, l'icône et le titre en `text-destructive` (4,77:1), et le corps en `text-muted-foreground` (4,74:1). L'échec gagne « Réessayer » (`outline`, sous le texte). L'alerte d'actualisation a le même dessin, sans bouton.

### La réponse du panneau

C'est un amendement de #3 C4.9 (chemin sensible, mergé par l'humain). Le serveur répond « invalide » sans aucune donnée, ou le panneau, et rien d'autre. Forme proposée, à confirmer par l'architecte :

```ts
type OrganiserPanelAnswer =
  | { state: "invalid" }
  | { state: "panel"; legs: OrganiserLeg[] }; // dans l'ordre de eventLegs

interface OrganiserLeg {
  leg: Leg;
  coverage: Coverage;          // N et M, comme coverage() de src/domain/coverage.ts
  carCount: number;            // leg vide = carCount 0 et withoutCar vide
  withoutCar: { id: string; firstName: string; phone: string | null }[]; // ordre du tableau ; phone selon DO1
  carsWithoutPhone: {          // seulement les voitures dont le conducteur n'a pas de numéro
    id: string; driverFirstName: string; departureTime: WallTime; location: string;
    taken: number; free: number;
  }[];
}
```

Aucun numéro de conducteur, de passager placé ni de personne pas concernée n'y figure. Une voiture dont le conducteur a un numéro n'y apparaît pas du tout (O3.4). La fonction de DO1 dans `phone-visibility.ts` est la seule à poser `phone`.

### Le jeton

Le jeton voyage comme pour `checkAdminLink` : `admin-link.ts` le lit dans `location.hash` et l'envoie en argument d'une server action (corps d'un `POST`). Le serveur vérifie le jeton à temps constant, puis répond, dans la même réponse, soit le panneau, soit « invalide » sans aucune donnée. Le HTML de `/admin` ne contient rien du panneau. Ni le jeton ni la réponse ne sont stockés dans le navigateur, ni journalisés.

## États couverts

| état | section de la page | critères |
|---|---|---|
| arrivée sur un événement vide, 360 × 780, pli mesuré | Sur un téléphone | O1.3, O1.5, O4.2 |
| événement rempli, bandeau ambre au retour, même personne sur les deux legs, personnes sans numéro, 360 × 780 | Sur un téléphone | O1.1, O1.3, O2.2, O2.3, O3.1, O4.2 |
| ordinateur 1280 × 800, legs côte à côte, tableau v4.1 dessous | Sur un ordinateur | O1.2, O4.1, O7.5 |
| les quatre formes d'une vignette | Les vignettes | O1.3, O1.5 |
| un leg vide à côté d'un leg rempli | Les vignettes | O1.5 |
| après un tap sur une vignette (focus, URL inchangée) | Les vignettes | O1.4, O6.3 |
| tout le monde a une place, toutes les voitures ont un numéro | Les listes | O2.4, O3.2 |
| des personnes sans voiture, aucune voiture | Les listes | O1.6 |
| prénom de 40 et lieu de 120 caractères sans espace | Les listes | O7.3 |
| sans retour, 360 px | Les listes | O1.7 |
| chargement | Lire et relire | O5.1 |
| échec du chargement, « Réessayer » | Lire et relire | O5.3 |
| « Réessayer » en cours | Lire et relire | O5.3, O5.8 |
| lien invalide | Lire et relire | O5.2, O2.6, O7.7 |
| JavaScript désactivé | Lire et relire | O5.5 |
| actualisation en cours | Lire et relire | O1.8 |
| actualisation impossible | Lire et relire | O1.9, O5.4 |
| après une action, relecture du panneau impossible | Lire et relire | O1.10, O1.11 |
| panneau retiré, puis actualisation impossible | Lire et relire, et à 1280 px | O5.4, O7.5 |
| à 1280 px : événement vide, chargement, échec, sans retour, listes repliées, actualisation impossible, panneau retiré | Les états sur ordinateur | O7.2, O7.5, O1.7 |
| 15 voitures, 60 personnes : listes repliées, liste dépliée et focus | Trop de monde | O5.6, O5.7, O5.9 |
| en anglais, dont les deux messages d'actualisation | En anglais | O7.1 |

Non dessinés, faute d'UI propre :

- copie impossible et partage natif absent : inchangés, #3 C4.4 et C4.5 (O4.3) ;
- relecture réussie après une action : le panneau suit, sans message de plus.

## Les mots

| clé | fr | en | critère |
|---|---|---|---|
| `Admin.title` | Espace organisateur | Organiser area | inchangé ; reçoit le focus après « Réessayer » |
| `Admin.refresh` | Actualiser | Refresh | O1.8 |
| `Admin.refreshing` | Actualisation… | Refreshing… | O1.8 (`status` masquée) |
| `Admin.refreshed` | Espace organisateur actualisé. | Organiser area refreshed. | O1.9 (`status` masquée) |
| `Admin.loading` | Chargement de l’espace organisateur… | Loading the organiser area… | O5.1, O5.3 |
| `Admin.needsJavaScript` | L’espace organisateur nécessite JavaScript : activez-le, puis rechargez la page. | The organiser area needs JavaScript: turn it on, then reload the page. | O5.5 |
| `Admin.retry` | Réessayer | Try again | O5.3 |
| `Admin.failed.title` | Le lien d’organisateur n’a pas pu être vérifié. | The organiser link could not be checked. | inchangé |
| `Admin.failed.body` | Vérifiez la connexion, puis réessayez. | Check your connection, then try again. | **modifiée**, O5.3 |
| `Admin.refreshFailed.title` | L’espace organisateur n’a pas pu être actualisé. | The organiser area could not be refreshed. | O5.4 |
| `Admin.refreshFailed.body` | Ce qui est affiché date du dernier chargement. Vérifiez la connexion, puis utilisez de nouveau « Actualiser ». | What you see dates from the last load. Check your connection, then use “Refresh” again. | O5.4 (v3.1 : verbe neutre) |
| `Admin.refreshFailed.bodyWithdrawn` | Vérifiez la connexion, puis utilisez de nouveau « Actualiser ». | Check your connection, then use “Refresh” again. | O5.4, panneau retiré (v3.1) |
| `Admin.stale` | L’espace organisateur n’est plus à jour. Utilisez « Actualiser » pour le relire. | The organiser area is out of date. Use “Refresh” to load it again. | O1.10 (v3.1 : verbe neutre) |
| `Admin.tile.free` | {free, plural, one {# place libre} other {# places libres}} | {free, plural, one {# free seat} other {# free seats}} | O1.3 (v3) |
| `Admin.tile.missing` | Il manque {missing, plural, one {# place} other {# places}} | {missing, plural, one {# seat missing} other {# seats missing}} | O1.3 (v3) |
| `Admin.withoutCar.title` | Sans voiture ({count}) | Without a car ({count}) | O2.2 |
| `Admin.withoutCar.hint` | Ces numéros vous sont montrés pour organiser les voitures : ne les diffusez pas. | These numbers are shown to you to arrange the cars: do not pass them on. | O2.2 |
| `Admin.withoutCar.empty` | Personne n’est sans voiture. | Nobody is without a car. | O2.4 |
| `Admin.noPhone` | Pas de numéro | No number | O2.2 |
| `Admin.carsWithoutPhone.title` | Voitures sans numéro ({count}) | Cars without a number ({count}) | O3.1 |
| `Admin.carsWithoutPhone.hint` | Les personnes à bord ne peuvent pas appeler la personne qui conduit. Demandez-lui d’ajouter son numéro. | The people on board cannot call the driver. Ask the driver to add a number. | O3.1 (v3 : épicène) |
| `Admin.carsWithoutPhone.empty` | Toutes les voitures ont un numéro. | Every car has a number. | O3.2 |
| `Admin.car.summary` | {taken, plural, =0 {Aucune place prise} one {# place prise} other {# places prises}} · {free, plural, =0 {Complet} one {# place libre} other {# places libres}} | {taken, plural, =0 {No seat taken} one {# seat taken} other {# seats taken}} · {free, plural, =0 {Full} one {# free seat} other {# free seats}} | O3.1 (v3 : épicène) |
| `Admin.list.more` | {count, plural, one {Afficher l’autre} other {Afficher les # autres}} | {count, plural, one {Show the other one} other {Show the # others}} | O5.6 |
| `Admin.list.less` | Réduire la liste | Show fewer | O5.6 |
| `Admin.adminLink.hint` | Ne le partagez pas : il montre des numéros de téléphone et permet de tout modifier. | Do not share it: it shows phone numbers and lets anyone change everything. | **modifiée** (DO1) |

Clés réutilisées, sans changement :

- `Admin.shareLink.label` ;
- `Event.legs.*`, `Event.noCar.*`, `Event.nobody` ;
- `Board.banner.*`, dont `everyoneSeated`, aussi dans la vignette ;
- `Board.tabCount`, pastille de la vignette ;
- `Board.car.title`, `Board.call`.

`PersonForm.phoneHint` ne change pas.

## Décisions

1. La vue d'ensemble est dans l'espace organisateur existant, au-dessus de l'événement et du tableau. — Un seul écran ; c'est la place que #3 donne au panneau.
2. Une liste « Sans voiture » par leg, dans l'ordre du tableau. — La couverture se lit par leg.
3. Une voiture sans numéro est un Ride dont le conducteur n'a pas de numéro. — C'est le numéro que les personnes à bord appellent.
4. Sous 1024 px, des vignettes, et les sections l'une sous l'autre ; à partir de 1024 px, les sections côte à côte. — Deux colonnes de numéros ne tiennent pas à 360 px.
5. La vignette est blanche, porte la pastille ambre de la v4.1 et le nombre de places, et n'a pas d'icône. — Elle reprend les deux ambres du tableau avec leur sens, sans en créer un troisième. Le blanc donne 4,74:1 au texte gris de la vignette vide, au lieu de 4,35:1 sur gris. Un chevron se lisait « déplier ».
6. Les vignettes sont des boutons qui font défiler la page, pas des ancres. — Le jeton est dans le fragment.
7. 5 lignes par liste avant « Afficher les {n} autres » ; une liste dépliée le reste jusqu'au rechargement. — À 60 personnes, le tableau serait repoussé de plusieurs écrans.
8. Sans QR code (DO2), le lien à partager garde la disposition d'aujourd'hui. — L'avertissement finit sous le pli (voir Révisions).
9. Pas de vignettes tant qu'aucun leg n'a ni voiture ni personne. — Il n'y a rien à comparer.
10. Une lecture de l'écran relit le panneau et le tableau, et n'applique rien si l'une des deux échoue. — Décision du coordinateur sur la revue v2.
11. Après une action du tableau, si la relecture du panneau échoue, le panneau retire ses vignettes et ses sections, sans alerte. — Il ne contredit pas le tableau ; une alerte en haut serait plusieurs écrans au-dessus de l'organisateur, qui lit déjà le message de l'action dans la barre.
12. « Actualiser » et « Réessayer » gardent leur libellé et sont `aria-disabled` pendant la lecture ; l'alerte d'actualisation n'a pas de bouton. — « Actualisation… » faisait passer le titre sur deux lignes à 360 px (31 px de saut). `disabled` ferait perdre le focus. Deux boutons qui font la même chose à quelques pixels l'un de l'autre se doublonnaient.
13. Les bandeaux et les vignettes du panneau ne sont pas des régions vivantes. — Le tableau annonce déjà son bandeau.
14. Cet epic redessine les deux alertes d'`AdminLinkProblem` sans fond teinté. — Un seul composant ; règle de contraste de #66.
15. Décidé par l'humain le 2026-10-18 : DO1 = (a), DO2 = (c).
16. Les textes qui renvoient à « Actualiser » disent « utilisez », pas « touchez ». — Ils s'affichent aussi à la souris, à 1280 px.
17. Panneau retiré puis actualisation impossible : l'alerte remplace la phrase de retrait, sans « dernier chargement ». — Un seul message ; le panneau n'affiche plus rien de lu.
18. Le défilement stable est une exigence, pas un mécanisme. — Safari iOS n'a pas d'ancrage de défilement ; l'architecte choisit entre compenser et garder la hauteur.

## Documentation à mettre à jour pour DO1 (chemins sensibles, PR mergée par l'humain)

- `docs/agents/architecture.md`, section « Visibilité du téléphone : une règle, un seul endroit » :
  - dans le paragraphe « Le numéro est posé voiture par voiture… », remplacer les deux dernières phrases, « La visibilité par l'admin arrive avec l'épic « Administrer l'événement » ; d'ici là, `/e/{id}/admin` ne montre aucun numéro de plus que `/e/{id}`. », par la règle DO1 ;
  - la liste « …n'est envoyé à un appareil que dans deux cas » : ajouter la requête du panneau qui porte un jeton d'admin vérifié ;
  - « seul `withVisiblePhones` (`phone-visibility.ts`) les reçoit et les pose », et la ligne « téléphone » du tableau « Emplacement du code » : nommer aussi la fonction de DO1.
- `docs/agents/review-checklist.md`, section « Visibilité du téléphone » :
  - 1ʳᵉ puce, la parenthèse « l'admin arrive avec « Administrer l'événement » » : remplacer par la règle DO1 ;
  - 3ᵉ puce, « Le numéro est posé voiture par voiture, et dans la section des personnes de l'appareil » : ajouter la liste « Sans voiture » du leg, pour l'organisateur ;
  - 5ᵉ puce, « seul `withVisiblePhones` (`phone-visibility.ts`) les reçoit » : nommer aussi la fonction de DO1 ;
  - ajouter une puce : la réponse du panneau ne porte aucun numéro de conducteur ni de passager placé, seulement un booléen par voiture, et rien pour un jeton faux.
- `docs/agents/glossary.md`, ligne « Jeton d'admin » (« permet de tout modifier ») : facultatif. On peut ajouter qu'il donne les numéros des personnes sans voiture.

## Hors périmètre

- Agir sur une personne ou une voiture d'un autre (epic « Administrer l'événement »).
- Les numéros des conducteurs et des passagers (DO1 : options b et c écartées).
- Exporter, copier tous les numéros, envoyer un SMS groupé, les notifications.
- Modifier l'événement.
- Garder le jeton d'admin sur l'appareil.
- **Le QR code du lien à partager** (DO2). L'epic #67 (lien perso) aura besoin d'un QR code et décidera comment le produire ; celui du lien à partager pourra suivre avec le même composant.
- La fraîcheur automatique (#67), qui suivra la règle d'un seul bloc.
- Imprimer.
- Les options à l'écran (#68).
- Le tableau des participants (#66 v4.1).
- Le mode sombre.

## Révisions

- v1 (2026-10-18) : première version. Rendu vérifié avec Chrome headless (`chrome`) : 17 maquettes à 360 px et un navigateur de 1280 px, sans débordement horizontal ; aucune cible sous 44 px ; aucun libellé de bouton coupé ; la page elle-même tient à 360 px (mesurée dans un cadre de 360 px). Sur l'ordinateur, les sections Aller et Retour ont leurs bords supérieurs à la même hauteur. Le pli de 780 px est tenu : l'avertissement finit à 602 px (événement vide) et à 699 px (rempli). Une première mise en page, avec le QR code de 112 px sous les boutons, le mettait à 801 px : le QR code est passé à droite du lien.
- v2 (2026-10-18) : décisions de l'humain appliquées. DO1 = (a) : la règle est écrite comme décidée, et `Admin.adminLink.hint` est modifiée. DO2 = (c) : le QR code, sa fenêtre « Agrandir » et les clés `Admin.qr.*` sont retirés, et le lien à partager reprend la disposition d'aujourd'hui. Les critères O4 sont renumérotés (O4.1 ordre, O4.2 pli, O4.3 Copier et Partager). Ajout de « Documentation à mettre à jour pour DO1 ». Rendu revérifié avec Chrome headless (`chrome`) : 16 maquettes à 360 px et le navigateur de 1280 px sans débordement horizontal, aucune cible sous 44 px, aucun libellé coupé ; la page tient à 360 px (cadre de 360 px) ; sections Aller et Retour alignées à 1280 px. Pli de 780 px tenu : avertissement à 582 px (événement vide) et à 679 px (rempli). Republiée à la même URL. Revue de design : changements demandés (six bloquants, onze suggestions).
- v3 (2026-10-18) : revue de design appliquée.
  - **Bloquants.**
    - Vignette d'un leg vide dessinée, en gris sur blanc (4,74:1).
    - « Actualiser » garde son libellé : la ligne du titre mesure 32 px dans tous les états.
    - Règles de focus et annonces pour « Actualiser », « Réessayer » et les listes, et l'état « Réessayer » en cours dessiné.
    - Lecture de l'écran d'un seul bloc, avec l'exigence d'un mécanisme qui signale l'échec.
    - Sept états dessinés à 1280 px, et les largeurs des alertes et du chargement fixées.
    - `Admin.carsWithoutPhone.hint` et `Admin.car.summary` épicènes.
  - **Suggestions.**
    - Numéro toujours à droite (grille), et le README l'écrit ainsi.
    - Anneau de focus ajusté au texte : 42 px pour « Arthur ».
    - Vignettes sans icône.
    - Alerte d'actualisation sans « Réessayer », et région vidée à chaque lecture.
    - Panneau retiré sans alerte quand sa relecture échoue après une action.
    - README : forme de la réponse, `CoverageBanner` `live={false}`, `phone-link.tsx`, `EmptyLeg`, état déplié et focus à travers les relectures, niveaux de titre.
    - `AdminLinkProblem` : les deux alertes redessinées.
    - Leg avec des personnes sans voiture et aucune voiture décrit.
    - Tableau dessiné en v4.1 ; les deux ambres résolus : la vignette prend la pastille et non le fond.
    - Amendement de #3 C4.9 écrit dans la spec.

    La suggestion sur l'élision est portée par le coordinateur sur #66. Aucune remarque contestée.
  - **Rendu revérifié** avec Chrome headless (`chrome`) :
    - 21 maquettes à 360 px et 8 navigateurs à 1280 px, sans débordement horizontal ; chaque navigateur tient dans son cadre ;
    - aucune cible sous 44 px (mesurée à l'échelle 1), aucun libellé coupé ;
    - la page tient à 360 px (cadre de 360 px) ;
    - sections Aller et Retour alignées à 1280 px ;
    - pli de 780 px tenu : avertissement à 582 px (événement vide) et à 698 px (rempli, vignettes à pastille comprises).

    Republiée à la même URL.
- v3.1 (2026-10-18) : revue de design v3 approuvée, sans bloquant. Ses trois suggestions sont appliquées, aucune contestée :
  - verbe neutre : « utilisez » au lieu de « Touchez », « use » au lieu de « tap », dans `Admin.refreshFailed.body` et `Admin.stale` ;
  - le cas « panneau retiré, puis actualisation impossible » est dessiné, à 360 et à 1280 px, avec `Admin.refreshFailed.bodyWithdrawn`, et l'exigence de défilement stable est écrite (O1.11, Safari iOS) ;
  - à 1280 px, le cadre de la phrase de retrait prend toute la largeur du panneau, texte limité à `max-w-prose`, comme le dit O7.5.

  Rendu revérifié avec Chrome headless (`chrome`) :
  - 22 maquettes à 360 px et 9 navigateurs à 1280 px, sans débordement horizontal ;
  - aucune cible sous 44 px, aucun libellé coupé ;
  - la page tient à 360 px (cadre de 360 px) ;
  - le pli de 780 px est tenu : l'avertissement finit à 582 px (événement vide) et à 698 px (rempli) ;
  - aucun « Touchez » ni « tap » dans les textes de l'interface.

  Republiée à la même URL.
