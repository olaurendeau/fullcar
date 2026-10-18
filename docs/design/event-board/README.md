# Écran d’un événement : s’inscrire, proposer une voiture, prendre une place

- Artifact : https://claude.ai/artifact/RV9ktAqKxrgzmumgn22AEj
- Epic : https://github.com/olaurendeau/fullcar/issues/66
- Décision de l’humain pour la v4 : https://github.com/olaurendeau/fullcar/issues/66#issuecomment-6250124984
- Tâches : #86 (PR #141), #87 (PR #152, adaptée ensuite), #88 à #93, #95
- Hors de cette maquette : la vue organisateur, epic #154
- Page : `index.html` (autonome, maquettes à 360 px de large)

## Ce qui change en v4

L’humain a relu la v2 et décidé quatre groupes de changements, tous dans cette version :

1. **« Vos inscriptions »** : les personnes de l’appareil montent au-dessus des onglets, en
   une matrice Prénom | Aller | Retour dont chaque cellule est un état sur lequel on peut
   agir. Les onglets ne servent plus qu’à parcourir les voitures.
2. **« Proposer une voiture »** règle aussi l’autre leg (« Au retour » : Je ramène aussi /
   Je cherche une place / Je ne fais pas le retour) et fait monter ses passagers (« Qui
   monte avec vous ? »).
3. **Textes épicènes** (« Ne fait pas l’aller », « Cette personne prendra… »), « Vos
   inscriptions », et l’action **« Trouver une place »**.
4. **« Annuler »** dans la barre de réussite, qui reste jusqu’à l’action suivante ; plus de
   ligne de date sous les onglets ; **pastille ambre** sur les onglets, seulement au-dessus
   de 0 ; « Proposer une voiture » **plein** quand il manque des places.

Tout ce que v3.2 avait fait approuver tient, sauf ce que ces décisions remplacent : états,
contrastes, cibles de 44 px, règles de focus, la barre (une seule, « Fermer », Échap), la
feuille unique, la règle du téléphone (C10.x).

## L’ordre de l’écran

1. En-tête de l’événement : titre, lieu, date et heure de chaque leg.
2. La **barre de messages**, placée ici dans le DOM (après l’en-tête, donc avant « Vos
   inscriptions » et les onglets), affichée en bas de l’écran.
3. **« Vos inscriptions »**, absente sans personne sur l’appareil, et sans JavaScript.
4. Les **onglets** Aller et Retour (absents sans retour).
5. Dans chaque onglet : le bandeau de couverture ; « Ajouter une personne » et « Proposer
   une voiture » **côte à côte** ; sans JavaScript, la phrase `Board.needsJavaScript` ; les
   voitures ; « Sans voiture ». **Plus de ligne de date** sous les onglets, ni sur un
   événement sans retour.

À 360 × 780, avec trois personnes sur l’appareil et la matrice dépliée (mesuré au rendu) :

| titre et lieu | bandeau | première voiture | sa première place libre |
|---|---|---|---|
| titre de 17 caractères (la maquette), lieu de 30 | 464–504 px | 582 px | 715–759 px, 21 px au-dessus du pli |
| titre et lieu de 30 caractères (le cas de C9.2) | 494–534 px | 612 px | 745–789 px, **9 px sous le pli** |

Le bandeau (seule exigence de C9.2) et le haut de la première voiture restent au-dessus du
pli dans les deux cas. La première place libre, elle, dépend du titre (une ligne de plus :
30 px) et de la voiture (un passager de plus : 52 px) : elle n’est pas garantie au-dessus du
pli.

## « Vos inscriptions »

### La section

- Un `<section>` dont le titre est un **bouton de 44 px** (`aria-expanded`,
  `aria-controls`) sur deux lignes : « Vos inscriptions » en gras, puis le résumé
  `DevicePersons.summary` (« 3 personnes · 1 sans voiture »), et un chevron à droite.
- **Dépliée** à l’ouverture de la page s’il y a au moins une cellule « Sans voiture »,
  **repliée** sinon. Ensuite elle reste comme la personne la met, jusqu’au rechargement :
  une action qui vide la dernière cellule « Sans voiture » ne la replie pas sous le focus.
  Le résumé compte les personnes, puis celles qui sont sans voiture sur au moins un leg ; à
  0 : « tout le monde a une place ».
- Le choix replié / déplié n’est pas gardé (ni cookie ni `localStorage`).

### La matrice

- Un vrai `<table>` : `<thead>` avec « Prénom » (`DevicePersons.colName`), « Aller »,
  « Retour » (`Event.legs.*`) en `<th scope="col">` ; une ligne par personne, son prénom en
  `<th scope="row">`. Un lecteur d’écran annonce « Retour, Léa, Sans voiture ».
- Le tableau fixe sa couleur et sa police (`text-foreground text-sm`) au lieu de compter
  sur l’héritage. Colonne des prénoms : 26 % ; les deux colonnes de leg se partagent le reste
  (`table-layout: fixed`).
- Sans retour : une seule colonne de leg.
- Ordre des lignes : celui de l’événement (`LegBoard.device`).

### Le prénom

Un bouton (44 px, `aria-haspopup="dialog"`, nom accessible = le prénom, chevron
décoratif) qui ouvre la feuille de la personne : son numéro en lien `tel:` de 44 px s’il
existe (C10.1), puis « Modifier » (`DevicePersons.edit`), qui remplace le contenu de la
feuille par le formulaire « Modifier {prénom} » (C2.3).

### Les cellules

Une cellule est un bouton de 44 px de haut au moins, texte de 13 px sans icône, coupé entre
les mots (`wrap-break-word` : un mot n’est coupé que s’il ne tient pas seul, comme un prénom
de 40 caractères sans espace, C11.3). À 360 px, « Sans voiture » et « Avec Claire » tiennent
sur une ligne, « Ne fait pas le retour » sur deux. Le texte suffit sans la couleur.

| état sur ce leg | texte de la cellule | style | feuille : état | feuille : actions, dans cet ordre |
|---|---|---|---|---|
| sans voiture | Sans voiture | fond `amber-100`, texte `amber-950` | Sans voiture | **Trouver une place** (`default`), Ne fait pas l’aller / le retour |
| passagère | Avec {conducteur} | fond `muted` | Dans la voiture de {conducteur} | Voir la voiture, Sortir de la voiture, Ne fait pas l’aller / le retour |
| conductrice | Conduit | fond `muted` | Conduit | Voir la voiture |
| ne fait pas ce leg | Ne fait pas l’aller / Ne fait pas le retour | contour, `text-muted-foreground` | Ne fait pas l’aller / le retour | Je cherche une place |

- Nom accessible d’une cellule : `DevicePersons.cellLabel`, « {prénom}, {leg} : {texte de
  la cellule} », où `{cell}` est **exactement le texte visible** : « Léa, Aller : Avec Claire »,
  « Tom, Retour : Ne fait pas le retour ». Il contient donc toujours le texte visible (WCAG
  2.5.3) ; la phrase complète « Dans la voiture de Claire » est dans la feuille de la cellule.
- La cellule ouvre la feuille de la personne pour ce leg : titre `DevicePersons.sheetTitle`
  (« Tom · Aller »), l’état dans un encadré (ambre pour « Sans voiture », gris sinon), puis
  les actions, pleine largeur, 44 px, et « Fermer ».
- Une action réussie ferme la feuille ; le tableau, le résumé, les pastilles et le bandeau
  suivent (C9.4). Une action refusée laisse la feuille ouverte avec son message.
- La voiture d’une conductrice se gère sur sa carte (« Modifier », « Retirer la voiture »,
  C8.1) ; la feuille de la cellule y mène par « Voir la voiture ».
- Deux personnes de même prénom : leurs lignes se distinguent par leurs cellules et leur
  ordre ; aller plus loin est hors périmètre.

### Chargement et échec

Inchangés depuis v2, à leur place nouvelle : pendant la lecture, « Chargement de vos
inscriptions… » (`role="status"`) à la place de la section ; en échec, l’alerte
`DevicePersons.failed` / `failedBody` avec « Réessayer » (titre `text-destructive` sur
`bg-background`, 4,77:1). Dans les deux cas, « Ajouter une personne », « Proposer une
voiture » et les places libres sont **inactifs**, sur les deux onglets.

## « Trouver une place »

L’action positive d’une cellule « Sans voiture ». Elle ne place personne :

1. la feuille se ferme ;
2. l’onglet du leg s’active ;
3. la page défile jusqu’à la **première voiture qui a une place libre**, par heure de
   départ, avec une marge basse qui laisse la barre libre (`scroll-margin`) ;
4. le focus va sur **sa première place libre**. Un tap ou Entrée la prend, avec les règles
   de C5 : place directe si l’appareil n’a qu’une personne sans voiture sur ce leg, la
   feuille sinon (C5.5), avec toutes les personnes sans voiture cochées (C6.1).

Aucune place libre sur ce leg : la barre dit `DevicePersons.noFreeSeat.*` (`status`),
l’onglet s’active, et le focus va sur « Proposer une voiture » de ce leg, plein puisqu’il
manque des places.

## Le tableau d’un leg

- **Onglets** : sous le nom, une pastille ambre (`amber-100` / `amber-950`, 12 px) qui dit
  `Board.tabCount` (« 4 sans voiture ») quand N > 0, rien à 0. L’onglet passe de 44 à 48 px
  quand l’un des deux a une pastille, les deux à la même hauteur. Le nombre fait partie du
  nom accessible (« Retour 4 sans voiture »), sans texte masqué en plus. La pastille compte
  tout le monde ; la matrice dit qui, parmi ses personnes.
- **Bandeau** : inchangé (C9.1).
- **« Ajouter une personne » et « Proposer une voiture »** : côte à côte, deux colonnes
  égales, 44 px au moins. Pour ces deux boutons seulement, le libellé peut passer sur deux
  lignes : `className="h-auto min-h-11 whitespace-normal"`, que `cn` (`twMerge`) fusionne
  avec le `whitespace-nowrap` de `Button`. « Proposer une voiture » est
  `variant="default"` quand le bandeau du leg est ambre (N > M), `outline` sinon.
- **Carte d’une voiture** : l’heure passe sur la ligne du titre, à droite, avant
  « Complet » ; le lieu et la note restent dessous. Le reste est inchangé (places libres en
  boutons de 44 px, `Board.car.takeSeat`, numéros selon C10.1, « Modifier » et « Retirer
  la voiture » en `outline`, le second avec `text-destructive`).
- Leg vide, sans JavaScript, 15 voitures : inchangés, sans la ligne de date. Sans
  JavaScript, la matrice est absente (le serveur ne connaît pas l’appareil).

## « Proposer une voiture »

Ordre : qui conduit, lieu, heure, places, note, l’autre leg, qui monte. Le stockage
indisponible garde son avertissement en tête (C1.14, D5).

- **« Qui conduit ? »** (`RideForm.driver`, épicène) : inchangé sinon (personnes de
  l’appareil qui ne conduisent pas sur ce leg, puis « Une nouvelle personne » ; sans
  personne, les champs Prénom et Téléphone directement). Erreur :
  `FormErrors.chooseDriver`.
- **L’autre leg**, seulement si l’événement a un retour et si la personne qui conduit ne
  conduit pas déjà sur l’autre leg. Titre « Au retour » sur l’onglet Aller, « À l’aller »
  sur l’onglet Retour. Boutons radio :
  - « Je ramène aussi » / « J’emmène aussi » : déplie le **lieu** de l’autre leg (« Lieu de
    dépose » au retour, « Lieu de départ » à l’aller, prérempli avec le lieu saisi et qui le
    suit tant qu’on ne le change pas, comme la date de retour de la création d’événement)
    et son **heure** (préremplie avec l’heure de l’autre leg dans l’événement : 18:00 pour
    « Je ramène aussi » depuis l’Aller du Tournoi de Rennes, 08:00 pour « J’emmène aussi »
    depuis le Retour), puis la phrase
    `RideForm.otherLeg.same`. Places et note valent pour les deux voitures. Mêmes règles
    de champ (R4).
  - « Je reste dans la voiture de {conducteur} » : seulement si la personne est passagère
    sur l’autre leg. Les trois autres options la sortent de cette voiture, et chacune le dit
    dessous avec `RideForm.leavesCar` (« Quittera la voiture de Marc »), comme C4.5 sur ce
    leg.
  - « Je cherche une place ».
  - « Je ne fais pas le retour » / « Je ne fais pas l’aller ».
  - **Par défaut**, l’état actuel de la personne sur l’autre leg : nouvelle personne ou pas
    concernée → « Je ne fais pas… » (C4.4, et C4.1 garde ses quatre actions) ; sans voiture
    → « Je cherche une place » ; passagère → « Je reste… ».
- **« Qui monte avec vous ? »** (`RideForm.passengers`) : seulement si l’appareil a, en
  dehors de la personne qui conduit, des personnes sans voiture sur **ce** leg ; une case
  par personne (son état dessous), **décochées**. Les cochées montent dans la voiture de ce
  leg seulement. Plus de cochées que de places : `FormErrors.tooManyPassengers` sous le
  groupe, rien n’est créé.
- **Un seul « Valider »** : la voiture de ce leg, l’état ou la voiture de l’autre leg, et
  les passagers, tout ou rien. Avec des passagers, la barre dit `Sheet.placed` ou
  `Seat.placed`, avec « Annuler ».

## Un tap, et « Annuler »

- Le tap reste immédiat (C5.2). La **barre de réussite reste** jusqu’à l’action suivante,
  « Fermer » ou Échap ; elle ne s’efface plus après 6 s (WCAG 2.2.1).
- Après **tout placement réussi** (un tap, la feuille, « Qui monte avec vous ? »), la barre
  porte un bouton « Annuler » (`Seat.undo`, 44 px, contour clair sur le fond sombre), entre
  le message et la croix, **hors** de la région `status`.
- « Annuler » rend à chaque personne placée son état d’avant sur ce leg (sans voiture, ou ne
  fait pas ce leg si elle avait été cochée dans la feuille). Une personne qui n’est plus dans
  cette voiture n’est pas touchée (comme C7.4). Ensuite la barre dit `Seat.undone`, sans
  « Annuler ». « Annuler » ne défait pas la voiture proposée elle-même.
- « Annuler » disparaît à l’action suivante, avec le message qu’il accompagne.

## La barre de messages

Inchangée sinon : une seule pour la page, dans le DOM après l’en-tête ; affichée en bas,
marges de 12 px plus la zone sûre ; deux régions vivantes (`status`, `alert`) qui ne
contiennent que le texte, toujours montées, vides sans message ; icône, « Annuler » et
« Fermer » hors des régions ; Échap la ferme ; 112 px réservés en bas tant qu’elle est
affichée. Le bandeau est aussi un `status` : les tests filtrent `getByRole("status")` par
texte.

## Contraste

Inchangé depuis v2 : aucun texte rouge sur un fond teinté de rouge. Nouveau en v4 : les
pastilles et les cellules « Sans voiture » sont `amber-950` sur `amber-100` (comme le
bandeau) ; les cellules « Ne fait pas… » sont `text-muted-foreground` sur blanc (4,74:1).
Hors de cet épic : `AdminLinkProblem` (`admin-panel.tsx`) garde un fond teinté ; à corriger
à part.

## Le focus après une action

Les cellules et les prénoms de la matrice ne disparaissent jamais après une action : ils
deviennent le repère stable de la plupart des cas. Un repère qui n’est pas un bouton est
rendu focalisable par `tabIndex={-1}` ; feuille et confirmation passent par leur
`onCloseAutoFocus`.

| action réussie | focus |
|---|---|
| une action de la feuille d’une cellule (« Ne fait pas… », « Je cherche une place », « Sortir de la voiture ») | la cellule, qui lit son nouvel état |
| « Trouver une place » | la première place libre de la première voiture qui en a, sur l’onglet du leg ; sinon « Proposer une voiture » de ce leg |
| « Voir la voiture » | le titre de la carte, sur l’onglet du leg |
| « Modifier » depuis la feuille du prénom, puis « Valider » | le prénom |
| bouton de la section (déplier, replier) | ne bouge pas |
| un tap qui place, la feuille validée, « Proposer une voiture » validé avec des passagers | le titre de la carte |
| « Annuler » dans la barre | le titre de la carte d’où les personnes sont sorties |
| « Retirer la voiture » confirmé | la cellule du conducteur pour ce leg, désormais « Ne fait pas… » ; section repliée : son bouton « Vos inscriptions » |
| **toute règle qui vise une cellule ou un prénom alors que la section est repliée** | le bouton « Vos inscriptions », qui reste replié (v4-3) ; son nom accessible porte le résumé à jour |
| un refus qui supprime la cible (place prise, voiture retirée) | le titre de la carte si elle existe encore, sinon le bandeau du leg |
| croix « Fermer » de la barre, ou Échap avec le focus dans la barre | le repère de l’action qui a produit le message, s’il existe encore ; sinon l’onglet actif ; sans onglets, le titre de l’événement |
| Échap avec le focus ailleurs | ne bouge pas ; la barre se ferme |
| feuille fermée sans effet ; ajouter, proposer, modifier validés sans passager | le bouton qui l’a ouverte (défaut de Radix) |
| « Valider » dans la feuille après « Ajouter une personne » | la case de la nouvelle personne, cochée |
| refus dans une feuille | ne bouge pas ; un formulaire en erreur : premier champ en erreur |

La règle « une réussite ne s’efface pas sous le focus » de v3 tombe : la réussite ne
s’efface plus d’elle-même.

## Inchangés depuis v3.2

Formulaire « Ajouter une personne » (sauf `PersonForm.forSeat`, épicène), la feuille des
passagers (sauf les états sous les prénoms, « Ne fait pas l’aller »), modifier la voiture,
l’étape « qui sort » et son refus (sauf « personnes » au lieu de « passagers »), la
confirmation de retrait (`AlertDialogPrimitive.Action asChild` autour d’un `Button`
`bg-destructive text-white`, sauf son texte épicène), hors ligne, erreur serveur, envoi en
cours, 15 voitures. Leurs détails sont dans les sections correspondantes de la page.

## États couverts

| état | section de la page | critères |
|---|---|---|
| page complète à 360 × 780, cas mixte, matrice dépliée, pli | Vos inscriptions | C2.2 amendé, C9.2, C9.3 |
| matrice repliée : rien à faire | Vos inscriptions | revue |
| feuille d’une cellule : sans voiture, passagère, conductrice, ne fait pas le retour | Vos inscriptions | C3.1, C3.2, C7.1, C7.2 |
| feuille du prénom : téléphone, « Modifier » | Vos inscriptions | C2.3, C10.1 |
| après une action : focus sur la cellule | Vos inscriptions | C9.4 |
| chargement, échec, actions inactives | Vos inscriptions | C5.9, C1.1 |
| événement sans retour : une colonne | Vos inscriptions | C1.4 |
| « Trouver une place » : défilé, focus sur la place | Trouver une place | revue, C5.2 |
| aucune place libre sur le leg | Trouver une place | C9.1 |
| leg vide | Le tableau d’un leg | C9.6, C1.1 |
| il manque des places : « Proposer une voiture » plein | Le tableau d’un leg | C9.1 |
| pastilles des onglets (2/4, 0/1, 0/0) | Le tableau d’un leg | C9.3 |
| voiture, voiture complète, sa propre voiture | Le tableau d’un leg | C4.3, C5.1, C8.1 |
| sans JavaScript | Le tableau d’un leg | C3.4 |
| première inscription, depuis une place, erreurs et stockage | Ajouter une personne | C1.2 à C1.14, C5.4 |
| feuille des passagers | La feuille | C6.1 à C6.9 |
| proposer, appareil sans personne (4 actions) | Proposer une voiture | C4.1, C4.4 |
| proposer, « Je ramène aussi » et « Qui monte avec vous ? » | Proposer une voiture | revue, C4.5 |
| proposer, erreurs | Proposer une voiture | C4.7 |
| proposer, passagère au retour : « Je reste… », « Quittera la voiture de… » | Proposer une voiture | C3.5, C4.5 |
| proposer depuis l’onglet Retour : « À l’aller », « J’emmène aussi » | Proposer une voiture | revue, R4 |
| un tap, « Annuler », après « Annuler », place prise | Un tap et « Annuler » | C5.2, C5.7, C7.4 |
| « qui sort », confirmation de retrait, après confirmation (section repliée, section dépliée) | Modifier, retirer | C8.4, C8.6 |
| hors ligne, 15 voitures avec la barre | Erreurs et chargement | C11.4 |
| la page en anglais | En anglais | C11.1 |

## Les mots

Espaces de noms : `Board`, `DevicePersons` (gardé de #152 : ses clés sont du code, son
titre devient « Vos inscriptions »), `PersonForm`, `RideForm`, `FormErrors`, `Sheet`,
`Seat`, `RideChanges`, `Actions`. La colonne « source » marque « — v4 » ce qui est nouveau
ou changé dans cette version.

| clé | `messages/fr.json` | `messages/en.json` | source | tâche |
|---|---|---|---|---|
| `Board.banner.everyoneSeated` | Tout le monde a une place | Everyone has a seat | C9.1 (PR #141) | #86 |
| `Board.banner.everyoneSeatedFree` | Tout le monde a une place · {free, plural, one {# place libre} other {# places libres}} | Everyone has a seat · {free, plural, one {# free seat} other {# free seats}} | C9.1 (PR #141) | #86 |
| `Board.banner.enoughSeats` | {withoutCar, plural, other {# sans voiture}} · {free, plural, one {# place libre} other {# places libres}} | {withoutCar, plural, other {# without a car}} · {free, plural, one {# free seat} other {# free seats}} | C9.1 (PR #141) | #86 |
| `Board.banner.missingSeats` | {withoutCar, plural, other {# sans voiture}} · il manque {missing, plural, one {# place} other {# places}} | {withoutCar, plural, other {# without a car}} · {missing, plural, one {# seat missing} other {# seats missing}} | C9.1 (PR #141) | #86 |
| `Board.tabCount` | {count, plural, other {# sans voiture}} | {count, plural, other {# without a car}} | C9.3 (PR #141), désormais visible en pastille — v4 | #86 |
| `Board.car.title` | Voiture de {driver} | {driver}’s car | C5.1, C2.2 (PR #141) | #86 |
| `Board.car.full` | Complet | Full | C4.3 (PR #141) | #86 |
| `Board.car.seats` | Places | Seats | glossaire (PR #141) | #86 |
| `Board.car.freeSeat` | Place libre | Free seat | C4.3 (PR #141) | #86 |
| `Board.withoutCar` | Sans voiture | Without a car | glossaire (PR #141) | #86 |
| `Board.car.takeSeat` | Place libre : prendre une place dans la voiture de {driver} | Free seat: take a seat in {driver}’s car | C5.1 | #91 |
| `Board.call` | Appeler {firstName} au {phone} | Call {firstName} on {phone} | C10.1 | #87 |
| `Board.addPerson` | Ajouter une personne | Add a person | C1.1 | #88 |
| `Board.offerRide` | Proposer une voiture | Offer a car | C1.1 | #90 |
| `Board.needsJavaScript` | S’inscrire, proposer une voiture ou prendre une place nécessite JavaScript : activez-le, puis rechargez la page. | Signing up, offering a car or taking a seat needs JavaScript: turn it on, then reload the page. | état « JavaScript désactivé » | #87 |
| `Board.car.edit` | Modifier | Edit | C8.1 | #93 |
| `Board.car.remove` | Retirer la voiture | Remove the car | C8.1 | #93 |
| `Event.noCar.aller` | Aucune voiture proposée pour l’aller | No car offered for the outbound trip | #3 (inchangé) | — |
| `Event.noCar.retour` | Aucune voiture proposée pour le retour | No car offered for the return trip | #3 (inchangé) | — |
| `Event.nobody` | Personne ne s’est encore inscrit. | Nobody has signed up yet. | #3 (inchangé) | — |
| `DevicePersons.title` | Vos inscriptions | Your sign-ups | revue de l’humain — v4 | #87 |
| `DevicePersons.state.passenger` | Dans la voiture de {driver} | In {driver}’s car | C2.2 | #87 |
| `DevicePersons.state.driver` | Conduit | Driving | C2.2 | #87 |
| `DevicePersons.state.withoutCar` | Sans voiture | Without a car | C2.2, glossaire | #87 |
| `DevicePersons.state.notConcerned.aller` | Ne fait pas l’aller | Not on the outbound trip | revue (épicène) — v4 | #87 |
| `DevicePersons.state.notConcerned.retour` | Ne fait pas le retour | Not on the return trip | revue (épicène) — v4 | #87 |
| `DevicePersons.notConcerned.aller` | Ne fait pas l’aller | Not on the outbound trip | C3.1, C7.2, revue — v4 | #89 |
| `DevicePersons.notConcerned.retour` | Ne fait pas le retour | Not on the return trip | C3.1, C7.2, revue — v4 | #89 |
| `DevicePersons.lookingForSeat` | Je cherche une place | I need a seat | C3.2 | #89 |
| `DevicePersons.leaveCar` | Sortir de la voiture | Leave the car | C7.1 | #89 |
| `DevicePersons.edit` | Modifier | Edit | C2.3 | #89 |
| `DevicePersons.summary` | {persons, plural, one {# personne} other {# personnes}} · {withoutCar, plural, =0 {tout le monde a une place} other {# sans voiture}} | {persons, plural, one {# person} other {# people}} · {withoutCar, plural, =0 {everyone has a seat} other {# without a car}} | revue (« 3 personnes · 1 sans voiture ») — v4 | #87 |
| `DevicePersons.colName` | Prénom | First name | revue (Prénom \| Aller \| Retour) — v4 | #87 |
| `DevicePersons.cell.passenger` | Avec {driver} | With {driver} | nouveau — v4 | #87 |
| `DevicePersons.cellLabel` | {firstName}, {leg} : {cell} | {firstName}, {leg}: {cell} | nom accessible ; {cell} = le texte visible de la cellule (WCAG 2.5.3) — v4.1 | #87 |
| `DevicePersons.sheetTitle` | {firstName} · {leg} | {firstName} · {leg} | nouveau — v4 | #89 |
| `DevicePersons.findSeat` | Trouver une place | Find a seat | revue — v4 | #89 |
| `DevicePersons.seeCar` | Voir la voiture | See the car | nouveau — v4 | #89 |
| `DevicePersons.noFreeSeat.aller` | Aucune place libre à l’aller pour l’instant. | No free seat on the outbound trip for now. | nouveau — v4 | #89 |
| `DevicePersons.noFreeSeat.retour` | Aucune place libre au retour pour l’instant. | No free seat on the return trip for now. | nouveau — v4 | #89 |
| `DevicePersons.loading` | Chargement de vos inscriptions… | Loading your sign-ups… | nouveau (C5.9) | #87 |
| `DevicePersons.failed` | Vos inscriptions n’ont pas pu être chargées | Your sign-ups could not be loaded | état « échec du chargement » | #87 |
| `DevicePersons.failedBody` | Rien ne peut être ajouté ni modifié tant qu’elles ne sont pas chargées. Vérifiez la connexion, puis réessayez. | Nothing can be added or changed until they are loaded. Check your connection, then try again. | nouveau (v2 : actions inactives) | #87 |
| `DevicePersons.retry` | Réessayer | Try again | état « échec du chargement » | #87 |
| `PersonForm.title.add` | Ajouter une personne | Add a person | R1 | #88 |
| `PersonForm.title.edit` | Modifier {firstName} | Edit {firstName} | nouveau (C2.3) | #89 |
| `PersonForm.remember` | Sans compte ni e-mail : cet appareil s’en souviendra pour cet événement. | No account, no e-mail: this device will remember it for this event. | nouveau (R1) | #88 |
| `PersonForm.forSeat` | Cette personne prendra une place dans la voiture de {driver}. | This person will take a seat in {driver}’s car. | C5.4, revue (épicène) — v4 | #92 |
| `PersonForm.firstName` | Prénom | First name | R1 | #88 |
| `PersonForm.phone` | Téléphone (facultatif) | Phone (optional) | R1 | #88 |
| `PersonForm.phoneHint` | Visible seulement par l’organisateur et par les personnes de la même voiture. | Only visible to the organiser and to the people in the same car. | C1.2 | #88 |
| `PersonForm.both` | Aller et retour | Outbound and return | R1, C1.3 | #88 |
| `PersonForm.bothHint.aller` | Décochez si cette personne ne fait que l’aller. | Untick if this person only makes the outbound trip. | nouveau (C1.3) | #88 |
| `PersonForm.bothHint.retour` | Décochez si cette personne ne fait que le retour. | Untick if this person only makes the return trip. | nouveau (C1.3) | #88 |
| `PersonForm.storage.title` | Cet appareil ne pourra pas s’en souvenir | This device will not remember it | C1.14 | #88 |
| `PersonForm.storage.body` | Votre navigateur bloque le stockage : après la fermeture de la page, ces inscriptions ne pourront plus être modifiées depuis cet appareil. | Your browser blocks storage: once this page is closed, these sign-ups can no longer be changed from this device. | C1.14 | #88 |
| `RideForm.title.offer` | Proposer une voiture | Offer a car | R4 | #90 |
| `RideForm.title.edit` | Modifier la voiture | Edit the car | nouveau (C8.2) | #93 |
| `RideForm.storage.title` | Cet appareil ne pourra pas s’en souvenir | This device will not remember it | C1.14, D5 (v2) | #90 |
| `RideForm.storage.body` | Votre navigateur bloque le stockage : après la fermeture de la page, cette voiture et la personne qui conduit ne pourront plus être modifiées depuis cet appareil. | Your browser blocks storage: once this page is closed, this car and its driver can no longer be changed from this device. | C1.14, D5 (v2), épicène (FR seulement) — v4.1 | #90 |
| `RideForm.driver` | Qui conduit ? | Who drives? | R4, épicène — v4 | #90 |
| `RideForm.newDriver` | Une nouvelle personne | Someone new | R4 (« nouvelle personne ») | #90 |
| `RideForm.leavesCar` | Quittera la voiture de {driver} | Will leave {driver}’s car | nouveau (C4.5) | #90 |
| `RideForm.otherLeg.title.retour` | Au retour | On the return trip | revue — v4 | #90 |
| `RideForm.otherLeg.title.aller` | À l’aller | On the outbound trip | symétrique de la revue — v4 | #90 |
| `RideForm.otherLeg.drive.retour` | Je ramène aussi | I drive back too | revue — v4 | #90 |
| `RideForm.otherLeg.drive.aller` | J’emmène aussi | I drive there too | symétrique de la revue — v4 | #90 |
| `RideForm.otherLeg.stay` | Je reste dans la voiture de {driver} | I stay in {driver}’s car | nouveau — v4 | #90 |
| `RideForm.otherLeg.withoutCar` | Je cherche une place | I need a seat | revue, C3.2 — v4 | #90 |
| `RideForm.otherLeg.notConcerned.retour` | Je ne fais pas le retour | I’m not doing the return trip | revue — v4 | #90 |
| `RideForm.otherLeg.notConcerned.aller` | Je ne fais pas l’aller | I’m not doing the outbound trip | symétrique de la revue — v4 | #90 |
| `RideForm.otherLeg.time.retour` | Heure de départ du retour | Return departure time | nouveau — v4 | #90 |
| `RideForm.otherLeg.time.aller` | Heure de départ de l’aller | Outbound departure time | nouveau — v4 | #90 |
| `RideForm.otherLeg.same` | Mêmes places et même note pour les deux voitures. | Same seats and note for both cars. | nouveau — v4 | #90 |
| `RideForm.passengers` | Qui monte avec vous ? | Who rides with you? | revue — v4 | #90 |
| `RideForm.location.aller` | Lieu de départ | Departure place | R4 | #90 |
| `RideForm.location.retour` | Lieu de dépose | Drop-off place | R4, glossaire | #90 |
| `RideForm.time` | Heure de départ | Departure time | R4 | #90 |
| `RideForm.timeHint` | Le {date} | On {date} | nouveau (R4 : « la date est celle du leg ») | #90 |
| `RideForm.seats` | Places, sans compter qui conduit | Seats, driver not included | R4 amendé, épicène (FR seulement) — v4.1 | #90 |
| `RideForm.seatsHint` | De 1 à 8. | From 1 to 8. | R4 | #90 |
| `RideForm.note` | Note (facultatif) | Note (optional) | R4 | #90 |
| `RideForm.noteHint` | Ce que les personnes à bord doivent savoir. | What passengers should know. | épicène (FR seulement) — v4.1 | #90 |
| `FormErrors.required` | Champ requis. | Required. | = CreateEvent.errors | #88 |
| `FormErrors.tooLong` | {max} caractères au maximum. | {max} characters at most. | = CreateEvent.errors | #88 |
| `FormErrors.invalidText` | Ce texte contient un caractère non autorisé. | This text contains a character that is not allowed. | = CreateEvent.errors | #88 |
| `FormErrors.invalidPhone` | Numéro non valide : de 6 à 15 chiffres, avec seulement des espaces et + . - ( ) | Not a valid number: 6 to 15 digits, with only spaces and + . - ( ) | R1 | #88 |
| `FormErrors.invalidTime` | Heure non valide. | Not a valid time. | = CreateEvent.errors | #90 |
| `FormErrors.seats` | De 1 à 8 places. | From 1 to 8 seats. | R4 | #90 |
| `FormErrors.chooseDriver` | Choisissez qui conduit. | Choose who drives. | R4, épicène — v4 | #90 |
| `FormErrors.tooManyPassengers` | {seats, plural, one {# place seulement} other {# places seulement}} : décochez quelqu’un ou ajoutez des places. | {seats, plural, one {Only # seat} other {Only # seats}}: untick someone or add seats. | nouveau — v4 | #90 |
| `Sheet.title` | Qui monte dans la voiture de {driver} ? | Who gets in {driver}’s car? | nouveau (R6) | #91 |
| `Sheet.remaining` | {count, plural, =0 {Il ne reste aucune place dans cette voiture} one {Il reste # place dans cette voiture} other {Il reste # places dans cette voiture}} | {count, plural, =0 {No seat left in this car} one {# seat left in this car} other {# seats left in this car}} | C6.3, C6.5 | #91 |
| `Sheet.submit` | {count, plural, =0 {Placer} one {Placer # personne} other {Placer # personnes}} | {count, plural, =0 {Seat} one {Seat # person} other {Seat # people}} | C6.2 | #91 |
| `Sheet.nobody.aller` | Toutes vos personnes sont déjà dans une voiture pour l’aller. | All your people are already in a car for the outbound trip. | C6.7 | #91 |
| `Sheet.nobody.retour` | Toutes vos personnes sont déjà dans une voiture pour le retour. | All your people are already in a car for the return trip. | C6.7 | #91 |
| `Sheet.notEnoughSeats` | Il n’y a plus assez de places : personne n’a été placé. | There are no longer enough seats: nobody was seated. | C6.5 | #91 |
| `Sheet.placed` | {names} sont dans la voiture de {driver} | {names} are in {driver}’s car | nouveau (pluriel de C5.2) | #91 |
| `Seat.placed` | {firstName} est dans la voiture de {driver} | {firstName} is in {driver}’s car | C5.2 | #92 |
| `Seat.undo` | Annuler | Undo | revue (WCAG 2.2.1) — v4 | #92 |
| `Seat.undone` | {names} {count, plural, one {n’est plus} other {ne sont plus}} dans la voiture de {driver} | {names} {count, plural, one {is} other {are}} no longer in {driver}’s car | nouveau — v4 | #92 |
| `Seat.seatTaken` | Cette place vient d’être prise | This seat has just been taken | C5.7 | #92 |
| `RideChanges.leaving.title` | Qui sort de la voiture ? | Who leaves the car? | C8.4 | #93 |
| `RideChanges.leaving.body` | {passengers, plural, one {# personne} other {# personnes}} pour {seats, plural, one {# place} other {# places}} : cochez {leaving, plural, one {la personne qui sort} other {les # personnes qui sortent}}. | {passengers, plural, one {# passenger} other {# passengers}} for {seats, plural, one {# seat} other {# seats}}: tick {leaving, plural, one {the person who leaves} other {the # people who leave}}. | C8.4, épicène (FR seulement) — v4 | #93 |
| `RideChanges.leaving.rule` | Les personnes qui sortent redeviennent sans voiture. | Those who leave are without a car again. | C8.4 | #93 |
| `RideChanges.leaving.count` | {chosen, plural, one {# cochée} other {# cochées}} sur {leaving} | {chosen} of {leaving} ticked | C8.4 | #93 |
| `RideChanges.leaving.changed` | Quelqu’un a pris ou libéré une place entre-temps : rien n’a changé. Choisissez à nouveau parmi les personnes à bord. | Someone took or left a seat in the meantime: nothing has changed. Choose again among the current passengers. | C8.5, épicène (FR seulement) — v4.1 | #93 |
| `RideChanges.remove.title` | Retirer la voiture ? | Remove the car? | C8.6 | #93 |
| `RideChanges.remove.body` | {passengers, plural, =0 {Personne ne redeviendra sans voiture.} one {# personne redeviendra sans voiture.} other {# personnes redeviendront sans voiture.}} | {passengers, plural, =0 {No passenger will be left without a car.} one {# passenger will be without a car again.} other {# passengers will be without a car again.}} | C8.6, épicène (FR seulement) — v4 | #93 |
| `RideChanges.remove.notified` | Personne n’est prévenu : pensez à le leur dire. | Nobody is notified: remember to tell them. | C8.8 | #93 |
| `Actions.submit` | Valider | Confirm | C1.9, C1.10 | #87 |
| `Actions.close` | Fermer | Close | C6.9 ; aussi nom de la croix de la barre du bas | #87 |
| `Actions.cancel` | Annuler | Cancel | C8.7 | #87 |
| `Actions.offline` | Action impossible, vérifiez la connexion | Action failed, check your connection | état « hors ligne » | #87 |
| `Actions.failed` | Une erreur est survenue et rien n’a changé. Réessayez dans un instant. | Something went wrong and nothing has changed. Try again in a moment. | état « erreur serveur » | #87 |
| `Actions.rideGone` | Cette voiture n’est plus proposée | This car is no longer offered | C6.8 | #87 |
| `Actions.alreadyInCar` | {count, plural, one {Cette personne est déjà dans une voiture} other {Une de ces personnes est déjà dans une voiture}} : rien n’a changé. | {count, plural, one {This person is already in a car} other {One of these people is already in a car}}: nothing has changed. | décision « alreadyInCar » de la conception | #87 |

### Clés nouvelles en v4

`DevicePersons.summary`, `DevicePersons.colName`, `DevicePersons.cell.passenger`,
`DevicePersons.cellLabel`, `DevicePersons.sheetTitle`, `DevicePersons.findSeat`,
`DevicePersons.seeCar`, `DevicePersons.noFreeSeat.aller`, `DevicePersons.noFreeSeat.retour`,
`DevicePersons.state.notConcerned.aller`, `DevicePersons.state.notConcerned.retour`,
`DevicePersons.notConcerned.aller`, `DevicePersons.notConcerned.retour`,
`RideForm.otherLeg.title.retour`, `RideForm.otherLeg.title.aller`,
`RideForm.otherLeg.drive.retour`, `RideForm.otherLeg.drive.aller`, `RideForm.otherLeg.stay`,
`RideForm.otherLeg.withoutCar`, `RideForm.otherLeg.notConcerned.retour`,
`RideForm.otherLeg.notConcerned.aller`, `RideForm.otherLeg.time.retour`,
`RideForm.otherLeg.time.aller`, `RideForm.otherLeg.same`, `RideForm.passengers`,
`FormErrors.tooManyPassengers`, `Seat.undo`, `Seat.undone`.

### Clés changées en v4

| clé | avant | après |
|---|---|---|
| `DevicePersons.title` | Personnes de l’appareil / People on this device | Vos inscriptions / Your sign-ups |
| `PersonForm.forSeat` | Elle prendra une place dans la voiture de {driver}. / They will take a seat in {driver}’s car. | Cette personne prendra une place dans la voiture de {driver}. / This person will take a seat in {driver}’s car. |
| `RideForm.driver` | Conducteur / Driver | Qui conduit ? / Who drives? |
| `FormErrors.chooseDriver` | Choisissez le conducteur. / Choose the driver. | Choisissez qui conduit. / Choose who drives. |
| `RideChanges.leaving.body` (FR) | {passengers, plural, one {# passager} other {# passagers}} pour … | {passengers, plural, one {# personne} other {# personnes}} pour … |
| `RideChanges.remove.body` (FR) | Aucun passager / # passager(s) redeviendra(ont) sans voiture. | Personne / # personne(s) redeviendra(ont) sans voiture. |
| `Board.tabCount` | texte inchangé, lu seulement par les lecteurs d’écran | le même texte, visible dans la pastille |
| `DevicePersons.cellLabel` (v4.1) | {firstName}, {leg} : {state} | {firstName}, {leg} : {cell}, `{cell}` = le texte visible |
| `RideForm.seats` (FR, v4.1) | Places, conducteur non compris | Places, sans compter qui conduit |
| `RideForm.noteHint` (FR, v4.1) | Ce que les passagers doivent savoir. | Ce que les personnes à bord doivent savoir. |
| `RideChanges.leaving.changed` (FR, v4.1) | … parmi les passagers actuels. | … parmi les personnes à bord. |
| `RideForm.storage.body` (FR, v4.1) | … cette voiture et son conducteur ne pourront plus être modifiés… | … cette voiture et la personne qui conduit ne pourront plus être modifiées… |

### Clés retirées en v4

`DevicePersons.hint` (plus de phrase sous le titre) ; `DevicePersons.state.notConcerned` et
`DevicePersons.notConcerned` (« Pas concernée »), remplacées par leurs versions par leg.
`DevicePersons.edit` reste, dans la feuille du prénom. En v4.1 : `RideForm.forLeg.aller` et
`RideForm.forLeg.retour` (« Pour l’aller seulement : … proposez-la aussi sur l’onglet
Retour »), qui disaient le contraire de « Je ramène aussi » et n’étaient plus dessinées.

Épicènes en v4.1 (français seulement ; l’anglais était déjà neutre) : `RideForm.seats`
(« Places, sans compter qui conduit » : R4 est amendé de toute façon), `RideForm.noteHint`
et `RideChanges.leaving.changed` (« personnes à bord »), `RideForm.storage.body` (« la
personne qui conduit »).

## Décisions

Les décisions 1 à 20 de v1 à v3.2 tiennent, sauf : la 2 (ordre d’un leg) et la 10 (nom de la
section), remplacées par la matrice ; la 3 (actions l’une sous l’autre), remplacée par la
v4-12 ; la 5 (réussite effacée après 6 s), remplacée par la v4-7 ; la 18 pour sa ligne
« pas d’expiration sous le focus ».

v4-1. Décision : chaque cellule ouvre la feuille de la personne pour ce leg, son état puis
ses actions ; le prénom ouvre la feuille de la personne (téléphone, « Modifier »). — Raison :
une cellule d’une centaine de pixels ne porte pas deux boutons ; la feuille unique est le
motif approuvé ; la cellule reste un repère de focus stable.

v4-2. Décision : la matrice est un `<table>` avec en-têtes de ligne et de colonne. — Raison :
le leg et la personne de chaque cellule sont annoncés.

v4-3. Décision : dépliée à l’ouverture s’il y a une cellule « Sans voiture », repliée sinon,
puis laissée comme la personne la met. — Raison : la revue (« replier quand il n’y a rien à
faire ») ; ne jamais replier sous le focus.

v4-4. Décision : la cellule « dans une voiture » dit « Avec {conducteur} » ; le nom
accessible de toute cellule reprend son texte visible ; la phrase complète est dans la
feuille. — Raison : « Dans la voiture de Marc » ne tient pas dans une cellule à 360 px ;
WCAG 2.5.3 (corrigé en v4.1 : le nom disait « dans la voiture de… », sans « Avec »).

v4-5. Décision : la pastille porte « N sans voiture », sous le nom de l’onglet. — Raison :
dire ce qu’elle compte ; côte à côte, « Outbound » et « 2 without a car » ne tiennent pas
dans un demi-écran de 360 px.

v4-6. Décision : « Trouver une place » met le focus sur la première place libre sans la
prendre. — Raison : prendre une place reste un geste explicite, avec ses règles (C5.2, C5.5)
et son « Annuler ».

v4-7. Décision : la réussite reste jusqu’à l’action suivante, « Fermer » ou Échap ;
« Annuler » suit tout placement réussi, rend l’état d’avant sur ce leg, et ne s’annule pas
lui-même. — Raison : revue, WCAG 2.2.1.

v4-8. Décision : l’autre leg part de l’état actuel de qui conduit (nouvelle personne : « Je
ne fais pas… », comme C4.4) ; « Je reste dans la voiture de {conducteur} » quand c’est le
cas ; absent si elle conduit déjà sur l’autre leg. — Raison : ne rien changer qu’on n’a pas
choisi ; C4.1 garde ses quatre actions.

v4-9. Décision : « Je ramène aussi » déplie le lieu (prérempli, qui suit le lieu de ce leg
tant qu’on ne le change pas) et l’heure (préremplie) de l’autre leg ; places et note
communes. — Raison : au retour le lieu est celui de la dépose (glossaire) ; zéro saisie dans
le cas courant.

v4-10. Décision : « Qui monte avec vous ? » décoché par défaut, limité aux personnes sans
voiture sur ce leg, et pour ce leg seulement. — Raison : une voiture remplie sans choix
explicite cacherait des places aux autres ; « changer de voiture en un geste » reste hors
périmètre.

v4-11. Décision : la barre reste dans le DOM juste après l’en-tête, donc avant « Vos
inscriptions » et les onglets. — Raison : sa croix reste à quelques Tab du haut.

v4-12. Décision : « Ajouter une personne » et « Proposer une voiture » côte à côte, libellés
sur deux lignes autorisés pour ces deux boutons. — Raison : mesuré au rendu, avec la matrice
de trois personnes, la première place libre tombait à 789–833 px, sous le pli de 780 ; ces
52 px la remontent.

v4-13. Décision : sur la carte, l’heure passe sur la ligne du titre. — Raison : 24 px de plus
au-dessus du pli, sans rien retirer.

v4-14. Décision : « Proposer une voiture » en `variant="default"` quand le bandeau du leg est
ambre. — Raison : revue.

v4-15. Décision : cellules sans icône, coupées entre les mots (`wrap-break-word`) et non
n’importe où. — Raison : au rendu, une icône et `wrap-anywhere` coupaient « voitur-e » ; le
texte suffit.

v4-16. Décision : la matrice est un composant qui reçoit une liste de personnes et leurs
états par leg, sans rien supposer de l’appareil. — Raison : la vue organisateur (#154) pourra
l’afficher pour tout l’événement.

## Écarts par rapport à la revue

1. « Chaque personne sur une ligne (prénom, état, menu) » : dans la matrice, le « menu » est
   le prénom lui-même (un bouton) et l’« état » est deux cellules. Une ligne garde 44 px ;
   un texte long passe sur deux lignes dans sa cellule. — Raison : la matrice décidée par
   l’humain remplace la ligne par leg de la revue.
2. Plus de ligne de date sous les onglets, **et aussi** sur un événement sans retour. —
   Raison : elle y répète aussi la ligne « Aller » de l’en-tête.
3. « À l’aller » (J’emmène aussi / Je cherche une place / Je ne fais pas l’aller) depuis
   l’onglet Retour, et l’option « Je reste dans la voiture de {conducteur} ». — Raison :
   sans eux, le formulaire ne serait complet que depuis l’onglet Aller, ou changerait l’état
   d’un passager sans qu’il l’ait choisi.
4. « Trouver une place » met le focus sur la place libre, sans la prendre, et la feuille
   coche toujours toutes les personnes sans voiture. — Raison : C5.2, C5.5 et C6.1 restent
   tels quels.
5. La pastille dit « N sans voiture », pas seulement un chiffre ambre. — Raison : consigne du
   coordinateur (« elle dit ce qu’elle compte ») ; la revue reprochait un chiffre « sans dire
   de quoi ».
6. « Ajouter une personne » et « Proposer une voiture » côte à côte, et l’heure sur la ligne
   du titre d’une carte. — Raison : pas dans la revue, mais nécessaire pour tenir son exigence
   (« la première voiture ne doit pas passer sous le pli ») avec la matrice au-dessus.

## Impact serveur

- **Proposer une voiture** (`offerRide`, #84) : en plus du Ride de ce leg, dans la **même
  transaction**, tout ou rien :
  - l’autre leg : `{ kind: "drive", location, time, creationId }` (un second Ride, mêmes
    places et note), `"withoutCar"`, `"notConcerned"` ou `"keep"` ;
  - `passengerIds[]` : des personnes de l’appareil sans voiture sur ce leg, placées dans le
    nouveau Ride, avec les contrôles de `takeSeats` et au plus ses places.

  Un renvoi après une réponse perdue ne crée ni second Ride ni double placement (C4.10, un
  identifiant de création par Ride). Nouvelle erreur de champ : trop de passagers pour les
  places.
  - **Qui conduit est déjà passagère sur l’autre leg** : tout choix sauf `"keep"` la sort de
    cette voiture, dans la même transaction. `"drive"` supprime d’abord ce Placement, sinon
    le déclencheur de C12.8 refuse le second Ride ; `"withoutCar"` le passe à sans voiture ;
    `"notConcerned"` le supprime. Dans les trois cas, une place se libère dans la voiture de
    quelqu’un d’autre. De même, une personne sans voiture sur l’autre leg qui choisit
    `"drive"` perd ce Placement sans voiture avant le second Ride. Sur ce leg, C4.5 est
    inchangé.
  - **Verrous**, dans l’ordre d’`architecture.md`, Ride puis Person : d’abord les Rides
    existants que la transaction modifie (celui que qui conduit quitte sur ce leg, celui
    qu’elle quitte sur l’autre leg), par identifiant croissant pour qu’aucune transaction
    concurrente ne les prenne dans l’autre ordre ; puis les lignes `person` concernées (qui
    conduit, les passagers). Les Rides créés n’ont pas besoin de verrou : personne ne les
    voit avant la validation.
- **« Annuler »** : une action qui rend leur Placement d’avant à une liste de personnes sur un
  leg, tout ou rien, et seulement à celles qui sont encore dans ce Ride. Le client garde l’état
  d’avant de chacune avec le message. Les actions par personne de #89 suffiraient une à une,
  mais pas atomiquement. Verrous : le Ride d’abord (`FOR UPDATE`), puis les lignes `person` ;
  les Placements sont relus sous verrou avant d’être rendus.
- **Matrice, « Trouver une place », pastilles, repli** : rien côté serveur ; l’état de #81
  porte déjà l’état de chaque personne de l’appareil sur chaque leg.
- **#152** : `device-persons.tsx` (section par leg) devient la matrice au-dessus des onglets ;
  `message-bar.tsx` gagne « Annuler » et perd l’expiration ; `leg-tabs.tsx` montre la
  pastille ; `leg-panel.tsx` perd la ligne de date. `run-action.ts`, `phone-link.tsx`, le
  chargement et l’échec sont repris tels quels.

## Critères de l’epic à amender

- **C2.2** : « chaque leg affiche une section » devient « une matrice “Vos inscriptions” au-
  dessus des onglets, une ligne par personne, une cellule par leg ».
- **C3.1, C3.2, C7.2** : l’action « Pas concernée » devient « Ne fait pas l’aller » / « Ne
  fait pas le retour », dans la feuille de la cellule.
- **C3.3** : « Seule la section des personnes de l’appareil la montre » devient « Seule “Vos
  inscriptions” la montre ».
- **C10.1** : « dans la section des personnes de l’appareil » devient « dans la feuille du
  prénom, ouverte depuis “Vos inscriptions” ».
- **R4** : « Conducteur » devient « Qui conduit ? » et « conducteur non compris » devient
  « sans compter qui conduit » ; plus l’autre leg et « Qui monte avec vous ? ».
- **C4.2** : « La voiture n’apparaît que sur le leg où elle a été proposée » devient « … sauf
  avec “Je ramène aussi” / “J’emmène aussi”, qui crée aussi une voiture sur l’autre leg ».
  Un test de C4.2 écrit sur l’ancien texte échouerait.
- **C4.4** devient le comportement par défaut ; **C4.5** : la seule écriture couvre aussi
  l’autre leg et les passagers de « Qui monte avec vous ? » ; **C4.10** couvre aussi le
  second Ride et les passagers.
- **Hors périmètre de l’epic** : la ligne « Proposer une voiture sur les deux legs en une fois :
  on la propose sur chaque onglet » sort de la liste, par la décision de l’humain du
  18 octobre (« Au retour : Je ramène aussi »).
- **C5.2** : la barre de réussite porte « Annuler » et reste jusqu’à l’action suivante.
- **C9.3** : le nombre est visible, « N sans voiture », en pastille ambre.
- **C11.2** : la capture « section des personnes de l’appareil » devient « Vos inscriptions »,
  dépliée et repliée ; ajouter « Proposer une voiture » avec « Au retour » déplié et « Qui
  monte avec vous ? ».

## Hors périmètre

La vue organisateur (epic #154), le lien perso et son QR code, la fraîcheur, supprimer une
personne, les options à l’écran, changer de voiture en un geste, faire sortir un passager
sans réduire ses places, une liste d’attente, distinguer deux personnes de même prénom, les
notifications.

## Révisions

- v1 (2026-10-17) : première version, publiée. Revue de design : changements demandés
  (six bloquants : contraste des erreurs et de « Retirer la voiture » ; actions pendant le
  chargement et l’échec ; avertissement de stockage sur « Proposer une voiture » ; état
  « conduit à l’aller, cherche au retour » ; 15 voitures et la barre du bas ; focus après
  une action ; dix suggestions).
- v2 (2026-10-18) : erreurs sans fond teinté (barre, alerte de chargement), « Retirer la
  voiture » en `outline` + `text-destructive`, confirmation sans nouvelle variante ;
  actions et places inactives pendant le chargement et l’échec (`DevicePersons.failedBody`
  reformulée) ; avertissement `RideForm.storage.*` dessiné ; onglet Retour avant et après
  le tap ; bas d’un leg de 15 voitures avec la barre, sa croix « Fermer » et 112 px
  réservés ; règles de focus et leur maquette ; `FormErrors.chooseDriver` et « Une nouvelle
  personne » dépliée dessinés ; Téléphone dans le groupe Conducteur en erreur ; boutons
  `whitespace-nowrap` dessinés tels qu’ils rendent ; « Sans voiture » sans JavaScript ; lien
  `tel:` de 44 px ; après la confirmation de retrait, retour à la liste de la feuille, et
  aucune case cochée dessinés ; `wrap-anywhere` de la ligne d’état, même prénom, régions
  vivantes toujours montées. Toutes les remarques appliquées, aucune contestée. Republiée à
  la même URL. Revue de design : changements demandés (deux bloquants : « Retirer la
  voiture » encore `destructive` dans « Les éléments » ; focus et ordre de tabulation de la
  croix de la barre ; cinq suggestions).
- v3 (2026-10-18) : « Les éléments » corrigé (`outline` + `text-destructive`) ; barre : une
  seule, dans le DOM avant les onglets, Échap, focus après la croix, pas d’expiration sous
  le focus, croix hors des régions vivantes ; confirmation de retrait par
  `AlertDialogPrimitive.Action asChild` autour d’un `Button` ; décision 5 alignée
  (« Fermer », Échap ou l’action suivante) ; `DevicePersons.failedBody` : « ajouté ni
  modifié » ; compteurs d’onglets de la maquette corrigés (sélecteur `.tabs > span`). Rendu
  vérifié avec Chrome headless (`chrome`), à 360 px (dans un cadre de 360 px, Chrome
  headless n’allant pas sous 500 px de fenêtre) et à 1280 px : aucun débordement
  horizontal, aucune cible sous 44 px, aucun libellé de bouton coupé ; bouton de
  confirmation `rgb(231, 0, 11)` texte blanc ; compteurs d’onglets 20 px, fond
  `rgb(23, 23, 23)`, chiffres `rgb(250, 250, 250)`, dans un onglet de 44 px. Toutes les
  remarques appliquées, aucune contestée.
  Republiée à la même URL.
- v3.1 (2026-10-18) : deux défauts de maquette trouvés au rendu, corrigés : l’anneau de
  focus d’un prénom de la section s’étirait sur toute la largeur (le prénom suit désormais
  son texte) ; dans « Erreur serveur », la barre recouvrait le texte de la maquette (cadre
  agrandi). Rien ne change pour le développeur. Rendu revérifié, même résultat. Republiée à
  la même URL. Revue de design : changements demandés (un bloquant : Échap quand le focus est
  sur la croix de la barre ; aucune suggestion).
- v3.2 (2026-10-18) : Échap sur la barre : focus dans la barre, il suit la règle de
  « Fermer » (repère de l’action, sinon onglet actif, sinon titre de l’événement) ; focus
  ailleurs, la barre se ferme et le focus ne bouge pas. Corrigé dans le tableau du focus et
  sur la page. Remarque appliquée, non contestée. Republiée à la même URL.
- v4 (2026-10-18) : revue de design de l’humain sur la v2 et ses décisions (commentaire
  du 18 octobre sur #66). Matrice « Vos inscriptions » (Prénom | Aller | Retour) au-dessus
  des onglets, repliable en résumé, cellules actionnables par la feuille ; « Trouver une
  place » ; « Proposer une voiture » avec l’autre leg (Je ramène aussi / Je reste… / Je
  cherche une place / Je ne fais pas…) et « Qui monte avec vous ? » ; textes épicènes
  (« Ne fait pas l’aller / le retour », « Cette personne prendra… », « Qui conduit ? »,
  « personnes » au lieu de « passagers ») ; « Vos inscriptions » ; « Annuler » dans la barre
  de réussite, qui ne s’efface plus après 6 s ; pastille ambre « N sans voiture » sous le nom
  de l’onglet ; « Proposer une voiture » plein quand il manque des places ; plus de ligne de
  date. Le rendu a imposé trois corrections avant publication : les deux actions côte à côte
  et l’heure sur la ligne du titre (la première place libre était à 789–833 px, sous le pli),
  et des cellules sans icône coupées entre les mots (« voitur-e »). Rendu vérifié avec Chrome
  headless (`chrome`), page dans un cadre de 360 px et à 1280 px : aucun débordement, aucune
  cible sous 44 px, aucun libellé coupé ; dans un téléphone de 360 px, première voiture à
  582 px, première place libre à 715–759 px, au-dessus du pli de 780 ; cellules de 108 × 44 px ;
  onglets de 48 px, pastille `amber-950` sur `amber-100` ; bouton de confirmation
  `rgb(231, 0, 11)` texte blanc. Section « Écarts par rapport à la revue » : six écarts,
  chacun avec sa raison. Section « Impact serveur » pour l’architecte. Republiée à la même
  URL.
- v4 (suite) : revue de design : changements demandés (quatre bloquants : nom accessible
  d’une cellule passagère sans son texte visible ; focus après retrait quand la section est
  repliée ; critères à amender incomplets, C4.2 et le hors-périmètre ; impact serveur
  incomplet pour qui conduit et est passagère sur l’autre leg, et ordre des verrous ; sept
  suggestions). Les six écarts sont jugés justifiés.
- v4.1 (2026-10-18) : `DevicePersons.cellLabel` reprend le texte visible de la cellule
  (« Léa, Aller : Avec Claire ») ; toute règle de focus qui vise une cellule ou un prénom
  d’une section repliée va sur son bouton, maquette « après confirmation, section repliée »
  ajoutée ; critères à amender complétés (C3.3, C4.2, C4.5, C10.1, C11.2, R4, et la ligne
  « Proposer une voiture sur les deux legs en une fois » qui sort du hors-périmètre, par la
  décision de l’humain) ; `RideForm.forLeg.*` retirées ; impact serveur : sortir de sa voiture
  sur l’autre leg (avant le second Ride, à cause du déclencheur de C12.8), libérer une place
  ailleurs, verrous Ride puis Person par identifiant croissant, verrous d’« Annuler » ;
  épicènes en français (« Places, sans compter qui conduit », « personnes à bord », « la
  personne qui conduit ») ; « Quittera la voiture de… » sous chaque option qui sort qui
  conduit de sa voiture sur l’autre leg ; « À l’aller » dessiné depuis l’onglet Retour ;
  heure de l’autre leg précisée (celle de l’événement). Pli mesuré honnêtement : avec un
  titre et un lieu de 30 caractères (C9.2), première place libre à 745–789 px, 9 px sous le
  pli (bandeau et première voiture au-dessus). Rendu vérifié avec Chrome headless (`chrome`),
  page dans un cadre de 360 px et à 1280 px : aucun débordement, aucune cible sous 44 px,
  aucun libellé coupé. Toutes les remarques appliquées, aucune contestée. Republiée à la même
  URL.
