# Vue organisateur

- Artifact : https://claude.ai/artifact/6WQ2cPNX5cxh4UAA8hqtJF
- Epic : https://github.com/olaurendeau/fullcar/issues/154 ; v3.4 et v3.5 (replier les legs) : https://github.com/olaurendeau/fullcar/issues/648
- Origine : revue de design de l'humain sur #66 (section « Administrateur (vue globale) »), décision https://github.com/olaurendeau/fullcar/issues/66#issuecomment-6250124984
- Tableau des participants dessiné dessous : #66 v4.1 (`event-board`, approuvée)
- Page : `index.html` (autonome ; maquettes à 360 px de large, et des navigateurs de 1280 px montrés à 75 % et à 55 %)
- Version : v3.5 (à relire ; les legs se replient, [#648](https://github.com/olaurendeau/fullcar/issues/648) ; v3.4 : modifications demandées en revue, réponses du propriétaire Q1 à Q3 = a ; v3.3.9 approuvée en revue de design ; v3.3.9 : M2.8 reformulé, [#442](https://github.com/olaurendeau/fullcar/issues/442) ; v3.3.8 : sept suggestions de la revue de la v3.3.7 appliquées, tri du coordinateur sur #372 ; v3.3.7 : la décision 44 dit l'exception du propriétaire sur #267, et M1.1 et M1.3 sont reformulés après la relecture de PR #376, [#372](https://github.com/olaurendeau/fullcar/issues/372) ; v3.3.6 : approuvée en v3.3.5 ; la ligne « Envoi en cours… » et cinq précisions de test, tri du coordinateur sur #250 ; v3.3.5 : revue de la v3.3.4 appliquée ; v3.3.4 : approuvée en v3.3.3, dix suggestions de la revue appliquées ; v3.3.3 : revue de la v3.3.2 ; v3.3.2 : revue de la v3.3.1 ; v3.3.1 : DE1 et DE2 décidées par le propriétaire le 2026-10-20 ; v3.3 : modifier l'événement ; v3.2.2 : la carte se replie)
- Epic de la v3.3 (modifier l'événement) : https://github.com/olaurendeau/fullcar/issues/250
- Couleurs : remplacées par `visual-identity` v3 (#651). Ce que cette page dessine en `--app-primary` (#171717) est désormais #005a5b, sauf la barre de message réussie, qui reste #171717 ; l’onglet sélectionné, les tuiles teintées et la marque y sont décrits.

## Décisions de l'humain (2026-10-18)

- **DO1 = (a) : visibilité du téléphone.** L'organisateur voit le numéro de chaque personne **sans voiture sur un leg**, pour ce leg seulement. Pour une voiture, il voit seulement si son conducteur a un numéro, jamais ce numéro. Partout ailleurs, tableau sous le panneau compris, la règle d'aujourd'hui (#66 C10.1) reste. `Admin.adminLink.hint` est modifiée.
- **DO2 = (c) : pas de QR code dans cet epic.** Le lien à partager garde la disposition d'aujourd'hui. L'epic #67 (lien perso) aura besoin d'un QR code et décidera comment le produire.

## Décisions du propriétaire (2026-10-20, [#250](https://github.com/olaurendeau/fullcar/issues/250))

- **DE1 = (b) : supprimer un retour qui a des voitures ou des personnes.** C'est permis, après une confirmation qui donne les nombres comptés par le serveur et dit que personne n'est prévenu. Les Rides et les Placements du retour sont supprimés ; les personnes restent.
- **DE2 = (a) : ajouter un retour.** Personne n'y est placé ; chacun déclare lui-même s'il fait le retour.

## Replier les legs (v3.4, revue en v3.5)

Demande du propriétaire (2026-10-25, [#648](https://github.com/olaurendeau/fullcar/issues/648)) : « L'espace organisateur est trop chargé au premier affichage, je pense qu'on devrait replier les résumés "aller" / "retour". » Les « résumés » sont les **sections par leg** (aller, retour) : leur bandeau et leurs deux listes.

**Réponses du propriétaire (25/10/2026, #648), toutes conformes à la recommandation :** Q1 = (a), les vignettes sont retirées ; Q2 = (a), le repli de tout l'espace organisateur (O8) reste ; Q3 = (a), l'état des legs est gardé en mémoire seulement.

**Décision du coordinateur (#648) :** la section « Personnes inscrites » de #645 est elle aussi repliée par défaut, avec un bouton de titre sur toute la largeur, pour ne pas reperdre le gain de #648. Elle vient après les sections des legs (RP4.1). Ses mots, son contenu, son repli et ses critères sont ceux de `remove-person` ; cette page la dessine seulement repliée, à sa place, pour les mesures et l'ordre au clavier.

**Dessiné contre la cible de #581**, et non contre le panneau d'aujourd'hui : la maquette `organizer-account` v4 retire le lien d'organisateur et « Gardez ce lien », met le lien « Mes événements » au-dessus du panneau quand une session est ouverte, et ajoute l'avis « Confirmez votre adresse » pour un événement en attente (OA2.1, OA7.3, OA7.8). Les maquettes des sections plus anciennes de la page montrent encore le lien d'organisateur et les vignettes : pour l'ordre du panneau, cette section et `organizer-account` v4 font foi.

**Un mot.** Le glossaire réserve « Carte » à la carte d'un leg. Cette section dit donc « l'espace organisateur replié (O8) », jamais « la carte », pour le repli de la v3.2.

### Le problème, mesuré

L'organisateur est souvent un parent qui vient d'abord au tableau. À chaque visite, à 360 px, il fait défiler les deux sections, chaque prénom et chaque voiture sans numéro, avant d'atteindre l'en-tête de l'événement et les onglets du tableau. Au premier écran, il ne voit que le lien à partager et le haut de l'aller : avec une session, la section Retour commence à 973 px, sous le pli. Les sections font 68 % de la hauteur du panneau sur l'exemple (474 et 444 px sur 1 349), et 79 % sur l'événement de O5.9 (1 041 et 539 px sur 2 011).

| 360 × 780, premier affichage, espace organisateur déplié | inscrits | panneau | haut des onglets du tableau | écrans de 780 px jusqu'au bas des onglets |
|---|---|---|---|---|
| aujourd'hui (v3.3.9 : lien d'organisateur, « Gardez ce lien ») | exemple | 1 708 px | 1 894 px | 2,5 |
| cible v4, avec une session | exemple | 1 349 px | 1 603 px | 2,1 |
| cible v4, en attente (« Nous avons envoyé un lien… ») | exemple | 1 659 px | 1 845 px | 2,4 |
| cible v4, avec une session | 60 personnes (O5.9) | 2 011 px | 2 265 px | 3,0 |
| cible v4, en attente | 60 personnes (O5.9) | 2 321 px | 2 507 px | 3,3 |
| cible v4, avec une session | événement vide | 773 px | 1 027 px | 1,4 |
| **v3.5, avec une session** | tous | **458 px** | **712 px** | **0,98** |
| **v3.5, en attente** | tous | **768 px** | **954 px** | **1,3** |
| **v3.5 + « Personnes inscrites » repliée (#645), avec une session** | tous | **523 px** | **777 px** | **1,07** |
| **v3.5 + « Personnes inscrites » repliée, en attente** | tous | **833 px** | **1 019 px** | **1,4** |
| avec les vignettes (Q1 = b, écartée), avec une session | exemple, 60 personnes (événement vide : pas de vignettes, 458 px) | 574 px | 828 px | 1,1 |
| espace organisateur replié (v3.2, inchangé), avec une session | tous | 128 px | 382 px | 0,56 |

« Personnes inscrites » repliée ajoute 65 px à 360 px : la bordure, 16 px, la ligne de son bouton (32 px), et les 16 px entre deux sections. Dépliée, elle mesure 546 px (#648).

À 1280 × 800, avec une session : panneau de 756 px et onglets à 994 px sur l'exemple, 1 323 et 1 561 px avec 60 personnes. En v3.5 : 371 et 609 px (411 et 581 px en attente, l'avis prenant la colonne de droite). Avec « Personnes inscrites » repliée, dans la colonne de gauche sous Aller (RP4.1) : 419 et 657 px (459 et 629 px en attente).

**Comment c'est mesuré.** Chrome sans interface, sur les classes de la maquette, qui reprennent celles d'`admin-panel.tsx`, avec la police système de macOS. La page a l'espacement de `page.tsx` (`p-4 gap-6`). Avec une session, le lien « Mes événements » (44 px) est au-dessus du panneau. Entre le panneau et les onglets, il y a l'en-tête de l'événement : titre, lieu, deux dates. L'exemple est celui de la page : à l'aller, 2 sans voiture et une voiture sans numéro ; au retour, 4 sans voiture, et il manque 2 places. « 60 personnes » est l'événement de O5.9, listes arrêtées à 5 lignes. « Personnes inscrites » repliée est dessinée comme une section de leg repliée, sans ligne de résumé, d'après la décision du coordinateur. La police de l'image e2e Linux est plus large : ces nombres donnent un ordre de grandeur, ce ne sont pas des critères. Les critères (O9) disent ce qui ne dépend pas d'une police.

### La proposition

1. **Chaque section de leg est repliée au premier affichage.** Son titre est le bouton qui la déplie.
2. **Repliée, elle montre le nom du leg, puis une ligne : la pastille ambre et les places**, c'est-à-dire les textes de l'ancienne vignette, et ceux du résumé de l'espace organisateur replié (O8.3). Ni date, ni bandeau, ni listes. Sa hauteur ne dépend plus du nombre d'inscrits : 71 px à 360 px.
3. **Dépliée, c'est la section de la v3.1, inchangée** : date, bandeau, « Sans voiture », « Voitures sans numéro », 5 lignes puis « Afficher les {n} autres ».
4. **Les vignettes sont retirées** (Q1 = a) : les sections repliées disent la même chose, à leur place, et elles s'ouvrent. **Ce que ça déplace** : sous 1024 px, la couverture n'est plus en tête du panneau. Elle vient après le lien à partager, l'avis « Confirmez votre adresse » s'il y a lieu, et « Modifier l'événement » : à 360 px, la section Aller commence à 367 px avec une session et à 609 px en attente, là où les vignettes commençaient à 149 et 81 px. Les deux résumés restent dans le premier écran dans les deux cas, et tout le panneau est plus court que les seules sections d'avant.
5. **L'état n'est pas gardé** (Q3 = a) : les legs sont repliés à chaque affichage, et l'écran se souvient seulement, en mémoire, de ceux qu'on a dépliés, à travers les lectures, comme pour les listes (O5.7).
6. **L'espace organisateur entier se replie toujours** (Q2 = a, O8), indépendamment des legs. Une fois les liens envoyés, le replier fait encore remonter les onglets de 712 à 382 px.
7. **Après les legs vient « Personnes inscrites » (#645), repliée elle aussi** (décision du coordinateur). Elle n'est pas un leg : rien de cette section ne la règle, sauf l'ordre au clavier et les mots partagés du focus (O9.2, O9.9).

### Le bouton du leg

- Le h3 de la section contient un `<button type="button">` : le nom du leg (`Event.legs.*`, 16 px, `font-semibold`), puis le chevron, à 4 px du texte. C'est **le même motif que le bouton du titre de l'espace organisateur** (v3.2), dans le même panneau : chevron collé au texte, `ChevronDown` replié, `ChevronUp` déplié (lucide, `size-4`, `text-muted-foreground`, `aria-hidden`), remplacé, jamais tourné.
- Il prend **toute la largeur de la section** (`w-full`) et fait 44 px de haut, avec les marges du bouton du titre de l'espace organisateur : `-my-1.5`, `-ml-2` sur le h3 et `pl-2` sur le bouton. Le même anneau de focus intérieur. Le nom reste aligné sur le reste de la section.
- **Nom accessible** : exactement le nom du leg, « Aller » ou « Retour », dans les deux états. L'état est dit par `aria-expanded`. `aria-controls` désigne le conteneur du contenu de la section (date, bandeau, listes, ou l'état vide du tableau), présent dans le DOM dans les deux états et caché par `hidden` quand la section est repliée.
- **Replié, le bouton est décrit par le résumé** (`aria-describedby`) : un lecteur d'écran qui passe d'un bouton à l'autre entend la couverture sans déplier. Déplié, le bouton n'a pas de description : le bandeau dit la même chose, juste dessous.
- Le h3 perd son `tabIndex={-1}` : c'est le bouton qui reçoit le focus.
- Le résumé n'est **pas dans le bouton**, comme pour l'espace organisateur replié : le nom du bouton ne change pas avec les données, et le résumé disparaît au dépli.

### Replié

- Sous le bouton, à 4 px (le `gap-1` du bloc du titre, où était la date), une ligne `flex flex-wrap items-center gap-x-2 gap-y-0.5`, 13 px, interligne 18 px :
  - si N > 0, la pastille ambre (`Board.tabCount`, `no-car-pill.tsx`) ;
  - les places : `Board.banner.everyoneSeated` (N = 0), `Admin.tile.free` (N > 0 et M ≥ N), ou `Admin.tile.missing` en `font-semibold` (M < N).
  - leg vide : `Event.nobody` en `text-muted-foreground`, sans pastille.
- C'est `LegGlance` sans le nom du leg. Le `textContent` du bouton suivi de celui du résumé est donc exactement celui de la ligne du même leg dans le résumé de l'espace organisateur replié : « Retour4 sans voitureIl manque 2 places ».
- Pas de bouton, pas de lien, pas de région vivante, pas de fond ambre dans le résumé.
- Tout le reste de la section est dans le conteneur `hidden` : ni vu, ni lu, ni atteint au clavier. Il **reste monté** : une liste dépliée par « Afficher les {n} autres » l'est encore quand la section est dépliée de nouveau.
- Une section repliée mesure 71 px à 360 px : la bordure, 16 px, la ligne du bouton (32 px), 4 px, la ligne du résumé (18 px). Le pire cas à deux chiffres (20 sans voiture, il manque 12 places) tient sur une ligne dans la maquette. Avec une police plus large, ou à 125 %, la ligne passe à la ligne, et ce n'est pas un défaut.

### Déplié

- Le résumé disparaît. La date (`LegTime`), le bandeau (`CoverageBanner`, `live={false}`), puis les listes apparaissent, tels que la v3.1 les dessine (O1.1, O1.5, O1.6, O2, O3, O5.6).
- Déplier une section ne change pas l'autre. À partir de 1024 px, déplier Aller ne déplace pas le bouton Retour, qui reste en haut de sa colonne (`items-start`).

### L'état

- Il vit dans l'écran (`screen-state.ts`), comme les listes dépliées (`expanded`, O5.7) : un ensemble de legs dépliés, **vide chaque fois que le panneau apparaît** (première lecture, « Réessayer » qui aboutit, rechargement).
- Il survit à :
  - toutes les lectures : « Actualiser », réussie ou non, et la relecture après une action du tableau ;
  - le retrait du panneau (O1.10) : à la lecture qui le rend, chaque leg revient dans son état ;
  - le repli puis le dépli de l'espace organisateur (O8) ;
  - l'ouverture et la fermeture de « Modifier l'événement ».
- Il est perdu au rechargement, en quittant la page et en fermant l'onglet. Un navigateur qui décharge un onglet resté en arrière-plan (Safari sur iOS) le recharge : les legs sont alors repliés. C'est accepté.
- **Rien n'est écrit** dans `localStorage`, `sessionStorage` ou un cookie. La seule clé du panneau reste `fullcar:organiser-folded:{id}` (O8.5). O2.10 tient sans nouvel amendement.
- Un retour ajouté (M4) arrive replié. Un retour supprimé (M3) emporte son état ; ajouté de nouveau, il arrive replié.
- **La fraîcheur automatique**, quand elle viendra (« la page se recharge quand elle revient au premier plan », #67), devra être une lecture de l'écran, pas un rechargement du document. Sinon, l'organisateur qui revient d'un appel retrouverait le leg qu'il lisait replié.

### Avec l'espace organisateur replié (O8)

- **Les deux replis sont indépendants.** Espace organisateur replié : les sections sont cachées avec le reste (O8.2), et son résumé ne change pas (O8.3). Déplié : chaque section est dans son état.
- Replier ou déplier l'espace organisateur ne change l'état d'aucun leg. Replier ou déplier un leg ne change pas l'état de l'espace organisateur, ni sa clé.
- Un événement qu'on vient de créer arrive avec l'espace organisateur déplié (O8.5) et les legs repliés. Le lien à partager et l'avis « Confirmez votre adresse » sont visibles sans défilement (O4.2, OA2.1).
- **Le repli de l'espace organisateur reste** (Q2 = a) : il cache aussi le lien à partager, l'avis et « Modifier l'événement ». À 360 px avec une session, il fait encore remonter les onglets de 330 px, de 712 à 382 px (395 px avec « Personnes inscrites » repliée, de 777 à 382 px). Le repli des legs s'occupe des listes, celui de l'espace organisateur des liens : un organisateur qui a envoyé ses liens le replie une fois, et l'appareil s'en souvient.

### Avec les autres états

- **Avant le panneau** (chargement, accès refusé, échec et « Réessayer », sans JavaScript) : aucun bouton de leg, aucun résumé. Rien ne change.
- **« Actualiser »** : les legs gardent leur état ; un résumé replié prend les nombres de la nouvelle lecture. Pendant la lecture, rien ne bouge (O1.8).
- **Actualisation impossible** : l'alerte sous la ligne du titre (O5.4) ; les legs gardent leur état et les nombres de la dernière lecture.
- **Panneau retiré** (O1.10) : les sections partent, résumés compris, comme en v3.1 ; la phrase de retrait prend leur place. La lecture qui réussit ensuite les rend dans leur état.
- **Événement vide** : deux sections repliées, « Personne ne s'est encore inscrit. », sans pastille. Dépliée, une section montre l'état vide du tableau (O1.5).
- **Personnes sans voiture, aucune voiture** : la pastille, puis « Il manque N places » en gras ; dépliée, la section de O1.6.
- **Sans retour** : une seule section, et « Retour » n'apparaît nulle part dans le panneau (O1.7).
- **Hors ligne** : déplier et replier ne demandent rien au serveur, et marchent.
- **Texte agrandi à 125 %** : le nom du leg tient sur une ligne ; le résumé peut passer à la ligne.
- **En anglais** : « Outbound », « Return » ; la pastille et les places par l'i18n.

### À partir de 1024 px

- Les sections restent côte à côte (`lg:grid-cols-2`, `items-start`, `gap-6`), sans bordure haute. Repliées, les hauts de leurs boutons sont alignés. Sans retour, la section unique est dans la colonne de gauche.
- Il n'y avait déjà pas de vignettes : seul le repli change.
- « Personnes inscrites » vient sous la rangée Aller | Retour, dans la colonne de gauche (RP4.1).
- La largeur du panneau ne change pas (O7.5).

### Mouvement

Aucune animation, avec ou sans `prefers-reduced-motion` : le contenu apparaît et disparaît d'un coup (`hidden`), le chevron est remplacé, rien ne défile. Comme l'espace organisateur replié, et comme « Vos inscriptions ».

### Sans JavaScript

O5.5 ne change pas. Le HTML de `/admin` ne contient ni bouton de leg, ni résumé.

### Le voisin : « Personnes inscrites » (#645)

`remove-person` v1 met la seule entrée de l'organisateur pour retirer une personne dans une section à part, « Personnes inscrites », après les sections des legs, dans le contenu qui se replie avec l'espace organisateur (décision 2, RP4.1). Elle refuse une seconde entrée dans le panneau. Cette page s'y tient :

- **Les lignes des legs ne changent pas.** « Sans voiture » et « Voitures sans numéro » n'ont aucune action par personne, ni dépliées ni repliées. La v3.4 en laissait une place au bout des lignes ; la v3.5 la retire, avec son cadre pointillé.
- « Personnes inscrites » est **repliée par défaut**, avec un bouton de titre sur toute la largeur (décision du coordinateur). Ses mots, son contenu dépliés, son repli et ses critères sont ceux de `remove-person`, qui les reprend. Cette page la dessine repliée, à sa place, avec son titre de v1, et sans ligne de résumé.
- Ce qui la touche ici :
  - l'ordre au clavier : son bouton suit celui de Retour (O9.2) ;
  - les mots du focus : quand une liste disparaît, le focus va au titre de sa section, c'est-à-dire au bouton de ce titre pour toute section dont le titre est un bouton, legs et « Personnes inscrites » compris (amendement de O5.8) ;
  - les mesures ci-dessus.
- Déplier ou replier un leg ne change pas l'état de « Personnes inscrites », et l'inverse.

### Le focus (v3.5)

| action | focus après | annonce |
|---|---|---|
| le bouton d'un leg (déplier, replier) | reste sur le bouton | `aria-expanded` change ; rien d'autre |
| replier un leg dont le contenu avait le focus (WebKit : un clic ne donne pas le focus au bouton) | le bouton du leg, jamais `<body>` | — |
| une lecture retire la ligne ou le bouton qui a le focus | le titre de la liste ; si la liste a disparu, le titre de sa section, c'est-à-dire **le bouton de ce titre** pour une section dont le titre est un bouton (amendement de O5.8) | — |
| une lecture retire la section Retour, alors que le focus est sur son bouton ou dans son contenu | le bouton d'Aller | — |
| le bouton du titre de l'espace organisateur | inchangé (v3.2) | — |
| « Réessayer » réussi | inchangé : le bouton du titre de l'espace organisateur | — |
| une vignette | retiré (Q1 = a) | — |

Ordre au clavier, espace organisateur déplié : le bouton de son titre, « Actualiser », le lien à partager et ses boutons, l'avis et ses boutons s'il y a lieu, « Modifier l'événement », le bouton d'Aller, le contenu d'Aller s'il est déplié, le bouton de Retour, son contenu, **puis ce qui suit les sections des legs** : le bouton de « Personnes inscrites » une fois #645 livrée, sinon le premier élément après le panneau.

### Les mots (v3.5)

**Aucune clé nouvelle, aucune clé retirée.** Les clés `Admin.tile.*` gardent leur nom sans vignette : elles disent les places du résumé, dans l'espace organisateur replié comme dans un leg replié.

| ce qu'on lit | clé | fr | en | critère |
|---|---|---|---|---|
| le bouton d'un leg | `Event.legs.aller`, `Event.legs.retour` | Aller · Retour | Outbound · Return | O9.1 |
| la pastille (N > 0) | `Board.tabCount` | {count, plural, other {# sans voiture}} | {count, plural, other {# without a car}} | O9.3 |
| les places, N = 0 | `Board.banner.everyoneSeated` | Tout le monde a une place | Everyone has a seat | O9.3 |
| les places, M ≥ N | `Admin.tile.free` | {free, plural, one {# place libre} other {# places libres}} | {free, plural, one {# free seat} other {# free seats}} | O9.3 |
| les places, M < N, en gras | `Admin.tile.missing` | Il manque {missing, plural, one {# place} other {# places}} | {missing, plural, one {# seat missing} other {# seats missing}} | O9.3 |
| leg vide | `Event.nobody` | Personne ne s’est encore inscrit. | Nobody has signed up yet. | O9.3 |

Exemples, mot pour mot :

- « Aller » puis « 2 sans voiture » et « 3 places libres » ; « Retour » puis « 4 sans voiture » et « Il manque 2 places » ; « Return » puis « 4 without a car » et « 2 seats missing ».
- Au singulier : « 1 sans voiture » et « 1 place libre » ; « 1 sans voiture » et « Il manque 1 place » ; « 1 without a car », « 1 free seat », « 1 seat missing ».

Le dépli montre les mots de la v3.1, inchangés. « Personnes inscrites ({count}) » est le titre de #645 (`Admin.persons.title`), défini par `remove-person`.

### Critères v3.5, à reporter dans l'epic

**O9 — Les legs repliés au premier affichage**

*En tant qu'organisateur, j'ouvre l'espace organisateur et je vois d'un coup d'œil, pour chaque leg, si quelqu'un est sans voiture et s'il manque des places, sans faire défiler les prénoms ; je déplie un leg quand je veux appeler quelqu'un.*

Chaque critère est prouvé par un test Playwright à 360 × 780 et à 1280 × 800, ou Vitest, sauf mention contraire. « Le panneau » est celui de la cible de #581 (session de l'organisateur, ou navigateur de création d'un événement en attente).

- **O9.1** Le h3 de chaque section de leg contient un `<button type="button">` dont le nom accessible est exactement le nom du leg (« Aller », « Retour » ; « Outbound », « Return »), dans les deux états.
  - Il porte `aria-expanded` (`false` replié, `true` déplié) et `aria-controls`, qui désigne un élément présent dans les deux états et qui contient la date, le bandeau et les listes, ou l'état vide du tableau.
  - Il contient le texte, puis l'icône `ChevronDown` replié ou `ChevronUp` déplié (`aria-hidden`).
  - Il fait au moins 44 px de haut, et son bord droit est celui du contenu de la section (±1 px).
  - Son anneau de focus est celui du bouton du titre de l'espace organisateur, prouvé de la même façon (O8.1).
  - Le h3 n'a pas de `tabIndex`.
  - Test, sans mesure liée à une police : à 360 × 780, en français et en anglais, puis avec `font-size: 125%` sur la racine, le nom du leg tient sur une ligne (`Range.getClientRects()` de son nœud texte rend un seul rectangle), le bouton ne coupe pas son texte (`scrollWidth ≤ clientWidth`), et la page n'a pas de débordement horizontal.
- **O9.2** Chaque fois que le panneau apparaît (première lecture, « Réessayer » qui aboutit, rechargement), **toutes les sections de leg sont repliées** (`aria-expanded="false"`), quel que soit l'état gardé de l'espace organisateur replié (O8.5), y compris à l'arrivée après la création.
  - Repliée, la section n'affiche que son bouton et son résumé. La date, le bandeau, la phrase « Aucune voiture proposée… », les listes, leurs lignes et leurs boutons sont `toBeHidden()` et absents de l'arbre d'accessibilité. Aucun lien `tel:` du panneau n'est visible.
  - Au clavier, Tab depuis le bouton d'Aller va au bouton de Retour, puis au premier élément focusable qui suit les sections des legs.
  - La hauteur d'une section repliée ne dépend pas du nombre de lignes de ses listes : à 360 px, à forme de résumé égale, elle est la même (±1 px) avec 2 et avec 14 personnes sans voiture, et avec 1 et 6 voitures sans numéro.
- **O9.3** Repliée, une section de leg montre sous son bouton une ligne, le **résumé** : la pastille ambre `Board.tabCount` si N > 0, puis les places (`Board.banner.everyoneSeated` si N = 0, `Admin.tile.free` si M ≥ N, `Admin.tile.missing` en gras si M < N). Leg vide : « Personne ne s'est encore inscrit. », en `text-muted-foreground`, sans pastille.
  - Test : pour chaque leg, le `textContent` du bouton suivi de celui du résumé est égal au `textContent` de la ligne du même leg dans le résumé de l'espace organisateur replié (O8.3).
  - Mot pour mot, en français puis en anglais : N = 1 et M = 1 : « 1 sans voiture », « 1 place libre » (« 1 without a car », « 1 free seat ») ; N = 1 et M = 0 : « 1 sans voiture », « Il manque 1 place » (« 1 seat missing ») ; N = 2 et M = 3 : « 2 sans voiture », « 3 places libres » ; N = 4 et M = 2 : « 4 sans voiture », « Il manque 2 places » (« 2 seats missing ») ; N = 0 : « Tout le monde a une place », sans pastille.
  - Repliée, le bouton a pour description accessible le texte du résumé (`aria-describedby`) : elle contient le texte de la pastille, puis celui des places. Dépliée, il n'a pas de description.
  - Le fond calculé de la pastille est celui de la pastille de l'onglet du tableau. Aucun élément du résumé n'a de fond ambre. Le résumé n'a ni bouton, ni lien, ni `role="status"`.
  - Dépliée, le résumé n'est plus visible ; la date et le bandeau le sont, et le bandeau a exactement le texte du bandeau du même leg dans le tableau (O1.1).
  - Test, sans mesure liée à une police : avec 20 sans voiture et 12 places manquantes, à 360 px, puis avec `font-size: 125%` sur la racine, les boîtes de la pastille et des places ne se chevauchent pas, aucune ne coupe son texte, aucune ne dépasse le bord droit de la section, et la page n'a pas de débordement horizontal. La ligne peut passer à la ligne.
- **O9.4** Un clic, Entrée ou Espace sur le bouton d'un leg déplie ou replie **sa** section, sans requête réseau, et le focus reste sur le bouton.
  - La `boundingBox` du bouton est identique avant et après (±1 px), page en haut comme défilée, à 360 et à 1280 px.
  - L'autre section de leg ne change pas d'état, ni « Personnes inscrites » quand elle existe. À 1280 px, déplier Aller ne déplace pas le bouton de Retour (±1 px).
  - Juste après le clic, `getAnimations({ subtree: true })` de la section est vide, et `window.scrollY` n'a pas changé, avec `reducedMotion` émulé à `reduce` comme à `no-preference`.
  - `page.url()` ne change pas, et un écouteur `hashchange` injecté ne se déclenche pas (O6.3).
  - Une liste dépliée par « Afficher les {n} autres » l'est encore après un repli puis un dépli de sa section.
  - Basculer pendant une lecture n'envoie ni n'annule aucune requête. Hors ligne (`setOffline`), déplier et replier marchent.
- **O9.5** L'état des legs est gardé **en mémoire seulement** (Q3 = a).
  - Un leg déplié le reste après : « Actualiser », réussi ou impossible ; la relecture après une action du tableau ; le retrait du panneau (O1.10) puis la lecture qui le rend ; le repli puis le dépli de l'espace organisateur (O8) ; l'ouverture puis la fermeture de « Modifier l'événement ». Test à deux contextes : l'organisateur déplie Retour, le contexte 2 déclare une personne sans voiture au retour, l'organisateur touche « Actualiser » : Retour est toujours déplié, et le prénom est dans sa liste.
  - Après un rechargement, toutes les sections de leg sont repliées.
  - Les clés de `localStorage` et de `sessionStorage`, et les cookies de l'origine, sont les mêmes avant et après avoir déplié et replié les deux legs.
  - Un retour ajouté par « Modifier l'événement » (M4) arrive replié ; supprimé (M3), puis ajouté de nouveau, aussi.
- **O9.6** Avec l'espace organisateur replié (O8).
  - Espace organisateur replié : les sections sont cachées avec le reste du contenu (O8.2), et son résumé est celui de O8.3.
  - Replier puis déplier l'espace organisateur rend chaque section de leg dans l'état qu'elle avait. Le replier ou le déplier ne change aucun `aria-expanded` de leg ; replier ou déplier un leg ne change ni l'`aria-expanded` du bouton du titre de l'espace organisateur, ni `fullcar:organiser-folded:{id}`.
  - Un événement qu'on vient de créer arrive espace organisateur déplié et legs repliés. À 360 × 780, le lien à partager et, en attente, l'avis « Confirmez votre adresse » sont visibles sans défilement (O4.2, OA2.1).
- **O9.7** Le panneau n'a plus de vignettes (Q1 = a). Sous 1024 px, il montre dans l'ordre : la ligne du titre, la région `alert` (O5.4), le lien à partager, l'avis « Confirmez votre adresse » s'il y a lieu (OA2.1), « Modifier l'événement », puis les sections des legs, Aller d'abord. Ce qui suit les sections des legs (« Personnes inscrites », #645, RP4.1) n'est pas réglé ici. Test : dans le panneau, un seul bouton a un nom qui commence par « Aller », celui du titre de la section (une vignette s'appelait « Aller 2 sans voiture 3 places libres »).

  Ce que la maquette mesure, sans que ce soit un critère : onglets du tableau à 712 px avec une session, 954 px en attente (777 et 1 019 px avec « Personnes inscrites » repliée), au lieu de 1 603 et 1 845 px.
- **O9.8** À 1280 × 800, les sections de leg sont côte à côte, Aller à gauche. Repliées, les hauts de leurs boutons sont alignés (±1 px). Sans retour, la section est dans la colonne de gauche. La largeur du panneau est la même, legs repliés ou dépliés.
- **O9.9** Le focus, prouvé au clavier ligne par ligne :
  - une lecture retire la ligne ou le bouton « Afficher… » qui avait le focus, dans une section de leg, et la liste a disparu : le focus va sur le bouton du titre de cette section ;
  - une lecture retire la section Retour alors que le focus était sur son bouton ou dans son contenu : le focus va sur le bouton d'Aller ;
  - replier une section dont le contenu avait le focus le met sur le bouton du leg, jamais sur `<body>`. Test dans WebKit, lancé depuis le test comme dans `e2e/create-event.spec.ts` (`playwright.webkit.launch`, où un clic ne donne pas le focus à un bouton) : focus sur un lien `tel:` de Retour, clic sur le bouton de Retour, `document.activeElement` est ce bouton.
- **O9.10** Sans JavaScript, O5.5 tient, et le HTML de `/admin` ne contient ni bouton de leg, ni résumé.

**Amendements (Q1 = a)**

- **O1.3** : « Une rangée de vignettes… placée en tête du panneau… », et la phrase sur leur absence, sont retirées. « Sous 1024 px, les sections sont l'une sous l'autre, Aller d'abord, repliées au premier affichage (O9) ». La phrase sur l'ambre reste : elle vaut pour le résumé.
- **O1.4** : retiré, remplacé par O9.1 et O9.4.
- **O1.5** : « la vignette de ce leg affiche… » devient « sa section repliée affiche, après son nom, « Personne ne s'est encore inscrit. », en `text-muted-foreground`, sans pastille (O9.3) ». L'état vide du tableau se lit une fois la section dépliée.
- **O1.7** : « une seule vignette sur toute la largeur » est retiré.
- **O1.10** : « le panneau **retire** ses vignettes et ses sections » devient « le panneau **retire** ses sections ».
- **O4.1** : « Sous 1024 px, les vignettes (O1.3) les précèdent » est retiré.
- **O4.2** : « vignettes comprises » est retiré.
- **O5.8** : la ligne « une vignette » est retirée.
- **O6.3** : « Les vignettes (O1.4) font défiler par script » devient « Les boutons des legs (O9.4) ne touchent pas à l'URL ».
- **O7.2** : captures en plus, à 360 et à 1280 px : legs repliés (exemple, événement vide, sans retour, en attente) ; Aller déplié ; 60 personnes, Retour déplié ; et, à 360 px avec `font-size: 125%`, le pire cas du résumé (O9.3).
- **O7.4** : « Vignettes » devient « boutons des legs ».
- **O8.1** : `aria-controls` « désigne un élément… qui contient les vignettes, les deux liens, l'avertissement et les sections » devient « … qui contient le lien à partager, l'avis « Confirmez votre adresse » s'il y a lieu, « Modifier l'événement » et les sections » (avec #581).
- **O8.2** : « Les vignettes » est retiré de la liste de ce qui est caché.
- **O8.3** : « Chaque ligne a les textes de la vignette de ce leg » devient « … de la section repliée de ce leg (O9.3) ». Le test compare la ligne au bouton et au résumé de la section.
- **#154, « États à concevoir »** :
  - « relecture du panneau impossible après une action » : « vignettes et sections retirées » devient « sections retirées » ;
  - « événement vide (arrivée après la création) » : « pas de vignettes, sections vides » devient « sections repliées, « Personne ne s'est encore inscrit. » » ;
  - « un leg vide à côté d'un leg rempli » : « vignette neutre » devient « résumé replié neutre » ;
  - « sans retour » : « une section, une vignette, aucun « Retour » » devient « une section, aucun « Retour » ».

**Amendements (tous)**

- **O1.1, O1.6, O2.2 à O2.5, O3.1 à O3.3, O5.6, O5.7, O5.9, O7.3** : ce qu'ils décrivent se lit une fois la section dépliée. Leurs tests déplient d'abord la section du leg. Les tests de O1.8 (« la personne apparaît dans le panneau ») et de O1.10 (« son prénom apparaît dans la liste « Sans voiture » des deux sections ») déplient d'abord les sections dont ils lisent les listes.
- **O5.8** : dans la ligne « une lecture retire le bouton ou la ligne qui a le focus », « si la liste a disparu, le titre de la section du leg » devient « si la liste a disparu, le titre de sa section : le bouton de ce titre, pour une section dont le titre est un bouton (les legs, O9.1 ; « Personnes inscrites », #645) ».

### Effet sur les tâches

- **Une tâche** pour le repli des legs : `organiser-leg.tsx` (le bouton, le résumé, le conteneur `hidden`), `screen-state.ts` (l'ensemble des legs dépliés, en mémoire, comme `expanded`), `admin-panel.tsx` (le retrait d'`OrganiserTiles`), `organiser-tiles.tsx` (`LegGlance` reste, et le résumé du leg l'utilise sans le nom), un spec e2e O9, et les specs existants du panneau, qui déplient d'abord le leg qu'ils lisent.
- **Ni base, ni serveur, ni stockage, ni clé de traduction.** Pas de chemin sensible attendu.
- **Ordre** : après la tâche de #581 qui retire le lien d'organisateur et « Gardez ce lien » du panneau, pour ne pas modifier `admin-panel.tsx` en même temps qu'elle. Le repli ne dépend d'aucune autre tâche de #581.
- **Avec #645** : « Personnes inscrites » vient après les sections des legs. Si sa tâche passe avant celle-ci, O9.2 s'arrête quand même aux sections des legs ; si elle passe après, elle reprend le motif du bouton de leg pour son titre.

### Réponses du propriétaire (v3.4)

Toutes conformes à la recommandation, le 25/10/2026 sur #648.

1. **Q1 — Les vignettes, sous 1024 px : (a) retirées.** Les legs repliés disent la même chose, à leur place. Le panneau perd 116 px, et le résumé n'apparaît qu'une fois. La couverture passe du haut du panneau à après le lien, l'avis et « Modifier l'événement » (voir « La proposition », point 4). Option écartée : (b), les garder, un tap dépliant le leg.
2. **Q2 — Le repli de tout l'espace organisateur : (a) gardé tel quel** (v3.2, O8). Option écartée : (b), le retirer.
3. **Q3 — Garder l'état des legs d'une visite à l'autre : (a) non**, en mémoire seulement. Option écartée : (b), une clé `localStorage` par événement.

### Décisions (v3.4, v3.5)

Ajoutées à la liste « Décisions », à la suite de la 52.

53. (v3.4) Decision : le résumé d'un leg replié est la pastille et les places, sans date et sans le nombre de voitures sans numéro. — Reason : la couverture est « la seule métrique que l'organisateur regarde » (glossaire). La date est dans l'en-tête de l'événement. Une ligne de plus par leg ramènerait ce que la demande retire.
54. (v3.4) Decision : le bouton d'un leg suit le motif du bouton du titre de l'espace organisateur (bouton dans le titre, chevron collé, toute la largeur, anneau intérieur), et le résumé, hors du bouton, le décrit par `aria-describedby` tant qu'il est replié. — Reason : même panneau, même geste. Un nom qui ne change pas avec les données, et un lecteur d'écran qui entend la couverture sans déplier.
55. (v3.4) Decision : les legs sont toujours repliés au premier affichage, même celui où il manque des places. — Reason : un affichage qui dépend des données changerait de forme d'une visite à l'autre. Le résumé replié dit déjà le manque, en gras, avec la pastille.
56. (v3.4) Decision : aucune clé nouvelle ; les clés `Admin.tile.*` gardent leur nom. — Reason : renommer une clé change les deux fichiers de traduction sans changer un mot.
57. (v3.4) Decision : si la section Retour disparaît alors qu'elle avait le focus, le focus va sur le bouton d'Aller. — Reason : c'est l'élément le plus proche de là où était l'organisateur. Le h1 de l'événement, que la v3.3 donne au participant, est sous le panneau.
58. (v3.4) Decision : après le retrait du panneau (O1.10), chaque leg revient dans l'état où il était. — Reason : l'état appartient à l'écran, comme celui des listes (O5.7), et non aux sections, qui sont retirées puis rendues.
59. (v3.5) Decision : aucune action par personne dans les lignes des legs ; l'entrée pour retirer une personne est la section « Personnes inscrites » de #645. — Reason : `remove-person` v1 (décision 2, RP4.1) n'en veut qu'une dans le panneau ; la place dessinée en v3.4, en pointillé, se lisait comme une chose à construire.
60. (v3.5) Decision : la règle de focus « le titre de sa section » se lit « le bouton de ce titre » pour toute section dont le titre est un bouton, legs et « Personnes inscrites ». — Reason : une seule règle pour les sections repliables du panneau, quelle que soit l'épique qui les ajoute.

### Hors périmètre (v3.4, v3.5)

- La suppression d'un participant, et le contenu, les mots et le repli de « Personnes inscrites » (#645, `remove-person`).
- Une action par personne dans les lignes des legs.
- Replier séparément le lien à partager, l'avis « Confirmez votre adresse » ou « Modifier l'événement ».
- Replier les legs du tableau des participants, ou « Vos inscriptions ».
- Un bouton « Tout déplier ».
- Déplier d'office un leg selon ses données.
- Garder l'état des legs d'une visite à l'autre, ou le synchroniser entre onglets ou appareils.
- Le nombre de voitures sans numéro dans le résumé replié.
- Changer les listes de 5 lignes.

## Ce que la page montre

L'espace organisateur de `/e/{id}/admin#{jeton}`, au-dessus de l'en-tête de l'événement et du tableau des participants (#66 v4.1, inchangé, C11.7).

### Ordre sous 1024 px

1. « Espace organisateur » (h2) et « Actualiser » (`outline`, 44 px), sur une même ligne. **v3.2** : le h2 contient le bouton qui replie la carte (voir « Replier la carte »), et c'est ce bouton qui reçoit le focus après « Réessayer » ; le h2 n'a plus `tabIndex={-1}`.
2. **Vignettes** (retirées en v3.4, Q1 = a, voir « Replier les legs »), une par leg, en grille de deux colonnes même à 360 px. Absentes tant qu'aucun leg n'a ni voiture ni personne ; sans retour, une seule, sur toute la largeur. Voir « Les vignettes ».
3. **Lien à partager** : libellé, phrase, le lien, puis « Copier » et « Partager » (inchangés).
4. Lien d'organisateur, puis « Gardez ce lien » (inchangés). La phrase du lien d'organisateur change (`Admin.adminLink.hint`, DO1).
5. **Une section par leg** (h3), séparée par une bordure haute, repliée au premier affichage depuis la v3.4 (O9) :
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
  - Pendant la lecture, le libellé ne change pas, l'icône tourne (`animate-spin`), et le bouton est `aria-disabled="true"` : il n'est **pas** `disabled`, il garde donc le focus, et un nouveau toucher est ignoré. La région `status` masquée dit `Admin.refreshing`. Rien ne bouge : la boîte d'« Actualiser » et la hauteur de la ligne du titre sont les mêmes avant et pendant la lecture. La ligne mesure 32 px quand elle tient sur une ligne ; elle peut passer à la ligne (texte agrandi, police plus large : v3.2, O8.1).
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

## Replier la carte (v3.2)

Demande de l'humain (2026-10-19) : « "Organiser area" rend la card repliable ». Cadrage de l'humain : dépliée à la première visite, puis l'état est gardé sur l'appareil ; repliée, la carte montre le titre, le bouton qui déplie et une ligne par leg, avec la pastille ambre de la v4.1.

**Le problème.** L'organisateur est souvent aussi un parent qui utilise le tableau. À chaque visite, à 360 px, le panneau (vignettes, deux liens, avertissement, deux sections avec leurs listes) repousse l'en-tête de l'événement et le tableau de plusieurs écrans (O5.9). Une fois les liens envoyés, il fait défiler tout cela à chaque fois. Replié, le panneau mesure 128 px dans la maquette à 360 × 780, et les onglets du tableau finissent à 344 px.

### Le bouton

- Le h2 contient un `<button type="button">` : « Espace organisateur » (`Admin.title`), puis le chevron, à 4 px du texte.
- **Même motif que « Vos inscriptions », mais pas la même place du chevron.** Comme `device-persons.tsx` (#66) : le titre est le bouton, dans le titre, avec `aria-expanded` et un contenu `hidden`. Mais là-bas, le chevron est au bout de la ligne ; ici, il est **collé au titre**, parce que le bout de la ligne est « Actualiser ». Les deux cartes sont sur le même écran avec cette différence voulue : ne pas les aligner plus tard (décision 19).
- Chevron : `ChevronUp` déplié, `ChevronDown` replié (lucide), `size-4`, `text-muted-foreground`, `aria-hidden`. Il est remplacé, il ne tourne pas.
- **La ligne du titre** : `flex flex-wrap items-center gap-x-0 gap-y-3`.
  - Le **h2** est l'élément `flex-auto min-w-0` de la ligne, **pas `flex-1`**. `flex-1` part d'une largeur nulle : « Actualiser » resterait alors sur la ligne, et le titre passerait à la ligne dans le bouton (vérifié par la revue dans Chrome, à 125 %, sur 294 px). Le h2 a aussi `-ml-2`, et le bouton `pl-2` (voir l'anneau de focus). Le **bouton** y est en `w-full` : il va du bord gauche du contenu du panneau jusqu'à « Actualiser », **sans espace entre les deux**. Il fait 44 px de haut, avec la même marge négative qu'« Actualiser » (`-my-1.5`).
  - **« Actualiser »** est en `ml-auto` : il est à droite, que la ligne tienne ou non.
  - **Quand la ligne tient**, elle mesure 32 px. Dans la maquette (police système de macOS), à 360 px, le bouton a 180 px pour 175 px de contenu, et « Actualiser » 114 px (environ 108 px avec le bouton outline de shadcn).
  - **Quand elle ne tient pas** (texte agrandi, ou police plus large, comme celle de l'image e2e Linux, probablement DejaVu Sans : il faudrait environ 316 px pour 294 px disponibles), « Actualiser » passe sous le bouton, **à droite**. Entre les rangées, `gap-y-3`, soit 0,75 rem : 12 px à 100 %, et plus quand le texte grandit (15 px à 125 %). Il vaut les deux marges `-my-1.5`, donc les cibles `h-11` se touchent sans se chevaucher, à toute taille de texte. Le titre lui-même reste sur une ligne. Rien n'est coupé, rien ne dépasse. Cet état est dessiné (« Texte agrandi à 125 % »).
  - **Un toucher juste à gauche d'« Actualiser » replie la carte**, puisque le bouton va jusqu'à lui. C'est voulu (décision 26) : 8 px d'écart feraient passer « Actualiser » à la ligne sur les téléphones les plus étroits. Le geste raté ne coûte rien : la carte se replie sur place, sans requête, rien n'est perdu (le contenu reste monté), le focus reste sur le bouton, et le même toucher la déplie. La bordure d'« Actualiser » montre où il commence.
- **Anneau de focus intérieur** : `rounded-lg focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50`. Il n'y a pas d'espace entre le bouton et « Actualiser », donc l'anneau extérieur de « Vos inscriptions » recouvrirait « Actualiser ».
  - Pour que l'anneau ne touche pas le texte, le h2 déborde de 8 px dans la marge du panneau (`-ml-2`), et le bouton a `pl-2`. Le titre reste ainsi aligné sur le reste du panneau.
  - C'est dessiné sur les trois états où le bouton a le focus.
- Nom accessible : « Espace organisateur » dans les deux états. L'état est dit par `aria-expanded`. `aria-controls` désigne le conteneur du contenu repliable, présent dans le DOM dans les deux états.
- Le résumé n'est **pas** dans le bouton, contrairement à « Vos inscriptions » : il a deux lignes à pastilles, et il disparaît au dépli.

### Replié : ce qui reste, ce qui est caché

Dans l'ordre :

1. la ligne du titre : le bouton, « Actualiser », la région `status` masquée ;
2. la région `alert` (O5.4), vide sauf en cas d'échec ;
3. le résumé, ou la phrase de retrait `Admin.stale` (O1.10).

Le reste est dans un conteneur caché par l'attribut `hidden` : il n'est ni vu, ni lu, ni atteint au clavier. Ce reste, ce sont les vignettes, le lien à partager avec « Copier » et « Partager », le lien d'organisateur avec « Copier », « Gardez ce lien » et les sections. Le conteneur **reste monté** : une liste dépliée par « Afficher les {n} autres » l'est encore quand la carte est dépliée de nouveau.

Les vignettes sont dans ce conteneur. Une vignette ne peut donc jamais viser une section cachée : la question du défilement vers une section repliée ne se pose pas.

### Le résumé

- Une `<ul>`, une `<li>` par leg, dans l'ordre de `eventLegs`, sous la ligne du titre (et sous l'alerte quand elle a un texte). Gap de 6 px entre les lignes, 16 px au-dessus (le `gap-4` du panneau).
- Une ligne contient les textes de la vignette du même leg, dans le même ordre, sur une ligne qui passe à la ligne si elle n'a pas la place (`flex-wrap`, `gap-x-2`) :
  - le nom du leg (`Event.legs.*`), 14 px, `font-semibold` ;
  - si N > 0, la pastille ambre (`Board.tabCount`, `no-car-pill.tsx` de #180) ;
  - les places, 13 px : `Board.banner.everyoneSeated` (N = 0), `Admin.tile.free` (N > 0 et M ≥ N), ou `Admin.tile.missing` en `font-semibold` (M < N).
- Les cas :
  - **N = 0** : le nom, puis « Tout le monde a une place », sans pastille ;
  - **leg vide** : le nom, puis `Event.nobody` en `text-muted-foreground`, sans pastille ;
  - **événement vide** (aucune vignette déplié) : deux lignes `Event.nobody` ;
  - **personnes sans voiture, aucune voiture** : la pastille, puis « Il manque N places » ;
  - **sans retour** : une seule ligne, et « Retour » n'apparaît nulle part dans le panneau.
- **Aucun caractère séparateur**, pas plus que dans la vignette : le nom, la pastille et les places sont trois éléments séparés par `gap-x-2` (et `gap-y-0.5` quand la ligne passe à la ligne). Le `textContent` d'une ligne est donc « Retour20 sans voitureIl manque 12 places », exactement celui de la vignette.
- Le pire cas à deux chiffres (Retour, 20 sans voiture, il manque 12 places) tient sur une ligne dans la maquette (police de macOS). Avec une police plus large (l'image e2e Linux : environ 327 à 331 px pour 294 px), la ligne passe à la ligne, et les places descendent sous le nom. Ce n'est pas un défaut : le critère est que rien ne se chevauche, rien n'est coupé, rien ne dépasse (O8.3).
- Pas de bouton, pas de lien, pas de région vivante, pas de fond ambre. Le seul geste de la carte repliée est de la déplier.

### L'état gardé

- `localStorage`, clé `fullcar:organiser-folded:{id}` (sur le modèle de `fullcar:personal-token:{id}`), valeur `"1"`.
  - Replier écrit la clé ; déplier la retire. Un panneau déplié n'a donc pas de clé.
  - Rien d'autre n'est écrit, ni dans `sessionStorage`, ni dans un cookie.
- La clé est lue **une fois, quand le panneau apparaît** : après la première lecture, ou après un « Réessayer » qui aboutit. Le panneau apparaît directement dans son état, sans passer par l'état déplié. Il n'est jamais dans le HTML du serveur : aucun écart d'hydratation n'est possible.
- Pas de clé, une autre valeur que `"1"`, ou un stockage qui lève une exception (à l'accès à `window.localStorage`, à `getItem`, à `setItem` ou à `removeItem`) : le panneau apparaît **déplié**. Il n'y a ni message ni erreur. Le bouton replie et déplie quand même pour la page, sans que l'état soit gardé (même lecture défensive que `device-token.ts`).
- **Par événement, et non global.**
  - Un événement qu'on vient de créer arrive toujours déplié : le lien à partager et « Gardez ce lien » sont visibles à la création (#3 C4.2, O4.2).
  - Replier un événement ne cache pas les liens d'un autre.
- **Ni jeton, ni numéro.** La clé ne contient que l'identifiant public de l'événement, et la valeur `1`. O2.10 et O6.1 tiennent.
- La clé n'est ni lue ni écrite sur `/e/{id}`, ni avec un lien invalide, ni pendant le chargement ou l'échec.
- Pas d'écoute de l'événement `storage` : un autre onglet applique l'état à son prochain chargement.
- Rien ne retire la clé à la purge de l'événement, comme pour `fullcar:personal-token:{id}`.

### Avec les autres états

- **Avant le panneau** (chargement, lien invalide, échec et « Réessayer », sans JavaScript) : pas de bouton qui replie, pas de résumé. Le rendu est celui de la v3.1, quel que soit l'état gardé. Le repli ne s'applique qu'une fois le panneau là.
- **« Réessayer » aboutit** : le panneau apparaît dans l'état gardé, et le focus va sur le bouton du titre, qui existe dans les deux états.
- **« Actualiser », replié** :
  - il reste visible et lance la même lecture de l'écran ;
  - pendant la lecture, sa boîte et la hauteur du panneau ne changent pas ;
  - à la réussite, le résumé est celui de la nouvelle lecture, et `status` dit `Admin.refreshed`.
- **Actualisation impossible, replié** : l'alerte s'affiche sous la ligne du titre, au-dessus du résumé, qui reste celui de la dernière lecture (« Ce qui est affiché date du dernier chargement » le couvre). Le focus reste sur « Actualiser ».
- **Panneau retiré (O1.10), replié** :
  - le résumé est une donnée lue : il est retiré, et `Admin.stale` prend sa place, dans le même cadre pointillé, sans annonce ;
  - **où est la phrase** : repliée, **juste sous la ligne du titre** (sous l'alerte quand elle a un texte), à 360 comme à 1280 px. Dépliée, **sous les liens**, comme en v3.1 (à 1280 px, après la ligne de séparation). Dans les deux cas, son cadre prend toute la largeur du panneau, et le texte est en `max-w-prose` (O7.5) ;
  - déplier montre les liens et la même phrase ;
  - la lecture suivante qui réussit rend le résumé.
- **Retiré, puis actualisation impossible, replié** : l'alerte (`Admin.refreshFailed.bodyWithdrawn`) remplace la phrase, et rien d'autre ne vient sous la ligne du titre.
- **Ce qui ne change jamais l'état replié** : une lecture, une action du tableau, un échec. Basculer pendant une lecture ne lance ni n'arrête la lecture.
- **Défilement stable (O1.11)** : replier ou déplier se fait sur le bouton, donc à l'écran. La compensation, qui ne joue que si le bas du panneau était au-dessus de l'écran, ne se déclenche pas. Le tableau monte ou descend sous le bouton, et le bouton ne bouge pas.

### À partir de 1024 px

- Replié, le panneau garde sa largeur dépliée : au plus `max-w-5xl`, centré.
- Le résumé est sur deux colonnes, celles des sections (`lg:grid-cols-2`, `gap-x-6`, `items-start`) : Aller à gauche, Retour à droite, hauts alignés. Sans retour, la ligne est dans la colonne de gauche.
- L'alerte et la phrase de retrait prennent toute la largeur du panneau, texte en `max-w-prose` (O7.5).
- Déplié : rien ne change (O1.2, O4.1).

### Mouvement

Aucune animation, avec ou sans `prefers-reduced-motion` : le contenu apparaît et disparaît d'un coup (`hidden`), le chevron est remplacé, rien ne défile. C'est ce que fait « Vos inscriptions ».

La seule animation du panneau reste l'icône d'une lecture en cours (v3.1). Elle est partagée avec le reste de l'application : la passer en `motion-reduce:animate-none` serait une passe sur toute l'application, hors de cette demande.

### Sans JavaScript

O5.5 ne change pas : la phrase `Admin.needsJavaScript`. Le HTML de `/admin` ne contient ni le bouton, ni le résumé, et rien n'est écrit dans le navigateur.

### Critères v3.2, à reporter dans l'epic

**O8 — Replier l'espace organisateur**

*En tant qu'organisateur, une fois les liens envoyés, je replie l'espace organisateur pour arriver tout de suite à l'événement et au tableau, sans perdre de vue qui reste sans voiture.*

- **O8.1** Le h2 du panneau contient un `<button type="button">` dont le nom accessible est exactement « Espace organisateur » (« Organiser area »), dans les deux états.
  - Il porte `aria-expanded` (`true` déplié, `false` replié) et `aria-controls`, qui désigne un élément présent dans les deux états et qui contient les vignettes, les deux liens, l'avertissement et les sections.
  - Il contient le texte, puis l'icône `ChevronUp` déplié ou `ChevronDown` replié (`aria-hidden`).
  - Il fait au moins 44 px de haut.
  - Le h2 est l'élément `flex-auto min-w-0` de la ligne du titre (pas `flex-1`), et le bouton y est en `w-full`. « Actualiser » est en `ml-auto`.
  - L'anneau de focus du bouton est intérieur : au clavier, `getComputedStyle(bouton).boxShadow` contient `inset`.
  - Test, sans mesure liée à une police : à 360 × 780, en français et en anglais, puis avec `font-size: 125%` sur la racine :
    - les boîtes du bouton et d'« Actualiser » ne se chevauchent pas ;
    - le bord droit d'« Actualiser » est celui du contenu du panneau (±1 px), qu'il soit sur la ligne du titre ou dessous ;
    - ni le bouton ni « Actualiser » ne coupent leur texte (`scrollWidth ≤ clientWidth`), et aucun ne dépasse du panneau ;
    - la page n'a pas de débordement horizontal ;
    - à 125 %, le texte « Espace organisateur » tient sur une ligne : `Range.getClientRects()` de son nœud texte rend un seul rectangle. C'est « Actualiser » qui passe dessous, pas le titre qui se coupe. Ce test échoue avec `flex-1`.

    Que les deux tiennent sur une ligne est un but de dessin, vérifié dans la maquette, pas un critère.
- **O8.2** Replié, le panneau montre la ligne du titre, la région `alert` (O5.4), puis le résumé (O8.3) ou la phrase de retrait (O1.10), et rien d'autre.
  - Les vignettes, le lien à partager, « Copier », « Partager », le lien d'organisateur, « Gardez ce lien » et les sections sont `toBeHidden()`, et absents de l'arbre d'accessibilité.
  - Au clavier, Tab depuis le bouton va à « Actualiser », puis au premier élément focusable qui suit le panneau.
  - Déplié, le panneau est celui de la v3.1, sans résumé visible.
- **O8.3** Replié, une liste a une ligne par leg, dans l'ordre des legs. Chaque ligne a les textes de la vignette de ce leg : nom du leg ; pastille ambre `Board.tabCount` si N > 0 ; places (`Board.banner.everyoneSeated`, `Admin.tile.free`, ou `Admin.tile.missing` en gras).
  - Test : pour chaque leg, à 360 px, le `textContent` de la ligne repliée est égal à celui de la vignette dépliée.
  - Leg vide : nom, puis « Personne ne s'est encore inscrit. », sans pastille. Événement vide : deux lignes de ce texte.
  - Sans retour : une ligne, et « Retour » est absent du panneau.
  - Le fond calculé de la pastille est celui de la pastille de l'onglet du tableau. Aucun élément du résumé n'a de fond ambre.
  - Le résumé n'a ni bouton, ni lien, ni `role="status"`.
  - Une ligne n'a aucun caractère séparateur : son `textContent` est la concaténation du nom, du texte de la pastille et des places.
  - Test, sans mesure liée à une police : avec 20 sans voiture et 12 places manquantes, à 360 px, et avec `font-size: 125%` sur la racine, les boîtes du nom, de la pastille et des places ne se chevauchent pas, aucune ne coupe son texte, aucune ne dépasse le bord droit du résumé, et la page n'a pas de débordement horizontal. La ligne peut passer à la ligne.
- **O8.4** Un clic, Entrée ou Espace sur le bouton replie ou déplie la carte, sans requête réseau, et le focus reste sur le bouton.
  - Page en haut, à 360 et à 1280 px : la `boundingBox` du bouton est identique avant et après (±1 px).
  - Une liste dépliée par « Afficher les {n} autres » l'est encore après un repli puis un dépli.
  - Basculer pendant une lecture n'envoie ni n'annule aucune requête.
- **O8.5** L'état est gardé par événement, dans `localStorage`.
  - Première visite : déplié. Replier écrit `fullcar:organiser-folded:{id}` = `"1"`. Déplier retire la clé.
  - Après rechargement, le panneau apparaît dans l'état gardé, directement : avec la clé, un `MutationObserver` posé avant le chargement ne voit jamais le lien à partager visible.
  - Un autre événement, et un événement créé ensuite sur le même appareil, arrivent dépliés.
  - Pas de clé, une valeur autre que `"1"`, ou un `localStorage` qui lève une exception (propriété, `getItem`, `setItem`, `removeItem`) : le panneau apparaît déplié, et le bouton marche pour la page. Il n'y a ni message, ni erreur en console, ni `pageerror`.
  - Après les scénarios O8, la seule clé que **cette fonction** ajoute au stockage de l'origine est `fullcar:organiser-folded:{id}`, de valeur `"1"`. Les autres clés présentes sont celles que #66 écrit déjà, `fullcar:personal-token:{id}`, par exemple après l'action du scénario O8.6 (panneau retiré). Cette fonction n'écrit rien dans `sessionStorage` ni dans un cookie. O2.10 et O6.1 passent (fixture de #178).
  - La clé n'est ni lue ni écrite sur `/e/{id}`, ni avec un lien invalide.
- **O8.6** Avec les autres états.
  - Chargement, lien invalide, échec et « Réessayer », avec la clé posée : aucun bouton nommé « Espace organisateur », et aucun résumé.
  - « Réessayer » qui aboutit : le panneau apparaît dans l'état gardé, et le focus est sur le bouton du titre.
  - Replié, « Actualiser » est visible et fait la lecture de l'écran (O1.8, O1.9), sans changer la hauteur du panneau pendant la lecture. Test à deux contextes : le contexte 2 déclare une personne sans voiture à l'aller, l'organisateur, replié, touche « Actualiser », et la ligne Aller passe de « 2 sans voiture » à « 3 sans voiture ».
  - Replié, actualisation impossible : l'alerte O5.4 est entre la ligne du titre et le résumé, qui ne change pas, et le focus reste sur « Actualiser ».
  - Replié, panneau retiré (O1.10) : le résumé est absent, et « L'espace organisateur n'est plus à jour. Utilisez « Actualiser » pour le relire. » est à sa place. Retiré, puis actualisation impossible : l'alerte, avec `bodyWithdrawn`, est seule sous la ligne du titre.
  - Aucune lecture, action ni échec ne change `aria-expanded`.
- **O8.7** À 1280 × 800, la largeur du panneau est la même replié et déplié.
  - Le résumé a deux colonnes : la ligne Aller à gauche, Retour à droite, hauts égaux (±1 px).
  - Sans retour, la ligne est dans la colonne de gauche.
- **O8.8** Replier et déplier sont instantanés, avec `reducedMotion` émulé à `reduce` comme à `no-preference`. Juste après le clic, `getAnimations({ subtree: true })` du panneau est vide, et `window.scrollY` n'a pas changé.
- **O8.9** Sans JavaScript, O5.5 tient, et le HTML de `/admin` ne contient ni le bouton qui replie, ni le résumé.

**Amendements**

- **O1.8** : « à droite du titre du panneau » devient « à droite du bouton du titre (O8.1), replié comme déplié ».
- **O1.10** : ajout, « Replié, la phrase prend la place du résumé (O8.6) ».
- **O2.10** : « Rien de nouveau n'est stocké… ni dans le navigateur » devient « …ni dans le navigateur, sauf l'état replié (O8.5), qui ne contient ni numéro ni jeton ».
- **O4.2** : « à l'arrivée » devient « à l'arrivée, panneau déplié ; c'est toujours le cas à la première visite d'un événement, donc juste après la création (O8.5) ».
- **O5.3** : « le focus va sur le titre du panneau, « Espace organisateur » (`tabIndex={-1}`) » devient « le focus va sur le bouton du titre, « Espace organisateur » (O8.1), replié ou déplié selon l'état gardé ».
- **O5.8** : la ligne « Réessayer », réussite, devient « le bouton du titre ». Une ligne est ajoutée : « le bouton du titre : reste sur le bouton ».
- **O7.2** : captures en plus, à 360 et à 1280 px, de la carte repliée : rempli, événement vide, sans retour, actualisation impossible, panneau retiré. Plus, à 360 px, avec `font-size: 125%` sur la racine : la ligne du titre passée à la ligne (O8.1). Toutes sont dessinées (v3.2.1).
- **O7.4** : le bouton du titre fait au moins 44 px.
- **#3 C4.7** (épic fermé, pour mémoire) : « affiche à nouveau le même panneau » s'entend dans l'état replié ou déplié gardé sur l'appareil.

### Effet sur les tâches

- **#181 (en cours)** : rien à changer. Elle pose le focus sur le h2 (`tabIndex={-1}`). La tâche du repli le déplace sur le bouton, et change l'attente de son test, de `heading` à `button` nommé « Espace organisateur ».
- **#179, #180, #182** : rien.
  - #180 : extraire le texte des places de la vignette en une fonction (`Coverage` → clé et valeurs) permettrait au résumé de la réutiliser telle quelle. Sinon, la tâche du repli l'extrait.
- **#183** : la phrase de retrait doit aussi remplacer le résumé replié. Il n'y a rien à faire si la tâche du repli passe après #183, qui est l'ordre recommandé.
- **#184** : les captures replié de O7.2.
- **Une tâche nouvelle** (le repli : bouton, résumé, état gardé, O8), après #183 et avant #184.
  - Elle touche `admin-panel.tsx`, un module de lecture et d'écriture de la clé (sur le modèle défensif de `device-token.ts`) et un spec e2e.
  - Motif `localStorage` : merge humain probable.

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
| « Réessayer » (première lecture), réussite | le bouton du titre, « Espace organisateur », replié ou déplié selon l'état gardé (v3.2) | — |
| le bouton du titre (replier, déplier) | reste sur le bouton (v3.2) | `aria-expanded` change ; rien d'autre |
| une vignette, carte repliée | sans objet : les vignettes sont repliées avec les sections (v3.2) | — |
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

## Modifier l'événement (v3.3)

Demande du propriétaire (2026-10-20) : « L'organisateur doit pouvoir modifier l'événement et « collapse » l'espace organisateur ». Le repli est la v3.2.2 (#204), inchangée ici. Cette section ne spécifie que la modification. Epic : [#250](https://github.com/olaurendeau/fullcar/issues/250). DE1 et DE2 sont décidées par le propriétaire (2026-10-20) : DE1 = (b), DE2 = (a).

**Le problème.** Le titre, le lieu, le début, la fin et le retour sont figés à la création. L'organisateur qui s'est trompé de lieu, ou dont le match passe de 08:00 à 14:00, n'a qu'une issue : créer un autre événement, renvoyer un autre lien au groupe, et faire tout réinscrire. C'est le « login à chaque modification » des concurrents, en pire. Il en va de même pour le retour : la case décochée par erreur, ou un car qui ramène finalement les enfants, ne se rattrapent pas. Et « Gardez ce lien » dit déjà : « C'est le seul moyen de modifier l'événement ». La page ne tient pas cette promesse.

**Ce qui est stocké, et ce qui en dépend** (lu sur `origin/main`) :

- `event.title`, `location`, `aller_at` et `retour_at`. `retour_at` dit à la fois s'il y a un retour (`eventLegs`) et à quelle heure. La base exige `retour_at > aller_at` (`event_retour_after_aller`).
- `ride.departure_time` est une heure sans date. Sa date est celle de son leg : déplacer le début déplace la date des voitures de l'aller, et garde leur heure.
- « Heure de départ » de « Proposer une voiture » est préremplie avec l'heure du leg, lue à l'ouverture du formulaire.
- La purge part de la date du dernier leg. Elle n'est pas encore écrite : elle lira les dates du moment, rien n'est à recopier.
- L'en-tête, les onglets et les dates des formulaires du tableau viennent des props rendues par le serveur (`EventView`). L'état qu'une action rend (`EventState`) ne porte aujourd'hui que les legs.
- La fraîcheur automatique (#67) n'existe pas encore : une page ouverte ne relit l'état qu'à une action ou au rechargement.

### Où est le bouton

- **Dans le contenu qui se replie** (le conteneur `hidden` de la v3.2), **après « Gardez ce lien » et avant les sections**.
  - Sous 1024 px : un bouton `outline` pleine largeur, `h-11`, icône `Pencil` (`aria-hidden`), libellé `Admin.edit`.
  - À partir de 1024 px : sous la première rangée (les deux colonnes de liens), aligné à gauche, à sa largeur, puis la ligne de séparation et les sections.
- **Pas sur la ligne du titre.** À 360 px, le bouton du titre et « Actualiser » la remplissent déjà, sans espace entre eux (décision 26). Replié, on déplie d'un toucher, puis on modifie.
- **Pas dans l'en-tête de l'événement.** L'en-tête est le même que sur `/e/{id}` (#235 D1.6) ; tout ce qui est à l'organisateur est dans sa carte (décision 1).
- Le pli tient : à 360 × 780, sur l'événement rempli, « Gardez ce lien » finit à 698 px et le bouton à 758 px (maquette, police de macOS). O4.2 ne change pas.
- Le bouton reste quand le panneau est retiré (O1.10) : il est avec les liens.

### Le formulaire

- Une `BottomSheet` (`bottom-sheet.tsx`), comme les autres formulaires de l'écran, titrée `EditEvent.title`, sans « Fermer » (`closable={false}`) : « Annuler » et Échap la ferment.
- **Les champs de `CreateEventForm`**, extraits en un composant partagé, sans changer la disposition ni le comportement de la création (#232 la déplace à `/nouveau`, #235 change ses mots) : Titre, Lieu, Date et Heure de début (deux colonnes), la case « Retour » avec sa phrase, Date et Heure de fin (deux colonnes, seulement si la case est cochée).
- **Pas d'options** (rehausseurs, participation, points de RDV) : c'est l'epic #68. Elles ne changent pas en base.
- **Prérempli** avec les valeurs enregistrées, la case cochée si et seulement si l'événement a un retour.
  - Ouvert sur un événement sans retour, cocher la case montre les champs de fin vides, et la date de fin suit la date de début tant qu'elle n'est pas changée (C1.3 de #3).
  - Ouvert sur un événement dont la fin est **le même jour** que le début, la date de fin suit la date de début tant qu'elle n'est pas changée : déplacer un tournoi d'un jour déplace aussi sa fin.
  - Ouvert sur un événement dont la fin est **un autre jour**, la date de fin ne suit pas : l'écart entre les deux dates est voulu (un week-end), et le recopier serait deviner. Une fin restée avant le début est refusée par « La fin doit être après le début. ».
- **Un champ est changé** quand sa valeur diffère de sa valeur chargée. Un champ modifié puis remis à sa valeur chargée n'est pas changé. La case « Retour » est un champ comme les autres.
- **La validation de la création** (`validateEvent`), dans le navigateur puis sur le serveur, avec **une seule différence** : une date **égale à celle enregistrée** est acceptée même passée. Une date changée suit les bornes de la création (aujourd'hui à un an, `deviceBounds` / `serverBounds`).
- « Valider » (`Actions.submit`) puis « Annuler » (`Actions.cancel`), pleine largeur, `h-11`.
  - Aucun champ changé : la feuille se ferme, sans requête ni message.
  - Pendant l'envoi : « Valider » est `aria-disabled="true"`, libellé inchangé, et un second toucher n'envoie rien. Il garde ainsi le focus, y compris quand la confirmation se ferme sur lui pendant l'envoi (décision 50). Seul `eventNotFound` le rend `disabled`. Le gestionnaire d'envoi ignore aussi Entrée.
  - **Pendant l'envoi, les champs sont verrouillés** : Titre, Lieu, les dates et les heures sont en lecture seule (`readOnly`), et la case « Retour » est `aria-disabled` (un toucher ne la change pas). Ils restent lisibles et atteignables au clavier. Le gestionnaire de changement ignore toute saisie, y compris dans les champs date et heure. Tant qu'ils sont verrouillés, une ligne visible `EditEvent.sending` (« Envoi en cours… »), en `text-sm text-muted-foreground`, s'affiche juste au-dessus de « Valider », qui la référence par `aria-describedby`. Ce n'est pas une région vivante : le focus reste sur « Valider », qu'elle décrit. À la réponse, quelle qu'elle soit, ils se déverrouillent, et la ligne disparaît. Ainsi, une réponse qui arrive tard, feuille encore ouverte, ne trouve jamais une saisie faite après l'envoi : `ok` peut fermer la feuille sans rien perdre (décision 52). C'est vrai de tous les chemins : un envoi direct, la confirmation, et la confirmation fermée après 10 s.
  - Une feuille qui **n'a pas envoyé** (rouverte après 10 s, décision 51) garde ses champs libres : c'est la règle de la décision 51 qui s'applique à la réponse de l'envoi d'avant.
  - Fermer la feuille pendant l'envoi ne l'annule pas : son issue va dans la barre, quand la page n'est plus cachée (règle de #167). Voir « Une réponse qui arrive feuille fermée ».
- **Les voitures gardent leur heure.** Sous les champs d'un leg dont la date ou l'heure a changé, et qui a au moins une voiture dans le dernier état affiché, une phrase le dit : `EditEvent.carTimes.aller` ou `.retour`. Elle est en `text-muted-foreground`, 13 px, avec l'icône `Info`, et décrit les deux champs du leg (`aria-describedby`). Elle n'empêche rien. Pour le retour, elle n'apparaît que si la case reste cochée.

### Enregistrer

- Une server action, `updateEvent(id, token, fields, before, removal?)`. Tout est dans le **corps** du `POST`, comme pour `loadOrganiserPanel` : le jeton n'est ni dans l'URL, ni dans un en-tête, ni journalisé, ni renvoyé.
  - `before`, ce sont les valeurs chargées (titre, lieu, `aller_at`, `retour_at`).
  - `removal`, ce sont les nombres confirmés de la suppression du retour.
- Le serveur vérifie le jeton (temps constant), puis valide les champs, puis, dans une transaction qui verrouille la ligne de l'événement, compare `before` à la base, puis écrit. Tout ou rien : une réponse autre que `ok` n'a rien écrit. Ses réponses, **feuille ouverte** :

  | réponse | quand | ce que fait la page |
  |---|---|---|
  | `ok`, avec les valeurs enregistrées | écrit | voir « Après l'enregistrement » |
  | `errors` | un champ refusé | erreurs sous les champs, focus sur le premier |
  | `changed`, avec les valeurs de la base | `before` n'est plus vrai | voir « Modifications simultanées » |
  | `confirmRetour`, avec `{ cars, persons }` | le retour décoché a des voitures ou des personnes, et `removal` est absent ou ne correspond plus | la confirmation |
  | `invalid` | jeton refusé | alerte `Admin.invalid.*` dans la feuille, au-dessus de « Valider » |
  | `eventNotFound` | événement supprimé | alerte dans la feuille : `Actions.notDone.editEvent`, puis `Actions.why.eventNotFound` ; « Valider » devient inactif (`disabled`), seul « Annuler » reste |
  | erreur levée, ou hors ligne | — | `Actions.failed` ou `Actions.offline` dans la feuille (`role="alert"`, au-dessus de « Valider »), saisie gardée, feuille ouverte |

- **Après l'enregistrement** :
  - la feuille se ferme, et le focus revient sur « Modifier l'événement » ;
  - l'en-tête, `document.title`, les dates des sections du panneau, les onglets et les dates que montrent les formulaires du tableau prennent les valeurs de la réponse ;
  - puis une lecture de l'écran (O1.9) relit le panneau et le tableau, d'un seul bloc ;
  - la barre de #66 dit `EditEvent.saved`.

  Si la lecture échoue, l'en-tête garde les valeurs de la réponse, la barre dit quand même `EditEvent.saved`, et le panneau se retire comme après une action du tableau (O1.10).
- L'état replié ou déplié ne change pas.

### Une réponse qui arrive feuille fermée

La feuille a été fermée (Échap, « Annuler ») pendant l'envoi. L'envoi continue, et sa réponse va dans la barre de #66, selon la règle de la v4.2 (#216) : tout échec nomme ce qui n'a pas été fait, puis pourquoi (`Actions.failure` = « {notDone} {why} »).

| réponse | la barre dit | la page |
|---|---|---|
| `ok` | `EditEvent.saved` (réussite) | comme « Après l'enregistrement », sans déplacer le focus |
| hors ligne | « L'événement n'a pas été modifié. Vérifiez la connexion, puis réessayez. » (`notDone.editEvent` + `why.offline`) | rien ne change |
| erreur levée | « L'événement n'a pas été modifié. Une erreur est survenue : réessayez dans un instant. » (`why.failed`) | rien ne change |
| `invalid` | « L'événement n'a pas été modifié. Une erreur est survenue : réessayez dans un instant. » (`why.failed`, comme la v4.2 : seule une requête forgée produit `invalid`) | rien ne change |
| `eventNotFound` | « L'événement n'a pas été modifié. Cet événement est introuvable : il a peut-être été supprimé. » (`why.eventNotFound`) | rien ne change |
| `errors` | « L'événement n'a pas été modifié. Un champ n'a pas été accepté : utilisez de nouveau « Modifier l'événement ». » (`why.editErrors`) | rien ne change ; la saisie est perdue |
| `changed` | « L'événement n'a pas été modifié. Il venait d'être modifié depuis un autre appareil : la page montre la version enregistrée. » (`why.eventChanged`) | l'en-tête, `document.title` et les onglets prennent les valeurs de la base, puis une lecture de l'écran |
| `confirmRetour` | « L'événement n'a pas été modifié. La suppression du retour n'a pas été confirmée : utilisez de nouveau « Modifier l'événement ». » (`why.retourNotConfirmed`) | rien ne change : l'en-tête garde « Fin », les onglets restent ; la confirmation ne s'ouvre pas |

- **Le pire cas** : décocher un retour qui a des inscriptions, « Valider », Échap, puis la réponse `confirmRetour`. Rien n'a été écrit, ni le retour ni les autres champs changés dans le même envoi, et la barre le dit (dernière ligne).
- Le sujet de ces échecs (règle 5 de la v4.2) est la modification de l'événement (`event:edit`), qu'ils commencent par `Actions.notDone.editEvent` ou par `Actions.notDone.removeRetour` : le prochain envoi de « Modifier l'événement » les retire, dès l'envoi.
- Leur repère (règle 8 de la v4.2), pour les deux phrases, est le bouton « Modifier l'événement ». Carte repliée, il n'est pas affiché, et la règle 8 passe au repère suivant.
- **Tant qu'un envoi est en route, « Modifier l'événement » est inactif** (`aria-disabled="true"`, libellé inchangé) : un toucher ne rouvre rien. Rouvrir la feuille pendant l'envoi chargerait des valeurs sur le point de changer, et le second envoi recevrait un faux `changed`. À la réponse, le bouton redevient actif.
  - **Une requête qui ne répond pas** : au bout de 10 s, comme la confirmation, le bouton redevient actif. La feuille rouverte charge les valeurs affichées. Si la réponse de l'envoi d'avant arrive pendant qu'elle est ouverte, elle est appliquée comme d'habitude (en-tête, barre). Si c'est `ok`, la feuille prend aussi les valeurs enregistrées comme valeurs chargées, et ses champs non changés les affichent, sans alerte. Le prochain « Valider » ne reçoit donc pas de faux `changed` (décision 51).

### Modifications simultanées

Deux appareils peuvent avoir le lien d'organisateur. Le serveur compare `before` aux valeurs de la base, dans la transaction. S'ils diffèrent, il n'écrit rien et répond `changed` avec les valeurs de la base. Feuille ouverte :

- dans le formulaire, chaque champ que l'organisateur **n'a pas changé** (sa valeur est sa valeur chargée) prend la valeur de la base, et chaque champ changé garde sa saisie ;
- la case « Retour » suit la même règle :
  - l'autre appareil a **supprimé** le retour, et la case n'était pas changée : elle se décoche et les champs de fin disparaissent. Un retour supprimé là-bas n'est jamais rajouté sans que l'organisateur recoche la case ;
  - l'autre appareil a **ajouté** un retour, et la case n'était pas changée : elle se coche, avec la fin enregistrée ;
- `before` devient les valeurs de la base : un second « Valider » enregistre en connaissance de cause ;
- l'alerte `EditEvent.changed.title` / `.body` s'affiche dans la feuille, au-dessus de « Valider », et le focus va sur « Valider » ;
- **toute la page** prend l'état de la base : l'en-tête, `document.title`, les onglets (qui apparaissent ou disparaissent avec le retour), puis une lecture de l'écran pour le panneau, ses vignettes et les dates de ses sections.

Aucune colonne nouvelle (pas de version ni de `updated_at`).

### Supprimer le retour

*Décidé par le propriétaire le 2026-10-20 : DE1 = (b) ([#250](https://github.com/olaurendeau/fullcar/issues/250)).*

- Décocher « Retour » masque les champs de fin. Rien d'autre ne change avant « Valider ».
- **Retour vide** (aucune voiture, aucun Placement au retour) : « Valider » enregistre directement.
- **Sinon**, le serveur répond `confirmRetour` avec deux nombres :
  - `cars`, les Rides du retour ;
  - `persons`, les personnes distinctes qui conduisent au retour ou y ont un Placement (passagères ou sans voiture).

  Une confirmation s'ouvre (`AlertDialog`, sur le modèle de « Retirer la voiture », `remove-ride-dialog.tsx`), au-dessus de la feuille :
  - titre `EditEvent.removeRetour.title` ;
  - texte `EditEvent.removeRetour.body`, `EditEvent.removeRetour.aller`, puis `RideChanges.remove.notified` ;
  - « Supprimer le retour » (`EditEvent.removeRetour.confirm`, rouge), puis « Annuler ».

  Le focus est sur « Annuler ». « Annuler » ou Échap reviennent à la feuille, case toujours décochée, focus sur « Valider ».
- Confirmer renvoie la requête avec `removal = { cars, persons }`.
- **Pendant cet envoi**, la confirmation reste ouverte : « Supprimer le retour » est `aria-disabled="true"`, libellé inchangé, et garde le focus (décision 12) ; un toucher ne renvoie rien.
  - Pendant les 10 premières secondes, « Annuler » est `aria-disabled` aussi, et Échap ne ferme rien : la réponse arrive dans la confirmation, là où l'organisateur a confirmé.
  - **Une requête qui ne répond pas** : au bout de 10 s, « Annuler » redevient actif, et Échap aussi. Le focus reste sur « Supprimer le retour » jusqu'à ce que l'organisateur le déplace. Fermer la confirmation ne l'annule pas : la feuille reste, et le focus va sur son « Valider », `aria-disabled` tant que l'envoi est en route. La réponse est alors traitée comme celle d'un envoi de la feuille, **sans rouvrir la confirmation** (décision 49) :
    - `ok` ferme la feuille (« Après l'enregistrement ») ;
    - `confirmRetour` (les nombres ont changé) : une alerte dans la feuille, au-dessus de « Valider » : `Actions.notDone.removeRetour`, puis `Actions.why.retourChanged` avec les nouveaux nombres, qui dit d'utiliser de nouveau « Valider ». « Valider » redevient actif et garde le focus ; le toucher rouvre la confirmation avec ces nombres ;
    - un échec s'affiche dans la feuille, au même endroit, avec la phrase de la confirmation (`Actions.notDone.removeRetour`, puis la raison).

    Feuille fermée elle aussi : la barre dit `Actions.notDone.removeRetour`, puis la raison ; pour `confirmRetour`, `Actions.why.retourChanged`, qui dit alors d'utiliser de nouveau « Modifier l'événement ».
- **Les réponses, confirmation ouverte.** Elle les dit elle-même : sous la feuille, la modale cache tout ce qui est « au-dessus de Valider ».

  | réponse | la confirmation | dessous | focus |
  |---|---|---|---|
  | `ok` | se ferme, avec la feuille | voir « Après l'enregistrement » ; M3.1 | « Modifier l'événement » |
  | `confirmRetour`, nombres différents | reste ; nouveaux nombres, puis `EditEvent.removeRetour.changed` (`role="alert"`) | rien | « Supprimer le retour », de nouveau actif |
  | hors ligne | reste ; « L'événement n'a pas été modifié et le retour n'a pas été supprimé. Vérifiez la connexion, puis réessayez. » (`role="alert"`, au-dessus des boutons) | rien | « Supprimer le retour », de nouveau actif |
  | erreur levée | reste ; même phrase, puis `Actions.why.failed` | rien | « Supprimer le retour » |
  | `invalid` | reste ; même phrase, puis `Actions.why.failed` (v4.2) | rien | « Supprimer le retour » |
  | `eventNotFound` | reste ; même phrase, puis `Actions.why.eventNotFound` ; « Supprimer le retour » reste inactif | « Annuler » ramène à la feuille, qui montre l'alerte `eventNotFound` et dont « Valider » est inactif | « Annuler » |
  | `changed` | se ferme | la feuille applique « Modifications simultanées » ; son alerte `EditEvent.changed.*` | « Valider » |
  | `errors` | se ferme | les erreurs sous les champs | le premier champ en erreur |

- Dans la transaction, le serveur recompte :
  - **les mêmes nombres** : il supprime les Rides du retour et tous ses Placements, met `retour_at` à `null` et écrit les autres champs. Les personnes restent, avec leur état à l'aller ;
  - **des nombres différents, mais pas zéro** : il n'écrit rien et répond `confirmRetour` avec les nouveaux ;
  - **zéro voiture et zéro personne** (le retour s'est vidé pendant la confirmation) : il enregistre sans redemander, puisqu'il n'y a plus rien à retirer. La réponse est `ok`.
- **Ce qui est comparé, ce sont des nombres**, ceux que la confirmation montre. Un échange pendant la confirmation (une voiture retirée et une autre proposée, avec autant de personnes) garde les nombres, et la suppression passe : la confirmation ne nomme ni voiture ni personne, et l'organisateur supprime ce qu'il a vu, deux voitures et neuf personnes.
- **Exigence pour l'architecte** : une écriture sur le retour qui s'exécute en même temps ne peut ni faire échouer la suppression en silence, ni laisser une ligne du retour sous un `retour_at` vide. Une ligne restée cachée reviendrait le jour où le retour est rajouté. Ces écritures sont prendre une place, déclarer « sans voiture », proposer une voiture et ajouter une personne.
  - Après le `COMMIT`, ces écritures sont refusées par `noRetour` (voir « Ce que voient les participants »). La page prend l'état que la réponse porte.
  - L'ordre des verrous devient Event, puis Ride, puis Person (architecture, « Concurrence »).
  - La preuve est un test de concurrence sur données validées (`withCommittedEvent`).

### Ajouter un retour

*Décidé par le propriétaire le 2026-10-20 : DE2 = (a) ([#250](https://github.com/olaurendeau/fullcar/issues/250)).*

- Cocher « Retour », remplir la fin, « Valider » : `retour_at` est écrit.
- **Personne n'est placé d'office** : chaque personne est « pas concernée » au retour, jusqu'à ce qu'elle le déclare (« Vos inscriptions », le tableau).
- Les onglets apparaissent, Aller actif. L'onglet Retour, la vignette, la section et la ligne du résumé montrent le leg vide (`Event.nobody`).

### Ce que voient les participants

- **Rien ne les prévient**, rien ne marque l'événement comme modifié sur `/e/{id}` : les notifications sont hors V1. Sur `/admin`, la barre de l'organisateur le lui dit (`EditEvent.saved`).
- **Une page ouverte** se met à jour au rechargement, ou à sa **prochaine action** : l'état que rendent les actions et les lectures (`EventState`, et la réponse de `loadEventState`) porte aussi titre, lieu, `aller_at` et `retour_at`. La page applique l'en-tête, `document.title`, les onglets et les dates de ses formulaires. Quand #67 apportera la fraîcheur, elle appliquera le même état.
  - Si l'onglet actif était le retour et qu'il n'y en a plus, le tableau montre l'aller seul. Si le focus était dans l'onglet retiré, il va sur le h1 de l'événement (`#event-title`).
- **Une feuille garde les legs qu'elle avait à son ouverture**, jusqu'à la réponse de son propre envoi. Un état appliqué entre-temps (par la réponse d'une autre action) ne change pas sa forme : un choix « Je ramène aussi » ne disparaît jamais sous les doigts de la personne qui remplit.
- **Le refus `noRetour`.** Un envoi qui écrirait sur le retour alors que l'événement n'en a plus est refusé par `noRetour`, avec l'état. Rien n'est écrit (tout ou rien), et ce refus passe avant tous les autres, `rideGone` compris. Ces envois sont :
  - une action de cellule sur le retour (« Je cherche une place », « Ne fait pas le retour », « Sortir de la voiture ») ;
  - un tap ou la feuille « Qui monte… ? » sur une voiture du retour ;
  - « Proposer une voiture » depuis l'onglet Retour ;
  - « Proposer une voiture » depuis l'onglet Aller, avec « Je ramène aussi » ou « Je cherche une place » au retour. « Je reste dans la voiture de… » et « Je ne fais pas le retour » n'écrivent rien au retour : l'aller est enregistré ;
  - « Ajouter une personne » depuis l'onglet Retour, ou depuis l'Aller avec « Aller et retour » coché.
- **Une feuille dont le leg était le retour** (cellule, « Qui monte… ? », « Proposer une voiture » ou « Ajouter une personne » ouverts sur l'onglet Retour) **se ferme** au refus : son leg n'existe plus. L'échec va dans la barre (`Actions.notDone.*`, puis `Actions.why.noRetour`), et le focus va sur le h1 de l'événement : le repère du message était sur le retour, et la page n'a plus d'onglets (règle 8 de la v4.2).
- **Une feuille ouverte sur l'aller** (« Proposer une voiture » avec « Je ramène aussi » ; « Ajouter une personne » avec « Aller et retour ») **reste ouverte** : elle prend l'état sans retour. Le groupe « Au retour » (ou la case « Aller et retour ») disparaît, les champs de l'aller gardent leur saisie, `Actions.noRetour` s'affiche au-dessus de « Valider » (`role="alert"`), et le focus va sur « Valider ». Un second « Valider » enregistre l'aller seul. Fermée avant la réponse, la barre dit l'échec, puis quoi faire (règle de la v4.2) : `Actions.notDone.offerRide` avec `legs` de l'envoi, ou `Actions.notDone.addPerson`, puis `Actions.why.noRetourAgain`, qui dit de recommencer pour l'aller seulement.
- **Les messages de la barre sur le retour.** Quand la page applique un état **qui n'a plus le retour que l'état précédent avait** (réponse d'une action, lecture, ou enregistrement de l'organisateur sur `/admin`), elle retire de la barre **tout message dont le sujet est sur le retour**, réussite comme échec, avant d'écrire le message de cette réponse. C'est une transition, une seule fois : les états suivants, déjà sans retour, ne retirent rien, et les échecs `noRetour` écrits par cette réponse ou par les suivantes (M7.3 à M7.8, M7.11) restent jusqu'à un envoi sur leur sujet ou « Fermer » (règle 5 de la v4.2). C'est la règle de #221 (un retrait de voiture retire tout message sur cette voiture), étendue au leg :
  - une réussite de placement dans une voiture du retour, avec son « Annuler » (« Tom est dans la voiture de Sophie ») ;
  - un échec sur une voiture, une cellule, une offre ou une modification de voiture du retour (sujets `seats:`, `undo:`, `ride:` d'une voiture du retour, `cell:{personId}:retour`, `offer:retour:…`).

  **Une exception** (v3.3.7, décision du propriétaire sur [#267](https://github.com/olaurendeau/fullcar/issues/267), relecture de PR #371, construite) : un échec de « Proposer une voiture » **sur les deux legs** (« Je ramène aussi » depuis l'Aller, « J'emmène aussi » depuis le Retour), **hors ligne ou sur une erreur** (`Actions.why.offline`, `Actions.why.failed`), **reste, réduit à sa partie aller** :
  - ses mots : `Actions.notDone.offerRide` avec `legs` = `aller`, puis la même raison. « Les voitures de Claire pour l'aller et le retour n'ont pas été proposées. Vérifiez la connexion, puis réessayez. » devient « La voiture de Claire pour l'aller n'a pas été proposée. Vérifiez la connexion, puis réessayez. » ;
  - son sujet : `offer:aller:…` seul. Proposer de nouveau la voiture pour l'aller le retire dès l'envoi ;
  - son repère : le bouton « Proposer une voiture » de l'aller ;
  - son rang dans la barre ne change pas, et **la réduction n'est pas annoncée** : la région `alert` ne relit pas une ligne dont elle a déjà dit le texte entier ; un échec pas encore annoncé l'est, dans ses mots réduits (event-board v4.4.6, « Lecteurs d'écran », critères N1.1 à N1.6).

  Tout autre échec d'une offre sur les deux legs (un refus comme `alreadyDriving` ou `passengerInCar`) part avec le retour : sa raison peut ne valoir qu'avec le retour.

  Si le focus était sur un élément d'une ligne retirée, la règle 8 de la v4.2 s'applique : sans onglets, le h1 de l'événement.
- **Cinq envois de plus, depuis une page qui montre encore le retour.** Quand ce que la personne voulait est vrai sans le retour, ce n'est pas un échec : la barre dit une information (décision 45).
  - **« Annuler » d'un placement du retour**, dans la barre. Le serveur répond `noRetour`, avec l'état, et n'écrit rien. La personne n'est plus dans cette voiture, puisque la voiture n'existe plus : la page retire la ligne et son « Annuler » (règle précédente), et n'écrit **aucun échec**, donc aucun « Annuler » qui ne pourrait jamais réussir. La barre dit l'information `Actions.info.noRetour` : « Il n'y a plus de retour pour cet événement : la voiture de Sophie n'est plus proposée. » ;
  - **« Modifier » une voiture du retour** (#93) : refusé par `noRetour`. La feuille se ferme, son leg n'existant plus. La barre dit « Les changements de la voiture de Sophie pour le retour n'ont pas été enregistrés. Il n'y a plus de retour pour cet événement. » (`Actions.notDone.editRide` + `Actions.why.noRetour`). Focus sur le h1 ;
  - **« Retirer la voiture » d'une voiture du retour** : ce que la personne demandait est fait, comme un second retrait (C8.6, « retirer de nouveau réussit »). Le serveur répond comme pour un retrait déjà fait, avec l'état et `noRetour`. La confirmation se ferme, et la barre dit l'information `Actions.info.noRetour`. Focus sur le h1 (la cellule du conducteur pour le retour n'existe plus) ;
  - **« Sortir de la voiture »**, dans une cellule du retour : la personne n'est plus dans cette voiture. Refusé par `noRetour`, rien n'est écrit ; la feuille de la cellule se ferme, et la barre dit l'information `Actions.info.noRetour` (« Il n'y a plus de retour pour cet événement : la voiture de Claire n'est plus proposée. »). Focus sur le h1 ;
  - **« Ne fait pas le retour »**, dans une cellule du retour : la personne ne fait pas le retour, puisqu'il n'y en a plus. Même traitement, avec l'information `Actions.info.noRetourLeg` (« Il n'y a plus de retour pour cet événement. »).

  « Je cherche une place » au retour reste un échec (M7.3) : la personne voulait une place au retour, et il n'y en aura pas.
- **Les informations `Actions.info.noRetour` et `Actions.info.noRetourLeg`** viennent d'un envoi, alors qu'une information de la v4.2 « ne vient d'aucun envoi » : c'est un amendement de la règle 4 et de C11.10. Pour le reste, elles suivent la règle 4 : elles remplacent l'information d'avant, et ne retirent **ni la réussite** (une réussite de l'aller déjà dans la barre reste, avec son « Annuler »), **ni aucun échec**. Seules les lignes du retour partent, par la transition ci-dessus, quand cette réponse l'apporte. Leur icône est `Users`, comme toute information, et leur repère est le h1 de l'événement.
- **Les voitures** gardent leur heure. Leur date suit le leg. Un formulaire « Proposer une voiture » ouvert après la mise à jour préremplit l'heure du leg modifié.

### Les états

| état | ce qu'on voit |
|---|---|
| chargement, lien invalide, échec et « Réessayer », sans JavaScript | pas de bouton (il est dans le panneau) ; O5.1 à O5.5 inchangés |
| replié | bouton caché avec le reste (O8.2) |
| panneau retiré (O1.10) | le bouton reste, avec les liens |
| formulaire ouvert | prérempli, focus sur « Titre », aucune requête |
| aucun champ changé | « Valider » ferme, sans requête |
| erreurs de champ | sous chaque champ ; focus sur le premier |
| événement passé | une date gardée est acceptée ; une date changée suit les bornes |
| dates déplacées, voitures existantes | la phrase des heures, par leg |
| envoi en cours | « Valider » `aria-disabled`, Entrée ignorée ; champs verrouillés ; fermer n'annule pas |
| hors ligne, ou échec du serveur | message dans la feuille, saisie gardée |
| jeton refusé | `Admin.invalid.*` dans la feuille |
| événement supprimé | `notDone.editEvent` + `why.eventNotFound` dans la feuille, « Valider » inactif |
| modifié ailleurs | `EditEvent.changed.*`, champs non changés mis à jour, case « Retour » comprise ; toute la page à jour |
| feuille fermée pendant l'envoi | la barre : `EditEvent.saved`, ou `notDone.editEvent` + la raison |
| retour décoché, vide | enregistré directement |
| retour décoché, avec des inscriptions | la confirmation et ses nombres |
| confirmation, envoi en cours | « Supprimer le retour » `aria-disabled`, avec le focus ; « Annuler » inactif pendant 10 s |
| confirmation, hors ligne ou échec | `notDone.removeRetour` + la raison, dans la confirmation |
| confirmation, événement supprimé | la même phrase avec `why.eventNotFound` ; « Supprimer le retour » reste inactif |
| confirmation, `changed` | la confirmation se ferme ; l'alerte dans la feuille |
| nombres changés pendant la confirmation | nouveaux nombres + `removeRetour.changed` |
| retour vidé pendant la confirmation | enregistré, comme un retour vide |
| enregistré | feuille fermée, en-tête à jour, barre `EditEvent.saved` |
| enregistré, relecture impossible | en-tête de la réponse, panneau retiré (O1.10), barre `EditEvent.saved` |
| chez un participant, feuille du retour refusée | la feuille se ferme ; la barre : `notDone.*` + `why.noRetour` ; focus sur le h1 |
| chez un participant, feuille de l'aller qui visait aussi le retour | la feuille reste ; « Au retour » disparaît ; `Actions.noRetour` ; un second « Valider » enregistre l'aller |
| passage à un état sans retour, la barre parle du retour | les lignes du retour, réussite et « Annuler » compris, sont retirées, une fois |
| passage à un état sans retour, la barre a l'échec hors ligne ou en erreur d'une offre sur les deux legs (v3.3.7) | la ligne reste, réduite à l'aller, à son rang ; la réduction n'est pas annoncée (event-board v4.4.6) |
| participant : « Annuler », « Retirer la voiture », « Sortir de la voiture » ou « Ne fait pas le retour » sur le retour supprimé | aucun échec ; l'information `Actions.info.noRetour` ou `noRetourLeg` |
| confirmation fermée après 10 s, puis `confirmRetour` | pas de nouvelle confirmation ; l'alerte `notDone.removeRetour` + `why.retourChanged` dans la feuille |
| participant : « Modifier » une voiture du retour supprimé | la feuille se ferme ; `notDone.editRide` + `why.noRetour` |
| organisateur : envoi de la modification en route | « Modifier l'événement » inactif (`aria-disabled`) |
| confirmation : requête sans réponse depuis 10 s | « Annuler » redevient actif |

### Le focus

| action | focus après | annonce |
|---|---|---|
| « Modifier l'événement » | le champ « Titre » | le titre de la feuille (dialog) |
| « Valider », erreurs (navigateur ou serveur) | le premier champ en erreur | — |
| « Valider », échec, refus, `changed` | va sur « Valider » (rendu actif) | l'alerte de la feuille |
| « Valider », `eventNotFound` | va sur « Annuler » (« Valider » est inactif) | l'alerte de la feuille |
| « Valider », `confirmRetour` | « Annuler » de la confirmation | le titre de la confirmation |
| confirmation, « Annuler » ou Échap | « Valider » | — |
| confirmation, nombres changés, hors ligne, échec, `invalid` | va sur « Supprimer le retour » (rendu actif) | l'alerte de la confirmation |
| confirmation, `eventNotFound` | « Annuler » de la confirmation | l'alerte de la confirmation |
| confirmation, `changed` | « Valider » de la feuille | l'alerte de la feuille |
| confirmation, `errors` | le premier champ en erreur | — |
| enregistré (avec ou sans confirmation) | « Modifier l'événement » | la barre : `EditEvent.saved` |
| « Annuler », Échap | « Modifier l'événement » | — |
| réponse arrivée feuille fermée | ne bouge pas | la barre |
| participant : l'onglet qui avait le focus disparaît | le h1 de l'événement | — |
| participant : une feuille du retour se ferme sur `noRetour` | le h1 de l'événement | la barre |
| participant : une feuille de l'aller reçoit `noRetour` | « Valider » de la feuille | `Actions.noRetour` |
| participant : l'« Annuler » d'une ligne retirée avait le focus | le h1 de l'événement (règle 8 de la v4.2) | l'information `Actions.info.noRetour` si c'est son envoi |
| participant : « Retirer la voiture » ou « Modifier » sur le retour supprimé | le h1 de l'événement | la barre |
| confirmation : « Supprimer le retour » | reste dessus (`aria-disabled`), y compris après 10 s | — |
| confirmation fermée par « Annuler » après 10 s | « Valider » de la feuille (`aria-disabled` tant que l'envoi est en route) | — |
| réponse `confirmRetour` après cette fermeture | reste sur « Valider », rendu actif | l'alerte de la feuille |

### Critères v3.3, à reporter dans l'epic

Tous par Playwright, à 360 × 780, sauf mention contraire. Scène : celle de O2.5 (`seedOrganiserScene`). Chaque scénario passe sous `organiserTraffic` (#178).

**M1 — Trouver et ouvrir le formulaire**

*En tant qu’organisateur, je trouve dans mon espace de quoi corriger l’événement, sans chercher.*

- **M1.1** Avec un lien d’organisateur valide, panneau déplié, il y a exactement un bouton nommé « Modifier l’événement » (« Edit the event »), d’au moins 44 px de haut. Dans l’ordre du document, il suit « Gardez ce lien » et précède le titre de la première section. À 360 px, sa largeur est celle du lien à partager (±1 px). À 1280 px, son bord gauche est le bord intérieur du panneau, là où commencent les liens (±1 px), et son haut est sous le bas des deux colonnes de liens.
- **M1.2** Replié, le bouton est `toBeHidden()` et absent de l’arbre d’accessibilité. O8.2 tient : Tab depuis le bouton du titre va à « Actualiser », puis hors du panneau.
- **M1.3** Aucun bouton « Modifier l’événement » pendant le chargement retenu, avec un lien invalide, après un échec du chargement, ni sur `/e/{id}`. Avec `javaScriptEnabled: false`, le HTML rendu de `/admin`, scripts exclus, ne contient pas « Modifier l’événement ». Chaque page porte tous les messages du client dans ses scripts, ceux de la feuille compris.
- **M1.4** O4.2 tient tel quel (lien à partager et « Gardez ce lien » sous le pli de 780 px, à l’arrivée). Que le bouton y soit aussi est un but de dessin, pas un critère.
- **M1.5** Un clic ouvre un `dialog` nommé « Modifier l’événement », sans aucune requête (trafic de la fixture).
  - Les champs valent ce qui est enregistré : « Titre », « Lieu », « Date de début », « Heure de début », la case « Retour » (cochée), « Date de fin », « Heure de fin ».
  - Aucun champ ni case d’option (« Rehausseurs », « Participation aux frais », « Points de RDV »).
  - Le focus est sur « Titre ».
- **M1.6** Sur un événement sans retour, la case est décochée et les champs de fin sont absents. La cocher montre « Date de fin », qui vaut la date de début, puis la suit tant qu’elle n’est pas modifiée, et « Heure de fin », vide.
- **M1.7** La date de fin suit la date de début selon l’événement chargé :
  - début et fin le 12 décembre : mettre le début au 13 met la fin au 13. Changer ensuite la fin au 14, puis le début au 15 : la fin reste au 14, et « Valider » affiche « La fin doit être après le début. » sous « Date de fin » ;
  - début le 12, fin le 13 : mettre le début au 14 laisse la fin au 13, et « Valider » affiche « La fin doit être après le début. » sous « Date de fin ».

**M2 — Enregistrer le titre, le lieu et les dates**

*En tant qu’organisateur, je corrige le titre, le lieu ou l’heure, et tout le monde voit le même lien à jour.*

- **M2.1** Changer le titre en « Tournoi de Rennes U13 », le lieu, et l’heure de début en 14:00, puis « Valider ». Alors :
  - la feuille se ferme, et le focus est sur « Modifier l’événement » ;
  - sans rechargement, le h1, le lieu et « Début … 14:00 » de l’en-tête ont les nouvelles valeurs, ainsi que la date de la section Aller du panneau, et `page.title()` vaut « Tournoi de Rennes U13 » ;
  - la barre dit « Événement modifié. Personne n’est prévenu : pensez à le dire au groupe. » ;
  - après rechargement, les mêmes valeurs ;
  - en base, `boosters_enabled`, `participation_enabled` et `stops_enabled` n’ont pas changé.
- **M2.2** Pendant M2.1, aucune URL de requête et aucun en-tête de requête ou de réponse ne contient le jeton. Le corps de la réponse ne le contient pas. Le corps de la requête le contient une fois.
- **M2.3** La validation est celle de la création :
  - titre vide : « Champ requis. » ;
  - titre de 81 caractères : « 80 caractères au maximum. » ;
  - fin le même jour, à une heure avant le début : « La fin doit être après le début. » sous « Heure de fin » ;
  - fin un jour avant : même message, sous « Date de fin » ;
  - le focus va sur le premier champ en erreur, et aucune requête ne part ;
  - en Vitest, l’action refuse les mêmes champs forgés, avec les mêmes clés.
- **M2.4** Un événement amorcé avec un début hier et une fin hier : changer le lieu et valider enregistre, sans erreur. Mettre la date de début à avant-hier affiche « Cette date est déjà passée. » ; à aujourd’hui + 366 jours, « Pas plus d’un an à l’avance. ».
- **M2.5** Ouvrir puis « Valider » sans rien changer : la feuille se ferme, aucune requête, aucun message dans la barre. De même après avoir changé le titre puis remis le titre chargé.
- **M2.6** Requête retenue par la route : « Valider » a `aria-disabled="true"` avec le même libellé, garde le focus, et ni un second clic ni Entrée (dans « Titre », puis sur « Valider ») n’envoient rien. « Titre », « Lieu », les dates et les heures ont l’attribut `readonly` : taper dans « Lieu » ne change pas sa valeur, et une saisie dans « Date de début » (`fill`, puis les touches) non plus. La case « Retour » a `aria-disabled="true"` : ni un clic sur la case, ni un clic sur le texte de sa ligne (« Retour », puis sa phrase), ni la touche Espace, la case ayant le focus, ne la changent. Au-dessus de « Valider », « Envoi en cours… » (« Sending… ») est visible, et c’est la description accessible de « Valider » (`aria-describedby`). Fermer la feuille avec Échap, puis relâcher : la barre dit `EditEvent.saved`, et l’en-tête est à jour. Rouvert après la réponse, la feuille n’a plus ni `readonly`, ni « Envoi en cours… ».
- **M2.7** « Annuler » ou Échap, après avoir changé le titre : aucune requête. Rouvrir montre le titre enregistré. Le focus est revenu sur « Modifier l’événement ».
- **M2.8** Feuille fermée par Échap pendant l’envoi (requête retenue), puis la réponse n’est pas `ok`. Pour chaque cas, la barre dit, mot pour mot, la phrase de « Une réponse qui arrive feuille fermée », le focus ne bouge pas, et l’en-tête est inchangé, sauf pour `changed` :
  - hors ligne (`setOffline(true)` avant de relâcher) : « L’événement n’a pas été modifié. Vérifiez la connexion, puis réessayez. » ;
  - route qui répond 500 : « L’événement n’a pas été modifié. Une erreur est survenue : réessayez dans un instant. » ;
  - jeton altéré par la route : « L’événement n’a pas été modifié. Une erreur est survenue : réessayez dans un instant. » ;
  - événement supprimé en base avant de relâcher : « L’événement n’a pas été modifié. Cet événement est introuvable : il a peut-être été supprimé. » ;
  - date de début mise par une requête forgée avant la borne du serveur (plus d’un jour avant la date UTC du jour ; par exemple, une semaine avant aujourd’hui) (`errors`) : « L’événement n’a pas été modifié. Un champ n’a pas été accepté : utilisez de nouveau « Modifier l’événement ». » ;
  - titre changé par un second contexte avant de relâcher (`changed`) : « L’événement n’a pas été modifié. Il venait d’être modifié depuis un autre appareil : la page montre la version enregistrée. », et le h1 a le titre du second contexte.
- **M2.9** Le pire cas. Retour avec 2 voitures et 9 personnes : décocher « Retour », changer aussi le titre, « Valider », Échap avant la réponse, puis la réponse `confirmRetour`. Alors :
  - aucune confirmation ne s’ouvre ;
  - la barre dit « L’événement n’a pas été modifié. La suppression du retour n’a pas été confirmée : utilisez de nouveau « Modifier l’événement ». » ;
  - l’en-tête a toujours « Fin » et l’ancien titre, et les onglets Aller et Retour sont là ;
  - en base, rien n’a changé : `retour_at`, le titre, les 2 Rides et les Placements du retour.
- **M2.10** Après un échec de M2.8 ou M2.9 dans la barre, un nouvel envoi de « Modifier l’événement » le retire dès l’envoi (requête retenue). Carte repliée, « Fermer » de la barre met le focus sur l’onglet actif (règle 8 de la v4.2). « Actualiser », touché après l’échec (réussi ou non), ne le retire pas : la ligne est encore là après sa réponse.
- **M2.11** Requête de la modification retenue, feuille fermée par Échap : « Modifier l’événement » a `aria-disabled="true"`, et un clic n’ouvre aucune feuille. Après la réponse, il est actif, et un clic ouvre la feuille avec les valeurs enregistrées. Aucune réponse `changed` n’apparaît dans ce scénario.
  - Requête retenue plus de 10 s (`page.clock`) : le bouton redevient actif, et un clic ouvre la feuille avec les valeurs affichées. On y change le lieu. La requête d’avant, relâchée, répond `ok` avec un nouveau titre : « Titre » montre ce titre, « Lieu » garde la saisie, et aucune alerte n’apparaît. « Valider » enregistre le lieu, sans `changed`.

**M3 — Supprimer le retour** (DE1 = b)

*En tant qu’organisateur, je supprime un retour qui n’aura pas lieu, en sachant ce que cela retire.*

- **M3.1** Retour sans voiture ni Placement : décocher, puis « Valider », enregistre sans confirmation. Ensuite :
  - l’en-tête n’a que « Début » ;
  - le tableau n’a plus d’onglets ;
  - le panneau a une vignette, une section et, replié, une ligne ;
  - « Retour » est absent du panneau et du tableau (O1.7, C5.4).
- **M3.2** Retour avec 2 voitures, 3 passagers et 4 personnes sans voiture : « Valider » ouvre un `alertdialog` nommé « Supprimer le retour ? ».
  - Il dit « Les 2 voitures proposées pour le retour seront retirées. 9 personnes ne seront plus inscrites au retour. », puis « L’aller ne change pas. », puis « Personne n’est prévenu : pensez à le leur dire. ».
  - Le focus est sur « Annuler ».
  - Rien n’a changé en base.
- **M3.3** « Annuler » : rien n’est écrit, la feuille est toujours ouverte, case décochée, et le focus est sur « Valider ».
- **M3.4** « Supprimer le retour ». En base :
  - `retour_at` est `null`, et il n’y a plus aucun Ride ni Placement de leg `retour` pour l’événement ;
  - les 9 personnes existent toujours ;
  - les Placements de l’aller sont inchangés : Tom, sans voiture à l’aller, l’est toujours ;
  - une personne qui ne faisait que le retour n’a plus aucun Placement.

  À l’écran, ce qui est dit en M3.1, et le focus est sur « Modifier l’événement ».
- **M3.5** Confirmation ouverte, un second contexte propose une voiture au retour, puis l’organisateur confirme : rien n’est écrit. La confirmation dit « Les 3 voitures… », et « Le retour a changé entre-temps : vérifiez les nombres ci-dessus, puis confirmez de nouveau. ». Le focus est sur « Supprimer le retour ». Confirmer de nouveau supprime.
  - Échange : pendant la confirmation, le second contexte retire une voiture (une personne qui conduit, sans passager) et en propose une autre (une nouvelle personne, sans passager). Les nombres restent 2 et 9 : confirmer supprime, sans `confirmRetour`.
  - Retour vidé : pendant la confirmation, le retour perd toutes ses voitures et ses Placements (amorcés à part). Confirmer enregistre : `retour_at` est `null`, la confirmation et la feuille se ferment, et la barre dit `EditEvent.saved`.
- **M3.6** (Vitest, données validées) Lancées ensemble, la suppression et une prise de place au retour se terminent de deux façons seulement : la suppression refusée parce que les nombres ont changé, ou la prise de place refusée. Jamais une ligne de leg `retour` avec `retour_at` `null`. Même chose avec « sans voiture » au retour, avec une voiture proposée au retour, et avec « Ajouter une personne » avec « Aller et retour ».
- **M3.7** La confirmation pendant son envoi et après un échec (requête retenue par la route) :
  - pendant l’envoi, « Supprimer le retour » a `aria-disabled="true"`, libellé inchangé, et garde le focus ; un second clic n’envoie rien. « Annuler » a `aria-disabled="true"`, et Échap ne ferme rien ;
  - requête retenue plus de 10 s (horloge de Playwright, `page.clock`) : « Annuler » redevient actif, et le focus est toujours sur « Supprimer le retour ». « Annuler » ferme la confirmation : la feuille reste, et le focus est sur « Valider », qui a `aria-disabled="true"` (`document.activeElement` n’est jamais `<body>`). Relâchée, la requête répond `ok` : la feuille se ferme, et la barre dit `EditEvent.saved`. Même scénario, relâchée hors ligne : la feuille dit « L’événement n’a pas été modifié et le retour n’a pas été supprimé. Vérifiez la connexion, puis réessayez. » ;
  - même scénario, relâchée après qu’un second contexte a proposé une voiture au retour (`confirmRetour`) : aucune confirmation ne s’ouvre. La feuille dit « L’événement n’a pas été modifié et le retour n’a pas été supprimé. Le retour a changé pendant la confirmation : il compte maintenant 3 voitures et 10 personnes. Utilisez de nouveau « Valider » pour confirmer. », et le focus est sur « Valider », actif. Le toucher rouvre la confirmation avec « Les 3 voitures… » ;
  - confirmation fermée après 10 s, requête encore retenue : « Lieu » a `readonly`, et taper « Salle Carrel » ne change pas sa valeur ; la case « Retour » a `aria-disabled="true"`. Relâchée, la requête répond `ok` : la feuille se ferme, la barre dit `EditEvent.saved`, et en base le lieu est celui envoyé. Rien de ce que l’organisateur a pu taper n’a été montré puis perdu ;
  - après l’alerte du `confirmRetour` tardif, les champs sont déverrouillés. Cocher de nouveau « Retour », puis « Valider » : la requête part sans suppression ; aucune confirmation ne s’ouvre ; la feuille se ferme, et en base `retour_at` est inchangé et les Rides du retour sont là ;
  - hors ligne : la confirmation reste ouverte, et dit, au-dessus des boutons (`role="alert"`), « L’événement n’a pas été modifié et le retour n’a pas été supprimé. Vérifiez la connexion, puis réessayez. ». Le focus est sur « Supprimer le retour », de nouveau actif. L’en-tête a toujours « Fin », les onglets sont là, et rien n’a changé en base ;
  - route qui répond 500 : « L’événement n’a pas été modifié et le retour n’a pas été supprimé. Une erreur est survenue : réessayez dans un instant. » ;
  - jeton altéré : « L’événement n’a pas été modifié et le retour n’a pas été supprimé. Une erreur est survenue : réessayez dans un instant. » ;
  - événement supprimé : « L’événement n’a pas été modifié et le retour n’a pas été supprimé. Cet événement est introuvable : il a peut-être été supprimé. ». « Supprimer le retour » reste `disabled`, et le focus est sur « Annuler ». « Annuler » montre la feuille, dont « Valider » est `disabled` ;
  - `changed` (titre changé par un second contexte) : la confirmation se ferme, la feuille montre l’alerte `EditEvent.changed.*`, la case « Retour » est toujours décochée, et le focus est sur « Valider » ;
  - après chaque échec, confirmer de nouveau, réseau revenu, supprime.

**M4 — Ajouter un retour** (DE2 = a)

- **M4.1** Événement sans retour, une personne sans voiture à l’aller : cocher « Retour », mettre la fin à 18:00, « Valider ». Alors :
  - sur `/admin`, sans rechargement, après la lecture de l’écran qui suit l’enregistrement : l’en-tête dit « Fin 18:00 », les onglets Aller (actif) et Retour apparaissent, et l’onglet Retour montre « Personne ne s’est encore inscrit. » ;
  - sur l’appareil de cette personne (second contexte), après rechargement : elle est « Ne fait pas le retour » dans « Vos inscriptions » ;
  - en base, aucun Placement `retour`.

**M5 — Les dates et les voitures**

- **M5.1** Aller avec 3 voitures : changer l’heure de début affiche, sous les champs de début, « Les 3 voitures déjà proposées pour l’aller gardent leur heure de départ. Prévenez les personnes qui conduisent. ». Le texte est dans l’`aria-describedby` de « Date de début » et d’« Heure de début ».
  - Remettre l’heure enregistrée le retire.
  - Avec 1 voiture : « La voiture déjà proposée pour l’aller garde son heure de départ. ».
  - Sans voiture à l’aller, la phrase est absente.
  - Même chose pour le retour, absente si la case est décochée.
- **M5.2** Après l’enregistrement d’un début au lendemain, chaque `ride.departure_time` est inchangé en base. La carte de la voiture montre la même heure. « Modifier » la voiture affiche, sous « Heure de départ », « Le {nouvelle date} ».
- **M5.3** « Proposer une voiture », ouvert à l’aller après le passage à 14:00, préremplit « Heure de départ » à 14:00.

**M6 — Deux appareils**

- **M6.1** Deux contextes ouvrent le formulaire. A change le titre et valide. B, qui affiche encore l’ancien titre, change le lieu et valide. Alors :
  - rien n’est écrit ;
  - B montre « L’événement vient d’être modifié depuis un autre appareil. » et le texte qui suit ;
  - « Titre » montre le titre de A, et « Lieu » garde la saisie de B ;
  - le h1 de B a le titre de A ;
  - « Valider » de nouveau enregistre le titre de A et le lieu de B.

  Variante : B change le titre, le remet à sa valeur chargée, et change le lieu. Après `changed`, « Titre » montre le titre de A.
- **M6.2** A supprime le retour (retour vide). B, qui a changé le titre sans toucher à la case, valide. Alors :
  - la case « Retour » de B se décoche, et les champs de fin disparaissent ;
  - la page de B n’a plus d’onglets, son en-tête n’a plus « Fin », et le panneau a une seule section ;
  - « Valider » de nouveau enregistre le titre de B, sans retour : `retour_at` reste `null`.

  À l’inverse, A ajoute un retour à 18:00 : la case de B se coche, avec « Heure de fin » à 18:00, et les onglets apparaissent sur la page de B.

**M7 — Les participants**

*En tant que participant, je vois l’événement tel qu’il est, et une action sur un retour qui n’existe plus ne fait rien en silence.*

Pour M7.3 à M7.8 : `/e/{id}` est ouvert avant la suppression du retour, sans rechargement. La barre suit la v4.2 : « {notDone} {why} ».

- **M7.1** `/e/{id}` ouvert avant la modification, puis rechargé : les nouvelles valeurs.
- **M7.2** `/e/{id}` ouvert avant la modification, sans rechargement : après une action (ajouter une personne), le h1, le lieu, « Début » / « Fin » et `document.title` ont les nouvelles valeurs.
- **M7.3** Cellule Tom · Retour, « Je cherche une place » : refusé. La feuille de la cellule se ferme. La barre dit « Tom · Retour : « Je cherche une place » n’a pas été enregistré. Il n’y a plus de retour pour cet événement. ». La page n’a plus d’onglets, et le focus est sur le h1. « Ne fait pas le retour » et « Sortir de la voiture » (Léa, voiture de Claire au retour) depuis une cellule du retour : aucun échec ; la feuille se ferme, et la barre dit l’information « Il n’y a plus de retour pour cet événement. », ou « Il n’y a plus de retour pour cet événement : la voiture de Claire n’est plus proposée. ».
- **M7.4** Aucune page `/e/{id}` ne montre de mention « modifié ». Aucune requête ne part vers un tiers. (Sur `/admin`, la barre de l’organisateur dit `EditEvent.saved` : M2.1.)
- **M7.5** « Proposer une voiture » ouvert sur l’onglet Retour, Marc conduit : « Valider » est refusé. La feuille se ferme. La barre dit « La voiture de Marc pour le retour n’a pas été proposée. Il n’y a plus de retour pour cet événement. », et le focus est sur le h1. En base, aucun Ride ni aucune personne nouvelle.
- **M7.6** « Proposer une voiture » ouvert sur l’onglet Aller, Claire conduit, « Je ramène aussi » : « Valider » est refusé, et la feuille reste ouverte.
  - Le groupe « Au retour » a disparu, et le lieu, l’heure, les places et la note de l’aller gardent leur saisie.
  - Au-dessus de « Valider » : « Il n’y a plus de retour pour cet événement : rien n’a changé. » (`role="alert"`). Le focus est sur « Valider ».
  - Rien n’a été écrit. Un second « Valider » enregistre la voiture de Claire pour l’aller seulement.
  - Même scénario, feuille fermée avant la réponse : la barre dit « Les voitures de Claire pour l’aller et le retour n’ont pas été proposées. Il n’y a plus de retour pour cet événement : proposez de nouveau la voiture, pour l’aller seulement. ».
  - Avec « Je ne fais pas le retour » : « Valider » enregistre l’aller, sans refus.
  - Avant tout envoi, un état sans retour appliqué par une autre action ne retire pas le groupe « Au retour » d’une feuille déjà ouverte.
- **M7.7** La feuille « Qui monte dans la voiture de Sophie ? » sur une voiture du retour, Tom et Léa cochés : « Valider » est refusé. La feuille se ferme. La barre dit « Tom et Léa n’ont pas pu monter dans la voiture de Sophie. Il n’y a plus de retour pour cet événement. », et le focus est sur le h1. Un tap sur une place libre d’une voiture du retour, pour Tom seul : « Tom n’a pas pu monter dans la voiture de Sophie. Il n’y a plus de retour pour cet événement. ». Jamais « Cette voiture n’est plus proposée. » : `noRetour` passe avant `rideGone`.
- **M7.8** « Ajouter une personne » sur l’onglet Retour, « Inès » : refusé. La feuille se ferme. La barre dit « Inès n’a pas pu rejoindre vos inscriptions. Il n’y a plus de retour pour cet événement. ». Depuis l’onglet Aller avec « Aller et retour » coché : la feuille reste ouverte, la case « Aller et retour » a disparu, « Il n’y a plus de retour pour cet événement : rien n’a changé. » s’affiche au-dessus de « Valider », et un second « Valider » inscrit Inès à l’aller seulement. Feuille fermée avant la réponse : « Inès n’a pas pu rejoindre vos inscriptions. Il n’y a plus de retour pour cet événement : ajoutez de nouveau cette personne, pour l’aller seulement. ».
- **M7.9** La transition (décision 44). Son exception, l’échec d’une offre sur les deux legs réduit à l’aller, a ses critères dans event-board v4.4.6 (N1.1 à N1.6).
  - **Départ.** Contexte participant, page A. Une action de cellule de Tom · Retour a échoué hors ligne : sa ligne est dans la barre. Puis Tom est placé d’un tap dans la voiture de Sophie, au retour : la barre dit aussi « Tom est dans la voiture de Sophie », avec « Annuler ». L’organisateur supprime le retour.
  - Sur la page A, « Ajouter une personne » sur l’aller applique l’état sans retour. La réussite de Tom, son « Annuler » et l’échec de la cellule ont disparu de la barre de la page A ; « Ajouter une personne » réussi n’a pas de message (règle 2 de la v4.2) : la barre de la page A est vide. Sur `/admin`, de même : l’appareil de l’organisateur a une personne, et l’action de sa cellule Retour, « Je cherche une place », a d’abord échoué hors ligne : sa ligne est dans la barre de `/admin`. Après l’enregistrement de la suppression du retour, cette ligne a disparu, et la barre ne dit que « Événement modifié. Personne n’est prévenu : pensez à le dire au groupe. ».
  - **Les échecs `noRetour` restent.** Page B, ouverte dans le même contexte (même appareil, même jeton) avant la suppression, et qui montre encore le retour. Sur la page B, « Je cherche une place » de Tom · Retour échoue avec M7.3 : cette réponse est la transition de la page B, puis l’échec est écrit. Une seconde action sur l’aller, réussie, sur la page B, applique un état encore sans retour : l’échec de M7.3 est toujours dans la barre **de la page B**.
  - **Une réussite de l’aller reste.** Autre contexte, page C. Amorcés : la voiture de Marc à l’aller, avec une place libre ; Hugo et Léa, personnes de l’appareil C (son jeton personnel) ; Léa passagère de la voiture de Claire au retour. Avant la suppression, Hugo est placé d’un tap dans la voiture de Marc, à l’aller : la barre dit « Hugo est dans la voiture de Marc », avec « Annuler ». L’organisateur supprime le retour. Sur la page C, la cellule Léa · Retour, « Sortir de la voiture » : la barre de la page C dit « Hugo est dans la voiture de Marc », toujours avec « Annuler », et l’information « Il n’y a plus de retour pour cet événement : la voiture de Claire n’est plus proposée. ». Aucun échec.
- **M7.10** Départ : contexte participant ; Tom vient d’être placé d’un tap dans la voiture de Sophie, au retour, et la barre dit « Tom est dans la voiture de Sophie », avec « Annuler » ; l’organisateur supprime le retour ; aucune action n’applique l’état sur cette page. « Annuler » est touché. Le serveur n’écrit rien. La ligne « Tom est dans la voiture de Sophie » disparaît, aucun échec n’apparaît, et la barre dit « Il n’y a plus de retour pour cet événement : la voiture de Sophie n’est plus proposée. ». Aucun bouton « Annuler » ne reste dans la barre. La page n’a plus d’onglets, et le focus est sur le h1.
- **M7.11** « Modifier » la voiture de Sophie au retour, changer l’heure, « Valider » : refusé. La feuille se ferme. La barre dit « Les changements de la voiture de Sophie pour le retour n’ont pas été enregistrés. Il n’y a plus de retour pour cet événement. », et le focus est sur le h1.
- **M7.12** « Retirer la voiture » sur la voiture de Sophie au retour, puis confirmer : aucun échec. La confirmation se ferme, la barre dit « Il n’y a plus de retour pour cet événement : la voiture de Sophie n’est plus proposée. », et le focus est sur le h1. En base, rien n’est écrit.

**M8 — Les échecs**

- **M8.1** Hors ligne, « Valider » :
  - « Action impossible, vérifiez la connexion » s’affiche dans la feuille (`role="alert"`) ;
  - la saisie reste, « Valider » est de nouveau actif, et le focus va sur « Valider » ;
  - rien n’est écrit.

  Erreur serveur (route qui répond 500) : « Une erreur est survenue et rien n’a changé. Réessayez dans un instant. ».
- **M8.2** Requête dont le jeton est altéré par la route : la feuille dit « Ce lien d’organisateur n’est pas valide. » et « Vérifiez qu’il a été copié en entier. ». Rien n’est écrit, et la réponse ne contient aucune donnée. En Vitest, jeton absent, faux, mal formé, ou d’un autre événement : `invalid`, rien n’est écrit.
- **M8.3** Événement supprimé en base pendant que la feuille est ouverte, puis « Valider » : la feuille dit « L’événement n’a pas été modifié. » et « Cet événement est introuvable : il a peut-être été supprimé. ». « Valider » est `disabled`, et le focus va sur « Annuler ».
- **M8.4** Enregistrement réussi, puis lecture du panneau qui échoue :
  - l’en-tête a les nouvelles valeurs, et la barre dit `EditEvent.saved` ;
  - le panneau montre « L’espace organisateur n’est plus à jour. Utilisez « Actualiser » pour le relire. » ;
  - « Modifier l’événement » est toujours là, avec le focus.

**M9 — Lisible partout**

- **M9.1** À 360 px, en français et en anglais, puis avec `font-size: 125%` sur la racine : la feuille et la confirmation n’ont pas de débordement horizontal, aucun bouton ne coupe son texte, et chaque cible fait au moins 44 px.
- **M9.2** En `en-GB`, les textes de la colonne `en`, aucun mot français. L’en-tête suit #235 D1.5 : « Start » puis « Saturday, December 12, 2026 at 2:00 PM », « End » puis « 9:00 PM ».
- **M9.3** À 1280 × 800, la feuille fait au plus 448 px de large, centrée.
- **M9.4** Captures (#184) : formulaire, phrase des heures, erreurs, confirmation (avec son envoi et son échec hors ligne), enregistré, échec dans la barre ; à 360 et à 1280 px.

**Amendements**

- **O4.1** (ordre) : après « Gardez ce lien », « Modifier l’événement », puis les sections.
- **O8.2** : la liste de ce qui est caché replié comprend « Modifier l’événement ».
- **#235 D2.1 à D2.4** valent aussi pour ce formulaire.
- **#216 (v4.2), table « Le repère de chaque message »** : une ligne de plus, « Modifier l’événement », en échec : le bouton « Modifier l’événement ». **Table « Le sujet d’un échec »** : une ligne de plus, « Modifier l’événement » : la modification de l’événement (`event:edit`) ; retire : un nouvel envoi de « Modifier l’événement » ; ne retire pas : « Actualiser ».
- **#216 (v4.2), règle 9** : une feuille dont le leg n’existe plus dans l’état qu’elle reçoit en réponse se ferme, et son échec va dans la barre.
- **#216 (v4.2), règle 5** (ce qui retire un échec) et **règle 2** (la réussite) : un état appliqué sans retour retire aussi tout message dont le sujet est sur le retour, réussite et « Annuler » compris (comme #221 pour une voiture retirée). Sauf un échec de « Proposer une voiture » sur les deux legs, hors ligne ou sur une erreur, qui reste, réduit à l’aller ; la réduction n’est pas annoncée (v3.3.7 ; event-board v4.4.6).
- **#216 (v4.2), règle 6** : un « Annuler » refusé par `noRetour` n’ajoute pas d’échec ; la barre dit l’information `Actions.info.noRetour`.
- **#216 (v4.2), règle 4 et C11.10** : une information peut venir d’un envoi, quand ce qu’il demandait est vrai sans le retour (`Actions.info.noRetour`, `Actions.info.noRetourLeg`). Elle ne retire ni la réussite ni aucun échec ; le sujet de cet envoi, s’il avait un échec en attente, est retiré à l’envoi (règle 5).
- **#216 (v4.2), règle 5, la transition** : seul le passage d’un état avec retour à un état sans retour retire les messages du retour ; un état suivant, déjà sans retour, ne retire rien.
- **#216 (v4.2), table « Le repère de chaque message »** : les informations `Actions.info.noRetour` et `Actions.info.noRetourLeg` ont pour repère le h1 de l’événement.
- **#216 (v4.2), C11.11, « Chaque échec, mot pour mot »** : les lignes de la table « Chaque échec de la v3.3, mot pour mot » ci-dessous s’y ajoutent.

### Chaque échec de la v3.3, mot pour mot (amendement de C11.11)

Dans la barre, `Actions.failure` = « {notDone} {why} » (v4.2). L’icône est `WifiOff` hors ligne, `TriangleAlert` sinon. Les envois qui ne laissent pas d’échec (« Annuler » d’un placement du retour, « Retirer la voiture » et « Sortir de la voiture » d’une voiture du retour, « Ne fait pas le retour ») disent une information, icône `Users` : « Il n’y a plus de retour pour cet événement : la voiture de Sophie n’est plus proposée. » (« This event no longer has a return trip: Sophie’s car is no longer offered. »), ou « Il n’y a plus de retour pour cet événement. » (« This event no longer has a return trip. ») (M7.3, M7.10, M7.12).

| action | réponse | fr | en | clés | critères |
|---|---|---|---|---|---|
|  « Modifier l’événement », feuille fermée pendant l’envoi | hors ligne | L’événement n’a pas été modifié. Vérifiez la connexion, puis réessayez. | The event was not changed. Check your connection, then try again. | `notDone.editEvent` + `why.offline` | M2.8, M2.9  |
|  « Modifier l’événement », feuille fermée pendant l’envoi | erreur serveur (500, réseau), `invalid` | L’événement n’a pas été modifié. Une erreur est survenue : réessayez dans un instant. | The event was not changed. Something went wrong: try again in a moment. | `notDone.editEvent` + `why.failed` | M2.8, M2.9  |
|  « Modifier l’événement », feuille fermée pendant l’envoi | `eventNotFound` | L’événement n’a pas été modifié. Cet événement est introuvable : il a peut-être été supprimé. | The event was not changed. This event can no longer be found: it may have been deleted. | `notDone.editEvent` + `why.eventNotFound` | M2.8, M2.9  |
|  « Modifier l’événement », feuille fermée pendant l’envoi | `errors` | L’événement n’a pas été modifié. Un champ n’a pas été accepté : utilisez de nouveau « Modifier l’événement ». | The event was not changed. A field was not accepted: use “Edit the event” again. | `notDone.editEvent` + `why.editErrors` | M2.8, M2.9  |
|  « Modifier l’événement », feuille fermée pendant l’envoi | `changed` | L’événement n’a pas été modifié. Il venait d’être modifié depuis un autre appareil : la page montre la version enregistrée. | The event was not changed. It had just been changed from another device: the page shows the saved version. | `notDone.editEvent` + `why.eventChanged` | M2.8, M2.9  |
|  « Modifier l’événement », feuille fermée pendant l’envoi | `confirmRetour` | L’événement n’a pas été modifié. La suppression du retour n’a pas été confirmée : utilisez de nouveau « Modifier l’événement ». | The event was not changed. Removing the return trip was not confirmed: use “Edit the event” again. | `notDone.editEvent` + `why.retourNotConfirmed` | M2.8, M2.9  |
|  « Supprimer le retour », confirmation fermée après 10 s, puis feuille fermée | hors ligne | L’événement n’a pas été modifié et le retour n’a pas été supprimé. Vérifiez la connexion, puis réessayez. | The event was not changed and the return trip was not removed. Check your connection, then try again. | `notDone.removeRetour` + `why.offline` | M3.7  |
|  « Supprimer le retour », confirmation fermée après 10 s, puis feuille fermée | erreur serveur (500, réseau), `invalid` | L’événement n’a pas été modifié et le retour n’a pas été supprimé. Une erreur est survenue : réessayez dans un instant. | The event was not changed and the return trip was not removed. Something went wrong: try again in a moment. | `notDone.removeRetour` + `why.failed` | M3.7  |
|  « Supprimer le retour », confirmation fermée après 10 s, puis feuille fermée | `eventNotFound` | L’événement n’a pas été modifié et le retour n’a pas été supprimé. Cet événement est introuvable : il a peut-être été supprimé. | The event was not changed and the return trip was not removed. This event can no longer be found: it may have been deleted. | `notDone.removeRetour` + `why.eventNotFound` | M3.7  |
|  « Supprimer le retour », confirmation fermée après 10 s, puis feuille fermée | `errors` | L’événement n’a pas été modifié et le retour n’a pas été supprimé. Un champ n’a pas été accepté : utilisez de nouveau « Modifier l’événement ». | The event was not changed and the return trip was not removed. A field was not accepted: use “Edit the event” again. | `notDone.removeRetour` + `why.editErrors` | M3.7  |
|  « Supprimer le retour », confirmation fermée après 10 s, puis feuille fermée | `changed` | L’événement n’a pas été modifié et le retour n’a pas été supprimé. Il venait d’être modifié depuis un autre appareil : la page montre la version enregistrée. | The event was not changed and the return trip was not removed. It had just been changed from another device: the page shows the saved version. | `notDone.removeRetour` + `why.eventChanged` | M3.7  |
|  « Supprimer le retour », confirmation fermée après 10 s, puis feuille fermée | `confirmRetour` (nombres changés : 3 voitures, 10 personnes) | L’événement n’a pas été modifié et le retour n’a pas été supprimé. Le retour a changé pendant la confirmation : il compte maintenant 3 voitures et 10 personnes. Utilisez de nouveau « Modifier l’événement ». | The event was not changed and the return trip was not removed. The return trip changed during the confirmation: it now has 3 cars and 10 people. Use “Edit the event” again. | `notDone.removeRetour` + `why.retourChanged` | M3.7  |
|  Cellule, « Je cherche une place » : Tom · Retour | `noRetour` | Tom · Retour : « Je cherche une place » n’a pas été enregistré. Il n’y a plus de retour pour cet événement. | Tom · Return: “I need a seat” was not saved. This event no longer has a return trip. | `notDone.choice` + `why.noRetour` | M7.3  |
|  Un tap sur une place : Tom, voiture de Sophie au retour | `noRetour` | Tom n’a pas pu monter dans la voiture de Sophie. Il n’y a plus de retour pour cet événement. | Tom could not be seated in Sophie’s car. This event no longer has a return trip. | `notDone.seats` + `why.noRetour` | M7.7  |
|  La feuille « Qui monte… ? » : Tom et Léa, voiture de Sophie au retour | `noRetour` | Tom et Léa n’ont pas pu monter dans la voiture de Sophie. Il n’y a plus de retour pour cet événement. | Tom and Léa could not be seated in Sophie’s car. This event no longer has a return trip. | `notDone.seats` + `why.noRetour` | M7.7  |
|  « Proposer une voiture » depuis le Retour : Marc | `noRetour` | La voiture de Marc pour le retour n’a pas été proposée. Il n’y a plus de retour pour cet événement. | Marc’s car for the return trip was not offered. This event no longer has a return trip. | `notDone.offerRide` + `why.noRetour` | M7.5  |
|  « Proposer une voiture » depuis l’Aller, « Je ramène aussi », feuille fermée : Claire | `noRetour` | Les voitures de Claire pour l’aller et le retour n’ont pas été proposées. Il n’y a plus de retour pour cet événement : proposez de nouveau la voiture, pour l’aller seulement. | Claire’s cars for the outbound and return trips were not offered. This event no longer has a return trip: offer the car again, for the outbound trip only. | `notDone.offerRide` + `why.noRetourAgain` | M7.6  |
|  « Proposer une voiture » depuis l’Aller, « Je cherche une place » au retour, feuille fermée : Claire | `noRetour` | La voiture de Claire pour l’aller n’a pas été proposée. Il n’y a plus de retour pour cet événement : proposez de nouveau la voiture, pour l’aller seulement. | Claire’s car for the outbound trip was not offered. This event no longer has a return trip: offer the car again, for the outbound trip only. | `notDone.offerRide` + `why.noRetourAgain` | M7.6  |
|  « Ajouter une personne » depuis le Retour : Inès | `noRetour` | Inès n’a pas pu rejoindre vos inscriptions. Il n’y a plus de retour pour cet événement. | Inès could not be added to your sign-ups. This event no longer has a return trip. | `notDone.addPerson` + `why.noRetour` | M7.8  |
|  « Ajouter une personne » depuis l’Aller, « Aller et retour », feuille fermée : Inès | `noRetour` | Inès n’a pas pu rejoindre vos inscriptions. Il n’y a plus de retour pour cet événement : ajoutez de nouveau cette personne, pour l’aller seulement. | Inès could not be added to your sign-ups. This event no longer has a return trip: add this person again, for the outbound trip only. | `notDone.addPerson` + `why.noRetourAgain` | M7.8  |
|  « Modifier » la voiture : Sophie, retour | `noRetour` | Les changements de la voiture de Sophie pour le retour n’ont pas été enregistrés. Il n’y a plus de retour pour cet événement. | The changes to Sophie’s car for the return trip were not saved. This event no longer has a return trip. | `notDone.editRide` + `why.noRetour` | M7.11  |

### Exigences pour l'architecte

- Le jeton d'admin voyage dans le corps d'une nouvelle action, comme dans `loadOrganiserPanel`. C'est le transport d'un jeton : la PR est mergée par l'humain.
- L'état que rend `readEventState` (et les actions qui le renvoient) porte l'en-tête de l'événement. La page applique en-tête, onglets et dates à partir de cet état, et non plus seulement des props du serveur. L'organisateur l'applique aussi depuis la réponse de `updateEvent`.
- Les écritures sur un leg vérifient que ce leg existe, dans leur transaction, avec un ordre de verrous Event, puis Ride, puis Person (M3.6). Un envoi qui écrirait sur le retour d'un événement qui n'en a plus est refusé par `noRetour`, avant tout autre refus, `rideGone` compris, et sa réponse porte l'état (M7.3 à M7.8).
- La barre de #66 sert aussi à l'espace organisateur : `updateEvent` y écrit sa réussite et ses échecs, avec les règles de la v4.2 (#216).
- Rien de nouveau n'est stocké : ni colonne, ni migration, ni clé dans le navigateur.

### Effet sur les tâches

- **#204** (repli) : rien à changer. Le bouton se pose dans son conteneur ; la tâche de modification passe après #204.
- **#232** (`/nouveau`) et **#235** (« Début » / « Fin ») : l'extraction des champs de `CreateEventForm` passe après les deux, pour ne pas toucher le même fichier en même temps.
- Découpage proposé :
  1. l'état porte l'en-tête, et la page l'applique (M7.2), sans rien changer à l'écran ;
  2. `updateEvent` : titre, lieu, dates, concurrence (M2, M5, M6, M8) ;
  3. le bouton et la feuille (M1, M2 à l'écran, M9) ;
  4. supprimer et ajouter le retour, la confirmation et ses échecs, refus `noRetour` dans les feuilles des participants, messages de la barre sur le retour, et test de concurrence (M3, M4, M6.2, M7.3 à M7.12) ;
  5. les échecs de la modification dans la barre, feuille fermée, et le bouton inactif pendant l'envoi (M2.8 à M2.11).

### Décisions du propriétaire (2026-10-20, [#250](https://github.com/olaurendeau/fullcar/issues/250))

- **DE1 — Supprimer un retour qui a des voitures ou des personnes.** C'est une perte de données. **Décision : (b).**
  - (a) Refuser tant que le retour a une voiture ou une personne : l'organisateur doit demander à chacun de se retirer. Rien n'est perdu, mais il ne peut pas retirer la voiture d'un autre (« Administrer l'événement » n'existe pas).
  - (b) **Retenue.** Permettre, après une confirmation qui dit combien de voitures et de personnes sont retirées et que personne n'est prévenu. Les Rides et Placements du retour sont supprimés, les personnes restent. C'est ce que la page dessine.
  - (c) Masquer sans supprimer : `retour_at` à `null`, lignes du retour gardées et rendues si le retour revient. Rien n'est perdu, mais des données personnelles restent stockées sur un leg que personne ne voit, des voitures périmées reviennent, et ce qu'on stocke change de sens.
- **DE2 — Ajouter un retour à un événement qui n'en avait pas.** **Décision : (a).**
  - (a) **Retenue.** Personne n'y est placé : chacun déclare. On n'écrit rien à la place des gens, et le cas le plus fréquent (« à l'aller seulement ») ne demande rien. C'est ce que la page dessine.
  - (b) Chaque personne concernée par l'aller devient « sans voiture » au retour, comme la case « Aller et retour » cochée par défaut. La couverture est juste tout de suite, mais ceux qui ne reviennent pas doivent se retirer.

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
| replié, événement rempli, focus sur le bouton, 360 × 780 | Replier (v3.2) | O8.1 à O8.4 |
| déplié : première visite, ou nouveau tap | Replier (v3.2) | O8.4, O8.5 |
| formes du résumé : N = 0, leg vide, événement vide, sans voiture proposée, sans retour, pire cas à deux chiffres | Replier (v3.2) | O8.3 |
| replié : actualisation en cours, actualisation impossible, panneau retiré, retiré puis impossible | Replier (v3.2) | O8.6 |
| « Réessayer » aboutit, état gardé replié | Replier (v3.2) | O5.3, O8.5, O8.6 |
| replié, en anglais | Replier (v3.2) | O7.1, O8.3 |
| replié à 1280 px : rempli, sans retour, actualisation impossible | Replier (v3.2) | O8.7 |
| replié à 1280 px : événement vide, panneau retiré après une action (phrase sous la ligne du titre) | Replier (v3.2.1) | O7.2, O8.6, O8.7 |
| texte agrandi à 125 % : ligne du titre passée à la ligne, « Actualiser » à droite, résumé passé à la ligne | Replier (v3.2.1) | O8.1, O8.3 |
| v3.3 : déplié, « Modifier l'événement » sous « Gardez ce lien », pli mesuré | Modifier l'événement | M1.1, M1.4 |
| v3.3 : replié, bouton caché | Modifier l'événement | M1.2 |
| v3.3 : formulaire prérempli | Modifier l'événement | M1.5 |
| v3.3 : heures changées, phrase des voitures par leg | Modifier l'événement | M5.1 |
| v3.3 : erreurs (titre vide, fin avant le début) | Modifier l'événement | M2.3 |
| v3.3 : événement passé, date gardée acceptée | Modifier l'événement | M2.4 |
| v3.3 : « Retour » décoché | Modifier l'événement | M3.1 |
| v3.3 : « Supprimer le retour ? », et nombres changés | Modifier l'événement | M3.2, M3.5 |
| v3.3 : envoi en cours, hors ligne, modifié ailleurs, lien refusé | Modifier l'événement | M2.6, M8.1, M6.1, M8.2 |
| v3.3 : enregistré ; retour supprimé ; retour ajouté ; relecture impossible | Modifier l'événement | M2.1, M3.4, M4.1, M8.4 |
| v3.3 : chez un participant, action sur un retour supprimé | Modifier l'événement | M7.3 |
| v3.3 : à 1280 px, le bouton sous les liens | Modifier l'événement | M1.1, M9.3 |
| v3.3 : en anglais (formulaire, confirmation, enregistré) | Modifier l'événement | M9.2 |
| v3.3.2 : participant, « Proposer une voiture » depuis le Retour, refusé : feuille fermée, barre | Modifier l'événement | M7.5 |
| v3.3.2 : participant, « Proposer une voiture » depuis l'Aller avec « Je ramène aussi », refusé : feuille ouverte sans « Au retour » | Modifier l'événement | M7.6 |
| v3.3.2 : participant, « Qui monte… ? » sur une voiture du retour supprimé : feuille fermée, barre | Modifier l'événement | M7.7 |
| v3.3.2 : confirmation, envoi en cours ; hors ligne ; événement supprimé | Modifier l'événement | M3.7 |
| v3.3.2 : feuille fermée pendant l'envoi, `confirmRetour` : la barre | Modifier l'événement | M2.9 |
| v3.3.2 : événement supprimé, dans la feuille, « Valider » inactif | Modifier l'événement | M8.3 |
| v3.3.3 : les échecs de la barre au style d'erreur de la v4.2 (`.bar.err`) | Modifier l'événement | M2.9, M7.3, M7.5, M7.7, M7.11 |
| v3.3.3 : participant, la barre parlait du retour : ligne retirée, information `Actions.info.noRetour` | Modifier l'événement | M7.9, M7.10, M7.12 |
| v3.3.3 : participant, « Modifier » une voiture du retour supprimé | Modifier l'événement | M7.11 |
| v3.3.3 : confirmation sans réponse depuis 10 s, « Annuler » revenu | Modifier l'événement | M3.7 |
| v3.3.3 : envoi de la modification en route, « Modifier l'événement » inactif | Modifier l'événement | M2.11 |
| v3.3.4 : confirmation fermée, puis les nombres ont changé : alerte dans la feuille, sans nouvelle confirmation | Modifier l'événement | M3.7 |
| v3.3.4 : « Ne fait pas le retour » sur un retour supprimé : l'information `Actions.info.noRetourLeg` (dessinée avec `Actions.info.noRetour`, même style) | Modifier l'événement | M7.3 |
| v3.3.5 : champs verrouillés pendant l'envoi (non dessiné : même rendu, attribut `readonly`) | — | M2.6, M3.7 |
| v3.5 : avant et après, 360 × 780, avec une session et en attente, pli et onglets mesurés, « Personnes inscrites » repliée | Replier les legs | O9.2, O9.7 |
| v3.5 : legs repliés avec une session ; arrivée après la création, en attente, événement vide | Replier les legs | O9.1–O9.3, O9.6 |
| v3.5 : Aller déplié, Retour replié (focus, `aria-expanded`) | Replier les legs | O9.1, O9.4 |
| v3.5 : les huit formes du résumé replié, singuliers et pire cas compris | Replier les legs | O9.3 |
| v3.5 : texte agrandi à 125 % ; sans retour ; 60 personnes, Retour déplié | Replier les legs | O9.1, O9.2, O9.3 |
| v3.5 : actualisation impossible ; panneau retiré ; espace organisateur replié | Replier les legs | O9.5, O9.6 |
| v3.5 : en anglais | Replier les legs | O9.1, O9.3 |
| v3.5 : 1280 px, legs repliés, Aller déplié, en attente, « Personnes inscrites » dans la colonne de gauche | Replier les legs | O9.4, O9.8 |

Non dessinés, faute d'UI propre :

- copie impossible et partage natif absent : inchangés, #3 C4.4 et C4.5 (O4.3) ;
- stockage indisponible (v3.2) : le panneau est déplié, comme à une première visite, et rien ne le signale ;
- relecture réussie après une action : le panneau suit, sans message de plus.
- (v3.3.2) les autres échecs de la confirmation (erreur, `invalid`) : la même alerte que hors ligne, avec leur raison ;
- (v3.3.2) les autres échecs feuille fermée (M2.8) : la même ligne de barre que M2.9, avec leur raison ;
- (v3.3.2) « Ajouter une personne » refusé par `noRetour` (M7.8) : comme M7.5 et M7.6 ;
- (v3.3) feuille et confirmation à 125 % : rien de propre à dessiner, M9.1 le vérifie.

## Les mots

| clé | fr | en | critère |
|---|---|---|---|
| `Admin.title` | Espace organisateur | Organiser area | inchangé ; v3.2 : nom du bouton qui replie (O8.1), qui reçoit le focus après « Réessayer » |
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

**v3.2 : aucune clé nouvelle.** Le bouton qui replie a pour nom `Admin.title`. Le résumé reprend les clés de la vignette : `Event.legs.*`, `Board.tabCount`, `Board.banner.everyoneSeated`, `Admin.tile.free`, `Admin.tile.missing` et `Event.nobody`. Replié et retiré, c'est `Admin.stale`. En anglais, le bouton dit « Organiser area », et les lignes se lisent Outbound, « 2 without a car », « 3 free seats » ; Return, « 4 without a car », « 2 seats missing ». Une ligne du résumé n'a **aucun caractère séparateur**, pas plus que la vignette.

**v3.3 : modifier l'événement.**

| clé | fr | en | critère |
|---|---|---|---|
| `Admin.edit` | Modifier l’événement | Edit the event | M1.1 |
| `EditEvent.title` | Modifier l’événement | Edit the event | M1.5 |
| `EditEvent.carTimes.aller` | {count, plural, one {La voiture déjà proposée pour l’aller garde son heure de départ.} other {Les # voitures déjà proposées pour l’aller gardent leur heure de départ.}} Prévenez les personnes qui conduisent. | {count, plural, one {The car already offered for the outbound trip keeps its departure time.} other {The # cars already offered for the outbound trip keep their departure time.}} Let the drivers know. | M5.1 |
| `EditEvent.carTimes.retour` | {count, plural, one {La voiture déjà proposée pour le retour garde son heure de départ.} other {Les # voitures déjà proposées pour le retour gardent leur heure de départ.}} Prévenez les personnes qui conduisent. | {count, plural, one {The car already offered for the return trip keeps its departure time.} other {The # cars already offered for the return trip keep their departure time.}} Let the drivers know. | M5.1 |
| `EditEvent.removeRetour.title` | Supprimer le retour ? | Remove the return trip? | M3.2 |
| `EditEvent.removeRetour.body` | {cars, plural, =0 {Aucune voiture n’est proposée pour le retour.} one {La voiture proposée pour le retour sera retirée.} other {Les # voitures proposées pour le retour seront retirées.}} {persons, plural, =0 {} one {# personne ne sera plus inscrite au retour.} other {# personnes ne seront plus inscrites au retour.}} | {cars, plural, =0 {No car is offered for the return trip.} one {The car offered for the return trip will be removed.} other {The # cars offered for the return trip will be removed.}} {persons, plural, =0 {} one {# person will no longer be signed up for the return trip.} other {# people will no longer be signed up for the return trip.}} | M3.2 (v3.3.2 : « retirées ») |
| `EditEvent.removeRetour.aller` | L’aller ne change pas. | The outbound trip does not change. | M3.2 |
| `EditEvent.removeRetour.confirm` | Supprimer le retour | Remove the return trip | M3.2 |
| `EditEvent.removeRetour.changed` | Le retour a changé entre-temps : vérifiez les nombres ci-dessus, puis confirmez de nouveau. | The return trip changed in the meantime: check the numbers above, then confirm again. | M3.5 |
| `EditEvent.changed.title` | L’événement vient d’être modifié depuis un autre appareil. | The event has just been changed from another device. | M6.1 |
| `EditEvent.changed.body` | Rien n’a été enregistré. Les champs que vous n’aviez pas changés montrent maintenant la version enregistrée : vérifiez, puis validez de nouveau. | Nothing was saved. The fields you had not changed now show the saved version: check them, then confirm again. | M6.1 |
| `EditEvent.saved` | Événement modifié. Personne n’est prévenu : pensez à le dire au groupe. | Event updated. Nobody is notified: remember to tell the group. | M2.1 |
| `Actions.noRetour` | Il n’y a plus de retour pour cet événement : rien n’a changé. | This event no longer has a return trip: nothing has changed. | M7.6, M7.8 : dans une feuille ouverte seulement (v3.3.2) |
| `Actions.why.noRetour` | Il n’y a plus de retour pour cet événement. | This event no longer has a return trip. | M7.3, M7.5, M7.6, M7.7, M7.8 : la raison, dans la barre (v3.3.2) |
| `Actions.notDone.editEvent` | L’événement n’a pas été modifié. | The event was not changed. | M2.8, M2.9, M8.3 (v3.3.2) |
| `Actions.notDone.removeRetour` | L’événement n’a pas été modifié et le retour n’a pas été supprimé. | The event was not changed and the return trip was not removed. | M3.7, dans la confirmation, puis la feuille ou la barre si elle est fermée après 10 s (v3.3.2, v3.3.3) |
| `Actions.why.noRetourAgain` | Il n’y a plus de retour pour cet événement : {action, select, offerRide {proposez de nouveau la voiture, pour l’aller seulement.} other {ajoutez de nouveau cette personne, pour l’aller seulement.}} | This event no longer has a return trip: {action, select, offerRide {offer the car again, for the outbound trip only.} other {add this person again, for the outbound trip only.}} | M7.6, M7.8 : feuille de l’aller fermée avant la réponse (v3.3.3) |
| `Actions.info.noRetour` | Il n’y a plus de retour pour cet événement : la voiture de {driver} n’est plus proposée. | This event no longer has a return trip: {driver}’s car is no longer offered. | M7.3, M7.10, M7.12 : une information, pas un échec ; « Annuler », « Retirer la voiture », « Sortir de la voiture » (v3.3.3, v3.3.4) |
| `EditEvent.sending` | Envoi en cours… | Sending… | M2.6 : sous les champs verrouillés, au-dessus de « Valider », qu’elle décrit (`aria-describedby`) (v3.3.6) |
| `Actions.info.noRetourLeg` | Il n’y a plus de retour pour cet événement. | This event no longer has a return trip. | M7.3 : « Ne fait pas le retour » (v3.3.4). Même texte que `Actions.why.noRetour`, volontairement : l’une est une information, l’autre la raison d’un échec (v3.3.5) |
| `Actions.why.retourChanged` | Le retour a changé pendant la confirmation : il compte maintenant {cars, plural, one {# voiture} other {# voitures}} et {persons, plural, one {# personne} other {# personnes}}. {where, select, sheet {Utilisez de nouveau « Valider » pour confirmer.} other {Utilisez de nouveau « Modifier l’événement ».}} | The return trip changed during the confirmation: it now has {cars, plural, one {# car} other {# cars}} and {persons, plural, one {# person} other {# people}}. {where, select, sheet {Use “Confirm” again.} other {Use “Edit the event” again.}} | M3.7 : après `notDone.removeRetour`, dans la feuille ou la barre (v3.3.4) |
| `Actions.why.editErrors` | Un champ n’a pas été accepté : utilisez de nouveau « Modifier l’événement ». | A field was not accepted: use “Edit the event” again. | M2.8 (v3.3.2) |
| `Actions.why.eventChanged` | Il venait d’être modifié depuis un autre appareil : la page montre la version enregistrée. | It had just been changed from another device: the page shows the saved version. | M2.8 (v3.3.2) |
| `Actions.why.retourNotConfirmed` | La suppression du retour n’a pas été confirmée : utilisez de nouveau « Modifier l’événement ». | Removing the return trip was not confirmed: use “Edit the event” again. | M2.9 (v3.3.2) |

Réutilisées sans changement :

- `CreateEvent.title`, `location`, `allerDate`, `allerTime`, `retour`, `retourHint`, `retourDate`, `retourTime` et `errors.*`, avec les valeurs de #235 (« Date de début », « Heure de fin », « La fin doit être après le début. ») ;
- `Actions.submit` (« Valider »), `cancel`, `offline`, `failed` ;
- de la v4.2 (#216) : `Actions.failure`, `Actions.notDone.choice`, `notDone.leave`, `notDone.offerRide`, `notDone.seats`, `notDone.addPerson`, `notDone.editRide`, `Actions.why.offline`, `why.failed` (aussi pour `invalid`), `why.eventNotFound` ;
- `RideChanges.remove.notified` ;
- `Admin.invalid.title` et `body`.

Les mots français sont épicènes. Le mot « Modifier » est celui de « Gardez ce lien » (« C’est le seul moyen de modifier l’événement »), qui devient vrai.

## Décisions

Les décisions 53 à 60 (v3.4, v3.5) sont dans « Replier les legs », sous « Décisions (v3.4, v3.5) ».

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
19. (v3.2, corrigée en v3.2.1) Le titre est le bouton qui replie, sur le motif de « Vos inscriptions » (#66), **mais avec le chevron collé au titre**, alors que « Vos inscriptions » le met au bout de la ligne. — C'est le même geste que l'autre carte repliable de l'écran. Au bout du bouton, le chevron toucherait « Actualiser » et se lirait comme un menu de ce bouton. Un bouton-icône de 44 px de plus ne tiendrait pas à côté d'« Actualiser » à 360 px. L'écart est voulu : ne pas aligner les deux cartes plus tard.
20. (v3.2) Le nom reste « Espace organisateur », l'état est dit par `aria-expanded`, et le résumé est hors du bouton. — Un nom qui change à chaque toucher, et un titre de deux lignes à pastilles, se lisent mal ; le résumé disparaît au dépli.
21. (v3.2) L'état est gardé par événement (`fullcar:organiser-folded:{id}`), et la clé n'existe que replié. — Un événement juste créé arrive toujours déplié, liens et avertissement visibles (#3 C4.2). Replier un événement ne cache pas les liens d'un autre. Un panneau déplié n'écrit rien.
22. (v3.2, précisée en v3.2.2) Le résumé reprend les textes de la vignette, une ligne par leg, **qui peut passer à la ligne**, et n'est pas un bouton. — Ni mot ni ambre nouveaux, et la preuve est simple : même texte que la vignette. Le seul geste de la carte repliée est de la déplier.
23. (v3.2) Replié et retiré, la phrase de retrait remplace le résumé. — Le résumé est une donnée lue, comme les vignettes.
24. (v3.2) Aucune animation. — C'est ce que fait « Vos inscriptions ». Une hauteur animée ferait travailler la compensation du défilement (O1.11) à chaque image. `prefers-reduced-motion` est ainsi tenu par construction.
25. (v3.2) Après « Réessayer », le focus va sur le bouton du titre. — Il existe dans les deux états ; un h2 focusable qui contient un bouton serait deux arrêts pour un seul titre.
26. (v3.2.1) Aucun espace entre le bouton du titre et « Actualiser » ; un toucher juste à gauche d'« Actualiser » replie la carte. — 8 px d'écart feraient passer « Actualiser » à la ligne sur les téléphones les plus étroits. Le geste raté se défait d'un toucher, sans requête et sans rien perdre.
27. (v3.3) « Modifier l'événement » est dans le contenu repliable, après « Gardez ce lien », jamais sur la ligne du titre. — La ligne du titre est pleine à 360 px (décision 26). À la création, le lien à partager reste la première chose vue, et le pli tient. Replié, on déplie d'un toucher.
28. (v3.3) Le bouton n'est pas dans l'en-tête de l'événement. — L'en-tête est le même que sur `/e/{id}` (#235 D1.6) ; tout ce qui est à l'organisateur est dans sa carte (décision 1).
29. (v3.3) Le formulaire est une feuille du bas qui reprend les champs et la validation de la création, sans les options. — Mêmes mots, mêmes erreurs, un seul code ; les options sont l'epic #68.
30. (v3.3) Une date égale à celle enregistrée est acceptée même passée. — Sinon, corriger le lieu d'un événement d'hier serait impossible.
31. (v3.3) Les voitures gardent leur heure de départ, et une phrase le dit dans le formulaire. — L'heure est celle de la personne qui conduit. La décaler d'office pourrait passer minuit, et `departure_time` n'a pas de date.
32. (v3.3) Modifications simultanées : le formulaire envoie les valeurs chargées, et le serveur refuse si elles ont changé ; les champs non touchés prennent la valeur enregistrée. — Pas de colonne nouvelle, et rien n'est écrasé sans le savoir.
33. (v3.3) Personne n'est prévenu, et rien ne marque l'événement comme modifié ; la barre de l'organisateur le dit. — Les notifications sont hors V1. Une mention « modifié le » demanderait une colonne, donc une décision humaine.
34. (v3.3) L'état qu'une action ou une lecture rend porte l'en-tête (titre, lieu, début, fin). — Une page ouverte se met à jour à sa prochaine action, et la fraîcheur de #67 n'aura rien de plus à faire.
35. (v3.3, précisée en v3.3.2) La confirmation de la suppression du retour donne les nombres comptés par le serveur, et le serveur refuse si ces nombres ont changé ; s'ils sont tombés à zéro, il enregistre. — L'organisateur confirme des nombres, et c'est eux que le serveur compare. Un échange qui garde les nombres passe : la confirmation ne nomme ni voiture ni personne, et DE1 parle de chiffres. Comparer des identifiants refuserait un changement que la confirmation n'aurait jamais montré.
36. (v3.3.1) Décidé par le propriétaire le 2026-10-20 ([#250](https://github.com/olaurendeau/fullcar/issues/250)) : DE1 = (b). Un retour qui a des voitures ou des personnes se supprime après la confirmation ; ses Rides et ses Placements sont supprimés, les personnes restent. — Refuser bloquerait l'organisateur, qui ne peut pas retirer la voiture d'un autre ; masquer garderait des données personnelles sur un leg que personne ne voit.
37. (v3.3.1) Décidé par le propriétaire le 2026-10-20 ([#250](https://github.com/olaurendeau/fullcar/issues/250)) : DE2 = (a). Personne n'est placé sur un retour ajouté. — On n'écrit rien à la place des gens, et le cas le plus fréquent (« à l'aller seulement ») ne demande rien.
38. (v3.3.2) Un échec de la modification, feuille fermée, va dans la barre avec la règle de la v4.2 : « L'événement n'a pas été modifié. » puis la raison. Pour `confirmRetour`, la confirmation ne s'ouvre pas après coup. — La barre ne dit jamais un échec générique (#216). Une confirmation surgie sans geste serait une modale que personne n'attend.
39. (v3.3.2, précisée en v3.3.3) Pendant l'envoi de la confirmation, « Supprimer le retour » est `aria-disabled` et garde le focus ; pendant 10 s, ni « Annuler » ni Échap ne la ferment, et elle dit sa réponse elle-même. Au-delà, « Annuler » revient, et la réponse est dite dans la feuille, ou dans la barre si la feuille est fermée aussi. C'est un écart voulu avec « Retirer la voiture ». — Hors ligne, l'organisateur doit lire que le retour n'a pas été supprimé, là où il a confirmé. `aria-disabled` plutôt que `disabled` : le focus ne sort pas de la modale (décision 12). Les 10 s : une requête qui ne répond pas ne doit pas enfermer l'organisateur. Une server action n'a pas de délai qu'on puisse fixer côté page, et sa réponse peut encore arriver.
40. (v3.3.2) Un envoi qui écrirait sur un retour qui n'existe plus est refusé par `noRetour`, avant `rideGone`. Dans la barre, « {notDone} » puis `Actions.why.noRetour` ; `Actions.noRetour` ne sert que dans une feuille ouverte. — La cause est le retour, pas la voiture. Règle de la v4.2 : la barre nomme ce qui n'a pas été fait.
41. (v3.3.2) Une feuille garde les legs qu'elle avait à son ouverture jusqu'à la réponse de son envoi. Au refus `noRetour`, une feuille du retour se ferme ; une feuille de l'aller reste, sans sa partie « retour », et un second « Valider » enregistre l'aller. — Rien ne change sous les doigts ; ce qui n'a plus de sens disparaît au moment où la page le dit, et la saisie de l'aller n'est pas perdue.
42. (v3.3.2) Sur `changed`, toute la page prend l'état de la base, et la case « Retour » suit la règle des champs non changés. — Un retour supprimé par l'autre appareil n'est jamais rajouté en silence.
43. (v3.3.2) La date de fin suit la date de début quand elles étaient le même jour à l'ouverture. Sinon, elle ne suit pas. — Le cas courant est un événement d'une journée. Un écart de plusieurs jours est voulu, et le recopier serait deviner.
44. (v3.3.3, précisée en v3.3.4 et en v3.3.7) Le passage d'un état avec retour à un état sans retour retire de la barre tout message sur le retour, réussite et « Annuler » compris, une seule fois. **Exception**, décidée par le propriétaire sur [#267](https://github.com/olaurendeau/fullcar/issues/267) (relecture de PR #371) : un échec de « Proposer une voiture » sur les deux legs, hors ligne ou sur une erreur, reste, réduit à sa partie aller. Ses mots deviennent ceux de l'aller seul (« La voiture de Claire pour l'aller n'a pas été proposée. », puis la même raison), son sujet `offer:aller:…` seul, et son repère le bouton « Proposer une voiture » de l'aller. Il garde son rang, et la réduction n'est pas annoncée (event-board v4.4.6). Tout autre échec d'une offre sur les deux legs part avec le retour. — C'est la règle de #221 pour une voiture retirée, étendue au leg : la barre ne parle jamais d'une voiture qui n'existe plus, et ne garde aucun « Annuler » qui ne pourrait pas réussir. Une transition, et non chaque état : sinon les échecs `noRetour` seraient effacés par l'action suivante, contre la règle 5 de la v4.2. L'exception : Claire doit toujours savoir que sa voiture n'a pas été proposée pour l'aller. « Vérifiez la connexion » et « Une erreur est survenue » restent vrais sans le retour ; un refus peut ne valoir qu'avec lui (« Claire conduit déjà une voiture. », quand c'est au retour qu'elle conduisait).
45. (v3.3.3, étendue en v3.3.4) Un envoi dont le but est vrai sans le retour ne laisse pas d'échec : la barre dit une information. C'est le cas de « Annuler » d'un placement du retour, « Retirer la voiture » et « Sortir de la voiture » d'une voiture du retour (`Actions.info.noRetour`), et de « Ne fait pas le retour » (`Actions.info.noRetourLeg`). « Je cherche une place » au retour, « Modifier » une voiture du retour, et les envois qui créent quelque chose au retour laissent un échec. — Dans les premiers cas, ce que la personne voulait est fait. Un échec dirait le contraire, et l'échec d'un « Annuler » porterait un « Annuler » sans issue. Dans les autres, ce qui était demandé n'existera pas.
46. (v3.3.3) `invalid` prend la raison générique `Actions.why.failed`, comme dans la v4.2 ; `Actions.why.adminInvalid` est retirée. — Seule une requête forgée produit `invalid` : le jeton d'organisateur ne change jamais. Dans la feuille, l'alerte `Admin.invalid.*` (M8.2) reste, comme les clés génériques des feuilles.
47. (v3.3.3) Feuille de l'aller fermée avant un refus `noRetour` : la raison dit quoi faire, recommencer pour l'aller seulement (`Actions.why.noRetourAgain`). Pour une feuille du retour, il n'y a rien à refaire. — Règle de la v4.2 : la raison dit pourquoi et quoi faire. Claire peut encore proposer sa voiture à l'aller.
48. (v3.3.3) « Modifier l'événement » est `aria-disabled` tant qu'un envoi de la modification est en route. — Rouvrir pendant l'envoi chargerait des valeurs sur le point de changer, et l'envoi suivant recevrait un faux « modifié depuis un autre appareil ».
49. (v3.3.4) Une réponse `confirmRetour` qui arrive après que l'organisateur a fermé la confirmation ne la rouvre pas : une alerte dans la feuille donne les nouveaux nombres, et « Valider » la rouvre. — C'est la règle de la décision 38 : pas de modale que personne n'attend. Si l’organisateur recoche « Retour » après cette alerte, « Valider » envoie sans suppression : le retour reste, et aucune confirmation ne s’ouvre. (Pendant l’envoi, la case est verrouillée : elle ne peut pas être recochée avant la réponse.)
50. (v3.3.4) « Valider » de la feuille est `aria-disabled` pendant l'envoi, et non `disabled` ; seul `eventNotFound` le rend `disabled`. — La confirmation fermée après 10 s rend le focus à « Valider ». `disabled`, il tomberait sur `<body>`, contre la règle 8 de la v4.2 et la décision 12.
51. (v3.3.4) « Modifier l'événement » redevient actif après 10 s sans réponse, comme la confirmation. Une réponse `ok` arrivée feuille rouverte met à jour ses valeurs chargées et ses champs non changés, sans alerte. — Une requête bloquée ne doit pas imposer de recharger la page, et le second envoi ne doit pas recevoir de faux `changed`. **Limite acceptée** : si l’envoi bloqué A est enregistré en base, mais que sa réponse n’est pas encore arrivée quand l’envoi B part, B reçoit `changed`, dont l’alerte dit « depuis un autre appareil » alors que c’est le même. Rien n’est perdu : les champs changés de B restent, et un second « Valider » les enregistre.
52. (v3.3.5) Pendant l'envoi de la feuille, ses champs sont verrouillés (`readOnly`, case `aria-disabled`) jusqu'à la réponse. — Une réponse tardive (`ok` après la confirmation fermée à 10 s, notamment) ne doit jamais trouver une saisie faite après l'envoi : elle fermerait la feuille en annonçant « Événement modifié » sur des changements jamais envoyés. Verrouiller est plus simple et plus sûr que de fusionner : rien ne change sous les doigts, et toutes les réponses suivent la même règle. Une feuille qui n'a pas envoyé (décision 51) garde ses champs libres. (v3.3.6) Une ligne « Envoi en cours… » (`EditEvent.sending`) dit pourquoi les champs ne répondent pas ; elle décrit « Valider » par `aria-describedby`.

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
- Garder le jeton d'admin sur l'appareil.
- **Le QR code du lien à partager** (DO2). L'epic #67 (lien perso) aura besoin d'un QR code et décidera comment le produire ; celui du lien à partager pourra suivre avec le même composant.
- La fraîcheur automatique (#67), qui suivra la règle d'un seul bloc.
- Imprimer.
- Les options à l'écran (#68).
- Le tableau des participants (#66 v4.1).
- Le mode sombre.
- (v3.2) Replier d'autres cartes, ou garder l'état des listes dépliées (O5.7 : jusqu'au rechargement, rien n'est stocké).
- (v3.2) Synchroniser l'état replié entre onglets, ou entre appareils.
- (v3.2) Retirer la clé à la purge de l'événement.
- (v3.2) L'icône qui tourne pendant une lecture sous `prefers-reduced-motion` : elle est partagée avec toute l'application.
- (v3.3) Modifier les options (#68).
- (v3.3) Modifier ou retirer la voiture ou la personne d'un autre (« Administrer l'événement »).
- (v3.3) Décaler d'office l'heure des voitures.
- (v3.3) Une mention « modifié le », un historique, une annulation de la modification.
- (v3.3) Prévenir les participants (notifications, hors V1).
- (v3.3) Une fin sans retour (#235, nouvelle colonne).
- (v3.3) Modifier depuis `/e/{id}`, ou changer le jeton d'organisateur.
- (v3.4, v3.5) Voir « Hors périmètre (v3.4, v3.5) », dans « Replier les legs ».

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
- v3.2 (2026-10-19) : à la demande de l'humain, la carte se replie.
  - Le titre devient le bouton qui replie, avec un chevron.
  - Repliée, la carte a une ligne par leg : les textes de la vignette, avec la pastille ambre de la v4.1.
  - L'état est gardé par événement dans `localStorage` (`fullcar:organiser-folded:{id}` = `1`) ; il est déplié par défaut, et sans stockage.
  - Critères O8.1 à O8.9. Amendements de O1.8, O1.10, O2.10, O4.2, O5.3, O5.8, O7.2 et O7.4. Aucune clé de message nouvelle.
  - Section « Replier » de la page : 9 maquettes à 360 px et 3 navigateurs à 1280 px. Les 19 lignes de titre existantes ont le chevron.
  - Corrigé : la balise `</li>` de la révision v3.1, sur la page.

  Rendu vérifié avec Chrome headless (`chrome`) :
  - aucun débordement horizontal dans les maquettes à 360 px ni dans les navigateurs à 1280 px ; la page tient à 360 px ;
  - les 34 lignes de titre (25 maquettes, et 9 navigateurs réduits) mesurent 32 px, avec le bouton et « Actualiser » sur la même ligne, en français et en anglais ;
  - aucune cible sous 44 px ;
  - les lignes du résumé font 20 px (une ligne), pire cas à deux chiffres compris ;
  - à 1280 px, les lignes Aller et Retour ont leurs hauts alignés.

  Republiée à la même URL.
- v3.2.1 (2026-10-19) : la revue de design a approuvé la v3.2 sans bloquant. Les suggestions 2 à 8 sont appliquées ; la 1 est portée par le coordinateur auprès de l'humain, et la 9 va dans une issue à part.
  - **2** : la ligne du titre passée à la ligne est dessinée (texte à 125 %). « Actualiser » est en `ml-auto`, donc à droite (la CSS de la maquette le mettait à gauche). Le h2 est l'élément `flex-1` (erreur, corrigée en v3.2.2 : `flex-auto min-w-0`), et le bouton y est en `w-full`. 12 px entre les rangées.
  - **3** : O8.1 et O8.3 ne mesurent plus « une ligne », mesure qui dépend de la police. Ils vérifient : rien ne se chevauche, rien n'est coupé, rien ne dépasse, à 360 px et à 125 %.
  - **4** : O8.5 parle de « la seule clé que cette fonction ajoute ». Les clés `fullcar:personal-token:{id}` de #66 sont permises.
  - **5** : le résumé n'a aucun caractère séparateur. Les « · » du README sont retirés.
  - **6** : l'écart avec « Vos inscriptions » (chevron collé au titre, et non au bout de la ligne) est écrit comme voulu (décision 19).
  - **7** : la carte « Le bouton » de la page disait 8 px ; elle dit maintenant « sans espace ». Le toucher juste à gauche d'« Actualiser » est traité (décision 26).
  - **8** : l'événement vide et le panneau retiré, repliés, sont dessinés à 1280 px. La place de la phrase de retrait est écrite : sous la ligne du titre si la carte est repliée, sous les liens si elle est dépliée.

  Aucune remarque contestée.

  Rendu vérifié avec Chrome headless (`chrome`) :
  - 37 lignes de titre : 36 sur une ligne, et celle à 125 % passée à la ligne ;
  - « Actualiser » toujours aligné sur le bord droit du panneau, sans chevauchement avec le bouton ;
  - aucun libellé coupé (seules les étiquettes bleues d'annotation dépassent) ;
  - aucune ligne du résumé ne dépasse ;
  - aucun débordement horizontal dans les 10 maquettes à 360 px ni dans les 5 navigateurs à 1280 px de la section ; la page tient à 360 px ;
  - aucune cible sous 44 px ;
  - à 1280 px, les lignes Aller et Retour ont leurs hauts alignés.

  Republiée à la même URL.
- v3.2.2 (2026-10-19) : revue v3.2.1, changements demandés.
  - **Bloquant** : le h2 est en `flex-auto min-w-0`, et non `flex-1 min-w-0`, aux quatre endroits : la ligne du titre et O8.1 dans ce README, la carte « Le bouton » et la légende de l'état à 125 % sur la page. Avec `flex-1`, « Actualiser » restait sur la ligne et le titre passait à la ligne dans le bouton. O8.1 a désormais un test qui l'attrape : le titre tient sur une ligne à 125 %.
  - **Suggestions** :
    - anneau de focus intérieur (`focus-visible:ring-inset`) sur le bouton du titre, avec `-ml-2` sur le h2 et `pl-2` sur le bouton ; il est dessiné ;
    - « peut passer à la ligne » dans la décision 22, dans la légende « Les formes du résumé » et dans le texte de la v3.1 sur « Actualiser » (« 32 px dans tous les états ») ;
    - `gap-y-3` : 12 px à 100 %, 15 px à 125 %, égal aux deux marges `-my-1.5`. La maquette à 125 % le montre.

  Aucune remarque contestée.

  Rendu vérifié avec Chrome headless (`chrome`) :
  - 37 lignes de titre, « Actualiser » toujours sur le bord droit, sans chevauchement ;
  - aucun titre sur deux lignes, y compris à 125 % ;
  - aucun libellé d'interface coupé ;
  - aucun débordement horizontal ;
  - aucune cible sous 44 px.

  Republiée à la même URL.
- v3.3 (2026-10-20) : à la demande du propriétaire, modifier l'événement (le repli reste la v3.2.2, #204).
  - Section « Modifier l'événement » : où est le bouton, le formulaire, enregistrer, modifications simultanées, supprimer et ajouter le retour, les participants, les états, le focus, critères M1 à M9, exigences pour l'architecte, effet sur les tâches.
  - 13 clés nouvelles, décisions 27 à 35. DE1 et DE2 sont soumises au propriétaire ; les maquettes dessinent DE1 = (b) et DE2 = (a).
  - Page : section « Modifier l'événement (v3.3) », 18 maquettes à 360 px, un navigateur à 1280 px, 3 maquettes en anglais.

  Rendu vérifié avec Chrome headless (`chrome`) :
  - aucun débordement horizontal dans les maquettes ; la page tient dans un cadre de 360 px ;
  - aucun libellé de bouton ni valeur de champ coupés ; aucune cible sous 44 px ;
  - pli : « Gardez ce lien » finit à 698 px, « Modifier l'événement » à 758 px.

  Republiée à la même URL (version 8).
- v3.3.1 (2026-10-20) : le propriétaire a décidé DE1 = (b) et DE2 = (a) ([#250](https://github.com/olaurendeau/fullcar/issues/250)).
  - README : l'epic #250 est dans l'en-tête ; la section « Décisions du propriétaire (2026-10-20) » est ajoutée en tête ; le comportement de « Supprimer le retour » et celui d'« Ajouter un retour » sont dits décidés ; les titres de M3 et M4 disent (DE1 = b) et (DE2 = a) ; « Décisions à prendre » devient « Décisions du propriétaire » ; les décisions 36 et 37 sont ajoutées ; l'étape 4 du découpage n'attend plus DE1 et DE2.
  - Page : les mêmes décisions, avec le lien vers #250 ; la liste « Décisions » et les critères v3.3 de la page sont désormais le texte du README, mot pour mot (décisions 1 à 37 ; M1 à M9 et les amendements).
  - Aucun texte de critère ne change : seuls les titres de M3 et M4 changent.

  Republiée à la même URL.
- v3.3.2 (2026-10-20) : revue de la v3.3.1, changements demandés.
  - **Bloquants.**
    - 1 : les échecs d'un participant sur un retour supprimé suivent la barre de la v4.2 (#216) : `Actions.notDone.*`, puis `Actions.why.noRetour` (nouvelle). `Actions.noRetour` ne sert plus que dans une feuille ouverte. `noRetour` passe avant `rideGone`. M7.3 réécrit.
    - 2 : les feuilles d'un participant sur un retour supprimé sont spécifiées (« Ce que voient les participants ») et dessinées : « Proposer une voiture » depuis le Retour (la feuille se ferme), depuis l'Aller avec « Je ramène aussi » (elle reste, sans « Au retour », et un second « Valider » enregistre l'aller), « Qui monte… ? » sur une voiture du retour (elle se ferme). Une feuille garde ses legs jusqu'à sa réponse. Critères M7.5 à M7.8.
    - 3 : la réponse de la modification feuille fermée va dans la barre, « L'événement n'a pas été modifié. » puis la raison, pour chaque réponse (section « Une réponse qui arrive feuille fermée »). Le pire cas (`confirmRetour` après Échap) est dessiné. Critères M2.8 à M2.10. Sujet et repère ajoutés aux tables de la v4.2.
    - 4 : la confirmation a son envoi (« Supprimer le retour » et « Annuler » inactifs, Échap sans effet) et ses réponses, dites dans la confirmation : hors ligne, erreur, `invalid`, `eventNotFound`, `changed`, `errors`, nombres changés. Trois maquettes. Critère M3.7.
  - **Suggestions, toutes appliquées.**
    - Décision 35 reformulée : le serveur compare des nombres, et un échange qui les garde passe (M3.5).
    - Un retour vidé pendant la confirmation s'enregistre (M3.5).
    - « Changé » est défini : différent de la valeur chargée. M2.5 et M6.1 le testent.
    - Sur `changed`, toute la page est mise à jour, et la case « Retour » suit la règle des champs (M6.2).
    - M7.4 vaut pour `/e/{id}`.
    - M4.1 dit quand.
    - La date de fin suit la date de début quand elles étaient le même jour (M1.7, décision 43).
    - « retirées » dans `EditEvent.removeRetour.body`.
    - L'en-tête anglais suit #235 D1.5 (M9.2).
    - L'événement supprimé est dessiné, « Valider » inactif, avec `Actions.why.eventNotFound` (M8.3).
    - M3.6 couvre « Ajouter une personne ».
    - M8.1 : « le focus va sur « Valider » ».
  - 7 clés nouvelles ; décisions 38 à 43.
  - Page : 8 maquettes nouvelles, une remplacée (le participant), une réduite (lien refusé). Décisions, critères et mots de la v3.3 : texte du README, mot pour mot, vérifié par script.

  Aucune remarque contestée.

  Rendu vérifié avec Chrome headless (`chrome`) :
  - aucun débordement, aucun libellé coupé, aucune cible sous 44 px dans les 9 maquettes de la v3.3.2 ;
  - la page tient dans un cadre de 360 px.

  Republiée à la même URL.
- v3.3.3 (2026-10-20) : revue de la v3.3.2, changements demandés.
  - **Bloquants.**
    - 1 : les échecs de la barre (M2.9, M7.3, M7.5, M7.7, et le nouveau M7.11) sont dessinés dans le style d'erreur de la v4.2, `.bar.err` (fond `background`, bordure `destructive`, icône rouge), repris d'event-board.
    - 2 : un état appliqué sans retour retire de la barre tout message sur le retour, réussite et « Annuler » compris (règle de #221 étendue au leg, décision 44). « Annuler » d'un placement du retour et « Retirer la voiture » d'une voiture du retour ne laissent pas d'échec, mais l'information `Actions.info.noRetour` (décision 45). « Modifier » une voiture du retour échoue avec `notDone.editRide` + `why.noRetour`. Critères M7.9 à M7.12 ; amendements des règles 2, 5 et 6 et de la table des repères de la v4.2.
  - **Suggestions, toutes appliquées.**
    - M2.10 teste « Actualiser », qui ne retire pas l'échec.
    - La table « Chaque échec de la v3.3, mot pour mot » amende C11.11 : 23 lignes, en français et en anglais.
    - `Actions.why.adminInvalid` est retirée ; `invalid` prend `why.failed`, comme la v4.2 (décision 46).
    - Feuille de l'aller fermée avant un refus `noRetour` : la raison dit quoi faire, `Actions.why.noRetourAgain` (M7.6, M7.8, décision 47).
    - La confirmation : « Supprimer le retour » en `aria-disabled` ; « Annuler » revient après 10 s (décision 39 précisée, M3.7).
    - « Modifier l'événement » est inactif tant qu'un envoi est en route (M2.11, décision 48).
  - 2 clés nouvelles (`Actions.why.noRetourAgain`, `Actions.info.noRetour`), une retirée (`Actions.why.adminInvalid`) ; décisions 44 à 48.
  - Page : 4 maquettes nouvelles ; la table des échecs y est rendue depuis le README.

  Aucune remarque contestée.

  Rendu vérifié avec Chrome headless (`chrome`) :
  - aucun débordement, aucun libellé coupé, aucune cible sous 44 px, aucune barre qui recouvre la page dans les 13 maquettes des v3.3.2 et v3.3.3 ;
  - la page tient dans un cadre de 360 px ;
  - décisions, critères, mots et table des échecs de la page : texte du README, vérifié par script.

  Republiée à la même URL.
- v3.3.4 (2026-10-20) : la v3.3.3 est approuvée, sans bloquant. Ses dix suggestions sont appliquées, pour que la copie de `docs/design` soit finale.
  - 1 : « Valider » est `aria-disabled` pendant l'envoi, et non `disabled` (M2.6, décision 50). Quand la confirmation se ferme après 10 s, le focus va sur lui, jamais sur `<body>` (M3.7).
  - 2 : à 10 s, le focus reste sur « Supprimer le retour », dans le README comme dans la maquette, redessinée.
  - 3 : un `confirmRetour` arrivé confirmation fermée ne la rouvre pas. Une alerte dans la feuille donne les nouveaux nombres, et « Valider » la rouvre (décision 49, M3.7, maquette nouvelle).
  - 4 : cette ligne dit que les nombres ont changé : `Actions.why.retourChanged`, et non « n'a pas été confirmée ».
  - 5 : « Sortir de la voiture » et « Ne fait pas le retour » sur un retour supprimé donnent une information (`Actions.info.noRetour`, `Actions.info.noRetourLeg`) ; décision 45 étendue, M7.3. Leurs deux lignes quittent la table des échecs (21 lignes).
  - 6 : la décision 44 est une transition, et les échecs `noRetour` restent (M7.9).
  - 7 : amendement de la règle 4 et de C11.10. L'information vient d'un envoi, et ne retire ni la réussite de l'aller ni aucun échec (M7.9).
  - 8 : apostrophe `’` dans les 21 cellules françaises de la table des échecs et dans tous les textes des critères M1 à M9, hors code.
  - 9 : les échecs `notDone.removeRetour` de la barre ont pour sujet `event:edit` et pour repère « Modifier l'événement ».
  - 10 : « Modifier l'événement » redevient actif après 10 s sans réponse. Une réponse `ok` arrivée feuille rouverte met à jour ses valeurs chargées (M2.11, décision 51).

  Aucune suggestion rejetée.

  Rendu vérifié avec Chrome headless (`chrome`) :
  - aucun débordement, aucun libellé coupé, aucune cible sous 44 px ;
  - la page tient dans un cadre de 360 px ;
  - décisions, critères, mots et table des échecs de la page : texte du README, vérifié par script.

  Republiée à la même URL.
- v3.3.5 (2026-10-20) : revue de la v3.3.4, deux bloquants.
  - **Bloquants.**
    - 1 : M7.9 demandait deux réussites à la fois, ce que la règle 1 de la v4.2 interdit. Il est réécrit en quatre parties : départ ; transition sur la page A ; échecs `noRetour` qui restent, sur une page B du même contexte, en lisant la barre de la page B ; réussite de l'aller qui reste, sur une page C d'un autre contexte, avec « Sortir de la voiture » au retour. M7.10 écrit son départ en entier.
    - 2 : les champs de la feuille sont verrouillés pendant l'envoi (`readOnly`, case « Retour » `aria-disabled`), sur tous les chemins (décision 52). Une réponse tardive, `ok` compris, ne peut donc perdre aucune saisie. Une feuille rouverte qui n'a pas envoyé garde la règle de la décision 51. M2.6 et M3.7 le testent.
  - **Suggestions, toutes appliquées.**
    - Décision 49 : la case « Retour » recochée après l'alerte : « Valider » envoie sans suppression (M3.7).
    - M7.9 nomme ses pages et dit quelle barre il lit.
    - L'amendement de la table des repères nomme `Actions.info.noRetourLeg`.
    - M2.6 teste Entrée.
    - La décision 51 écrit sa limite acceptée.
    - « États couverts » a trois lignes de plus.
    - L'anglais de `Actions.why.retourChanged` dit « Use “Confirm” again. ».
    - `Actions.info.noRetourLeg` dit qu'elle reprend volontairement le texte de `Actions.why.noRetour`.
  - Aucune remarque contestée. Aucune maquette nouvelle ; deux légendes précisées (« Envoi en cours », « sans réponse depuis 10 s »).

  Rendu vérifié avec Chrome headless (`chrome`) : la page tient dans un cadre de 360 px. Décisions, critères, mots et table des échecs de la page : texte du README, vérifié par script.

  Republiée à la même URL.
- v3.3.6 (2026-10-20) : la v3.3.5 est approuvée. Ce qui suit vient du tri du coordinateur sur #250, et ne relance pas de revue.
  - **La ligne « Envoi en cours… »** (`EditEvent.sending`, EN « Sending… ») s'affiche tant que les champs sont verrouillés, au-dessus de « Valider », qui la référence par `aria-describedby`. Elle est dans la décision 52, dans M2.6, dans la table des mots, et dans la maquette « Envoi en cours ».
  - **Cinq précisions de test** :
    - M2.6 : la case « Retour » résiste à un clic sur le texte de sa ligne et à la touche Espace ;
    - M2.6 : un champ date ignore aussi la saisie pendant le verrouillage ;
    - M7.9 : la barre de la page A est vide ;
    - M7.9 : sur `/admin`, un échec du retour est d'abord mis dans la barre ;
    - M7.9 : la page C amorce la voiture de Marc à l'aller, avec une place libre, et Hugo sur l'appareil C.

  Republiée à la même URL.
- v3.3.7 (2026-10-22) : [#372](https://github.com/olaurendeau/fullcar/issues/372), suite des relectures de PR #371 (#267) et de PR #376 (#268).
  - **Décision 44** : elle dit l'exception décidée par le propriétaire sur #267 et construite par PR #371. Un échec de « Proposer une voiture » sur les deux legs, hors ligne ou sur une erreur, reste, réduit à sa partie aller (mots, sujet, repère) ; tout autre échec sur les deux legs part avec le retour. Même exception dans « Les messages de la barre sur le retour », dans l'amendement de la règle 5 de la v4.2 et dans « Les états » ; M7.9 renvoie aux critères.
  - **L'annonce de la ligne réduite** est tranchée dans event-board v4.4.6, qui possède « Lecteurs d'écran » : réduire une ligne n'est pas l'écrire, et rien n'est annoncé. Critères N1.1 à N1.6 là-bas.
  - **M1.1** : « le bord intérieur du panneau, là où commencent les liens » (lecture déjà retenue par PR #376).
  - **M1.3** : « le HTML rendu de `/admin`, scripts exclus » ; chaque page porte tous les messages du client dans ses scripts.
  - Aucun mot nouveau, aucune maquette nouvelle. Pas encore relue en revue de design. Republiée à la même URL.
- v3.3.8 (2026-10-22) : la v3.3.7 est approuvée, avec event-board v4.4.6. Suggestions de la revue retenues par le coordinateur, sans nouvelle revue :
  - décision 44, spécification, amendement de la règle 5, ligne d'états et légende : « la réduction n'est pas annoncée », au lieu de « rien n'est annoncé ». Un échec pas encore annoncé l'est, dans ses mots réduits (event-board N1.3) ;
  - décision 44 et spécification : « tout autre échec **d'une offre** sur les deux legs part avec le retour ». « Ajouter une personne » avec « Aller et retour » n'est pas visé ;
  - les critères d'event-board v4.4.6 sont renommés N1.1 à N1.6. A1.x existait déjà dans `docs/design/home/` et dans les titres de `e2e/home.spec.ts` et `e2e/create-event.spec.ts`. K1, essayé d'abord, est le critère de « Nous contacter » (#69), dans `e2e/contact.spec.ts`, `docs/design/home/` et `docs/design/language-switch/`. N1 n'apparaît nulle part dans `docs`, `e2e` ni `src`.

  La décision du propriétaire ne change pas. Republiée à la même URL.
- v3.3.8 (suite) : relecture : **approuvée**. Corrections de texte, sans nouvelle revue : critères d'event-board renommés N1.1 à N1.6 (voir ci-dessus), et l'en-tête dit la v3.3.8 approuvée. Republiée à la même URL.
- v3.3.9 (2026-10-23) : v3.3.8 approuvée. Correction de texte, sans nouvelle décision (#442) : dans M2.8, « date de début mise à hier par une requête forgée » ne pouvait pas se produire, `serverBounds` acceptant un jour de plus que l’appareil ; le cas devient une date « avant la borne du serveur (plus d’un jour avant la date UTC du jour ; par exemple, une semaine avant aujourd’hui) », comme l’avait proposé la revue de #414. Republiée à la même URL.
- v3.4 (2026-10-25) : les legs se replient, [#648](https://github.com/olaurendeau/fullcar/issues/648). Chaque section de leg est repliée au premier affichage ; repliée, elle garde son nom, qui est son bouton, la pastille ambre et les places. L'état est gardé en mémoire seulement. Trois questions au propriétaire (vignettes, repli de tout l'espace organisateur, mémoire de l'état). Dessinée contre `organizer-account` v4 (#581). Critères O9.1 à O9.10 ; décisions 53 à 58 ; aucune clé de traduction nouvelle. Mesures : à 360 × 780 avec une session, les onglets du tableau passent de 1 603 px (2 265 px avec 60 personnes) à 712 px. Revue de design : modifications demandées, 2 points bloquants (l'action par personne laissée dans les lignes contredit `remove-person` v1 ; O9.2, O9.7 et l'amendement du focus deviennent faux avec « Personnes inscrites »), et des suggestions.
- v3.5 (2026-10-25) : revue de la v3.4 appliquée, et réponses du propriétaire. **Réponses** : Q1, Q2 et Q3 = (a), comme recommandé ; la variante à vignettes et le critère « si Q1 = b » sont retirés. **Décision du coordinateur** : « Personnes inscrites » (#645) est repliée par défaut, avec un bouton de titre sur toute la largeur ; elle est dessinée repliée après les legs, en gris et sans cadre pointillé, comme une voisine. **Bloquants.** (1) La place d'une action par personne dans les lignes des legs, son cadre pointillé et ses règles sont retirés ; « Le voisin : « Personnes inscrites » (#645) » renvoie à RP4.1 et à la décision 2 de `remove-person` (décision 59). (2) O9.2 et l'ordre au clavier finissent « au premier élément qui suit les sections des legs » ; O9.7 s'arrête aux sections des legs et dit que la suite est réglée par #645 ; l'amendement du focus porte sur O5.8, et dit « le bouton de ce titre » pour toute section dont le titre est un bouton, legs et « Personnes inscrites » (décision 60). **Suggestions.** Q1 dit que la couverture passe du haut du panneau à après le lien, l'avis et « Modifier l'événement » (sections à 367 et 609 px, vignettes à 149 et 81 px) ; la ligne des vignettes du tableau des mesures dit « exemple, 60 personnes » partout ; amendements ajoutés de O1.10, O8.1 et des lignes à vignettes des « États à concevoir » de #154 ; la citation rangée sous O5.7 passe sous O5.8 ; O9.9 lance WebKit depuis le test, comme `e2e/create-event.spec.ts` ; « l'espace organisateur replié (O8) » partout au lieu de « carte », que le glossaire réserve à la carte d'un leg ; `Board.tabCount` avec sa forme plurielle réelle ; O9.3 et la maquette des formes ont les cas au singulier ; mesures avec « Personnes inscrites » repliée (+65 px à 360 px : onglets à 777 px avec une session, 1 019 px en attente ; à 1280 px, 657 et 629 px). Rendu vérifié dans Chrome sans interface. Republiée à la même URL.
