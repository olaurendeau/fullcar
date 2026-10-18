# Écran d’un événement : s’inscrire, proposer une voiture, prendre une place

- Artifact : https://claude.ai/artifact/RV9ktAqKxrgzmumgn22AEj
- Epic : https://github.com/olaurendeau/fullcar/issues/66
- Tâches : #86 (PR #141), #87, #88, #89, #90, #91, #92, #93, #95
- Page : `index.html` (autonome, maquettes à 360 px de large)

## Ce que la page montre

L’écran unique de `/e/{id}` (et de `/e/{id}/admin`, sous l’espace organisateur, C11.7), leg
par leg : le bandeau de couverture, les deux actions, la section des personnes de
l’appareil, les cartes des voitures et la liste « Sans voiture » ; puis la feuille du bas,
où s’ouvrent tous les formulaires et le choix des passagers, la confirmation de retrait, et
la barre de messages du bas de l’écran.

Les couleurs sont celles de `src/app/globals.css` et de la PR #141 (bandeau ambre
`amber-100` / `amber-950` quand il manque des places), les composants ceux de
`src/components/ui` (`button`, `input`, `checkbox`, `radio-group`, `sheet`,
`alert-dialog`, `textarea`). Le cadre pointillé bleu marque ce qui est nouveau par rapport
à la PR #141.

### L’ordre d’un leg

1. Bandeau de couverture (`role="status"`), absent sur un leg vide (C9.1, C9.6).
2. Date et heure du leg (PR #141).
3. « Ajouter une personne », puis « Proposer une voiture » : l’un sous l’autre, pleine
   largeur, 44 px, `variant="outline"`, toujours présents (C1.1, C9.6, C11.4).
4. Sans JavaScript : `Board.needsJavaScript` dans un `<noscript>` ; boutons et places
   libres inactifs.
5. Personnes de l’appareil (C2.2), absente sans personne. À sa place : « Chargement de vos
   inscriptions… » pendant la lecture (C5.9), ou l’alerte d’échec avec « Réessayer ». Tant
   que les personnes de l’appareil ne sont pas connues (`pending`, `loading`, `failed`), les
   deux actions de l’étape 3 et les places libres sont **inactives** : sinon les formulaires
   s’ouvriraient comme pour un appareil sans personne et créeraient un doublon.
6. Les voitures, par heure de départ, ou « Aucune voiture proposée pour l’aller » (PR #141).
7. « Sans voiture » (C3.4).

### Où s’ouvrent les choses

- **La feuille** (`Sheet side="bottom"`, au plus 90 % de la hauteur, corps qui défile,
  boutons en bas) porte : le choix des passagers (R6), « Ajouter une personne »
  (première inscription et suivantes, R1, R2), « Modifier {prénom} » (C2.3), « Proposer
  une voiture » (R4), « Modifier la voiture » (C8.2) et l’étape « Qui sort de la
  voiture ? » (C8.4). Elle se ferme par « Fermer » et par Échap, sans effet
  (`showCloseButton={false}` : la croix de `sheet.tsx` porte « Close » en dur).
- **Le retrait** d’une voiture : `AlertDialog` centré, focus à l’ouverture sur « Annuler »
  (`AlertDialogCancel`, `outline`). Le bouton de confirmation n’est **pas**
  `AlertDialogAction` avec une `className` : ce composant pose `<Button asChild>` autour de
  l’Action Radix, Slot joint les classes sans `twMerge`, et `bg-primary` côtoierait
  `bg-destructive` (le noir peut gagner selon l’ordre de la feuille de style). À la place :

  ```tsx
  <AlertDialogPrimitive.Action asChild>
    <Button className="h-11 bg-destructive text-white hover:bg-destructive/90">
      {t("Board.car.remove")}
    </Button>
  </AlertDialogPrimitive.Action>
  ```

  `Button` passe sa `className` par `cn` (`twMerge`), qui retire `bg-primary`. **Aucune
  variante n’est ajoutée** à `button.tsx`. Blanc sur `#e7000b` : 4,77:1. Le test de #93
  vérifie la couleur calculée du bouton (`getComputedStyle(...).backgroundColor`).
- **La barre du bas** : les messages d’une action faite sur la page (tap sur une place,
  actions de la section, « Réessayer »). Fixe en bas de l’écran, marges de 12 px plus la
  zone sûre, avec un bouton « Fermer » (icône X, 44 px, nom `Actions.close`). Réussite :
  fond `primary`, effacée après 6 s, mais jamais tant que le focus est dans la barre (les 6 s
  repartent quand il en sort). Échec : texte `foreground` sur `background`, bordure et icône
  `destructive`, jusqu’à « Fermer », Échap ou l’action suivante. Une seule barre pour la
  page, placée dans le DOM **juste avant les onglets** (après l’en-tête de l’événement),
  même si elle s’affiche en bas : sa croix est à quelques Tab du haut de la page, jamais
  après 15 voitures. Échap la ferme depuis n’importe où, tant qu’aucune feuille ni
  confirmation n’est ouverte (elles gardent leur Échap). Tant que la barre est
  affichée, `<main>` reçoit 112 px de plus en bas (plus `env(safe-area-inset-bottom)`), pour
  que la dernière place libre et la fin de « Sans voiture » passent au-dessus (C11.4). Dans
  une feuille, le message est dans la feuille, au-dessus des boutons, et la feuille reste
  ouverte.
- **Régions vivantes** : la barre contient deux régions, `role="status"` et `role="alert"`,
  qui ne contiennent **que le texte du message**. Elles sont **toujours montées, vides** quand
  il n’y a pas de message ; seul leur texte change, ce qui garantit l’annonce. L’icône
  (`aria-hidden`) et la croix « Fermer » sont leurs voisines, **hors** des régions : un
  lecteur d’écran lit « Tom est dans la voiture de Sophie », pas « …, Fermer ». Le conteneur
  visible de la barre ne s’affiche que quand une région a du texte. Le bandeau de couverture est aussi un `status` : les tests filtrent
  `getByRole("status")` par leur texte (`{ name }` ne s’applique pas à un `status`, donc
  `.filter({ hasText })`).

### Contraste

Aucun texte rouge sur un fond teinté de rouge : `#e7000b` sur `#fef2f2` donne 4,36:1 et
`variant="destructive"` (fond `destructive/10`) environ 4,0:1, sous les 4,5:1 de WCAG AA
pour du texte de 14 px.

- Alerte d’échec du chargement : `bg-background`, `border-destructive`, icône et titre
  `text-destructive` (4,77:1), texte `text-muted-foreground` (4,74:1).
- Barre en erreur : texte `text-foreground` sur `bg-background`, bordure et icône
  `destructive`.
- Messages rouges dans une feuille et erreurs de champ : `text-destructive` sur
  `bg-background` (4,77:1), comme `CreateEvent.failed`.
- « Retirer la voiture » sur la carte : `variant="outline"` + `text-destructive`.
- Hors de cet épic : `AdminLinkProblem` (`admin-panel.tsx`) a le même fond teinté ; à
  corriger à part.

### Le focus après une action

Quand une action fait disparaître le bouton qui avait le focus, le focus va sur un repère
stable, rendu focalisable par `tabIndex={-1}` (feuille et confirmation : par leur
`onCloseAutoFocus`) :

| action réussie | focus |
|---|---|
| « Sortir de la voiture », « Pas concernée », « Je cherche une place » | le prénom de la personne dans la section ; il porte `aria-describedby` vers sa ligne d’état (« Tom, Pas concernée ») |
| « Retirer la voiture » confirmé | le prénom du conducteur dans la section, désormais « Pas concernée » |
| un tap qui place, la feuille validée | le titre de la carte de cette voiture |
| un refus qui supprime la cible (place prise, voiture retirée) | le titre de la carte si elle existe encore, sinon le bandeau du leg (`tabIndex={-1}`) |
| feuille fermée sans effet ; ajouter, proposer, modifier validés | le bouton qui l’a ouverte (défaut de Radix) |
| « Valider » dans la feuille après « Ajouter une personne » | la case de la nouvelle personne, cochée |
| refus dans une feuille | ne bouge pas ; un formulaire en erreur : premier champ en erreur |
| croix « Fermer » de la barre | le repère de l’action qui a produit le message (gardé avec lui), s’il existe encore ; sinon l’onglet actif du leg ; sans onglets, le titre de l’événement (`tabIndex={-1}`) |
| Échap sur la barre | focus dans la barre (sur sa croix) : la règle de la croix « Fermer » ci-dessus ; focus ailleurs : la barre se ferme et le focus ne bouge pas |
| barre de réussite qui expire | n’expire pas tant que le focus est dans la barre ; donc jamais sous le focus |
| action suivante pendant que la barre est affichée | le message est remplacé, la croix reste montée : un focus posé dessus y reste |

### Les éléments

- **Boutons** : shadcn `Button` est `whitespace-nowrap` : un libellé ne passe jamais à la
  ligne dans son bouton. Les rangées de boutons (actions d’une personne, Modifier / Retirer
  la voiture) sont en `flex flex-wrap gap-2`, chaque bouton `grow` : à 360 px elles tiennent
  sur une ligne, sinon c’est la rangée qui passe à la ligne.
- **Place libre** : `<button>` de 44 px, bordure pointillée, icône « + » décorative, texte
  visible « Place libre » (PR #141). Nom accessible `Board.car.takeSeat`, qui commence par
  ce texte (C5.1, WCAG 2.5.3). Inactive pendant `pending` / `loading` / `failed`, sans
  JavaScript, et pendant son propre envoi.
- **Numéro** : lien `tel:` de 44 px de haut (C11.5), texte = le numéro tel que saisi, nom accessible
  `Board.call`. Sur une carte : celui du conducteur sous le titre, celui d’un passager à
  droite de son prénom (retour à la ligne si besoin). Dans la section : sous l’état.
  Seulement là où C10.1 l’envoie ; sans numéro, aucune ligne.
- **Carte de sa propre voiture** : « Modifier » (`variant="outline"`) et « Retirer la
  voiture » (`variant="outline"` + `className="text-destructive"`, **pas**
  `variant="destructive"`, dont le fond teinté donne 4,0:1) côte à côte en bas de la carte
  (C8.1).
- **Une personne de l’appareil** : `role="group"` nommé par son prénom ; état sur ce leg
  avec un point (plein : dans une voiture ; ambre : sans voiture ; vide : pas concernée ; le
  texte suffit sans la couleur) ; prénom et ligne d’état en `wrap-anywhere` (C11.3) ;
  « Modifier » en haut à droite ; puis ses actions, 44 px, côte à côte :

  | état sur ce leg | texte de l’état | actions |
  |---|---|---|
  | conductrice | Conduit | Modifier |
  | passagère | Dans la voiture de {conducteur} | Sortir de la voiture, Pas concernée, Modifier |
  | sans voiture | Sans voiture | Pas concernée, Modifier |
  | pas concernée | Pas concernée | Je cherche une place, Modifier |

- **Deux personnes de même prénom** : deux groupes « Léa » ont le même nom accessible. Le
  prénom porte `aria-describedby` vers la ligne d’état, ce qui les distingue quand leurs
  états diffèrent ; sinon elles se distinguent par leur ordre, comme à l’écran. Aller plus
  loin est hors périmètre (« distinguer deux personnes de même prénom ») ; un test les prend
  par leur rang (`nth`).
- **Formulaire « Ajouter une personne »** : Prénom (focus à l’ouverture), Téléphone
  (facultatif) et sa phrase (C1.2), « Aller et retour » cochée avec son explication propre
  à l’onglet (absente sans retour). Sous le titre : `PersonForm.remember` quand l’appareil
  n’a aucune personne ; `PersonForm.forSeat` quand il s’ouvre depuis une place libre
  (C5.4) ; l’avertissement C1.14 à la place de `remember` quand le stockage est
  indisponible. Boutons : « Valider », « Fermer » ; ouvert depuis la feuille : « Valider »,
  « Annuler » (retour à la liste).
- **Formulaire « Proposer une voiture »** : Conducteur, Lieu de départ / de dépose, Heure
  de départ (`type="time"`, préremplie, date du leg dessous), Places, conducteur non
  compris (`type="number"`, 1 à 8, 3 par défaut), Note (facultatif, `textarea`). Le
  conducteur :
  - aucune personne éligible sur l’appareil : un groupe « Conducteur » avec Prénom et
    Téléphone, sans choix (C4.1 en 4 actions, focus sur Prénom) ;
  - sinon des boutons radio : chaque personne de l’appareil qui ne conduit pas sur ce leg
    (une passagère porte `RideForm.leavesCar` sous son prénom, C4.5), puis « Une nouvelle
    personne », qui déplie Prénom et Téléphone. Une seule éligible : présélectionnée.
    Plusieurs : aucune ; envoyer sans choix donne `FormErrors.chooseDriver` sous le groupe.
  - Sous le titre, `RideForm.forLeg.*` quand l’événement a deux legs ; rien sans retour ni
    en modification.
  - Stockage indisponible : l’avertissement `RideForm.storage.*` en tête du formulaire, dès
    l’ouverture, avant « Valider » (C1.14, D5) : un nouveau conducteur tire aussi un jeton,
    et une voiture proposée depuis un appareil qui ne garde rien ne se modifie plus après la
    fermeture de la page. Règle commune : tout formulaire qui crée (personne ou voiture)
    affiche l’avertissement tant que le stockage est indisponible.
  - « Une nouvelle personne » choisie déplie Prénom et Téléphone dans le groupe, sans
    déplacer le focus ; revenir à une personne de l’appareil les replie sans perdre ce qui
    y était tapé.
- **Erreurs de champ** : comme `create-event-form.tsx` : libellé et bordure en
  `destructive`, message de 13 px sous le champ, `aria-invalid` et `aria-describedby`,
  focus sur le premier champ en erreur, valeurs gardées (C1.8, C4.7).
- **La feuille des passagers** : titre `Sheet.title` ; dessous, toujours,
  `Sheet.remaining`, qui passe en `destructive` (`aria-live="polite"`) quand il y a plus de
  cochées que de places, ou après un refus. Une ligne de 44 px par personne : case,
  prénom, état (`DevicePersons.state.*`). Puis « Ajouter une personne » (`outline`). En
  bas : `Sheet.submit` (inactif à 0 cochée et au-delà des places), « Fermer ».
- **L’étape « qui sort »** : remplace le formulaire de modification dans la feuille, après
  « Valider » quand les places passent sous le nombre de passagers. Les passagers actuels,
  aucune case cochée, le compteur `RideChanges.leaving.count`, « Valider » inactif tant que
  le compte n’est pas exactement passagers − places, « Annuler » qui revient au formulaire.

## États couverts

| état | section de la page | critères |
|---|---|---|
| page complète à 360 × 780, bandeau au-dessus du pli, compteurs d’onglets | Le tableau | C9.1, C9.2, C9.3, C1.1 |
| leg vide, avec les deux actions | Le tableau | C9.6, C1.1 |
| une personne sans voiture, aucune voiture (bandeau ambre) | Le tableau | C9.1 |
| une voiture sans passager ; une voiture complète | Le tableau | C4.3, C5.1 |
| sa propre voiture : Modifier, Retirer, numéros des passagers | Le tableau | C8.1, C10.1 |
| conducteur sans téléphone, appareil sans personne dans la voiture : aucun numéro | Le tableau | C10.1, C10.2 |
| événement sans retour | Le tableau | C1.4 |
| JavaScript désactivé | Le tableau | C3.4 |
| personnes de l’appareil, les quatre états et leurs actions | Personnes de l’appareil | C2.2, C3.1, C3.2, C3.3, C7.1, C7.2 |
| personnes de l’appareil pas encore chargées, actions inactives | Personnes de l’appareil | C5.9, C1.1 |
| échec du chargement, actions inactives, « Réessayer » | Personnes de l’appareil | — |
| première inscription | Ajouter une personne | C1.2, C1.3, C1.13 |
| inscription avec erreurs | Ajouter une personne | C1.8 |
| stockage indisponible | Ajouter une personne | C1.14 |
| première inscription depuis une place libre | Ajouter une personne | C5.4 |
| modifier une personne | Ajouter une personne | C2.3 |
| feuille avec trois personnes | La feuille | C6.1, C6.2 |
| aucune case cochée | La feuille | C6.2 |
| retour à la liste, nouvelle personne cochée | La feuille | C6.6 |
| plus de cochées que de places | La feuille | C6.3 |
| personne à placer (chemin du conducteur) | La feuille | C6.7, C5.6 |
| ajouter une personne depuis la feuille | La feuille | C6.6 |
| plus assez de places à la validation | La feuille | C6.5 |
| voiture retirée pendant la feuille | La feuille | C6.8 |
| proposer une voiture sans personne sur l’appareil | Proposer une voiture | C4.1 |
| proposer une voiture avec choix du conducteur, onglet Retour | Proposer une voiture | R4, C4.5, C4.6 |
| proposer une voiture, stockage indisponible | Proposer une voiture | C1.14, D5 |
| aucun conducteur choisi ; « Une nouvelle personne » dépliée | Proposer une voiture | C4.7, R4 |
| proposer une voiture avec erreurs | Proposer une voiture | C4.7 |
| conduit à l’aller, cherche une place au retour : onglet Retour, puis un tap | Conduit à l’aller, cherche au retour | C9.3, C5.2, C5.3, C3.5 |
| un tap qui place, message | Un tap | C5.2, C5.3, C9.4 |
| place prise entre-temps | Un tap | C5.7 |
| modifier la voiture | Modifier, retirer | C8.2, C8.3 |
| étape « qui sort » | Modifier, retirer | C8.4 |
| quelqu’un a pris une place pendant l’étape | Modifier, retirer | C8.5 |
| focus après une action qui retire son bouton | Le focus | C3.1, C3.2, C7.1, C7.2, C8.6 |
| confirmation de retrait (2 passagers ; texte à 0) | Modifier, retirer | C8.6, C8.7, C8.8 |
| après la confirmation de retrait | Modifier, retirer | C8.6, C9.4 |
| hors ligne dans une feuille ; hors ligne sur la page | Erreurs et chargement | état « hors ligne » |
| erreur serveur | Erreurs et chargement | état « erreur serveur » |
| 15 voitures, 60 personnes : bas de page avec la barre | Erreurs et chargement | C11.4 |
| pendant l’envoi | Erreurs et chargement | C1.9, C4.8 |
| la page en anglais | En anglais | C11.1 |

Non dessinés, parce qu’ils n’ont pas d’UI propre : la réponse perdue puis renvoyée (C1.12,
C4.10, C5.8 : l’écran est celui de l’envoi, puis celui du succès) ; le jeton qu’aucune
personne ne porte (l’écran d’un appareil sans personne) ; deux personnes de même prénom
(affichées telles quelles, voir « Les éléments »).

## Comportements à retenir

- Le tap sur une place libre suit `tapOutcome` : `wait` → rien ; `register` → la feuille
  « Ajouter une personne » avec `PersonForm.forSeat` ; `place` → placé, barre
  `Seat.placed` ; `sheet` → la feuille des passagers.
- Première inscription par le tap sur une place prise entre-temps : la personne est créée,
  sans voiture sur ce leg ; la feuille se ferme et la barre dit `Seat.seatTaken` (décision
  du coordinateur, #92).
- Après la feuille des passagers : elle se ferme, la barre dit `Seat.placed` (une personne)
  ou `Sheet.placed` (plusieurs, prénoms joints par `format.list`, « Tom et Léa »).
- Refus d’un tap : `Seat.seatTaken` (`notEnoughSeats` ou `seatTaken`), `Actions.rideGone`,
  `Actions.alreadyInCar` avec `count` = 1. Dans la feuille : `Sheet.notEnoughSeats`, avec la
  sélection gardée et `Sheet.remaining` mis à jour ; `Actions.rideGone` avec seulement
  « Fermer » ; `Actions.alreadyInCar` avec `count` = nombre de cochées.
- C8.5, cas inverse : si quelqu’un est sorti et que tout le monde tient dans les nouvelles
  places, la feuille revient au formulaire avec `RideChanges.leaving.changed`, et « Valider »
  applique la réduction directement.
- Retrait confirmé : la carte disparaît, le conducteur passe « Pas concernée » dans la
  section, ses passagers rejoignent « Sans voiture », le bandeau et l’onglet suivent (C8.6,
  C9.4). `RideChanges.remove.notified` n’apparaît que s’il y a au moins un passager.
- Fermer une feuille pendant un envoi n’annule pas l’envoi : le résultat s’applique au
  tableau, un échec arrive dans la barre.
- Hors ligne et erreur serveur : rien ne change, valeurs gardées ; après le retour du
  réseau, la même action aboutit (même identifiant de création, #88).

## Les mots

Espaces de noms : `Board` (#86, complété par #87, #88, #90, #91, #93), `DevicePersons`
(#87, #89), `PersonForm` (#88, #89, #92), `RideForm` (#90, #93), `FormErrors` (#88, #90),
`Sheet` (#91), `Seat` (#92), `RideChanges` (#93), `Actions` (#87, partagé). La colonne
« tâche » dit qui ajoute la clé ; une tâche qui en a besoin avant l’ajoute elle-même. Les
pluriels sont en ICU, l’apostrophe est `’`. Les textes cités par un critère sont repris à
la lettre, sans point final ajouté.

| clé | `messages/fr.json` | `messages/en.json` | source | tâche |
|---|---|---|---|---|
| `Board.banner.everyoneSeated` | Tout le monde a une place | Everyone has a seat | C9.1 (PR #141) | #86 |
| `Board.banner.everyoneSeatedFree` | Tout le monde a une place · {free, plural, one {# place libre} other {# places libres}} | Everyone has a seat · {free, plural, one {# free seat} other {# free seats}} | C9.1 (PR #141) | #86 |
| `Board.banner.enoughSeats` | {withoutCar, plural, other {# sans voiture}} · {free, plural, one {# place libre} other {# places libres}} | {withoutCar, plural, other {# without a car}} · {free, plural, one {# free seat} other {# free seats}} | C9.1 (PR #141) | #86 |
| `Board.banner.missingSeats` | {withoutCar, plural, other {# sans voiture}} · il manque {missing, plural, one {# place} other {# places}} | {withoutCar, plural, other {# without a car}} · {missing, plural, one {# seat missing} other {# seats missing}} | C9.1 (PR #141) | #86 |
| `Board.tabCount` | {count, plural, other {# sans voiture}} | {count, plural, other {# without a car}} | C9.3 (PR #141) | #86 |
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
| `DevicePersons.title` | Personnes de l’appareil | People on this device | C2.2 | #87 |
| `DevicePersons.hint` | Inscrites depuis cet appareil : vous pouvez les modifier. | Signed up from this device: you can change them. | nouveau | #87 |
| `DevicePersons.state.passenger` | Dans la voiture de {driver} | In {driver}’s car | C2.2 | #87 |
| `DevicePersons.state.driver` | Conduit | Driving | C2.2 | #87 |
| `DevicePersons.state.withoutCar` | Sans voiture | Without a car | C2.2, glossaire | #87 |
| `DevicePersons.state.notConcerned` | Pas concernée | Not on this trip | C2.2, glossaire | #87 |
| `DevicePersons.notConcerned` | Pas concernée | Not on this trip | C3.1, C7.2 | #89 |
| `DevicePersons.lookingForSeat` | Je cherche une place | I need a seat | C3.2 | #89 |
| `DevicePersons.leaveCar` | Sortir de la voiture | Leave the car | C7.1 | #89 |
| `DevicePersons.edit` | Modifier | Edit | C2.3 | #89 |
| `DevicePersons.loading` | Chargement de vos inscriptions… | Loading your sign-ups… | nouveau (C5.9) | #87 |
| `DevicePersons.failed` | Vos inscriptions n’ont pas pu être chargées | Your sign-ups could not be loaded | état « échec du chargement » | #87 |
| `DevicePersons.failedBody` | Rien ne peut être ajouté ni modifié tant qu’elles ne sont pas chargées. Vérifiez la connexion, puis réessayez. | Nothing can be added or changed until they are loaded. Check your connection, then try again. | nouveau (v2 : actions inactives) | #87 |
| `DevicePersons.retry` | Réessayer | Try again | état « échec du chargement » | #87 |
| `PersonForm.title.add` | Ajouter une personne | Add a person | R1 | #88 |
| `PersonForm.title.edit` | Modifier {firstName} | Edit {firstName} | nouveau (C2.3) | #89 |
| `PersonForm.remember` | Sans compte ni e-mail : cet appareil s’en souviendra pour cet événement. | No account, no e-mail: this device will remember it for this event. | nouveau (R1) | #88 |
| `PersonForm.forSeat` | Elle prendra une place dans la voiture de {driver}. | They will take a seat in {driver}’s car. | nouveau (C5.4) | #92 |
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
| `RideForm.forLeg.aller` | Pour l’aller seulement : pour le retour, proposez-la aussi sur l’onglet Retour. | For the outbound trip only: for the return, offer it on the Return tab too. | hors périmètre « les deux legs en une fois » | #90 |
| `RideForm.forLeg.retour` | Pour le retour seulement : pour l’aller, proposez-la aussi sur l’onglet Aller. | For the return trip only: for the outbound trip, offer it on the Outbound tab too. | idem | #90 |
| `RideForm.storage.title` | Cet appareil ne pourra pas s’en souvenir | This device will not remember it | C1.14, D5 (v2) | #90 |
| `RideForm.storage.body` | Votre navigateur bloque le stockage : après la fermeture de la page, cette voiture et son conducteur ne pourront plus être modifiés depuis cet appareil. | Your browser blocks storage: once this page is closed, this car and its driver can no longer be changed from this device. | C1.14, D5 (v2) | #90 |
| `RideForm.driver` | Conducteur | Driver | R4 | #90 |
| `RideForm.newDriver` | Une nouvelle personne | Someone new | R4 (« nouvelle personne ») | #90 |
| `RideForm.leavesCar` | Quittera la voiture de {driver} | Will leave {driver}’s car | nouveau (C4.5) | #90 |
| `RideForm.location.aller` | Lieu de départ | Departure place | R4 | #90 |
| `RideForm.location.retour` | Lieu de dépose | Drop-off place | R4, glossaire | #90 |
| `RideForm.time` | Heure de départ | Departure time | R4 | #90 |
| `RideForm.timeHint` | Le {date} | On {date} | nouveau (R4 : « la date est celle du leg ») | #90 |
| `RideForm.seats` | Places, conducteur non compris | Seats, driver not included | R4 | #90 |
| `RideForm.seatsHint` | De 1 à 8. | From 1 to 8. | R4 | #90 |
| `RideForm.note` | Note (facultatif) | Note (optional) | R4 | #90 |
| `RideForm.noteHint` | Ce que les passagers doivent savoir. | What passengers should know. | nouveau | #90 |
| `FormErrors.required` | Champ requis. | Required. | = CreateEvent.errors | #88 |
| `FormErrors.tooLong` | {max} caractères au maximum. | {max} characters at most. | = CreateEvent.errors | #88 |
| `FormErrors.invalidText` | Ce texte contient un caractère non autorisé. | This text contains a character that is not allowed. | = CreateEvent.errors | #88 |
| `FormErrors.invalidPhone` | Numéro non valide : de 6 à 15 chiffres, avec seulement des espaces et + . - ( ) | Not a valid number: 6 to 15 digits, with only spaces and + . - ( ) | R1 | #88 |
| `FormErrors.invalidTime` | Heure non valide. | Not a valid time. | = CreateEvent.errors | #90 |
| `FormErrors.seats` | De 1 à 8 places. | From 1 to 8 seats. | R4 | #90 |
| `FormErrors.chooseDriver` | Choisissez le conducteur. | Choose the driver. | nouveau (R4) | #90 |
| `Sheet.title` | Qui monte dans la voiture de {driver} ? | Who gets in {driver}’s car? | nouveau (R6) | #91 |
| `Sheet.remaining` | {count, plural, =0 {Il ne reste aucune place dans cette voiture} one {Il reste # place dans cette voiture} other {Il reste # places dans cette voiture}} | {count, plural, =0 {No seat left in this car} one {# seat left in this car} other {# seats left in this car}} | C6.3, C6.5 | #91 |
| `Sheet.submit` | {count, plural, =0 {Placer} one {Placer # personne} other {Placer # personnes}} | {count, plural, =0 {Seat} one {Seat # person} other {Seat # people}} | C6.2 | #91 |
| `Sheet.nobody.aller` | Toutes vos personnes sont déjà dans une voiture pour l’aller. | All your people are already in a car for the outbound trip. | C6.7 | #91 |
| `Sheet.nobody.retour` | Toutes vos personnes sont déjà dans une voiture pour le retour. | All your people are already in a car for the return trip. | C6.7 | #91 |
| `Sheet.notEnoughSeats` | Il n’y a plus assez de places : personne n’a été placé. | There are no longer enough seats: nobody was seated. | C6.5 | #91 |
| `Sheet.placed` | {names} sont dans la voiture de {driver} | {names} are in {driver}’s car | nouveau (pluriel de C5.2) | #91 |
| `Seat.placed` | {firstName} est dans la voiture de {driver} | {firstName} is in {driver}’s car | C5.2 | #92 |
| `Seat.seatTaken` | Cette place vient d’être prise | This seat has just been taken | C5.7 | #92 |
| `RideChanges.leaving.title` | Qui sort de la voiture ? | Who leaves the car? | C8.4 | #93 |
| `RideChanges.leaving.body` | {passengers, plural, one {# passager} other {# passagers}} pour {seats, plural, one {# place} other {# places}} : cochez {leaving, plural, one {la personne qui sort} other {les # personnes qui sortent}}. | {passengers, plural, one {# passenger} other {# passengers}} for {seats, plural, one {# seat} other {# seats}}: tick {leaving, plural, one {the person who leaves} other {the # people who leave}}. | C8.4 | #93 |
| `RideChanges.leaving.rule` | Les personnes qui sortent redeviennent sans voiture. | Those who leave are without a car again. | C8.4 | #93 |
| `RideChanges.leaving.count` | {chosen, plural, one {# cochée} other {# cochées}} sur {leaving} | {chosen} of {leaving} ticked | C8.4 | #93 |
| `RideChanges.leaving.changed` | Quelqu’un a pris ou libéré une place entre-temps : rien n’a changé. Choisissez à nouveau parmi les passagers actuels. | Someone took or left a seat in the meantime: nothing has changed. Choose again among the current passengers. | C8.5 | #93 |
| `RideChanges.remove.title` | Retirer la voiture ? | Remove the car? | C8.6 | #93 |
| `RideChanges.remove.body` | {passengers, plural, =0 {Aucun passager ne redeviendra sans voiture.} one {# passager redeviendra sans voiture.} other {# passagers redeviendront sans voiture.}} | {passengers, plural, =0 {No passenger will be left without a car.} one {# passenger will be without a car again.} other {# passengers will be without a car again.}} | C8.6 | #93 |
| `RideChanges.remove.notified` | Personne n’est prévenu : pensez à le leur dire. | Nobody is notified: remember to tell them. | C8.8 | #93 |
| `Actions.submit` | Valider | Confirm | C1.9, C1.10 | #87 |
| `Actions.close` | Fermer | Close | C6.9 ; aussi nom de la croix de la barre du bas | #87 |
| `Actions.cancel` | Annuler | Cancel | C8.7 | #87 |
| `Actions.offline` | Action impossible, vérifiez la connexion | Action failed, check your connection | état « hors ligne » | #87 |
| `Actions.failed` | Une erreur est survenue et rien n’a changé. Réessayez dans un instant. | Something went wrong and nothing has changed. Try again in a moment. | état « erreur serveur » | #87 |
| `Actions.rideGone` | Cette voiture n’est plus proposée | This car is no longer offered | C6.8 | #87 |
| `Actions.alreadyInCar` | {count, plural, one {Cette personne est déjà dans une voiture} other {Une de ces personnes est déjà dans une voiture}} : rien n’a changé. | {count, plural, one {This person is already in a car} other {One of these people is already in a car}}: nothing has changed. | décision « alreadyInCar » de la conception | #87 |

Changements de la table en v2 : `DevicePersons.failedBody` reformulée (elle dit que rien
ne peut être modifié avant le chargement ; en v3, « ajouté ni modifié ») ; `RideForm.storage.title` et
`RideForm.storage.body` ajoutées ; `Actions.close` sert aussi de nom à la croix de la barre.

`Event.legs.*`, `Event.noCar.*`, `Event.nobody`, `CreateEvent.*`, `Admin.*`, `EventNotFound.*`
et `Contact.*` ne changent pas.

### Mots changés par rapport à la PR #141

**Aucun.** Les dix clés `Board.*` de la PR sont gardées telles quelles, en français comme
en anglais : `banner.everyoneSeated`, `banner.everyoneSeatedFree`, `banner.enoughSeats`,
`banner.missingSeats`, `tabCount`, `car.title` (« Voiture de {driver} »), `car.full`,
`car.seats` (« Places »), `car.freeSeat` (« Place libre »), `withoutCar` (« Sans
voiture »). Aucun critère ni le glossaire ne les contredit. La place libre devient un
bouton (#91) : son texte visible reste « Place libre », et C5.1 est tenu par le nom
accessible `Board.car.takeSeat`, qui commence par ce texte.

## Décisions

1. Décision : tous les formulaires s’ouvrent dans la feuille du bas (`Sheet
   side="bottom"`), celle qui sert à choisir les passagers. — Raison : la feuille est déjà
   une décision de l’humain ; un seul motif à apprendre ; le formulaire s’ouvre là où l’on a
   tapé, même sur la 15ᵉ voiture (C5.4, C11.4), et le tableau ne bouge pas.
2. Décision : ordre d’un leg : bandeau, heure, actions, personnes de l’appareil, voitures,
   sans voiture. — Raison : C9.1 (bandeau avant les actions) et C1.1 (actions avant les
   voitures) ; la section de l’appareil juste après les actions, là où l’on agit sur ses
   propres personnes.
3. Décision : « Ajouter une personne » et « Proposer une voiture » l’un sous l’autre, pleine
   largeur, au même poids (`outline`). — Raison : côte à côte à 360 px, « Ajouter une
   personne » ne tient pas sur une ligne ; aucune des deux n’est l’action principale de
   tout le monde ; le bouton plein est réservé à la validation d’un formulaire.
4. Décision : le nom accessible d’une place libre est « Place libre : prendre une place dans
   la voiture de {conducteur} ». — Raison : C5.1 demande le prénom du conducteur ; WCAG
   2.5.3 demande que le nom contienne le texte visible posé par la PR #141.
5. Décision : les messages d’une action faite sur la page arrivent dans une barre fixe en
   bas ; une réussite reste 6 s (`role="status"`), un échec jusqu’à « Fermer », Échap ou
   l’action suivante (`role="alert"`). — Raison : l’action peut venir du bas d’une longue page ; un message en
   tête de leg serait hors de l’écran.
6. Décision : la croix de `sheet.tsx` n’est pas affichée ; chaque feuille a un bouton
   « Fermer » en bas. — Raison : C6.9 nomme « Fermer », et la croix porte « Close » en dur,
   sans traduction.
7. Décision : `Sheet.remaining` est toujours sous le titre de la feuille, en rouge quand il
   y a trop de cochées ou après un refus. — Raison : C6.3 et C6.5 ; savoir combien on peut
   cocher avant de cocher évite l’erreur.
8. Décision : les textes cités par un critère sont repris à la lettre, sans point final
   ajouté ; les phrases nouvelles finissent par un point. — Raison : un test peut comparer au
   critère ; la table reste la référence.
9. Décision : en anglais, « pas concernée » se dit « Not on this trip ». — Raison : « Not
   concerned » est un contresens ; l’anglais existant appelle déjà un leg « trip » (« the
   outbound trip », « the return trip »).
10. Décision : la section s’appelle « Personnes de l’appareil », le nom de C2.2, avec une
    phrase dessous. — Raison : le critère et la conception l’emploient ; un autre nom serait
    un synonyme.
11. Décision : les messages partagés (Valider, Fermer, Annuler, hors ligne, erreur serveur,
    voiture retirée, déjà dans une voiture) vont dans un espace `Actions`, posé par #87 avec
    `runAction` ; les erreurs de champ des nouveaux formulaires dans `FormErrors`, aux mêmes
    mots que `CreateEvent.errors`, qui ne bouge pas. — Raison : un seul endroit par mot
    partagé, et `CreateEvent` reste intact.
12. Décision : un leg vide garde « Personne ne s’est encore inscrit. », même quand une
    personne de l’appareil y est pas concernée. — Raison : C9.6 demande l’état vide de #3 tel
    quel ; la section de l’appareil, juste au-dessus, montre la personne et son état.
13. Décision : sur la confirmation de retrait, « Personne n’est prévenu : pensez à le leur
    dire. » quand il y a des passagers. — Raison : C8.8, aucune notification ; le conducteur
    doit le savoir avant de confirmer.

14. Décision (v2) : tant que les personnes de l’appareil ne sont pas connues (lecture en
    cours ou en échec), les deux actions et les places libres sont inactives. — Raison :
    sinon les formulaires s’ouvrent comme pour un appareil sans personne et créent un
    doublon impossible à relier.
15. Décision (v2) : l’avertissement de stockage indisponible s’affiche dans tout formulaire
    qui crée, personne ou voiture. — Raison : D5 et C1.14 ; un nouveau conducteur tire aussi
    un jeton.
16. Décision (v2) : aucun texte rouge sur un fond teinté de rouge (voir « Contraste »). —
    Raison : WCAG AA, 4,5:1 pour du texte de 14 px.
17. Décision (v2) : la barre du bas a un bouton « Fermer », et la page réserve 112 px en bas
    tant qu’elle est affichée. — Raison : C11.4, toutes les places libres restent
    atteignables, même sous une alerte qui reste.
18. Décision (v2) : après une action qui fait disparaître son propre bouton, le focus va
    au repère du tableau « Le focus après une action ». — Raison : WCAG 2.4.3 ; sinon il
    tombe en haut du document.
19. Décision (v2, précisée en v3) : pas de nouvelle variante dans `button.tsx` ; le rouge
    plein de la confirmation est la `className` d’un `Button` placé sous
    `AlertDialogPrimitive.Action asChild`. — Raison : un seul usage ; une variante de plus
    touche tous les boutons ; et une `className` sur `AlertDialogAction` passerait par Slot,
    qui joint les classes sans `twMerge`.
20. Décision (v3) : une seule barre, dans le DOM juste avant les onglets ; Échap la ferme ;
    sa croix rend le focus au repère de l’action, sinon à l’onglet actif ; une réussite ne
    s’efface pas tant que le focus est dans la barre ; la croix est hors des régions
    vivantes. — Raison : la croix doit être atteignable sans traverser 15 voitures, et ne
    jamais disparaître sous le focus.

## Hors périmètre

Sans UI ici : le lien perso et son QR code, la fraîcheur, supprimer une personne, tout ce
que fait l’organisateur avec son jeton (dont voir tous les numéros, C10.6), les options à
l’écran (C4.9), proposer une voiture sur les deux legs en une fois, changer de voiture en un
geste, faire sortir un passager sans réduire ses places, une liste d’attente, distinguer
deux personnes de même prénom, les notifications.

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
