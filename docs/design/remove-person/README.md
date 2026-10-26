# Retirer une personne

- Artifact : https://claude.ai/artifact/PwTQ8acdEnmage9ChUvFrT
- Epic : https://github.com/olaurendeau/fullcar/issues/645
- Page : `index.html` (autonome ; maquettes à 360 px, et un navigateur de 1280 px à 55 %)
- Version : v2
- Voisines, non republiées :
  - `event-board` v4.4.6 : « Vos inscriptions », la feuille d’une personne, la barre de messages ;
  - `organizer-view` v3.4 (#648) : plus de vignettes, sections de leg repliées ; son designer dessine « Personnes inscrites » repliée, en voisine ;
  - `organizer-account` v4 : l’accès par la règle unique `organiser-access.ts` (#596).
- Cette maquette suppose #581 livrée : il n’y a plus de lien d’organisateur.

## Ce que la page montre

Une personne se retire de l’événement depuis l’appareil qui l’a inscrite : depuis sa feuille, qui s’ouvre sur son prénom dans « Vos inscriptions ». L’organisateur, lui, retire n’importe qui depuis une nouvelle section du panneau, « Personnes inscrites ({count}) ». Cette section est repliée à chaque affichage.

Avant le retrait, une confirmation dit ce qui change, leg par leg. Ensuite, tout ce qui concerne la personne est effacé : prénom, numéro, empreinte du jeton, voitures, places. Ses passagers redeviennent sans voiture sur le leg concerné. Personne n’est prévenu, et rien ne s’annule.

## Réponses du propriétaire (25/10/2026, #645)

- **Q1 = (a)** : pas d’« Annuler », mais une confirmation.
- **Q2 = (a)** : pas de numéro dans « Personnes inscrites » ; la règle DO1 ne change pas.
- **Q3 = (a)** : un appareil qui n’a plus personne garde son jeton.

## Décisions du coordinateur (#648)

« Personnes inscrites » est repliée par défaut, comme les legs de la v3.4 :

- son titre est un bouton de 44 px sur toute la largeur, avec un chevron ;
- le nombre de personnes fait partie du nom du bouton ;
- l’état replié ou déplié est gardé en mémoire seulement.

## Le problème

Aujourd’hui, une Person ne disparaît qu’au jour 30. Pour un doublon, une erreur ou un enfant malade, l’appareil peut au mieux la passer « Ne fait pas » sur les deux legs. Elle reste alors en base, numéro compris, et devient invisible, même pour l’organisateur.

Un conducteur qui ne vient plus doit retirer ses voitures une par une, et son prénom reste. L’organisateur ne peut retirer personne. La base prévoit pourtant l’effacement : `ride_driver_fk` est en cascade et `placement_ride_fk` remet `ride_id` à nul. Mais aucune action ne l’appelle.

## Histoires

- **H1** Un parent retire son enfant (RP1, RP2).
- **H2** Un conducteur se retire en une fois, et ses voitures partent avec lui (RP1.2, RP2.1).
- **H3** L’organisateur voit toutes les personnes, repère un doublon par l’état de chaque leg, et le retire (RP3, RP4).
- **H4** Les autres appareils suivent à la relecture (RP5).
- **H5** Rien ne reste de la personne, ni en base ni dans un journal (RP6).

## L’exemple

Tous les nombres des maquettes viennent d’un seul exemple, publié en tête de page. Huit personnes : Claire, Hugo, Inès, deux Léa (la seconde est le doublon, sans voiture sur les deux legs), Marc, Sophie et Tom.

| leg | avant | sans le doublon | sans Marc |
|---|---|---|---|
| aller | 2 sans voiture, 1 place libre | 1 sans voiture, 1 place libre | 5 sans voiture, 1 place libre |
| retour | 3 sans voiture, 4 places libres | 2 sans voiture, 4 places libres | 3 sans voiture, 5 places libres |

## Ce que devient chaque leg

| sur ce leg, la personne… | effacé | sans voiture | places libres | confirmation |
|---|---|---|---|---|
| conduit, avec P passagers | son Ride | + P | − les libres de sa voiture | `PersonRemoval.drives` |
| conduit, sans passager | son Ride | 0 | − les places de sa voiture | `PersonRemoval.drives` |
| est passagère | son Placement | 0 | + 1 | `PersonRemoval.passenger` |
| est sans voiture | son Placement | − 1 | 0 | rien |
| ne fait pas ce leg | rien | 0 | 0 | rien |

## États couverts

| état | section | critères |
|---|---|---|
| feuille de la personne | 1 | RP1.1 |
| confirmation : une passagère, un conducteur avec passagers, une personne sans voiture sur un seul leg | 2, 3, 4 | RP1.2, RP1.3 |
| hors ligne, confirmation ouverte | 5 | RP1.4, RP1.7 |
| refusé, confirmation ouverte : événement anonymisé, « Fermer » seul | 6 | RP1.7, RP2.9 |
| réussite | 7 | RP1.5 |
| dernière personne de l’appareil | 8 | RP1.6 |
| échec dans la barre | 9 | RP1.7 |
| déjà retirée | 10 | RP1.8, RP2.6 |
| panneau au premier affichage : trois sections repliées | 11 | RP4.1 |
| « Personnes inscrites (8) » dépliée | 12 | RP4.1–RP4.3 |
| confirmation de l’organisateur : le doublon, puis un conducteur, avec l’encadré d’état | 13, 14 | RP4.5 |
| réussite depuis le panneau : résumés de leg et bouton (7) | 15 | RP4.6 |
| refusé, plus d’accès, confirmation ouverte | 16 | RP3.2, RP4.7 |
| « Personnes inscrites (0) », dépliée | 17 | RP4.4 |
| sans retour ; prénom de 40 caractères sans trait d’union | 18 | RP4.2, RP7.1 |
| à partir de 1024 px | 19 | RP4.1 |
| appareil d’une passagère | 20 | RP5.1, RP5.2 |
| appareil de la personne retirée ailleurs | 21 | RP5.3 |
| action sur une personne retirée | 22 | RP5.4 |

## Refus et échecs

La confirmation ouverte prend un problème plus large que `BarProblem`.

- **Hors ligne ou erreur du serveur** : la confirmation dit `Actions.offline` ou `Actions.failed`. Le bouton rouge reste actif et reprend le focus.
- **Refus qu’un nouvel essai ne changerait pas** : la confirmation dit sa raison, le bouton rouge disparaît, et « Annuler » devient « Fermer », qui prend le focus. Les raisons :
  - `forbidden` : `Actions.why.forbidden` ;
  - `noOrganiserAccess` : « L’espace organisateur ne vous est plus ouvert : rechargez la page. » ;
  - `eventEnded` : « Cet événement est terminé : ses inscriptions ont été effacées. » ;
  - `eventNotFound` : `Actions.why.eventNotFound`.
- **Confirmation fermée** : la barre dit « {prénom} fait toujours partie de l’événement. », suivi de la raison.
- **`alreadyRemoved`** est une réussite.

Le serveur contrôle dans cet ordre (RP3.4), et la première réponse qui s’applique gagne :

1. `invalid` ;
2. `eventNotFound` ;
3. `eventEnded` ;
4. le droit : un jeton absent ou mal formé donne `forbidden`, un accès d’organisateur refusé donne `noOrganiserAccess` ;
5. une personne inconnue donne `alreadyRemoved` ;
6. la personne d’un autre jeton donne `forbidden` ;
7. sinon, la personne est retirée.

## Les mots

| clé | FR | EN | où |
|---|---|---|---|
| `DevicePersons.remove` | Retirer de l’événement | Remove from the event | feuille de la personne |
| `PersonRemoval.title` | Retirer {firstName} de l’événement ? | Remove {firstName} from the event? | titre de la confirmation |
| `PersonRemoval.drives` | {leg, select, aller {Sa voiture pour l’aller sera retirée.} other {Sa voiture pour le retour sera retirée.}} {passengers, plural, =0 {} one {# personne redeviendra sans voiture.} other {# personnes redeviendront sans voiture.}} | {leg, select, aller {Their car for the outbound trip will be removed.} other {Their car for the return trip will be removed.}} {passengers, plural, =0 {} one {# passenger will be without a car again.} other {# passengers will be without a car again.}} | une par leg où elle conduit |
| `PersonRemoval.passenger` | {leg, select, aller {Sa place dans la voiture de {driver} à l’aller sera libérée.} other {Sa place dans la voiture de {driver} au retour sera libérée.}} | {leg, select, aller {Their seat in {driver}’s car on the outbound trip will be freed.} other {Their seat in {driver}’s car on the return trip will be freed.}} | une par leg où elle est passagère |
| `PersonRemoval.notified` | {cars, plural, one {Personne n’est prévenu : pensez à le dire aux personnes de cette voiture.} other {Personne n’est prévenu : pensez à le dire aux personnes de ces voitures.}} | {cars, plural, one {Nobody is notified: remember to tell the people in that car.} other {Nobody is notified: remember to tell the people in those cars.}} | appareil, si `cars` ≥ 1 |
| `PersonRemoval.notifiedOrganiser` | Personne n’est prévenu, pas même {firstName}. | Nobody is notified, not even {firstName}. | panneau, toujours |
| `PersonRemoval.erased` | Son prénom, son numéro s’il y en a un et ses inscriptions seront effacés. | Their first name, their number if any, and their sign-ups will be erased. | toujours |
| `PersonRemoval.final` | C’est définitif. | This cannot be undone. | toujours, en dernier |
| `PersonRemoval.confirm` | Retirer de l’événement | Remove from the event | bouton rouge |
| `Actions.cancel`, `Actions.close` (existantes) | Annuler · Fermer | Cancel · Close | « Fermer » après un refus |
| `PersonRemoval.removed` | {firstName} ne fait plus partie de l’événement | {firstName} is no longer part of the event | barre, réussite |
| `PersonRemoval.alreadyRemoved` | {firstName} ne faisait déjà plus partie de l’événement | {firstName} had already been removed from the event | barre, réussite |
| `PersonRemoval.removedElsewhere` | {firstName} ne fait plus partie de vos inscriptions : la personne a été retirée de l’événement depuis un autre appareil. | {firstName} is no longer in your sign-ups: they were removed from the event from another device. | barre, information |
| `Actions.notDone.removePerson` | {firstName} fait toujours partie de l’événement. | {firstName} is still part of the event. | sujet d’un échec |
| `Actions.why.personGone` | {firstName} ne fait plus partie de l’événement. | {firstName} is no longer part of the event. | refus sur une personne retirée |
| `Actions.why.noOrganiserAccess` | L’espace organisateur ne vous est plus ouvert : rechargez la page. | The organiser area is no longer open to you: reload the page. | accès refusé |
| `Actions.why.eventEnded` | Cet événement est terminé : ses inscriptions ont été effacées. | This event is over: its sign-ups have been erased. | toute écriture sur un événement anonymisé |
| `Admin.persons.title` | Personnes inscrites ({count}) | Signed-up people ({count}) | texte et nom du bouton de la section |
| `Event.nobody` (existante) | Personne ne s’est encore inscrit. | Nobody has signed up yet. | contenu déplié à 0 |
| `Admin.persons.hint` | Retirer une personne l’efface de l’événement, avec ses voitures et ses places. Personne n’est prévenu. | Removing a person erases them from the event, with their cars and seats. Nobody is notified. | en tête du contenu déplié |
| `Admin.persons.leg` | {leg} : {state} | {leg}: {state} | liste et encadré de la confirmation ; `{state}` est le texte de la cellule de la matrice |
| `Admin.persons.remove` | Retirer | Remove | bouton d’une ligne |
| `Admin.persons.removeLabel` | Retirer {firstName} de l’événement | Remove {firstName} from the event | nom accessible de ce bouton |

Réutilisées sans changement : `Actions.offline`, `Actions.failed`, `Actions.why.offline`, `Actions.why.failed`, `Actions.why.forbidden`, `Actions.why.eventNotFound`, `Admin.list.more`, `Admin.list.less`, `Event.legs.*`, `DevicePersons.cell.passenger`, `DevicePersons.state.*`.

## Focus, barre, envoi

- **Ouverture** : le focus va sur « Annuler ». « Annuler » ou Échap le ramène sur le bouton qui a ouvert la confirmation.
- **Réussite sur l’appareil** : le focus va sur le prénom suivant, sinon sur le précédent, sinon sur « Ajouter une personne » de l’onglet actif.
- **Réussite dans le panneau** : le focus va sur le prénom de la ligne suivante, sinon sur celui de la précédente, sinon sur le bouton du titre de la section, « Personnes inscrites (0) » (O5.7, amendé par O9.9).
- **Sujet** d’un échec : le retrait de cette personne.
- **Nettoyage de la barre** : une réussite, comme une information `removedElsewhere`, retire les lignes de la barre dont le sujet est cette seule personne. Il s’agit des échecs de « Modifier », d’un choix de cellule, d’un retrait ou de son inscription, et de la réussite d’un placement qui ne nomme qu’elle, avec son « Annuler ».
- **Repère** : sur l’appareil, son prénom, ou « Vos inscriptions » si la section est repliée. Dans le panneau, le « Retirer » de sa ligne, ou le bouton de la section si elle est repliée, ou celui de la carte si le panneau est replié.
- **`removedElsewhere`** : l’information est donnée une fois par personne. Elle n’est jamais donnée pour un retrait envoyé par cette page, ni par un autre onglet du même appareil : celui-ci le signale sans rien stocker, par exemple par un `BroadcastChannel`.
- **Panneau** : « Personnes inscrites » est repliée à chaque affichage, et son état n’est gardé qu’en mémoire. Son bouton est dans le h3, sur toute la largeur, fait 44 px, avec le chevron, `aria-expanded` et `aria-controls`. Le nombre est dans son nom, et la section n’a pas de résumé. Le bouton existe même à 0.
- **Hauteur** : repliée, la section ajoute 49 px au panneau à 360 px (1 px de bordure, 16 px de marge, une rangée de bouton de 32 px avec les marges de la v3.4). Ce nombre est calculé à partir des classes, il n’a pas été mesuré dans un navigateur.

## Critères d’acceptation

Le texte complet est sur la page.

- **RP1.1–RP1.8** Se retirer depuis l’appareil :
  - l’entrée ;
  - la confirmation, au mot près ;
  - « Annuler » sans requête ;
  - un seul envoi ;
  - la réussite ;
  - la dernière personne de l’appareil ;
  - chaque ligne de « Refus et échecs », confirmation ouverte et fermée ;
  - l’idempotence.
- **RP2.1–RP2.9** Ce qui est effacé :
  - les nombres de l’exemple ;
  - un seul leg, aucun leg ;
  - les autres personnes du même jeton ;
  - le tout ou rien ;
  - la concurrence, avec l’ordre de verrouillage Event, puis Rides de la personne, puis Person, et huit cas : prise de place dans sa voiture, prise de place par la personne elle-même (`personGone`, jamais `failed`), `setPersonLeg`, offre de voiture, retrait simultané depuis l’appareil et depuis le panneau, conducteur et passagère retirés ensemble, réduction de places qui choisit une sortante retirée (`passengersChanged`), suppression du retour ;
  - `eventEnded`.
- **RP3.1–RP3.4** Les droits :
  - `devicePersonIds` pour l’appareil ;
  - `organiser-access.ts` seul pour l’organisateur, testé sur la table de cette règle (le navigateur de création d’un événement confirmé est accordé) ;
  - aucun jeton personnel sur le chemin de l’organisateur ;
  - l’ordre des réponses.
- **RP4.1–RP4.7** L’espace organisateur :
  - la section repliée, le nombre dans le nom du bouton ;
  - l’ordre et le contenu des lignes, sans numéro ;
  - les listes longues ;
  - la section à 0 ;
  - l’encadré d’état de la confirmation ;
  - la réussite : (8) → (7), et les résumés de leg à 1 et 1 / 2 et 4 ;
  - les refus.
- **RP5.1–RP5.5** Les autres appareils :
  - la relecture ;
  - le tableau et la Carte ;
  - `removedElsewhere`, sauf pour un retrait envoyé par le même appareil ;
  - `personGone` ;
  - le second navigateur.
- **RP6.1–RP6.3** Confidentialité :
  - aucune table ne contient plus le prénom, le numéro ni l’identifiant ;
  - aucun journal ni Sentry ne les contient ;
  - le stockage du navigateur ne contient aucune donnée de la personne ; la clé du jeton reste, avec la même valeur (Q3 = a).
- **RP7.1–RP7.3** Transverse :
  - captures à 360 px en FR et en EN, prénom « Anastasiamaximiliennebernadettecharlotte » ;
  - i18n et C11.9 ;
  - focus, paires « retire / ne retire pas », nettoyage de la barre.

## Pour l’architecte

- **De `forbidden` à `personGone`.** Avec un jeton bien formé, une personne absente de l’événement donne `personGone`, avec l’état. Sont concernés :
  - `updatePerson` et `setPersonLeg` (`persons.ts`) ;
  - `takeSeats` (`seats.ts`, tout ou rien) ;
  - `offerRide` (`offer-ride.ts`).
- **`undoSeats`** laisse de côté une personne retirée et rend les autres (C7.4). Si plus personne n’est à rendre, la réponse est `Seat.alreadyOut`.
- **`change-ride.ts`** ne change pas : `rideGone`, ou la réussite de C8.6, et `passengersChanged`.
- **Test qui passe à `personGone`** : `persons.test.ts`, « refuses a person id nobody holds, with a token of the event » (vers la ligne 309).
- **Tests qui restent `forbidden`**, car la personne existe sous un autre jeton :
  - `persons.test.ts`, lignes 169, 180 et 252 ;
  - `seats.test.ts`, lignes 195 et 527 ;
  - `actions.test.ts`, lignes 156, 386 et 450 ;
  - `offer-ride.test.ts`, ligne 663 ;
  - `change-ride.test.ts`, lignes 226 et 420.
- **Autres tests** : vérifier un par un ceux qui utilisent un id porté par personne.
- **`failure-words.ts`** gagne `personGone`, `noOrganiserAccess` et `eventEnded`.

## Confidentialité

- **En base** : la ligne `person`, ses Rides et ses Placements sont supprimés dans une seule transaction. Il n’y a pas de corbeille.
- **Le jeton** : seule son empreinte est en base. Elle reste sur les autres personnes du même appareil.
- **L’appareil qui a inscrit la personne** n’a jamais stocké que le jeton. Il le garde quand il n’a plus personne (Q3 = a).
- **Journaux du serveur et Sentry** : ni prénom, ni numéro, ni identifiant, ni jeton.
- **Une limite à dire** : l’historique de restauration de Neon garde une ligne supprimée jusqu’à la fin de sa fenêtre, dont la durée dépend du plan. C’est une question d’hébergement, qui revient au propriétaire ; la page Confidentialité (#612) doit le dire.

## Décisions

1. Decision : « Retirer » partout. — Reason : le mot « Retirer la voiture » existe déjà, et la Suppression désigne un événement entier.
2. Decision : une entrée par chemin. — Reason : la feuille de cellule porte sur un leg, et deux entrées dans le panneau dédoubleraient l’action.
3. Decision : toutes les personnes dans une section à part, repliée à chaque affichage, dont l’état est gardé en mémoire seulement, avec le nombre dans le nom du bouton (coordinateur, #648). — Reason : les personnes en voiture, et celles qui ne font aucun leg, ne sont dans aucune liste de leg. Dépliée par défaut, la liste rendrait au panneau la hauteur que #648 lui a retirée.
4. Decision : le bouton existe même à 0. — Reason : il sert de point de chute au focus quand la dernière ligne part, et la section n’apparaît ni ne disparaît au gré des lectures.
5. Decision : la liste est triée par prénom. — Reason : deux homonymes se retrouvent côte à côte.
6. Decision : la confirmation de l’organisateur montre l’état de la personne sur chaque leg. — Reason : l’organisateur choisit entre deux homonymes ; sur l’appareil, la matrice est juste derrière.
7. Decision : un conducteur emporte toutes ses voitures, et ses passagers redeviennent sans voiture sur ce leg. — Reason : c’est la règle existante, et la base l’applique déjà.
8. Decision : sur l’appareil, la phrase « Personne n’est prévenu » n’apparaît que si une autre voiture change, et elle dit qui prévenir. Ce n’est pas ce que fait « Retirer la voiture », qui la montre toujours. — Reason : retirer une personne sans voiture ne touche aucune voiture, et la phrase n’aurait alors personne à qui le dire.
9. Decision : depuis le panneau, la phrase dit toujours « pas même {prénom} ». — Reason : la personne retirée n’est jamais celle qui agit.
10. Decision : aucune prévenance hors de l’application, et pas de message pour les passagers. — Reason : V1, et « Retirer la voiture » fait de même.
11. Decision : l’information `removedElsewhere` est donnée seulement si la page est ouverte, et jamais pour un retrait envoyé par le même appareil. — Reason : une ligne qui disparaît sans raison passe pour une panne ; un retrait qu’on a fait soi-même n’a rien à expliquer.
12. Decision : après un refus qu’un nouvel essai ne changerait pas, il ne reste que « Fermer ». — Reason : un bouton qui échouera à coup sûr est un piège.
13. Decision : `Actions.why.eventEnded` vaut pour toute écriture sur un événement anonymisé. — Reason : #581 refuse ces écritures sans leur donner de mots, et une seule clé évite qu’une seconde apparaisse.
14. Decision : le retrait est idempotent, et un id inconnu avec un jeton bien formé donne `alreadyRemoved`. — Reason : une réponse perdue puis renvoyée ne doit pas devenir un échec.
15. Decision : les nombres de la confirmation viennent de la page. — Reason : c’est la règle de « Retirer la voiture ».
16. Decision : une nouvelle page. — Reason : l’épique touche deux écrans ; même précédent que `organizer-account`, `home` et `github-link`.

## Hors périmètre

- Prévenir hors de l’application.
- Empêcher une réinscription.
- Retirer plusieurs personnes d’un coup.
- Modifier une personne depuis le panneau.
- Fusionner des doublons.
- Un historique des retraits.
- Les Arrêts (#68) : ceux d’un Ride partent avec lui, et l’arrêt d’un passager part avec son Placement.
- Le lien perso (#67), au-delà de RP5.3.

## Documentation à mettre à jour

Chemins sensibles : la PR est mergée par l’humain.

- `docs/agents/product.md`, « Règles d’interaction », après « Le conducteur réduit ses places » :
  > - **Retirer une personne** : depuis sa feuille, sur l’appareil qui l’a inscrite, ou par l’organisateur depuis son espace, après une confirmation. Tout ce qui la concerne est effacé : prénom, numéro, voitures, places. Ses passagers repassent « sans voiture » sur ce leg. Personne n’est prévenu, et rien ne s’annule.
- `docs/agents/glossary.md`, après « Pas concernée » :
  > | **Retirer une personne** | effacer une Person d’un événement : elle-même depuis l’appareil qui l’a inscrite, ou n’importe qui depuis l’espace organisateur. Ses Rides partent avec elle et leurs passagers redeviennent sans voiture ; ses Placements sont supprimés. Rien n’est gardé. Jamais « supprimer », qui est le mot d’un événement entier. |
- Page Confidentialité (#612) : le retrait efface immédiatement, sauf la fenêtre de restauration de l’hébergeur, à dire avec sa durée.

## Révisions

- **v2** (25/10/2026). La relecture de la v1 demandait des modifications, avec 3 points bloquants, tous corrigés :
  1. les mots des refus quand la confirmation est ouverte (« Refus et échecs », états 6 et 16, `Actions.why.eventEnded`) ;
  2. RP3.2 renvoie à `organiser-access.ts`, sans « en attente » ;
  3. un seul exemple chiffré, et des états 12, 15 et 19 conformes à la table des legs.

  Suggestions appliquées :
  - RP2.8 : ordre de verrouillage et quatre cas nouveaux ;
  - RP3.4 : ordre des réponses ;
  - RP5.3 : même appareil, onglets compris ;
  - RP4.5 : l’encadré d’état ;
  - « seront effacés » ;
  - `noOrganiserAccess` sans réserve ;
  - la phrase « Personne n’est prévenu » expliquée (décision 8) ;
  - un prénom de 40 caractères sans trait d’union ;
  - le nettoyage de la barre ;
  - la liste des refus `forbidden` qui deviennent `personGone`.

  Alignements :
  - sur organizer-view v3.4 (#648) : plus de vignettes, legs repliés ;
  - « Personnes inscrites » repliée à chaque affichage, avec le nombre dans le nom du bouton, même à 0 (décision du coordinateur sur #648) ;
  - les réponses Q1, Q2 et Q3 = (a) sont reportées.

  Publiée à la même adresse (version 2).
- **v1** (25/10/2026) : première version, épique #645.
