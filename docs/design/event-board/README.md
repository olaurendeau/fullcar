# Écran d’un événement : s’inscrire, proposer une voiture, prendre une place

- Artifact : https://claude.ai/artifact/RV9ktAqKxrgzmumgn22AEj
- Epic : https://github.com/olaurendeau/fullcar/issues/66
- Décision de l’humain pour la v4 : https://github.com/olaurendeau/fullcar/issues/66#issuecomment-6250124984
- Tâches : #86 (PR #141), #87 (PR #152, adaptée ensuite), #88 à #93, #95, #216 (la barre
  de messages, v4.2)
- Décision de l’humain pour la v4.2 : https://github.com/olaurendeau/fullcar/issues/216
  (option (a))
- v4.3 : « Début » et « Fin » dans l’en-tête et dans le formulaire de création. Epic :
  https://github.com/olaurendeau/fullcar/issues/235 ; option (a) choisie par le propriétaire
  le 20/10 (« Décision du propriétaire »)
- v4.4 : « Valider » sans changement dans « Modifier » une personne n’envoie rien. Tâche :
  https://github.com/olaurendeau/fullcar/issues/298 ; même règle que « Modifier l’événement »
  (organizer-view v3.3, M2.5). Deux corrections du README notées sur #216 y sont reportées
- v4.4.2 : les règles 2 et 3 de la barre suivent la règle 4. L’information n’est retirée
  qu’à la fin d’une action commencée après elle. Décision du propriétaire sur PR #339
  (« Trouver une place », #172) :
  https://github.com/olaurendeau/fullcar/pull/339. « Annuler » est construit (#170, PR #340).
  v4.4.3 : après la revue, la région `status` n’est vidée que si elle annonce encore
  l’information.
- v4.4.4 : « Annuler » et l’information, quatre cas tranchés (#341), et le sujet d’un échec
  `noRetourAgain`, pour #267. Voir « Ce qui change en v4.4.4 »
- v4.4.5 : une réussite de placement retenue sous une feuille n’est pas écrite si une action
  envoyée après elle, réussie, a déjà changé l’état d’une de ses personnes sur son leg (#359) ;
  « Valider » sans changement dans « Modifier la voiture » n’envoie rien (#313). Voir « Ce qui
  change en v4.4.5 »
- v4.4.6 : quand le retour est supprimé, l’échec hors ligne ou en erreur d’une offre sur les
  deux legs reste, réduit à l’aller (décision du propriétaire sur #267, construite par PR
  #371), et cette réduction n’est pas annoncée (#372). Voir « Ce qui change en v4.4.6 »
- v4.5 : l’autre leg de « Proposer une voiture » se lit depuis l’événement. Les choix
  deviennent « Je ramène aussi des passagers » et « J’emmène aussi des passagers », et une
  ligne dit où et quand part l’autre leg (décision du propriétaire, #649). Voir « Ce qui
  change en v4.5 »
- v4.6 : sur téléphone, une feuille qui porte un champ de saisie prend toute la hauteur
  visible ; toute feuille garde son titre en haut et ses boutons en bas, au-dessus du
  clavier, et seul son corps défile (#650). Aucun mot nouveau. Voir « Ce qui change en
  v4.6 »
- v4.7 : le geste « retour » du navigateur (glisser depuis le bord gauche sur iPhone, le
  bouton « retour » d’Android) ferme la feuille ouverte, comme Échap, au lieu de quitter la
  page (#656). L’adresse ne change pas, et une feuille fermée autrement ne laisse aucune
  entrée d’historique. Dans une étape, le retour revient à l’étape d’avant, comme
  « Annuler » (décision du propriétaire, Q1 : b). Aucun mot nouveau. Voir « Ce qui change en
  v4.7 »
- v4.8 : le numéro de téléphone, demandé au bon moment et obligatoire pour qui conduit
  (#766, décisions du propriétaire). La fiche d’une voiture demande un numéro quand aucune
  personne de l’appareil qui s’y trouve n’en a. « Ajouter une personne » reprend le numéro de
  la dernière personne de l’appareil qui en a un. On ne propose plus de voiture sans numéro,
  et on ne peut pas retirer le sien tant qu’on conduit. Les conducteurs déjà inscrits sans
  numéro restent tels quels. Qui voit un numéro ne change pas (DO1). Voir « Ce qui change en
  v4.8 ». Avec elle, les libellés de la v4.5 deviennent « Je ramène aussi des personnes » et
  « J’emmène aussi des personnes » (décision du propriétaire sur #649, 26/10)
- v4.9 : une icône de voiture devant « Voiture de… » dans l’en-tête de la fiche (demande du
  propriétaire). Aucun mot nouveau. Voir « Ce qui change en v4.9 »
- Hors de cette maquette : la vue organisateur, epic #154 ; l’anneau de focus, qui relève de
  la maquette `language-switch` depuis sa v3 (#236)
- Page : `index.html` (autonome, maquettes à 360 px de large)
- Couleurs : remplacées par `visual-identity` v3 (#651). Ce que cette page dessine en `--app-primary` (#171717) est désormais #005a5b, sauf la barre de message réussie, qui reste #171717 ; l’onglet sélectionné, les tuiles teintées et la marque y sont décrits.

## Ce qui change en v4.9 : l’icône de voiture de l’en-tête

Demande du propriétaire : « une icône de voiture devant « Voiture de… » dans l’en-tête de la
fiche ». Cette maquette est celle de la fiche (C4.3, `ride-card.tsx`) ; `meeting-points` ne la
dessine que comme croquis et n’est pas redessinée (voir « Pour le développement »).

**Aujourd’hui** (`origin/main`, `ride-card.tsx`) : l’en-tête est un `div.flex.items-start.justify-between.gap-2`
avec, à gauche, le `h3` « Voiture de {conducteur} » (`min-w-0 font-semibold wrap-anywhere`), à
droite l’horloge et l’heure, puis « Complet » s’il y a lieu. Les lignes de dessous portent déjà
des icônes lucide de 16 px en `text-muted-foreground` : `MapPin`, `User`, `Clock`, le téléphone.

**La règle** :
- **Icône** : `Car` de `lucide-react` (déjà utilisé par l’état vide et les feuilles ; aucune
  dépendance nouvelle).
- **Taille et couleur** : `size-4 shrink-0 text-muted-foreground`, comme les autres icônes de la
  fiche. Elle est plus discrète que le titre (`font-semibold`, couleur du texte) : c’est le
  titre qui nomme la voiture, l’icône l’annonce. `visual-identity` ne fixe aucune règle
  d’icône de fiche au-delà de VI4.3 (marque : `aria-hidden`, hors lien) ; l’icône de fiche n’est
  pas la marque et reste grise, pas pétrole.
- **Décorative** : `aria-hidden`, placée hors du `h3`, sœur de celui-ci. Le nom de l’article
  (`aria-labelledby`) et du titre reste exactement « Voiture de {conducteur} » ; le lecteur
  d’écran ne lit rien de plus.
- **Disposition** : le côté gauche de l’en-tête devient `flex min-w-0 items-start gap-2`
  (icône, puis `h3`). L’icône prend `mt-1` : sur la première ligne du titre (24 px), elle est
  centrée comme `MapPin` l’est sur ses 20 px (`mt-0.5`). Le côté droit ne change pas (`shrink-0`).
  Le `h3` garde `min-w-0` et `wrap-anywhere`, donc un nom long passe à la ligne, l’icône reste
  à côté de la première ligne.
- **Focus** : l’anneau de `focusCarTitle` entoure toujours le `h3` seul, l’icône est hors de
  l’anneau.
- **Autres endroits** : seul l’en-tête de la fiche change. L’icône `Car` de l’état vide, des
  feuilles et de « Proposer une voiture » ne bouge pas.

Mesuré dans Chrome headless, maquette à 360 px, nom de 50 caractères sans espace et « Complet » :
le nom occupe 4 lignes de 132 px, son bord droit est à 8 px de l’heure, rien ne se recouvre et
la page n’a pas de défilement horizontal.

### Critères de la v4.9

- CI1.1 L’en-tête d’une fiche contient une icône `Car` (un `svg` de lucide) avant « Voiture de
  {conducteur} », dans l’ordre du DOM : icône, `h3`, puis l’heure.
- CI1.2 L’icône mesure 16 × 16 px et a la couleur calculée des icônes `MapPin` et `Clock` de la
  même fiche.
- CI1.3 L’icône a `aria-hidden="true"` et n’est pas dans le `h3` ; `getByRole('article', { name:
  'Voiture de Marc' })` et `getByRole('heading', { name: 'Voiture de Marc' })` trouvent chacun une
  seule fiche, nom inchangé ; le texte du `h3` est exactement « Voiture de Marc ».
- CI1.4 À 360 px de large, un prénom de 40 caractères sans espace, l’heure et « Complet » : les
  boîtes de l’icône, du `h3` et du côté droit ne se recouvrent pas, la boîte du `h3` ne dépasse
  pas celle de la fiche, et `document.documentElement.scrollWidth` n’excède pas la largeur de
  la fenêtre.
- CI1.5 Même vérification en anglais (« Marc’s car », « 7:15 AM ») : mêmes boîtes, mêmes
  résultats.
- CI1.6 Le haut de l’icône est dans la première ligne du titre : son centre vertical est à 1 px
  près celui de cette ligne, avec un titre sur une seule ligne et avec un titre sur plusieurs.
- CI1.7 Le focus donné par script au `h3` (« Voir la voiture ») ne change pas, et l’icône ne
  reçoit jamais le focus.
- CI1.8 Les 15 voitures d’un leg ont chacune l’icône ; une voiture avec « Complet » ne la perd pas.

### Hors périmètre de la v4.9

Une autre icône pour « Complet » ; la couleur pétrole pour l’icône ; l’icône dans les barres,
les feuilles ou l’espace organisateur ; une icône dans le titre des fiches de l’organisateur.

### Pour le développement

`src/components/event/ride-card.tsx` seul, plus un test Playwright de CI1.1 à CI1.5. Les
Vitest et e2e qui cherchent le titre par son nom ne changent pas. Ne pas mettre l’icône dans
le `h3`, ni lui donner `aria-label`. `meeting-points` dessine un en-tête de fiche sans icône : ce
croquis n’est pas l’écran, et l’en-tête de référence est celui de cette maquette.

## Ce qui change en v4.8 : le numéro au bon moment, obligatoire pour qui conduit (#766)

Question du propriétaire (26/10) : « Est-ce qu’on ne devrait pas rendre obligatoires les
numéros de téléphone ? Sinon je ne vois pas comment les gens peuvent s’organiser… » Après
l’avis du product designer, il a décidé (#766) :

- **Q1 (b)** : demander le numéro au bon moment, le préremplir pour les personnes d’un même
  appareil, et le rendre obligatoire pour qui conduit. Les conducteurs déjà inscrits sans
  numéro restent tels quels, et restent dans « Voitures sans numéro » de l’espace
  organisateur.
- **Q2 (b)** : rien n’est montré aux personnes de la même voiture quand quelqu’un n’a pas de
  numéro. Le silence d’aujourd’hui reste.
- **Q3 (a)** : le numéro est prérempli et modifiable, avec « Même numéro que {firstName}.
  Modifiez-le si besoin. »
- **Qui voit un numéro ne change pas** (DO1, `phone-visibility.ts`).

### Le problème

Le numéro sert surtout dans une voiture, sur un leg : la personne qui conduit et ses
passagers se retrouvent (« j’ai dix minutes de retard », « quelle entrée ? »). Aujourd’hui,
le champ est facultatif partout. Sur la fiche, une personne de la voiture sans numéro
n’affiche rien. Personne ne voit qu’un numéro manque, et personne ne se le voit demander.
Seul l’organisateur le voit, dans « Voitures sans numéro » et « Pas de numéro ». Une voiture
proposée sans numéro ne peut être appelée par personne. Et un conducteur qui retire sa
voiture lit « Personne n’est prévenu : pensez à le leur dire. », sans moyen de le faire si
ses passagers n’ont pas laissé de numéro.

### Ce qui se passe aujourd’hui (`main`, `58bf602`)

- `PersonForm.phone` « Téléphone (facultatif) » dans « Ajouter une personne », dans la
  première inscription depuis une place libre, dans « Modifier {prénom} », et pour « Une
  nouvelle personne » de « Proposer une voiture ». Toujours la même aide :
  « Visible seulement par l’organisateur et par les personnes de la même voiture. »
- `offerRide` accepte une nouvelle personne sans numéro (`validatePerson`, téléphone
  facultatif) et une personne de l’appareil sans numéro.
- `updatePerson` accepte un numéro vidé pour toute personne, y compris une personne qui
  conduit.
- `ride-card.tsx` ne dessine un lien `tel:` que si un numéro est là, et rien sinon.
- `offerRide` renvoie ses erreurs de champ sans l’état (`offer-ride.ts:107–115`) ; seuls ses
  refus le portent, relu après la transaction (C11.6).
- Une seule requête lit la valeur de `phone` : `src/db/event-rows.ts` (`PERSON_COLUMNS`,
  chemin sensible). `architecture.md` (« une règle, un seul endroit ») et
  `review-checklist.md` en font une règle bloquante.
- `organiser-lists.tsx` montre « Pas de numéro » et « Voitures sans numéro ({count}) ».

### La règle (v4.8)

**1. La fiche demande un numéro, à l’appareil seulement.** Sur la fiche d’une voiture, sur
son leg, quand l’appareil a au moins une personne dans cette voiture (qui conduit, ou
passagère) et qu’**aucune** d’elles n’a de numéro, la fiche montre, sous ses places et
au-dessus de « Modifier » / « Retirer la voiture » :

- une phrase :
  - « Ajoutez un numéro pour que {driver} puisse vous joindre. », quand les personnes de
    l’appareil sont passagères ;
  - « Ajoutez un numéro pour que les personnes à bord puissent vous joindre. », quand la
    personne de l’appareil est celle qui conduit (seul un conducteur inscrit avant la v4.8
    peut ne pas avoir de numéro) ;
- un bouton « Ajouter un numéro », contour, 44 px, icône téléphone. Son nom accessible est
  « Ajouter un numéro pour {firstName} », et la phrase le décrit (`aria-describedby`).

Un seul message par fiche : un numéro suffit pour joindre la famille. Avec Léa et Tom dans
la voiture de Marc, sans numéro tous les deux, la fiche montre un seul message. Si Tom a un
numéro, elle n’en montre aucun.

`{firstName}` est la personne dont le bouton ouvre le formulaire : celle de l’appareil qui
conduit, sinon la première passagère de l’appareil dans l’ordre de la fiche.

Le message ne s’affiche jamais :
- sur la fiche d’une voiture où l’appareil n’a personne ;
- tant que les personnes de l’appareil ne sont pas connues (chargement, échec : C5.9) ;
- sans JavaScript.

Il apparaît sans être annoncé : après un tap, la barre dit déjà « Léa est dans la voiture de
Marc », et un second message la couperait.

**2. Le bouton ouvre « Modifier {firstName} ».** Il ouvre directement le formulaire de C2.3,
sans passer par la feuille du prénom. Le focus est dans le champ du téléphone, et pas dans
« Prénom ». Le formulaire est celui d’aujourd’hui : mêmes champs, mêmes règles, même
« Valider » sans changement qui n’envoie rien (v4.4). Sur téléphone, il prend toute la
hauteur visible (v4.6), et le geste « retour » le ferme comme Échap (v4.7).
- **Enregistré avec un numéro** : la feuille se ferme, et le message part de la fiche. Le
  lien `tel:` de la personne y apparaît, comme pour toute personne de la voiture qui a un
  numéro (C10.1). Le focus va sur le titre de la fiche, « Voiture de {driver} »
  (`focusCarTitle`), puisque le bouton n’existe plus. La barre ne dit rien, comme après tout
  « Modifier » réussi.
- **Fermé sans enregistrer** (« Fermer », Échap, le geste « retour »), ou enregistré sans
  numéro (seul le prénom a changé) : le message reste, et le focus revient sur « Ajouter un
  numéro ».
- **Échec** : les mots d’aujourd’hui. Feuille ouverte : `Actions.offline` ou
  `Actions.failed` dans le formulaire. Feuille fermée : la barre dit « Le téléphone de Léa
  n’a pas été enregistré. Vérifiez la connexion, puis réessayez. »
  (`Actions.notDone.editPerson`). Personne retirée entre-temps : `personGone` (RP5.4),
  inchangé.

**3. Le silence reste pour les autres (Q2 b).** Aucune fiche ne dit qu’une personne d’un
autre appareil n’a pas de numéro : ni « Pas de numéro », ni rien d’autre. La feuille du prénom
de « Vos inscriptions » ne change pas non plus : le lien `tel:` s’il y a un numéro, puis
« Modifier ».

**4. « Ajouter une personne » reprend le numéro de l’appareil (Q3 a).** Quand l’appareil a
au moins une personne qui a un numéro, le champ « Téléphone (facultatif) » de « Ajouter une
personne » s’ouvre avec le numéro de la **dernière** de ces personnes, dans l’ordre de « Vos
inscriptions ». Sous le champ, avant l’aide, une ligne : « Même numéro que {firstName}.
Modifiez-le si besoin. »
- Le focus reste dans « Prénom », comme aujourd’hui (C1.2).
- La ligne reste tant que le champ contient exactement ce numéro. Si on change ou vide le
  champ, elle part. Si on retape le même numéro, elle revient.
- Vidé, le champ crée la personne sans numéro, comme aujourd’hui.
- C’est vrai partout où « Ajouter une personne » s’ouvre : le bouton du leg, et « Ajouter
  une personne » dans la feuille « Qui monte dans la voiture de {driver} ? » (C6.6).
- Pas de préremplissage :
  - dans la première inscription, où l’appareil n’a encore personne ;
  - dans « Modifier {prénom} » ;
  - pour « Une nouvelle personne » de « Proposer une voiture » (décision v4.8-8) ;
  - dans le champ « Téléphone de {prénom} » de la règle 7.
- Le numéro prérempli est déjà visible par cet appareil, parmi ses propres personnes
  (C10.1). Rien de nouveau n’est envoyé ni stocké.

**5. Depuis une place libre, l’aide dit pourquoi.** Dans le formulaire « Ajouter une
personne » ouvert depuis une place libre, l’aide du téléphone devient « Pour que {driver}
puisse vous joindre. Visible seulement par l’organisateur et par les personnes de la même
voiture. » C’est vrai dans la première inscription (`RegisterSheet`, C5.4) et dans « Ajouter
une personne » de la feuille d’une place (C6.6). Le libellé reste « Téléphone (facultatif) » :
un passager n’est pas obligé d’en donner un. C5.4 tient toujours en trois actions : place
libre, prénom, « Valider ».

**6. Proposer une voiture demande un numéro à une nouvelle personne.** Pour « Une nouvelle
personne », ou sans personne sur l’appareil :
- le champ devient « Téléphone », sans « (facultatif) » ;
- son aide devient « Pour que les personnes à bord puissent vous joindre. Visible seulement
  par l’organisateur et par les personnes de la même voiture. » ;
- vide, « Valider » ne crée rien. L’erreur « Un numéro est requis pour proposer une
  voiture. » s’affiche sous le champ, avant l’aide, et le focus va au premier champ en
  erreur, dans l’ordre du formulaire (C4.7) ;
- mal formé, l’erreur est celle d’aujourd’hui, `FormErrors.invalidPhone`.

**7. Une personne de l’appareil sans numéro qui conduit en donne un.** Dans « Qui conduit ? »,
quand la personne choisie est une personne de l’appareil sans numéro, un champ apparaît dans
le groupe, sous les boutons radio :
- libellé « Téléphone de {firstName} », vide ;
- même aide et mêmes erreurs que la règle 6.

Choisir une personne qui a un numéro, ou « Une nouvelle personne », retire ce champ. Choisir
une autre personne sans numéro le montre de nouveau, vide, à son prénom.

« Valider » enregistre le numéro sur la personne et crée la ou les voitures dans la **même
écriture**, tout ou rien (C4.5). Si l’offre est refusée ou échoue, le numéro n’est pas
enregistré non plus. Les mots d’échec de l’offre ne changent pas
(`Actions.notDone.offerRide`).

**Côté serveur.** `offerRide` sait si la personne de l’appareil qui conduit a un numéro par
une **condition de présence lue sous le verrou de sa Person** : `phone IS NOT NULL`, dans la
requête de `lockPersons` ou à côté. Elle rend un booléen, jamais la valeur.
`phone-visibility.ts` et `event-rows.ts` ne changent pas (décision v4.8-18). Si elle n’a pas
de numéro et que l’offre n’en porte pas, c’est le **refus** `driverWithoutPhone`, et non une
erreur de champ. Comme tout refus, il porte l’état relu après la transaction (C11.6). Une
erreur de champ reviendrait sans l’état (décision v4.8-19). Rien n’est créé.

C’est le cas où la page croyait que la personne avait un numéro, vidé ailleurs entre-temps.
Avec l’état relu, la page retire son lien `tel:`, dans la feuille de son prénom comme sur les
fiches. Le formulaire reste ouvert, ses autres champs gardés. Il montre « Téléphone de
{firstName} », vide, avec « Un numéro est requis pour proposer une voiture. », et le focus y
va (état 18). Si la feuille a été fermée avant la réponse, la barre le dit : « La voiture de
Claire pour l’aller n’a pas été proposée. Un numéro est requis pour proposer une voiture. »
(`Actions.notDone.offerRide` + `Actions.why.driverWithoutPhone`).

Une nouvelle personne sans numéro reste une erreur de champ (règle 6) : rien dans la page
n’est périmé, et le navigateur la voit avant d’envoyer.

**8. On ne retire pas son numéro tant qu’on conduit.** Dans « Modifier {prénom} », pour une
personne qui conduit sur au moins un leg :
- le libellé devient « Téléphone », et l’aide celle de la règle 6 ;
- **vider** le champ, puis « Valider », ne change rien. L’erreur « Un numéro est requis tant
  que {firstName} conduit. » s’affiche sous le champ, et le focus y va. `{firstName}` est le
  prénom affiché avant le changement ;
- **changer** le numéro pour un autre numéro valide est accepté ;
- un conducteur inscrit avant la v4.8 sans numéro peut changer son prénom en laissant le
  champ vide. Un champ laissé tel quel n’est pas envoyé (v4.4), donc rien ne le refuse. Rien
  ne l’oblige à ajouter un numéro (Q1 b).

Dès qu’elle ne conduit plus (voiture retirée), le libellé redevient « Téléphone
(facultatif) », et vider le champ supprime le numéro (C2.3).

**Côté serveur.** `updatePerson` verrouille la Person, puis regarde si elle conduit un Ride
sur l’un des legs. Il n’a pas besoin de lire `phone` : la question est « conduit-elle ? »,
et le numéro envoyé est dans la requête. Un numéro envoyé vide pour une personne qui conduit
est le **refus** `phoneWhileDriving`, qui porte l’état (décision v4.8-19). Rien n’est écrit,
prénom compris. Le verrou est celui que prend `offerRide` : une offre et un effacement
envoyés ensemble s’ordonnent (T5.6).

C’est le cas où elle se met à conduire depuis un autre appareil pendant que le formulaire
est ouvert, avec « Téléphone (facultatif) ». Avec l’état relu, le formulaire passe au
libellé « Téléphone » et montre « Un numéro est requis tant que {firstName} conduit. », le
focus dans le champ. Si la feuille a été fermée avant la réponse, la barre le dit : « Le
téléphone de Claire n’a pas été enregistré. Un numéro est requis tant que Claire
conduit. » (`Actions.notDone.editPerson` + `Actions.why.phoneWhileDriving`).

**9. Ce qui ne change pas.**
- « Modifier la voiture » ne demande rien : il n’a pas de champ de téléphone.
- « Prendre une place » (le tap, la feuille), « Sortir de la voiture », « Je cherche une
  place » : rien de nouveau. Le geste reste unique.
- La création d’un événement : aucun champ de téléphone. Le critère des 30 s ne bouge pas.
- L’espace organisateur : mêmes mots, même code (« Ce que voit l’organisateur »).
- Qui voit un numéro : `withVisiblePhones` et `withOrganiserPhones`, inchangés.

### Ce que voit l’organisateur

Rien ne change dans `organizer-view`. « Voitures sans numéro ({count}) » ne peut plus
contenir que des voitures de conducteurs inscrits avant la v4.8. Son aide, « Les personnes à
bord ne peuvent pas appeler la personne qui conduit. Demandez-lui d’ajouter son numéro. »,
reste vraie, et la fiche de cette voiture lui demande désormais aussi (règle 1). Quand ce
conducteur ajoute un numéro, sa voiture quitte la liste, comme aujourd’hui. Avec la dernière,
la liste dit « Toutes les voitures ont un numéro. » « Pas de numéro » dans « Sans voiture »
garde son sens : un passager n’est pas obligé d’en donner un.

### Les états de la v4.8 (dessinés dans la page)

La numérotation est celle de la page.

| n° | état | ce que montre l’écran | critère |
|---|---|---|---|
| 1 | Léa, sans numéro, passagère de Marc à l’aller | la fiche de Marc : le lien de Marc, Léa sans lien, Inès avec le sien, une place libre, puis « Ajoutez un numéro pour que Marc puisse vous joindre. » et « Ajouter un numéro » | T1.1, T1.3 |
| 2 | « Ajouter un numéro » touché | « Modifier Léa », le focus dans « Téléphone (facultatif) », vide | T1.2 |
| 3 | enregistré | la fiche sans message, le lien de Léa dans sa ligne, le focus sur « Voiture de Marc » | T1.2 |
| 4 | Léa et Tom, aucun numéro | un seul message, le bouton nommé pour Léa | T1.4 |
| 5 | Léa et Tom, Tom a un numéro | aucun message | T1.4 |
| 6 | Claire conduit, inscrite avant la v4.8, sans numéro | « Ajoutez un numéro pour que les personnes à bord puissent vous joindre. », puis « Modifier » et « Retirer la voiture » | T1.6 |
| 7 | Sophie, d’un autre appareil, sans numéro, dans la voiture de Marc | rien pour Sophie : ni « Pas de numéro », ni message | T1.10 |
| 8 | hors ligne, « Valider » depuis la fiche, feuille fermée | la barre : « Le téléphone de Léa n’a pas été enregistré. Vérifiez la connexion, puis réessayez. », et le message reste | T1.8 |
| 9 | 360 px, un conducteur au prénom de 40 caractères | la phrase passe à la ligne, le bouton tient, aucun débordement | T1.9 |
| 10 | « Ajouter une personne », Tom a le dernier numéro | le champ prérempli, « Même numéro que Tom. Modifiez-le si besoin. », puis l’aide | T2.1, T2.2 |
| 11 | le numéro changé | la ligne « Même numéro que Tom » est partie | T2.3 |
| 12 | première inscription depuis une place libre de Marc | « Pour que Marc puisse vous joindre. Visible seulement… », le libellé « Téléphone (facultatif) » | T3.1 |
| 13 | « Proposer une voiture », nouvelle personne | « Téléphone », l’aide pour qui conduit | T4.1 |
| 14 | le même, numéro vide, « Valider » | « Un numéro est requis pour proposer une voiture. », le focus dans le champ | T4.1 |
| 15 | « Qui conduit ? » : Claire, sans numéro | « Téléphone de Claire » sous les boutons radio | T4.4 |
| 16 | « Modifier Claire », qui conduit, numéro vidé | « Téléphone », « Un numéro est requis tant que Claire conduit. » | T5.1 |
| 17 | en anglais | « Add a number so that Marc can reach you. », « Add a number » ; « Phone », « A number is needed to offer a car. » | T1.11, T4.10 |
| 18 | « Proposer une voiture », Claire choisie, son numéro vidé ailleurs, « Valider » | le refus `driverWithoutPhone` avec l’état : « Téléphone de Claire » apparaît, vide, en erreur, le focus dedans ; lieu et heure gardés ; Claire n’a plus de lien `tel:` | T4.8 |

Sans maquette, décrits par les règles : la fiche d’une voiture où l’appareil n’a personne
(règle 1), le chargement et l’échec de « Vos inscriptions » (règle 1), la personne qui se
met à conduire pendant « Modifier » (règle 8, T5.7), les deux refus dans la barre, feuille
fermée (règles 7 et 8), l’espace organisateur (inchangé).

### Les mots de la v4.8

Apostrophes typographiques (’), comme dans le reste de `messages/fr.json`.

| clé | `messages/fr.json` | `messages/en.json` | où |
|---|---|---|---|
| `Board.car.addPhoneWhy.passenger` | Ajoutez un numéro pour que {driver} puisse vous joindre. | Add a number so that {driver} can reach you. | fiche, règle 1 (texte de l’epic) |
| `Board.car.addPhoneWhy.driver` | Ajoutez un numéro pour que les personnes à bord puissent vous joindre. | Add a number so that the people on board can reach you. | fiche, conducteur d’avant la v4.8 (v4.8-3) |
| `Board.car.addPhone` | Ajouter un numéro | Add a number | texte visible du bouton |
| `Board.car.addPhoneLabel` | Ajouter un numéro pour {firstName} | Add a number for {firstName} | nom accessible du bouton (v4.8-5) |
| `PersonForm.samePhone` | Même numéro que {firstName}. Modifiez-le si besoin. | Same number as {firstName}. Change it if needed. | « Ajouter une personne », règle 4 (texte de l’epic) |
| `PersonForm.phoneHintForSeat` | Pour que {driver} puisse vous joindre. Visible seulement par l’organisateur et par les personnes de la même voiture. | So that {driver} can reach you. Only visible to the organiser and to the people in the same car. | depuis une place libre, règle 5 |
| `PersonForm.phoneDriving` | Téléphone | Phone | « Modifier {prénom} » d’une personne qui conduit, règle 8 |
| `PersonForm.phoneHintDriving` | Pour que les personnes à bord puissent vous joindre. Visible seulement par l’organisateur et par les personnes de la même voiture. | So that the people on board can reach you. Only visible to the organiser and to the people in the same car. | même texte que `RideForm.phoneHint` |
| `RideForm.phone` | Téléphone | Phone | nouvelle personne qui conduit, règle 6 |
| `RideForm.driverPhone` | Téléphone de {firstName} | {firstName}’s phone | personne de l’appareil sans numéro, règle 7 |
| `RideForm.phoneHint` | Pour que les personnes à bord puissent vous joindre. Visible seulement par l’organisateur et par les personnes de la même voiture. | So that the people on board can reach you. Only visible to the organiser and to the people in the same car. | règles 6 et 7 |
| `FormErrors.driverPhone` | Un numéro est requis pour proposer une voiture. | A number is needed to offer a car. | règles 6 et 7 (v4.8-11) |
| `FormErrors.phoneWhileDriving` | Un numéro est requis tant que {firstName} conduit. | A number is needed while {firstName} is driving. | règle 8 |
| `Actions.why.driverWithoutPhone` | Un numéro est requis pour proposer une voiture. | A number is needed to offer a car. | barre, refus `driverWithoutPhone`, feuille fermée (règle 7, v4.8-19) |
| `Actions.why.phoneWhileDriving` | Un numéro est requis tant que {firstName} conduit. | A number is needed while {firstName} is driving. | barre, refus `phoneWhileDriving`, feuille fermée (règle 8, v4.8-19) |

**Inchangés**, et réutilisés tels quels :
- `PersonForm.phone` « Téléphone (facultatif) » / “Phone (optional)” : « Ajouter une
  personne », première inscription, « Modifier » d’une personne qui ne conduit pas ;
- `PersonForm.phoneHint` : partout ailleurs ;
- `FormErrors.invalidPhone` ;
- `Actions.notDone.editPerson`, `Actions.notDone.offerRide`, et les `Actions.why.*` d’avant ;
- `Board.call` ;
- toutes les clés `Admin.*`.

Ordre d’une description accessible de champ, comme aujourd’hui : l’erreur, puis la ligne
« Même numéro que… » s’il y en a une, puis l’aide. Exemples, mot pour mot :
- règle 4 : « Même numéro que Tom. Modifiez-le si besoin. Visible seulement par
  l’organisateur et par les personnes de la même voiture. » ;
- règles 4 et 5 ensemble (feuille d’une place) : « Même numéro que Claire. Modifiez-le si
  besoin. Pour que Marc puisse vous joindre. Visible seulement par l’organisateur et par les
  personnes de la même voiture. » ;
- règle 6 en erreur : « Un numéro est requis pour proposer une voiture. Pour que les
  personnes à bord puissent vous joindre. Visible seulement par l’organisateur et par les
  personnes de la même voiture. »

Les deux refus, feuille fermée, dans la barre (table « Chaque échec, mot pour mot ») :
- « La voiture de Claire pour l’aller n’a pas été proposée. Un numéro est requis pour
  proposer une voiture. » / “Claire’s car for the outbound trip was not offered. A number
  is needed to offer a car.” ;
- « Le téléphone de Claire n’a pas été enregistré. Un numéro est requis tant que Claire
  conduit. » / “Claire’s phone number was not saved. A number is needed while Claire is
  driving.”

### Critères de la v4.8

**Histoire H11, « Être joignable par sa voiture ».** En tant que parent dont l’enfant monte
dans la voiture de quelqu’un, quand personne de chez moi n’y a laissé de numéro, la fiche de
la voiture me le demande, et je l’ajoute en un tap, pour que la personne qui conduit puisse
me joindre.

**Histoire H12, « Ne pas retaper mon numéro ».** En tant que parent qui inscrit un deuxième
enfant, je trouve mon numéro déjà dans le champ, et je le change si l’enfant a le sien.

**Histoire H13, « Une voiture qu’on peut appeler ».** En tant que passager d’une voiture
proposée depuis la v4.8, j’ai toujours le numéro de la personne qui conduit, parce qu’elle a
dû en donner un pour proposer sa voiture et qu’elle ne peut pas le retirer tant qu’elle
conduit.

**Scène commune**, Playwright, projet `e2e` (360 px) sauf mention contraire. L’événement
amorcé (`seededEvent`) est « Tournoi de Rennes ». Marc (`seedPerson`, son propre jeton, numéro
`MARC_PHONE`) conduit à l’aller (`seedRide`, 3 places). L’appareil porte le jeton de Claire,
Léa et Tom (`seedPerson` avec un même jeton, sans numéro sauf mention). Les numéros sont des
constantes du test. Toute vérification qui pourrait les imprimer passe par `withoutNumbers`
(#354). « Aucune requête » veut dire que `page.on("request")` ne voit aucune requête
`next-action`.

**T1 : la fiche demande un numéro** (`e2e/phone-ask.spec.ts`).

- **T1.1** Léa est passagère de Marc à l’aller (`seedPlacement`).
  - L’article « Voiture de Marc » contient le texte « Ajoutez un numéro pour que Marc puisse
    vous joindre. »
  - Il contient un bouton `getByRole("button", { name: "Ajouter un numéro pour Léa" })`, de
    texte visible « Ajouter un numéro ». Sa description accessible est exactement cette
    phrase.
  - La boîte du bouton est sous celle de la dernière ligne de places, et il fait au moins
    44 px de haut.
  - Sur `main`, le texte est absent : le test échoue.
- **T1.2** On touche ce bouton.
  - Le dialogue « Modifier Léa » s’ouvre, et « Téléphone (facultatif) » a le focus, vide.
  - On y tape `LEA_PHONE`, puis « Valider ». Le dialogue se ferme, et l’article ne contient
    plus « Ajoutez un numéro ».
  - Il contient le lien `tel:` de Léa (nom accessible « Appeler Léa au … »).
  - Le titre « Voiture de Marc » a le focus.
  - En base, `phone` de Léa vaut `LEA_PHONE`. La barre ne contient aucun message.
- **T1.3** Le geste reste unique. Léa, sans numéro, est la seule personne de l’appareil
  « sans voiture » à l’aller. **Un** clic sur « Place libre : prendre une place dans la
  voiture de Marc » la place (C5, inchangé). Le message de T1.1 apparaît ensuite sans aucun
  autre clic. La barre dit « Léa est dans la voiture de Marc », avec « Annuler », comme
  aujourd’hui.
- **T1.4** Un numéro suffit.
  - Léa et Tom sont passagers de Marc, sans numéro : l’article contient exactement **un**
    texte « Ajoutez un numéro pour que Marc puisse vous joindre. », et le bouton
    « Ajouter un numéro pour Léa » (Léa est avant Tom dans la fiche). Aucun bouton
    « Ajouter un numéro pour Tom ».
  - Tom a un numéro (`seedPerson` avec `TOM_PHONE`) : l’article ne contient aucun
    « Ajoutez un numéro ».
- **T1.5** Seulement là où l’appareil a quelqu’un.
  - Léa est dans la voiture de Marc, et Tom dans celle de Karim (un autre appareil, avec un
    numéro), sans numéro tous les deux. Chaque article a son message : « … pour que Marc… »
    avec « Ajouter un numéro pour Léa », « … pour que Karim… » avec « Ajouter un numéro pour
    Tom ».
  - Une troisième voiture, celle de Sophie, sans personne de l’appareil, n’a aucun
    message.
  - Sur un second contexte de navigateur (un appareil sans personne), aucun article ne
    contient « Ajoutez un numéro ».
  - Pendant le chargement de « Vos inscriptions » (réponse retenue par `page.route`),
    aucun article ne contient « Ajoutez un numéro ».
- **T1.6** Un conducteur d’avant la v4.8.
  - Claire, sans numéro, conduit à l’aller (`seedRide`, donc sans passer par le
    formulaire), et Léa, sans numéro, est sa passagère. L’article « Voiture de Claire »
    contient « Ajoutez un numéro pour que les personnes à bord puissent vous joindre. » et
    le bouton « Ajouter un numéro pour Claire ».
  - Ce bouton est au-dessus de « Modifier » et de « Retirer la voiture ».
  - Le toucher ouvre « Modifier Claire », avec le focus dans le champ dont le libellé est
    exactement « Téléphone » (règle 8).
- **T1.7** Fermé sans rien changer. Depuis T1.1, on touche le bouton, puis « Fermer » ;
  puis de nouveau, et Échap. Chaque fois : aucune requête, le message reste, et le focus est
  sur « Ajouter un numéro pour Léa ».
- **T1.8** Hors ligne. Depuis T1.2, le numéro tapé, `context.setOffline(true)`, puis
  « Valider » : le formulaire montre « Action impossible, vérifiez la connexion ». On le
  ferme. La barre dit « Le téléphone de Léa n’a pas été enregistré. Vérifiez la connexion,
  puis réessayez. » L’article contient toujours le message. En base, Léa n’a pas de numéro.
- **T1.9** À 360 × 780, Marc s’appelle « Marc-Alexandre-Emmanuel-Christophe-Jean » (40
  caractères), et la scène est celle de T1.1.
  - `document.documentElement.scrollWidth` vaut au plus 360.
  - Pour l’article, `scrollWidth` vaut au plus `clientWidth`.
  - La phrase fait au moins deux lignes, et le bouton au moins 44 px de haut.
  - La même chose en anglais.
- **T1.10** Le silence reste (Q2 b). Léa, avec un numéro, et Sophie (un autre appareil,
  sans numéro) sont passagères de Marc. L’article ne contient ni « Pas de numéro », ni
  « No number », ni « Ajoutez un numéro ». La ligne de Sophie n’a aucun lien. La feuille du
  prénom « Léa » de « Vos inscriptions » n’a pas d’autre élément que son lien et
  « Modifier ».
- **T1.11** En anglais (`locale: "en-GB"`), scène de T1.1 : « Add a number so that Marc can
  reach you. », et le bouton `{ name: "Add a number for Léa" }`, de texte « Add a number ».
  Scène de T1.6 : « Add a number so that the people on board can reach you. »

**T2 : « Ajouter une personne » reprend le numéro** (`e2e/phone-prefill.spec.ts`).

- **T2.1** Claire a `CLAIRE_PHONE`, Léa et Tom n’en ont pas. On touche « Ajouter une
  personne » sur l’onglet Aller.
  - « Prénom » a le focus.
  - « Téléphone (facultatif) » a pour valeur `CLAIRE_PHONE`, et pour description exactement
    « Même numéro que Claire. Modifiez-le si besoin. Visible seulement par l’organisateur et
    par les personnes de la même voiture. »
  - On tape « Inès », puis « Valider » : en base, Inès a `CLAIRE_PHONE`.
  - Sur `main`, le champ est vide : le test échoue.
- **T2.2** La dernière qui en a un. Claire a `CLAIRE_PHONE`, Léa aucun, Tom `TOM_PHONE`,
  dans cet ordre dans « Vos inscriptions » : le champ a `TOM_PHONE`, et la ligne dit « Même
  numéro que Tom. Modifiez-le si besoin. »
- **T2.3** Changé ou vidé.
  - Depuis T2.1, on remplace le numéro par `INES_PHONE` : la description ne contient plus
    « Même numéro ». On retape `CLAIRE_PHONE` : elle le contient de nouveau.
  - On vide le champ, on tape « Inès », puis « Valider » : en base, Inès n’a pas de numéro.
- **T2.4** Rien à reprendre.
  - Aucune personne de l’appareil n’a de numéro : le champ est vide, et sa description est
    exactement l’aide d’aujourd’hui.
  - Dans les mêmes conditions que T2.1 :
    - dans « Proposer une voiture » puis « Une nouvelle personne », « Téléphone » est vide ;
    - dans « Modifier Léa », le champ est vide ;
    - aucune de ces deux descriptions ne contient « Même numéro ».
- **T2.5** Depuis la feuille d’une place. Claire a `CLAIRE_PHONE`, et Léa et Tom sont sans
  voiture. On touche une place libre de Marc : la feuille « Qui monte dans la voiture de
  Marc ? » s’ouvre. On touche « Ajouter une personne ». Le champ a `CLAIRE_PHONE`, et sa
  description est exactement « Même numéro que Claire. Modifiez-le si besoin. Pour que Marc
  puisse vous joindre. Visible seulement par l’organisateur et par les personnes de la même
  voiture. »
- **T2.6** En anglais, scène de T2.1 : « Same number as Claire. Change it if needed. Only
  visible to the organiser and to the people in the same car. »

**T3 : l’aide depuis une place libre** (`e2e/phone-prefill.spec.ts`).

- **T3.1** Appareil sans personne. Un clic sur une place libre de Marc ouvre la première
  inscription.
  - Le champ a pour libellé exactement « Téléphone (facultatif) ». Sa description est
    exactement « Pour que Marc puisse vous joindre. Visible seulement par l’organisateur et
    par les personnes de la même voiture. »
  - « Inès », puis « Valider », sans numéro : Inès est dans la voiture de Marc. Ce sont
    trois actions, comme C5.4.
- **T3.2** « Ajouter une personne » depuis le bouton du leg, appareil sans personne : la
  description reste exactement « Visible seulement par l’organisateur et par les personnes
  de la même voiture. » C’est une garde : sur `main`, elle passe déjà.

**T4 : un numéro pour proposer une voiture** (`e2e/phone-driver.spec.ts`, et Vitest pour
T4.7 et T4.8).

- **T4.1** Appareil sans personne, « Proposer une voiture » sur l’onglet Aller.
  - Le groupe « Qui conduit ? » contient « Prénom » et un champ de libellé exactement
    « Téléphone ». Aucun champ ne s’appelle « Téléphone (facultatif) ».
  - Sa description est exactement « Pour que les personnes à bord puissent vous joindre.
    Visible seulement par l’organisateur et par les personnes de la même voiture. »
  - On remplit « Marc », le lieu et l’heure, sans numéro, puis « Valider » : aucune
    requête. Le champ a `aria-invalid="true"`, sa description commence par « Un numéro est
    requis pour proposer une voiture. », et il a le focus. En base, aucune personne et aucun
    Ride.
  - Sur `main`, la voiture est créée : le test échoue.
- **T4.2** La même chose avec `MARC_PHONE` : la voiture de Marc est créée, et en base Marc a
  `MARC_PHONE`. La fiche montre son lien `tel:` à l’appareil, qui est le sien (C10.1).
- **T4.3** Avec « 06 12 » : l’erreur est « Numéro non valide : de 6 à 15 chiffres, avec
  seulement des espaces et + . - ( ) » (inchangée), et rien n’est créé.
- **T4.4** Une personne de l’appareil sans numéro. Claire et Léa sans numéro, Tom avec
  `TOM_PHONE`, aucune ne conduit.
  - On choisit Claire dans « Qui conduit ? » : un champ « Téléphone de Claire » apparaît,
    vide, dans le groupe et sous le dernier bouton radio, avec la description de T4.1.
  - On choisit Léa : le champ s’appelle « Téléphone de Léa », vide.
  - On choisit Tom : aucun champ de téléphone dans le groupe.
  - On choisit « Une nouvelle personne » : « Prénom » et « Téléphone ».
- **T4.5** Claire choisie, champ vide, « Valider » : « Un numéro est requis pour proposer une
  voiture. », le focus dans « Téléphone de Claire », rien de créé. Avec `CLAIRE_PHONE` : la
  voiture de Claire est créée, et en base Claire a `CLAIRE_PHONE`.
- **T4.6** Hors ligne, Claire choisie, `CLAIRE_PHONE` tapé, « Valider » : la feuille reste
  ouverte avec « Action impossible, vérifiez la connexion », et le champ garde
  `CLAIRE_PHONE`. En base, ni voiture ni numéro.
- **T4.7** Vitest, `offerRide` :
  - une nouvelle personne sans numéro (absent, `""`, espaces) : erreurs de champ
    `{ phone: "required" }`, `first: "phone"` s’il est le premier en erreur. Rien n’est
    écrit, sur un événement connu comme inconnu (comme les autres erreurs de champ) ;
  - une personne de l’appareil sans numéro en base, sans numéro envoyé : le refus
    `{ ok: false, error: "driverWithoutPhone" }`, avec l’état relu après la transaction
    (C11.6), où cette personne n’a pas de numéro. Rien n’est écrit, et l’état ne porte
    aucun numéro de plus que ce que C10.1 permet à cet appareil ;
  - une personne de l’appareil avec un numéro en base, sans numéro envoyé : acceptée,
    numéro inchangé ;
  - une personne de l’appareil, numéro envoyé : validé par les règles de R1, puis écrit
    sur sa Person dans la même transaction que le ou les Rides ;
  - l’offre refusée après cette écriture (`alreadyDriving`, `alreadyInCar`, `noRetour`,
    `idTaken`) laisse le numéro comme il était ;
  - renvoyée après une réponse perdue (C4.10), elle n’écrit rien de plus ;
  - en revue : la présence est lue par une condition (`phone IS NOT NULL`) sous le verrou de
    la Person, qui rend un booléen. Aucune requête nouvelle ne sélectionne la valeur de
    `phone` (v4.8-18).
- **T4.8** Le numéro vidé ailleurs. La page montre Claire avec `CLAIRE_PHONE`, donc pas de
  champ. Avant « Valider », la base vide son numéro (`UPDATE` du test, comme un autre
  appareil). « Valider » :
  - la réponse est le refus `driverWithoutPhone`, avec l’état ;
  - le formulaire reste ouvert, lieu et heure gardés. « Téléphone de Claire » apparaît,
    vide, avec `aria-invalid="true"`, et sa description commence par « Un numéro est requis
    pour proposer une voiture. ». Le focus est dans ce champ ;
  - on ferme le formulaire : la feuille du prénom « Claire » n’a plus de lien `tel:` ;
  - en base, aucun Ride.
  - Seconde scène, la réponse retenue (`page.route`) et le formulaire fermé avant elle : la
    barre dit « La voiture de Claire pour l’aller n’a pas été proposée. Un numéro est requis
    pour proposer une voiture. »
- **T4.9** « Je ramène aussi des personnes » avec une nouvelle personne : une seule saisie
  du numéro crée les deux voitures. Sans numéro, aucune des deux n’est créée.
- **T4.10** En anglais : « Phone », “So that the people on board can reach you. Only visible
  to the organiser and to the people in the same car.”, « A number is needed to offer a
  car. », et « Claire’s phone » pour T4.4.
- **T4.11** Les conducteurs d’avant restent tels quels. Claire, sans numéro, conduit
  (`seedRide`).
  - « Modifier la voiture » : on change la note, puis « Valider ». C’est enregistré, sans
    aucun champ de téléphone dans le formulaire.
  - La fiche reste proposée, avec le message de T1.6.

**T5 : on ne retire pas son numéro tant qu’on conduit** (`e2e/phone-driver.spec.ts`, et
Vitest pour T5.5 et T5.6).

- **T5.1** Claire a `CLAIRE_PHONE` et conduit à l’aller. On ouvre « Modifier Claire » depuis
  « Vos inscriptions ».
  - Le champ a pour libellé exactement « Téléphone », et pour description la phrase de
    T4.1.
  - On le vide, puis « Valider » : la feuille reste ouverte. Le champ est en erreur, avec
    « Un numéro est requis tant que Claire conduit. », et il a le focus. Aucune requête.
  - En base, Claire a toujours `CLAIRE_PHONE`.
  - Sur `main`, le numéro est supprimé : le test échoue.
- **T5.2** On remplace par `OTHER_PHONE` : enregistré.
- **T5.3** Un conducteur d’avant, sans numéro (`seedRide`). On ouvre « Modifier Claire ».
  - Libellé « Téléphone », champ vide.
  - On change « Claire » en « Clara », puis « Valider » : c’est enregistré, sans erreur. En
    base, `phone` est toujours `null`.
- **T5.4** Claire retire sa voiture (« Retirer la voiture », confirmé). « Modifier Claire »
  a de nouveau le libellé « Téléphone (facultatif) ». Le vider supprime le numéro (C2.3).
- **T5.5** Vitest, `updatePerson` :
  - `phone: ""` pour une personne qui conduit un Ride sur l’aller, ou seulement sur le
    retour : le refus `{ ok: false, error: "phoneWhileDriving" }`, avec l’état (C11.6),
    rien d’écrit ;
  - la même chose avec le prénom changé dans la même requête : rien d’écrit non plus,
    tout ou rien ;
  - un autre numéro valide : écrit ;
  - `phone` absent (champ non envoyé) : rien de refusé ;
  - pour une personne qui ne conduit pas : `null` écrit, comme aujourd’hui.
- **T5.6** Vitest, deux connexions, comme les tests de C12.8 : une offre qui fait conduire
  Claire (personne de l’appareil, avec `CLAIRE_PHONE`, sans numéro envoyé) et un
  `updatePerson` qui vide son numéro, lancés ensemble, dans les deux ordres d’arrivée.
  Après les deux, exactement un des deux a réussi : soit le Ride existe et Claire a toujours
  `CLAIRE_PHONE`, soit le numéro est vidé et aucun Ride n’existe. L’offre lit la présence du
  numéro sous le verrou de la Person (v4.8-18), et l’effacement regarde « conduit-elle ? »
  sous le même verrou.
- **T5.7** Claire, avec `CLAIRE_PHONE`, ne conduit pas, et « Modifier Claire » est ouvert
  (« Téléphone (facultatif) »). Une voiture de Claire est créée en base (`seedRide`). On vide
  le champ, puis « Valider » :
  - la réponse est le refus `phoneWhileDriving`, avec l’état, qui montre que Claire conduit ;
  - le formulaire montre « Un numéro est requis tant que Claire conduit. » et le libellé
    « Téléphone », le focus dans le champ ;
  - en base, Claire a toujours `CLAIRE_PHONE`.
  - Seconde scène, la réponse retenue et le formulaire fermé avant elle : la barre dit « Le
    téléphone de Claire n’a pas été enregistré. Un numéro est requis tant que Claire
    conduit. »

**T6 : ce qui ne bouge pas** (gardes).

- **T6.1** Espace organisateur, `/e/{id}/admin` avec la session de l’organisateur (fixtures
  d’`organiser-panel.spec.ts`).
  - Claire, sans numéro, conduit (`seedRide`) : « Voitures sans numéro (1) » liste
    « Voiture de Claire », avec son aide inchangée.
  - Claire ajoute un numéro depuis la fiche (T1.6) sur son appareil. Après « Actualiser »
    dans l’espace organisateur, la section dit « Toutes les voitures ont un numéro. »
- **T6.2** En revue :
  - la PR n’ajoute aucune migration, et `person.phone` reste nullable ;
  - `src/domain/phone-visibility.ts`, `phone-visibility.test.ts` et `src/db/event-rows.ts`
    ne changent pas ;
  - hors d’`event-rows.ts`, `phone` n’apparaît que dans une condition de présence sous le
    verrou (`phone IS NOT NULL`, un booléen) et dans les écritures. Aucun `select` ne prend sa
    valeur, ni `selectAll()`, ni `returningAll()` sur `person`.
- **T6.3** Les tests des critères du produit passent sans changement d’attente :
  - créer un événement en 8 actions (7 avec une session) ;
  - le tap unique avec une personne « sans voiture » ;
  - la feuille avec deux personnes.

**Non prouvable par un test** : que les gens laissent davantage de numéros, et qu’ils ne
tapent pas un faux numéro pour passer le champ obligatoire. Rien ne le mesure : pas de suivi.
À regarder avec le propriétaire lors d’un prochain événement réel. La vérification d’un
numéro reste hors périmètre.

### Décisions de la v4.8

v4.8-1. Décision : les critères s’appellent T1 à T6, et non N1 à N6 comme dans l’avis du
product designer. — Raison : N1.1 à N1.6 existent déjà (v4.4.6).

v4.8-2. Décision : un seul message par fiche, quand aucune personne de l’appareil dans cette
voiture n’a de numéro. — Raison : décision du propriétaire (#766). La personne qui conduit
joint la famille avec n’importe lequel de ses numéros. Un message par enfant demanderait le
même numéro deux fois.

v4.8-3. Décision : quand la personne de l’appareil est celle qui conduit, la phrase est
« Ajoutez un numéro pour que les personnes à bord puissent vous joindre. » — Raison : la
phrase de l’epic nomme `{driver}`, ce qui serait faux pour la personne qui conduit. Ce cas
n’existe que pour les conducteurs inscrits avant la v4.8. « Les personnes à bord » est la
forme épicène de `Admin.carsWithoutPhone.hint` et de `RideForm.noteHint`.

v4.8-4. Décision : le bouton ouvre « Modifier {prénom} » directement, le focus dans le
téléphone. Pour la personne qui conduit si elle est de l’appareil, sinon pour la première
passagère de l’appareil dans l’ordre de la fiche. — Raison : c’est le seul champ que le
message demande. Passer par la feuille du prénom ajouterait un tap.

v4.8-5. Décision : le texte visible est « Ajouter un numéro », et le nom accessible
« Ajouter un numéro pour {prénom} ». — Raison : un leg peut avoir deux messages (Léa chez
Marc, Tom chez Karim). Le nom commence par le texte visible (WCAG 2.5.3).

v4.8-6. Décision : l’apparition du message n’est pas annoncée. — Raison : elle suit un tap
dont la barre annonce déjà la réussite. Le message reste sur la fiche, et un lecteur d’écran
le rencontre en la lisant.

v4.8-7. Décision : rien n’est montré aux autres, ni sur la fiche, ni dans la feuille du
prénom. — Raison : décision du propriétaire, Q2 (b).

v4.8-8. Décision : le préremplissage ne vaut que dans « Ajouter une personne » : le bouton du
leg, et la feuille d’une place. Pas pour « Une nouvelle personne » qui conduit, ni dans
« Modifier », ni dans « Téléphone de {prénom} ». — Raison : le propriétaire a retenu Q3 (a)
sur l’avis qui excluait la nouvelle personne qui conduit. Une seconde personne qui conduit
est en général un autre adulte. Dans un champ obligatoire, un numéro prérempli serait
accepté sans être lu, et la voiture appellerait le mauvais adulte. L’epic dit « quand un
appareil ajoute une personne » ; l’exception est une décision du coordinateur (26/10).

v4.8-9. Décision : « la dernière personne qui en a un » se lit dans l’ordre de « Vos
inscriptions ». — Raison : c’est l’ordre que l’appareil voit. La personne ajoutée en dernier
y est en dernier.

v4.8-10. Décision : la ligne « Même numéro que… » ne reste que tant que le champ contient
exactement ce numéro. — Raison : sinon, elle dirait quelque chose de faux.

v4.8-11. Décision : un numéro manquant pour qui conduit dit « Un numéro est requis pour
proposer une voiture. », et non « Champ requis. ». — Raison : le champ était facultatif
partout, et il le reste ailleurs. L’erreur dit pourquoi celui-ci ne l’est pas.

v4.8-12. Décision : une personne de l’appareil sans numéro qui conduit en donne un dans le
même formulaire, sous « Qui conduit ? », et il est enregistré dans la même écriture que la
voiture. — Raison : un seul « Valider », tout ou rien (C4.5). Une seconde feuille, ou un
« Modifier » d’abord, briserait le chemin.

v4.8-13. Décision : vider son numéro est refusé tant qu’on conduit sur l’un des legs. Le
changer est accepté. — Raison : sinon, l’obligation se contournerait juste après la
création de la voiture. Le changement reste libre : on peut corriger un numéro.

v4.8-14. Décision : dans « Modifier » d’une personne qui conduit, le libellé est
« Téléphone », et l’aide ne dit pas « requis ». Un conducteur d’avant sans numéro peut
enregistrer d’autres changements avec le champ vide. — Raison : décision du propriétaire,
Q1 (b), « restent tels quels ». Le refus ne porte que sur un numéro qu’on retire, et l’aide
ne promet rien que le formulaire n’applique pas.

v4.8-15. Décision : aucune contrainte en base, aucune migration. La règle vit dans
`offerRide` et `updatePerson`, vérifiée sous le verrou de la Person (v4.8-18). — Raison : les
conducteurs d’avant n’ont pas de numéro, et une contrainte les refuserait. Les migrations
sont un chemin sensible. L’architecte décide du mécanisme.

v4.8-16. Décision : l’aide depuis une place libre garde le libellé « Téléphone
(facultatif) ». — Raison : un passager n’est pas obligé d’en donner un (Q1 b). C5.4 garde
ses trois actions.

v4.8-17. Décision : « Modifier la voiture » ne demande rien. — Raison : il ne change pas qui
conduit. Un conducteur d’avant reste tel quel, et la fiche le lui demande déjà (v4.8-3).

v4.8-18. Décision du coordinateur (revue de la v4.8) : le serveur sait si qui conduit a un
numéro par une condition de présence lue sous le verrou de la Person, par exemple
`phone IS NOT NULL` dans la requête de `lockPersons` ou à côté. Elle rend un booléen, jamais
la valeur. `phone-visibility.ts` et `event-rows.ts` ne changent pas. — Raison : une seule
requête lit la valeur de `phone` : `architecture.md` (« une règle, un seul endroit »),
`PERSON_COLUMNS` d’`event-rows.ts` (chemin sensible), `review-checklist.md`. Un booléen sous
le verrou suffit à la règle 7, et ordonne l’offre et l’effacement (T5.6). La règle 8 n’en a
pas besoin : elle ne demande que « conduit-elle ? ».

v4.8-19. Décision : « pas de numéro pour qui conduit » (règle 7, une personne de l’appareil)
et « numéro vidé par qui conduit » (règle 8, côté serveur) sont des refus qui portent
l’état (`driverWithoutPhone`, `phoneWhileDriving`), et non des erreurs de champ. — Raison :
revue de la v4.8. Les erreurs de champ reviennent sans l’état (`offer-ride.ts:107–115`), et
seuls les refus le portent (C11.6). Ces deux refus viennent d’une page périmée : l’état
relu retire le lien `tel:` de Claire, ou montre qu’elle conduit, et le formulaire met le
champ en erreur. Une nouvelle personne sans numéro reste une erreur de champ : rien n’y est
périmé.

### Hors périmètre de la v4.8

- « Pas de numéro » ou toute autre marque visible des autres personnes (Q2 b).
- Un numéro obligatoire pour un passager, à l’inscription ou en prenant une place.
- Un numéro par appareil, un « contact », une nouvelle donnée stockée.
- Vérifier un numéro (SMS, appel) ou détecter un faux numéro : aucune bibliothèque nouvelle.
  Le format reste celui de R1.
- Obliger les conducteurs d’avant à ajouter un numéro.
- Toute visibilité nouvelle d’un numéro, pour l’organisateur comme pour les autres (DO1).
- La messagerie, les notifications (hors périmètre V1).
- Ce que dit la page de confidentialité : son texte revient au propriétaire (voir
  « Documentation »).

### Documentation

Sur `main`, `docs/agents/architecture.md`, `docs/agents/glossary.md` et
`docs/agents/product.md` ne sont pas des chemins sensibles (`merge.sensitive_paths` de
`.claude/workflow.json`) : leurs lignes vont dans la PR de la tâche 1.
`docs/agents/review-checklist.md` l’est : ses lignes vont dans une PR à elles, que le
propriétaire fusionne.

- `docs/agents/glossary.md` :
  - **Person**, « téléphone (optionnel) » devient « téléphone (optionnel, sauf pour qui
    conduit) » ;
  - **Ride**, après « conducteur (Person) », ajouter : « qui a un numéro : on ne propose pas
    de voiture sans numéro, et on ne retire pas le sien tant qu’on conduit (#766). Un
    conducteur inscrit avant peut ne pas en avoir. »
- `docs/agents/product.md`, « Règles d’interaction » : une puce, qui écrit la décision du
  propriétaire sur #766 : « **Proposer une voiture** demande un numéro à qui conduit. Ailleurs, le
  numéro reste facultatif ; il est demandé sur la fiche d’une voiture quand personne de
  l’appareil qui s’y trouve n’en a, et repris d’une personne de l’appareil à l’autre. »
- `docs/agents/architecture.md`, « Visibilité du téléphone : une règle, un seul endroit »,
  après « une seule requête lit la colonne `phone` : `src/db/event-rows.ts`. » : ajouter
  « Un test de présence de `phone` sous le verrou de la Person est permis (`phone IS NOT
  NULL`, qui rend un booléen, jamais la valeur, #766) ; lire sa valeur hors de cette requête
  reste bloquant. »
- `docs/agents/review-checklist.md` (chemin sensible, **PR à elle, fusionnée par le
  propriétaire**), « Visibilité du téléphone » :
  - à la puce « Une seule requête lit la colonne `phone` », ajouter : « Un test de présence
    de `phone` sous le verrou est permis (`phone IS NOT NULL`, un booléen, jamais la
    valeur) ; lire sa valeur hors de la requête unique reste bloquant. » ;
  - ajouter une puce : « un Ride créé a un conducteur avec un numéro ; vider le numéro de
    qui conduit est refusé, sous le verrou de sa Person ».
- **Page de confidentialité** (`privacy-policy`, texte du propriétaire) : elle doit dire que
  le numéro est facultatif, sauf pour proposer une voiture, et qu’il peut être prérempli
  d’une personne à l’autre sur un même appareil.

### Les tests existants

Ce qui échoue sur la v4.8 sans être mis à jour :

- **Tout e2e qui propose une voiture par le formulaire sans numéro**, avec une nouvelle
  personne ou une personne de l’appareil sans numéro. Candidats sur `main`, à vérifier un
  par un :
  - `aller-sheets`, `bar-retour`, `bar-rides`, `bar-subjects`, `cursor` ;
  - `event-header-state`, `event-map-organiser`, `event-map`, `event` ;
  - `find-seat`, `focus-ring-board`, `held-success` ;
  - `identity-follow`, `identity-not-found`, `journey` ;
  - `offer-other-leg`, `offer-passengers`, `offer-places`, `offer-ride` ;
  - `organiser-edit-legs`, `retour-sheets`, `ride-remove` (tous `e2e/*.spec.ts`) ;
  - `e2e/event.shot.ts`.

  Recommandation : un assistant partagé (par exemple `fillDriver(form, { firstName, phone
  })` dans `e2e/`) qui remplit « Téléphone » ou « Téléphone de {prénom} ». Ou bien la
  personne amorcée avec un numéro, quand le test ne porte pas sur le formulaire. Un test qui
  porte sur un conducteur sans numéro l’amorce par `seedRide`.
- **Les libellés et descriptions du téléphone** :
  - `e2e/add-person.spec.ts` : la description depuis une place libre, et tout second ajout
    sur un appareil dont une personne a un numéro, désormais prérempli ;
  - `e2e/person-edit.spec.ts` et `e2e/bar-persons.spec.ts` : là où la personne modifiée
    conduit, le libellé devient « Téléphone ».
- **Vitest** :
  - `offer-ride.test.ts` et `offer-ride.action.test.ts` : les offres d’une nouvelle
    personne sans numéro ;
  - `persons.test.ts` : le cas « vider le numéro » d’une personne qui conduit ;
  - `person-error.test.ts` : les nouveaux codes ;
  - `failure-words.test.ts`, si des clés y sont parcourues.
- **Captures** : `e2e/event.shot.ts` et `e2e/board.shot.ts`, pour le formulaire et la
  fiche.
- **Sans changement** : les tests de l’espace organisateur, qui amorcent leurs voitures ;
  `phone-visibility.test.ts` ; `organiser-panel.test.ts`.

Le titre d’un test qui cite un libellé change avec lui. Ses identifiants de critère restent.

### Pour le développement de la v4.8

- **Trois tâches**, chacune sous 1000 lignes.
  1. Le numéro obligatoire pour qui conduit : le serveur, `ride-form.tsx`, « Modifier » pour
     qui conduit, T4 et T5. Avec la mise à jour des e2e qui proposent une voiture, et leur
     assistant partagé. C’est la plus grosse, à cause des tests. Si elle dépasse le plafond,
     l’assistant et les e2e passent d’abord, seuls (ils remplissent un champ facultatif
     aujourd’hui : ils passent sur `main`).
  2. Le message de la fiche : T1, et T6.1.
  3. Le préremplissage et l’aide depuis une place : T2 et T3.
- **Ordre** : 1 d’abord. 2 et 3 sont indépendantes ensuite. T1.6 et T4.11 amorcent un
  conducteur sans numéro par `seedRide`, que la tâche 1 ne touche pas.
- **Les clés de la v4.8** arrivent avec la tâche qui les affiche, FR et EN ensemble (C11.1).
- **La documentation** : `architecture.md`, `glossary.md` et `product.md` dans la PR de la
  tâche 1 ; `review-checklist.md` dans une PR à elle, que le propriétaire fusionne.

## Ce qui change en v4.7 : le geste « retour » ferme la feuille (#656)

Issue : https://github.com/olaurendeau/fullcar/issues/656, séparée de #650 par décision du
propriétaire (25/10/2026 ; question 3 de la v4.6). Sur iPhone, glisser depuis le bord gauche,
une feuille ouverte, quitte la page et perd ce qui a été saisi. Le propriétaire veut que le
geste ferme la feuille, comme Échap. Cette révision part de la v4.6 (suite). Elle ne dépend
pas de la façon dont #691 à #697 construisent la feuille (décision du coordinateur, v4.7-10).
Aucun mot nouveau. Dans une étape, le retour revient à l’étape d’avant, comme « Annuler » :
réponse du propriétaire à Q1, (b), inscrite sur #656 (v4.7-11).

### Le problème

Une personne remplit « Modifier Claire » ou « Proposer une voiture » sur son téléphone. Elle
fait le geste « retour » : sur iPhone, elle glisse depuis le bord gauche, souvent sans le
vouloir, en visant le début d’un champ ; sur Android, elle touche le bouton ou fait le geste
« retour ». Depuis la v4.6, une feuille à champ de saisie prend tout l’écran : elle ressemble
à une page, et le geste devient le réflexe pour « revenir ». Le navigateur quitte alors
l’événement pour la page d’avant : l’accueil, la création de l’événement, « Mes
événements ». Sur Android, sans page d’avant, il revient à l’application d’où vient le lien.
Ce qui a été tapé est perdu. Au retour, la page montre le tableau, sans la feuille.
Aujourd’hui, la personne s’en protège en touchant « Fermer », jamais le geste. Quand elle
glisse quand même, elle rouvre le lien et recommence.

### Ce qui se passe aujourd’hui (`main`, `8b4cd9b`)

En une phrase : aucune feuille ne touche à l’historique, et le geste « retour » quitte
`/e/{id}` (ou `/e/{id}/admin#{jeton}`) pour la page d’avant, avec la feuille et sa saisie.

- Ouvrir une feuille n’ajoute aucune entrée d’historique. Le seul code qui en ajoute est
  `goToAdminLink` : `router.push` vers `/e/{id}/admin#{jeton}`, après la création.
- Échap ferme la feuille (Radix, `BottomSheet`). Depuis une liste de propositions ouverte, il
  ferme la liste seule (AL1.5). Dans une étape (« Qui sort de la voiture ? », « Ajouter une
  personne » dans la feuille d’une place), Échap ferme toute la feuille ; seul « Annuler »
  revient à l’étape d’avant. Sur « Supprimer le retour ? », Échap revient au formulaire,
  sauf pendant les 10 s où la réponse est attendue : il ne fait rien.
- La barre de messages ignore Échap tant qu’un dialogue est ouvert (`message-bar.tsx`).
- Le jeton d’admin est dans le fragment. `useAdminLinkCheck` le relit à chaque `hashchange`,
  et à chaque envoi : tout changement du fragment relance la vérification du lien.
- Next.js 16.4 remplace `history.pushState` (`app-router.js`) : un état poussé reçoit `__NA`
  et l’arbre de la page. À `popstate`, Next restaure cet arbre, sans recharger. Un état non
  vide **sans** `__NA` lui fait recharger la page (`window.location.reload()`).
- Ni Next ni l’application ne règlent `history.scrollRestoration`, qui reste `auto` : un
  retour vers une entrée de la même page rend le défilement noté pour cette entrée.

### La règle (v4.7)

**1. Le retour ferme ce qu’Échap fermerait.** Une feuille ouverte, le geste ou le bouton
« retour » du navigateur ferme la feuille comme Échap. C’est vrai pour glisser depuis le
bord gauche sur iPhone, pour le bouton ou le geste « retour » d’Android, et pour
« Précédent », Alt+← ou le bouton de la souris sur ordinateur. Rien n’est envoyé. Ce qui a
été tapé sans être envoyé est perdu, comme avec Échap (v4.7-2), sauf dans une étape, où le
retour revient au formulaire, ses changements gardés (règle 3). Le focus va où Échap
l’aurait mis, et la page reste où elle était. La barre de messages ne change pas. La règle
vaut pour toutes les feuilles de la page, à champ de saisie ou non (v4.7-1), sur `/e/{id}`
comme sur `/e/{id}/admin#{jeton}`.

**2. Le premier plan d’abord.** Une boîte de confirmation ouverte au-dessus d’une feuille
(« Supprimer le retour ? », au-dessus de « Modifier l’événement ») se ferme seule au retour,
comme avec Échap : l’organisateur revient au formulaire, et ce qu’il y a tapé est gardé.
Pendant les 10 s d’attente de sa réponse, Échap n’y fait rien, et le retour non plus
(v4.7-6). Une liste de propositions ouverte se ferme avec sa feuille : pour elle, le retour
n’est pas l’Échap du champ (v4.7-5).

**3. Une étape revient à l’étape d’avant** (décision du propriétaire, Q1 : b, v4.7-11).
Dans « Qui sort de la voiture ? », l’étape de « Modifier la voiture », le retour fait ce que
fait « Annuler » : il revient au formulaire, avec ses changements gardés (lieu, heure,
places, note). Dans la feuille d’une place, depuis « Ajouter une personne », il revient à
« Qui monte dans la voiture de {driver} ? », comme « Annuler », et ce qui a été tapé dans
« Ajouter une personne » est perdu, comme avec « Annuler ». Un second retour ferme la
feuille. Échap ne change pas : il ferme toujours toute la feuille.

**3 bis. Une étape ou une boîte compte un pas tant qu’elle est ouverte, quelle que soit la
façon dont elle s’ouvre ou finit** (v4.7-12). Les étapes et la boîte ne s’ouvrent et ne se
ferment pas seulement d’un toucher : la réponse du serveur en ouvre et en ferme aussi.

- **Toute façon de l’ouvrir ajoute un pas.** « Qui sort de la voiture ? » s’ouvre au
  « Valider » du formulaire quand les places tapées sont sous le nombre de passagers, ou
  après la réponse de `updateRide`, quand le serveur compte plus de passagers que de places
  (`ride-form.tsx:403`, depuis un « Valider » qui tenait sur l’appareil). « Supprimer le
  retour ? » s’ouvre après la réponse `confirmRetour` de « Valider »
  (`edit-event-sheet.tsx:200`), ou au « Valider » qui la rouvre avec ses nombres changés
  (décision 49). « Ajouter une personne » de la feuille d’une place s’ouvre d’un toucher.
- **Une étape rouverte n’ajoute rien.** « Qui sort de la voiture ? » refusée par le serveur
  (`RideChanges.leaving.changed`) se rouvre depuis elle-même, pour un nouveau tour
  (`round + 1`) : c’est le même pas. De même, la boîte qui reste ouverte avec de nouveaux
  nombres, un échec (`problem`), un refus (`invalid`, dit « failed ») ou `eventNotFound`
  garde son pas.
- **Toute façon de la finir, la feuille restant ouverte, retire un pas.** « Annuler » de
  l’étape ; la réponse `errors` qui ramène au formulaire (`ride-form.tsx:394`) ; la réponse
  dont les places tiennent désormais (`:403`, l’étape fermée) ; « Valider » d’« Ajouter une
  personne » de la feuille d’une place, qui revient à la liste, la personne ajoutée cochée
  (`onDone` → `setAdding(null)`) ; « Annuler » ou Échap de la boîte ; les réponses `changed`
  et `errors` de « Supprimer le retour », qui ferment la boîte seule et laissent le
  formulaire dire pourquoi (`edit-event-sheet.tsx:267`) ; la boîte fermée après ses 10 s
  d’attente.
- **Fermer la feuille depuis l’intérieur d’une étape ou de la boîte retire deux pas** : le
  sien et celui de la feuille. Ce sont Échap dans l’étape, une réponse `done` ou `noRetour`
  à « Valider » de l’étape, la réponse `saved` à « Supprimer le retour », et la feuille
  d’une place fermée depuis « Ajouter une personne » (`onGone`).
- **Le retour lui-même** retire le pas de l’étape ou de la boîte : il ne fait rien d’autre
  dans l’historique.

Après chacune de ces fins, un retour fait ce que dit la règle 4 pour ce qui reste ouvert : il
ferme la feuille si elle l’est encore, et quitte la page sinon.

**4. Un retour, un pas.** Une feuille ouverte compte un pas en arrière, et un seul. Une
boîte ou une étape qui a sa propre règle (règles 2 et 3) compte un pas de plus. Le premier
retour ferme la feuille ; le suivant quitte la page, comme aujourd’hui sans feuille. Un même
retour ne ferme jamais une feuille *et* ne quitte jamais la page.

**5. Fermée autrement, la feuille ne laisse rien.** Après « Fermer », « Annuler », Échap, un
toucher sur le voile, un « Valider » ou un « Placer n personnes » qui ferme, une action de
cellule, « Voir la voiture » ou « Trouver une place », un seul retour quitte la page, comme
si la feuille n’avait jamais été ouverte. Ce que l’action a fait n’est pas défait : le
défilement de « Trouver une place », le focus après une action (v4.7-7).

**6. L’adresse ne change pas.** Feuille ouverte, l’adresse est la même que sans feuille,
caractère pour caractère. `/e/{id}` reste court pour un SMS. Le jeton de
`/e/{id}/admin#{jeton}` reste dans le fragment, et aucun `hashchange` n’a lieu. Rien dans
l’adresse ne dit qu’une feuille est ouverte (v4.7-3).

**7. Rien n’est rechargé ni demandé.** Le retour qui ferme une feuille ne recharge pas la
page et n’envoie aucune requête, en ligne comme hors ligne.

**8. Rien d’une personne dans l’historique.** Ce que la page ajoute à l’historique est une
marque opaque : ni prénom, ni numéro, ni jeton, ni texte tapé (v4.7-4).

**9. Rechargée, ou revenue par « Suivant ».** Une page rechargée feuille ouverte s’affiche
sans feuille, comme aujourd’hui. « Suivant », après un retour qui a fermé une feuille, ne la
rouvre pas. Dans ces deux cas seulement, un retour peut ne rien faire de visible avant celui
qui quitte la page. Il y en a au plus un, et il ne recharge rien (v4.7-8).

### Le mécanisme (recommandation à l’architecte, qui décide)

- **À l’ouverture**, dans le toucher ou la touche qui ouvre la feuille, la page ajoute une
  entrée : `history.pushState({ <marque>: <identifiant de cette ouverture> }, "")`, **sans
  troisième argument**. L’adresse ne change pas, le fragment non plus. Le `pushState` de
  Next y copie `__NA` et l’arbre : à `popstate`, Next restaure la même page, sans requête.
  Jamais le `pushState` d’origine, ni un état sans `__NA` : Next rechargerait la page au
  retour (G1.1 l’attrape).
- **Une étape ou la boîte** ajoute sa propre entrée de la même façon, à chaque ouverture de
  la règle 3 bis, qu’elle vienne d’un toucher ou d’une réponse ; jamais pour un tour de plus
  (`round + 1`). À `popstate`, l’étape ou la boîte ouverte finit par le chemin d’« Annuler ».
  Toute autre fin, la feuille restant ouverte, fait `history.back()` une fois ; une
  fermeture de toute la feuille depuis l’étape ou la boîte retire les deux entrées
  (`history.go(-2)`, ou deux `history.back()`), si ce sont encore les siennes. Le plus
  simple est que la feuille tienne la profondeur qu’elle a ajoutée (0, 1 ou 2) et la
  ramène à ce qui est ouvert après chaque changement d’étape, quelle qu’en soit la cause,
  plutôt que chaque chemin appelle l’historique lui-même.
- **À `popstate`**, si une feuille est ouverte et que l’entrée active n’est plus la sienne,
  elle se ferme par le même chemin qu’Échap, **sans** `history.back()`.
- **Fermée autrement**, si l’entrée active est encore la sienne (sa marque, son
  identifiant), la page fait `history.back()` une fois, puis attend le `popstate` qui suit ;
  sinon, elle ne fait rien. Une feuille ouverte pendant cette attente ajoute son entrée
  après ce `popstate` (G1.9).
- **Le défilement.** `scrollRestoration` est `auto` : le retour qui retire l’entrée d’une
  feuille fermée par une action rendrait le défilement d’avant l’action. Soit l’entrée part
  avant que l’action fasse défiler (attendre le `popstate`), soit le défilement de l’action
  est refait ensuite. L’architecte choisit, G1.10 prouve. Le `scrollY` que la v4.6 rend à la
  fermeture sur iPhone (v4.6-15) suit la même règle.
- **Les écritures de Next.** Après une mise à jour de type navigation, Next fait
  `replaceState({ __NA, arbre })` sans garder l’état ajouté (`preserveCustomHistoryState:
  false`) : la marque de l’entrée active serait perdue, et la fermeture laisserait une
  entrée sans effet. Rien ne navigue aujourd’hui feuille ouverte ; G1.11 le garde, avec des
  envois faits depuis une feuille.
- **Chrome sur Android** saute, au retour, une entrée ajoutée par une page qui n’a reçu
  aucune action de la personne depuis l’entrée précédente. Chaque entrée de la page suit une
  telle action : le toucher qui ouvre la feuille, l’étape ou la boîte, ou le « Valider » dont
  la réponse ouvre l’étape ou la boîte, même ajoutée après un `await`. La règle ne
  s’applique donc pas ; c’est ce que vérifie G2.7, que Playwright ne peut pas prouver.
- **Écartés.** Un fragment (`#feuille`) ou un paramètre (`?feuille`) changerait l’adresse
  copiée et partagée. Sur `/admin`, il remplacerait le jeton et relancerait sa vérification.
  `beforeunload` n’arrête pas le geste d’iPhone, et pose une question au lieu de fermer.
  `CloseWatcher` n’existe que dans Chromium, et le geste de Safari ne le déclenche pas.
- **Indépendant de #691 à #697** (v4.7-10). Le mécanisme ne lit que « la feuille est
  ouverte » et appelle la fermeture d’Échap. Il ne dépend ni de `fullHeight`, ni de
  `SheetBar`, ni de `visualViewport` ou `sheet-frame.ts`. Il touche `bottom-sheet.tsx`, que
  #691 modifie aussi : l’ordre des fusions crée un conflit de texte, pas de conception.
  `remove-retour-dialog.tsx`, `seat-sheet.tsx` et `ride-form.tsx` (les étapes) s’en servent
  aussi.

### Les risques, un par un

| risque | ce qui se passerait | ce qui l’empêche | preuve |
|---|---|---|---|
| double retour | la feuille fermée par le retour fait aussi `history.back()` : un geste ferme la feuille **et** quitte la page | la fermeture par `popstate` ne fait pas `history.back()` | G1.4 |
| deux gestes rapides | le premier ferme, le second quitte | voulu (règle 4) | G1.4 |
| entrée sans effet après « Valider », Échap, « Fermer » | un retour ne fait rien, la personne recommence | `history.back()` à la fermeture, si l’entrée est la sienne | G1.5 |
| historique profond | une entrée par ouverture : vingt retours pour quitter | au plus une entrée de feuille à la fois (deux avec une boîte ou une étape) | G1.6 |
| fermée depuis une étape ou la boîte | Échap ou « Valider » dans « Qui sort de la voiture ? », ou `saved` à « Supprimer le retour », laisse l’entrée de la feuille : un retour sans effet | la fermeture retire les deux entrées | G1.15, G1.17 |
| étape ou boîte ouverte ou finie par une réponse | une étape ouverte par `updateRide` sans entrée : le retour ferme toute la feuille ; une boîte fermée par `saved` qui ne retire qu’un pas : un retour sans effet | chaque ouverture ajoute un pas, chaque fin en retire un, la fermeture de la feuille deux (règle 3 bis) | G1.15, G1.17 |
| rouvrir aussitôt | le `history.back()` en vol ferme la feuille qu’on vient d’ouvrir | l’ouverture attend le `popstate` de la fermeture | G1.9 |
| lien à partager | l’adresse copiée feuille ouverte porte `#feuille`, ou s’allonge | l’adresse ne change pas | G1.7 |
| lien d’organisateur | un fragment changé remplace le jeton, ou relance la vérification (« Ce lien d’organisateur n’est pas valide. ») | pas de troisième argument à `pushState`, aucun `hashchange` | G1.8 |
| Next recharge la page | un état sans `__NA` : `location.reload()` au retour, la saisie perdue | le `pushState` de Next, jamais celui d’origine | G1.1 |
| défilement rendu | « Trouver une place » amène à la place, puis le retour de la page ramène l’ancien défilement | l’entrée part avant le défilement de l’action, ou il est refait | G1.10 |
| Next efface la marque | une entrée sans effet après une navigation, feuille ouverte | rien ne navigue feuille ouverte ; envois gardés par test | G1.11 |
| rechargement, « Suivant » | une entrée sans feuille : un retour sans effet | accepté, au plus un (v4.7-8) | G1.12, G1.13 |
| Chrome saute l’entrée | le retour quitte la page malgré l’entrée | l’entrée est ajoutée dans le toucher | G2.7 |
| Safari pendant le geste | un éclair de la page d’avant, ou de la feuille | à vérifier à la main | G2.4 |
| « Supprimer le retour ? » en attente | trois retours en moins de 10 s quittent la page pendant l’envoi | accepté (v4.7-6) : un retour ne se refuse pas | G1.15 |
| l’historique garde des données | un prénom ou un jeton gardé par le navigateur, parfois au-delà de l’onglet | une marque opaque seulement | G1.14 |

### Les états de la v4.7 (dessinés dans la page)

D’abord, « L’historique, pas à pas » : une pile par scène — ouvrir puis retour ; ouvrir puis
« Valider » ou Échap ; deux retours ; cinq ouvertures et fermetures ; page rechargée feuille
ouverte (un retour sans effet, puis la page d’avant) ; une boîte au-dessus d’une feuille ;
une étape, puis retour. Puis, numérotés comme dans la page :

1. Avant, sur iPhone : « Modifier Claire », « Clara » tapé. Le geste depuis le bord gauche
   ramène à la page d’avant, et « Clara » est perdu.
2. Après, pendant le geste : la feuille glisse vers la droite, et le tableau apparaît
   dessous, pas la page d’avant.
3. Après, à la fin du geste : le tableau, au même défilement. Le focus est sur « Claire »
   dans « Vos inscriptions », l’adresse est inchangée, et rien n’est enregistré.
4. Geste lâché à mi-chemin : la feuille reste, « Clara » aussi.
5. Android, bouton « retour » : la feuille se ferme. Un second retour quitte la page.
6. `/e/{id}/admin#{jeton}` : « Modifier l’événement » fermé par le retour. L’espace
   organisateur reste, à la même adresse.
7. « Supprimer le retour ? » (7a), puis le retour (7b) : le formulaire revient, « Retour »
   toujours décoché, le titre tapé gardé.
8. « Qui sort de la voiture ? » (8a), puis le retour (8b) : « Modifier la voiture » revient,
   1 place et la note tapée gardées, le focus sur « Places, sans compter qui conduit »,
   comme après « Annuler » ; un second retour ferme la feuille.
9. « Lieu de départ », liste ouverte : le retour ferme la feuille et la liste.
10. « Trouver une place » : la feuille fermée, la place libre reste en vue, avec le focus.
11. Ordinateur, 1280 px : « Précédent » ferme la feuille.

### Les mots de la v4.7

Aucun mot nouveau, changé ou retiré. Le retour ne dit rien : ni message, ni annonce, comme
Échap. Pas de « Vos changements seront perdus » (hors périmètre). Les états dessinés
reprennent des mots existants, tels qu’ils sont dans `messages/fr.json` et
`messages/en.json` :

| où | français | anglais |
|---|---|---|
| titres | « Modifier {firstName} », « Proposer une voiture », « Modifier la voiture », « Modifier l’événement », « Qui sort de la voiture ? », « Qui monte dans la voiture de {driver} ? » | “Edit {firstName}”, “Offer a car”, “Edit the car”, “Edit the event”, “Who leaves the car?”, “Who gets in {driver}’s car?” |
| boîte | « Supprimer le retour ? », « Supprimer le retour », « Annuler » (`EditEvent.removeRetour.title`, `.confirm`, `Actions.cancel`) | “Remove the return trip?”, “Remove the return trip”, “Cancel” |
| barre | « Valider », « Fermer », « Annuler » | “Confirm”, “Close”, “Cancel” |
| espace organisateur, affiché | « Lien à partager », « Lien d’organisateur » (`Admin.shareLink.label`, `Admin.adminLink.label`) | “Link to share”, “Organiser link” |
| espace organisateur, qui ne doit pas s’afficher après un retour | « Chargement de l’espace organisateur… », « Ce lien d’organisateur n’est pas valide. » (`Admin.loading`, `Admin.invalid.title`) | “Loading the organiser area…”, “This organiser link is not valid.” |
| « Vos inscriptions », qui ne doit pas s’afficher après un retour | « Chargement de vos inscriptions… » (`DevicePersons.loading`) | “Loading your sign-ups…” |

### Critères de la v4.7

**Histoire H9, « Revenir en arrière sans quitter l’événement ».** En tant que personne qui
remplit une feuille sur son téléphone, quand je fais le geste « retour », je veux que la
feuille se ferme comme avec Échap, pour rester sur l’événement au lieu d’en sortir.

**Histoire H10, « Le lien d’organisateur survit au retour ».** En tant qu’organisateur sur
`/e/{id}/admin#{jeton}`, quand je fais le geste « retour » dans « Modifier l’événement », je
veux que la feuille se ferme sans que mon lien change ni soit vérifié de nouveau.

**G1 : prouvés par Playwright avant la fusion**, projet `e2e` (Chromium, Pixel 7 émulé,
360 px), sauf mention contraire. Chaque test va d’abord sur `/`, puis sur la page de
l’événement : « quitter la page » veut dire que `page.url()` redevient celle de `/`. Après le
chargement, le test pose `window.__g1 = 1` : « sans rechargement » veut dire que
`window.__g1` vaut encore 1 et qu’aucun évènement `load` n’a eu lieu. « Sans requête » veut
dire qu’entre le `page.goBack()` et la fin de la vérification, `page.on("request")` ne voit
ni document, ni requête RSC (en-tête `RSC` ou paramètre `_rsc`), ni requête `next-action`.
Les préchargements de Next (en-tête `Next-Router-Prefetch`) ne comptent pas : la page a un
`<Link>`, « Nous contacter » du pied de page (`contact-footer.tsx`), que Next peut précharger
quand il passe en vue.
« Fermée » veut dire qu’il n’y a plus de `role="dialog"` ni de `role="alertdialog"`.

- **G1.1** Pour chacune de ces feuilles : la cellule « Tom · Aller » ; « Claire » ;
  « Modifier Claire » avec « Clara » tapé ; « Ajouter une personne » depuis l’onglet Aller,
  dans la feuille d’une place, et en première inscription depuis une place libre
  (`RegisterSheet`), « Inès » tapé ; « Qui monte dans la voiture de Sophie ? » ; « Proposer
  une voiture » avec « Marc » tapé ; « Modifier la voiture » avec la note changée ;
  « Modifier l’événement » sur `/admin`, le titre changé. On l’ouvre, puis `page.goBack()` :
  la feuille est fermée, `page.url()` est celle d’avant l’ouverture, sans rechargement ni
  requête. En base, rien n’a changé (Claire s’appelle toujours « Claire »).
- **G1.2** Comme Échap. Pour la cellule « Tom · Aller », « Claire », « Modifier Claire »,
  « Proposer une voiture » (onglet Aller) et « Qui monte dans la voiture de Sophie ? » :
  après `page.goBack()`, l’élément qui a le focus est celui qui l’a après Échap dans la même
  scène (même rôle, même nom accessible). La page étant à `scrollY` = 800 avant
  l’ouverture, elle y est encore (à 1 px). `messages(page)` est le même avant l’ouverture et
  après le retour, et `recordBar` ne voit aucune écriture.
- **G1.3** Hors ligne (`context.setOffline(true)`), « Modifier Claire » ouvert, « Clara »
  tapé, `page.goBack()` : la feuille est fermée, aucune alerte non vide dans la page, aucune
  ligne dans la barre, nulle part « Action impossible, vérifiez la connexion ».
- **G1.4** Un retour, un pas. « Modifier Claire » ouvert, `page.goBack()`, puis 1 000 ms
  d’attente : `page.url()` est toujours celle de l’événement, et la feuille est fermée. Un
  second `page.goBack()` quitte la page. Deux `page.goBack()` à la suite, sans attente : la
  page est quittée, et un `page.goForward()` revient à l’événement sans feuille.
- **G1.5** Aucune entrée laissée. Pour chaque façon de fermer — « Fermer », Échap, un clic
  à (180, 10) sur la cellule « Tom · Aller », « Valider » qui enregistre (« Modifier
  Claire », téléphone changé, réponse reçue), « Valider » sans changement, « Ne fait pas
  l’aller » dans la cellule, « Trouver une place », « Placer 2 personnes », « Annuler » de
  « Modifier l’événement » — un seul `page.goBack()` quitte la page.
- **G1.6** Historique borné. `L` est `history.length` avant la première ouverture. Cinq
  ouvertures, fermées par « Fermer », Échap, le voile, « Valider » et `page.goBack()` :
  `history.length` vaut au plus `L + 1` après chacune. Ensuite, un seul `page.goBack()`
  quitte la page. Passer de l’onglet Aller à Retour, et replier puis déplier « Vos
  inscriptions », ne change pas `history.length`.
- **G1.7** L’adresse. Feuille ouverte, `page.url()` est identique à celle d’avant
  l’ouverture, sur `/e/{id}` (ni `#`, ni `?`) comme sur `/e/{id}/admin#{jeton}`.
- **G1.8** Le lien d’organisateur. Sur `/e/{id}/admin#{jeton}`, « Modifier l’événement »
  ouvert, le titre changé, `page.goBack()` : la feuille est fermée, et `location.hash` vaut
  `#{jeton}`. Un écouteur `hashchange` posé avant l’ouverture n’a rien vu. Aucune requête
  `next-action` ne part. « Lien à partager » et « Lien d’organisateur » sont affichés, sans
  « Chargement de l’espace organisateur… » ni « Ce lien d’organisateur n’est pas valide. ».
  Puis un `page.goBack()` quitte la page. Même chose avec la cellule « Tom · Aller » sous
  l’espace organisateur. Arrivée par la création (`/nouveau`, puis `router.push` vers
  `/admin#{jeton}`) : feuille ouverte, un `page.goBack()` la ferme, et le suivant mène à la
  même page qu’un `page.goBack()` sans feuille dans la même scène.
- **G1.9** Rouvrir aussitôt. « Fermer », puis, sans attente, un clic qui rouvre la même
  feuille : 1 000 ms plus tard, elle est ouverte. Un `page.goBack()` la ferme, le suivant
  quitte la page.
- **G1.10** L’action n’est pas défaite. « Trouver une place » pour Léa au retour : 1 000 ms
  après la fermeture, la première place libre est entièrement visible
  (`toBeInViewport({ ratio: 1 })`) et a le focus. « Voir la voiture » : le titre de la carte
  aussi. « Proposer une voiture » validé avec des passagers : le titre de la carte aussi.
  Les tests existants du focus après une action passent sans changement.
- **G1.11** Les envois d’une feuille. Hors ligne, « Valider » dans « Modifier Claire »
  échoue (K1.9) ; de retour en ligne, « Valider » enregistre et ferme : un seul
  `page.goBack()` quitte la page. Puis, réponse retenue par `page.route`, « Valider » et
  `page.goBack()` pendant l’envoi : la feuille est fermée. La réponse relâchée,
  `messages(page)` est celui de la même scène fermée par Échap pendant l’envoi, et un seul
  `page.goBack()` quitte la page.
- **G1.12** Rechargée. « Modifier Claire » ouvert, `page.reload()` : aucune feuille. Le test
  pose de nouveau `window.__g1 = 1`. Un `page.goBack()` : l’adresse est celle de
  l’événement, sans feuille ni rechargement. Le suivant quitte la page.
- **G1.13** « Suivant ». Une feuille fermée par `page.goBack()`, puis `page.goForward()` :
  aucune feuille, sans rechargement ni requête. Ensuite, deux `page.goBack()` quittent la
  page, et le premier ne recharge rien.
- **G1.14** Rien d’une personne. Feuille ouverte, `history.state` a exactement une clé de
  plus qu’avant l’ouverture, et ses autres valeurs n’ont pas changé. `JSON.stringify` de
  cette valeur ne contient ni « Clara », ni « Claire », ni le numéro de Claire, ni, sur
  `/admin`, le jeton.
- **G1.15** « Supprimer le retour ? ». « Modifier l’événement », « Retour » décoché, titre
  changé, « Valider » : la boîte s’ouvre à la réponse `confirmRetour`, après un `await`.
  - `page.goBack()` : la boîte est fermée, la feuille ouverte, « Retour » décoché, le titre
    tapé gardé, et le focus sur « Valider », comme après Échap. Le `page.goBack()` suivant
    ferme la feuille, et le suivant quitte la page.
  - « Annuler » de la boîte : un `page.goBack()` ferme la feuille, et le suivant quitte.
  - « Supprimer le retour », réponse `saved` : la boîte et la feuille sont fermées. Un seul
    `page.goBack()` quitte la page.
  - « Supprimer le retour », réponse `changed` (l’événement modifié par un autre appareil
    entre-temps) : la boîte se ferme, la feuille reste et dit « L’événement vient d’être
    modifié depuis un autre appareil. ». Un `page.goBack()` ferme la feuille, et le suivant
    quitte la page. De même pour une réponse `errors`.
  - « Supprimer le retour », réponse `confirmRetour` aux nombres changés : la boîte reste et
    dit « Le retour a changé entre-temps : vérifiez les nombres ci-dessus, puis confirmez de
    nouveau. ». Un `page.goBack()` la ferme seule, le suivant ferme la feuille.
  - Réponse retenue par `page.route`, « Supprimer le retour » touché : un `page.goBack()`
    dans les 10 s laisse la boîte ouverte, et rien n’est renvoyé. La réponse relâchée, la
    suite est celle des tests existants.
  - `history.length` vaut au plus `L + 2` tout au long.
- **G1.16** La liste des propositions. « Lieu de départ » de « Proposer une voiture », liste
  ouverte (`fake-photon`), `page.goBack()` : ni feuille, ni `role="listbox"`.
- **G1.17** Une étape revient à l’étape d’avant (v4.7-11, v4.7-12). Scène de K1.5 :
  « Modifier la voiture » de Claire (deux passagers), places de 3 à 1, note changée,
  « Valider » : « Qui sort de la voiture ? ».
  - `page.goBack()` : le titre est « Modifier la voiture », « Places, sans compter qui
    conduit » vaut 1 et a le focus, comme après « Annuler » de l’étape, et la note est
    celle tapée. Aucune requête `next-action` ; la base garde 3 places et l’ancienne note.
    Le `page.goBack()` suivant ferme la feuille, et le suivant quitte la page.
  - « Qui sort de la voiture ? » fermée par Échap : un seul `page.goBack()` quitte la page.
    Même chose après « Valider » de l’étape, Nina cochée, réponse `done`.
  - « Annuler » de l’étape : le formulaire revient ; un `page.goBack()` ferme la feuille, et
    le suivant quitte la page.
  - **Ouverte par la réponse.** Places de 3 à 2 (elles tiennent sur l’appareil), mais un
    autre appareil a fait monter un troisième passager : « Valider », et « Qui sort de la
    voiture ? » s’ouvre à la réponse de `updateRide`. `page.goBack()` : le formulaire
    revient, 2 places et la note tapée. Le suivant ferme la feuille, le suivant quitte.
  - **Rouverte.** Dans l’étape, un autre appareil change les passagers, puis « Valider » :
    l’étape se rouvre pour un nouveau tour, avec « Quelqu’un a pris ou libéré une place
    entre-temps : rien n’a changé. Choisissez à nouveau parmi les personnes à bord. ».
    `history.length` n’a pas changé ; un `page.goBack()` revient au formulaire, le suivant
    ferme la feuille.
  - **Finie par la réponse `errors`.** Dans l’étape, « Valider » dont l’envoi est réécrit
    par `page.route` (une note de 300 caractères) : la réponse `errors` ramène au formulaire,
    l’erreur sous « Note (facultatif) ». Un seul `page.goBack()` ferme la feuille, et le
    suivant quitte la page. De même quand la réponse dit que les places tiennent désormais
    (un passager parti entre-temps) : le formulaire revient, et un retour ferme la feuille.
  - Dans la feuille d’une place de la voiture de Sophie, « Ajouter une personne », « Inès »
    tapé, `page.goBack()` : le titre est « Qui monte dans la voiture de Sophie ? », la liste
    est là, et Inès n’est pas créée. Le suivant ferme la feuille, et le suivant quitte la
    page.
  - La même, « Valider » qui enregistre Inès : la feuille revient à « Qui monte dans la
    voiture de Sophie ? », Inès cochée et focalisée. Un `page.goBack()` ferme la feuille, et
    le suivant quitte la page.
  - `history.length` vaut au plus `L + 2` tout au long.
- **G1.18** Les gardes. Sans feuille ouverte, le premier `page.goBack()` quitte la page :
  le chargement n’ajoute aucune entrée. À 1280 × 800, G1.1 et G1.5 (Échap) pour « Modifier
  Claire ». Les tests existants des feuilles passent sans changement.

**G2 : vérifiés à la main, après le déploiement, sans bloquer** (v4.7-9 ; décision du
propriétaire pour #650, v4.6-8), sur https://fullcar.app. iPhone : Safari récent, barre
d’adresse en haut puis en bas. Playwright n’a ni le geste de Safari d’iOS, ni le bouton
d’Android, ni la règle de Chrome sur les entrées sautées.

- **G2.1** « Modifier Claire », taper « Clara », glisser depuis le bord gauche jusqu’au
  bout : la feuille se ferme, le tableau est là, au même endroit. « Claire » n’a pas changé.
  La page ne se recharge pas : « Vos inscriptions » ne repasse pas par « Chargement de vos
  inscriptions… ».
- **G2.2** Le même geste, lâché à mi-chemin : la feuille reste, et « Clara » est dans le
  champ.
- **G2.3** Clavier ouvert, dans « Proposer une voiture » : le geste ferme la feuille et le
  clavier, et rien ne reste décalé (K2.5).
- **G2.4** Pendant le geste, on voit le tableau sous la feuille, jamais la page d’avant. À
  la fin, ni éclair, ni rechargement.
- **G2.5** Deux gestes : le premier ferme la feuille ; le second ramène à la page d’avant,
  ou ne fait rien si l’onglet n’en a pas.
- **G2.6** Sur `/e/{id}/admin#{jeton}` : le geste ferme « Modifier l’événement » ;
  l’espace organisateur reste, et « Copier » du « Lien d’organisateur » donne toujours le
  lien avec le jeton.
- **G2.7** Android, Chrome, en navigation à trois boutons puis par gestes. Ouvrir une
  feuille d’un toucher, ne rien faire d’autre, puis « retour » : la feuille se ferme (Chrome
  ne saute pas l’entrée). Second retour : la page d’avant, ou l’application d’où vient le
  lien.
- **G2.8** Lien ouvert depuis une messagerie (Messages, WhatsApp), sur iPhone et sur
  Android : feuille ouverte, le geste ferme la feuille ; sans feuille, il fait ce qu’il
  fait aujourd’hui.
- **G2.9** « Qui sort de la voiture ? », places changées : le geste revient à « Modifier la
  voiture », les changements gardés ; un second geste ferme la feuille.

Un G2 qui échoue ouvre une nouvelle issue, avec une vidéo de l’écran. Elle revient au
product designer.

### Décisions de la v4.7

v4.7-1. Décision : le retour ferme toutes les feuilles, pas seulement celles qui portent un
champ de saisie. — Raison : le propriétaire dit « comme Échap », et Échap ferme toutes les
feuilles. Sur Android, « retour » ferme ce qui est ouvert, partout. Une feuille qui change
de contenu (la personne devient « Modifier Claire », la place « Ajouter une personne »)
aurait sinon une règle qui change sous le doigt. Une feuille de choix cache aussi le
tableau, et en sortir par le retour surprend, même sans rien perdre.

v4.7-2. Décision : le retour est Échap, y compris pour ce qui a été tapé et pas envoyé, qui
est perdu. — Raison : la demande du propriétaire. Le dommage de #656 est de quitter
l’événement ; rester sur la page, feuille fermée, est ce qu’Échap fait déjà. Garder un
brouillon serait une autre décision, hors périmètre.

v4.7-3. Décision : l’adresse ne change jamais, ni fragment, ni paramètre. — Raison : le
fragment porte le jeton d’admin (et portera celui du lien perso), relu à chaque `hashchange`.
`/e/{id}` doit tenir dans un SMS, et une adresse copiée feuille ouverte se partage telle
quelle.

v4.7-4. Décision : l’entrée ajoutée ne porte qu’une marque opaque. — Raison : le navigateur
garde l’historique d’un onglet, parfois au-delà de sa fermeture. Rien d’une personne n’y va :
ni prénom, ni numéro, ni jeton, ni texte tapé. Rien de ce qui est stocké sur une personne ne
change.

v4.7-5. Décision : la liste des propositions n’a pas de pas à elle ; le retour ferme la
feuille et la liste. — Raison : la liste s’ouvre en tapant, sans toucher, et se ferme et se
rouvre au fil des lettres : un pas par ouverture remplirait l’historique. Échap reste sa
touche (AL1.5).

v4.7-6. Décision : « Supprimer le retour ? » a son propre pas (règle 3 bis). Pendant ses 10 s d’attente,
le retour ne ferme rien, comme Échap. — Raison : sinon, le retour fermerait « Modifier
l’événement » et perdrait ce que l’organisateur y a tapé. Risque accepté : un retour ne se
refuse pas, il se compte seulement. Trois retours en moins de 10 s quittent donc la page
pendant l’envoi. Après deux, la feuille reste ouverte sans entrée, et le retour suivant
quitte la page comme aujourd’hui.

v4.7-7. Décision : une feuille fermée autrement retire son entrée, et ce que fait l’action
reste. — Raison : sinon, chaque ouverture laisserait un retour sans effet, et le défilement
rendu par le navigateur défairait « Trouver une place ».

v4.7-8. Décision : après un rechargement ou un « Suivant », un retour sans effet est
accepté, au plus un. — Raison : l’enlever demanderait que la page fasse elle-même un retour
au chargement, qui croiserait le premier toucher et ferait restaurer à Next un arbre de la
page d’avant. Un retour sans effet ne perd rien. Rouvrir la feuille au « Suivant »
demanderait de garder son contenu dans l’historique, contre v4.7-4.

v4.7-9. Décision du coordinateur, inscrite sur #656 : G1 est la seule preuve avant la
fusion ; G2 se vérifie à la main après le déploiement, sans bloquer. — Raison : la même
règle que la décision du propriétaire pour #650 (v4.6-8). Playwright n’a ni le geste de Safari d’iOS, ni le bouton d’Android, ni la règle
de Chrome sur les entrées sautées. `page.goBack()` prouve tout le reste.

v4.7-10. Décision du coordinateur : la v4.7 part de la v4.6 (suite), et le mécanisme ne
dépend pas de la façon dont #691 construit la feuille. — Raison : #691 vient de commencer.
Le mécanisme ne lit que l’état ouvert de la feuille.

v4.7-11. Décision du propriétaire (Q1 : b), inscrite sur #656 : dans une étape (« Qui sort
de la voiture ? », « Ajouter une personne » dans la feuille d’une place), le retour revient
à l’étape d’avant, comme « Annuler », ses changements gardés ; un second retour ferme la
feuille. Échap ne change pas. — Raison : une étape pleine hauteur se lit comme une page de
plus, et le geste « retour » y veut dire « revenir ». C’est aussi là que se perd la saisie
la plus longue. L’option écartée, (a), fermait toute la feuille comme Échap.

v4.7-12. Décision : une étape ou une boîte compte un pas tant qu’elle est ouverte. Toute
façon de l’ouvrir en ajoute un, qu’elle vienne d’un toucher ou d’une réponse du serveur ; un
nouveau tour de la même étape n’en ajoute aucun ; toute façon de la finir, la feuille restant
ouverte, en retire un ; fermer la feuille depuis l’intérieur en retire deux. — Raison : revue
de design de la v4.7 (suite), bloquant 1. « Qui sort de la voiture ? » et « Supprimer le
retour ? » s’ouvrent et se ferment aussi sur une réponse, et « Valider » d’« Ajouter une
personne » ramène à la liste sans fermer la feuille. Une règle liée aux seuls touchers
laissait une étape sans pas, ou un pas sans étape.

### Hors périmètre de la v4.7

- Garder ce qui a été tapé après une fermeture, quelle qu’elle soit (un brouillon), ou
  demander « Abandonner les changements ? ».
- « Retirer la voiture ? », ouverte depuis la carte, sans feuille : le retour quitte la
  page, comme aujourd’hui. Rien n’y est tapé.
- Rouvrir une feuille par « Suivant », ou une adresse qui ouvre une feuille.
- Les onglets Aller et Retour, le repli de « Vos inscriptions », la bulle de la carte et la
  barre de messages : ils ne comptent aucun pas, et le retour ne les ferme pas.
- Les autres pages (`/`, `/nouveau`, le compte). La feuille « Corriger l’adresse »
  d’organizer-account (OA2.5) et le lien perso (`/e/{id}/moi#{jeton}`) suivront la règle
  quand ils seront construits.
- Fermer une feuille en la glissant vers le bas (toujours hors périmètre depuis la v4.6).
- Un projet WebKit dans Playwright : il toucherait `playwright.config.ts`, que seul le
  propriétaire fusionne, et WebKit de bureau n’est pas Safari d’iOS.
- La fraîcheur (relire la page au premier plan, toutes les 15 s) n’est pas construite.
  Quand elle le sera, G1.11 devra rester vrai.

### Pour le développement de la v4.7

- **Une tâche**, qui peut se construire en parallèle de #691 à #697. Elle touche
  `bottom-sheet.tsx` (ou un module à part que `BottomSheet` appelle, avec son test Vitest),
  `remove-retour-dialog.tsx`, `seat-sheet.tsx` et `ride-form.tsx` (les étapes).
- Les tests G1 vont dans un fichier `e2e/sheet-back.spec.ts`. La tâche recopie G2 dans
  l’issue comme vérifications après le déploiement, sans les cocher.
- Aucune donnée, aucune route, aucun mot ne change. Aucun fichier sensible :
  `next.config.*`, `proxy.ts` et `playwright.config.ts` ne changent pas.

## Ce qui change en v4.6 : les feuilles sur téléphone et le clavier (#650)

Issue : https://github.com/olaurendeau/fullcar/issues/650. Constat du propriétaire, le
25/10/2026, sur iPhone (Safari récent, clavier ouvert) : dans « Modifier {prénom} », la
barre de remplissage automatique et le clavier recouvrent « Valider ». Dans « Modifier la
voiture », le clavier recouvre la suite du formulaire. Il signale aussi « de petits soucis de
scroll ». Réponses du propriétaire sur #650, le 26/10 : pleine hauteur pour les seules
feuilles à champ de saisie (question 1, a) ; pas de vérification sur iPhone avant la fusion,
elle se fait après le déploiement, sans bloquer (question 2) ; le geste « retour » est
l’issue #656 (question 3). Aucun mot n’est ajouté ni changé : cette révision ne touche qu’à
la place des choses. La v4.6 (suite) applique la revue de design de la v4.6 (cinq
bloquants, dont deux tranchés par le coordinateur, et sept suggestions).

### Le problème

Une personne qui modifie son prénom, ou sa voiture, sur un iPhone ne peut pas valider sans
fermer d’abord le clavier. Elle ne voit pas « Valider ». Elle doit deviner qu’il faut fermer
le clavier, puis faire défiler la feuille, ou fermer la feuille et recommencer. Sur Android,
Chrome se comporte de la même façon par défaut.

### Ce qui se passe aujourd’hui (`main`, `d81e745`)

- Toutes les feuilles de la page passent par `BottomSheet` (`src/components/event/bottom-sheet.tsx`),
  sur `SheetContent side="bottom"` : `fixed bottom-0`, hauteur `h-auto`, plafonnée à
  `max-h-dvh`, et **toute la feuille défile d’un bloc** (`overflow-y-auto` sur le contenu) :
  le titre, les champs et les boutons défilent ensemble.
- Les formulaires mettent « Valider » (et « Annuler ») **à la fin de leur corps**. Seul
  « Fermer » est dans le pied (`SheetFooter`), avec « Placer n personnes » pour la feuille
  d’une place libre. Le pied défile lui aussi.
- Une feuille plus courte que l’écran laisse voir le tableau au-dessus, sous un voile flouté
  (`bg-black/10 backdrop-blur-xs`). Un toucher sur ce voile ferme la feuille, et ce qui a
  été tapé est perdu.
- **Le clavier sur iPhone.** Safari ne réduit pas la page quand le clavier s’ouvre. Il ne
  connaît pas `interactive-widget` (caniuse : non pris en charge de 3.2 à 27.2), et `dvh`
  ne compte pas le clavier. Un élément `fixed; bottom: 0` reste donc collé au bas de la
  page, **sous le clavier**. Safari décale la zone visible juste assez pour montrer le champ
  qui a le focus, jamais le bouton. Mesuré sur la capture 1 (iPhone de 375 × 812 pt, barre
  d’adresse en haut) : la zone visible va de 100 à 469 pt, soit 369 pt. La barre de
  remplissage flottante d’iOS couvre en plus environ 298 à 355 pt de cette zone, et
  « Valider » est juste dessous.
- **Les « petits soucis de scroll ».** Clavier ouvert, deux défilements se disputent le même
  doigt : celui de la feuille, et le décalage de la zone visible par Safari, que le
  verrouillage de Radix (`react-remove-scroll`) n’empêche pas. En bout de course, le rebond
  emporte le titre et les boutons avec le reste. Après la fermeture du clavier, la page
  peut rester décalée.
- `src/app/layout.tsx` : `viewport` = `width=device-width, initial-scale=1`, sans
  `interactive-widget` ni `viewport-fit`.
- La liste des propositions d’un lieu (`place-field.tsx`) se règle déjà sur
  `window.visualViewport` (AL1.11).
- Les champs sont en `text-base` (16 px) sur téléphone : Safari ne zoome pas au focus. Ce
  point ne change pas.

### Les feuilles, une par une

Hauteurs **estimées d’après les classes** (± 10 px ; titre sur une ligne, en français,
sans erreur), à 360 × 640, la largeur de référence sur la hauteur la plus courte qu’on
teste. Vérification sur la capture 1 : « Valider » y est à 246 pt du haut de la feuille,
comme le calcul. Le développeur mesure les vraies valeurs dans les tests K1.

| feuille | ouverte depuis | champ de saisie | hauteur aujourd’hui à 360 × 640 | où sont ses boutons aujourd’hui | iPhone, clavier ouvert, aujourd’hui |
|---|---|---|---|---|---|
| « Tom · Aller » (cellule) | une cellule de « Vos inscriptions » | non | ≈ 346 px (3 actions) | les actions dans le corps, « Fermer » en pied | sans objet |
| « Claire » (une personne) | un prénom de « Vos inscriptions » | non | ≈ 234 px | « Modifier » dans le corps, « Fermer » en pied | sans objet |
| « Modifier Claire » | « Modifier » de la feuille d’une personne | oui | ≈ 366 px | « Valider » à la fin du corps, « Fermer » en pied | « Valider » sous la barre de remplissage, « Fermer » sous le clavier (capture 1) |
| « Ajouter une personne » | le bouton d’un onglet | oui | ≈ 490 px ; ≈ 600 px avec l’avis « Cet appareil ne pourra pas s’en souvenir » | « Valider » à la fin du corps, « Fermer » en pied | « Valider » et « Fermer » sous le clavier |
| « Qui monte dans la voiture de Sophie ? » | une place libre | non | ≈ 408 px à 3 personnes ; ≈ 650 px à 8, et tout défile | « Placer n personnes » et « Fermer » en pied, qui défile | sans objet |
| « Ajouter une personne » (première inscription depuis une place libre, `RegisterSheet`, C5.4) | une place libre, sur un appareil sans personne | oui | ≈ 525 px (« Cette personne prendra une place dans la voiture de {driver}. » et « Sans compte ni e-mail… » sous le titre) | « Valider » à la fin du corps, « Fermer » en pied | « Valider » et « Fermer » sous le clavier |
| « Ajouter une personne » (dans la feuille d’une place, `SeatSheet`) | « Ajouter une personne » de la feuille « Qui monte… » | oui | ≈ 440 px | « Valider » et « Annuler » à la fin du corps, pas de « Fermer » | sous le clavier |
| « Proposer une voiture » | le bouton d’un onglet | oui | ≈ 1 190 px avec 3 personnes et le retour ; ≈ 1 440 px avec « Je ramène aussi des personnes » ; plafonnée à 640 px, tout défile | « Valider » vers 1 050 px dans le défilement, « Fermer » après | sous le clavier, au bout du défilement |
| « Modifier la voiture » | « Modifier » d’une fiche | oui | ≈ 640 px, tout l’écran à 1 px près | « Valider » à la fin du corps, « Fermer » au ras du bas | le clavier couvre « Places, sans compter qui conduit » et la suite (capture 2) |
| « Qui sort de la voiture ? » (une étape de « Modifier la voiture », dans la même feuille) | « Valider » de « Modifier la voiture », places sous le nombre de passagers | non, mais les changements tapés attendent leur envoi | ≈ 400 px avec 3 passagers : la feuille rétrécit, sous elle le voile, et un toucher dessus perd les changements | « Valider » et « Annuler » à la fin du corps, l’alerte au-dessus des cases | sans objet (le clavier se ferme au toucher sur « Valider ») |
| « Modifier l’événement » (organisateur) | « Modifier l’événement » | oui | ≈ 600 px ; ≈ 680 px avec les phrases « … gardent leur heure » | « Valider » et « Annuler » à la fin du corps, pas de « Fermer » | sous le clavier |

Les deux boîtes de confirmation (« Retirer la voiture ? », « Supprimer le retour ? ») ne
sont pas des feuilles : elles sont centrées, sans champ, et ne changent pas.

### La règle (v4.6)

**1. Trois parties.** Toute feuille a, de haut en bas :
- **l’en-tête** : le titre et sa description. Il reste en haut ;
- **le corps** : ce qui est entre les deux. **Seul le corps défile** ;
- **la barre d’actions** : le bouton principal de la feuille et ses messages, puis
  « Fermer » ou « Annuler ». Elle reste en bas. Ses boutons gardent leur forme et leur ordre
  d’aujourd’hui : empilés, pleine largeur, 44 px, le principal en haut. L’ordre du
  document et du focus ne change pas : derniers champs, message, bouton principal, puis
  « Fermer » ou « Annuler ». Entrée dans un champ envoie toujours le formulaire.

Ce qui va dans la barre, feuille par feuille :

| feuille | barre d’actions |
|---|---|
| « Modifier {prénom} », « Ajouter une personne » (depuis un onglet, et première inscription depuis une place libre, `RegisterSheet`) | message d’échec, « Valider », « Fermer » |
| « Ajouter une personne » dans la feuille d’une place (`SeatSheet`) | message d’échec, « Valider », « Annuler » |
| « Proposer une voiture », « Modifier la voiture » | message d’échec ou « Quelqu’un a pris ou libéré une place entre-temps : rien n’a changé. … » (`RideChanges.leaving.changed`), « Valider », « Fermer » |
| « Qui sort de la voiture ? » | son alerte (`RideChanges.leaving.changed`, un échec), « Valider », « Annuler ». L’alerte quitte le dessus des cases pour la barre, y compris sur ordinateur (règle 9). La ligne « n cochée(s) sur m » reste sous la liste, dans le corps |
| « Modifier l’événement » | l’alerte d’échec, les avis (`changed`, `invalid`, `eventNotFound`, suppression tardive), « Envoi en cours… », « Valider », « Annuler » |
| « Qui monte dans la voiture de {driver} ? » | inchangée : message, « Placer n personnes », « Fermer » |
| « {prénom} · {leg} », « {prénom} » | « Fermer ». Les actions de la cellule et « Modifier » restent dans le corps : ce sont des choix, pas l’action de la feuille. L’échec d’une action de cellule reste au-dessus de ces actions |

Un message de la barre est toujours **juste au-dessus du bouton dont il donne la réponse**.
La zone des messages de la barre fait au plus 30 % de la hauteur visible, et défile
au-delà (la même idée que les 40 % de la barre de messages, v4.2-9). Quand elle déborde,
elle est un `role="group"` nommé « Messages » (`Actions.messages`, le nom de la liste de la
barre de messages), avec `tabIndex={0}` pour défiler au clavier. Elle le garde tant qu’elle
a le focus, même si elle cesse de déborder (v4.2.3). L’avis « Cet appareil
ne pourra pas s’en souvenir » reste en haut du corps, comme aujourd’hui.

**2. Sur téléphone (fenêtre de moins de 640 px de large), une feuille qui porte un champ de
saisie prend toute la hauteur visible** (décision du propriétaire, question 1, a). Ce sont
« Modifier {prénom} », « Ajouter une personne » (des trois endroits : un onglet, la feuille
d’une place, et la première inscription depuis une place libre, `RegisterSheet`), « Proposer
une voiture », « Modifier la voiture » et « Modifier l’événement ». Une feuille qui change
de contenu change de règle avec lui : la feuille d’une personne devient pleine hauteur avec
« Modifier {prénom} », celle d’une place libre avec « Ajouter une personne ». **Une étape
d’un formulaire garde la pleine hauteur** tant que ce qui a été tapé attend son envoi :
« Qui sort de la voiture ? », l’étape de « Modifier la voiture », reste pleine hauteur, et
« Annuler » revient au formulaire, ses changements gardés (décision du coordinateur). Une feuille
pleine hauteur n’a ni coins arrondis ni bande du tableau au-dessus : aucun toucher hors de la
feuille ne peut la fermer et perdre la saisie. Quand le corps est trop court pour remplir
l’écran, la barre reste en bas, et l’espace libre est entre le corps et la barre.

**3. Une feuille sans champ de saisie garde la hauteur de son contenu** (cellule, personne,
place libre), sauf une étape d’un formulaire (règle 2). Elle laisse voir le tableau voilé au-dessus, et
un toucher sur le voile la ferme, comme aujourd’hui. Si son contenu dépasse la hauteur
visible, elle s’arrête au haut de la zone visible, et son corps défile entre l’en-tête et
la barre.

**4. La hauteur visible**, c’est la zone que la personne voit vraiment : entre le haut de la
fenêtre (sous la barre d’adresse) et le haut du clavier, quand il est ouvert. Sur iPhone,
c’est `window.visualViewport` (`offsetTop`, `height`), relue à chacun de ses `resize` et
`scroll`. Sans elle, c’est `100dvh`. Clavier ouvert, la feuille suit donc la zone visible :
son haut au haut de cette zone, sa barre juste au-dessus du clavier. Clavier fermé, elle
redescend jusqu’en bas de l’écran. Sa marge du bas compte alors
`env(safe-area-inset-bottom)`, mais pas quand le clavier est ouvert.

**5. Tout élément du corps qui prend le focus est entièrement visible**, entre l’en-tête et
la barre, avec 8 px de marge au moins : un champ, une case à cocher, un bouton radio, un
bouton (les actions d’une cellule, « Ajouter une personne » de la feuille d’une place), un
lien. Ni l’en-tête ni la barre ne le cachent, même en partie (WCAG 2.4.11). Cela vaut à Tab
et Maj+Tab, aux flèches d’un groupe de boutons radio, aux flèches du clavier d’iOS, au
toucher, au focus mis par la page à l’ouverture, et au premier champ en erreur après
« Valider ». Le message d’erreur d’un champ, juste dessous, est visible aussi quand il tient.
Les éléments de la barre sont toujours visibles.

**6. La liste des propositions d’un lieu peut couvrir la barre d’actions tant qu’elle est
ouverte.** Elle garde la place qu’AL1.11 lui donne : jusqu’à 8 px au-dessus du bas de la
zone visible, donc du clavier. Une fois la liste fermée (un choix, Échap, un toucher
ailleurs), la barre se revoit en entier.

**7. Rien d’autre ne bouge.** La page derrière ne défile jamais tant qu’une feuille est
ouverte, et une feuille ne se déplace pas d’un bloc :
- la feuille qui arrive au bout de son défilement ne fait pas défiler la page (pas
  d’enchaînement) ;
- glisser le doigt sur l’en-tête ou sur la barre peut faire défiler la feuille, qui est une
  seule zone qui défile (règle 10), mais jamais la page derrière (décision du
  coordinateur) ;
- sur iPhone, le rebond en bout de course reste dans la feuille : il peut emporter l’en-tête
  ou la barre avec le contenu, jamais la feuille entière ni la page ;
- l’ouverture du clavier ne fait pas défiler la page derrière ; sa fermeture ne laisse ni
  bande vide ni décalage ;
- fermée, la feuille rend la page exactement où elle était (`scrollY` inchangé) ; le focus
  va où le dit « Le focus après une action », inchangé.

**8. Une zone visible très basse** (moins de 240 px de hauteur visible, la règle 4, quelle que
soit la largeur ; un téléphone en paysage avec le clavier fait souvent 640 px de large ou
plus) : l’en-tête et la barre défilent avec le corps, comme aujourd’hui, pour que le champ
où l’on tape reste visible. C’est la hauteur de `visualViewport` qui compte, pas celle de la
fenêtre : sur iPhone, le clavier ne réduit pas la fenêtre. Un téléphone en portrait, clavier ouvert, en a toujours
plus (≈ 270 pt au moins sur un iPhone SE avec la barre de remplissage).

**9. Sur ordinateur et tablette (640 px de large et plus)**, rien ne change à l’œil : la
feuille fait au plus 448 px de large, est centrée, et a la hauteur de son contenu. Les
règles 1, 4, 5, 6, 7 et 8 s’appliquent aussi. Une feuille plus haute que la fenêtre garde
donc son titre et ses boutons visibles, et un clavier de tablette ne cache pas « Valider ».
La règle 1 change une chose à l’œil, sur ordinateur aussi : l’alerte de « Qui sort de la
voiture ? » quitte le dessus des cases pour la barre, juste au-dessus de « Valider ».

**10. Le mécanisme (recommandation à l’architecte, qui décide).** Le contenu de la feuille
reste l’élément qui défile, à la hauteur visible. L’en-tête est collé en haut
(`sticky top-0`) et la barre collée en bas (`sticky bottom-0`), au-dessus du corps et sous
la liste des propositions. `scroll-padding` vaut leur hauteur mesurée. `overscroll-behavior:
contain` est posé sur l’élément qui défile. Le bouton principal sort du `<form>` dans le
document : il garde `type="submit"` et prend l’attribut `form`, ou bien le `<form>` englobe
le corps et la barre. **Une seule zone qui défile** (décision du coordinateur) : un corps qui
défilerait seul couperait la liste des propositions, qui ne pourrait plus couvrir la barre
(règle 6). Sur iPhone, `window.scrollY` est gardé à l’ouverture d’une feuille et rendu à sa
fermeture : Safari peut faire défiler la page derrière pour montrer un champ, malgré le
verrouillage. Seul K2.5 le prouve. On n’ajoute pas `interactive-widget=resizes-content` au viewport :
Safari l’ignore, et ce réglage changerait la mise en page de toutes les pages sur Android,
pas seulement les feuilles. L’API VirtualKeyboard n’existe que dans Chromium.

**Les autres maquettes de cette page** (« Ajouter une personne », « La feuille », « Proposer
une voiture », « L’autre leg, lu depuis l’événement », « Modifier, retirer »…) montrent le
contenu des feuilles, leurs mots et l’ordre de leurs boutons. Elles les dessinent à leur
hauteur d’avant, sous une bande du tableau. Sur téléphone, la hauteur et les parties fixes
sont celles de cette section ; leur contenu, la ligne d’aide et les libellés de la v4.5
compris, ne change pas.

### Les mots de la v4.6

Aucun mot nouveau, changé ou retiré. Ceux des états dessinés, tels qu’ils sont dans
`messages/fr.json` et `messages/en.json` :

| où | français | anglais |
|---|---|---|
| titre | « Modifier {firstName} » | “Edit {firstName}” |
| titre | « Ajouter une personne » | “Add a person” |
| titre | « Proposer une voiture » | “Offer a car” |
| titre | « Modifier la voiture » | “Edit the car” |
| titre | « Modifier l’événement » | “Edit the event” |
| titre | « Qui monte dans la voiture de {driver} ? » | “Who gets in {driver}’s car?” |
| titre | « {firstName} · {leg} » (« Tom · Aller ») | “{firstName} · {leg}” |
| champs | « Prénom », « Téléphone (facultatif) » | “First name”, “Phone (optional)” |
| aide | « Visible seulement par l’organisateur et par les personnes de la même voiture. » | “Only visible to the organiser and to the people in the same car.” |
| champs | « Lieu de départ » / « Lieu de dépose », « Heure de départ », « Places, sans compter qui conduit », « Note (facultatif) » | “Departure place” / “Drop-off place”, “Departure time”, “Seats, driver not included”, “Note (optional)” |
| autre leg (v4.5) | « Au retour », « Le retour part du lieu de l’événement, {location}, le {date}. », « Je ramène aussi des personnes » | “On the return trip”, “The return trip leaves {location} on {date}.”, “I bring people back too” |
| barre | « Valider », « Fermer », « Annuler » | “Confirm”, “Close”, “Cancel” |
| barre | « Placer n personnes » (`Sheet.submit`) | “Seat n people” |
| barre, échec | « Action impossible, vérifiez la connexion » (`Actions.offline`) | “Action failed, check your connection” |
| barre, échec | « Une erreur est survenue et rien n’a changé. Réessayez dans un instant. » (`Actions.failed`) | “Something went wrong and nothing has changed. Try again in a moment.” |
| barre, envoi | « Envoi en cours… » (`EditEvent.sending`) | “Sending…” |
| zone des messages qui déborde, son nom | « Messages » (`Actions.messages`) | “Messages” |
| description, première inscription depuis une place libre | « Cette personne prendra une place dans la voiture de {driver}. » (`PersonForm.forSeat`), « Sans compte ni e-mail : cet appareil s’en souviendra pour cet événement. » | “This person will take a seat in {driver}’s car.”, “No account, no e-mail: this device will remember it for this event.” |
| étape « Qui sort de la voiture ? » | inchangés : `RideChanges.leaving.title` « Qui sort de la voiture ? », `.body`, `.rule` « Les personnes qui sortent redeviennent sans voiture. », `.count`, `.changed` | “Who leaves the car?”, “Those who leave are without a car again.” |
| erreur d’un champ | « Champ requis. » (`FormErrors.required`), et les autres de `FormErrors`, inchangées, sous leur champ | “Required.” |

### Les états de la v4.6 (dessinés dans la page)

1. Avant et après : « Modifier Claire » sur iPhone, clavier ouvert. Après, « Téléphone
   (facultatif) » et sa ligne d’aide restent visibles sous « Prénom ».
2. « Modifier Claire » à 360 × 640, clavier fermé : la feuille prend toute la hauteur.
3. « Modifier la voiture », clavier ouvert, le corps défilé jusqu’à « Note (facultatif) » :
   le titre en haut, « Valider » et « Fermer » au-dessus du clavier.
4. « Proposer une voiture » à 360 × 640, à mi-défilement, sur le groupe « Au retour » de la
   v4.5 (ligne d’aide comprise) : l’en-tête et la barre restent fixes, et un filet les
   sépare du corps qui passe dessous.
5. « Lieu de départ », clavier ouvert, la liste des propositions ouverte par-dessus la barre.
6. Hors ligne après « Valider » : « Action impossible, vérifiez la connexion » dans la barre,
   juste au-dessus de « Valider », qui a le focus ; le clavier est fermé.
7. Prénom vidé puis Entrée : le focus est sur « Prénom », le clavier ouvert, « Champ
   requis. » visible dessous, « Téléphone (facultatif) » en dessous, et la barre au-dessus du
   clavier.
8. Ce qui ne change pas : la cellule « Tom · Aller », de la hauteur de son contenu, le
   tableau voilé au-dessus.
9. « Qui monte dans la voiture de Sophie ? » avec 10 personnes : la feuille s’arrête au haut
   de l’écran, la liste remplit le corps et défile, « Placer 2 personnes » et « Fermer »
   restent visibles, sans espace vide au-dessus de la barre.
10. La même feuille passée à « Ajouter une personne » : pleine hauteur, et « Valider » et
    « Annuler » dans la barre.
11. « Modifier l’événement » pendant l’envoi : « Envoi en cours… », « Valider » inactif
    (`aria-disabled`), « Annuler ».
12. Ordinateur, 1280 px : « Modifier Claire » comme aujourd’hui.
13. Zone visible de moins de 240 px (paysage avec clavier) : tout défile d’un bloc.
14. « Modifier la voiture », places passées de 3 à 1 avec deux passagers, puis « Valider » :
    l’étape « Qui sort de la voiture ? » garde la pleine hauteur, sans voile au-dessus.
15. « Ajouter une personne », première inscription depuis une place libre (`RegisterSheet`) :
    pleine hauteur, « Valider » et « Fermer » dans la barre.
16. Tab dans « Qui monte dans la voiture de Sophie ? » : la case qui a le focus remonte
    au-dessus de la barre, jamais dessous.

### Critères de la v4.6

**K1 : prouvés par Playwright avant la fusion**, sur le projet `e2e` (Chromium, Pixel 7
émulé, 360 px), sauf mention contraire. C’est la seule preuve avant la fusion (décision du
propriétaire, question 2). « Entièrement visible » veut dire `toBeInViewport({ ratio: 1 })`,
et, pour un élément du corps, une boîte comprise entre le bas de l’en-tête et le haut de la
barre.

- **K1.1** À 360 × 640, chacune des feuilles à champ de saisie (« Ajouter une personne »
  depuis l’onglet Aller, dans la feuille d’une place, et en première inscription depuis une
  place libre sur un appareil sans personne, `RegisterSheet` ; « Modifier Claire » ;
  « Proposer une voiture » ; « Modifier la voiture » ; « Modifier l’événement ») a une boîte
  `role="dialog"` de (0, 0, 360, 640) à 1 px près. Son bouton principal et son « Fermer » ou
  « Annuler » sont entièrement visibles dès l’ouverture, sans aucun défilement.
- **K1.2** À 360 × 640, « Proposer une voiture » (Claire, Léa et Tom sans voiture, avec un
  retour) : le corps défile (`scrollHeight > clientHeight`). Corps défilé en haut puis en
  bas, la boîte du titre et celles de « Valider » et « Fermer » ne bougent pas (à 1 px), et
  restent entièrement visibles. Le groupe « Au retour » garde sa description de la v4.5
  (E1.1).
- **K1.3** À 360 × 640, la cellule « Tom · Aller », la feuille « Claire » et « Qui monte dans
  la voiture de Sophie ? » avec 2 personnes ont une hauteur inférieure à 640 px, et leur
  haut est à plus de 0 px (le tableau voilé se voit au-dessus). Un clic à (180, 10) les
  ferme, comme aujourd’hui.
- **K1.4** À 360 × 480, « Qui monte dans la voiture de Sophie ? » avec 8 personnes : le test
  vérifie d’abord que la feuille déborde (`scrollHeight > clientHeight` de l’élément qui
  défile). Sa boîte est (0, 0, 360, 480). Défilée en haut puis en bas, « Placer n personnes »
  et « Fermer » restent entièrement visibles.
- **K1.5** La feuille d’une personne, d’abord à sa hauteur, passe à (0, 0, 360, 640) dès que
  « Modifier » montre « Modifier Claire ». La feuille d’une place fait de même avec
  « Ajouter une personne », et revient à sa hauteur après « Annuler ». « Modifier la voiture »
  de Claire (deux passagers), places de 3 à 1, note changée, « Valider » : l’étape « Qui sort
  de la voiture ? » garde (0, 0, 360, 640) ; un clic à (180, 10) ne la ferme pas ; « Annuler »
  revient au formulaire, toujours (0, 0, 360, 640), avec 1 place et la note tapée.
- **K1.6** (fenêtre qui rétrécit : Android en `resizes-content`, ordinateur) Dans « Modifier
  la voiture » à 360 × 640, focus dans « Note (facultatif) », puis `setViewportSize` à
  360 × 420. La boîte de la feuille devient (0, 0, 360, 420), « Note (facultatif) » est
  entièrement visible dans le corps, à 8 px au moins de la barre, et « Valider » est
  entièrement visible.
- **K1.7** (clavier d’iPhone simulé) Un `addInitScript` remplace `window.visualViewport` par
  un objet à nous (`width` 360, `height`, `offsetTop`, `pageTop`, `scale` 1, et ses
  événements). On ouvre « Modifier Claire » à 360 × 640, focus dans « Prénom », puis on
  passe à `height` 340 et `offsetTop` 0, et on émet `resize`. Le haut de la feuille est à 0
  et son bas à 340 (`getBoundingClientRect`, à 1 px), et le bas de « Fermer » est à 340 au
  plus. Puis `offsetTop` passe à 120 (Safari a décalé la zone visible), avec un `scroll` :
  la feuille va de 120 à 460, et « Prénom » et « Valider » sont dedans. Retour à `height`
  640 et `offsetTop` 0 : la feuille revient à (0, 640). La même chose dans « Modifier la
  voiture », focus dans « Note (facultatif) » : la note et « Valider » sont dans la feuille
  à chaque étape.
- **K1.8** « Modifier la voiture » à 360 × 420 : le test vérifie d’abord que la feuille
  déborde (`scrollHeight > clientHeight`). « Lieu de départ » vidé, focus dans « Note
  (facultatif) » (la feuille a défilé en bas), puis « Valider » : « Lieu de départ » a le
  focus, et sa boîte et celle de « Champ requis. » sont entièrement entre l’en-tête et la
  barre.
- **K1.9** Hors ligne (`context.setOffline(true)`), « Valider » dans « Modifier Claire » à
  360 × 640 : « Action impossible, vérifiez la connexion » est entièrement visible, dans la
  barre, juste au-dessus de « Valider » (pas d’élément entre les deux), et « Valider » a le
  focus. Même chose, dans « Modifier l’événement », pour « Envoi en cours… » pendant un envoi
  retenu.
- **K1.10** Page défilée à `scrollY` = 800, on ouvre « Proposer une voiture ». Une molette de
  2 000 px vers le bas sur le corps (jusqu’au bout), puis sur l’en-tête, puis sur la barre,
  laisse `window.scrollY` à 800 et la boîte `role="dialog"` à (0, 0, 360, 640) ; la feuille,
  elle, peut avoir défilé. Fermée par « Fermer », la page est toujours à 800. Même test avec
  la cellule « Tom · Aller ».
- **K1.11** L’ordre du focus ne change pas : dans « Modifier Claire », Tab depuis
  « Téléphone (facultatif) » mène à « Valider », puis à « Fermer ». Les tests existants qui
  appuient sur Entrée dans un champ (`e2e/aller-sheets.spec.ts` M7.6 ; W1.2) et ceux du focus
  après une action passent sans changement.
- **K1.12** (AL1.11 gardé) À 360 × 420, « Lieu de dépose » en bas de « Proposer une
  voiture », liste ouverte : le bas de la liste est à 412 px au plus, et
  `elementFromPoint` au centre de « Valider » renvoie un élément de la liste. Après un
  choix, la liste est fermée et « Valider » est de nouveau entièrement visible.
- **K1.13** À 640 × 230, « Modifier la voiture », focus dans « Heure de départ » : le champ
  est entièrement visible ; l’en-tête et la barre défilent avec le corps (le titre sort de
  l’écran quand on défile vers le bas). Puis, avec l’objet de K1.7, fenêtre de 640 × 360 et
  `visualViewport` de hauteur 200 : la même chose. Une règle qui ne lirait que la hauteur de
  la fenêtre (une requête média) échoue à cette étape.
- **K1.14** À 1280 × 800, « Modifier Claire » fait 448 px de large, est centrée, a la hauteur
  de son contenu (son haut est à plus de 0 px), et ses coins du haut sont arrondis. À
  1280 × 600, « Proposer une voiture » garde « Valider » et « Fermer » entièrement visibles,
  en haut comme en bas du défilement.
- **K1.16** (WCAG 2.4.11) Chaque élément qui prend le focus est entièrement entre le bas de
  l’en-tête et le haut de la barre, à 8 px au moins, ou bien dans la barre :
  - « Qui monte dans la voiture de Sophie ? » à 360 × 480 avec 8 personnes : Tab depuis la
    première case jusqu’à « Fermer », puis Maj+Tab jusqu’à la première case ;
  - « Proposer une voiture » à 360 × 640, 8 personnes de l’appareil sans voiture : Tab de
    « Qui conduit ? » à « Fermer », les flèches dans « Qui conduit ? » et « Au retour », et
    chacune des 8 cases de « Qui monte avec vous ? » ;
  - la cellule « Tom · Aller » à 360 × 300 : Tab sur chacune de ses actions.
- **K1.15** À 360 px, en français et en anglais, puis avec `font-size: 125%` sur la racine :
  aucune feuille n’a de débordement horizontal (`scrollWidth − clientWidth = 0`), aucun
  bouton de la barre ne coupe son texte, et chaque cible fait au moins 44 px. E1.5 reste
  vrai.

**K2 : vérifiés à la main sur iPhone, après le déploiement, sans bloquer** (Safari, iOS
récent, barre d’adresse en haut puis en bas). Décision du propriétaire (question 2) : ni la
fusion ni la tâche n’attendent ces vérifications. Playwright ne peut pas les prouver : il n’a
ni WebKit d’iOS ni clavier virtuel. Le propriétaire les fait quand il le peut, sur
https://fullcar.app. **Risque accepté** : si iOS dessine sa barre de remplissage automatique
*dans* la zone visible, `visualViewport` ne la compte pas, et elle peut encore couvrir le bas
de la barre d’actions. « Valider », en haut de la barre, est le bouton le moins exposé
(v4.6-2).

- **K2.1** « Modifier {prénom} », toucher « Prénom » : le clavier s’ouvre. La feuille occupe
  tout l’espace entre la barre d’adresse et le clavier. « Valider » est entièrement visible,
  pas même en partie sous la barre de remplissage automatique, et un toucher dessus
  enregistre sans qu’il faille fermer le clavier.
- **K2.2** « Modifier la voiture », toucher « Lieu de départ », puis faire défiler le
  formulaire, clavier ouvert, jusqu’à « Note (facultatif) » : chaque champ s’atteint. Le
  titre reste en haut, « Valider » et « Fermer » restent au-dessus du clavier.
- **K2.3** Les flèches ∧ ∨ au-dessus du clavier passent d’un champ à l’autre : chaque champ
  qui prend le focus vient entièrement en vue, jamais sous la barre d’actions.
- **K2.4** Faire défiler la feuille au doigt jusqu’en haut puis jusqu’en bas, et tirer
  au-delà, sur le corps, sur le titre et sur la barre : la page derrière ne bouge pas, et la
  feuille ne glisse pas d’un bloc. Le rebond peut emporter le titre ou la barre avec le
  contenu ; une fois arrêté, ils sont de nouveau en haut et en bas.
- **K2.5** Fermer le clavier : la feuille redescend jusqu’en bas de l’écran, sans bande
  vide. Fermer la feuille : le tableau est exactement où il était avant l’ouverture, sans
  décalage (le `scrollY` gardé à l’ouverture, règle 10). C’est la seule preuve de ce point.
- **K2.6** « Proposer une voiture », taper « Gare » dans « Lieu de départ » : la liste
  s’ouvre au-dessus du clavier, au moins trois propositions se lisent, et un toucher en
  choisit une. La liste fermée, « Valider » est entièrement visible.
- **K2.7** Les mêmes K2.1 et K2.2 sur un téléphone Android (Chrome), si le propriétaire en a
  un sous la main.

Un K2 qui échoue ouvre une nouvelle issue, avec la capture et, pour K2.1, la hauteur de la
barre de remplissage. Elle revient au product designer. Personne ne devine de marge.

### Décisions de la v4.6

v4.6-1. Décision du propriétaire (question 1, a) : sur téléphone (moins de 640 px), une
feuille qui porte un champ de saisie prend toute la hauteur visible, et une feuille de choix
garde la hauteur de son contenu. — Raison : un formulaire a besoin de toute la place quand le
clavier s’ouvre, et on ne doit pas pouvoir le fermer, saisie perdue, d’un toucher sur le
voile. Une feuille de choix montre d’où elle vient, et se ferme d’un toucher.

v4.6-2. Décision : toute feuille a un en-tête fixe en haut, une barre d’actions fixe en bas,
et seul le corps défile entre les deux. Les boutons de la barre restent empilés, le
principal en haut. — Raison : « Valider » est toujours au même endroit, sous le pouce, et
l’ordre du focus ne change pas. Sur iPhone, la barre de remplissage couvre d’abord le bas de
la barre, donc « Fermer » plutôt que « Valider ».

v4.6-3. Décision : un message qui répond au bouton principal est dans la barre, juste
au-dessus de lui, et la zone des messages fait au plus 30 % de la hauteur visible. —
Raison : après « Valider », le focus est sur ce bouton. Laissé dans le corps, le message
pourrait être hors de vue.

v4.6-4. Décision : la hauteur visible est celle de `window.visualViewport`, `100dvh` à
défaut. On n’ajoute pas `interactive-widget` au viewport. — Raison : Safari ne connaît pas
`interactive-widget` (caniuse, jusqu’à 27.2), et `dvh` ne compte pas le clavier. Un seul
mécanisme vaut pour tous les navigateurs. Ce réglage changerait aussi toutes les pages sur
Android.

v4.6-5. Décision : la liste des propositions d’un lieu peut couvrir la barre tant qu’elle
est ouverte (AL1.11 inchangé). — Raison : pendant qu’on choisit un lieu, on ne valide pas.
Bornée par la barre, la liste n’aurait que deux lignes sur iPhone avec le clavier.

v4.6-6. Décision : sous 240 px de hauteur visible, l’en-tête et la barre défilent avec le
corps. — Raison : en paysage avec le clavier, l’en-tête et la barre prendraient toute la
hauteur, et le champ où l’on tape ne se verrait plus.

v4.6-7. Décision : sur ordinateur, l’aspect ne change pas, et seules les parties fixes
s’appliquent. — Raison : le constat porte sur le téléphone. Une fenêtre basse a pourtant le
même défaut de boutons qui défilent.

v4.6-8. Décision du propriétaire (question 2) : la preuve avant la fusion est K1, avec
`visualViewport` simulé. Les vérifications sur iPhone (K2) se font après le déploiement, sans
bloquer, et le risque de la barre de remplissage dessinée dans la zone visible est accepté. —
Raison : le choix du propriétaire.

v4.6-9. Décision : les maquettes des autres sections ne sont pas redessinées. Elles gardent
leur contenu, et cette section donne la hauteur et les parties fixes. — Raison : leur sujet
est le contenu des feuilles, et la v4.5 vient d’être approuvée sur ces dessins.

v4.6-10. Décision du coordinateur, v4.6 (suite) : « Qui sort de la voiture ? », étape de
« Modifier la voiture », garde la pleine hauteur. — Raison : les changements tapés attendent
leur envoi ; une feuille qui rétrécirait laisserait un voile qui, d’un toucher, les perdrait.

v4.6-11. Décision : la première inscription depuis une place libre (`RegisterSheet`, C5.4)
est une feuille à champ de saisie comme les autres : pleine hauteur, « Valider » et
« Fermer » dans la barre. — Raison : revue, bloquant 1 ; elle manquait à la liste.

v4.6-12. Décision : la règle 5 vaut pour tout élément qui prend le focus, pas seulement un
champ. — Raison : revue, bloquant 3 ; une case ou une action sous la barre fixe échoue à
WCAG 2.4.11.

v4.6-13. Décision : la règle 8 vaut à toute largeur, et se lit sur la hauteur de
`visualViewport`. — Raison : revue, bloquant 4 ; un téléphone en paysage fait souvent 640 px
ou plus, et sur iPhone le clavier ne réduit pas la fenêtre.

v4.6-14. Décision du coordinateur, v4.6 (suite) : une seule zone qui défile, l’en-tête et la
barre collés dedans ; glisser sur eux peut faire défiler la feuille, jamais la page. —
Raison : un corps qui défilerait seul couperait la liste des propositions (règle 6, AL1.11).

v4.6-15. Décision : sur iPhone, `window.scrollY` est gardé à l’ouverture d’une feuille et
rendu à sa fermeture. — Raison : suggestion de la revue ; Safari peut faire défiler la page
derrière pour montrer un champ, malgré le verrouillage.

v4.6-16. Décision : la zone des messages qui déborde est un `role="group"` nommé
« Messages », focalisable. — Raison : suggestion de la revue ; c’est le motif de la liste de
la barre de messages (v4.2.1-9), avec le même nom.

### Hors périmètre de la v4.6

- Le geste « retour » du navigateur, qui quitte la page au lieu de fermer la feuille, et
  perd la saisie : issue https://github.com/olaurendeau/fullcar/issues/656 (décision du
  propriétaire, question 3). Une feuille pleine hauteur ressemble à une page, ce qui le rend
  plus probable. Traité en v4.7.
- Fermer une feuille en la glissant vers le bas, ou une poignée de glissement.
- Les boîtes de confirmation centrées (« Retirer la voiture ? », « Supprimer le
  retour ? »).
- Le formulaire de création d’un événement (`/`, `/nouveau`) et les pages du compte : ce ne
  sont pas des feuilles. La feuille « Corriger l’adresse » d’organizer-account (OA2.5),
  pas encore construite, suivra la même règle quand elle le sera.
- `viewport-fit=cover` et les zones sûres de la page.
- Les mots : aucun ne change.

### Pour le développement de la v4.6

- **Une tâche**, sur `BottomSheet` (et `SheetContent` au besoin), et sur les composants qui
  hébergent une feuille : `PersonSheet` (`person-sheet.tsx`), `AddPersonButton`
  (`person-form.tsx`), `OfferRideButton` et `EditRideButton` (`ride-form.tsx`),
  `RegisterSheet` et `SeatSheet` (`seat-sheet.tsx`), `EditEventSheet`
  (`edit-event-sheet.tsx`).
- Les formulaires `PersonForm`, `RideForm` (avec `LeavingStep`) et `EditEventForm` sortent
  leurs boutons et leurs messages vers la prop `actions` de la feuille qui les héberge. Elle
  existe déjà, et seule `SeatSheet` l’utilise aujourd’hui. `BottomSheet` dit si la feuille
  est pleine hauteur (un champ de saisie, ou une étape d’un formulaire).
- La liste de `place-field.tsx` garde son calcul.
- La tâche ajoute les tests K1, dans un fichier `e2e/sheet-layout.spec.ts` ou dans
  `e2e/sheet.spec.ts`. Elle recopie K2 dans l’issue comme vérifications après déploiement,
  sans les cocher.
- Aucune donnée, aucune route, aucun mot ne change.

### Pour la prochaine révision de place-autocomplete

AL1.11 reste vrai. Ajouter une phrase : « La liste peut couvrir la barre d’actions de la
feuille (event-board v4.6-5). »

## Ce qui change en v4.5 : l’autre leg se lit depuis l’événement (#649)

Constat du propriétaire (25/10), sur un test en famille. Une testeuse, maman qui conduit les
enfants à l’aller, a lu « faire le retour » comme « rentrer chez moi à vide après les avoir
déposés ». Pour le produit, le retour est le leg qui part de l’événement, avec des passagers.
Le risque est dans « Proposer une voiture ». Pour une nouvelle personne, « Je ne fais pas le
retour » est coché par défaut, et elle le lit comme faux, puisqu’elle rentre chez elle. Alors
elle choisit « Je ramène aussi », en anglais « I drive back too », qui dit exactement sa
lecture. Le retour affiche alors des places que personne ne conduira. Décision du
propriétaire : options A, B et F du product designer, avec « des passagers ». La formulation
française de la ligne est celle que le coordinateur a retenue sur #649 (v4.5-7). Issue :
https://github.com/olaurendeau/fullcar/issues/649.

Le 26/10, le propriétaire a remplacé « des passagers » par « des personnes », pour la règle
épicène C11.9 (D7), qui écarte « passager » du formulaire voiture (décision sur #649) : « Je
ramène aussi des personnes », « J’emmène aussi des personnes ». L’anglais ne change pas.
Les libellés de cette page sont ceux-là, et `main` les porte déjà (`messages/fr.json`,
`e2e/aller-sheets.spec.ts`, `e2e/bar-rides.spec.ts`).

### Ce qui change

Seul le groupe de l’autre leg de « Proposer une voiture » change. Les onglets, la matrice,
les feuilles, la barre et l’espace organisateur gardent leurs mots.

1. **Les deux choix « conduire »** disent qui ils transportent : « Je ramène aussi des
   personnes » au retour, « J’emmène aussi des personnes » à l’aller. En anglais : « I bring
   people back too » et « I take people there too ». Aucune valeur de `messages/en.json` ne
   contient plus « drive back ».
2. **Une ligne d’aide**, sous le titre du groupe et avant son premier bouton radio, dit où et
   quand part l’autre leg :
   - au retour, « Le retour part du lieu de l’événement, {location}, le {date}. » ;
   - à l’aller, « L’aller va jusqu’au lieu de l’événement, {location}, le {date}. ».

   « Le lieu de l’événement » porte la préposition, et le lieu saisi suit entre virgules : la
   phrase se lit avec n’importe quel lieu (v4.5-7).

   `{location}` est le texte du lieu de l’événement, entier, jamais tronqué. Sa Position n’y
   est pour rien. `{date}` est la date et l’heure de l’autre leg dans l’événement, au format
   de `LegTime` (`{ dateStyle: "full", timeStyle: "short" }`) : « samedi 12 décembre 2026 à
   18:00 », « Saturday, December 12, 2026 at 6:00 PM ».
3. **La date est toujours écrite en entier**, même quand l’autre leg tombe le même jour.
4. **Elle décrit le groupe** : le `radiogroup` porte `aria-describedby` vers elle. Un lecteur
   d’écran lit le nom du groupe, « Au retour », puis la ligne, une fois, avant les choix.
5. **Son style** est celui des aides du formulaire (`text-[13px] leading-[18px]
   text-muted-foreground`). Elle passe à la ligne entre les mots, et un mot plus long que la
   ligne se coupe (`wrap-anywhere`, comme les prénoms). Elle ne déborde jamais du groupe.
6. **Elle ne suit pas l’heure saisie.** Avec « Je ramène aussi des personnes », la voiture du
   retour peut partir à 18:30. La ligne dit toujours 18:00 : elle décrit le leg, comme
   « Fin » dans l’en-tête, et pas la voiture.
7. **Elle part avec le groupe** :
   - sur un événement sans retour ;
   - quand la personne qui conduit conduit déjà sur l’autre leg (C4.6) ;
   - quand le retour disparaît pendant que la feuille est ouverte (M7.6).

   « Modifier la voiture » n’a pas de groupe de l’autre leg, donc pas de ligne.
8. **Le glossaire**, à l’entrée Leg, reçoit la phrase F (voir « Les mots de la v4.5 »).

Ce qui reste :
- les titres « Au retour » / « À l’aller » ;
- « Je cherche une place », « Je ne fais pas le retour » / « Je ne fais pas l’aller », « Je
  reste dans la voiture de {driver} » ;
- « Lieu de dépose », « Heure de départ du retour » ;
- `RideForm.otherLeg.same` et le choix par défaut (C4.4).

### Les mots de la v4.5

| clé | `messages/fr.json` | `messages/en.json` | avant |
|---|---|---|---|
| `RideForm.otherLeg.drive.retour` | Je ramène aussi des personnes | I bring people back too | Je ramène aussi / I drive back too |
| `RideForm.otherLeg.drive.aller` | J’emmène aussi des personnes | I take people there too | J’emmène aussi / I drive there too |
| `RideForm.otherLeg.hint.retour` | Le retour part du lieu de l’événement, {location}, le {date}. | The return trip leaves {location} on {date}. | nouvelle |
| `RideForm.otherLeg.hint.aller` | L’aller va jusqu’au lieu de l’événement, {location}, le {date}. | The outbound trip goes to {location} on {date}. | nouvelle |

Les apostrophes sont typographiques (’), comme dans le reste de `messages/fr.json`. Avec
l’événement des maquettes, la ligne se lit :

| depuis | fr | en |
|---|---|---|
| l’onglet Aller | Le retour part du lieu de l’événement, Gymnase Colette-Besson, Rennes, le samedi 12 décembre 2026 à 18:00. | The return trip leaves Gymnase Colette-Besson, Rennes on Saturday, December 12, 2026 at 6:00 PM. |
| l’onglet Retour | L’aller va jusqu’au lieu de l’événement, Gymnase Colette-Besson, Rennes, le samedi 12 décembre 2026 à 07:30. | The outbound trip goes to Gymnase Colette-Besson, Rennes on Saturday, December 12, 2026 at 7:30 AM. |

Le lieu de 120 caractères des maquettes et de E1.5 : « Complexe sportif intercommunal
Colette-Besson, entrée par le parking nord, 12 boulevard Albert-Ier, 35200 Rennes, France ».

La phrase F, ajoutée à l’entrée **Leg** de `docs/agents/glossary.md`. Elle s’écrit avec des
apostrophes droites ('), comme le reste de `glossary.md`, et non typographiques comme
`messages/fr.json`. Elle se place après « Jamais
« trajet » tout court, qui prête à confusion avec Ride. » :

> Un leg se lit du côté de l'événement et des passagers : l'aller va vers l'événement, le
> retour en part. Le chemin à vide d'un conducteur (rentrer après avoir déposé, venir
> chercher) n'est pas un leg, et l'interface n'en parle jamais.

### Les états de la v4.5

| état | ce que montre le groupe de l’autre leg | critère |
|---|---|---|
| depuis l’Aller, une nouvelle personne conduit | « Au retour », la ligne du retour, puis « Je ramène aussi des personnes », « Je cherche une place », « Je ne fais pas le retour » (coché) | E1.1 |
| depuis le Retour | « À l’aller », la ligne de l’aller, puis « J’emmène aussi des personnes »… | E1.2 |
| « Je ramène aussi des personnes » coché, heure changée en 18:30 | la ligne reste au-dessus des choix et dit toujours 18:00 ; le lieu de dépose et l’heure se déplient dessous, comme avant | E1.3 |
| en anglais | « On the return trip », « The return trip leaves… », « I bring people back too » ; à l’aller, « I take people there too » | E1.4 |
| un lieu de 120 caractères, à 360 px | la ligne passe sur plusieurs lignes, le lieu entier, sans débordement | E1.5 |
| le retour un autre jour | la date entière du retour, « dimanche 13 décembre 2026 à 17:00 » | E1.6 |
| qui conduit est passagère sur l’autre leg | la ligne, puis les quatre choix et leurs « Quittera la voiture de… » | E1.1, seconde scène (choix inchangés, C4.5) |
| sans retour ; qui conduit conduit déjà sur l’autre leg ; « Modifier la voiture » | pas de groupe, donc pas de ligne | E1.7 |
| le retour supprimé pendant que la feuille est ouverte | le groupe et sa ligne partent ensemble (M7.6, inchangé) | M7.6 |

### Critères de la v4.5

Prouvés par Playwright, dans `e2e/offer-other-leg.spec.ts`, avec ses aides : `form`,
`otherLeg(page, title)`, `radio`, et l’ouverture de « Proposer une voiture » depuis un onglet.
L’événement amorcé (`seededEvent`, `src/db/test-events.ts`) est « Tournoi de Rennes », au
« Gymnase des Gayeulles », avec un aller le samedi 12 décembre 2026 à 07:30 et un retour le
même jour à 18:00. `eventFields` change son lieu, ou la date de son retour, quand un critère
le demande. La seconde moitié de E1.4 est un test unitaire (Vitest).

**H8. Savoir de quel retour on parle.** En tant que parent qui dépose les enfants puis rentre
chez moi, quand je propose ma voiture pour l’aller, je lis que le retour part de l’événement,
à l’heure de la fin, avec des passagers. Je ne propose pas une voiture que je ne conduirai
pas.

- **E1.1** Depuis l’onglet Aller, sans personne sur l’appareil, on ouvre « Proposer une
  voiture ».
  - Le groupe `otherLeg(page, "Au retour")` a exactement pour description accessible « Le
    retour part du lieu de l’événement, Gymnase des Gayeulles, le samedi 12 décembre 2026 à
    18:00. » (`toHaveAccessibleDescription`).
  - Ses boutons radio sont, dans l’ordre, « Je ramène aussi des personnes », « Je cherche
    une place » et « Je ne fais pas le retour », le troisième coché.
  - La ligne est visible. Sa boîte englobante est sous celle du titre « Au retour » et
    au-dessus de celle du premier bouton radio.
  - Aucun bouton radio ne s’appelle exactement « Je ramène aussi ».
  - Seconde scène : Claire, personne de l’appareil, est passagère de la voiture de Marc au
    retour (`seedRide`, leg `retour`, puis `seedPlacement`). On choisit Claire dans « Qui
    conduit ? ». Le groupe a la même description. Ses boutons radio sont, dans l’ordre, « Je
    ramène aussi des personnes », « Je reste dans la voiture de Marc » (coché), « Je cherche
    une place » et « Je ne fais pas le retour ». Les trois autres que « Je reste… » sont
    décrits par « Quittera la voiture de Marc » (C4.5).

  Sur `main`, le groupe n’a pas de description : le test échoue.
- **E1.2** Depuis l’onglet Retour, la même ouverture.
  - Le groupe `otherLeg(page, "À l’aller")` a exactement pour description « L’aller va
    jusqu’au lieu de l’événement, Gymnase des Gayeulles, le samedi 12 décembre 2026 à 07:30. ».
  - Son premier bouton radio est « J’emmène aussi des personnes ».
- **E1.3** Depuis l’onglet Aller, une nouvelle personne, Marc, conduit.
  - On coche « Je ramène aussi des personnes ». « Lieu de dépose » et « Heure de départ du
    retour » se déplient, comme avant (C4.11).
  - On met cette heure à 18:30. La description du groupe reste celle de E1.1, à 18:00.
  - Après « Valider », la base a une voiture de Marc au retour, qui part à 18:30.
- **E1.4** En anglais (`locale: "en-US"`).
  - Depuis l’onglet Aller, la description du groupe `otherLeg(page, "On the return trip")`
    correspond à `/^The return trip leaves Gymnase des Gayeulles on Saturday, December 12,
    2026 at 6:00\sPM\.$/`, et son premier bouton radio est « I bring people back too ».
  - Depuis l’onglet Retour, celle du groupe `otherLeg(page, "On the outbound trip")`
    correspond à `/^The outbound trip goes to Gymnase des Gayeulles on Saturday, December 12,
    2026 at 7:30\sAM\.$/`, et son premier bouton radio est « I take people there too ».
  - `\s` : l’espace avant AM et PM peut être insécable, comme dans D1.5.
  - En test unitaire, aucune des valeurs de `messages/en.json`, parcourues à toute
    profondeur, ne contient « drive back », casse ignorée.
- **E1.5** À 360 × 780, l’événement amorcé avec le lieu de 120 caractères
  (`eventFields.location`). Depuis l’onglet Aller :
  - la description du groupe contient le lieu entier, et pas de « … » ;
  - la ligne fait au moins 36 px de haut, soit au moins deux lignes de 18 px ;
  - `document.documentElement.scrollWidth` vaut au plus 360 ;
  - pour le dialogue comme pour le groupe, `scrollWidth` vaut au plus `clientWidth` ;
  - pour la ligne, `scrollHeight` vaut au plus `clientHeight` : une ligne coupée échoue.

  La même chose en anglais.
- **E1.6** Le retour un autre jour (`eventFields.retourAt` = `2026-12-13 17:00:00`). Depuis
  l’onglet Aller, la description du groupe est « Le retour part du lieu de l’événement,
  Gymnase des Gayeulles, le dimanche 13 décembre 2026 à 17:00. ».
- **E1.7** Pas de groupe, pas de ligne.
  - Sur un événement sans retour, le dialogue n’a ni groupe « Au retour » ni texte « Le
    retour part ».
  - Léa conduit déjà au retour (`seedRide`, leg `retour`). Quand on choisit Léa dans « Qui
    conduit ? », le groupe et la ligne disparaissent. Quand on choisit une autre personne,
    ils reviennent, avec la même description que E1.1.
  - « Modifier la voiture » n’a ni groupe « Au retour » ni texte « Le retour part ».

  Ce sont des gardes : sur `main`, les deux premiers points passent déjà.

**Non prouvable par un test** : que la phrase soit bien comprise. On le vérifie à la revue,
et de nouveau avec un parent qui dépose et repart. Depuis l’onglet Aller, sans aide, il dit ce
que crée « Je ramène aussi des personnes ».

### Les tests à mettre aux nouveaux libellés

Les tests qui citent l’ancien libellé, tel quel, sur `main` :
- `e2e/offer-other-leg.spec.ts` (`FR.drive`) ;
- `e2e/aller-sheets.spec.ts`, `e2e/bar-rides.spec.ts`, `e2e/bar-subjects.spec.ts` ;
- `e2e/offer-passengers.spec.ts`, `e2e/offer-places.spec.ts`, `e2e/event.shot.ts` ;
- `src/app/e/[id]/offer-ride.test.ts`, `src/components/event/failure-words.test.ts`.

Le titre d’un test qui cite le libellé change avec lui. Ses ids de critère, C4.11 ou B1.7,
restent.

### Pour le développement de la v4.5

- **Une tâche**, sur `main`.
  - E1.1, E1.2 et E1.4 à E1.6 échouent aujourd’hui ; E1.3 échoue sur son libellé ; E1.7 est
    une garde.
  - Aucune donnée, aucune route, aucun appel serveur ne change.
- **Le formulaire n’a aujourd’hui que la position de l’événement** (`near`). Il lui faut aussi
  le texte de son lieu, par exemple dans `other`, à côté de `at`. Le chemin revient à
  l’architecte.
- **La date se met en forme comme `LegTime`**, avec `format.dateTime(wallClockAsUtc(other.at),
  { dateStyle: "full", timeStyle: "short" })`, passée en paramètre à la clé. Pas de
  concaténation.
- **La phrase du glossaire** va dans la même PR que le code. Sur `main`, `docs/agents/glossary.md`
  n’est pas un chemin sensible : seul `docs/agents/review-checklist.md` l’est, sous `docs/agents/`
  (`merge.sensitive_paths` de `.claude/workflow.json`).

## Ce qui change en v4.4.6 : une ligne d’échec réduite à l’aller (#372)

Un amendement de la barre, sans mot nouveau. Il inscrit ici une décision du propriétaire
déjà construite (#267, PR #371), et tranche ce qu’en disent les régions vivantes : rien.
Issue : https://github.com/olaurendeau/fullcar/issues/372.

### Le cas

Claire, personne de l’appareil, propose sa voiture sur les deux legs : depuis l’onglet Aller
avec « Je ramène aussi des personnes », ou depuis l’onglet Retour avec « J’emmène aussi des personnes ». L’envoi échoue
hors ligne, ou sur une erreur. La barre dit « Les voitures de Claire pour l’aller et le retour
n’ont pas été proposées. Vérifiez la connexion, puis réessayez. », et la région `alert`
l’annonce. Puis l’organisateur supprime le retour. La page l’apprend par la réponse d’une
autre action, par exemple l’inscription d’Inès à l’aller, une réussite sans message
(règle 2) : c’est la transition vers un état sans retour (règle 5 ; organizer-view,
décision 44).

### Ce que devient la ligne (décision du propriétaire, #267)

La ligne **reste, réduite à l’aller**, pour que Claire sache toujours que sa voiture n’a pas
été proposée pour l’aller.

- **Ses mots** : `Actions.notDone.offerRide` avec `legs` = `aller`, puis la même raison
  (`Actions.why.offline` ou `Actions.why.failed`). Voir « Les mots de la v4.4.6 ».
- **Son sujet** : sa seule partie aller (`offer:aller:{personId}`, ou
  `offer:aller:new:{prénom}`). Proposer de nouveau la voiture pour l’aller la retire dès
  l’envoi (règle 5), comme l’échec `noRetourAgain` (v4.4.4-5).
- **Son repère** : le bouton « Proposer une voiture » de l’aller, d’où que l’offre soit
  partie. Celui du retour est parti avec les onglets (règle 8).
- **Son rang, son icône et sa couleur ne changent pas** : `WifiOff` hors ligne,
  `TriangleAlert` sur une erreur. La ligne n’est pas écrite de nouveau (règle 1) : elle garde
  sa place parmi les échecs.
- **Seules ces deux raisons sont réduites.** Tout autre échec d’une offre sur les deux legs part
  avec le retour, comme tout message sur le retour : un refus peut ne valoir qu’avec le retour (« Claire
  conduit déjà une voiture. », quand c’est au retour qu’elle conduisait).
- **Une seule fois.** Réduite, la ligne ne porte plus sur le retour.
- « Ajouter une personne » n’est pas touché : son échec ne nomme pas de leg, et son sujet
  (`person:new:{prénom}`) n’en a pas. Sa ligne reste telle quelle.

### Ce qu’entend un lecteur d’écran : rien

**Le problème** (relecture de PR #371). Aujourd’hui, si la ligne réduite est le dernier échec
écrit, la région `alert` la relit : son texte change, elle est vidée, puis réécrite 100 ms plus
tard. Deux défauts :

- l’annonce tombe juste après une action qui a réussi. Avec l’inscription d’Inès, qui réussit
  sans un mot, on entend « La voiture de Claire pour l’aller n’a pas été proposée. Vérifiez la
  connexion, puis réessayez. ». On peut croire que c’est l’inscription d’Inès qui a échoué, ou
  que la voiture de Claire a été renvoyée et a échoué de nouveau ;
- si la ligne réduite n’est pas le dernier échec écrit, rien n’est annoncé. Le même changement
  est donc dit ou tu selon l’ordre des échecs.

**Décision : réduire une ligne n’est pas l’écrire. Rien n’est annoncé** (v4.4.6-2).

- L’échec a déjà été annoncé quand il a été écrit, et ce qu’il dit reste vrai pour l’aller.
  La réduction ne dit rien de nouveau sur la voiture de Claire.
- L’écran non plus n’ajoute aucun message : la transition retire et réduit des lignes sans
  rien dire (organizer-view, décision 44 et M7.4). Le lecteur d’écran entend ce que l’écran
  dit.
- La ligne réduite se relit dans la liste visible, comme tout message.

Au moment de la transition :

| la région `alert`, juste avant | ce qu’elle fait | critère |
|---|---|---|
| contient le texte entier de la ligne réduite (annonce faite) | elle est vidée, et rien n’y est écrit ensuite. Elle ne garde pas le texte « aller et retour », que la barre ne montre plus, y compris en mode navigation | N1.1, N1.2 |
| attend d’écrire cette ligne : son écriture est en attente, quelle qu’en soit la raison (les 100 ms du point 3, ou une feuille qui cache la page, `whenPageShown`) | l’écriture en attente écrit le texte réduit, à son heure. L’échec n’a pas encore été annoncé : il l’est une fois, dans les mots que la barre montre, jamais dans le texte entier | N1.3 |
| contient ou attend un autre échec, ou est vide | elle n’est pas touchée : ni vidée, ni réécrite, et son écriture en attente non plus | N1.4 |

- La région `status` n’est pas touchée par la réduction.
- Le message de la réponse qui apporte la transition s’écrit ensuite selon les règles
  habituelles. Une réussite va dans la région `status` (`EditEvent.saved`, sur `/admin`). Un
  échec va dans la région `alert` : c’est une écriture plus récente, qui annule une écriture
  en attente de la ligne réduite (point 3), comme pour deux échecs du même passage. Une
  réussite sans message, comme l’inscription d’Inès, n’écrit rien.
- Un échec qui part avec le retour (un refus) suit la règle d’avant : si la région `alert`
  l’annonçait encore, elle est vidée (point 4, N1.5).

### Les mots de la v4.4.6

Aucun mot nouveau, aucun mot changé, et aucun texte n’est annoncé à la réduction. La ligne
réduite reprend `Actions.notDone.offerRide` (`legs` = `aller`) et la raison de l’échec :

| échec | avant la transition | après, fr | après, en |
|---|---|---|---|
| hors ligne | Les voitures de Claire pour l’aller et le retour n’ont pas été proposées. Vérifiez la connexion, puis réessayez. | La voiture de Claire pour l’aller n’a pas été proposée. Vérifiez la connexion, puis réessayez. | Claire’s car for the outbound trip was not offered. Check your connection, then try again. |
| erreur | Les voitures de Claire pour l’aller et le retour n’ont pas été proposées. Une erreur est survenue : réessayez dans un instant. | La voiture de Claire pour l’aller n’a pas été proposée. Une erreur est survenue : réessayez dans un instant. | Claire’s car for the outbound trip was not offered. Something went wrong: try again in a moment. |

En anglais, avant la transition : « Claire’s cars for the outbound and return trips were not
offered. » suivi de la même raison.

### Les états de la v4.4.6

| état | la barre | les régions | critère |
|---|---|---|---|
| échec hors ligne d’une offre sur les deux legs, déjà annoncé, puis l’état sans retour | la ligne reste, réduite à l’aller, à son rang ; la page n’a plus d’onglets | `alert` vidée, rien d’écrit ; `status` inchangée | N1.1 |
| la même chose, sur une erreur | idem, avec « Une erreur est survenue : réessayez dans un instant. » | idem | N1.2 |
| la même chose, l’échec pas encore annoncé | idem | `alert` écrit une fois le texte réduit | N1.3 |
| un autre échec écrit après celui de Claire | les deux lignes, la plus récente en haut ; celle de Claire réduite | `alert` garde l’autre échec, sans changement | N1.4 |
| un refus sur les deux legs (`alreadyDriving`), puis l’état sans retour | la ligne part | `alert` vidée, rien d’écrit | N1.5 |
| la ligne réduite, puis la voiture proposée de nouveau pour l’aller ; ou « Fermer » | la ligne part dès l’envoi ; « Fermer » donne le focus à « Proposer une voiture » de l’aller | inchangé | N1.6 |

### Critères de la v4.4.6

Prouvés par Playwright, dans `e2e/aller-sheets.spec.ts`, avec la scène des tests de PR #371 :

- Claire, personne de l’appareil (`seedClaire`) ;
- « Proposer une voiture » depuis l’onglet Aller, Claire conduit, « Je ramène aussi des personnes » ;
  « Valider », puis Échap ferme la feuille avant la réponse ;
- l’échec : hors ligne (`loseFirst`, `context.setOffline`) ou sur une erreur
  (`holdFirst(page, PLACE, true)`, `failHeld`) ;
- le retour supprimé en base (`removeRetourInDb`), puis Inès inscrite à l’aller seul
  (`sendHeldRegistration`) : sa réponse apporte l’état sans retour.

`messages(page)` donne les textes de la liste de la barre. Les régions sont observées par
`recordBar`, et `said(writes, region)` donne les textes non vides écrits dans une région. Le
temps est piloté par `page.clock`. « Ensuite » veut dire : la page n’a plus d’onglets, puis
l’horloge avance de 1 000 ms.

**H7. Ne pas entendre un échec que personne n’a provoqué.** En tant que personne qui utilise
un lecteur d’écran, quand le retour disparaît, je n’entends pas de nouveau l’échec de la
voiture de Claire. Je l’ai déjà entendu, et je pourrais le prendre pour l’échec de ce que je
viens de faire.

- **N1.1** Hors ligne. Quand la région `alert` contient « Les voitures de Claire pour l’aller
  et le retour n’ont pas été proposées. Vérifiez la connexion, puis réessayez. »,
  `recordBar` commence. On repasse en ligne, puis le retour est supprimé et Inès inscrite.
  Ensuite :
  - `messages(page)` = [« La voiture de Claire pour l’aller n’a pas été proposée. Vérifiez la
    connexion, puis réessayez. »] ;
  - `said(writes, "alert")` = [] : aucun texte écrit dans la région `alert` depuis le début
    de l’enregistrement. Elle est vide à la fin ;
  - `said(writes, "status")` = [] ;
  - en anglais (`locale: "en-US"`), `messages(page)` = [« Claire’s car for the outbound trip
    was not offered. Check your connection, then try again. »], et les régions sont les mêmes.

  Sur `main`, la région `alert` reçoit le texte réduit : le test échoue.
- **N1.2** La scène de N1.1, l’échec venant d’une erreur (500). Avant la transition, la région
  `alert` contient « Les voitures de Claire pour l’aller et le retour n’ont pas été
  proposées. Une erreur est survenue : réessayez dans un instant. ». Ensuite :
  - `messages(page)` = [« La voiture de Claire pour l’aller n’a pas été proposée. Une erreur
    est survenue : réessayez dans un instant. »] ;
  - `said(writes, "alert")` = [], et la région est vide à la fin.

  Sur `main`, le test échoue comme N1.1. Il couvre aussi la moitié « erreur » de la condition
  de PR #371 (#373) : si elle disparaît, la ligne part avec le retour, et `messages(page)`
  est vide.
- **N1.3** L’échec pas encore annoncé. L’offre de Claire part, réponse retenue (500), et le
  retour est supprimé en base. L’inscription d’Inès est envoyée, sa réponse retenue elle
  aussi : les actions de la page partent une à une, elle part donc après la réponse de
  Claire. L’horloge est arrêtée (`page.clock`) et `recordBar` commence. L’offre de Claire
  échoue (`failHeld`) : la ligne entière est dans la barre, et la région `alert` attend de
  l’écrire. Sans avancer l’horloge, la réponse d’Inès est relâchée, et la page n’a plus
  d’onglets. Puis l’horloge avance de 1 000 ms :
  - `said(writes, "alert")` = [« La voiture de Claire pour l’aller n’a pas été proposée. Une
    erreur est survenue : réessayez dans un instant. »]. Le texte réduit est écrit une seule
    fois, et le texte entier ne l’a jamais été ;
  - `messages(page)` = [ce même texte].

  Ce critère passe sur `main` : c’est une garde. Il fait échouer une correction qui viderait
  la région à chaque réduction, puisque l’échec ne serait alors jamais annoncé.
- **N1.4** Un autre échec annoncé. Après l’échec hors ligne de Claire, de nouveau en ligne,
  l’envoi d’Hugo est retenu (`loseFirst(page, "Hugo")`). « Ajouter une personne » depuis
  l’onglet Aller, « Hugo », « Aller et retour » coché (sa valeur par défaut) ; « Valider »,
  puis Échap ferme la feuille avant la réponse, comme pour Claire. `context.setOffline(true)`,
  puis l’envoi est perdu : la barre dit aussi « Hugo n’a pas pu rejoindre vos inscriptions.
  Vérifiez la connexion, puis réessayez. », et la région `alert` le contient. `recordBar`
  commence. On repasse en ligne, puis le retour est supprimé
  et Inès inscrite. Ensuite :
  - `messages(page)` = [« Hugo n’a pas pu rejoindre vos inscriptions. Vérifiez la connexion,
    puis réessayez. », « La voiture de Claire pour l’aller n’a pas été proposée. Vérifiez la
    connexion, puis réessayez. »]. Hugo est en haut, car plus récent, et Claire garde son
    rang ;
  - aucun changement de la région `alert` n’est enregistré, et elle contient toujours l’échec
    d’Hugo.

  Ce critère passe sur `main` : c’est une garde.
- **N1.5** Le test de PR #371 « refused by `alreadyDriving` » : la barre dit « Les voitures de
  Claire pour l’aller et le retour n’ont pas été proposées. Claire conduit déjà une voiture. »,
  et la région `alert` la contient. `recordBar` commence. Après la transition,
  `messages(page)` est vide, `said(writes, "alert")` = [], et la région `alert` est vide.
  C’est une garde.
- **N1.6** Les deux autres tests de PR #371, sans changement. Proposer de nouveau la voiture
  de Claire pour l’aller retire la ligne réduite dès l’envoi, avant la réponse. Depuis l’onglet
  Retour, avec « J’emmène aussi des personnes », « Fermer » donne le focus au bouton « Proposer une voiture »
  de l’aller. Ce sont des gardes.

**Non prouvable par un test** : ce que prononce un lecteur d’écran. On vérifie en revue,
avec VoiceOver (iOS, Safari), TalkBack (Android, Chrome) et NVDA (Windows, Chrome), la scène
de N1.1. Après l’inscription d’Inès, la barre ne fait rien dire. En mode navigation, la ligne
réduite se lit une fois, dans la liste, puisque la région `alert` est vide.

### Pour le développement de la v4.4.6

- Une petite tâche, sur `main`. N1.1 et N1.2 échouent aujourd’hui ; N1.3 à N1.6 sont des
  gardes, vertes avant comme après.
- La règle est dans `bar-state.ts` (`retourGone`, `regions`) et dans `message-bar.tsx`
  (`createAnnouncer`). Aujourd’hui, la région `alert` suit le texte de la ligne qu’elle
  désigne (`state.alert`) : le texte change, donc elle est réécrite. Il faut distinguer deux
  cas : le texte est déjà écrit, et la région est vidée sans écriture ; l’écriture est en
  attente, et elle prend le texte réduit sans repartir de zéro. Le choix du mécanisme revient
  à l’architecte.
- N1.2 remplace le test demandé par #373.

## Ce qui change en v4.4.5 : une réussite retenue devenue fausse (#359), et « Valider » sans changement dans « Modifier la voiture » (#313)

Deux amendements, sans mot nouveau ni mot changé. Le premier touche la règle 2 de la barre ;
le second applique à la voiture la règle de la v4.4.

### 1. Une réussite retenue sous une feuille, devenue fausse (#359)

**Le cas** (relecture de #356, #171) :

1. Marc propose une voiture à l’aller en cochant Tom dans « Qui monte avec vous ? », et ferme
   le formulaire avant la réponse ;
2. il ouvre la cellule Tom · Aller ; la réponse arrive pendant ce temps, et la cellule montre
   Tom dans la voiture de Marc ;
3. il touche « Sortir de la voiture », qui réussit ;
4. à la fermeture de la cellule, la barre dit « Tom est dans la voiture de Marc », avec
   « Annuler ». Tom en est pourtant sorti.

Le même schéma vaut pour une place prise (un tap, la feuille) : `takeSeats` et `offerRide`
dans `participant-board.tsx`.

**Pourquoi.** Une réussite qui a un message (un placement) attend qu’aucune feuille ne cache
la page (règle 9). Une réussite sans message (une action de cellule, « Modifier » la voiture)
agit à sa réponse : elle retire la réussite affichée (règle 2), mais pas celle qui attend.
Celle-ci s’écrit donc après une action envoyée après elle, et décrit l’état d’avant cette
action.

**La règle (règle 2, v4.4.5).** Une réussite de placement qui attend n’est **jamais écrite**
si, avant qu’elle le soit, une action **envoyée après elle** a **réussi** en changeant l’état
d’**au moins une de ses personnes, sur son leg**. « Envoyée après » se lit au numéro d’envoi
(`seq`).

1. **Les actions qui changent l’état d’une personne sur un leg** : une action de cellule de
   cette personne sur ce leg (« Ne fait pas l’aller / le retour », « Je cherche une place »,
   « Sortir de la voiture ») ; « Modifier » la voiture de ce leg, avec cette personne dans
   « Qui sort de la voiture ? » ; un placement ou un « Annuler » qui la porte sur ce leg ;
   « Proposer une voiture » qui la fait conduire ou monter sur ce leg, ou qui règle ce leg
   comme l’autre leg de qui conduit (« J’emmène aussi des personnes », « Je cherche une place », « Je ne
   fais pas l’aller »…, sauf « Je reste dans la voiture de… », qui ne change rien).
   « Retirer la voiture » est déjà réglé par la règle 5. « Modifier » une personne (prénom,
   téléphone) ne change pas son état sur un leg : il n’en fait pas partie.
2. **Toute la réussite part**, même si une seule de ses personnes est touchée. « Tom et Léa
   sont dans la voiture de Marc » n’est pas écrite si Tom seul est sorti. Léa reste dans la
   voiture et en sort, au besoin, par sa cellule.
3. **La barre ne dit rien à la place.** Pas de ligne, pas d’« Annuler », aucune écriture dans
   les régions `status` et `alert`. La réussite abandonnée ne retire rien : ni la réussite
   affichée, ni l’information, ni un échec. La barre est celle qu’aurait laissée la même suite
   sans feuille ouverte : la réussite écrite à sa réponse, puis retirée par l’action suivante
   (règle 2).
4. **L’action envoyée après échoue, ou est refusée** : la réussite est écrite à la fermeture,
   avec son « Annuler ». Le placement tient, comme quand un « Annuler » échoue (règle 6).
5. **L’action envoyée après porte sur d’autres personnes, ou sur l’autre leg** : la réussite
   est écrite, comme aujourd’hui (règle 1).
6. **Le focus** suit l’action envoyée après : la cellule, qui lit son nouvel état ; « Modifier »
   sur la carte, après « Qui sort de la voiture ? ». La réussite abandonnée ne le déplace pas.

**Avec « Annuler » (#340).** L’« Annuler » part avec sa réussite, sans jamais s’afficher.
Il n’y a rien à défaire : l’action envoyée après a déjà changé l’état. La réussite d’un
« Annuler » (`Seat.undone`, `Seat.alreadyOut`) n’est pas visée. Elle dit où les personnes ne
sont plus, et cela reste vrai après une action sans message. La seule action qui la rendrait
fausse les replace dans cette voiture : elle a son propre message, et sa réponse arrive après,
puisque les actions de la page partent une à une.

**Avec l’information (v4.4.2-1, v4.4.4).** Inchangé. L’information part à la **fin** d’une
action commencée après elle, c’est-à-dire à sa réponse, pas à l’écriture de sa réussite. Une
réussite abandonnée a déjà fait à sa réponse ce que la règle 4 lui demande, et ne pas
l’écrire n’y change rien. La transition vers un état sans retour s’applique, elle aussi, à la
réponse (v4.4.4).

**Avec la règle 1.** « Au plus une réussite, la dernière » : la dernière **écrite**, sans
changement. Une réussite abandonnée n’est pas écrite, donc elle ne devient jamais la
dernière. Ordonner toutes les réussites par numéro d’envoi est écarté (décision v4.4.5-2).

**Le précédent.** Un échec que couvre un envoi fait depuis n’est jamais dit (`whenClosed`,
règle 5). La v4.4.5 fait de même pour une réussite que contredit une action réussie depuis.

### 2. « Valider » sans changement dans « Modifier la voiture » (#313)

**Le problème.** Relevé en concevant #298. Le conducteur ouvre « Modifier » sur sa voiture,
ne change rien, puis touche « Valider ». Une requête part quand même. Hors ligne, elle échoue,
et la barre dit « Les changements de la voiture de Claire pour l’aller n’ont pas été
enregistrés. Vérifiez la connexion, puis réessayez. » : un échec pour une action que personne
n’a faite.

**La règle.** La même que la v4.4 pour « Modifier » une personne, et qu’organizer-view
(v3.3, M2.5) pour « Modifier l’événement ».

1. **Un champ est changé** (« Lieu de départ » ou « Lieu de dépose », « Heure de départ »,
   « Places, sans compter qui conduit », « Note (facultatif) ») quand sa valeur diffère,
   caractère pour caractère, de celle que le formulaire montrait à son ouverture. Changé puis
   remis, il n’est pas changé. Une espace ajoutée est un changement, et part (v4.4-2).
2. **Aucun champ changé** : la feuille se ferme, et rien n’est envoyé, ni requête, ni
   vérification des champs. L’étape « Qui sort de la voiture ? » ne s’ouvre pas. Le focus va
   sur le bouton « Modifier » de la carte de cette voiture, comme après un « Valider » qui
   enregistre.
3. **La barre ne change pas.** Aucune ligne n’y entre, aucune n’en sort, l’échec d’un
   « Modifier » précédent de cette voiture compris (sujet `ride:{rideId}:edit`). Rien n’est
   écrit dans les régions `status` et `alert`.
4. **Hors ligne** : la même chose, et rien n’est dit, ni dans la feuille ni dans la barre.
5. **Retour de l’étape** : les places baissées sous le nombre de personnes à bord ouvrent
   « Qui sort de la voiture ? » ; son « Annuler » ramène au formulaire. Si les places sont
   remises à leur valeur, « Valider » ferme la feuille sans rien envoyer.
6. **Au moins un champ changé** : inchangé. Seuls les champs changés partent, avec les
   personnes vues à bord, et l’étape s’ouvre sous le nombre de personnes à bord.
7. **Sans JavaScript** : sans objet. « Modifier » n’apparaît que sur les voitures de
   l’appareil, que le serveur ne connaît pas sans JavaScript.

**Ce que voit la personne** : la feuille qui se ferme, et rien d’autre. Ni message, ni
« Valider » inactif (décision v4.4.5-6).

### Les mots de la v4.4.5

Aucun mot nouveau, aucun mot changé. Ces écrans gardent leurs textes :

| clé | fr | en |
|---|---|---|
| `Board.car.edit` | Modifier | Edit |
| `RideForm.title.edit` | Modifier la voiture | Edit the car |
| `RideForm.location.aller` / `.retour` | Lieu de départ / Lieu de dépose | Departure place / Drop-off place |
| `RideForm.time` | Heure de départ | Departure time |
| `RideForm.seats` | Places, sans compter qui conduit | Seats, driver not included |
| `RideForm.note` | Note (facultatif) | Note (optional) |
| `Actions.submit` | Valider | Confirm |
| `Actions.close` | Fermer | Close |
| `DevicePersons.leaveCar` | Sortir de la voiture | Leave the car |
| `Seat.placed` | {firstName} est dans la voiture de {driver} | {firstName} is in {driver}’s car |
| `Sheet.placed` | {names} sont dans la voiture de {driver} | {names} are in {driver}’s car |

Pas de « Rien n’a changé » dans « Modifier la voiture » (v4.4-3), et rien à la place d’une
réussite abandonnée.

### Les états de la v4.4.5

| état | la barre, le focus | critère |
|---|---|---|
| placement retenu, puis « Sortir de la voiture » réussi pour la même personne et le même leg | aucune ligne ; focus sur la cellule, « Sans voiture » | S1.1 |
| la même chose après la feuille de places, deux personnes, une seule sortie | aucune ligne ; Léa reste dans la voiture de Sophie | S1.2 |
| placement retenu, puis « Qui sort de la voiture ? » qui la fait sortir | aucune ligne ; focus sur « Modifier » | S1.3 |
| placement retenu, puis « Sortir de la voiture » en échec hors ligne | la réussite et son « Annuler », à la fermeture | S1.4 |
| placement retenu, puis une action réussie sur une autre personne ou sur l’autre leg | la réussite et son « Annuler », à la fermeture (inchangé) | S1.5 |
| « Modifier la voiture », rien changé, « Valider » ou Entrée | la feuille se ferme, rien n’est envoyé, focus sur « Modifier » | W1.1, W1.2 |
| changé puis remis ; places baissées, retour de l’étape, places remises | idem | W1.3, W1.4 |
| rien changé, hors ligne | idem ; rien n’est dit | W1.5 |
| rien changé, la barre porte déjà l’échec d’un « Modifier » de cette voiture | la barre ne change pas | W1.6 |
| un champ changé | inchangé : il part seul | W1.7 (tests existants) |

### Critères de la v4.4.5

Prouvés par Playwright. `messages(page)`, « les boutons de la barre » et l’observation des
régions sont ceux de la v4.4.4 (B1). Une réponse est retenue par `page.route`.

**H5. Ne lire que ce qui est vrai.** En tant que parent qui place quelqu’un puis le fait
sortir avant d’avoir lu la réussite, je ne lis jamais qu’il est encore dans la voiture.

Scène : sur l’appareil, Marc, Tom et Léa. À l’aller, Tom et Léa sont « Sans voiture », et
Marc « Ne fait pas l’aller ». Au retour, Tom et Léa sont « Sans voiture », et Marc « Ne fait
pas le retour ». Une voiture de Sophie, d’un autre appareil, a 3 places libres à l’aller.

**Ordre.** #359 se construit **après #356** (#171), qui ajoute « Qui monte avec vous ? » et la
réussite retenue de `offerRide`. Sur `main` aujourd’hui, `offerRide` dit `succeed(null)` et ne
retient rien : S1.1 ne s’y écrit pas. S1.2 à S1.5 passent par `takeSeats`, qui retient déjà sa
réussite sur `main`, et s’écrivent dès maintenant.

| critère | sur `main` aujourd’hui | après #356, avant #359 | après #359 |
|---|---|---|---|
| S1.1 | ne s’écrit pas (pas de « Qui monte avec vous ? ») | échoue : la barre dit « Tom est dans la voiture de Marc » | passe |
| S1.2, S1.3 | échouent : la barre dit la réussite | échouent | passent |
| S1.4, S1.5 | passent (gardes de la règle étroite) | passent | passent |

- **S1.1** « Proposer une voiture » à l’aller, Marc qui conduit, 3 places, Tom coché dans
  « Qui monte avec vous ? », « Valider » avec la réponse retenue ; Échap ferme le formulaire.
  On ouvre la cellule Tom · Aller, puis on relâche la réponse. Quand la cellule propose
  « Sortir de la voiture », on le touche. Après la fermeture de la cellule :
  - la liste de la barre a 0 ligne, et la barre n’a aucun bouton « Annuler » ;
  - la cellule Tom · Aller a le focus et dit « Sans voiture » ;
  - un `MutationObserver` posé sur la région `status` avant « Valider » n’a jamais vu « Tom
    est dans la voiture de Marc », 1 s après la fermeture (`page.clock`) ;
  - en base, la voiture de Marc existe à l’aller, et Tom y est sans voiture.

  Demande #356. Sur la branche de #356, et sur `main` une fois #356 fusionnée, la barre dit
  « Tom est dans la voiture de Marc » : le test échoue jusqu’à #359.
- **S1.2** La variante `takeSeats`, sur `main`. Un tap sur une place libre de la voiture de
  Sophie ouvre la feuille, Tom et Léa cochés ; « Placer
  2 personnes », réponse retenue ; Échap. On ouvre Tom · Aller, on relâche, puis « Sortir de
  la voiture ». Après la fermeture :
  - la liste de la barre a 0 ligne, et aucun « Annuler » ;
  - la région `status` n’a jamais reçu « Tom et Léa sont dans la voiture de Sophie » ;
  - en base, Tom est sans voiture à l’aller, et Léa est dans la voiture de Sophie ;
  - la cellule Léa · Aller dit « Avec Sophie ».

  Sur `main`, la barre dit « Tom et Léa sont dans la voiture de Sophie » : le test échoue.
- **S1.3** Par « Modifier » la voiture, sur `main`. La scène change : Marc conduit à l’aller
  (2 places), avec Nina, d’un autre appareil. Un tap sur la place libre de la voiture de
  Marc ouvre la feuille ; Léa décochée, « Placer
  1 personne », réponse retenue ; Échap. « Modifier » sur la voiture de Marc, puis on relâche
  la réponse. « Places, sans compter qui conduit » = 1, « Valider » ; quand « Qui sort de la
  voiture ? » liste Nina et Tom, on coche Tom, puis « Valider ». Après la fermeture :
  - la liste de la barre a 0 ligne ;
  - « Modifier » de la voiture de Marc a le focus ;
  - en base, Tom est sans voiture à l’aller, Nina est dans la voiture, qui a 1 place.

  Sur `main`, la barre dit « Tom est dans la voiture de Marc » : le test échoue.
- **S1.4** Sur `main`. Un tap sur une place libre de la voiture de Sophie ouvre la feuille ;
  Léa décochée, « Placer 1 personne », réponse retenue ; Échap. On ouvre Tom · Aller, on
  relâche, et quand la cellule propose « Sortir de la voiture », `setOffline(true)` puis
  « Sortir de la voiture » : la cellule dit son échec. Échap :
  - `messages(page)` = [« Tom est dans la voiture de Sophie »], et les boutons de la barre
    sont [« Annuler », « Fermer »] ;
  - en base, Tom est dans la voiture de Sophie.
- **S1.5** Sur `main`. Le placement de S1.4, mais on ouvre une autre cellule. Deux variantes,
  Léa · Aller puis « Ne fait pas l’aller », et Tom · Retour puis « Ne fait pas le retour » :
  - après la fermeture, `messages(page)` = [« Tom est dans la voiture de Sophie »], et les
    boutons de la barre sont [« Annuler », « Fermer »].

  S1.4 et S1.5 passent déjà sur `main` : ce sont les gardes de la règle étroite, qui doivent
  rester vertes après #359.

**Non prouvable par un test** : que personne ne croie Tom encore dans la voiture. Ce que
S1.1 prouve, c’est que la barre ne le dit pas.

**H6. Fermer sa voiture sans rien changer.** En tant que conducteur qui ouvre « Modifier »
pour relire l’heure, je touche « Valider » sans rien changer, et rien ne se passe d’autre que
la fermeture : aucun message ne me dit que quelque chose a échoué.

Scène : celle de `ride-edit.spec.ts` (la voiture de Claire à l’aller, « Mairie de Cesson »,
07:00, 3 places, Nina et Paul). « Aucune requête » se prouve comme en V1 : on enregistre les
requêtes `next-action` dont le corps contient l’identifiant de la voiture, **à partir du clic
sur « Modifier » qui ouvre le formulaire du critère** : un envoi fait avant, comme celui qui
prépare W1.6, n’est pas compté. Après le « Valider » sans changement, on rouvre « Modifier la
voiture », on remplit « Note (facultatif) » avec `Gilets jaunes`, puis « Valider ». Une fois
la feuille fermée, la liste a **exactement une** requête, qui porte `Gilets jaunes`.

- **W1.1** « Modifier », puis « Valider » sans toucher aux champs :
  - `getByRole("dialog")` a 0 élément ;
  - « Modifier » de la carte de Claire a le focus ;
  - aucune requête n’a été envoyée (preuve ci-dessus) ;
  - en base, la voiture est inchangée (`rowsOf`).
- **W1.2** La même chose avec Entrée dans « Lieu de départ ».
- **W1.3** « Lieu de départ » rempli avec `Gare de Cesson`, puis de nouveau avec `Mairie de
  Cesson` ; « Heure de départ » = 07:15, puis 07:00 ; puis « Valider » : mêmes assertions
  qu’en W1.1.
- **W1.4** « Places, sans compter qui conduit » = 1, « Valider » : l’étape s’ouvre. Son
  « Annuler », puis les places remises à 3, puis « Valider » : mêmes assertions qu’en W1.1, et
  l’étape ne s’est pas rouverte.
- **W1.5** `context.setOffline(true)`, puis « Valider » sans changement :
  - la feuille se ferme, et « Modifier » a le focus ;
  - `getByRole("alert").filter({ hasText: /\S/ })` a 0 élément ;
  - la liste de la barre a 0 ligne ;
  - le texte « Action impossible, vérifiez la connexion » n’apparaît nulle part ;
  - puis `context.setOffline(false)`, avant la requête qui suit (la note `Gilets jaunes`) :
    la liste a exactement une requête.
- **W1.6** La barre porte déjà « Les changements de la voiture de Claire pour l’aller n’ont
  pas été enregistrés. Une erreur est survenue : réessayez dans un instant. » (un changement
  de lieu, réponse retenue, Échap, `failHeld`, comme le test existant ; cette requête-là est
  faite avant que le compte commence). Puis « Modifier », et « Valider » sans changement :
  - `messages(page)` a le même texte, seul ;
  - aucune requête comptée avant celle de la note ;
  - un `MutationObserver` posé sur les deux régions avant le clic n’a vu aucune écriture.
- **W1.7** Inchangés, et toujours verts : C8.2 à C8.5 et « a change made since the form showed
  stays: only what the form changed is sent ».

**Non prouvable par un test** : qu’une personne comprenne qu’il n’y avait rien à enregistrer.
La feuille qui se ferme le dit, comme « Fermer » (v4.4-3).

### Pour le développement de la v4.4.5

- S1 : dans `participant-board.tsx`, `takeSeats` et `offerRide` écrivent leur réussite par
  `sheet.whenClosed`. Avant d’écrire, elles regardent si une action envoyée après elles
  (`seq` plus grand) a réussi en changeant l’état d’une de leurs personnes sur leur leg. La
  paire (personne, leg) est la clé ; les sujets de `useSends` (`seats:…`, `cell:…`) ne se
  recoupent pas. Le mécanisme ressemble à celui des échecs dans `hidden-page.ts` (`made`),
  limité aux envois réussis. Un Vitest couvre la règle : action plus récente réussie ou en
  échec, même personne ou non, même leg ou non.
- W1 : dans `ride-form.tsx`, en mode `edit`, avec aucun champ de `RIDE_FIELDS` différent de
  `shown`, `submit` appelle `onDone()` avant `validateRide` et avant l’étape, sans
  `updateRide`. Rien ne change côté serveur : `updateRide` sans champ reste accepté.
- Deux tâches. #313 (W1) part de `main` ; W1.1 échoue sur `main`. #359 (S1) part de `main`
  **une fois #356 fusionnée** : sinon S1.1 ne peut pas s’écrire. S1.2 et S1.3 échouent sur
  `main` dès aujourd’hui ; S1.1 échoue après #356 ; S1.4 et S1.5 sont des gardes, vertes
  avant comme après.

## Ce qui change en v4.4.4 : « Annuler » et l’information (#341)

Ces cas viennent des relectures de #340 (« Annuler », #170) et de #339 (« Trouver une place »,
#172) : la v4.4.3 en laissait quatre ouverts, et PR #351 en ajoute un pour #267. Ils ne
touchent que la barre. Une seule clé est nouvelle, `Seat.alreadyOut`.

### 1. Un « Annuler » renvoyé depuis une ligne d’échec

**Le cas.** Tom et Léa sont placés dans la voiture de Sophie, puis leur « Annuler » échoue :
la ligne d’échec porte son propre « Annuler » (règle 6). Hugo est ensuite placé dans la
voiture de Marc, et sa réussite, avec son « Annuler », remplace celle de Tom et Léa. On touche
alors l’« Annuler » de la ligne d’échec. Sa réussite remplace celle d’Hugo, et l’« Annuler »
d’Hugo part avec elle (règle 2). Si Tom et Léa ne sont déjà plus dans la voiture de Sophie
(sortis depuis leur cellule ou depuis un autre appareil), le serveur ne rend personne, et
aujourd’hui la barre se vide sans un mot. La ligne d’échec est partie à l’envoi, celle d’Hugo
à la réponse. Rien ne dit ce qui s’est passé, et la ligne d’Hugo qui disparaît juste après
un « Annuler » laisse croire qu’Hugo est sorti de la voiture.

**Décision.** Le remplacement est confirmé : la barre ne garde qu’une réussite, la dernière
(règle 1), et la dernière action est cet « Annuler ». Hugo reste dans la voiture de Marc, et
il en sort au besoin par « Sortir de la voiture », dans sa cellule. Mais le remplacement n’est
**jamais muet** : quand personne n’est rendu, la réussite de l’« Annuler » le dit. Cela vaut
pour tout « Annuler », sur une réussite comme sur un échec : aujourd’hui, l’« Annuler » d’une
réussite qui ne rend personne vide aussi la barre sans un mot.

| personnes rendues | la barre dit |
|---|---|
| toutes | « Tom et Léa ne sont plus dans la voiture de Sophie » (`Seat.undone`, inchangé) |
| une partie (Léa était déjà sortie) | « Tom n’est plus dans la voiture de Sophie » (`Seat.undone`, inchangé) |
| aucune | « Tom et Léa n’étaient déjà plus dans la voiture de Sophie » (`Seat.alreadyOut`, nouveau) |

Dans les trois cas, c’est la réussite de l’« Annuler » : icône `CircleCheck`, sans
« Annuler », annoncée par la région `status`, avec pour repère le titre de la carte de cette
voiture. Elle remplace la réussite affichée, quelle qu’elle soit. Elle ne retire aucun
échec, ni une information écrite après le départ de l’« Annuler » (règles 2 et 4).

### 2. « Annuler » quand il n’y a plus de retour

**Le cas.** Un « Annuler » sur un placement du retour, après la suppression du retour : le
serveur répond `noRetour`. Aujourd’hui (#340, puis #330), la barre ajoute « Tom n’a pas pu
sortir de la voiture de Sophie. Il n’y a plus de retour pour cet événement. », avec un
« Annuler » qui échouera toujours.

**Décision.** Le bouton ne reste pas, et il n’y a pas d’échec du tout. organizer-view v3.3.6
l’a déjà décidé (décision 44, M7.10), et #267 le construit. La réponse apporte l’état sans
retour, qui retire de la barre toutes les lignes sur le retour, réussites, échecs et leurs
« Annuler ». La barre dit alors l’information « Il n’y a plus de retour pour cet événement :
la voiture de Sophie n’est plus proposée. » (`Actions.info.noRetour`), et le focus va sur le
titre de l’événement. Il en va de même quand l’« Annuler » était sur la réussite (M7.10) et
quand il était sur une ligne d’échec (B1.4). La v4.4.4 l’inscrit dans les règles 5 et 6,
sans mot nouveau. Rien n’est corrigé sur `main` avant #267, qui remplace ce chemin.

### 3. Une information sur un retour déjà supprimé, au moment de l’écrire

Décision du coordinateur sur #339, inscrite ici. On touche « Trouver une place » depuis une
cellule du retour. Si le dernier état reçu par la page n’a plus de retour au moment où
l’information « Aucune place libre au retour pour l’instant. » serait écrite (la feuille
fermée), elle n’est pas écrite : la barre ne change pas, et le focus va sur le titre de
l’événement, puisque la page n’a plus d’onglets. Il en va de même avec une place libre au
retour. — Raison : à côté de « Il n’y a plus de retour… », elle parlerait d’un leg qui
n’existe plus. Déjà construit par #339.

### 4. Une information sur le retour, écrite avant que la page apprenne sa suppression

**Le cas** (relecture de #339) :

1. Tom est placé d’un tap à l’aller, et la réponse tarde ;
2. l’organisateur supprime le retour ;
3. « Trouver une place » pour Léa écrit « Aucune place libre au retour pour l’instant. » : la
   page ne sait pas encore que le retour n’existe plus ;
4. la réponse pour Tom apporte l’état sans retour.

Selon la v4.4.2-1, l’information reste, puisque l’action de Tom a commencé avant elle. Elle
parle pourtant d’un leg qui n’existe plus.

**Décision.** L’information part avec la transition. L’état sans retour retire tous les
messages sur le retour (organizer-view, décision 44), et « Aucune place libre au retour pour
l’instant. » en est un, puisque son leg est le retour. Elle part quel que soit le moment où a
commencé l’action qui apporte cet état. La règle 4 protège l’information de la réussite ou de
l’échec d’une action commencée avant elle, pas de l’état que cette action apporte. Une
information sur l’aller reste.

**La région `status`.** Quelle que soit la réponse qui apporte l’état sans retour (réussite,
échec, refus ou lecture), si la région `status` annonce encore cette information, par son texte
ou par une écriture en attente, la transition la vide et annule l’écriture en attente
(« Lecteurs d’écran », points 2 et 4). Puis la réponse écrit son propre message. Une réussite
s’écrit dans la région `status`. Un échec s’écrit dans la région `alert` seulement, et la
région `status` reste vide. — Raison : c’est le cas 3 vu dans l’autre ordre. Sans cette
règle, un même état donnerait deux barres différentes selon l’ordre des réponses. Le focus
reste sûr (règle 8). #267 le construit, avec l’étiquette `leg` des messages. Aucun mot.

### 5. Pour #267 : renvoyer pour l’aller seul retire l’échec `noRetourAgain`

**Le cas** (PR #351). « Proposer une voiture » depuis l’onglet Aller, avec « Je ramène
aussi », et la feuille fermée avant la réponse, est refusé par `noRetour`. La barre dit « Les
voitures de Claire pour l’aller et le retour n’ont pas été proposées. Il n’y a plus de retour
pour cet événement : proposez de nouveau la voiture, pour l’aller seulement. » Le sujet de cet
échec est `offer:aller:…` et `offer:retour:…`. Une nouvelle offre pour l’aller seul ne couvre
que `offer:aller:…` : elle ne retire donc pas la ligne, alors que la personne a fait ce que
la ligne lui demandait.

**Décision.** Un échec `noRetourAgain` a pour sujet sa seule partie aller
(`offer:aller:{personId}`, ou `offer:aller:new:{prénom}`). Le renvoi pour l’aller seul le
retire dès l’envoi, comme tout envoi sur le même sujet (règle 5). Les mots ne changent pas. —
Raison : la partie retour ne pourra plus jamais être renvoyée, donc un sujet qui la garde ne
serait jamais couvert. La ligne dit quoi faire, et le faire doit la retirer. « Ajouter une
personne » n’est pas touché : son sujet (`person:new:{prénom}`) n’a pas de leg, et le renvoi
retire déjà son `noRetourAgain`. Les autres échecs sur les deux legs (hors ligne ou erreur,
avec un retour qui existe toujours) gardent leurs deux sujets : Marc à l’aller seul ne retire
pas l’échec de Marc sur les deux legs (inchangé).

### Les mots de la v4.4.4

| clé | fr | en |
|---|---|---|
| `Seat.alreadyOut` (nouvelle) | {names} {count, plural, one {n’était déjà plus} other {n’étaient déjà plus}} dans la voiture de {driver} | {names} {count, plural, one {was} other {were}} already out of {driver}’s car |

- Le texte est épicène (C11.9), puisque « n’était déjà plus » est invariable. `{names}` suit
  « Plusieurs prénoms », et `count` compte toutes les personnes de l’« Annuler ». Il n’y a
  pas de point final, comme pour `Seat.undone`.
- Ces mots ne changent pas, mais la v4.4.4 dit quand ils s’affichent : `Seat.undone`,
  `Actions.info.noRetour` (organizer-view), `DevicePersons.noFreeSeat.retour` (« Aucune
  place libre au retour pour l’instant. ») et `Actions.why.noRetourAgain` (organizer-view).

### Les états de la v4.4.4

| état | la barre | critère |
|---|---|---|
| « Annuler » d’une ligne d’échec, toutes les personnes rendues, après une réussite plus récente | « Tom et Léa ne sont plus dans la voiture de Sophie », sans « Annuler » ; la réussite d’Hugo et son « Annuler » sont partis | B1.1 |
| la même chose, personne n’est rendu | « Tom et Léa n’étaient déjà plus dans la voiture de Sophie », sans « Annuler » | B1.2 |
| « Annuler » d’une réussite, personne n’est rendu | « Tom n’était déjà plus dans la voiture de Sophie » | B1.3 |
| « Annuler » d’une ligne d’échec, refusé par `noRetour` | l’information `Actions.info.noRetour` seule, sans « Annuler » ni échec | B1.4 |
| « Trouver une place » au retour, déjà supprimé dans le dernier état reçu | inchangée ; focus sur le titre de l’événement | B1.5 |
| l’information du retour, puis l’état sans retour apporté par une action plus ancienne, réussie ou en échec | l’information part, et la région `status` ne l’annonce plus ; une information de l’aller reste | B1.6 |
| échec `noRetourAgain`, puis l’offre renvoyée pour l’aller seul | la ligne part dès l’envoi | B1.7 |

### Critères de la v4.4.4

Prouvés par Playwright. `messages(page)` donne les textes de la liste de la barre, dans
l’ordre. « Les boutons de la barre » sont les noms de `[data-message-bar] button`. Les
régions sont observées comme en C11.12 (`page.clock`, `MutationObserver`).

**H4. Savoir ce qu’a fait « Annuler ».** En tant que parent qui touche « Annuler », je lis ce
qui est arrivé à ceux que j’annulais, même s’ils étaient déjà sortis, et la barre ne m’offre
jamais un bouton qui ne peut qu’échouer.

- **B1.1** Tom et Léa sont placés par la feuille dans la voiture de Sophie, à l’aller.
  `setOffline(true)`, puis « Annuler » : la barre porte « Tom et Léa n’ont pas pu sortir de
  la voiture de Sophie. Vérifiez la connexion, puis utilisez de nouveau « Annuler ». », avec
  son « Annuler ». `setOffline(false)`, puis Hugo est placé d’un tap dans la voiture de Marc.
  Enfin, l’« Annuler » de la ligne d’échec, activé au clavier :
  - `messages(page)` = [« Tom et Léa ne sont plus dans la voiture de Sophie »] ;
  - les boutons de la barre sont [« Fermer »] ;
  - en base, Hugo est toujours passager de la voiture de Marc, et Tom et Léa sont sans
    voiture à l’aller ;
  - le titre de la carte de Sophie a le focus ;
  - 100 ms après la réponse, la région `status` contient « Tom et Léa ne sont plus dans la
    voiture de Sophie ».

  C’est le comportement de `main` : le critère le garde.
- **B1.2** La scène de B1.1. Avant l’« Annuler » de la ligne d’échec, Tom et Léa sortent de
  la voiture de Sophie par un autre appareil : en base, ils sont sans voiture à l’aller, et
  la page ne relit rien. Puis l’« Annuler » de la ligne d’échec :
  - `messages(page)` = [« Tom et Léa n’étaient déjà plus dans la voiture de Sophie »] ;
  - les boutons de la barre sont [« Fermer »] ;
  - en base, Hugo est toujours passager de la voiture de Marc ;
  - le titre de la carte de Sophie a le focus ;
  - 100 ms après la réponse, la région `status` contient ce texte, et la région `alert` n’a
    reçu aucun texte depuis l’envoi ;
  - en anglais, le texte est « Tom and Léa were already out of Sophie’s car ».

  Sur `main`, la barre se vide : le test échoue.
- **B1.3** Tom est placé d’un tap dans la voiture de Sophie, et la barre dit « Tom est dans la
  voiture de Sophie », avec « Annuler ». En base, Tom sort de cette voiture par un autre
  appareil. Puis « Annuler », activé au clavier :
  - `messages(page)` = [« Tom n’était déjà plus dans la voiture de Sophie »] ;
  - les boutons de la barre sont [« Fermer »] ;
  - le titre de la carte de Sophie a le focus.
- **B1.4** Ce critère complète M7.10 d’organizer-view, et #267 le construit. Tom est placé
  d’un tap dans la voiture de Sophie, **au retour**. Hors ligne, son « Annuler » échoue, et
  la ligne d’échec porte son « Annuler ». On repasse en ligne, et l’organisateur supprime le
  retour, en base ; aucune action n’applique l’état sur cette page. Puis l’« Annuler » de la
  ligne d’échec, activé au clavier :
  - `messages(page)` = [« Il n’y a plus de retour pour cet événement : la voiture de Sophie
    n’est plus proposée. »] ;
  - aucun bouton « Annuler » dans la barre ;
  - la région `alert` n’a reçu aucun texte depuis l’envoi ;
  - la page n’a plus d’onglets, et le titre de l’événement a le focus.
- **B1.5** #339 le construit. Son test (`e2e/find-seat.spec.ts`, « #330: « Trouver une
  place » on the retour while it goes ») couvre tout ce qui suit, sauf la région `status`,
  à y ajouter. Le retour a une voiture de Marc, à 17:00, complète (variante : une place
  libre). Au retour, Tom « Ne fait pas le retour » (aucun Placement : `seedScene`, sans
  `tomWithoutCar`), et Léa seule est « Sans voiture ».
  1. Tom · Retour, « Je cherche une place », offert par la feuille d’une cellule « Ne fait
     pas le retour », avec la réponse retenue ; Échap ferme la feuille de Tom.
  2. On ouvre la cellule Léa · Retour.
  3. Pendant qu’elle est ouverte, l’organisateur supprime le retour, en base, et la réponse
     pour Tom est relâchée. Refusée par `noRetour`, elle apporte l’état sans retour, et son
     échec attend la fermeture de la feuille. La page garde ses onglets sous la feuille, et
     la barre n’a aucune ligne.
  4. Puis « Trouver une place ». Ensuite :
     - la feuille est fermée, la page n’a plus d’onglets, et le titre de l’événement a le
       focus ;
     - `messages(page)` = [« Tom · Retour : « Je cherche une place » n’a pas été enregistré.
       Il n’y a plus de retour pour cet événement. »]. C’est l’échec de Tom, écrit à la
       fermeture, et non « Aucune place libre au retour pour l’instant. » ;
     - la région `status` n’a jamais reçu « Aucune place libre au retour pour l’instant. »
       (à ajouter au test de #339) ;
     - rien n’est écrit sous `aria-hidden` (`watchAlerts`).
- **B1.6** #267 le construit. Une voiture de Marc à l’aller, avec une seule place libre ;
  aucune place libre au retour. Tom et Léa sont « Sans voiture ». Tom est placé d’un tap
  dans la voiture de Marc, avec la réponse retenue. L’organisateur supprime le retour, en
  base. « Trouver une place » pour Léa · Retour écrit « Aucune place libre au retour pour
  l’instant. ». La page a encore ses onglets. Deux variantes, avec `page.clock` :
  - **réussie**, réponse relâchée 100 ms au moins après l’information, quand la région
    `status` contient son texte :
    - `messages(page)` = [« Tom est dans la voiture de Marc »], et les boutons de la barre
      sont [« Annuler », « Fermer »] ;
    - à la réponse, l’observateur voit la région `status` vidée. 100 ms après, elle contient
      « Tom est dans la voiture de Marc », et elle n’a pas reçu de nouveau le texte de
      l’information. Ces assertions sur la région passeraient aussi sans la règle, puisque la
      réussite vide et écrit de toute façon la région `status` : dans cette variante, c’est
      `messages(page)` qui attrape une règle absente (l’information resterait dans la
      liste). La variante en échec est celle qui attrape l’oubli de la région `status` ;
  - **en échec** : avant de relâcher, la dernière place de Marc est prise en base par une
    autre personne. La réponse est relâchée moins de 100 ms après l’écriture de
    l’information, dont l’écriture dans la région `status` est encore en attente. La
    réponse est le refus `seatTaken`, avec l’état sans retour :
    - `messages(page)` = [« Tom n’a pas pu monter dans la voiture de Marc. Cette place vient
      d’être prise. »] ;
    - l’observateur n’a jamais vu le texte de l’information dans la région `status` :
      l’écriture en attente est annulée. La région `status` reste vide jusqu’à la fin du
      test ;
    - 100 ms après la réponse, la région `alert` contient l’échec de Tom.

  Dans les deux variantes, la page n’a plus d’onglets, et le focus n’est jamais sur
  `<body>`. Sans la règle, la variante en échec laisserait « Aucune place libre au retour
  pour l’instant. » dans la région `status`.

  Variante sur l’aller : aucune voiture n’a de place libre à l’aller, et Tom est « Sans
  voiture » à l’aller. On ouvre la cellule Tom · Aller et on touche « Ne fait pas l’aller »,
  avec la réponse retenue. Échap ferme la feuille de Tom avant qu’on ouvre la cellule Léa ·
  Aller. Le retour est supprimé en base, et « Trouver une place » pour Léa · Aller écrit
  « Aucune place libre à l’aller pour l’instant. ». Puis la réponse est relâchée :
  `messages(page)` = [« Aucune place libre à l’aller pour l’instant. »]. L’information de
  l’aller reste (v4.4.2-1).
- **B1.7** #267 le construit. C’est la scène de M7.6 (organizer-view). Claire, depuis
  l’onglet Aller, avec « Je ramène aussi des personnes » ; le retour est supprimé en base, et la feuille
  est fermée avant la réponse. La barre dit « Les voitures de Claire pour l’aller et le retour
  n’ont pas été proposées. Il n’y a plus de retour pour cet événement : proposez de nouveau
  la voiture, pour l’aller seulement. ». La page n’a plus d’onglets. Puis « Proposer une
  voiture », le bouton du seul leg qui reste, l’aller, avec Claire qui conduit, sans « Au
  retour » ; « Valider » part, et la réponse est retenue (`page.route`) :
  - la ligne a quitté la barre avant la réponse ;
  - le test « ne retire pas » de la table des sujets reste vert : Marc échoue hors ligne sur
    les deux legs, avec un retour qui existe ; Marc à l’aller seul laisse l’échec après sa
    réponse.

**Non prouvable par un test** : qu’une personne ne croie plus Hugo sorti. Le texte de B1.2
le dit, sans plus.

### Pour le développement de la v4.4.4

- B1.2 et B1.3 : dans `participant-board.tsx` (`giveBack`), quand `undoneIds` est vide, la
  réussite prend le texte de `Seat.alreadyOut`, avec tous les prénoms de l’« Annuler »,
  au lieu de `messages.succeed(null)`. Une petite tâche à ouvrir : #341 la demande quand le
  comportement change.
- B1.4, B1.6 et B1.7 vont dans #267. B1.6 en échec demande que la transition vide la région
  `status` si elle annonce encore l’information du retour, quelle que soit la réponse.
- B1.5 est dans #339 ; il manque à son test l’observation de la région `status`.
- C11.11 : le Vitest des prénoms couvre aussi `Seat.alreadyOut`.

## Ce qui change en v4.4 : « Valider » sans changement (#298)

Venu de la relecture de #296 (https://github.com/olaurendeau/fullcar/pull/296#issuecomment-6304935175).

**Le problème.** Une personne ouvre « Modifier » sur l’une de ses inscriptions, ne change
rien, puis touche « Valider ». Aujourd’hui, la page envoie quand même une requête, sans aucun
champ. Hors ligne, cet envoi échoue, et la barre dit « Le prénom et le téléphone de Claire
n’ont pas été enregistrés. Vérifiez la connexion, puis réessayez. » La personne lit qu’elle a
perdu deux changements qu’elle n’a jamais faits. La règle des sujets dit pourtant que le
sujet est « la personne et chaque champ envoyé » : ici, aucun champ n’est parti. Ce qu’elle
fait aujourd’hui à la place : elle ferme la feuille avec « Fermer » ou Échap, si elle y pense.

**La règle.** « Valider » sans aucun champ changé ferme le formulaire et n’envoie rien,
comme « Modifier l’événement » de l’espace organisateur (organizer-view v3.3, M2.5).

1. **Un champ est changé** quand sa valeur diffère de celle que le formulaire montrait à son
   ouverture, caractère pour caractère. Un champ changé puis remis à cette valeur n’est pas
   changé. « Tom » suivi d’une espace est un changement : il part, et le serveur enregistre
   « Tom » (décision v4.4-2).
2. **Aucun champ changé** : la feuille se ferme, et rien n’est envoyé, ni requête, ni
   vérification des champs. Le focus va sur le prénom de la personne dans « Vos
   inscriptions », comme après un « Valider » qui enregistre.
3. **La barre ne change pas.** Aucune ligne n’y entre, aucune n’en sort : la réussite et son
   « Annuler », l’information et chaque échec restent, celui d’un « Modifier » précédent de la
   même personne compris. Rien n’est écrit dans les régions `status` et `alert`. Ce n’est pas
   une action, puisque rien n’est envoyé (règle 2 et règle 5 de la barre).
4. **Hors ligne**, c’est la même chose : la feuille se ferme, et rien n’est dit, ni dans la
   feuille ni dans la barre. La connexion n’est pas consultée.
5. **Au moins un champ changé** : inchangé. Seuls les champs changés partent, et un échec
   nomme ces champs (`Actions.notDone.editPerson`).
6. **Sans JavaScript** : rien à faire. « Vos inscriptions » n’existe pas sans JavaScript, ni
   donc « Modifier » (C3.4).

### Les mots de la v4.4

Aucun mot nouveau, aucun mot changé. L’écran garde ses textes, rien de plus n’est dit :

| clé | fr | en |
|---|---|---|
| `PersonForm.title.edit` | Modifier {firstName} | Edit {firstName} |
| `PersonForm.firstName` | Prénom | First name |
| `PersonForm.phone` | Téléphone (facultatif) | Phone (optional) |
| `Actions.submit` | Valider | Confirm |
| `Actions.close` | Fermer | Close |

Pas de message « Rien n’a changé » (décision v4.4-3).

### Les états de la v4.4

| état | ce qui se passe | critère |
|---|---|---|
| rien changé, « Valider » | la feuille se ferme, rien n’est envoyé, focus sur le prénom | V1.1 |
| rien changé, Entrée dans « Prénom » | idem | V1.2 |
| changé puis remis | idem | V1.3 |
| rien changé, hors ligne | idem ; rien n’est dit | V1.4 |
| rien changé, la barre porte déjà des messages | la barre ne change pas, l’échec de cette personne compris | V1.5 |
| une espace ajoutée au prénom | c’est un changement : il part, le serveur enregistre sans l’espace | V1.8 |
| rien changé, la personne renommée entre-temps par un autre appareil | rien n’est envoyé ; la page montre le nouveau prénom à sa prochaine lecture | V1.6 |
| un champ changé | inchangé : il part seul | V1.7 (tests existants) |
| sans JavaScript | sans objet : « Vos inscriptions » est absente | C3.4 |

### Critères de la v4.4

Chaque critère est prouvé par un test Playwright, dans la scène de `person-edit.spec.ts`
(Claire, `06 11 22 33 44`, et Léa, sur le même appareil). « Aucune requête » se prouve ainsi :
on enregistre les requêtes `next-action` dont le corps contient l’identifiant de Claire
(`changes(page, claire)`). Après le « Valider » sans changement, on rouvre « Modifier
Claire », on change son téléphone en `07 12 12 12 12`, puis on valide. Une fois la feuille
fermée, la liste contient **exactement une** requête, qui porte `07 12 12 12 12`. La seconde
part après la première : si la première avait envoyé, la liste en aurait deux.

**H3. Fermer sans rien changer.** En tant que parent qui ouvre « Modifier » pour vérifier
un numéro, je touche « Valider » sans rien changer, et rien ne se passe d’autre que la
fermeture : aucun message ne me dit que quelque chose a échoué.

- **V1.1** « Modifier Claire », puis « Valider » sans toucher aux champs :
  - `getByRole("dialog")` a 0 élément ;
  - le bouton « Claire » de « Vos inscriptions » a le focus ;
  - aucune requête n’a été envoyée (preuve ci-dessus) ;
  - en base, `first_name` = `Claire` et `phone` = `06 11 22 33 44`.
- **V1.2** La même chose avec Entrée dans le champ « Prénom » au lieu du clic sur « Valider ».
- **V1.3** « Prénom » rempli avec `Clara`, puis de nouveau avec `Claire` ; « Téléphone
  (facultatif) » vidé, puis rempli avec `06 11 22 33 44` ; puis « Valider » : mêmes
  assertions qu’en V1.1.
- **V1.4** `context.setOffline(true)`, puis « Valider » sans changement :
  - la feuille se ferme, et le bouton « Claire » a le focus ;
  - `getByRole("alert").filter({ hasText: /\S/ })` a 0 élément dans la page ;
  - la liste de la barre (`getByRole("group", { name: "Messages" })`) a 0 ligne ;
  - le texte « Action impossible, vérifiez la connexion » n’apparaît nulle part.
- **V1.5** La barre porte déjà deux lignes, obtenues ainsi (v4.4.1) :
  1. la scène ajoute une voiture de Marc **au retour** (`seedRide`, leg `retour`, une place
     libre) ; sur l’onglet Retour, Claire, seule sans voiture, prend la place libre. La barre
     dit « Claire est dans la voiture de Marc » ;
  2. « Modifier Claire », « Prénom » = `Clara`, « Valider » avec la réponse retenue
     (`holdFirst(page, "Clara", true)`), Échap, puis `failHeld` : la barre ajoute « Le prénom
     de Claire n’a pas été enregistré. Une erreur est survenue : réessayez dans un instant. ».

  Puis « Modifier Claire » (le formulaire montre « Claire »), et « Valider » sans
  changement :
  - `messages(page)` a exactement les deux mêmes textes, dans le même ordre (l’échec, puis la
    réussite) ;
  - les boutons de la barre (`[data-message-bar] button`) ont les mêmes noms qu’avant, soit
    « Annuler » (celui de la réussite, #170) puis « Fermer » ;
  - un `MutationObserver` posé sur les deux régions (`recordBar`) avant le clic n’a vu
    aucune écriture.
- **V1.6** Un autre appareil renomme Claire en `Clarisse` pendant que le formulaire est ouvert
  sur « Claire » ; « Valider » sans changement : aucune requête, et en base `first_name`
  reste `Clarisse`.
- **V1.7** Inchangés, et toujours verts : « a form filled before another change’s answer sends
  only what it changed » et le renvoi partiel de C11.11 (le téléphone seul nomme « Le
  téléphone de Claire »).
- **V1.8** Une espace est un changement (décision v4.4-2, v4.4.1) : « Prénom » = `Claire `
  (une espace à la fin), puis « Valider » :
  - la liste `changes(page, claire)` a exactement une requête, et son corps contient
    `"Claire "` (avec l’espace) ;
  - la feuille se ferme, le bouton « Claire » a le focus ;
  - en base, `first_name` = `Claire` : le serveur a retiré l’espace.

**Non prouvable par un test** : qu’une personne comprenne qu’il n’y avait rien à enregistrer.
La feuille qui se ferme le dit, comme « Fermer » ; c’est une raison de la décision v4.4-3,
pas un critère.

### Pour le développement

- Le formulaire (`person-form.tsx`) compare déjà les valeurs à celles qu’il montrait
  (`changed`). Avec `changed` vide en mode `edit`, il appelle `onDone`, ce qui ferme la
  feuille, sans appeler `sends()` ni `updatePerson`. La comparaison se fait avant
  `validatePerson`.
- `editedFields([])` renvoie `both`. Ce cas ne doit plus être atteint : un test Vitest, ou une
  assertion, le prouve.
- Rien ne change côté serveur : `updatePerson` sans champ reste accepté, pour une requête
  forgée ou un client ancien.

### Pour la prochaine révision d’organizer-view

M2.5 (« Valider » sans changement dans « Modifier l’événement ») dit « la feuille se ferme,
aucune requête, aucun message dans la barre ». Il devrait dire aussi, comme V1.1 et V1.5 ici :
où va le focus (le bouton « Modifier l’événement », qui a ouvert la feuille), et que les
lignes déjà dans la barre restent, mêmes textes, même ordre, sans écriture dans les régions.
Relevé à la revue de la v4.4 ; la maquette organizer-view n’est pas changée ici.

Décision v4.4.4-5 (#341, pour #267). M7.6, et la ligne « Proposer une voiture » depuis
l’Aller avec « Je ramène aussi des personnes », feuille fermée, de sa table « mot pour mot », devraient
dire que cet échec `noRetourAgain` a pour sujet sa seule partie aller
(`offer:aller:{personId}` ou `offer:aller:new:{prénom}`). La voiture proposée de nouveau
pour l’aller seul le retire donc dès l’envoi (B1.7 ici). Les mots ne changent pas. La
décision 44 d’organizer-view pourrait aussi dire que la transition retire l’information
« Aucune place libre au retour pour l’instant. » et vide la région `status` qui l’annonce
encore (v4.4.4-4). La maquette organizer-view n’est pas changée ici.

## Ce qui change en v4.3 : « Début » et « Fin »

Demande du propriétaire, sur une capture de `/e/{id}` en production : « Pour les dates je
trouve que « début », « fin » seraient plus clair, puisqu’on parle d’un événement ». Epic :
https://github.com/olaurendeau/fullcar/issues/235.

L’en-tête de l’événement est redessiné, et les champs de date du formulaire de création
changent de mots. Les onglets, la matrice et l’espace organisateur ne changent pas.

1. **L’en-tête** nomme les deux heures de l’événement « Début » et « Fin » (EN « Start »,
   « End »), au lieu de « Aller » et « Retour ». Il ne contient plus aucun nom de leg, ce
   qui le distingue des onglets juste dessous.
2. **Le même jour**, la fin ne montre que son heure : « Début samedi 12 décembre 2026 à
   07:30 », puis « Fin 18:00 ». Un autre jour, elle montre sa date et son heure complètes.
3. **Sans retour**, il n’y a pas de fin : la seule ligne est « Début ».
4. **Le formulaire de création** dit aussi « début » et « fin » : option (a), choisie par le
   propriétaire le 20/10 (#235). Le détail est dans « Décision du propriétaire ».

### Ce que sont ces deux heures, dans le code

Il n’y a ni `start_at` ni `end_at`. L’Event stocke `aller_at` (requis) et `retour_at`
(vide sans retour), et le code s’en sert comme des heures des legs :

- `retour_at` dit à la fois **si l’événement a un retour** (`eventLegs`) et à quelle heure ;
- la date d’un Ride est celle de son leg (`departure_time` n’a pas de date) ;
- « Heure de départ » de « Proposer une voiture » est préremplie avec l’heure du leg ;
- la purge part de la date du dernier leg ;
- la validation exige « retour après aller ».

**« Fin » n’est donc pas le même concept que « Retour ».** La fin est une propriété de
l’événement ; le retour est un leg. Aujourd’hui, une seule colonne porte les deux : la fin
d’un événement est l’heure où part son retour, et un événement sans retour n’a pas de fin.
De même, « Début » se lit comme l’heure où l’on doit être arrivé, alors que le code préremplit
avec cette heure le **départ** des voitures de l’aller.

La v4.3 n’invente pas de nouvelle donnée. Elle renomme ce que l’en-tête montre, et dit dans
le glossaire ce que les deux colonnes signifient :

- `aller_at` : le début de l’événement ;
- `retour_at` : la fin, c’est-à-dire l’heure où part le retour, et rien sans retour.

Une fin sans retour demanderait une nouvelle colonne : c’est hors périmètre, et c’est un
changement de ce qui est stocké, qui revient à l’humain.

### Décision du propriétaire (20/10, #235)

**Question posée** : le formulaire de création dit-il aussi « début » et « fin » ?

**Réponse : option (a), oui.** Le propriétaire l’a choisie le 20/10, et #235 l’enregistre.

- Les champs s’appellent « Date de début », « Heure de début », « Date de fin », « Heure de
  fin », et l’erreur dit « La fin doit être après le début. ».
- La case « Retour » et sa phrase ne changent pas.
- Rien de stocké ne change, et il n’y a aucune migration.
- Le glossaire (`docs/agents/glossary.md`, que l’humain fusionne) décrit l’Event avec un
  début et une fin.
- Raison : sinon, une même valeur serait saisie « Heure de l’aller » et lue « Début ». Ce
  seraient deux noms pour une chose, et le glossaire en fait un défaut.

L’option écartée, (b), ne changeait que l’en-tête. Un organisateur qui saisit le départ de
l’aller (07:30 pour un match à 09:00) aurait lu « Début 07:30 », ce qui est faux.

### Ce qui garde « Aller » et « Retour »

- Les onglets (`Event.legs.*`), et le titre masqué du leg d’un événement sans retour.
- Les colonnes de « Vos inscriptions », les titres de feuille (« Tom · Aller ») et les états
  (« Ne fait pas l’aller »).
- Les sections de l’espace organisateur : leur titre de leg et la date du leg dessous.
- « Proposer une voiture » : son heure reste préremplie avec le début à l’aller et avec la fin
  au retour.
- La case « Retour » du formulaire de création, et sa phrase.

### Où ces deux heures sont nommées

| endroit | aujourd’hui | v4.3 |
|---|---|---|
| en-tête de `/e/{id}` (`EventView`, `<dl>`) | `Event.legs.aller` / `.retour` : « Aller », « Retour » | `Event.dates.start` / `.end` : « Début », « Fin » |
| en-tête sous l’espace organisateur, `/e/{id}/admin` (même `EventView`) | idem | idem |
| sections de l’espace organisateur (`OrganiserLegSection`, h3 + `LegTime`) | « Aller » / « Retour » et la date du leg | inchangé |
| formulaire de création (`CreateEventForm`) | `CreateEvent.allerDate`, `allerTime`, `retourDate`, `retourTime`, `errors.notAfterAller` | nouveaux textes, mêmes clés |
| « Proposer une voiture » (`RideForm.timeHint`, `otherLeg.time.*`) | « Le {date} », « Heure de départ du retour » | inchangé |
| titre du document (`eventMetadata`) | le titre seul | inchangé, pas de date |
| bouton « Partager » (`navigator.share({ url })`) | l’URL seule | inchangé, pas de date |
| page introuvable (`EventNotFound.deleted`) | « … 30 jours après leur date. » | inchangé |
| accueil (`Home.tagline`) | « … aller et retour, sans compte. » | inchangé (ce sont les legs) |
| étape 1 de « Comment ça marche », nouvelle page d’accueil (#232) | « Un titre, un lieu, l’heure de l’aller et celle du retour. » | déjà changée dans #232 : voir « Pour #232 » |

### Pour #232 (nouvelle page d’accueil)

L’étape 1 de « Comment ça marche » dit ce que demande le formulaire. Elle est déjà alignée
dans #232 : « Un titre, un lieu, l’heure de début et, s’il y a un retour, l’heure de fin. ».
Rien à faire ici.

### Les mots de la v4.3

| clé | `messages/fr.json` | `messages/en.json` | avant |
|---|---|---|---|
| `Event.dates.start` | Début | Start | nouvelle ; l’en-tête lisait `Event.legs.aller` |
| `Event.dates.end` | Fin | End | nouvelle ; l’en-tête lisait `Event.legs.retour` |
| `CreateEvent.allerDate` | Date de début | Start date | Date de l’aller / Outbound date |
| `CreateEvent.allerTime` | Heure de début | Start time | Heure de l’aller / Outbound time |
| `CreateEvent.retourDate` | Date de fin | End date | Date du retour / Return date |
| `CreateEvent.retourTime` | Heure de fin | End time | Heure du retour / Return time |
| `CreateEvent.errors.notAfterAller` | La fin doit être après le début. | The end must be after the start. | Le retour doit être après l’aller. / The return must be after the outbound trip. |

Ces clés ne changent pas :

| clé | fr | en |
|---|---|---|
| `Event.legs.aller` | Aller | Outbound |
| `Event.legs.retour` | Retour | Return |
| `CreateEvent.retour` | Retour | Return |
| `CreateEvent.retourHint` | Décochez s’il n’y a pas de retour organisé. | Untick if no return trip is organised. |

Les noms des clés `CreateEvent.aller*` / `retour*` restent : ce sont ceux des champs
(`EventField`) et des colonnes, qui ne changent pas.

Les valeurs ne sont pas des clés : elles passent par `useFormatter().dateTime(wallClockAsUtc(at), …)`,
en UTC (l’heure murale).

| valeur | format | fr | en |
|---|---|---|---|
| début, et fin d’un autre jour | `{ dateStyle: "full", timeStyle: "short" }` | samedi 12 décembre 2026 à 07:30 | Saturday, December 12, 2026 at 7:30 AM |
| fin du même jour | `{ timeStyle: "short" }` | 18:00 | 6:00 PM |

Chaque valeur reste un `<time dateTime="YYYY-MM-DDTHH:MM">` complet.

### Critères de la v4.3

Chaque critère est prouvé par un test. On appelle « événement amorcé » celui des fixtures
(`allerAt` 2026-12-12 07:30, `retourAt` 2026-12-12 18:00). Les autres événements sont
amorcés par le test.

**H1. Lire quand l’événement commence et finit.** En tant que participant qui ouvre le lien,
je lis quand l’événement commence et quand il finit, sans confondre ces heures avec les
onglets Aller et Retour.

- **D1.1** `/e/{id}` d’un événement dont la fin tombe le même jour que le début :
  - `header dt` a exactement les textes `["Début", "Fin"]` ;
  - `header dd` a exactement les textes `[/^samedi 12 décembre 2026 à 07:30$/, /^18:00$/]` ;
  - les deux `header time` ont `datetime` = `2026-12-12T07:30` et `2026-12-12T18:00`.
- **D1.2** Avec une fin le lendemain (2026-12-12 20:00 → 2026-12-13 01:00), le second `dd`
  est `/^dimanche 13 décembre 2026 à 01:00$/`. Même chose sur plusieurs jours.
- **D1.3** Sans retour, `header dt` a exactement `["Début"]`, et aucun texte « Fin » n’est
  dans l’en-tête.
- **D1.4** L’en-tête ne contient ni « Aller » ni « Retour » :
  `expect(page.locator("header")).not.toContainText(/Aller|Retour/)`. Les onglets gardent
  leurs noms : `getByRole("tab")` a les textes `["Aller", "Retour"]` sans pastille.
- **D1.5** Navigateur `en-GB` :
  - `header dt` = `["Start", "End"]` ;
  - `header dd` = `[/^Saturday, December 12, 2026 at 7:30\sAM$/, /^6:00\sPM$/]` ;
  - les onglets restent `["Outbound", "Return"]`.
- **D1.6** `/e/{id}/admin`, avec un lien d’organisateur valide :
  - le même en-tête qu’en D1.1 ;
  - les sections de l’espace organisateur gardent leur titre « Aller » / « Retour » et leur
    date complète (`organiser-panel.spec.ts`, inchangé, reste vert).
- **D1.7** « Même jour » se lit sur l’heure murale, et `timezoneId` ne change rien :
  - avec `timezoneId: "America/New_York"`, un événement 2026-12-12 20:00 → 2026-12-12 23:30
    affiche la fin « 23:30 » ;
  - un événement 2026-12-12 20:00 → 2026-12-13 00:30 affiche « dimanche 13 décembre 2026 à
    00:30 ».
- **D1.8** À 360 px, en français et en anglais, sur deux jours :
  - aucun débordement horizontal (`scrollWidth − clientWidth = 0`) ;
  - chaque `dt` est sur la première ligne de son `dd` : l’écart entre leurs `top` est d’au plus
    4 px. Le `dt`, plus petit (14 px), est aligné sur la ligne de base du `dd` (16 px), donc
    environ 3 px plus bas.

**H2. Créer un événement avec un début et une fin.** En tant qu’organisateur, je saisis le
début et la fin de mon événement avec les mots que je lirai ensuite sur sa page (option (a),
décision du propriétaire du 20/10).

- **D2.1** Sur le formulaire de création :
  - les champs ont pour noms accessibles « Date de début », « Heure de début », « Date de
    fin », « Heure de fin » ;
  - la case s’appelle toujours « Retour », décrite par « Décochez s’il n’y a pas de retour
    organisé. » ;
  - en `en-GB` : « Start date », « Start time », « End date », « End time », « Return ».
- **D2.2** Une fin antérieure ou égale au début :
  - le champ « Heure de fin » a pour description accessible « La fin doit être après le
    début. » (EN « The end must be after the start. ») ;
  - avec une date de fin antérieure à la date de début (11/12/2026 pour un début le
    12/12/2026), c’est le champ « Date de fin » qui a cette même description ;
  - rien n’est créé.
- **D2.3** Les critères de #3 amendés par la v4.3 (R1, C1.2, C1.3, C1.4, C1.7, C1.8, C1.12,
  C2.1 et C5.1, texte dans « Critères de l’epic à amender ») sont vrais avec leurs nouveaux
  mots. C2.2, inchangé, reste vrai. En particulier :
  - la date de fin suit la date de début tant qu’on ne l’a pas changée (C1.3) ;
  - le chemin le plus court tient en 6 actions : titre, lieu, date de début, heure de début,
    heure de fin, « Créer » (C1.4) ;
  - décocher « Retour » masque les deux champs de fin (C2.1).
- **D2.4** Le parcours complet (`journey.spec.ts`) :
  - on crée avec « Heure de début » 07:30 et « Heure de fin » 18:00 ;
  - la page de l’événement affiche « Début … à 07:30 » et « Fin 18:00 » ;
  - « Proposer une voiture » préremplit « Heure de départ » avec 07:30 à l’aller et 18:00 au
    retour, comme aujourd’hui.
- **D2.5** Rien de stocké ne change :
  - test Vitest de `createEvent` : les mêmes champs écrivent les mêmes `aller_at` et
    `retour_at` qu’avant ;
  - aucune migration n’est ajoutée ;
  - aucune clé n’est ajoutée ni retirée dans `CreateEvent`, et `check-i18n` passe.

**Non prouvable par un test** : qu’un participant lise « Fin » comme l’heure où part le
retour. C’est une raison de l’option (a), pas un critère.

### Les états de la v4.3

| état | ce qui s’affiche | critère |
|---|---|---|
| fin le même jour | Début complet, Fin à l’heure seule | D1.1 |
| fin un autre jour, après minuit | deux dates complètes | D1.2, D1.7 |
| sans retour | la seule ligne « Début » | D1.3 |
| `/e/{id}/admin` | même en-tête ; sections organisateur inchangées | D1.6 |
| anglais, 360 px | Start / End, pas de débordement | D1.5, D1.8 |
| formulaire : heure de fin avant le début | erreur sous « Heure de fin » | D2.2 |
| formulaire : date de fin avant la date de début | erreur sous « Date de fin » | D2.2 |
| hors ligne, introuvable, chargement | inchangés : l’en-tête est rendu par le serveur avec la page, ou la page n’existe pas | — |

## Ce qui change en v4.2 (#216)

Seules la barre de messages et ses mots changent ; aucun autre écran n’est redessiné.

1. **Une réussite ne remplace jamais un échec.** La barre garde ensemble la dernière réussite
   et tous les échecs en attente. Un échec ne part que par l’envoi d’une action sur le même
   sujet (le mécanisme de #208), ou par « Fermer » / Échap.
2. **Un échec nomme ce qui n’a pas été fait**, puis dit pourquoi et quoi faire : « Tom et
   Léa n’ont pas pu monter dans la voiture de Sophie. Vérifiez la connexion, puis
   réessayez. »
3. **Plusieurs prénoms** : « Tom et Léa », « Tom, Léa et Hugo », puis « Tom, Léa et
   2 autres ».
4. **Lecteurs d’écran** : un message qui arrive ne réécrit jamais l’autre région vivante, et
   un deuxième échec ne fait pas relire le premier.

Le détail est dans « La barre de messages », les mots dans « Les mots », les critères dans
« Critères de l’epic à amender ».

**v4.2.1**, après la revue de design de la v4.2 :
- le focus à la fermeture ne vise qu’un repère affiché (les panneaux de leg sont toujours
  montés) ;
- chaque message a son repère ;
- chaque sujet a sa paire de tests ;
- `alreadyInCar` nomme les personnes, et « Réessayer » nomme ce qui n’a pas été chargé ;
- la liste visible n’est pas vivante : deux régions masquées n’annoncent que le nouveau
  message ;
- un « Annuler » qui échoue porte son propre « Annuler ».

**v4.2.2**, après la revue de design de la v4.2.1 :
- une seule règle de sortie du focus, pour tout élément de la barre qui disparaît (règle 8) ;
- les régions d’annonce écrivent toujours en deux temps (vider, puis écrire 100 ms plus
  tard), et une écriture plus récente annule celle en attente ;
- « Aucune place libre » est une information, qui ne retire ni une réussite, ni son
  « Annuler », ni un échec ;
- la raison d’un « Annuler » qui échoue nomme le bouton ;
- l’échec de « Modifier » une personne nomme les champs envoyés ;
- le sujet de « Proposer une voiture » couvre chaque leg de l’offre.

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

1. En-tête de l’événement : titre, lieu, « Début » et « Fin » (v4.3 ; la fin seulement avec
   un retour, son heure seule le même jour).
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
  sur l’onglet Retour. Sous le titre, la ligne d’aide de la v4.5 (`RideForm.otherLeg.hint.*`),
  qui dit où et quand part l’autre leg, et décrit le groupe (`aria-describedby`). Boutons
  radio :
  - « Je ramène aussi des personnes » / « J’emmène aussi des personnes » : déplie le **lieu** de l’autre leg (« Lieu de
    dépose » au retour, « Lieu de départ » à l’aller, prérempli avec le lieu saisi et qui le
    suit tant qu’on ne le change pas, comme la date de retour de la création d’événement)
    et son **heure** (préremplie avec l’heure de l’autre leg dans l’événement : 18:00 pour
    « Je ramène aussi des personnes » depuis l’Aller du Tournoi de Rennes, 07:30 pour « J’emmène aussi des personnes »
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

- Le tap reste immédiat (C5.2). La **barre de réussite reste** jusqu’à l’action suivante qui
  réussit, « Fermer » ou Échap ; elle ne s’efface plus après 6 s (WCAG 2.2.1). Depuis v4.2, un
  échec qui arrive entre-temps s’y ajoute sans l’effacer.
- Après **tout placement réussi** (un tap, la feuille, « Qui monte avec vous ? »), la barre
  porte un bouton « Annuler » (`Seat.undo`, 44 px, contour clair sur le fond sombre), entre
  le message et la croix, **hors** de la région `status`. Sauf si sa réussite est abandonnée
  avant d’être écrite (règle 2, v4.4.5) : ni la réussite ni « Annuler » ne s’affichent.
- « Annuler » rend à chaque personne placée son état d’avant sur ce leg (sans voiture, ou ne
  fait pas ce leg si elle avait été cochée dans la feuille). Une personne qui n’est plus dans
  cette voiture n’est pas touchée (comme C7.4). Ensuite la barre dit `Seat.undone`, sans
  « Annuler ». Si personne n’est rendu, elle dit `Seat.alreadyOut` (« Tom n’était déjà plus
  dans la voiture de Sophie »), jamais rien (v4.4.4). « Annuler » ne défait pas la voiture
  proposée elle-même.
- « Annuler » disparaît à l’action suivante qui réussit, avec le message qu’il accompagne ;
  un échec ne l’emporte pas (v4.2).

## La barre de messages

Ce qui ne change pas :

- une seule barre pour la page, placée dans le DOM après l’en-tête et affichée en bas, avec
  des marges de 12 px plus la zone sûre ;
- deux régions vivantes (`status`, `alert`), toujours montées et vides sans message, qui ne
  contiennent que du texte ;
- « Annuler » et « Fermer » hors des régions ;
- le bandeau est aussi un `status` : les tests filtrent `getByRole("status")` par texte.

Ce qui change en v4.2 (#216) : la barre peut porter **plusieurs messages à la fois**. En
v4.2.1, après la revue : le focus à la fermeture, un repère pour chaque message, un test par
ligne de la table des sujets, et des régions vivantes qui n’annoncent que le nouveau message.

### La règle (v4.2, précisée en v4.2.1 et v4.2.2)

Décision de l’humain sur #216, option (a) : une réussite ne remplace jamais un échec en
attente ; seul un envoi sur le même sujet le retire ; le message d’échec nomme ce qui n’a pas
été fait. Sans exception : dans la barre, tout échec nomme ce qui n’a pas été fait.

Une **action** est un envoi au serveur. La barre porte trois sortes de messages :

- la **réussite** d’une action ;
- l’**échec** d’une action ;
- l’**information**, qui ne vient d’aucun envoi. Aujourd’hui, il n’y en a qu’une : « Aucune
  place libre à l’aller / au retour pour l’instant. », écrite par « Trouver une place ».

1. **Ce que la barre contient** : **au plus une réussite** (la dernière écrite ; une réussite
   abandonnée selon la règle 2 n’est jamais écrite, v4.4.5), **au plus une
   information** (la dernière) et **tous les échecs en attente**. De haut en bas : les
   échecs, du plus récent au plus ancien, puis l’information, puis la réussite. « Récent »
   se mesure au moment où le message est **écrit dans la barre**, ni à l’envoi ni à la
   réponse : un échec qui attendait la fermeture d’une feuille prend son rang à cette
   fermeture.
2. **Une action qui réussit** remplace la réussite affichée par la sienne (« Hugo est dans la
   voiture de Marc »). Si elle n’a pas de message, elle la retire : c’est le cas d’une action
   de cellule, d’« Ajouter une personne », de « Modifier », de « Proposer une voiture » sans
   passager et de « Retirer la voiture ». Elle ne retire **aucun échec**. Elle retire
   l’information seulement si elle a commencé **après** elle (règle 4) : la réussite d’une
   action commencée avant l’information la laisse en place (v4.4.2).

   **Une réussite de placement qui attend** la fermeture d’une feuille (règle 9) n’est jamais
   écrite si, avant qu’elle le soit, une action envoyée après elle (`seq`) a réussi en changeant
   l’état d’au moins une de ses personnes sur son leg (v4.4.5, #359). Toute la réussite part,
   avec son « Annuler », et rien ne la remplace. Une action envoyée après qui échoue ou est
   refusée, ou qui porte sur d’autres personnes ou sur l’autre leg, la laisse s’écrire.
3. **Une action qui échoue** ajoute son échec. Elle ne retire **ni la réussite, ni les autres
   échecs**. Elle retire l’information seulement si elle a commencé **après** elle (règle 4) :
   l’échec d’une action commencée avant l’information la laisse en place (v4.4.2).
4. **Une information** (v4.2.2) remplace l’information d’avant. Elle ne retire **rien
   d’autre** : ni la réussite, ni son « Annuler », ni aucun échec. Elle part à la fin de
   l’action suivante **commencée après elle**, réussie ou non, ou par « Fermer » / Échap.
   Une action commence quand elle part au serveur ; l’information compte du moment où elle
   est écrite dans la barre (règle 1). Une action commencée avant l’information, et finie
   après, la laisse en place, qu’elle réussisse ou qu’elle échoue (v4.4.2). « Trouver une
   place » qui trouve une place libre n’écrit rien dans la barre et n’y touche pas.

   Cas accepté (v4.4.2) : une action lente, commencée avant l’information, libère une place ;
   l’information reste, alors qu’elle est devenue fausse. « pour l’instant » l’atténue, et
   la prochaine action commencée après elle la retire.

   Exemple : Tom est placé, avec son « Annuler » ; « Trouver une place » pour Léa ne retire
   ni l’un ni l’autre, qu’il y ait une place libre ou non.

   **Le leg d’une information** (v4.4.4). Ce qui suit vaut pour l’information de « Trouver
   une place », `DevicePersons.noFreeSeat.*` (« Aucune place libre à l’aller / au retour pour
   l’instant. »), qui parle d’un leg :
   - si, au moment de l’écrire, le dernier état reçu n’a plus ce leg, elle n’est pas écrite
     (décision du coordinateur sur #339) ;
   - écrite, elle part quand la page applique un état qui n’a plus ce leg. C’est la
     transition d’organizer-view (décision 44, règle 5), qui retire tout message sur le
     retour. Peu importent le moment où l’action qui apporte cet état a commencé et sa
     réponse : réussite, échec, refus ou lecture. Si la région `status` l’annonce encore,
     elle est vidée (« Lecteurs d’écran », point 4).

   Les informations `Actions.info.noRetour` et `Actions.info.noRetourLeg` (organizer-view)
   ne sont pas concernées. Elles disent que le retour n’existe plus, et la réponse qui
   apporte la transition les écrit après elle (B1.4, M7.10).
5. **Ce qui retire un échec** :
   - l’envoi d’une action sur **le même sujet** (table « Le sujet d’un échec »), **dès
     l’envoi**. Ce que devient ce nouvel envoi est dit par son propre message, dans sa
     feuille ou dans la barre ;
   - **un retrait de voiture réussi** (v4.4, décision du propriétaire sur #221, PR #255). Il
     retire tous les messages sur cette voiture, réussite comme échecs : ceux de ses places
     (`seats:{rideId}`, et `undo:{rideId}` pour « Annuler », #170) et ceux de sa
     modification (`ride:{rideId}:edit`). Il les retire qu’ils soient en attente sous une
     feuille ou une confirmation, déjà dans la barre, ou venus d’un envoi parti avant la
     réponse du retrait ; un tel message ne s’affiche jamais. Un envoi parti après cette
     réponse dit son propre échec (`rideGone`). La voiture n’existe plus : ces messages ne
     décrivent plus rien ;
   - **la transition vers un état sans retour** (organizer-view, décision 44 ; v4.4.4). La
     page applique un état qui n’a plus le retour que l’état précédent avait : réponse d’une
     action, lecture, ou enregistrement de l’organisateur sur `/admin`. Elle retire alors de
     la barre tout message sur le retour, avant d’écrire le message de cette réponse :
     réussite, information et échecs, avec leurs « Annuler ». C’est une transition, une
     seule fois : les échecs `noRetour` écrits par cette réponse ou par les suivantes
     restent, jusqu’à un envoi sur leur sujet ou « Fermer ». **Une exception** (v4.4.6,
     décision du propriétaire sur #267) : l’échec hors ligne ou en erreur d’une offre sur
     les deux legs reste, réduit à l’aller (mots, sujet `offer:aller:…`, repère), à son
     rang, et sa réduction n’est pas annoncée (« Lecteurs d’écran », point 4) ;
   - « Fermer », ou Échap.

   Rien d’autre ne le retire : ni une réussite d’une autre action, ni une information, ni un
   autre échec, ni le temps, ni l’ouverture d’une feuille, ni le retour du réseau, ni un
   « Valider » sans changement, qui n’envoie rien (v4.4).
6. **« Annuler »** : un seul par placement.
   - Il est sur la réussite du placement.
   - Si cet « Annuler » échoue, le placement tient : la réussite reste, et l’échec s’ajoute
     **avec son propre « Annuler »**, que la réussite perd tant que cet échec est là. Sa
     raison nomme le bouton (`Actions.why.retryUndo`) : « Tom et Léa n’ont pas pu sortir de
     la voiture de Sophie. Vérifiez la connexion, puis utilisez de nouveau « Annuler ». »
   - **Pendant l’envoi d’un « Annuler »**, aucun « Annuler » n’est affiché pour ce
     placement : ni sur l’échec, parti à l’envoi, ni sur la réussite. À la réponse :
     - réussie, la réussite « … ne sont plus… » (`Seat.undone`) remplace la réussite
       affichée ; si personne n’est rendu, c’est « … n’étai(en)t déjà plus… »
       (`Seat.alreadyOut`, v4.4.4) ;
     - en échec (hors ligne, erreur), un nouvel échec arrive avec son « Annuler » ;
     - refusée par `noRetour`, il n’y a aucun échec. La transition retire les lignes du
       retour, et la barre dit l’information `Actions.info.noRetour` (v4.4.4).
   - Si une réussite ultérieure remplace celle du placement, l’échec et son « Annuler »
     restent : la raison désigne toujours un bouton présent dans la même ligne.
   - Le bouton a pour nom « Annuler » et `aria-describedby` vers le texte de sa ligne.
   - Un « Annuler » renvoyé depuis une ligne d’échec réussit : sa réussite remplace la
     réussite affichée, même celle d’un placement plus récent, et l’« Annuler » de celle-ci
     part avec elle (règle 2). Comme celle de tout « Annuler », elle n’est jamais muette : si
     personne n’est rendu, elle dit `Seat.alreadyOut` (v4.4.4).
   - Un « Annuler » refusé par `noRetour` n’écrit aucun échec et ne laisse aucun
     « Annuler ». L’état sans retour retire les lignes du retour, et la barre dit
     l’information `Actions.info.noRetour` (organizer-view v3.3.6, décision 44 et M7.10 ;
     v4.4.4).
7. **« Fermer », ou Échap** avec le focus dans la barre, retire **tous** les messages,
   réussite, information et échecs. Rien n’est envoyé ni défait. Le focus suit la règle 8.
   Échap avec le focus ailleurs ferme la barre sans déplacer le focus.
8. **Le focus qui quitte la barre** (v4.2.2). Quand l’élément de la barre qui a le focus
   disparaît ou cesse d’être focalisable, quelle qu’en soit la raison, le focus va au **premier repère affiché** de cette
   liste (table « Le repère de chaque message ») :
   1. le repère du message auquel appartenait l’élément (« Fermer » n’appartient à aucun) ;
   2. les repères des autres messages, encore là ou qui viennent de partir, du plus récent
      au plus ancien ;
   3. l’onglet actif ; sans onglets, le titre de l’événement.

   Les raisons de disparaître sont :
   - « Fermer », ou Échap ;
   - l’« Annuler » de la réussite, activé : il disparaît dès l’envoi (règle 6). Le focus va
     au titre de la carte, la même cible qu’à la réponse (v4.2.3) ;
   - l’« Annuler » d’un échec, activé : sa ligne part dès l’envoi (règles 5 et 6) ;
   - une réponse tardive qui remplace la réussite dont l’« Annuler » a le focus, comme dans
     le cas de #216, où une feuille a été fermée avant la réponse ;
   - une action sans message qui vide la barre alors que le focus est sur « Fermer » ;
   - la liste qui cesse de déborder. Elle garde pourtant `tabIndex={0}` tant qu’elle a le
     focus (v4.2.3) : le cas ne se produit donc pas, et la règle reste le garde-fou.

   « Affiché » veut dire visible (`toBeVisible()`) : dans le panneau de l’onglet actif, ou
   hors des onglets, et pas dans une section repliée. Les deux panneaux de leg sont toujours
   montés (`forceMount` dans `leg-tab-panel.tsx`) : un repère de l’autre onglet existe, mais
   `focus()` n’y fait rien, et le focus tomberait sur `<body>`.

   Le focus ne tombe jamais sur `<body>`. La règle ne change jamais d’onglet et ne déplie
   rien.
9. **Inchangé** :
   - un échec dit dans la feuille qui l’a envoyé, tant qu’elle est ouverte, n’entre pas dans
     la barre ;
   - un message attend qu’aucune feuille ne cache la page (#167, #208).

**Le cas de #216.** On envoie Tom et Léa dans la voiture de Sophie, et l’on ferme la feuille
avant la réponse ; on fait de même avec Hugo dans la voiture de Marc. L’envoi pour Sophie
échoue, celui pour Hugo réussit. Quel que soit l’ordre des réponses, la barre montre :

1. « Tom et Léa n’ont pas pu monter dans la voiture de Sophie. Une erreur est survenue :
   réessayez dans un instant. »
2. « Hugo est dans la voiture de Marc », avec « Annuler ».

### Le repère de chaque message

C’est l’élément qui reçoit le focus quand l’élément de la barre qui l’avait disparaît, s’il
est affiché (règle 8).

| message | repère |
|---|---|
| un placement (tap, feuille, « Qui monte avec vous ? »), réussi ou non ; « Annuler », réussi ou non | le titre de la carte de cette voiture, sur l’onglet de son leg ; si la voiture a disparu, le bandeau de ce leg |
| « Modifier » la voiture ou « Retirer la voiture », en échec | le titre de la carte ; si la voiture a disparu, le bandeau de ce leg |
| une action de cellule, en échec | la cellule ; section repliée : le bouton « Vos inscriptions » |
| « Modifier » une personne, en échec | son prénom dans la matrice ; section repliée : le bouton « Vos inscriptions » |
| « Ajouter une personne », en échec | envoyé depuis le tableau : le bouton « Ajouter une personne » du leg d’où il est parti ; depuis une place ou la feuille : le titre de la carte de cette voiture |
| « Proposer une voiture », en échec | le bouton « Proposer une voiture » du leg d’où il est parti ; réduit à l’aller par la transition (v4.4.6) : celui de l’aller |
| « Réessayer » de « Vos inscriptions », en échec | le bouton « Réessayer » de l’alerte de la section, hors des onglets, affiché tant que « Vos inscriptions » est en échec |
| « Aucune place libre à l’aller / au retour pour l’instant. » | le bouton « Proposer une voiture » de ce leg |

### Le sujet d’un échec

Un échec porte sur le sujet de l’envoi qui a échoué. Un envoi ne le retire que s’il porte sur
le même sujet **et** qu’il couvre tout ce que l’envoi échoué portait. C’est le mécanisme de
#208 : un envoi du seul téléphone ne retire pas un prénom refusé.

La clé de `useSends` est indicative ; le comportement fait foi. Chaque ligne a sa paire de
tests Playwright (C11.10) :

- **« retire »** : l’échec disparaît dès l’envoi, avant la réponse, retenue par `page.route` ;
- **« ne retire pas »** : l’échec reste après la réponse de cet envoi.

| action | sujet (clé `useSends`) | test « retire » | test « ne retire pas » |
|---|---|---|---|
| un tap ; la feuille « Qui monte… ? » | la voiture et chaque personne envoyée (`seats:{rideId}` + personnes) | après l’échec de Tom et Léa dans la voiture de Sophie, la feuille y renvoie Tom et Léa | Hugo dans la voiture de Sophie ; Tom seul dans cette voiture ; « Annuler » d’un placement dans cette voiture |
| « Annuler » | la voiture et chaque personne (`undo:{rideId}` + personnes) | l’« Annuler » de la ligne d’échec | Tom et Léa placés de nouveau dans la voiture de Sophie ; « Sortir de la voiture » depuis la cellule de Tom |
| une action de cellule (« Ne fait pas l’aller / le retour », « Je cherche une place », « Sortir de la voiture ») | la cellule (`cell:{personId}:{leg}`) | après l’échec de « Ne fait pas l’aller » pour Tom · Aller, « Ne fait pas l’aller » depuis la même cellule, rouverte | une action depuis Tom · Retour ; une place prise pour Tom par un tap |
| « Ajouter une personne » (depuis le tableau, une place ou la feuille) | le prénom envoyé, espaces de début et de fin retirés (`person:new:{prénom}`) | « Inès » échoue depuis le bouton de l’onglet Aller ; « Inès » (avec des espaces autour) est renvoyé depuis la feuille d’une place de l’onglet Retour | « Hugo » envoyé depuis le même bouton |
| « Modifier » une personne | la personne et chaque champ envoyé (`person:{personId}` + champs) | après l’échec du prénom et du téléphone de Tom, un « Modifier » de Tom qui envoie les deux | un « Modifier » de Tom qui n’envoie que le téléphone ; un « Modifier » de Léa ; un « Valider » sans changement de Tom, qui n’envoie rien (v4.4, V1.5) |
| « Proposer une voiture » | chaque leg de l’offre, et la personne qui conduit (`offer:{leg}:{personId}` ou `offer:{leg}:new:{prénom}`, une clé par leg : deux avec « Je ramène aussi des personnes ») | après l’échec de Marc, nouvelle personne, à l’aller, Marc à l’aller depuis le formulaire rouvert ; après l’échec de Marc avec « Je ramène aussi des personnes » depuis l’onglet Aller, Marc avec « J’emmène aussi des personnes » depuis l’onglet Retour | Marc au retour ; Claire à l’aller ; Marc à l’aller seul, après l’échec de Marc sur les deux legs (hors ligne ou erreur, avec un retour qui existe). Exception, un échec `noRetourAgain` : son sujet est la seule partie aller, et Claire à l’aller seul le retire (v4.4.4, B1.7). De même pour un échec sur les deux legs réduit à l’aller par la transition (v4.4.6, N1.6) |
| « Modifier » la voiture (#93) | la modification de cette voiture (`ride:{rideId}:edit`, comme PR #218) | un nouveau « Modifier » de la même voiture | « Retirer la voiture » de cette voiture, **qui échoue** (`ride-remove.spec.ts:350`) ; « Modifier » d’une autre voiture ; un « Valider » sans changement de cette voiture, qui n’envoie rien (v4.4.5, W1.6). Un retrait **réussi** retire l’échec (règle 5, v4.4.1) |
| « Retirer la voiture » | le retrait de cette voiture (`ride:{rideId}`, comme PR #213) | un nouveau « Retirer la voiture » de la même voiture | « Modifier » de cette voiture |
| « Réessayer » de « Vos inscriptions » | la lecture de « Vos inscriptions » (`device:read`) | le « Réessayer » suivant | le retour du réseau (`setOffline(false)`, évènement `online`) |

Pour « Ajouter une personne » et « Proposer une voiture », le sujet n’est plus la feuille
qui envoie (le défaut de `useSends`). Raison : chaque ouverture est une nouvelle feuille. Un
échec venu d’une feuille fermée ne serait donc jamais retiré par le renvoi fait depuis la
feuille rouverte. Le test « retire » de ces deux lignes échoue avec le sujet par défaut.

Un renvoi partiel de « Modifier » une personne (le téléphone seul, après l’échec du prénom et
du téléphone) ne retire pas le premier échec. Les deux lignes restent différentes, puisque
chacune nomme les champs envoyés (`Actions.notDone.editPerson`).

### Ce que dit un échec

Un échec dit **ce qui n’a pas été fait**, puis **pourquoi et quoi faire**, en deux phrases :
`Actions.failure` = « {notDone} {why} ».

- **Il parle de l’envoi, au passé**, jamais de l’état présent : « n’a pas pu monter », « n’a
  pas été retirée », jamais « n’est pas dans la voiture ». Le message reste vrai si l’état
  change ensuite, depuis une autre feuille ou un autre appareil.
- **Épicène** (C11.9) : « n’a pas pu monter » est invariable. L’exemple de #216, « Tom et Léa
  n’ont pas été placés », s’accorde au genre (« Léa n’a pas été placée ») : il n’est pas
  repris.
- **Les prénoms et la voiture sont ceux de l’envoi**, tels qu’affichés au moment de l’envoi.
  Pour « Modifier » une personne, c’est le prénom d’avant le changement, puisque rien n’a
  changé.
- **Une action de cellule** reprend le titre de sa feuille (`DevicePersons.sheetTitle`, « Tom ·
  Aller ») et le libellé du bouton touché. « Sortir de la voiture » nomme plutôt la voiture
  (`Actions.notDone.leave`).
- **`alreadyInCar` nomme qui** :
  - après un tap, la personne (« Tom est déjà dans une voiture. ») ;
  - après la feuille, « Une de ces personnes… », juste après la phrase qui les nomme ;
  - après « Proposer une voiture », les personnes cochées dans « Qui monte avec vous ? »,
    que rien d’autre ne nomme : « Parmi Inès et Hugo, une personne au moins est déjà dans
    une voiture. » (`Actions.why.passengerInCar`).
  
  Le serveur ne dit pas laquelle ; la page montre l’état qu’il renvoie.
- **La raison** vient de la réponse : hors ligne (rien n’est parti), erreur serveur, ou le
  refus du serveur. `invalid` et `idTaken`, que seule une requête forgée ou une collision
  d’identifiants produit, prennent la raison générique `Actions.why.failed`.
- **Les clés génériques `Actions.offline` et `Actions.failed` ne restent que dans une feuille,
  un formulaire ou une confirmation ouverts** qui ont envoyé : leur titre et leurs champs
  disent déjà ce qui n’a pas été fait. C’est inchangé, comme pour `Actions.rideGone`,
  `Actions.alreadyInCar`, `Sheet.notEnoughSeats` et `RideChanges.leaving.changed`. Dans la
  barre, aucun échec n’est générique, « Réessayer » compris (`Actions.notDone.readDevice`).
- **Icônes** (Lucide, `aria-hidden`) : un échec, `WifiOff` hors ligne et `TriangleAlert` sinon
  (inchangé) ; une réussite, `CircleCheck` ; une information, `Users`, comme le bandeau de
  couverture (v4.2.3).

Toutes les combinaisons, mot pour mot, sont dans « Chaque échec, mot pour mot » (section « Les
mots »).

### Plusieurs prénoms

Cette règle vaut pour `{names}`, dans `Actions.notDone.seats`, `Actions.notDone.leave`,
`Actions.why.alreadyInCar`, `Actions.why.passengerInCar`, `Sheet.placed`, `Seat.undone` et
`Seat.alreadyOut` (v4.4.4 : « Tom, Léa et 2 autres n’étaient déjà plus dans la voiture de
Sophie », « Tom, Léa and 2 others were already out of Sophie’s car »).

| personnes | fr | en | comment |
|---|---|---|---|
| 1 | Tom | Tom | le prénom |
| 2 | Tom et Léa | Tom and Léa | `format.list`, `type: "conjunction"` (comme `Sheet.placed` aujourd’hui) |
| 3 | Tom, Léa et Hugo | Tom, Léa, and Hugo | idem : en anglais, `format.list` met une virgule avant « and » (v4.4, #280) |
| 4 et plus | Tom, Léa et 2 autres | Tom, Léa and 2 others | `Actions.names.andOthers`, avec les deux premiers prénoms |

- **Ordre** : celui de « Vos inscriptions » (`LegBoard.device`), pas celui des cases cochées.
- **Jusqu’à trois prénoms, le texte est celui de `format.list`**, quel qu’il soit dans la
  langue : « Tom, Léa et Hugo », « Tom, Léa, and Hugo ». Un test compare au résultat de
  `format.list`, jamais à une chaîne écrite à la main pour l’anglais (v4.4). Au-delà, c’est la
  clé `Actions.names.andOthers`, inchangée : « Tom, Léa and 2 others » (décision v4.4-5).
- **`count`**, qui accorde « n’a pas pu » / « n’ont pas pu » et « est » / « sont », compte
  toutes les personnes, nommées ou non.
- **Au-delà de trois prénoms**, la phrase passerait à 360 px à une ligne de plus avant même
  le verbe. « Vos inscriptions » dit qui, cellule par cellule.
- **Un prénom n’est jamais tronqué** ni remplacé par une ellipse : il passe à la ligne, coupé
  n’importe où s’il le faut (`wrap-anywhere`, C11.3).

### À 360 px

Mesuré au rendu de la maquette (Chrome headless, police de 14 px sur 20 px de ligne), dans un
téléphone de 360 × 780 :

- **Largeurs** : la barre fait 336 px. Le texte d’un échec dispose de 232 px, soit environ
  32 caractères par ligne. Celui d’une ligne qui porte « Annuler » dispose de 145 px (161 px
  en anglais, avec « Undo »). Depuis language-switch v3.3.4 (#350), la rangée d’« Annuler »
  prend 2 px de marge à droite pour son anneau de focus : 143 et 159 px. Mesuré en v4.4.4
  (Chrome headless, même police) : les textes de cette section gardent leur nombre de lignes
  à 143 et 159 px, donc les hauteurs ci-dessous ne changent pas.
- **Une ligne de la barre par message**, séparée de la suivante par un filet de 1 px.
- **Style** :
  - avec au moins un échec, toute la barre prend le style d’erreur de v2 (`bg-background`,
    `border-destructive`, `text-foreground`) ; la ligne de réussite y garde son icône, et
    « Annuler » passe en contour (`outline`) ;
  - sans échec, la réussite garde le fond `primary`, comme en v4.
- **Hauteurs mesurées** :

  | ce que porte la barre | hauteur de la barre |
  |---|---|
  | un échec de 3 lignes (« Tom n’a pas pu monter dans la voiture de Sophie. Vérifiez la connexion, puis réessayez. ») | 90 px |
  | un échec de 4 lignes (une action de cellule, erreur serveur) | 110 px |
  | le cas de #216 : un échec de 4 lignes, et une réussite de 2 lignes avec « Annuler » | 171 px |
  | « Annuler » qui échoue : l’échec de 6 lignes avec son « Annuler » (143 px de texte depuis language-switch v3.3.4, 145 px avant, 6 lignes dans les deux cas ; la raison nomme le bouton), et la réussite sans « Annuler » | 211 px |
  | quatre échecs (dont « Tom, Léa et 2 autres » et un prénom de 40 caractères sans espace, qui prend 2 lignes à lui seul) et une réussite : 424 px de contenu | 322 px, la liste plafonnée à 312 px |

- **La liste des messages** est un `role="group"` nommé `Actions.messages` (« Messages »).
  - Elle ne dépasse pas **40 % de la hauteur visible** : `max-height: 40dvh`, soit 312 px à
    780 px ; `dvh` suit la barre d’adresse du navigateur mobile.
  - Au-delà, elle défile (`overflow-y: auto`). Aucun échec n’est retiré pour faire de la
    place, puisque seuls un envoi sur le même sujet ou « Fermer » le retirent.
  - Quand elle déborde, elle devient focalisable (`tabIndex={0}`) pour défiler au clavier.
    Elle garde `tabIndex={0}` tant qu’elle a le focus, même si elle cesse de déborder : sinon
    Chrome ferait tomber le focus sur `<body>` (v4.2.3).
  - Un **nouvel échec** ramène la liste en haut, où il s’affiche.
  - Une **nouvelle réussite** fait défiler sa ligne en vue (`scrollIntoView({ block:
    "nearest" })`), en bas de la liste.
  - « Fermer » reste visible en haut à droite.
- **Espace réservé en bas de la page**, mesuré (`ResizeObserver`) : le `1rem` de marge de la
  page, plus la hauteur de la barre, plus 12 px, plus `env(safe-area-inset-bottom)`. Les
  112 px fixes ne tenaient qu’un message.

### Lecteurs d’écran

`aria-atomic="false"` sur une région qui garde tous les échecs ne suffit pas partout :
TalkBack, et VoiceOver dans certains cas, relisent toute la région à chaque changement. La
v4.2.1 retient donc la solution la plus robuste : **une région ne contient jamais que le
message à annoncer**. La v4.2.2 en fixe le moment d’écriture.

1. **La liste visible n’est pas vivante** : ni `role="alert"`, ni `role="status"`, ni
   `aria-live`. Ses icônes sont `aria-hidden`.
2. **Deux régions masquées visuellement** (`sr-only`), dans la barre, après « Fermer »,
   toujours montées, annoncent les messages :
   - `role="alert"` ne contient que le texte du **dernier échec écrit dans la barre** ;
   - `role="status"` ne contient que le texte du **dernier message poli écrit**, réussite ou
     information.
   
   Chacune se vide quand son message quitte la barre. La région `alert` se vide aussi quand
   la transition réduit à l’aller l’échec dont elle a déjà écrit le texte (point 4, v4.4.6).
3. **Le moment d’écriture** (v4.2.2). Chaque écriture dans une région suit ces trois temps :
   1. la région est vidée aussitôt ;
   2. le texte est écrit **100 ms plus tard**, par une minuterie ;
   3. une écriture plus récente dans cette région, son vidage (son message quitte la barre),
      ou « Fermer » / Échap, **annulent l’écriture en attente**.

   On ne compare pas les textes. Puisque toute écriture passe par « vide, puis texte » dans
   une tâche ultérieure, le DOM change toujours, même pour un texte identique. C’est vrai
   même quand le vidage et le nouvel échec tombent dans le même rendu React : c’est le cas
   d’un renvoi hors ligne, auquel `sendAction` répond sans appel réseau.
   
   Deux échecs écrits dans le même passage : le second annule l’écriture du premier, et seul
   le second est annoncé. Le premier reste dans la liste visible.
4. **Aucune écriture n’écrit de texte dans l’autre région.** Un échec n’écrit rien dans la
   région `status`. Il la vide dans deux cas, et seulement si la région `status` annonce
   encore l’information qu’il retire, par son texte ou par son écriture en attente :
   - son action a commencé après l’information, et il la retire (règle 4) ;
   - sa réponse apporte l’état sans retour, et l’information est celle du retour : la
     transition la retire, quel que soit le moment où l’action a commencé (règles 4 et 5,
     v4.4.4).

   Plus généralement, la transition vide toute région qui annonce encore un message qu’elle
   retire, quelle que soit la réponse qui l’apporte (point 2). Si la région annonce un autre
   message, par exemple une réussite écrite après l’information (v4.4.2), l’échec n’y touche
   pas, ni à son texte ni à son écriture en attente : ce message est encore dans la barre. Une réussite ou une information n’écrit rien
   dans la région `alert`. Un deuxième échec
   remplace le texte du premier dans la région `alert` : seul le deuxième est lu, et le
   premier reste dans la liste visible, où on le relit.

   **Une ligne réduite à l’aller** (v4.4.6). Réduire une ligne n’est pas l’écrire : rien
   n’est annoncé, ni dans la région `alert`, ni dans la région `status`.
   - Si la région `alert` contient déjà le texte entier de cette ligne, elle est vidée, et
     rien n’y est écrit ensuite.
   - Si elle attend encore d’écrire cette ligne, l’écriture en attente écrit le texte réduit,
     à son heure : l’échec est annoncé une fois, dans les mots que la barre montre. Une
     écriture plus récente l’annule, comme toujours (point 3).
   - Si elle annonce un autre échec, ou rien, elle n’est pas touchée.
5. **Réussite, puis échec.** La réussite est polie, l’échec assertif, et il peut couper sa
   lecture. La réussite reste alors dans la liste visible, où on la relit.
6. **Échec, puis réussite** (le cas de #216 dans son ordre). La réussite, polie, attend la fin
   de l’échec, et la région `alert` n’est pas touchée.
7. **Une réussite et un échec dans le même passage**, comme deux feuilles fermées qui
   attendent le même `whenPageShown` : l’échec est écrit en premier, la réussite ensuite.
8. **Les tests** : la liste visible étant doublée par les régions, ils visent les messages
   par la liste (`getByRole("group", { name: "Messages" })`) et les annonces par les régions.
   Ils pilotent les 100 ms avec `page.clock`.
9. **Non prouvable par un test** : ce qu’un lecteur d’écran prononce réellement.
   - Les points 1 à 4 et 7 se prouvent dans le DOM, avec un `MutationObserver` sur chaque
     région.
   - La lecture se vérifie en revue avec VoiceOver (iOS, Safari), TalkBack (Android, Chrome)
     et NVDA (Windows, Chrome), sur le cas de #216 dans les deux ordres d’arrivée : chaque
     message est annoncé une fois, et aucun n’est relu quand un autre arrive.
   - **En mode navigation** (NVDA, rotor VoiceOver), chaque message se lit deux fois : dans
     la liste, puis dans sa région masquée. C’est le prix des régions d’annonce ; elles sont
     placées après « Fermer », pour que la liste se lise d’abord. La revue vérifie que cette
     double lecture reste compréhensible.

## Contraste

Inchangé depuis v2 : aucun texte rouge sur un fond teinté de rouge. Nouveau en v4 : les
pastilles et les cellules « Sans voiture » sont `amber-950` sur `amber-100` (comme le
bandeau) ; les cellules « Ne fait pas… » sont `text-muted-foreground` sur blanc (4,74:1).
Hors de cet épic : `AdminLinkProblem` (`admin-panel.tsx`) garde un fond teinté ; à corriger
à part.

L’anneau de focus des maquettes de cette page est celui d’avant #236 (`ring-ring/50`,
environ 1,5:1). L’anneau qui atteint 3:1 est défini dans la maquette `language-switch` v3,
qui vaut pour tout l’écran.

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
| « Modifier » depuis la feuille du prénom, puis « Valider », avec ou sans changement (v4.4) | le prénom |
| bouton de la section (déplier, replier) | ne bouge pas |
| un tap qui place, la feuille validée, « Proposer une voiture » validé avec des passagers | le titre de la carte |
| « Annuler » dans la barre | le titre de la carte d’où les personnes sont sorties, s’il est affiché ; sinon la règle 8 de la barre (v4.2.2) |
| « Retirer la voiture » confirmé | la cellule du conducteur pour ce leg, désormais « Ne fait pas… » ; section repliée : son bouton « Vos inscriptions » |
| **toute règle qui vise une cellule ou un prénom alors que la section est repliée** | le bouton « Vos inscriptions », qui reste replié (v4-3) ; son nom accessible porte le résumé à jour |
| un refus qui supprime la cible (place prise, voiture retirée) | le titre de la carte si elle existe encore, sinon le bandeau du leg |
| croix « Fermer » de la barre, ou Échap avec le focus dans la barre (tous les messages partent) ; et tout élément de la barre qui a le focus et disparaît : « Annuler » d’un échec envoyé, réussite remplacée par une réponse tardive, barre vidée par une action sans message | la règle 8 de la barre : le premier repère affiché parmi celui du message de l’élément, puis ceux des autres messages, du plus récent au plus ancien ; sinon l’onglet actif ; sans onglets, le titre de l’événement. Jamais `<body>`, jamais de changement d’onglet (v4.2.2) |
| Échap avec le focus ailleurs | ne bouge pas ; la barre se ferme |
| feuille fermée sans effet ; ajouter, proposer, modifier validés sans passager ; « Modifier la voiture » validé sans changement (v4.4.5) | le bouton qui l’a ouverte (défaut de Radix) |
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
cours, 15 voitures. Leurs détails sont dans les sections correspondantes de la page. Depuis
v4.2, dans la barre, « hors ligne » et « erreur serveur » nomment ce qui n’a pas été fait.

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
| proposer, « Je ramène aussi des personnes » et « Qui monte avec vous ? » | Proposer une voiture | revue, C4.5 |
| proposer, erreurs | Proposer une voiture | C4.7 |
| proposer, passagère au retour : « Je reste… », « Quittera la voiture de… » | Proposer une voiture | C3.5, C4.5 |
| proposer depuis l’onglet Retour : « À l’aller », « J’emmène aussi des personnes » | Proposer une voiture | revue, R4, E1.2 |
| l’autre leg : la ligne d’aide, depuis l’Aller et depuis le Retour | L’autre leg, lu depuis l’événement (v4.5) | E1.1, E1.2 |
| l’autre leg : un lieu de 120 caractères à 360 px ; en anglais ; le retour un autre jour | L’autre leg, lu depuis l’événement (v4.5) | E1.4, E1.5, E1.6 |
| l’autre leg absent : pas de ligne | L’autre leg, lu depuis l’événement (v4.5) | E1.7 |
| un tap, « Annuler », après « Annuler », place prise | Un tap et « Annuler » | C5.2, C5.7, C7.4 |
| « qui sort », confirmation de retrait, après confirmation (section repliée, section dépliée) | Modifier, retirer | C8.4, C8.6 |
| hors ligne, 15 voitures avec la barre | Erreurs et chargement | C11.4 |
| la barre : un échec et une réussite ensemble (le cas de #216) | La barre de messages | C11.10, C11.11, C5.10 |
| la barre : hors ligne, un tap | La barre de messages | C11.11 |
| la barre : « Annuler » qui échoue, un seul « Annuler », sur l’échec | La barre de messages | C5.10, C11.10 |
| la barre : action de cellule, feuille fermée | La barre de messages | C3.1, C11.11 |
| la barre : quatre échecs, prénoms longs, plafond de 312 px | La barre de messages | C11.4, C11.11, C11.3 |
| la barre : après « Fermer », repère sur l’onglet actif | La barre de messages | C11.10 |
| la barre : après « Fermer », repère sur l’autre onglet | La barre de messages | C11.10 |
| la barre : « Réessayer » qui échoue | La barre de messages | C5.9, C11.11 |
| aucune place libre : l’information au-dessus de la réussite de Tom et de son « Annuler » | Trouver une place | C3.8, C11.10 |
| la barre : une action commencée avant l’information finit après, réussie ou non ; l’information reste (v4.4.2). Réussie : la barre est celle de la maquette « Aucune place libre sur ce leg », l’information au-dessus de la réussite de Tom. Échouée : sans maquette, la règle 4 le dit | Trouver une place ; La barre de messages | C11.10, C11.12 |
| v4.4.4 : « Annuler » d’une ligne d’échec après une réussite plus récente, quelqu’un rendu ou personne ; « Annuler » d’une réussite qui ne rend personne ; « Annuler » refusé par `noRetour` ; l’information du retour retirée par la transition | « Annuler » et l’information (v4.4.4) | B1.1 à B1.4, B1.6 |
| la barre avec une réussite seule (après le tap, après « Annuler », 15 voitures, en anglais) | Un tap et « Annuler », Erreurs et chargement, En anglais | C5.2, C5.10, C11.4, C11.1 |
| la barre en anglais | La barre de messages | C11.1, C11.11 |
| place prise, le message amendé | Un tap et « Annuler » | C5.7 |
| la page en anglais | En anglais | C11.1 |
| en-tête : même jour, deux jours, après minuit, sans retour, `/admin`, en anglais (v4.3) | Début et fin | D1.1 à D1.8 |
| formulaire de création : champs de date, fin avant le début, en anglais (v4.3) | Début et fin | D2.1, D2.2 |
| « Modifier » sans changement : avant « Valider », après (feuille fermée, focus sur le prénom, barre inchangée), hors ligne (v4.4) | « Valider » sans changement | V1.1 à V1.6, V1.8 |
| v4.4.5 : une réussite retenue, puis « Sortir de la voiture » pour la même personne : la barre ne dit rien ; la même suite en échec : la réussite s’écrit | Réussite retenue, et « Modifier la voiture » sans changement (v4.4.5) | S1.1 à S1.5 |
| v4.4.5 : « Modifier la voiture » sans changement : avant « Valider », après (feuille fermée, focus sur « Modifier », barre inchangée) | Réussite retenue, et « Modifier la voiture » sans changement (v4.4.5) | W1.1 à W1.6 |
| v4.4.6 : l’échec hors ligne d’une offre sur les deux legs, avant et après la suppression du retour (réduit à l’aller, rien d’annoncé) ; avec un échec plus récent d’Hugo | Une ligne d’échec réduite à l’aller (v4.4.6) | N1.1 à N1.4 |
| v4.8 : la fiche qui demande un numéro (passagère, deux enfants, un numéro qui suffit, conducteur d’avant, silence pour les autres, hors ligne, 360 px) ; « Ajouter une personne » prérempli, puis changé ; l’aide depuis une place libre ; « Proposer une voiture » avec une nouvelle personne, en erreur, avec une personne de l’appareil sans numéro ; « Modifier » de qui conduit ; en anglais ; le refus du serveur quand le numéro a été vidé ailleurs (v4.8 suite) | Le numéro au bon moment (v4.8) | T1.1 à T5.7 |

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
| `RideForm.otherLeg.drive.retour` | Je ramène aussi des personnes | I bring people back too | revue — v4 ; « des personnes », #649 — v4.5, décision du propriétaire du 26/10 | #90, #649 |
| `RideForm.otherLeg.drive.aller` | J’emmène aussi des personnes | I take people there too | symétrique de la revue — v4 ; « des personnes », #649 — v4.5, décision du propriétaire du 26/10 | #90, #649 |
| `RideForm.otherLeg.hint.retour` | Le retour part du lieu de l’événement, {location}, le {date}. | The return trip leaves {location} on {date}. | nouveau (E1.1) — v4.5 | #649 |
| `RideForm.otherLeg.hint.aller` | L’aller va jusqu’au lieu de l’événement, {location}, le {date}. | The outbound trip goes to {location} on {date}. | nouveau (E1.2) — v4.5 | #649 |
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
| `Sheet.placed` | {names} sont dans la voiture de {driver} | {names} are in {driver}’s car | nouveau (pluriel de C5.2) ; {names} suit la règle des prénoms — v4.2 | #91, #216 |
| `Seat.placed` | {firstName} est dans la voiture de {driver} | {firstName} is in {driver}’s car | C5.2 | #92 |
| `Seat.undo` | Annuler | Undo | revue (WCAG 2.2.1) — v4 | #92 |
| `Seat.undone` | {names} {count, plural, one {n’est plus} other {ne sont plus}} dans la voiture de {driver} | {names} {count, plural, one {is} other {are}} no longer in {driver}’s car | nouveau — v4 ; {names} suit la règle des prénoms — v4.2 | #92, #216 |
| `Seat.alreadyOut` | {names} {count, plural, one {n’était déjà plus} other {n’étaient déjà plus}} dans la voiture de {driver} | {names} {count, plural, one {was} other {were}} already out of {driver}’s car | « Annuler » qui ne rend personne (B1.2, B1.3) — v4.4.4 | #341 |
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
| `Actions.offline` | Action impossible, vérifiez la connexion | Action failed, check your connection | état « hors ligne » ; depuis v4.2, seulement dans une feuille, un formulaire ou une confirmation ouverts ; jamais dans la barre (v4.2.1) | #87 |
| `Actions.failed` | Une erreur est survenue et rien n’a changé. Réessayez dans un instant. | Something went wrong and nothing has changed. Try again in a moment. | état « erreur serveur » ; mêmes usages que `Actions.offline` depuis v4.2 | #87 |
| `Actions.rideGone` | Cette voiture n’est plus proposée | This car is no longer offered | C6.8 | #87 |
| `Actions.alreadyInCar` | {count, plural, one {Cette personne est déjà dans une voiture} other {Une de ces personnes est déjà dans une voiture}} : rien n’a changé. | {count, plural, one {This person is already in a car} other {One of these people is already in a car}}: nothing has changed. | décision « alreadyInCar » de la conception | #87 |
| `Actions.failure` | {notDone} {why} | {notDone} {why} | un échec dans la barre : ce qui n’a pas été fait, puis pourquoi (C11.11) — v4.2 | #216 |
| `Actions.notDone.seats` | {names} {count, plural, one {n’a pas pu monter} other {n’ont pas pu monter}} dans la voiture de {driver}. | {names} could not be seated in {driver}’s car. | un tap, la feuille, première inscription par une place (C5.2, C5.7, C6.4, C11.11) — v4.2 | #216 |
| `Actions.notDone.leave` | {names} {count, plural, one {n’a pas pu sortir} other {n’ont pas pu sortir}} de la voiture de {driver}. | {names} could not leave {driver}’s car. | « Annuler », « Sortir de la voiture » (C5.10, C7.1, C11.11) — v4.2 | #216 |
| `Actions.notDone.choice` | {person} : « {choice} » n’a pas été enregistré. | {person}: “{choice}” was not saved. | « Ne fait pas l’aller / le retour », « Je cherche une place » ; {person} = `DevicePersons.sheetTitle`, {choice} = le libellé du bouton (C3.1, C3.2, C11.11) — v4.2 | #216 |
| `Actions.notDone.addPerson` | {firstName} n’a pas pu rejoindre vos inscriptions. | {firstName} could not be added to your sign-ups. | « Ajouter une personne » (C1.10, C6.6, C11.11) — v4.2 | #216 |
| `Actions.notDone.editPerson` | {fields, select, firstName {Le prénom de {firstName} n’a pas été enregistré.} phone {Le téléphone de {firstName} n’a pas été enregistré.} other {Le prénom et le téléphone de {firstName} n’ont pas été enregistrés.}} | {fields, select, firstName {{firstName}’s first name was not saved.} phone {{firstName}’s phone number was not saved.} other {{firstName}’s first name and phone number were not saved.}} | « Modifier » une personne ; {fields} = les champs envoyés (`firstName`, `phone`, `both`) ; {firstName} = le prénom d’avant (C2.3, C11.11) — v4.2, champs en v4.2.2 | #216 |
| `Actions.notDone.offerRide` | {legs, select, both {Les voitures de {driver} pour l’aller et le retour n’ont pas été proposées.} aller {La voiture de {driver} pour l’aller n’a pas été proposée.} other {La voiture de {driver} pour le retour n’a pas été proposée.}} | {legs, select, both {{driver}’s cars for the outbound and return trips were not offered.} aller {{driver}’s car for the outbound trip was not offered.} other {{driver}’s car for the return trip was not offered.}} | « Proposer une voiture » ; `both` avec « Je ramène aussi des personnes » / « J’emmène aussi des personnes » (C4.1, C4.11, C11.11) — v4.2 | #216 |
| `Actions.notDone.removeRide` | {leg, select, aller {La voiture de {driver} pour l’aller n’a pas été retirée.} other {La voiture de {driver} pour le retour n’a pas été retirée.}} | {leg, select, aller {{driver}’s car for the outbound trip was not removed.} other {{driver}’s car for the return trip was not removed.}} | « Retirer la voiture » (C8.6, C11.11) — v4.2 | #216 |
| `Actions.notDone.editRide` | {leg, select, aller {Les changements de la voiture de {driver} pour l’aller n’ont pas été enregistrés.} other {Les changements de la voiture de {driver} pour le retour n’ont pas été enregistrés.}} | {leg, select, aller {The changes to {driver}’s car for the outbound trip were not saved.} other {The changes to {driver}’s car for the return trip were not saved.}} | « Modifier » la voiture, #93 (C8.2, C11.11) — v4.2 | #216 |
| `Actions.notDone.readDevice` | Vos inscriptions n’ont pas pu être chargées. | Your sign-ups could not be loaded. | « Réessayer » de « Vos inscriptions » (C5.9, C11.11) — v4.2.1 | #216 |
| `Actions.why.offline` | Vérifiez la connexion, puis réessayez. | Check your connection, then try again. | hors ligne : rien n’est parti (= `CreateEvent.failed`, `Admin.failed.body`) — v4.2 | #216 |
| `Actions.why.failed` | Une erreur est survenue : réessayez dans un instant. | Something went wrong: try again in a moment. | erreur serveur, erreur réseau en ligne, `invalid`, `idTaken` — v4.2 | #216 |
| `Actions.why.retryUndo` | {problem, select, offline {Vérifiez la connexion, puis utilisez de nouveau « Annuler ».} other {Une erreur est survenue : dans un instant, utilisez de nouveau « Annuler ».}} | {problem, select, offline {Check your connection, then use “Undo” again.} other {Something went wrong: use “Undo” again in a moment.}} | un « Annuler » hors ligne ou en erreur : la raison nomme le bouton de sa ligne (C5.10) — v4.2.2 | #216 |
| `Actions.why.seatTaken` | Cette place vient d’être prise. | This seat has just been taken. | `seatTaken` (C5.7) ; remplace `Seat.seatTaken` — v4.2 | #216 |
| `Actions.why.notEnoughSeats` | {free, plural, =0 {Il ne reste plus de place.} one {Il ne reste plus qu’une place.} other {Il ne reste plus que # places.}} | {free, plural, =0 {No seats are left.} one {Only one seat is left.} other {Only # seats are left.}} | `notEnoughSeats`, {free} = `freeSeats` (C6.5) — v4.2 | #216 |
| `Actions.why.alreadyInCar` | {count, plural, one {{names} est déjà dans une voiture.} other {Une de ces personnes est déjà dans une voiture.}} | {count, plural, one {{names} is already in a car.} other {One of these people is already in a car.}} | `alreadyInCar` d’un tap ou de la feuille ; {names} et {count} = les personnes envoyées, que la phrase d’avant nomme déjà (décision « alreadyInCar ») — v4.2, prénom en v4.2.1 | #216 |
| `Actions.why.passengerInCar` | {count, plural, one {{names} est déjà dans une voiture.} other {Parmi {names}, une personne au moins est déjà dans une voiture.}} | {count, plural, one {{names} is already in a car.} other {Of {names}, at least one is already in a car.}} | `alreadyInCar` de « Proposer une voiture » ; {names} = les personnes cochées dans « Qui monte avec vous ? » (C4.13) — v4.2.1 | #216 |
| `Actions.why.rideGone` | Cette voiture n’est plus proposée. | This car is no longer offered. | `rideGone` (C6.8) — v4.2 | #216 |
| `Actions.why.drives` | {firstName} conduit {leg, select, aller {à l’aller} other {au retour}}. | {firstName} is driving on the {leg, select, aller {outbound} other {return}} trip. | `drives`, action de cellule — v4.2 | #216 |
| `Actions.why.alreadyDriving` | {driver} conduit déjà une voiture. | {driver} is already driving a car. | `alreadyDriving` (C4.6) — v4.2 | #216 |
| `Actions.why.passengersChanged` | Quelqu’un a pris ou libéré une place entre-temps : modifiez la voiture de nouveau. | Someone took or left a seat in the meantime: edit the car again. | `passengersChanged`, l’étape « qui sort » fermée (C8.5) — v4.2 | #216 |
| `Actions.why.forbidden` | Cet appareil ne peut pas faire ce changement : rechargez la page. | This device cannot make this change: reload the page. | `forbidden` (C2.4, C7.3, C8.1) — v4.2 | #216 |
| `Actions.why.eventNotFound` | Cet événement est introuvable : il a peut-être été supprimé. | This event can no longer be found: it may have been deleted. | `eventNotFound` (mots de `EventNotFound`) — v4.2 | #216 |
| `Actions.names.andOthers` | {first}, {second} et {others, plural, one {# autre} other {# autres}} | {first}, {second} and {others, plural, one {# other} other {# others}} | 4 personnes et plus ; jusqu’à 3, `format.list` (C11.11) — v4.2 | #216 |
| `Actions.messages` | Messages | Messages | nom du groupe `role="group"` de la liste de la barre quand elle défile (C11.4) — v4.2 | #216 |
| `Board.car.addPhoneWhy.passenger` | Ajoutez un numéro pour que {driver} puisse vous joindre. | Add a number so that {driver} can reach you. | fiche, règle 1 — v4.8 | #766 |
| `Board.car.addPhoneWhy.driver` | Ajoutez un numéro pour que les personnes à bord puissent vous joindre. | Add a number so that the people on board can reach you. | fiche, conducteur d’avant la v4.8 (v4.8-3) — v4.8 | #766 |
| `Board.car.addPhone` | Ajouter un numéro | Add a number | texte visible du bouton — v4.8 | #766 |
| `Board.car.addPhoneLabel` | Ajouter un numéro pour {firstName} | Add a number for {firstName} | nom accessible du bouton (v4.8-5) — v4.8 | #766 |
| `PersonForm.samePhone` | Même numéro que {firstName}. Modifiez-le si besoin. | Same number as {firstName}. Change it if needed. | « Ajouter une personne », règle 4 — v4.8 | #766 |
| `PersonForm.phoneHintForSeat` | Pour que {driver} puisse vous joindre. Visible seulement par l’organisateur et par les personnes de la même voiture. | So that {driver} can reach you. Only visible to the organiser and to the people in the same car. | depuis une place libre, règle 5 — v4.8 | #766 |
| `PersonForm.phoneDriving` | Téléphone | Phone | « Modifier » de qui conduit, règle 8 — v4.8 | #766 |
| `PersonForm.phoneHintDriving` | Pour que les personnes à bord puissent vous joindre. Visible seulement par l’organisateur et par les personnes de la même voiture. | So that the people on board can reach you. Only visible to the organiser and to the people in the same car. | règle 8 — v4.8 | #766 |
| `RideForm.phone` | Téléphone | Phone | nouvelle personne qui conduit, règle 6 — v4.8 | #766 |
| `RideForm.driverPhone` | Téléphone de {firstName} | {firstName}’s phone | personne de l’appareil sans numéro, règle 7 — v4.8 | #766 |
| `RideForm.phoneHint` | Pour que les personnes à bord puissent vous joindre. Visible seulement par l’organisateur et par les personnes de la même voiture. | So that the people on board can reach you. Only visible to the organiser and to the people in the same car. | règles 6 et 7 — v4.8 | #766 |
| `FormErrors.driverPhone` | Un numéro est requis pour proposer une voiture. | A number is needed to offer a car. | règles 6 et 7 (v4.8-11) — v4.8 | #766 |
| `FormErrors.phoneWhileDriving` | Un numéro est requis tant que {firstName} conduit. | A number is needed while {firstName} is driving. | règle 8 — v4.8 | #766 |
| `Actions.why.driverWithoutPhone` | Un numéro est requis pour proposer une voiture. | A number is needed to offer a car. | refus `driverWithoutPhone`, règle 7 — v4.8 (suite) | #766 |
| `Actions.why.phoneWhileDriving` | Un numéro est requis tant que {firstName} conduit. | A number is needed while {firstName} is driving. | refus `phoneWhileDriving`, règle 8 — v4.8 (suite) | #766 |

### Chaque échec, mot pour mot (v4.2)

Le texte exact de la barre, pour chaque action du tableau et chaque échec possible
(`Actions.failure` = « {notDone} {why} »). Les exemples sont ceux de l’événement de la
maquette ; les prénoms suivent « Plusieurs prénoms ». Dans une feuille ou un formulaire
ouverts qui ont envoyé, les messages restent ceux de v4.1.

| action (exemple) | échec | texte de la barre, fr | texte de la barre, en | clés | critères |
|---|---|---|---|---|---|
| Un tap sur une place : Tom, voiture de Sophie | hors ligne | Tom n’a pas pu monter dans la voiture de Sophie. Vérifiez la connexion, puis réessayez. | Tom could not be seated in Sophie’s car. Check your connection, then try again. | `Actions.notDone.seats` + `Actions.why.offline` | C5.2, C5.7, C11.11 |
| Un tap sur une place : Tom, voiture de Sophie | erreur serveur (500, réseau), `invalid`, `idTaken` | Tom n’a pas pu monter dans la voiture de Sophie. Une erreur est survenue : réessayez dans un instant. | Tom could not be seated in Sophie’s car. Something went wrong: try again in a moment. | `Actions.notDone.seats` + `Actions.why.failed` | C5.2, C5.7, C11.11 |
| Un tap sur une place : Tom, voiture de Sophie | `seatTaken` | Tom n’a pas pu monter dans la voiture de Sophie. Cette place vient d’être prise. | Tom could not be seated in Sophie’s car. This seat has just been taken. | `Actions.notDone.seats` + `Actions.why.seatTaken` | C5.2, C5.7, C11.11 |
| Un tap sur une place : Tom, voiture de Sophie | `alreadyInCar` | Tom n’a pas pu monter dans la voiture de Sophie. Tom est déjà dans une voiture. | Tom could not be seated in Sophie’s car. Tom is already in a car. | `Actions.notDone.seats` + `Actions.why.alreadyInCar` | C5.2, C5.7, C11.11 |
| Un tap sur une place : Tom, voiture de Sophie | `rideGone` | Tom n’a pas pu monter dans la voiture de Sophie. Cette voiture n’est plus proposée. | Tom could not be seated in Sophie’s car. This car is no longer offered. | `Actions.notDone.seats` + `Actions.why.rideGone` | C5.2, C5.7, C11.11 |
| Un tap sur une place : Tom, voiture de Sophie | `forbidden` | Tom n’a pas pu monter dans la voiture de Sophie. Cet appareil ne peut pas faire ce changement : rechargez la page. | Tom could not be seated in Sophie’s car. This device cannot make this change: reload the page. | `Actions.notDone.seats` + `Actions.why.forbidden` | C5.2, C5.7, C11.11 |
| Un tap sur une place : Tom, voiture de Sophie | `eventNotFound` | Tom n’a pas pu monter dans la voiture de Sophie. Cet événement est introuvable : il a peut-être été supprimé. | Tom could not be seated in Sophie’s car. This event can no longer be found: it may have been deleted. | `Actions.notDone.seats` + `Actions.why.eventNotFound` | C5.2, C5.7, C11.11 |
| La feuille, plusieurs personnes : Tom et Léa, voiture de Sophie | hors ligne | Tom et Léa n’ont pas pu monter dans la voiture de Sophie. Vérifiez la connexion, puis réessayez. | Tom and Léa could not be seated in Sophie’s car. Check your connection, then try again. | `Actions.notDone.seats` + `Actions.why.offline` | C6.4, C6.5, C6.8, C11.11 |
| La feuille, plusieurs personnes : Tom et Léa, voiture de Sophie | erreur serveur (500, réseau), `invalid`, `idTaken` | Tom et Léa n’ont pas pu monter dans la voiture de Sophie. Une erreur est survenue : réessayez dans un instant. | Tom and Léa could not be seated in Sophie’s car. Something went wrong: try again in a moment. | `Actions.notDone.seats` + `Actions.why.failed` | C6.4, C6.5, C6.8, C11.11 |
| La feuille, plusieurs personnes : Tom et Léa, voiture de Sophie | `notEnoughSeats` (`freeSeats: 1`) | Tom et Léa n’ont pas pu monter dans la voiture de Sophie. Il ne reste plus qu’une place. | Tom and Léa could not be seated in Sophie’s car. Only one seat is left. | `Actions.notDone.seats` + `Actions.why.notEnoughSeats` | C6.4, C6.5, C6.8, C11.11 |
| La feuille, plusieurs personnes : Tom et Léa, voiture de Sophie | `alreadyInCar` | Tom et Léa n’ont pas pu monter dans la voiture de Sophie. Une de ces personnes est déjà dans une voiture. | Tom and Léa could not be seated in Sophie’s car. One of these people is already in a car. | `Actions.notDone.seats` + `Actions.why.alreadyInCar` | C6.4, C6.5, C6.8, C11.11 |
| La feuille, plusieurs personnes : Tom et Léa, voiture de Sophie | `rideGone` | Tom et Léa n’ont pas pu monter dans la voiture de Sophie. Cette voiture n’est plus proposée. | Tom and Léa could not be seated in Sophie’s car. This car is no longer offered. | `Actions.notDone.seats` + `Actions.why.rideGone` | C6.4, C6.5, C6.8, C11.11 |
| La feuille, plusieurs personnes : Tom et Léa, voiture de Sophie | `forbidden` | Tom et Léa n’ont pas pu monter dans la voiture de Sophie. Cet appareil ne peut pas faire ce changement : rechargez la page. | Tom and Léa could not be seated in Sophie’s car. This device cannot make this change: reload the page. | `Actions.notDone.seats` + `Actions.why.forbidden` | C6.4, C6.5, C6.8, C11.11 |
| La feuille, plusieurs personnes : Tom et Léa, voiture de Sophie | `eventNotFound` | Tom et Léa n’ont pas pu monter dans la voiture de Sophie. Cet événement est introuvable : il a peut-être été supprimé. | Tom and Léa could not be seated in Sophie’s car. This event can no longer be found: it may have been deleted. | `Actions.notDone.seats` + `Actions.why.eventNotFound` | C6.4, C6.5, C6.8, C11.11 |
| Première inscription depuis une place, inscription faite, place refusée : Inès, voiture de Marc | `seatTaken` | Inès n’a pas pu monter dans la voiture de Marc. Cette place vient d’être prise. | Inès could not be seated in Marc’s car. This seat has just been taken. | `Actions.notDone.seats` + `Actions.why.seatTaken` | C5.4, C11.11 |
| « Annuler » : Tom et Léa, voiture de Sophie | hors ligne | Tom et Léa n’ont pas pu sortir de la voiture de Sophie. Vérifiez la connexion, puis utilisez de nouveau « Annuler ». | Tom and Léa could not leave Sophie’s car. Check your connection, then use “Undo” again. | `Actions.notDone.leave` + `Actions.why.retryUndo` | C5.10, C11.11 |
| « Annuler » : Tom et Léa, voiture de Sophie | erreur serveur (500, réseau), `invalid` | Tom et Léa n’ont pas pu sortir de la voiture de Sophie. Une erreur est survenue : dans un instant, utilisez de nouveau « Annuler ». | Tom and Léa could not leave Sophie’s car. Something went wrong: use “Undo” again in a moment. | `Actions.notDone.leave` + `Actions.why.retryUndo` | C5.10, C11.11 |
| « Annuler » : Tom et Léa, voiture de Sophie | `forbidden` | Tom et Léa n’ont pas pu sortir de la voiture de Sophie. Cet appareil ne peut pas faire ce changement : rechargez la page. | Tom and Léa could not leave Sophie’s car. This device cannot make this change: reload the page. | `Actions.notDone.leave` + `Actions.why.forbidden` | C5.10, C11.11 |
| « Annuler » : Tom et Léa, voiture de Sophie | `eventNotFound` | Tom et Léa n’ont pas pu sortir de la voiture de Sophie. Cet événement est introuvable : il a peut-être été supprimé. | Tom and Léa could not leave Sophie’s car. This event can no longer be found: it may have been deleted. | `Actions.notDone.leave` + `Actions.why.eventNotFound` | C5.10, C11.11 |
| Cellule, « Ne fait pas l’aller » : Tom · Aller | hors ligne | Tom · Aller : « Ne fait pas l’aller » n’a pas été enregistré. Vérifiez la connexion, puis réessayez. | Tom · Outbound: “Not on the outbound trip” was not saved. Check your connection, then try again. | `Actions.notDone.choice` + `Actions.why.offline` | C3.1, C7.2, C11.11 |
| Cellule, « Ne fait pas l’aller » : Tom · Aller | erreur serveur (500, réseau), `invalid`, `idTaken` | Tom · Aller : « Ne fait pas l’aller » n’a pas été enregistré. Une erreur est survenue : réessayez dans un instant. | Tom · Outbound: “Not on the outbound trip” was not saved. Something went wrong: try again in a moment. | `Actions.notDone.choice` + `Actions.why.failed` | C3.1, C7.2, C11.11 |
| Cellule, « Ne fait pas l’aller » : Tom · Aller | `drives` | Tom · Aller : « Ne fait pas l’aller » n’a pas été enregistré. Tom conduit à l’aller. | Tom · Outbound: “Not on the outbound trip” was not saved. Tom is driving on the outbound trip. | `Actions.notDone.choice` + `Actions.why.drives` | C3.1, C7.2, C11.11 |
| Cellule, « Ne fait pas l’aller » : Tom · Aller | `forbidden` | Tom · Aller : « Ne fait pas l’aller » n’a pas été enregistré. Cet appareil ne peut pas faire ce changement : rechargez la page. | Tom · Outbound: “Not on the outbound trip” was not saved. This device cannot make this change: reload the page. | `Actions.notDone.choice` + `Actions.why.forbidden` | C3.1, C7.2, C11.11 |
| Cellule, « Ne fait pas l’aller » : Tom · Aller | `eventNotFound` | Tom · Aller : « Ne fait pas l’aller » n’a pas été enregistré. Cet événement est introuvable : il a peut-être été supprimé. | Tom · Outbound: “Not on the outbound trip” was not saved. This event can no longer be found: it may have been deleted. | `Actions.notDone.choice` + `Actions.why.eventNotFound` | C3.1, C7.2, C11.11 |
| Cellule, « Je cherche une place » : Tom · Retour | hors ligne | Tom · Retour : « Je cherche une place » n’a pas été enregistré. Vérifiez la connexion, puis réessayez. | Tom · Return: “I need a seat” was not saved. Check your connection, then try again. | `Actions.notDone.choice` + `Actions.why.offline` | C3.2, C11.11 |
| Cellule, « Je cherche une place » : Tom · Retour | erreur serveur (500, réseau), `invalid`, `idTaken` | Tom · Retour : « Je cherche une place » n’a pas été enregistré. Une erreur est survenue : réessayez dans un instant. | Tom · Return: “I need a seat” was not saved. Something went wrong: try again in a moment. | `Actions.notDone.choice` + `Actions.why.failed` | C3.2, C11.11 |
| Cellule, « Je cherche une place » : Tom · Retour | `drives` | Tom · Retour : « Je cherche une place » n’a pas été enregistré. Tom conduit au retour. | Tom · Return: “I need a seat” was not saved. Tom is driving on the return trip. | `Actions.notDone.choice` + `Actions.why.drives` | C3.2, C11.11 |
| Cellule, « Je cherche une place » : Tom · Retour | `forbidden` | Tom · Retour : « Je cherche une place » n’a pas été enregistré. Cet appareil ne peut pas faire ce changement : rechargez la page. | Tom · Return: “I need a seat” was not saved. This device cannot make this change: reload the page. | `Actions.notDone.choice` + `Actions.why.forbidden` | C3.2, C11.11 |
| Cellule, « Je cherche une place » : Tom · Retour | `eventNotFound` | Tom · Retour : « Je cherche une place » n’a pas été enregistré. Cet événement est introuvable : il a peut-être été supprimé. | Tom · Return: “I need a seat” was not saved. This event can no longer be found: it may have been deleted. | `Actions.notDone.choice` + `Actions.why.eventNotFound` | C3.2, C11.11 |
| Cellule, « Sortir de la voiture » : Léa, voiture de Claire | hors ligne | Léa n’a pas pu sortir de la voiture de Claire. Vérifiez la connexion, puis réessayez. | Léa could not leave Claire’s car. Check your connection, then try again. | `Actions.notDone.leave` + `Actions.why.offline` | C7.1, C11.11 |
| Cellule, « Sortir de la voiture » : Léa, voiture de Claire | erreur serveur (500, réseau), `invalid`, `idTaken` | Léa n’a pas pu sortir de la voiture de Claire. Une erreur est survenue : réessayez dans un instant. | Léa could not leave Claire’s car. Something went wrong: try again in a moment. | `Actions.notDone.leave` + `Actions.why.failed` | C7.1, C11.11 |
| Cellule, « Sortir de la voiture » : Léa, voiture de Claire | `drives` | Léa n’a pas pu sortir de la voiture de Claire. Léa conduit à l’aller. | Léa could not leave Claire’s car. Léa is driving on the outbound trip. | `Actions.notDone.leave` + `Actions.why.drives` | C7.1, C11.11 |
| Cellule, « Sortir de la voiture » : Léa, voiture de Claire | `forbidden` | Léa n’a pas pu sortir de la voiture de Claire. Cet appareil ne peut pas faire ce changement : rechargez la page. | Léa could not leave Claire’s car. This device cannot make this change: reload the page. | `Actions.notDone.leave` + `Actions.why.forbidden` | C7.1, C11.11 |
| Cellule, « Sortir de la voiture » : Léa, voiture de Claire | `eventNotFound` | Léa n’a pas pu sortir de la voiture de Claire. Cet événement est introuvable : il a peut-être été supprimé. | Léa could not leave Claire’s car. This event can no longer be found: it may have been deleted. | `Actions.notDone.leave` + `Actions.why.eventNotFound` | C7.1, C11.11 |
| « Ajouter une personne » : Inès | hors ligne | Inès n’a pas pu rejoindre vos inscriptions. Vérifiez la connexion, puis réessayez. | Inès could not be added to your sign-ups. Check your connection, then try again. | `Actions.notDone.addPerson` + `Actions.why.offline` | C1.10, C2.1, C6.6, C11.11 |
| « Ajouter une personne » : Inès | erreur serveur (500, réseau), `invalid`, `idTaken` | Inès n’a pas pu rejoindre vos inscriptions. Une erreur est survenue : réessayez dans un instant. | Inès could not be added to your sign-ups. Something went wrong: try again in a moment. | `Actions.notDone.addPerson` + `Actions.why.failed` | C1.10, C2.1, C6.6, C11.11 |
| « Ajouter une personne » : Inès | `forbidden` | Inès n’a pas pu rejoindre vos inscriptions. Cet appareil ne peut pas faire ce changement : rechargez la page. | Inès could not be added to your sign-ups. This device cannot make this change: reload the page. | `Actions.notDone.addPerson` + `Actions.why.forbidden` | C1.10, C2.1, C6.6, C11.11 |
| « Ajouter une personne » : Inès | `eventNotFound` | Inès n’a pas pu rejoindre vos inscriptions. Cet événement est introuvable : il a peut-être été supprimé. | Inès could not be added to your sign-ups. This event can no longer be found: it may have been deleted. | `Actions.notDone.addPerson` + `Actions.why.eventNotFound` | C1.10, C2.1, C6.6, C11.11 |
| « Modifier » une personne, prénom et téléphone : Tom (prénom affiché avant le changement) | hors ligne | Le prénom et le téléphone de Tom n’ont pas été enregistrés. Vérifiez la connexion, puis réessayez. | Tom’s first name and phone number were not saved. Check your connection, then try again. | `Actions.notDone.editPerson` + `Actions.why.offline` | C2.3, C11.11 |
| « Modifier » une personne, prénom et téléphone : Tom (prénom affiché avant le changement) | erreur serveur (500, réseau), `invalid`, `idTaken` | Le prénom et le téléphone de Tom n’ont pas été enregistrés. Une erreur est survenue : réessayez dans un instant. | Tom’s first name and phone number were not saved. Something went wrong: try again in a moment. | `Actions.notDone.editPerson` + `Actions.why.failed` | C2.3, C11.11 |
| « Modifier » une personne, prénom et téléphone : Tom (prénom affiché avant le changement) | `forbidden` | Le prénom et le téléphone de Tom n’ont pas été enregistrés. Cet appareil ne peut pas faire ce changement : rechargez la page. | Tom’s first name and phone number were not saved. This device cannot make this change: reload the page. | `Actions.notDone.editPerson` + `Actions.why.forbidden` | C2.3, C11.11 |
| « Modifier » une personne, prénom et téléphone : Tom (prénom affiché avant le changement) | `eventNotFound` | Le prénom et le téléphone de Tom n’ont pas été enregistrés. Cet événement est introuvable : il a peut-être été supprimé. | Tom’s first name and phone number were not saved. This event can no longer be found: it may have been deleted. | `Actions.notDone.editPerson` + `Actions.why.eventNotFound` | C2.3, C11.11 |
| « Modifier » une personne, le téléphone seul : Tom | hors ligne | Le téléphone de Tom n’a pas été enregistré. Vérifiez la connexion, puis réessayez. | Tom’s phone number was not saved. Check your connection, then try again. | `Actions.notDone.editPerson` + `Actions.why.offline` | C2.3, C11.11 |
| « Modifier » une personne, le téléphone seul : Tom | erreur serveur (500, réseau), `invalid`, `idTaken` | Le téléphone de Tom n’a pas été enregistré. Une erreur est survenue : réessayez dans un instant. | Tom’s phone number was not saved. Something went wrong: try again in a moment. | `Actions.notDone.editPerson` + `Actions.why.failed` | C2.3, C11.11 |
| « Proposer une voiture », ce leg seulement : Marc, aller | hors ligne | La voiture de Marc pour l’aller n’a pas été proposée. Vérifiez la connexion, puis réessayez. | Marc’s car for the outbound trip was not offered. Check your connection, then try again. | `Actions.notDone.offerRide` + `Actions.why.offline` | C4.1, C4.6, C4.13, C11.11 |
| « Proposer une voiture », ce leg seulement : Marc, aller | erreur serveur (500, réseau), `invalid`, `idTaken` | La voiture de Marc pour l’aller n’a pas été proposée. Une erreur est survenue : réessayez dans un instant. | Marc’s car for the outbound trip was not offered. Something went wrong: try again in a moment. | `Actions.notDone.offerRide` + `Actions.why.failed` | C4.1, C4.6, C4.13, C11.11 |
| « Proposer une voiture », ce leg seulement : Marc, aller | `alreadyDriving` | La voiture de Marc pour l’aller n’a pas été proposée. Marc conduit déjà une voiture. | Marc’s car for the outbound trip was not offered. Marc is already driving a car. | `Actions.notDone.offerRide` + `Actions.why.alreadyDriving` | C4.1, C4.6, C4.13, C11.11 |
| « Proposer une voiture », ce leg seulement : Marc, aller | `alreadyInCar` (passagers cochés) | La voiture de Marc pour l’aller n’a pas été proposée. Parmi Inès et Hugo, une personne au moins est déjà dans une voiture. | Marc’s car for the outbound trip was not offered. Of Inès and Hugo, at least one is already in a car. | `Actions.notDone.offerRide` + `Actions.why.passengerInCar` | C4.1, C4.6, C4.13, C11.11 |
| « Proposer une voiture », ce leg seulement : Marc, aller | `forbidden` | La voiture de Marc pour l’aller n’a pas été proposée. Cet appareil ne peut pas faire ce changement : rechargez la page. | Marc’s car for the outbound trip was not offered. This device cannot make this change: reload the page. | `Actions.notDone.offerRide` + `Actions.why.forbidden` | C4.1, C4.6, C4.13, C11.11 |
| « Proposer une voiture », ce leg seulement : Marc, aller | `eventNotFound` | La voiture de Marc pour l’aller n’a pas été proposée. Cet événement est introuvable : il a peut-être été supprimé. | Marc’s car for the outbound trip was not offered. This event can no longer be found: it may have been deleted. | `Actions.notDone.offerRide` + `Actions.why.eventNotFound` | C4.1, C4.6, C4.13, C11.11 |
| « Proposer une voiture » avec « Je ramène aussi des personnes » : Claire | hors ligne | Les voitures de Claire pour l’aller et le retour n’ont pas été proposées. Vérifiez la connexion, puis réessayez. | Claire’s cars for the outbound and return trips were not offered. Check your connection, then try again. | `Actions.notDone.offerRide` + `Actions.why.offline` | C4.11, C4.12, C4.13, C11.11 |
| « Proposer une voiture » avec « Je ramène aussi des personnes » : Claire | erreur serveur (500, réseau), `invalid`, `idTaken` | Les voitures de Claire pour l’aller et le retour n’ont pas été proposées. Une erreur est survenue : réessayez dans un instant. | Claire’s cars for the outbound and return trips were not offered. Something went wrong: try again in a moment. | `Actions.notDone.offerRide` + `Actions.why.failed` | C4.11, C4.12, C4.13, C11.11 |
| « Proposer une voiture » avec « Je ramène aussi des personnes » : Claire | `alreadyDriving` | Les voitures de Claire pour l’aller et le retour n’ont pas été proposées. Claire conduit déjà une voiture. | Claire’s cars for the outbound and return trips were not offered. Claire is already driving a car. | `Actions.notDone.offerRide` + `Actions.why.alreadyDriving` | C4.11, C4.12, C4.13, C11.11 |
| « Proposer une voiture » avec « Je ramène aussi des personnes » : Claire | `alreadyInCar` (passagers cochés) | Les voitures de Claire pour l’aller et le retour n’ont pas été proposées. Léa est déjà dans une voiture. | Claire’s cars for the outbound and return trips were not offered. Léa is already in a car. | `Actions.notDone.offerRide` + `Actions.why.passengerInCar` | C4.11, C4.12, C4.13, C11.11 |
| « Proposer une voiture » avec « Je ramène aussi des personnes » : Claire | `forbidden` | Les voitures de Claire pour l’aller et le retour n’ont pas été proposées. Cet appareil ne peut pas faire ce changement : rechargez la page. | Claire’s cars for the outbound and return trips were not offered. This device cannot make this change: reload the page. | `Actions.notDone.offerRide` + `Actions.why.forbidden` | C4.11, C4.12, C4.13, C11.11 |
| « Proposer une voiture » avec « Je ramène aussi des personnes » : Claire | `eventNotFound` | Les voitures de Claire pour l’aller et le retour n’ont pas été proposées. Cet événement est introuvable : il a peut-être été supprimé. | Claire’s cars for the outbound and return trips were not offered. This event can no longer be found: it may have been deleted. | `Actions.notDone.offerRide` + `Actions.why.eventNotFound` | C4.11, C4.12, C4.13, C11.11 |
| « Réessayer » de « Vos inscriptions » | hors ligne | Vos inscriptions n’ont pas pu être chargées. Vérifiez la connexion, puis réessayez. | Your sign-ups could not be loaded. Check your connection, then try again. | `Actions.notDone.readDevice` + `Actions.why.offline` | C5.9, C11.11 |
| « Réessayer » de « Vos inscriptions » | erreur serveur (500, réseau), `invalid`, `idTaken` | Vos inscriptions n’ont pas pu être chargées. Une erreur est survenue : réessayez dans un instant. | Your sign-ups could not be loaded. Something went wrong: try again in a moment. | `Actions.notDone.readDevice` + `Actions.why.failed` | C5.9, C11.11 |
| « Retirer la voiture » : Claire, aller | hors ligne | La voiture de Claire pour l’aller n’a pas été retirée. Vérifiez la connexion, puis réessayez. | Claire’s car for the outbound trip was not removed. Check your connection, then try again. | `Actions.notDone.removeRide` + `Actions.why.offline` | C8.6, C11.11 |
| « Retirer la voiture » : Claire, aller | erreur serveur (500, réseau), `invalid`, `idTaken` | La voiture de Claire pour l’aller n’a pas été retirée. Une erreur est survenue : réessayez dans un instant. | Claire’s car for the outbound trip was not removed. Something went wrong: try again in a moment. | `Actions.notDone.removeRide` + `Actions.why.failed` | C8.6, C11.11 |
| « Retirer la voiture » : Claire, aller | `forbidden` | La voiture de Claire pour l’aller n’a pas été retirée. Cet appareil ne peut pas faire ce changement : rechargez la page. | Claire’s car for the outbound trip was not removed. This device cannot make this change: reload the page. | `Actions.notDone.removeRide` + `Actions.why.forbidden` | C8.6, C11.11 |
| « Retirer la voiture » : Claire, aller | `eventNotFound` | La voiture de Claire pour l’aller n’a pas été retirée. Cet événement est introuvable : il a peut-être été supprimé. | Claire’s car for the outbound trip was not removed. This event can no longer be found: it may have been deleted. | `Actions.notDone.removeRide` + `Actions.why.eventNotFound` | C8.6, C11.11 |
| « Modifier » la voiture (#93) : Claire, aller | hors ligne | Les changements de la voiture de Claire pour l’aller n’ont pas été enregistrés. Vérifiez la connexion, puis réessayez. | The changes to Claire’s car for the outbound trip were not saved. Check your connection, then try again. | `Actions.notDone.editRide` + `Actions.why.offline` | C8.2, C8.5, C11.11 |
| « Modifier » la voiture (#93) : Claire, aller | erreur serveur (500, réseau), `invalid`, `idTaken` | Les changements de la voiture de Claire pour l’aller n’ont pas été enregistrés. Une erreur est survenue : réessayez dans un instant. | The changes to Claire’s car for the outbound trip were not saved. Something went wrong: try again in a moment. | `Actions.notDone.editRide` + `Actions.why.failed` | C8.2, C8.5, C11.11 |
| « Modifier » la voiture (#93) : Claire, aller | `rideGone` | Les changements de la voiture de Claire pour l’aller n’ont pas été enregistrés. Cette voiture n’est plus proposée. | The changes to Claire’s car for the outbound trip were not saved. This car is no longer offered. | `Actions.notDone.editRide` + `Actions.why.rideGone` | C8.2, C8.5, C11.11 |
| « Modifier » la voiture (#93) : Claire, aller | `passengersChanged` | Les changements de la voiture de Claire pour l’aller n’ont pas été enregistrés. Quelqu’un a pris ou libéré une place entre-temps : modifiez la voiture de nouveau. | The changes to Claire’s car for the outbound trip were not saved. Someone took or left a seat in the meantime: edit the car again. | `Actions.notDone.editRide` + `Actions.why.passengersChanged` | C8.2, C8.5, C11.11 |
| « Modifier » la voiture (#93) : Claire, aller | `forbidden` | Les changements de la voiture de Claire pour l’aller n’ont pas été enregistrés. Cet appareil ne peut pas faire ce changement : rechargez la page. | The changes to Claire’s car for the outbound trip were not saved. This device cannot make this change: reload the page. | `Actions.notDone.editRide` + `Actions.why.forbidden` | C8.2, C8.5, C11.11 |
| « Modifier » la voiture (#93) : Claire, aller | `eventNotFound` | Les changements de la voiture de Claire pour l’aller n’ont pas été enregistrés. Cet événement est introuvable : il a peut-être été supprimé. | The changes to Claire’s car for the outbound trip were not saved. This event can no longer be found: it may have been deleted. | `Actions.notDone.editRide` + `Actions.why.eventNotFound` | C8.2, C8.5, C11.11 |
| « Proposer une voiture » : Claire, personne de l’appareil, son numéro vidé ailleurs (v4.8) | `driverWithoutPhone` | La voiture de Claire pour l’aller n’a pas été proposée. Un numéro est requis pour proposer une voiture. | Claire’s car for the outbound trip was not offered. A number is needed to offer a car. | `Actions.notDone.offerRide` + `Actions.why.driverWithoutPhone` | T4.8 |
| « Modifier » une personne, le téléphone seul, vidé : Claire, qui conduit (v4.8) | `phoneWhileDriving` | Le téléphone de Claire n’a pas été enregistré. Un numéro est requis tant que Claire conduit. | Claire’s phone number was not saved. A number is needed while Claire is driving. | `Actions.notDone.editPerson` + `Actions.why.phoneWhileDriving` | T5.7 |

### Clés nouvelles en v4.2

`Actions.failure`, `Actions.notDone.seats`, `Actions.notDone.leave`, `Actions.notDone.choice`, `Actions.notDone.addPerson`, `Actions.notDone.editPerson`, `Actions.notDone.offerRide`, `Actions.notDone.removeRide`, `Actions.notDone.editRide`, `Actions.notDone.readDevice`, `Actions.why.offline`, `Actions.why.failed`, `Actions.why.retryUndo`, `Actions.why.seatTaken`, `Actions.why.notEnoughSeats`, `Actions.why.alreadyInCar`, `Actions.why.passengerInCar`, `Actions.why.rideGone`, `Actions.why.drives`, `Actions.why.alreadyDriving`, `Actions.why.passengersChanged`, `Actions.why.forbidden`, `Actions.why.eventNotFound`, `Actions.names.andOthers`, `Actions.messages`. En v4.2.1 : `Actions.notDone.readDevice` et `Actions.why.passengerInCar` ; `Actions.why.alreadyInCar` nomme la personne d’un tap. En v4.2.2 : `Actions.why.retryUndo` ; `Actions.notDone.editPerson` nomme les champs envoyés.

### Clés retirées en v4.2

`Seat.seatTaken`, remplacée par `Actions.notDone.seats` suivi de `Actions.why.seatTaken`
(« Tom n’a pas pu monter dans la voiture de Marc. Cette place vient d’être prise. »). Changées
en v4.2 : `Sheet.placed` et `Seat.undone` gardent leur texte, mais `{names}` suit la règle des
prénoms (au-delà de trois, « Tom, Léa et 2 autres »).

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

v4-9. Décision : « Je ramène aussi des personnes » déplie le lieu (prérempli, qui suit le lieu de ce leg
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

v4.2-1. Décision : la barre porte ensemble la dernière réussite et tous les échecs en attente, les échecs en haut. — Raison : option (a) de #216 ; un échec est ce qui demande d’agir.

v4.2-2. Décision : un échec ne retire pas la réussite affichée. — Raison : sinon, le défaut de #216 revient dans l’autre ordre d’arrivée (la réussite d’Hugo, puis l’échec pour Sophie). Après un « Annuler » qui échoue, le placement tient, et « Annuler » reste utile.

v4.2-3. Décision : une seule croix « Fermer » pour toute la barre ; elle, ou Échap, retire tous les messages. — Raison : la barre unique de v3 (« Fermer », Échap) ; une seule cible de 44 px ; fermer est un geste fait après avoir lu.

v4.2-4. Décision : un échec dit l’envoi au passé (« n’a pas pu », « n’a pas été »), puis la raison et quoi faire. — Raison : il reste vrai quand l’état change ailleurs, puisqu’il ne part que par un envoi sur le même sujet ou par « Fermer ».

v4.2-5. Décision : « n’ont pas pu monter » au lieu de l’exemple de #216, « n’ont pas été placés ». — Raison : C11.9 (D7) : aucun texte ne s’accorde au genre (« Léa n’a pas été placée »).

v4.2-6. Décision : le sujet d’« Ajouter une personne » est le prénom envoyé ; celui de « Proposer une voiture », le leg et la personne qui conduit ; ce n’est plus la feuille. — Raison : une feuille rouverte est une nouvelle feuille, et le renvoi ne retirerait jamais l’échec.

v4.2-7. Décision : pour une action de cellule, le message reprend le titre de la feuille et le libellé du bouton, mot pour mot ; « Sortir de la voiture » nomme la voiture. — Raison : ce sont les mots que la personne a touchés.

v4.2-8. Décision : trois prénoms au plus, puis « et N autres », dans l’ordre de « Vos inscriptions », pour les échecs comme pour les réussites. — Raison : à 360 px, un quatrième prénom ajoute une ligne avant même le verbe ; la matrice dit qui.

v4.2-9. Décision : la liste de la barre s’arrête à 40 % de la hauteur et défile au-delà. Aucun échec n’est retiré pour faire de la place, et l’espace réservé en bas suit la hauteur mesurée. — Raison : option (a) : seuls un envoi sur le même sujet ou « Fermer » retirent un échec.

v4.2-10. Décision : aucune écriture dans l’autre région vivante, et un deuxième échec ne fait pas relire le premier. — Raison : sans cela, une réussite réécrirait l’échec. (Amendée en v4.2.1 : des régions d’annonce, v4.2.1-6, au lieu d’`aria-atomic="false"`.)

v4.2-11. Décision : les messages d’une feuille, d’un formulaire ou d’une confirmation ouverts restent génériques. — Raison : leur titre dit déjà ce qui n’a pas été fait ; #216 porte sur la barre. (Amendée en v4.2.1 : « Réessayer » n’est plus une exception dans la barre, décision de la revue.)

v4.2-12. Décision : `Seat.seatTaken` est retirée, remplacée par `Actions.notDone.seats` suivi de `Actions.why.seatTaken`. — Raison : une place prise est un échec comme les autres, et le message dit désormais qui n’est pas monté.

v4.2.1-1. Décision : à la fermeture, le focus va au repère du message le plus récent seulement s’il est affiché (onglet actif, section dépliée), sinon à celui du message d’avant en remontant tous les messages, puis à l’onglet actif ; la fermeture ne change jamais d’onglet. — Raison : les panneaux de leg sont toujours montés (`forceMount`) ; `focus()` sur un repère de l’autre onglet ne fait rien, et le focus tombait sur `<body>` (revue, bloquant 1). Changer d’onglet à la fermeture déplacerait la page sous les yeux de la personne qui ferme un message.

v4.2.1-2. Décision : chaque message a son repère, dans une table, y compris « Ajouter une personne », « Proposer une voiture » et « Réessayer ». — Raison : revue, bloquant 2.

v4.2.1-3. Décision : chaque ligne de la table des sujets a un test « retire » et un test « ne retire pas ». — Raison : revue, bloquant 3 ; le test « retire » d’« Ajouter » et de « Proposer » échoue avec le sujet par défaut de `useSends`.

v4.2.1-4. Décision : `alreadyInCar` nomme qui. Pour « Proposer une voiture », `Actions.why.passengerInCar` nomme les personnes cochées. Pour un tap, la personne : « Tom est déjà dans une voiture. » — Raison : revue, bloquant 4 et suggestion ; « cette personne » se lisait comme qui conduit.

v4.2.1-5. Décision : « Réessayer » nomme ce qui n’a pas été fait : « Vos inscriptions n’ont pas pu être chargées. » (`Actions.notDone.readDevice`), suivi de la raison. — Raison : revue, bloquant 5 : l’option (a) ne souffre pas d’exception dans la barre.

v4.2.1-6. Décision : la liste visible n’est pas vivante. Deux régions masquées visuellement annoncent, et ne contiennent que le message à annoncer : le dernier échec pour `alert`, la réussite pour `status`. Un même texte est vidé puis réécrit 100 ms plus tard. — Raison : suggestion de la revue, retenue comme conception plutôt que comme repli. TalkBack, et VoiceOver dans certains cas, relisent toute une région qui change, quel que soit `aria-atomic` : une région qui ne contient que le nouveau message se lit de la même façon partout.

v4.2.1-7. Décision : un « Annuler » qui échoue porte son propre « Annuler », que la réussite perd tant que l’échec est là. Il reste si une réussite ultérieure remplace celle du placement. — Raison : suggestion de la revue ; « réessayez » désigne toujours un bouton présent.

v4.2.1-8. Décision : des sujets séparés pour une place et pour « Annuler » (`seats:` / `undo:`), et pour « Modifier » et « Retirer la voiture » (`ride:{id}:edit` / `ride:{id}`). — Raison : suggestion de la revue ; aucun ne retire l’échec de l’autre, comme PR #218 et #213.

v4.2.1-9. Décision : la liste est un `role="group"` nommé « Messages », plafonnée à `40dvh`. Un nouvel échec la ramène en haut, et une nouvelle réussite défile en vue. L’espace réservé compte le `1rem` de la page et `env(safe-area-inset-bottom)`. — Raison : suggestions de la revue ; un nouvel échec doit se voir là où il s’affiche.

v4.2.1-10. Décision : « plus récent » se mesure au moment où le message est écrit dans la barre. — Raison : suggestion de la revue ; c’est l’ordre que la personne voit arriver.

v4.2.1-11. Décision : « modifiez la voiture de nouveau » / « edit the car again » ; « could not be seated in {driver}’s car » ; « No seats are left. » — Raison : suggestions de la revue.

v4.2.1-12. Décision : « Place prise entre-temps » et « Hors ligne sur la page » sont redessinées avec la barre de v4.2. — Raison : suggestion de la revue, cohérence.

v4.2.2-1. Décision : une seule règle de sortie du focus. Quand l’élément de la barre qui a le focus disparaît, quelle qu’en soit la raison (« Fermer », Échap, l’« Annuler » d’un échec envoyé, une réponse tardive qui remplace la réussite, une action sans message qui vide la barre), le focus va au premier repère affiché : celui du message de cet élément, puis ceux des autres messages, du plus récent au plus ancien, puis l’onglet actif, puis le titre de l’événement. — Raison : revue, bloquant 1 ; la règle ne couvrait que « Fermer » et Échap, et quatre chemins menaient à `<body>`.

v4.2.2-2. Décision : après un « Annuler » réussi, le focus va au titre de la carte s’il est affiché, sinon il suit la règle de sortie. — Raison : revue, bloquant 1 ; l’onglet a pu changer depuis le placement.

v4.2.2-3. Décision : pendant l’envoi d’un « Annuler », aucun « Annuler » n’est affiché pour ce placement. — Raison : revue, bloquant 1 ; un seul envoi à la fois pour un placement, et rien à toucher qui enverrait deux fois.

v4.2.2-4. Décision : chaque écriture dans une région d’annonce la vide aussitôt, puis écrit le texte 100 ms plus tard. Une écriture plus récente, le vidage de la région ou « Fermer » / Échap annulent l’écriture en attente. On ne compare pas les textes. — Raison : revue, bloquant 2. Puisque toute écriture passe par « vide, puis texte » dans une tâche ultérieure, le DOM change toujours, même texte compris, et même quand le vidage et le nouvel échec tombent dans le même rendu (un renvoi hors ligne). Comparer au dernier texte écrit devient inutile : la règle « toujours » couvre ce cas.

v4.2.2-5. Décision : un message qui ne vient d’aucun envoi est une information (aujourd’hui, « Aucune place libre… »). Il ne retire ni une réussite, ni son « Annuler », ni un échec. Il remplace l’information d’avant, part à la fin de l’action suivante ou par « Fermer » / Échap, et s’annonce dans la région `status`. « Trouver une place » qui trouve une place n’écrit rien dans la barre. — Raison : revue, bloquant 3, avec la préférence du relecteur, la plus proche de l’option (a).

v4.2.2-6. Décision : la raison d’un « Annuler » qui échoue nomme le bouton : « Vérifiez la connexion, puis utilisez de nouveau « Annuler ». » (`Actions.why.retryUndo`, d’après « utilisez de nouveau « Actualiser » » de l’espace organisateur). — Raison : suggestion de la revue ; « réessayez » à côté d’un bouton « Annuler » pouvait se lire « fermer ce message ».

v4.2.2-7. Décision : l’échec de « Modifier » une personne nomme les champs envoyés : « Le prénom de Tom… », « Le téléphone de Tom… », « Le prénom et le téléphone de Tom… ». — Raison : suggestion de la revue ; un renvoi partiel donnait deux lignes identiques.

v4.2.2-8. Décision : le sujet de « Proposer une voiture » est chaque leg de l’offre, et qui conduit. — Raison : suggestion de la revue ; une offre sur les deux legs refaite depuis l’autre onglet couvre les deux legs et retire l’échec, ce qu’une offre d’un seul leg ne fait pas.

v4.2.2-9. Décision : les cinq maquettes qui gardaient la barre de v4 sont redessinées, dont une barre avec une réussite seule ; « Aucune place libre » montre l’information au-dessus de la réussite de Tom et de son « Annuler ». — Raison : suggestion de la revue, cohérence.

v4.2.2-10. Décision : le repère de « Réessayer » est le bouton de la section tant que « Vos inscriptions » est en échec ; le contrôle manuel couvre la double lecture en mode navigation (la liste, puis la région masquée). — Raison : suggestions de la revue. La double lecture est le prix des régions d’annonce : elles sont placées après « Fermer », pour que la liste se lise d’abord.

### Nouvelles en v4.3 (début et fin, #235)

v4.3-1. Décision : l’en-tête dit « Début » et « Fin » (« Start », « End »), des noms, comme les autres libellés de l’écran. — Raison : ce sont les mots demandés par le propriétaire. « Commence » / « Se termine » sont des verbes, plus longs, et l’anglais n’a pas d’équivalent aussi court.

v4.3-2. Décision : le même jour, la fin ne montre que son heure ; un autre jour, sa date et son heure complètes. Deux lignes dans tous les cas. — Raison : cela garde les mots demandés et une seule structure. Une ligne « samedi 12 décembre 2026, de 07:30 à 18:00 » ferait disparaître « Début » et « Fin » dans le cas le plus courant, et demanderait une phrase de plus à traduire.

v4.3-3. Décision : « même jour » se compare sur l’heure murale, pas dans le fuseau du navigateur. — Raison : C1.12, tout le monde lit l’heure du lieu.

v4.3-4. Décision : les onglets, la matrice, les sections organisateur et « Proposer une voiture » gardent « Aller » et « Retour ». — Raison : ce sont des legs (glossaire), et seul l’en-tête parle de l’événement. L’en-tête ne contient plus aucun nom de leg, ce qui le distingue des onglets juste dessous.

v4.3-5. Décision : la fin n’existe qu’avec un retour ; sans retour, la seule ligne est « Début ». — Raison : rien de stocké ne change. `retour_at` est à la fois la fin et l’heure du retour, et il est vide sans retour.

v4.3-6. Décision du propriétaire, le 20/10 (#235) : le formulaire de création dit aussi « Date de début », « Heure de début », « Date de fin », « Heure de fin », et l’erreur « La fin doit être après le début. » (option (a)). — Raison : sinon, une même valeur serait saisie « Heure de l’aller » et lue « Début », deux noms pour une chose (glossaire : « un synonyme est un défaut »).

### Nouvelles en v4.4 (« Valider » sans changement, #298)

v4.4-1. Décision : « Valider » sans aucun champ changé ferme le formulaire « Modifier {prénom} » et n’envoie rien. — Raison : piste recommandée par #298, et règle déjà fixée pour « Modifier l’événement » (organizer-view v3.3, M2.5). Un envoi vide ne change rien en base, et son échec nommait des champs qui ne partaient pas.

v4.4-2. Décision : un champ est changé quand sa valeur diffère, caractère pour caractère, de celle que le formulaire montrait à son ouverture, sans retirer les espaces. — Raison : c’est la comparaison que fait déjà `person-form.tsx`, et la définition de organizer-view (« différente de la valeur chargée »). Une espace ajoutée part, et le serveur enregistre le prénom sans elle : l’effet est nul, et une règle de nettoyage propre à ce formulaire ferait deux définitions de « changé » dans l’application.

v4.4-3. Décision : rien n’est dit, ni « Rien n’a changé » ni autre chose. — Raison : la feuille qui se ferme suffit, comme pour « Fermer » ; organizer-view a fait le même choix (« aucun message dans la barre »). Un message ajouterait une ligne à la barre, qui en garde déjà plusieurs (v4.2), pour ne rien dire.

v4.4-4. Décision : la règle 5 de la barre écrit ce que fait un retrait de voiture réussi : il retire tous les messages sur cette voiture, échecs compris. — Raison : c’est la décision du propriétaire sur #221, construite dans PR #255. Le README disait « Rien d’autre ne le retire », ce qui n’était plus vrai (noté sur #216).

v4.4.2-1. Décision : l’information (« Aucune place libre… ») n’est retirée qu’à la fin d’une action commencée **après** elle (règle 4). La réussite ou l’échec d’une action commencée avant elle la laisse en place (règles 2 et 3). Cas accepté : une action lente, commencée avant, libère une place, et l’information reste alors qu’elle est devenue fausse. — Raison : décision du propriétaire sur PR #339 (« Trouver une place », #172). Sinon, l’information peut disparaître presque aussitôt, sans être annoncée. Les règles 2 et 3 contredisaient la règle 4 et C11.10. Précise la décision v4.2.2-5 (« part à la fin de l’action suivante »).

v4.4-5. Décision : jusqu’à trois prénoms, le texte est celui de `format.list` : « Tom, Léa, and Hugo » en anglais. `Actions.names.andOthers` garde « Tom, Léa and 2 others ». — Raison : #280 ; le README écrivait « Tom, Léa and Hugo », que `format.list` ne produit pas en `en`. La clé `andOthers` est un texte écrit, hors de cette correction : la changer serait un changement de mots, que rien n’a demandé.

### Nouvelles en v4.4.4 (« Annuler » et l’information, #341)

v4.4.4-1. Décision : la réussite d’un « Annuler » renvoyé depuis une ligne d’échec remplace la réussite affichée, même celle d’un placement plus récent, et son « Annuler » avec elle. — Raison : la barre garde une réussite, la dernière (règle 1). Garder deux « Annuler » demanderait deux réussites, contre la décision de #216. Le placement plus récent se défait toujours depuis sa cellule.

v4.4.4-2. Décision : un « Annuler » qui ne rend personne le dit (`Seat.alreadyOut`), au lieu de vider la barre, qu’il vienne d’une réussite ou d’un échec. — Raison : sans un mot, la ligne remplacée semble défaite (« Hugo est sorti ? »), et la personne ne sait pas ce qu’est devenu son « Annuler ». Le texte parle de l’état d’avant l’envoi, et reste vrai.

v4.4.4-3. Décision : un « Annuler » refusé par `noRetour` n’écrit pas d’échec et ne laisse pas d’« Annuler », qu’il ait été sur la réussite ou sur une ligne d’échec. — Raison : organizer-view v3.3.6, décision 44 et M7.10, déjà décidé. La v4.4.4 l’inscrit ici pour que les deux maquettes disent la même chose.

v4.4.4-4. Décision : une information sur un leg qui n’existe plus dans le dernier état reçu n’est pas écrite. Écrite, elle part avec la transition vers un état sans ce leg, quel que soit le moment où l’action qui l’apporte a commencé. — Raison : décision du coordinateur sur #339 pour le premier cas. Le second est le même vu dans l’autre ordre, et la barre ne parle pas d’un leg qui n’existe plus (décision 44). La v4.4.2-1 vaut pour la réussite ou l’échec d’une action, pas pour l’état qu’elle apporte. La règle ne vise que `DevicePersons.noFreeSeat.*`. Quelle que soit la réponse qui apporte la transition, la région `status` est vidée si elle annonce encore cette information (revue de la v4.4.4).

v4.4.4-5. Décision : un échec `noRetourAgain` a pour sujet sa seule partie aller. — Raison : ce que la ligne demande (renvoyer pour l’aller seul) doit la retirer, et la partie retour ne peut plus jamais être envoyée. Les mots ne changent pas.

v4.4.4-6. Décision : la transition vers un état sans retour est la quatrième façon de retirer un échec (règle 5, C11.10). — Raison : la règle 6 et organizer-view (décision 44) le disaient déjà. La règle 5 disait « Rien d’autre ne le retire », et le README donnait deux réponses pour un même échec (revue de la v4.4.4).

### Nouvelles en v4.4.5 (réussite retenue, #359 ; « Modifier la voiture » sans changement, #313)

v4.4.5-1. Décision : une réussite de placement qui attend sous une feuille n’est jamais écrite si, avant qu’elle le soit, une action envoyée après elle (`seq`) a réussi en changeant l’état d’au moins une de ses personnes sur son leg. La barre ne dit rien à la place. — Raison : pour ces personnes sur ce leg, elle décrirait l’état d’avant cette action, et son « Annuler » viserait des personnes déjà sorties. Pour elles, la même suite sans feuille ouverte donne déjà une barre vide (règle 2). Avec d’autres personnes ou l’autre leg, la réussite reste vraie : c’est la v4.4.5-2. Les échecs suivent déjà cette règle (`whenClosed`, règle 5).

v4.4.5-2. Décision : la règle ne vise que les mêmes personnes sur le même leg. Les réussites ne sont pas toutes ordonnées par numéro d’envoi. — Raison : avec d’autres personnes, la réussite reste vraie et son « Annuler » reste utile ; tout ordonner retirerait des réussites vraies et changerait la règle 1 pour tous les cas, ce que personne n’a demandé. Cas accepté : sans feuille, une action de cellule sur Léa retire la réussite de Tom (règle 2) ; avec une feuille ouverte, la réussite de Tom s’écrit après. Les deux barres disent vrai.

v4.4.5-3. Décision : seule une action envoyée après **et réussie** abandonne la réussite. Un échec ou un refus la laisse s’écrire, avec son « Annuler ». — Raison : rien n’a changé en base, et le placement tient, comme quand un « Annuler » échoue (règle 6).

v4.4.5-4. Décision : toute la réussite part, même si une seule de ses personnes est touchée ; elle n’est pas réécrite pour les autres. — Raison : un texte refait pour les seules personnes restantes serait un nouveau message, écrit sans nouvelle action. Les personnes restantes sortent par leur cellule, comme après la v4.4.4-1, qui fait déjà perdre un « Annuler ».

v4.4.5-5. Décision : la réussite d’un « Annuler » (`Seat.undone`, `Seat.alreadyOut`) n’est pas visée. — Raison : elle dit où les personnes ne sont plus, et cela reste vrai après toute action sans message. La seule action qui la rendrait fausse les replace dans cette voiture, avec son propre message, et sa réponse arrive après, puisque les actions de la page partent une à une.

v4.4.5-6. Décision : « Valider » sans aucun champ changé ferme « Modifier la voiture » et n’envoie rien. Rien n’est dit, l’étape « Qui sort de la voiture ? » ne s’ouvre pas, et le focus va sur « Modifier » de la carte. — Raison : la même règle que la v4.4 (« Modifier » une personne) et qu’organizer-view M2.5 (« Modifier l’événement ») : trois formulaires de modification, une seule règle. Un message ajouterait une ligne à la barre pour ne rien dire (v4.4-3). Un « Valider » inactif tant que rien ne change a été écarté : un bouton inactif ne dit pas pourquoi, Entrée n’y ferait rien, et les deux autres formulaires ne le font pas.

### Nouvelles en v4.4.6 (une ligne d’échec réduite à l’aller, #372)

v4.4.6-1. Décision du propriétaire sur #267 (relecture de PR #371), inscrite ici : quand le retour est supprimé, l’échec d’une offre sur les deux legs, hors ligne ou sur une erreur, reste, réduit à sa partie aller (mots, sujet, repère), et garde son rang. Tout autre échec d’une offre sur les deux legs part avec le retour. — Raison : Claire doit toujours savoir que sa voiture n’a pas été proposée pour l’aller. « Vérifiez la connexion » et « Une erreur est survenue » restent vrais sans le retour ; un refus peut ne valoir qu’avec lui.

v4.4.6-2. Décision : réduire une ligne n’est pas l’écrire. Rien n’est annoncé, et la région `alert` qui contient déjà le texte entier est vidée sans être réécrite. — Raison : l’échec a déjà été annoncé, et rien de nouveau n’est arrivé à la voiture de Claire. Une annonce assertive juste après une action réussie, comme l’inscription d’Inès, se lirait comme l’échec de cette action. L’écran n’ajoute aucun message non plus. Vider plutôt que garder l’ancien texte : la région ne dit jamais ce que la barre ne montre plus, y compris en mode navigation. Annoncer de nouveau a été écarté pour la confusion, et parce que l’annonce dépendrait de l’ordre des échecs. D’autres mots, comme « Il n’y a plus de retour… », ont été écartés : ce serait un message que l’écran ne montre pas.

v4.4.6-3. Décision : si l’écriture de cet échec est encore en attente, elle écrit le texte réduit, à son heure. — Raison : la réduction ne doit pas faire taire un échec qui n’a pas encore été annoncé. Il l’est donc dans les mots que la barre montre, et jamais dans le texte entier, que la barre ne montre plus. Seule exception, inchangée : une écriture plus récente dans la région `alert` annule l’écriture en attente (point 3), et seul ce nouvel échec est annoncé, comme pour deux échecs du même passage ; la ligne réduite se relit alors dans la liste.

### Nouvelles en v4.8 (le numéro au bon moment, #766)

v4.8-1 à v4.8-19, écrites en entier dans « Décisions de la v4.8 » : critères T (N est pris) ;
un message par fiche, à l’appareil seul ; la phrase de qui conduit pour un conducteur
d’avant ; le bouton ouvre « Modifier », le focus dans le téléphone ; son nom porte le
prénom ; pas d’annonce ; silence pour les autres (décision du propriétaire, Q2 : b) ; pas
de préremplissage pour une nouvelle personne qui conduit (décision du coordinateur) ; la
dernière dans l’ordre de « Vos inscriptions » ; la ligne « Même numéro » tant que c’est ce
numéro ; une erreur qui dit pourquoi ; le numéro écrit avec la voiture ; pas de numéro vidé
tant qu’on conduit, mais changé ; les conducteurs d’avant tels quels (Q1 : b) ; aucune
contrainte en base ; l’aide depuis une place garde « (facultatif) » ; « Modifier la
voiture » ne demande rien. En v4.8 (suite) : la présence du numéro lue sous le verrou, un
booléen, jamais la valeur (décision du coordinateur) ; deux refus qui portent l’état.

### Nouvelles en v4.7 (le geste « retour », #656)

v4.7-1 à v4.7-12, écrites en entier dans « Décisions de la v4.7 » : le retour ferme toutes
les feuilles, comme Échap, saisie comprise, sauf dans une étape ; l’adresse ne change jamais ; l’historique ne
porte qu’une marque opaque ; la liste des propositions n’a pas de pas à elle ;
« Supprimer le retour ? » a le sien ; une feuille fermée autrement retire son entrée sans
défaire l’action ; un retour sans effet est accepté après un rechargement ou un
« Suivant » ; G2 après le déploiement, sans bloquer ; le mécanisme ne dépend pas de #691
(décision du coordinateur) ; dans une étape, le retour revient à l’étape d’avant
(décision du propriétaire, Q1 : b) ; une étape ou la boîte compte un pas, quelle que soit la
façon dont elle s’ouvre ou finit (v4.7-12).

### Nouvelles en v4.6 (les feuilles sur téléphone et le clavier, #650)

v4.6-1 à v4.6-16, écrites en entier dans « Décisions de la v4.6 » : pleine hauteur pour les
feuilles à champ de saisie (décision du propriétaire) ; en-tête et barre d’actions fixes ;
messages dans la barre ; `visualViewport` sans `interactive-widget` ; la liste des
propositions par-dessus la barre ; tout défile sous 240 px ; ordinateur inchangé ; K2 après
le déploiement, sans bloquer (décision du propriétaire) ; les autres maquettes gardent leur
dessin. En v4.6 (suite) : « Qui sort de la voiture ? » garde la pleine hauteur, et une seule
zone défile (décisions du coordinateur) ; `RegisterSheet` est dans la liste ; tout élément
qui a le focus reste au-dessus de la barre ; la règle 8 vaut à toute largeur ; `scrollY` est
rendu à la fermeture ; la zone des messages est nommée.

### Nouvelles en v4.5 (l’autre leg, lu depuis l’événement, #649)

v4.5-1. Décision du propriétaire sur #649, inscrite ici : les choix « conduire » de l’autre leg nomment leurs passagers (« Je ramène aussi des passagers », « J’emmène aussi des passagers » ; « I bring people back too », « I take people there too »), et une ligne dit où et quand part l’autre leg. — Raison : une conductrice qui dépose puis rentre lisait « le retour » comme son propre chemin à vide. « Ramener » avec un complément ne se lit qu’avec des passagers, et la ligne donne une heure que son chemin à vide n’a pas. L’anglais « I drive back too » disait cette lecture mot pour mot. Devenu « des personnes » en v4.8, décision du propriétaire du 26/10 (#649).

v4.5-2. Décision : la ligne décrit le leg, pas la voiture. Elle donne l’heure de l’autre leg dans l’événement, et ne suit pas l’heure saisie avec « Je ramène aussi des personnes ». — Raison : elle répond à « de quel retour parle-t-on ? », pas à « quand part ma voiture ? », que le champ « Heure de départ du retour » montre juste dessous. Une ligne qui suivrait le champ répéterait le champ et perdrait le repère.

v4.5-3. Décision : la date est toujours écrite en entier, même le jour de ce leg. — Raison : la phrase dit « le {date} », et « le 18:00 » ne se dit pas. La ligne se lit seule, au lecteur d’écran aussi, loin de l’en-tête.

v4.5-4. Décision : la ligne est sous le titre du groupe, avant les choix, et elle décrit le groupe (`aria-describedby` sur le `radiogroup`), pas un bouton radio. — Raison : elle se lit une fois, avant de choisir. Posée sur un bouton, elle ne serait lue qu’avec lui, ou serait répétée sur chacun.

v4.5-5. Décision : les titres « Au retour » et « À l’aller » ne changent pas. — Raison : la ligne porte déjà le repère de l’événement, et le propriétaire a retenu les deux libellés « conduire » de l’option A, pas ses titres. Cela évite aussi de récrire quinze citations de « Au retour » dans les tests.

v4.5-6. Décision : le lieu est le texte du lieu de l’événement, entier, et la ligne passe à la ligne. — Raison : un lieu tronqué ne repère plus rien. La Position n’est pas toujours là, et elle ne se lit pas.

v4.5-7. Décision du coordinateur sur #649 : en français, la ligne dit « Le retour part du lieu de l’événement, {location}, le {date}. » et « L’aller va jusqu’au lieu de l’événement, {location}, le {date}. ». L’anglais ne change pas. — Raison : le lieu est un texte libre, et une préposition placée juste devant lui ne s’accorde pas avec un lieu qui commence par un article ou un nom commun. « Le lieu de l’événement », les mots de la Carte, porte la préposition, et la phrase se lit avec n’importe quel lieu. Note, la forme écartée : « Le retour part de {location} le {date}. » et « L’aller va vers {location} le {date}. », retenue d’abord sur #649. Elle donnait « part de Les Saisies » au lieu de « part des Saisies », « va vers Le Liberté » au lieu de « vers le Liberté », et « part de Gymnase des Gayeulles » au lieu de « part du gymnase des Gayeulles ».


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

- **v4.2, la barre (#216)** : rien côté serveur. Chaque refus porte déjà sa raison
  (`seatTaken`, `notEnoughSeats` avec `freeSeats`, `alreadyInCar`, `rideGone`, `drives`,
  `alreadyDriving`, `passengersChanged`, `forbidden`, `eventNotFound`). Le client connaît, au
  moment de l’envoi, les prénoms, la voiture et le leg qu’il nomme. Côté client :
  - `run-action.ts` ne vide plus la barre à chaque réussite (règle 2 : il remplace la
    réussite) ;
  - `useSends` (#208) retire aussi un échec déjà affiché, pas seulement un échec qui attend ;
  - « Ajouter une personne » et « Proposer une voiture » prennent leur sujet (le prénom ; le
    leg et qui conduit), et « Annuler » le sien (`undo:{rideId}`) ;
  - `message-bar.tsx` porte une liste d’échecs, une information et une réussite, non vivante, et deux régions
    d’annonce masquées (v4.2.1) ;
  - le focus de fermeture vérifie qu’un repère est affiché avant de le viser (v4.2.1), et
    la même règle sert à tout élément focalisé qui quitte la barre (v4.2.2) ;
  - les régions d’annonce passent par une minuterie de 100 ms, annulable (v4.2.2) ;
  - « Trouver une place » écrit une information, et non plus une réussite (v4.2.2) ;
  - PR #209 et #213, ouvertes, écrivent encore `Actions.failed` dans la barre : à aligner.

- **v4.8, le numéro (#766)** :
  - **`offerRide`** :
    - la nouvelle personne qui conduit doit avoir un numéro. Absent ou vide, c’est l’erreur de
      champ `phone: "required"` ;
    - le `driver` d’une personne de l’appareil peut porter `phone`. Sous le verrou de la
      Person, une condition de présence (`phone IS NOT NULL`, dans la requête de
      `lockPersons` ou à côté) dit si elle a un numéro : un booléen, jamais la valeur
      (v4.8-18). Sans numéro, et sans numéro dans l’offre, c’est le refus
      `driverWithoutPhone`, qui porte l’état, comme les autres refus (C11.6, v4.8-19) ;
    - un `phone` envoyé est validé par R1, puis écrit sur la Person avant les Rides, dans la
      même transaction ;
    - la page sait déjà qui a un numéro : la section de l’appareil porte ses numéros (C10.1).
  - **`updatePerson`** : `phone` envoyé vide pour une Person qui conduit un Ride sur un leg,
    vu sous le verrou de sa ligne `person`, est le refus `phoneWhileDriving`, qui porte
    l’état (v4.8-19). Rien n’y lit `phone`. Le verrou de la Person est celui que prend
    `offerRide` : les deux écritures s’ordonnent, et T5.6 le prouve.
  - **`event-rows.ts`, `phone-visibility.ts`** : inchangés. Aucun `select` nouveau de la
    valeur de `phone` (v4.8-18).
  - **Client** :
    - `ride-card.tsx` reçoit les identifiants des personnes de l’appareil (déjà dans
      `LegBoard.device`) pour décider du message ;
    - `person-form.tsx` reçoit le numéro à préremplir et le prénom de sa personne, et sait
      s’il est ouvert depuis une place (`{driver}`) ;
    - `ride-form.tsx` montre « Téléphone de {prénom} » d’après le numéro de la personne
      choisie ;
    - `person-error.ts` traduit `required` sur le téléphone d’une nouvelle personne qui
      conduit en `FormErrors.driverPhone`. Les refus `driverWithoutPhone` et
      `phoneWhileDriving` mettent le champ en erreur avec `FormErrors.driverPhone` et
      `FormErrors.phoneWhileDriving`, feuille ouverte. Feuille fermée, ils vont dans la
      barre avec `Actions.why.driverWithoutPhone` et `Actions.why.phoneWhileDriving` ;
    - l’erreur du client et celle du serveur sont les mêmes (C1.8).
  - **Inchangés** : `phone-visibility.ts`, `organiser-panel.ts`, `organiser-lists.tsx`, le
    schéma, les déclencheurs.

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
  avec “Je ramène aussi des personnes” / “J’emmène aussi des personnes”, qui crée aussi une voiture sur l’autre leg ».
  Un test de C4.2 écrit sur l’ancien texte échouerait.
- **C4.4** devient le comportement par défaut ; **C4.5** : la seule écriture couvre aussi
  l’autre leg et les passagers de « Qui monte avec vous ? » ; **C4.10** couvre aussi le
  second Ride et les passagers.
- **Hors périmètre de l’epic** : la ligne « Proposer une voiture sur les deux legs en une fois :
  on la propose sur chaque onglet » sort de la liste, par la décision de l’humain du
  18 octobre (« Au retour : Je ramène aussi »).
- **C5.2** : la barre de réussite porte « Annuler » et reste jusqu’à l’action suivante qui réussit (v4.2).
- **C9.3** : le nombre est visible, « N sans voiture », en pastille ambre.
- **C11.2** : la capture « section des personnes de l’appareil » devient « Vos inscriptions »,
  dépliée et repliée ; ajouter « Proposer une voiture » avec « Au retour » déplié et « Qui
  monte avec vous ? ».

### v4.2 (#216), la barre de messages

- **C5.7** : le message devient « {prénom} n’a pas pu monter dans la voiture de {conducteur}. Cette place vient d’être prise. » Le reste est inchangé.
- **C5.10** : « jusqu’à l’action suivante » devient « jusqu’à l’action suivante qui réussit ». Un échec ou une information qui arrive entre-temps s’ajoute sans retirer la réussite ni son « Annuler » (C11.10).
  - Un « Annuler » qui échoue laisse le placement. Son échec porte son propre « Annuler », que la réussite perd tant que l’échec est là, et sa raison nomme ce bouton (« … utilisez de nouveau « Annuler ». »).
  - Pendant l’envoi d’un « Annuler », aucun « Annuler » n’est affiché pour ce placement.
  - Si une réussite ultérieure remplace celle du placement, l’échec et son « Annuler » restent.

  Playwright :
  - le test attend 10 s, fait échouer une autre action, et retrouve la réussite et « Annuler » ;
  - un « Annuler » hors ligne : un seul bouton « Annuler », sur la ligne de l’échec ;
  - ce bouton, réponse retenue : aucun bouton « Annuler » dans la barre pendant l’envoi ;
  - une place prise ensuite pour Hugo : l’échec et son « Annuler » restent, et ce bouton, de retour en ligne, fait sortir Tom et Léa.
- **C11.4** : ajouter : avec quatre échecs et une réussite dans la barre, à 360 × 780 :
  - aucun débordement horizontal ;
  - la liste, `role="group"` nommée « Messages », fait au plus `40dvh` (312 px) et défile ; elle est focalisable quand elle déborde, et le reste tant qu’elle a le focus ;
  - un nouvel échec la ramène en haut ; une nouvelle réussite défile en vue ;
  - l’espace réservé en bas de la page vaut `1rem` + la hauteur de la barre + 12 px + `env(safe-area-inset-bottom)`, et « Nous contacter » défile entièrement au-dessus de la barre.
- **États à concevoir, « hors ligne » et « erreur serveur »** : dans la barre, le message nomme ce qui n’a pas été fait, puis donne la raison, par exemple « Tom n’a pas pu monter dans la voiture de Sophie. Vérifiez la connexion, puis réessayez. » Dans une feuille ou un formulaire ouverts, rien ne change (« Action impossible, vérifiez la connexion »). La colonne « critère » de ces deux lignes renvoie à C11.10 et C11.11.
- **Nouveau C11.10** (#216) La barre de messages montre ensemble au plus une réussite (la dernière), au plus une information (la dernière) et tous les échecs en attente. De haut en bas : les échecs, du plus récent au plus ancien, puis l’information, puis la réussite. « Récent » se mesure au moment où le message est écrit dans la barre. Une action est un envoi au serveur.
  - Une action qui réussit remplace ou retire la réussite, et ne retire aucun échec. Elle retire l’information seulement si elle a commencé après elle (v4.4.2).
  - Une action qui échoue ajoute son échec. Elle ne retire rien d’autre que l’information, et celle-ci seulement si l’action a commencé après elle (v4.4.2).
  - Une information (« Aucune place libre… ») ne vient d’aucun envoi : elle remplace l’information d’avant et ne retire ni la réussite, ni son « Annuler », ni aucun échec. « Trouver une place » qui trouve une place ne touche pas à la barre.
  - Un échec n’est retiré que de quatre façons : dès l’envoi d’une action sur le même sujet qui couvre au moins ce qu’il portait (table « Le sujet d’un échec » du README) ; par un retrait réussi de sa voiture, qui retire tous les messages sur elle (v4.4) ; par la transition vers un état sans retour, qui retire une fois tout message sur le retour, les échecs `noRetour` écrits par cette réponse ou après restant (organizer-view, décision 44 ; v4.4.4) ; ou par « Fermer » / Échap, qui retirent tous les messages et n’envoient rien.
  - Quand l’élément de la barre qui a le focus disparaît, quelle qu’en soit la raison, le focus va au premier repère affiché (sur l’onglet actif ou hors des onglets, et pas dans une section repliée) dans cet ordre : celui du message de cet élément ; ceux des autres messages, encore là ou qui viennent de partir, du plus récent au plus ancien ; l’onglet actif ; sans onglets, le titre de l’événement. Jamais `<body>`, et jamais de changement d’onglet.

  Playwright :
  - le cas de #216, dans les deux ordres d’arrivée (réponses retardées par `page.route`) : les deux messages sont visibles ensemble, et le sont encore après 10 s ;
  - pour chaque ligne de la table des sujets, l’envoi « retire » efface l’échec avant sa réponse, et l’envoi « ne retire pas » le laisse après la sienne ;
  - trois échecs écrits dans l’ordre A, B, C s’affichent C, B, A ; un échec qui attendait la fermeture d’une feuille prend son rang à cette fermeture ;
  - un échec hors ligne reste après `context.setOffline(false)` et l’évènement `online` ;
  - Tom placé, puis « Trouver une place » pour Léa : avec une place libre, la barre ne change pas ; sans place libre, l’information s’ajoute, et la réussite de Tom et son « Annuler » restent ; l’action suivante retire l’information ;
  - un tap pour Tom, réponse retenue, puis « Trouver une place » pour Léa sans place libre, puis la réponse pour Tom : la barre garde l’information et la réussite de Tom, et la région `status` contient la réussite de Tom (v4.4.2) ;
  - le focus ne tombe jamais sur `<body>`, et va au repère attendu, dans six cas : « Fermer » avec le repère le plus récent sur l’autre onglet ; « Fermer » sur un échec d’« Ajouter une personne », de « Proposer une voiture » et de « Réessayer » ; l’« Annuler » d’un échec, activé au clavier ; une réponse tardive qui remplace la réussite dont l’« Annuler » a le focus ; une action sans message qui vide la barre, le focus sur « Fermer » ; un « Annuler » réussi après un changement d’onglet.
- **Nouveau C11.11** (#216) Un échec dit dans la barre ce qui n’a pas été fait, puis pourquoi et quoi faire, mot pour mot comme la table « Chaque échec, mot pour mot » du README. Aucun échec de la barre n’est générique, « Réessayer » compris.
  - `alreadyInCar` nomme les personnes : la personne d’un tap, et les personnes cochées de « Qui monte avec vous ? ».
  - « Modifier » une personne nomme les champs envoyés.
  - Un « Annuler » qui échoue nomme son bouton.
  - Les prénoms : un seul ; deux (« Tom et Léa ») ; trois (« Tom, Léa et Hugo », « Tom, Léa, and Hugo » en anglais, le texte de `format.list`) ; au-delà, les deux premiers et « et N autres » ; toujours dans l’ordre de « Vos inscriptions ». La même règle vaut pour « {prénoms} sont dans la voiture de… », « … ne sont plus… » et « … n’étai(en)t déjà plus… » (v4.4.4).
  - Vitest : la fonction qui compose le texte, sur chaque ligne de cette table, en français et en anglais, et pour 1 à 5 personnes ; de même `Seat.undone` et `Seat.alreadyOut`, pour 1 à 5 personnes (« Tom, Léa et 2 autres n’étaient déjà plus dans la voiture de Sophie ») (v4.4.4).
  - Playwright : le texte exact hors ligne (`setOffline`), sur une erreur serveur (réponse 500 par `page.route`), sur `alreadyInCar` (un tap, et « Proposer une voiture » avec deux personnes cochées) et sur une place prise, pour un tap et pour une feuille fermée avant la réponse ; « Réessayer » hors ligne ; un renvoi partiel de « Modifier » qui donne deux lignes différentes.
- **Nouveau C11.12** (#216) La liste visible de la barre n’est pas une région vivante. Deux régions masquées visuellement, toujours montées, placées après « Fermer », annoncent :
  - `role="alert"` ne contient que le texte du dernier échec écrit dans la barre ;
  - `role="status"` ne contient que celui du dernier message poli écrit, réussite ou information.

  Chacune se vide quand son message quitte la barre. Chaque écriture vide la région aussitôt, puis écrit le texte 100 ms plus tard ; une écriture plus récente, le vidage de la région ou « Fermer » / Échap annulent l’écriture en attente. Playwright, avec `page.clock` et un `MutationObserver` sur chaque région :
  - la liste visible n’a ni `role="alert"`, ni `role="status"`, ni `aria-live` ;
  - un échec : la région `alert` est vide aussitôt, et contient son texte à +100 ms ;
  - deux échecs écrits dans le même passage : à +100 ms, la région `alert` ne contient que le second, et l’observateur n’a jamais vu le texte du premier ;
  - « Fermer » moins de 100 ms après un échec : la région reste vide ;
  - un renvoi hors ligne qui échoue de la même façon : l’observateur voit la région vide, puis le même texte ;
  - une réussite n’écrit rien dans la région `alert`. Elle ne la vide que si elle retire l’échec que cette région annonce encore, comme le fait déjà un retrait de voiture réussi : c’est aussi le cas d’une réussite qui apporte la transition vers un état sans retour et retire un échec du retour (point 2, v4.4.4). Dans tous les autres cas elle ne la modifie pas ; un échec n’écrit aucun texte dans la région `status`. Il la vide seulement si elle annonce encore l’information qu’il retire, texte ou écriture en attente, dans deux cas : son action a commencé après l’information ; ou sa réponse apporte l’état sans retour et l’information est celle du retour, quel que soit le moment où son action a commencé (v4.4.4, B1.6). Dans tous les autres cas il ne la modifie pas ; une information s’écrit dans la région `status` ;
  - un échec et une réussite libérés à la fermeture d’une même feuille : l’échec est écrit d’abord ;
  - Tom placé, réponse retenue ; « Trouver une place » pour Léa, sans place libre, écrit l’information ; la réponse pour Tom arrive, l’information reste ; puis, moins de 100 ms après, un tap pour Hugo, commencé après l’information, échoue. La barre perd l’information et garde la réussite de Tom. Avec `page.clock` : 100 ms après la réponse pour Tom, la région `status` contient le texte de sa réussite, donc l’écriture en attente n’a pas été annulée ; ensuite, jusqu’à la fin du test, l’observateur ne la voit jamais vidée. La région `alert` contient l’échec d’Hugo (v4.4.3).

  *Non prouvable par un test* : ce que prononce un lecteur d’écran. Revue avec VoiceOver (iOS, Safari), TalkBack (Android, Chrome) et NVDA (Windows, Chrome), sur le cas de #216 dans les deux ordres d’arrivée : chaque message est annoncé une fois, et aucun n’est relu quand un autre arrive. En mode navigation (NVDA, rotor VoiceOver), chaque message se lit deux fois, dans la liste puis dans sa région : on vérifie que cette lecture reste compréhensible.
- Aucun critère de l’epic ne disait ce que fait la barre d’un échec : C11.10 à C11.12 sont les seuls nouveaux. Le reste amende C5.7, C5.10, C11.4 et les deux lignes d’états. C11.9 ne change pas : les nouvelles clés sont dans `Actions`, déjà vérifié.

### v4.4 (#298), « Valider » sans changement

- **C2.3** : ajouter : « Valider » sans aucun champ changé ferme le formulaire « Modifier
  {prénom} » sans rien envoyer ; le focus va sur le prénom, et la barre ne change pas.
- **C11.10** : « Un échec n’est retiré que de deux façons » devient « de trois façons » :
  l’envoi d’une action sur le même sujet, un retrait de voiture réussi pour les messages sur
  cette voiture (déjà construit, PR #255), ou « Fermer » / Échap.
- **C11.11** : « trois (« Tom, Léa et Hugo ») » précise : le texte de `format.list` dans la
  langue (« Tom, Léa, and Hugo » en anglais).
- **Nouveaux** : V1.1 à V1.8, dans « Critères de la v4.4 ».

### v4.4.4 (#341), « Annuler » et l’information

- **C5.10** : ajouter : « Un “Annuler” qui ne rend personne dit “{prénoms} n’étai(en)t déjà
  plus dans la voiture de {conducteur}” ; refusé parce que le retour n’existe plus, il
  n’ajoute aucun échec ni aucun “Annuler” (organizer-view M7.10). »
- **C11.10** : ajouter, à la puce de l’information : « L’information de “Trouver une place”
  n’est pas écrite si le dernier état reçu n’a plus son leg, et elle part quand la page
  applique un état sans ce leg. » ; « Un échec n’est retiré que de trois façons » devient
  « de quatre façons », avec la transition vers un état sans retour (organizer-view,
  décision 44).
- **C11.11** : la règle des prénoms et le Vitest « pour 1 à 5 personnes » couvrent aussi
  `Seat.undone` et `Seat.alreadyOut`.
- **C11.12** : un échec vide aussi la région `status` quand sa réponse apporte l’état sans
  retour et que la région annonce encore l’information du retour, quel que soit le moment où
  son action a commencé.
- **Nouveaux** : B1.1 à B1.7, dans « Critères de la v4.4.4 ».

### v4.4.5 (#359, #313)

- **C4.13** et **C5.10** : ajouter : « Sauf si, avant que la réussite s’affiche, une action
  envoyée après le placement a réussi en changeant l’état d’une de ses personnes sur ce leg :
  ni la réussite ni “Annuler” ne s’affichent (v4.4.5). »
- **C8.2** : ajouter : « “Valider” sans aucun champ changé ferme “Modifier la voiture” sans
  rien envoyer ; le focus va sur “Modifier”, et la barre ne change pas. »
- **C11.10** : ajouter, à la puce de la réussite : « au plus une réussite, la dernière écrite ;
  une réussite de placement abandonnée selon la règle 2 n’est jamais écrite ».
- **Nouveaux** : S1.1 à S1.5 et W1.1 à W1.7, dans « Critères de la v4.4.5 ».

### v4.8 (#766), le numéro de téléphone

- **R4**, ligne « conducteur » : « une **nouvelle personne** (prénom et téléphone, règles de
  R1) » devient « une **nouvelle personne** (prénom et téléphone **requis**, règles de R1) ;
  une personne de l’appareil sans numéro en donne un (v4.8, #766) ».
- **C2.3** : « Vider le téléphone le supprime. » devient « Vider le téléphone le supprime,
  sauf pour une personne qui conduit (v4.8, T5). »
- **C1.2** : la phrase « Visible seulement… » reste sous le téléphone. Depuis une place
  libre et pour qui conduit, une phrase la précède (v4.8, règles 5 et 6).
- **Table des états**, ligne « conducteur sans téléphone : aucun lien `tel:` sur sa carte » :
  elle ne vaut plus que pour un conducteur d’avant la v4.8. La fiche demande un numéro à son
  appareil (T1.6).
- **Nouveaux** : histoires H11 à H13, T1.1 à T6.3, dans « Critères de la v4.8 ».

### v4.7 (#656), le geste « retour »

- Aucun critère de #66 n’est amendé : mots, boutons, ordre du focus et « Le focus après une
  action » ne changent pas. Le retour fait ce qu’Échap fait déjà.
- **Nouveaux** : histoires H9 et H10, G1.1 à G1.18 (Playwright, avant la fusion) et G2.1 à
  G2.9 (iPhone et Android, après le déploiement, sans bloquer), dans « Critères de la
  v4.7 ».

### v4.6 (#650), les feuilles sur téléphone

- Aucun critère de #66 n’est amendé : leurs mots, leurs boutons et l’ordre du focus ne
  changent pas. « Utilisable sur 360 px » (`product.md`) et M9.1 d’organizer-view restent
  vrais, K1.15 les reprend pour les feuilles.
- **Nouveaux** : K1.1 à K1.16 (Playwright, avant la fusion) et K2.1 à K2.7 (iPhone, après le
  déploiement, sans bloquer), dans « Critères de la v4.6 ».
- **AL1.11** de place-autocomplete reste vrai ; sa prochaine révision ajoute que la liste peut
  couvrir la barre d’actions (v4.6-5).

### v4.5 (#649), l’autre leg lu depuis l’événement

- **C4.2** : l’amendement de la v4 cite les nouveaux libellés, « … sauf avec “Je ramène aussi
  des personnes” / “J’emmène aussi des personnes”, qui crée aussi une voiture sur l’autre
  leg ».
- **C4.11**, et tout critère de #66 qui cite « Je ramène aussi » ou « J’emmène aussi » :
  le nouveau libellé, sans autre changement.
- **Les maquettes voisines sur `main`** dessinent ou citent le même groupe « Au retour », avec
  les libellés que la v4.5 remplace et sans la ligne d’aide. Les tests trouvent un bouton radio
  par son nom exact : un critère qui cite l’ancien libellé chercherait un bouton qui n’existe
  plus. Jusqu’à leur prochaine révision, la v4.5 fait foi. Chaque citation de « Je ramène
  aussi » devient « Je ramène aussi des personnes », chaque « J’emmène aussi » devient
  « J’emmène aussi des personnes », et chaque « I drive back too » devient « I bring people
  back too ». Une maquette du groupe montre aussi la ligne d’aide, sous son titre.
  - `docs/design/place-autocomplete/` :
    - les critères **AL3.5** (`index.html:597`) et **AL4.2** (`index.html:602`), qui nomment
      le bouton radio ;
    - les maquettes `index.html:322` (« Je ramène aussi ») et `index.html:449` (« I drive back
      too », le libellé que E1.4 interdit) ;
    - les textes `index.html:298`, `:315` et `:403`, et le README, lignes 25, 41 et 55.
  - `docs/design/organizer-view/` :
    - le critère **M7.6** (`README.md:746`, recopié dans `index.html:369`) ;
    - la table des échecs, mot pour mot (`README.md:822`, et `index.html:369`) ;
    - la table des états couverts (`README.md:906`) ;
    - « Ce que voient les participants » (`README.md:507`, `:512`, `:515` et `:520`) ;
    - la maquette « Participant : depuis l’Aller, avec « Je ramène aussi » » (`index.html:368`).

    Son journal des révisions (`README.md:1224`) dit une version passée : il ne change pas.
- **Nouveaux** : E1.1 à E1.7, dans « Critères de la v4.5 ».

### v4.4.6 (#372), une ligne d’échec réduite à l’aller

- **C11.10** : ajouter, à la puce de la transition : « sauf l’échec hors ligne ou en erreur
  d’une offre sur les deux legs, qui reste, réduit à l’aller, à son rang ».
- **C11.12** : ajouter : « Une ligne réduite à l’aller par la transition n’est pas écrite :
  rien n’est annoncé. Si la région `alert` contient déjà son texte entier, elle est vidée sans
  être réécrite ; si son écriture est en attente, elle écrit le texte réduit ; si elle annonce
  un autre échec, elle n’est pas touchée. »
- **Nouveaux** : N1.1 à N1.6, dans « Critères de la v4.4.6 ».

### v4.3 (#235), début et fin : critères de #3 amendés

- **R1**, table des champs :
  - « date de l’aller, heure de l’aller » devient « date de début, heure de début » ;
  - « date du retour, heure du retour » devient « date de fin, heure de fin », avec la règle
    « requises si « Retour » est cochée ; date et heure strictement postérieures au début ;
    même borne de + 365 jours ».
- **C1.2** La case « Retour » est cochée au chargement, et les champs date et heure de fin
  sont visibles.
- **C1.3** Tant que l’utilisateur n’a pas modifié la date de fin, elle prend automatiquement
  la valeur saisie pour la date de début. L’heure de fin n’est pas préremplie.
- **C1.4** Les six actions deviennent : titre, lieu, date de début, heure de début, heure de
  fin, « Créer ». Le reste ne change pas.
- **C1.7** Une fin antérieure ou égale au début est refusée, avec l’erreur « La fin doit être
  après le début. » sur le champ de la fin : « Heure de fin », ou « Date de fin » si c’est la
  date qui est antérieure.
- **C1.8** Une date de début antérieure à aujourd’hui (date de l’appareil) est refusée. Une
  date postérieure à aujourd’hui + 365 jours est refusée.
- **C1.12** « un événement créé avec un aller à 07:30 » devient « un événement créé avec un
  début à 07:30 ». Le reste ne change pas.
- **C2.1** Décocher « Retour » masque les champs date et heure de fin, et ils ne sont plus
  requis.
- **C5.1** `/e/{id}` affiche le titre (titre de niveau 1) et le lieu. Il affiche aussi le
  début, sous le libellé « Début », et la fin si l’événement a un retour, sous le libellé
  « Fin ». La fin n’affiche que son heure quand elle tombe le même jour que le début. Les
  dates sont mises en forme par le mécanisme d’i18n selon la langue, sans concaténation.
- **Inchangés** : C2.2 (« titre, lieu, date, heure, décocher « Retour », « Créer » »), C2.3 et
  C8.6 (ils parlent des données, qui gardent leurs noms), C5.2 à C5.5 (les onglets sont des
  legs).
- **Nouveaux** : D1.1 à D1.8 et D2.1 à D2.5, dans « Critères de la v4.3 ».

## Hors périmètre

En v4.7 :

- Un brouillon gardé après une fermeture, ou « Abandonner les changements ? » ;
  « Retirer la voiture ? » ouverte sans feuille ; rouvrir une feuille par « Suivant » ou par
  une adresse ; un pas en arrière pour les onglets, le repli, la bulle de la carte ou la
  barre ; les autres pages ; un projet WebKit dans Playwright. Voir « Hors périmètre de la
  v4.7 ».

En v4.6 :

- Le geste « retour » du navigateur sur une feuille ouverte : issue #656. Traité en v4.7.
- Fermer une feuille en la glissant vers le bas ; les boîtes de confirmation centrées ; le
  formulaire de création et les pages du compte ; `viewport-fit=cover`.

En v4.5 :

- Un repère sur le tableau lui-même, par exemple « Vers {lieu} · {date} » en tête de chaque
  leg (option C de #649). Les onglets, et le tableau d’un leg, ne changent pas. Il est à
  reprendre si un autre testeur bute sur les onglets.
- Renommer les legs à l’écran, avec « Vers l’événement » / « Depuis l’événement » ou
  « Trajet aller » / « Trajet retour » (options D et E de #649, écartées).
- Montrer ou compter le chemin à vide d’un conducteur : ce n’est pas un leg (phrase F).
- La matrice « Vos inscriptions » : la cellule d’une conductrice dit toujours « Ne fait pas
  le retour » sur le leg qu’elle ne fait pas.
- « Ajouter une personne » et sa case « Aller et retour » : inchangés.
- Accorder une préposition avec le lieu saisi : la phrase l’évite (v4.5-7).

En v4.4.6 :

- Dire, à l’écran ou au lecteur d’écran, que le retour vient d’être supprimé : la transition
  ne dit rien (organizer-view, M7.4 ; les notifications sont hors V1).
- Marquer à l’écran qu’une ligne a été réduite.
- Réduire un refus sur les deux legs (`alreadyDriving`, ou `passengerInCar` depuis #356) :
  il part avec le retour (v4.4.6-1).
- Une ligne réduite quand le retour **revient**, puis repart : elle ne porte plus sur le
  retour, et reste telle quelle (#271).

En v4.4.5 :

- Ordonner toutes les réussites par numéro d’envoi (écarté, v4.4.5-2).
- Réécrire une réussite pour les seules personnes restantes (écarté, v4.4.5-4).
- Une réussite que rend fausse un autre appareil, appris par une lecture : inchangé. Son
  « Annuler » dit alors « … n’était déjà plus… » (B1.3).
- « Modifier la voiture » : un « Valider » inactif, ou un message « Rien n’a changé » (écartés,
  v4.4.5-6).

En v4.4.4 :

- L’échec d’un « Annuler » refusé par `forbidden` (« … rechargez la page ») ou par
  `eventNotFound` garde son « Annuler », qui échouera lui aussi. Le même raisonnement que pour
  `noRetour` s’y appliquerait, mais personne ne l’a demandé : c’est à décider à part.
- Deux « Annuler » à la fois, un par placement : écarté (v4.4.4-1).
- Corriger sur `main` l’échec `noRetour` d’« Annuler » avant #267.
- La transition quand le retour **revient** : rien n’est retiré, comme aujourd’hui.

En v4.4 :

- « Modifier » la voiture sans changement : traité en v4.4.5 (#313, W1).
- « Ajouter une personne » : un formulaire vide est une erreur (« Champ requis. »), pas une
  absence de changement.
- L’anneau de focus (#236), défini dans la maquette `language-switch` v3.

En v4.3 :

- la disposition du formulaire de création, qui revient à la nouvelle page d’accueil (#232) ;
- une fin sans retour, qui demanderait une nouvelle colonne ;
- renommer `aller_at` / `retour_at` ;
- les sections de l’espace organisateur ;
- l’heure préremplie de « Proposer une voiture » à l’aller, qui reste le début ;
- un format de plage sur une ligne (« de 07:30 à 18:00 »).

Avant :

La vue organisateur (epic #154), le lien perso et son QR code, la fraîcheur, supprimer une
personne, les options à l’écran, changer de voiture en un geste, faire sortir un passager
sans réduire ses places, une liste d’attente, distinguer deux personnes de même prénom, les
notifications. En v4.2 : les messages dans les feuilles, formulaires et confirmations ouverts
(inchangés), et tout autre écran que la barre.

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
- v4.2 (2026-10-19) : #216, décision de l’humain, option (a). Partie de v4.1 : la copie
  locale, celle de `origin/main` (`docs/design/event-board/`, #161) et l’artifact publié
  étaient identiques. Seules la barre de messages et ses mots changent.
  - Règle : une réussite ne remplace jamais un échec, et un échec ne retire pas la réussite.
    Un échec ne part que dès l’envoi d’une action sur le même sujet (#208), ou par « Fermer »
    / Échap, qui retire tout. Les sujets sont donnés action par action ; ceux d’« Ajouter une
    personne » et de « Proposer une voiture » ne sont plus la feuille.
  - Mots : chaque échec nomme ce qui n’a pas été fait, puis la raison (`Actions.failure`,
    `Actions.notDone.*`, `Actions.why.*`), avec la table complète action par raison, en
    français et en anglais. Épicène : « n’ont pas pu monter », pas l’exemple « n’ont pas été
    placés ». Règle des prénoms : trois, puis « et N autres » (`Actions.names.andOthers`).
    `Seat.seatTaken` retirée.
  - Lecteurs d’écran : `aria-atomic="false"` sur la région `alert`, un `<p>` par échec,
    aucune écriture dans l’autre région.
  - 360 px : liste plafonnée à 40 % de la hauteur et qui défile, espace réservé mesuré.
  - Critères : C5.7, C5.10, C11.4 et les états « hors ligne » / « erreur serveur » amendés ;
    C11.10 à C11.12 nouveaux.
  - Maquettes : le cas de #216, hors ligne, « Annuler » qui échoue, action de cellule, plafond,
    après « Fermer », en anglais ; « Place prise » et « Hors ligne » existantes mises à jour.
  - Rendu vérifié avec Chrome headless (`chrome`), dans des cadres de 360 px : 48 téléphones,
    aucun débordement horizontal, aucune cible sous 44 px dans la barre. Hauteurs de barre :
    90, 110 et 171 px ; 322 px au plafond, pour 424 px de contenu. Un défaut corrigé au
    rendu : « Undo », de 44 px dans une ligne de 41 px, faisait défiler la liste de 2 px.
  - Pas encore relue en revue de design. Republiée à la même URL.
- v4.2 (suite) : revue de design : changements demandés. Cinq bloquants :
  1. le focus de « Fermer » visait un repère de l’autre onglet, monté mais caché ;
  2. aucun repère pour « Ajouter », « Proposer » et « Réessayer », et la remontée des messages
     n’était pas définie ;
  3. pas de test pour les sujets autres que les places ;
  4. `alreadyInCar` après « Proposer une voiture » ne nommait personne ;
  5. « Réessayer » restait générique.

  S’y ajoutent des suggestions : régions vivantes et TalkBack ; rôle, défilement, `dvh` et
  espace réservé de la liste ; « plus récent » ; sujets séparés ; « Annuler » orphelin ;
  mots ; maquettes à redessiner. Réglés, à ne pas rouvrir : « n’ont pas pu monter », une
  seule croix, les sujets d’« Ajouter » et de « Proposer », Échap qui retire tout.
- v4.2.1 (2026-10-20) : les cinq bloquants corrigés, toutes les suggestions appliquées, aucune
  refusée. Pour les régions vivantes, le repli proposé est retenu comme conception : une
  région masquée qui ne contient que le nouveau message, et une liste visible non vivante.
  - Focus : un repère n’est visé que s’il est affiché (onglet actif, section dépliée) ;
    sinon, on remonte tous les messages, puis l’onglet actif, sans changer d’onglet.
    Nouvelle table « Le repère de chaque message » ; maquette « repère sur l’autre onglet ».
  - Sujets : une paire de tests « retire » / « ne retire pas » par ligne. Lignes séparées pour
    « Annuler » (`undo:`) et pour « Modifier » / « Retirer la voiture » (`ride:{id}:edit` /
    `ride:{id}`).
  - Mots : `Actions.why.passengerInCar` (« Parmi Inès et Hugo, une personne au moins est déjà
    dans une voiture. ») ; `Actions.why.alreadyInCar` nomme la personne d’un tap ;
    `Actions.notDone.readDevice` (« Vos inscriptions n’ont pas pu être chargées. ») ;
    « modifiez la voiture de nouveau » ; « could not be seated in » ; « No seats are left. ».
    Décision v4.2-11 amendée, sans exception dans la barre.
  - « Annuler » : un seul par placement. Un « Annuler » qui échoue porte le sien, et il reste
    si une autre réussite remplace celle du placement (C5.10).
  - Liste : `role="group"` « Messages », `40dvh`. Un nouvel échec la ramène en haut ; une
    nouvelle réussite défile en vue. Espace réservé : `1rem` + barre + 12 px + zone sûre.
  - « Plus récent » : le moment où le message est écrit dans la barre. Tests de l’ordre et du
    retour du réseau.
  - Maquettes « Place prise entre-temps » et « Hors ligne sur la page » redessinées avec la
    barre de v4.2 ; maquette « Réessayer qui échoue » ajoutée.
  - C5.10, C11.4, C11.10, C11.11 et C11.12 réécrits.
  - Rendu vérifié avec Chrome headless (`chrome`), dans des cadres de 360 px : aucun
    débordement horizontal, aucune cible sous 44 px dans la barre, aucune liste qui défile
    hors du plafond. Republiée à la même URL.
- v4.2.1 (suite) : revue de design : changements demandés. Les cinq bloquants de la v4.2 sont
  confirmés corrigés, et le rendu est confirmé : 50 maquettes, aucun débordement, cibles de
  44 px au moins. Trois nouveaux bloquants :
  1. le focus pouvait tomber sur `<body>` quand un élément focalisé quitte la barre sans
     « Fermer » (« Annuler » d’un échec, réponse tardive, barre vidée, « Annuler » après un
     changement d’onglet), et rien ne disait si la réussite récupère son « Annuler » pendant
     un nouvel envoi ;
  2. l’écriture différée de 100 ms : son déclencheur n’était pas défini, et elle n’était jamais
     annulée ;
  3. « Aucune place libre » et « Trouver une place » étaient hors de la règle.

  S’y ajoutent sept suggestions.
- v4.2.2 (2026-10-20) : les trois bloquants corrigés, les sept suggestions appliquées, aucune
  refusée.
  - Focus : une seule règle de sortie (règle 8), pour « Fermer », Échap et tout élément
    focalisé qui disparaît. Le focus d’un « Annuler » réussi vérifie que le repère est
    affiché. Aucun « Annuler » pendant l’envoi d’un « Annuler ».
  - Annonces : chaque écriture vide la région, puis écrit 100 ms plus tard ; une écriture
    plus récente, le vidage ou « Fermer » annulent l’écriture en attente. On ne compare pas
    les textes, puisque le DOM change toujours (C11.12 réécrit, tests avec `page.clock`).
  - Information : « Aucune place libre » ne retire ni une réussite, ni son « Annuler », ni un
    échec ; elle part à la fin de l’action suivante ou par « Fermer ». « Trouver une place »
    qui trouve une place ne touche pas à la barre (préférence du relecteur ; test dans
    C11.10).
  - Mots : `Actions.why.retryUndo` (« … utilisez de nouveau « Annuler ». ») ;
    `Actions.notDone.editPerson` nomme les champs envoyés.
  - Sujet de « Proposer une voiture » : chaque leg de l’offre, avec un test sur les deux legs.
  - Repère de « Réessayer » : affiché tant que « Vos inscriptions » est en échec. Contrôle
    manuel : la double lecture en mode navigation.
  - Maquettes : les cinq barres de v4 redessinées (« Aucune place libre », « Après le tap »,
    « Après « Annuler » », « 15 voitures », la barre en anglais), dont des réussites seules,
    et le texte de l’espace réservé corrigé. Carte de la règle : « sans onglets, le titre de
    l’événement ».
  - C5.10, C11.10, C11.11 et C11.12 réécrits.
  - Rendu vérifié avec Chrome headless (`chrome`), dans des cadres de 360 px : aucun
    débordement horizontal, aucune cible sous 44 px dans la barre, plus aucune barre de v4
    dans la page. Republiée à la même URL.
- v4.2.2 (suite) : revue de design : **approuvée**, sans bloquant ; six suggestions.
- v4.2.3 (2026-10-20) : les six suggestions appliquées, rien d’autre ne change.
  - C11.12 et « Lecteurs d’écran » (point 4) : un échec n’écrit rien dans la région `status`,
    mais peut la vider quand il retire l’information.
  - « au-dessus de la réussite », et non « sous », dans « États couverts » et la décision
    v4.2.2-9.
  - L’information figure dans la structure de la barre (région `status` : dernier message
    poli) et dans « Impact serveur ».
  - La règle 8 nomme l’« Annuler » de la réussite, et couvre un élément qui cesse d’être
    focalisable. La liste garde `tabIndex={0}` tant qu’elle a le focus (C11.4).
  - Icônes nommées : `CircleCheck` pour une réussite, `Users` pour une information.
  - Republiée à la même URL.
- v4.3 (2026-10-20) : « Début » et « Fin » dans l’en-tête, à la demande du propriétaire (capture
  de `/e/{id}` en production).
  - Partie de v4.2.3 : la copie locale, `origin/main` (`docs/design/event-board/`) et
    l’artifact publié étaient identiques.
  - Nouvelle section « Début et fin (v4.3) » :
    - le même jour (la fin à son heure seule), deux jours, après minuit, sans retour ;
    - l’en-tête de `/e/{id}/admin` ;
    - l’anglais ;
    - les champs de date du formulaire et leur erreur, mots seulement.
  - Les deux en-têtes existants passent à « Début » / « Fin ». « L’ordre de l’écran », les
    décisions, les critères à amender et le hors-périmètre sont mis à jour.
  - Le README dit pourquoi « Fin » n’est pas « Retour » dans les données. Il pose la question
    du formulaire au propriétaire, avec l’option (a) recommandée, et donne la phrase de #232.
  - Rendu vérifié avec Chrome headless (`chrome`), à 1280 et 400 px :
    - aucun débordement horizontal dans un téléphone ni sur la page ;
    - chaque ligne de date de 360 px tient sur une ligne, en anglais compris.
  - Pas encore relue en revue de design. Republiée à la même URL.
- v4.3 (suite) : revue de design : changements demandés. Un bloquant : la page et le README
  présentaient encore la question du formulaire comme ouverte, alors que le propriétaire a
  choisi l’option (a) le 20/10 (#235). De plus, les sections « Décisions » et « Critères de
  l’epic à amender » du README n’avaient pas d’entrée v4.3. S’y ajoutent cinq suggestions.
- v4.3.1 (2026-10-20) : le bloquant est corrigé, et les cinq suggestions sont appliquées, sans
  en refuser aucune.
  - La décision est enregistrée comme prise par le propriétaire le 20/10, avec un lien vers
    #235, sur la page et dans le README.
  - Le README a ses entrées v4.3-1 à v4.3-6 sous « Décisions », et sous « Critères de l’epic
    à amender » la liste des critères de #3 amendés : R1, C1.2, C1.3, C1.4, C1.7, C1.8, C1.12,
    C2.1 et C5.1, avec leur nouveau texte. C1.8 et C1.12 s’ajoutent à la liste de v4.3, car
    ils disaient « date d’aller » et « un aller à 07:30 ».
  - D1.8 compare les `top` à 4 px près, à cause de l’alignement sur la ligne de base.
  - D2.3 renvoie à cette liste.
  - Le « Tournoi de Rennes » commence à 07:30 dans toutes les maquettes, l’heure des fixtures.
  - D2.2 a sa maquette « date de fin avant la date de début ».
  - « Pour #232 » reprend la phrase déjà retenue dans #232.
  - Rendu vérifié avec Chrome headless (`chrome`), à 1280 et 400 px : aucun débordement
    horizontal. Republiée à la même URL.
- v4.4 (2026-10-21) : #298, « Valider » sans changement dans « Modifier » une personne.
  - Partie de v4.3.1 : la copie locale, `origin/main` (`docs/design/event-board/`) et
    l’artifact publié étaient identiques.
  - Nouvelle section « Ce qui change en v4.4 » : la règle, les états, les critères V1.1 à
    V1.7, aucun mot nouveau, et ce qui reste à faire côté code. Le tableau du focus, la table
    des sujets, les états couverts, les décisions (v4.4-1 à v4.4-5), les critères à amender
    (C2.3, C11.10, C11.11) et le hors-périmètre sont mis à jour.
  - Deux corrections notées sur #216 :
    - la règle 5 de la barre écrit ce que fait un retrait de voiture réussi (#221, PR #255) ;
    - en anglais, trois prénoms donnent « Tom, Léa, and Hugo », le texte de `format.list`
      (#280).
  - La page ajoute la section « « Valider » sans changement (v4.4) », avec quatre maquettes,
    et reprend les deux corrections.
  - Pas encore relue en revue de design. Republiée à la même URL.
- v4.4 (suite) : revue de design : changements demandés. Un bloquant : la ligne « Modifier »
  la voiture de la table des sujets donnait « Retirer la voiture » de cette voiture comme ne
  retirant pas l’échec, ce que contredit la règle 5 corrigée. Quatre suggestions.
- v4.4.1 (2026-10-21) : le bloquant est corrigé, et les suggestions sont appliquées, sans en
  refuser aucune.
  - Table des sujets, ligne « Modifier » la voiture : « … qui échoue »
    (`ride-remove.spec.ts:350`) ; un retrait réussi retire l’échec (règle 5). Même ligne sur
    la page.
  - V1.8 nouveau : « Claire » suivi d’une espace part, et la base garde « Claire ».
  - V1.5 concret : Claire placée dans la voiture de Marc au retour, puis l’échec retenu de
    « Clara ». Le test ne dépendait pas d’« Annuler », pas encore construit, et la maquette
    « Après » le montrait sans « Annuler ». Depuis #170 (PR #340) et la v4.4.2, V1.5 attend
    « Annuler » puis « Fermer », et la maquette montre « Annuler ».
  - Note pour la prochaine révision d’organizer-view : M2.5 doit dire où va le focus et que
    les lignes de la barre restent.
  - Le mélange de virgules entre trois prénoms (« Tom, Léa, and Hugo ») et quatre (« Tom, Léa
    and 2 others ») est noté par la revue et gardé (décision v4.4-5).
  - Rendu vérifié avec Chrome headless, à 1280 et 500 px : aucun débordement horizontal.
    Republiée à la même URL.
- v4.4.1 (suite) : revue de design : **approuvée**.
- v4.4.2 (2026-10-21) : deux amendements de texte, sans rien redessiner.
  - Règles 2 et 3 de la barre : la réussite ou l’échec d’une action commencée avant
    l’information la laisse en place ; seule une action commencée après elle la retire
    (règle 4). Décision du propriétaire sur PR #339 (« Trouver une place », #172). La règle 4
    dit quand une action commence, et le cas accepté. Même correction dans C11.10 (deux
    puces, et un cas Playwright de plus), C11.12, le point 4 de « Lecteurs d’écran » et la
    table des états. Nouvelle décision v4.4.2-1.
  - « Annuler » est construit (#170, PR #340) : V1.5 attend « Annuler » puis « Fermer », la
    règle 5 nomme `undo:{rideId}` pour « Annuler », et l’entrée v4.4.1 ci-dessus ne dit plus
    qu’il n’est pas construit. La maquette « Après » de V1.5 montre « Annuler » sur la
    réussite.
  - La page reprend les mêmes textes (règles 2 à 4, « Lecteurs d’écran », C11.10, C11.12,
    décisions, version).
  - Rendu vérifié avec Chrome headless, à 500 et 1280 px : aucun débordement horizontal, et
    la barre de V1.5 tient avec « Annuler ». Pas encore relue en revue de design. Republiée à
    la même URL.
- v4.4.2 (suite) : revue de design : changements demandés. Un bloquant : C11.12 et le point 4
  de « Lecteurs d’écran » faisaient vider la région `status` selon le moment où l’action
  avait commencé, et non selon ce qu’elle annonce. Avec une réussite arrivée après
  l’information, l’échec suivant aurait vidé l’annonce de cette réussite, encore dans la
  barre, et pu annuler son écriture en attente. Deux suggestions retenues ; la suggestion de
  ne pas dire « Annuler » construit est écartée par le coordinateur (#340 est mergée avant
  que #339 copie cette maquette).
- v4.4.3 (2026-10-21) : le bloquant est corrigé, et les suggestions retenues sont appliquées.
  - Point 4 et C11.12 : un échec vide la région `status` seulement s’il retire l’information
    et que la région annonce encore cette information (texte ou écriture en attente). Un cas
    Playwright de plus dans C11.12 : Tom, l’information, la réussite de Tom, puis l’échec
    d’Hugo moins de 100 ms après ; la région `status` garde la réussite de Tom.
  - La règle 4 de la page dit, comme le README, quand une action commence.
  - Table des états : la variante réussie renvoie à la maquette « Aucune place libre sur ce
    leg » ; la variante échouée reste sans maquette, comme avant la v4.4.2.
  - Pas encore relue en revue de design. Republiée à la même URL.
- v4.4.3 (suite) : revue de design : **approuvée**. Deux corrections de texte, appliquées
  sans nouvelle revue : « Deux suggestions retenues » au lieu de « Trois » dans l’entrée
  v4.4.2 (suite), et le point final de la ligne v4.4.3 de l’en-tête. Republiée à la même URL.
- v4.4.4 (2026-10-21) : #341 tranché, et une décision pour #267.
  - « Annuler » renvoyé depuis une ligne d’échec : le remplacement de la réussite plus récente
    est confirmé, mais il n’est plus muet. Nouvelle clé `Seat.alreadyOut`, quand personne
    n’est rendu (v4.4.4-1, v4.4.4-2).
  - `noRetour` sur « Annuler » : pas d’échec, pas d’« Annuler ». C’est la décision 44
    d’organizer-view, inscrite dans la règle 6 (v4.4.4-3).
  - L’information sur un retour supprimé : elle n’est pas écrite (décision du coordinateur sur
    #339), ou elle part avec la transition (v4.4.4-4).
  - Pour #267 : un échec `noRetourAgain` a pour sujet sa seule partie aller (v4.4.4-5).
  - Critères B1.1 à B1.7 ; C5.10 et C11.10 amendés ; table des sujets, règles 4 et 6, mots,
    états et hors-périmètre alignés. Les largeurs à 360 px notent la marge d’« Annuler » de
    language-switch v3.3.4.
  - La page ajoute la section « « Annuler » et l’information (v4.4.4) », avec quatre
    maquettes de la barre. Pas encore relue en revue de design. Republiée à la même URL.
- v4.4.4 (suite) : revue de design : changements demandés. Trois bloquants :
  - C11.12 et le point 4 de « Lecteurs d’écran » laissaient la région `status` annoncer
    l’information du retour après la transition, quand l’état sans retour arrivait par un
    échec ;
  - la règle 5 et C11.10 ignoraient la transition, que la règle 6 citait ;
  - B1.5 ne décrivait pas le test de #339.

  Neuf suggestions. Corrigé sur place, sans changer de numéro, puisque la v4.4.4 n’a pas été
  copiée dans le dépôt :
  - **Bloquants.** Point 4 et C11.12 : la transition vide la région `status` si elle annonce
    encore l’information qu’elle retire, quelle que soit la réponse ; B1.6 a une variante en
    échec (`seatTaken`, écriture en attente annulée). La règle 5 et C11.10 ajoutent la
    transition comme quatrième façon de retirer un échec (v4.4.4-6). B1.5 reprend la scène
    du test de #339 (le refus `noRetour` de Tom · Retour, son échec écrit à la fermeture),
    et dit que l’observation de la région `status` reste à y ajouter.
  - **Suggestions, toutes appliquées.** La règle 4 ne vise que `DevicePersons.noFreeSeat.*`.
    `Seat.alreadyOut` entre dans « Plusieurs prénoms », dans C11.11 et dans son Vitest. B1.2
    dit « aucun texte ». La variante aller de B1.6 dit qu’Échap ferme la feuille de Tom et
    que Tom est « Sans voiture ». B1.7 n’emploie plus d’onglet après la transition. La règle 6
    dit ce que donne la réponse (`Seat.alreadyOut`, information `noRetour`). Le tableau des
    hauteurs dit 143 px ; les nombres de lignes, mesurés, ne changent pas. v4.4.4-5 est
    notée pour la prochaine révision d’organizer-view.
  - **La page s’aligne sur le README** : règles 4, 5 et 6, « Lecteurs d’écran », la section
    « Un tap et « Annuler » », une maquette pour B1.3, la variante en échec de B1.6, C11.10
    à C11.12. Republiée à la même URL.
- v4.4.4 (suite, 2) : revue de design : changements demandés. Un bloquant : B1.5 donnait
  Tom « Sans voiture » au retour, alors que la feuille d’une cellule « Sans voiture » n’offre
  pas « Je cherche une place ». Trois suggestions. Corrigé sur place :
  - B1.5 : Tom « Ne fait pas le retour » au retour (comme `seedScene` de #339), et Léa seule
    « Sans voiture ».
  - C11.12 : une réussite qui apporte la transition et retire un échec du retour vide la
    région `alert`, comme un retrait de voiture réussi.
  - B1.6 réussie : dit que les assertions sur la région `status` ne distinguent pas une
    règle absente, et que `messages(page)` et la variante en échec le font.
  - La page : décision 4 limitée à `DevicePersons.noFreeSeat.*`, décision v4.4.4-6
    ajoutée, C11.12 aligné (la page ne détaille pas B1.5). Republiée à la même URL. Pas encore relue de nouveau.
- v4.4.5 (2026-10-21) : #359 et #313 tranchés, en amendement.
  - Une réussite de placement retenue sous une feuille n’est jamais écrite si une action
    envoyée après elle, réussie, a changé l’état d’une de ses personnes sur son leg. La barre
    ne dit rien à la place (v4.4.5-1 à v4.4.5-5, règles 1 et 2, critères S1.1 à S1.5).
  - « Valider » sans changement dans « Modifier la voiture » : la feuille se ferme, rien n’est
    envoyé ni dit, le focus va sur « Modifier » (v4.4.5-6, critères W1.1 à W1.7). Retiré du
    hors-périmètre de la v4.4.
  - Aucun mot nouveau. Table des sujets, focus, états, critères de l’epic et hors-périmètre
    alignés. La page ajoute la section « Réussite retenue, et « Modifier la voiture » sans
    changement (v4.4.5) », avec cinq maquettes. Republiée à la même URL. Pas encore relue en
    revue de design.
- v4.4.5 (suite) : revue de design : changements demandés. Un bloquant : S1.1, S1.4 et S1.5
  reposaient sur « Qui monte avec vous ? », qui n’existe que dans PR #356, et le README comme
  la page disaient « échoue sur `main` ». Sept suggestions. Corrigé sur place :
  - **Bloquant.** #359 se construit après #356 (#171) ; une table dit, pour chaque critère, son
    état sur `main`, après #356 et après #359. S1.1 garde le scénario de l’issue. S1.4 et S1.5
    passent sur la scène `takeSeats` (voiture de Sophie) et s’écrivent sur `main`, où ils
    passent déjà : ce sont des gardes.
  - **Suggestions, toutes appliquées.** « Valider » inactif renvoie à v4.4.5-6. La table du
    focus de la page a la ligne « Modifier la voiture » sans changement. Le résumé des
    maquettes dit « 2 sans voiture » (`matrixSummary`). W1 dit quand le compte des requêtes
    commence, et W1.5 repasse en ligne avant la requête suivante. La scène H5 donne Marc « Ne
    fait pas le retour ». Les états de S1.2 (Léa avec Sophie) et de S1.3 (focus sur
    « Modifier », barre vide) sont dessinés. La raison de v4.4.5-1 se limite aux mêmes
    personnes sur le même leg. Republiée à la même URL. Pas encore relue de nouveau.
- v4.4.5 (suite, 2) : revue de design : **approuvée**. Une correction de texte, appliquée sans
  nouvelle revue : S1.3 dit « Un tap sur la place libre de la voiture de Marc », puisque la
  voiture de Sophie a aussi des places libres. Republiée à la même URL.
- v4.4.6 (2026-10-22) : #372, suite de la relecture de PR #371 (#267).
  - La décision du propriétaire sur #267 est inscrite (v4.4.6-1) : l’échec hors ligne ou en
    erreur d’une offre sur les deux legs reste, réduit à l’aller, quand le retour est
    supprimé. Règle 5, table des repères et table des sujets alignées.
  - L’annonce est tranchée : réduire une ligne n’est pas l’écrire, et rien n’est annoncé.
    Une région `alert` qui contient déjà le texte entier est vidée sans être réécrite. Une
    écriture en attente écrit le texte réduit. Une région qui annonce un autre échec n’est
    pas touchée (v4.4.6-2, v4.4.6-3, « Lecteurs d’écran », points 2 et 4).
  - Critères N1.1 à N1.6 ; C11.10 et C11.12 amendés ; états, hors-périmètre alignés. Aucun
    mot nouveau.
  - La page ajoute la section « Une ligne d’échec réduite à l’aller (v4.4.6) », avec trois
    maquettes de la barre. Pas encore relue en revue de design. Republiée à la même URL.
- v4.4.6 (suite) : revue de design : **approuvée**, avec organizer-view v3.3.7. Sept
  suggestions retenues par le coordinateur, appliquées sans nouvelle revue et sans changer de
  numéro, puisque la v4.4.6 n’a pas été copiée dans le dépôt :
  - les critères A1.1 à A1.6 deviennent N1.1 à N1.6. A1.x existait déjà dans
    `docs/design/home/` et dans les titres de `e2e/home.spec.ts` et `e2e/create-event.spec.ts`.
    K1, essayé d’abord, est le critère de « Nous contacter » (#69), dans `e2e/contact.spec.ts`,
    `docs/design/home/` et `docs/design/language-switch/`. N1 n’apparaît nulle part dans
    `docs`, `e2e` ni `src` ;
  - v4.4.6-1 et « Ce que devient la ligne » : « tout autre échec **d’une offre** sur les deux
    legs ». « Ajouter une personne » avec « Aller et retour » n’est pas visé ;
  - la table de l’annonce : une écriture en attente l’est pour toute raison (les 100 ms, ou
    une feuille qui cache la page, `whenPageShown`), pas seulement pendant 100 ms ;
  - N1.4 : l’envoi d’Hugo est retenu (`loseFirst(page, "Hugo")`), la feuille fermée avant la
    réponse, puis l’envoi perdu hors ligne ; « Aller et retour » est coché. Hors ligne, un
    envoi d’une feuille ouverte répond aussitôt dans la feuille et n’atteint pas la barre ;
  - la raison de v4.4.6-3 reconnaît l’exception du point 3 : une écriture plus récente annule
    l’écriture en attente ;
  - hors-périmètre : `passengerInCar` est sur `main` depuis #356.

  organizer-view passe en v3.3.8 : « la réduction n’est pas annoncée », et la même précision
  « d’une offre ». La décision du propriétaire ne change pas. Republiée à la même URL.
- v4.4.6 (suite, 2) : relecture : **approuvée**. Corrections de texte, sans nouvelle revue :
  les critères deviennent N1.1 à N1.6 (K1 est celui de « Nous contacter », #69), et « la
  scène de N1.1 » remplace l’élision. Republiée à la même URL.
- v4.5 (2026-10-25) : #649, décision du propriétaire (options A, B et F, « des passagers »).
  - « Je ramène aussi des passagers » et « J’emmène aussi des passagers » ; en anglais,
    « I bring people back too » et « I take people there too ».
  - Une ligne d’aide sous le titre du groupe de l’autre leg, qui le décrit : « Le retour part
    de {location} le {date}. » et « L’aller va vers {location} le {date}. » (v4.5-1 à v4.5-6).
  - La phrase F pour l’entrée Leg du glossaire, que l’humain fusionne.
  - Critères H8 et E1.1 à E1.7. C4.2 et C4.11 sont amendés. Les citations des anciens
    libellés sont mises à jour, sauf celles qui disent une version passée ou une décision
    datée : « Ce qui change en v4 », les clés retirées en v4.1, les écarts, la décision de
    l’humain du 18 octobre et ce journal.
  - La page ajoute la section « L’autre leg, lu depuis l’événement (v4.5) », avec sept
    maquettes depuis la v4.5 (suite), huit à cette première publication. Les maquettes de « Proposer une voiture » ont la ligne et les nouveaux
    libellés. Republiée à la même URL.
- v4.5 (suite) : décision du coordinateur sur #649, sans changer de numéro, puisque la v4.5
  n’a pas été copiée dans le dépôt.
  - La ligne française devient « Le retour part du lieu de l’événement, {location}, le
    {date}. » et « L’aller va jusqu’au lieu de l’événement, {location}, le {date}. »
    (v4.5-7). La forme d’abord retenue ne reste qu’en note de cette décision. L’anglais ne
    change pas.
  - Mots, E1.1, E1.2, E1.6 et E1.7, maquettes alignés. Le point ouvert est retiré.
  - La note de développement est corrigée. Sur `main`, `docs/agents/glossary.md` n’est pas un
    chemin sensible, seul `docs/agents/review-checklist.md` l’est. La phrase du glossaire va
    donc dans la PR du code.
  - Pas encore relue en revue de design. Republiée à la même URL.
- v4.5 (suite, 2) : relecture de la maquette : **changements demandés**, un bloquant.
  - Bloquant : les maquettes voisines `place-autocomplete` et `organizer-view` citent et
    dessinent encore les anciens libellés, sans la ligne d’aide. Elles sont listées, ligne par
    ligne, dans « Critères de l’epic à amender », v4.5. Leurs fichiers ne sont pas modifiés ici :
    organizer-view est en cours de révision par un autre designer.
  - Suggestions appliquées :
    - E1.5 vérifie que la ligne n’est pas coupée (`scrollHeight` au plus `clientHeight`) ;
    - E1.1 a une seconde scène, avec la personne qui conduit passagère sur l’autre leg ;
    - la phrase F s’écrit avec des apostrophes droites, comme `glossary.md` ;
    - ce journal compte sept maquettes.
  - Pas encore relue de nouveau. Republiée à la même URL.
- v4.6 (2026-10-26) : #650, sur la v4.5 approuvée (artifact, version 30).
  - Sur téléphone, une feuille à champ de saisie prend toute la hauteur visible. Toute
    feuille a un en-tête et une barre d’actions fixes, et seul son corps défile. La barre
    suit le haut du clavier (`visualViewport`), et ses messages sont au-dessus du bouton
    principal. La liste des propositions peut couvrir la barre, et rien ne fait défiler la
    page derrière. Aucun mot nouveau.
  - Réponses du propriétaire sur #650 (26/10) : pleine hauteur pour les feuilles à champ de
    saisie seulement (v4.6-1) ; K2 après le déploiement, sans bloquer, et le risque de la
    barre de remplissage accepté (v4.6-8) ; le geste « retour » est #656.
  - Critères K1.1 à K1.15 (Playwright) et K2.1 à K2.7 (iPhone, à la main).
  - La page ajoute la section « Les feuilles sur téléphone (v4.6) », avec treize maquettes.
    Les maquettes de « Proposer une voiture » de la v4.5 gardent leur ligne d’aide et leurs
    libellés ; une note y renvoie à la nouvelle section pour la hauteur. Préparée en
    brouillon pendant la v4.5, puis fusionnée sur elle.
  - Pas encore relue en revue de design. Republiée à la même URL.
- v4.6 (suite) (2026-10-26) : revue de design de la v4.6, **changements demandés**, cinq
  bloquants, tous appliqués. Le numéro ne change pas, puisque la v4.6 n’a pas été copiée dans
  le dépôt. Les parties de la v4.5 ne changent pas.
  - Bloquant 1 : `RegisterSheet` (première inscription depuis une place libre, C5.4) est dans
    le tableau des feuilles, la règle 2, la barre d’actions, K1.1 et la maquette 15 (v4.6-11).
  - Bloquant 2, décision du coordinateur : « Qui sort de la voiture ? » garde la pleine
    hauteur (règles 2 et 3, v4.6-10). L’étape est dessinée (maquette 14) et testée (K1.5).
  - Bloquant 3 : la règle 5 vaut pour tout élément qui prend le focus (WCAG 2.4.11,
    v4.6-12). Nouveaux : K1.16 et la maquette 16.
  - Bloquant 4 : la règle 8 vaut à toute largeur et se lit sur `visualViewport` (règle 9,
    v4.6-13). K1.13 a une étape avec l’objet de K1.7.
  - Bloquant 5, décision du coordinateur : une seule zone qui défile. Glisser sur l’en-tête
    ou la barre peut faire défiler la feuille, jamais la page (règle 7, K1.10, K2.4,
    v4.6-14).
  - Suggestions appliquées :
    - K1.8 passe sur « Modifier la voiture », et vérifie d’abord le débordement ;
    - K1.4 passe à 360 × 480 et vérifie d’abord le débordement ; la maquette 9 n’a plus
      d’espace vide ;
    - la maquette 1b retrouve la ligne d’aide du téléphone, et la maquette 7 le champ
      « Téléphone » ;
    - sur iPhone, `scrollY` est gardé à l’ouverture et rendu à la fermeture (règle 10,
      v4.6-15, K2.5) ;
    - la tâche nomme les composants hôtes ;
    - l’alerte de « Qui sort de la voiture ? » passe dans la barre, ce qui se voit aussi sur
      ordinateur (règle 9) ;
    - la zone des messages qui déborde est nommée « Messages » et focalisable (v4.6-16).
  - Pas encore relue de nouveau. Republiée à la même URL.
- v4.7 (2026-10-26) : le geste « retour » ferme la feuille (#656, séparée de #650 par
  décision du propriétaire). Construite sur la v4.6 (suite), sans dépendre de #691 à #697
  (décision du coordinateur).
  - Le retour ferme ce qu’Échap fermerait, sur toutes les feuilles ; la boîte « Supprimer le
    retour ? » d’abord ; la liste des propositions avec sa feuille. Un retour, un pas.
  - L’adresse ne change pas, jeton d’admin compris ; rien n’est rechargé ni demandé ;
    l’historique ne porte qu’une marque opaque.
  - Une feuille fermée autrement retire son entrée, sans défaire le défilement de « Trouver
    une place ». Un retour sans effet accepté après un rechargement ou un « Suivant ».
  - Le mécanisme recommandé (`pushState` de Next sans adresse, `popstate`, `history.back()`
    à la fermeture) et ses risques, un par un.
  - Critères H9, H10, G1.1 à G1.18 (Playwright) et G2.1 à G2.9 (à la main, après le
    déploiement). Aucun mot nouveau.
  - Q1 au propriétaire : dans une étape, le retour ferme la feuille (a) ou revient à l’étape
    d’avant (b, recommandé).
  - La page ajoute la section « Le geste « retour » (v4.7) », avec treize états. Reprend la
    ligne d’amendement de visual-identity (#754) de `main`.
  - Pas encore relue en revue de design. Republiée à la même URL.
- v4.7 (suite) (2026-10-26) : réponse du propriétaire à Q1, (b), inscrite sur #656. Le
  numéro ne change pas : la v4.7 n’a pas été copiée dans le dépôt.
  - Règle 3 : dans une étape, le retour revient à l’étape d’avant, comme « Annuler », ses
    changements gardés ; un second retour ferme la feuille. Échap ne change pas. La règle 1
    le note ; le mécanisme ajoute l’entrée de l’étape, et la fermeture depuis l’étape retire
    les deux entrées (nouveau risque dans la table).
  - G1.17 et G2.9 ne gardent que ce cas, avec « Annuler » de l’étape, sa fermeture par Échap
    ou « Valider », et la feuille d’une place. v4.7-11 devient la décision. La branche (a)
    est retirée.
  - La page : les états 8a et 8b montrent l’étape puis le formulaire revenu, une pile « Une
    étape, puis retour » s’ajoute à l’historique, et la question devient la décision. La
    liste des états du README suit la numérotation de la page : onze états et sept piles.
  - Pas encore relue en revue de design. Republiée à la même URL.
- v4.7 (suite 2) (2026-10-26) : revue de design de la v4.7 (suite), **changements
  demandés**, deux bloquants, appliqués. Le numéro ne change pas : la v4.7 n’a pas été
  copiée dans le dépôt.
  - Bloquant 1 : les étapes et la boîte s’ouvrent et se ferment aussi sur une réponse du
    serveur. Nouvelle règle 3 bis et décision v4.7-12 : toute ouverture ajoute un pas, un
    nouveau tour n’en ajoute pas, toute fin la feuille restant ouverte en retire un, fermer
    la feuille depuis l’intérieur en retire deux. Le mécanisme et la table des risques
    suivent. G1.15 gagne `saved`, `changed`, `confirmRetour` et « Annuler » ; G1.17 gagne
    l’étape ouverte par la réponse, rouverte, et finie par `errors` ou par des places qui
    tiennent. Le dernier point de G1.17 suit le code : « Valider » d’« Ajouter une
    personne » ramène à la liste, puis un retour ferme la feuille.
  - Écart avec la revue, sur un point : pour « Supprimer le retour », c’est `errors` (un
    champ refusé), avec `changed`, qui ferme la boîte seule. Un refus `invalid` la laisse
    ouverte, avec « failed » (`edit-event-sheet.tsx:259–265`). G1.15 suit le code.
  - Bloquant 2 : la classe des entrées de feuille dans les piles devient `bk-sh` ; `sheet`
    reprenait la règle `.sheet` de la page, fond blanc sous un texte clair en thème sombre.
  - Suggestions appliquées : la maquette 8b met le focus sur « Places, sans compter qui
    conduit » après le retour, comme « Annuler » (`ride-form.tsx:350–361`) ; la règle de
    Chrome dit « une action de la personne depuis l’entrée précédente » ; G1 ne compte pas
    les préchargements `Next-Router-Prefetch` (« Nous contacter » est un `<Link>`) ;
    v4.7-9 cite la décision du coordinateur sur #656.
  - Pas encore relue de nouveau. Republiée à la même URL.
- v4.8 (2026-10-26) : le numéro au bon moment, obligatoire pour qui conduit (#766,
  décisions du propriétaire Q1 b, Q2 b, Q3 a). Construite sur la v4.7 (suite 2), approuvée,
  version 35 de l’artifact ; la v4.7 n’y change pas d’un octet.
  - La fiche demande un numéro quand aucune personne de l’appareil qui s’y trouve n’en a :
    un message par fiche, un bouton qui ouvre « Modifier {prénom} », le focus dans le
    téléphone.
  - « Ajouter une personne » reprend le numéro de la dernière personne de l’appareil qui en
    a un. Depuis une place libre, l’aide dit pourquoi.
  - « Proposer une voiture » demande un numéro à qui conduit, nouvelle personne ou personne
    de l’appareil sans numéro, écrit avec la voiture. Vider son numéro est refusé tant
    qu’on conduit. Les conducteurs d’avant restent tels quels.
  - Rien de montré aux autres. Qui voit un numéro ne change pas. Aucun changement dans
    l’espace organisateur.
  - Critères H11 à H13, T1.1 à T6.3. Treize clés nouvelles. Décisions v4.8-1 à v4.8-17 ;
    v4.8-8 confirmée par le coordinateur. `glossary.md` et `product.md` dans la PR de la
    tâche 1 (pas sensibles sur `main`) ; `review-checklist.md` à part.
  - La page ajoute la section « Le numéro au bon moment (v4.8) », avec dix-sept états.
  - Pas encore relue en revue de design. Republiée à la même URL : version 36 de l’artifact,
    `index.html` sha1 `eb4214c7caae512c206fc3a419f482e4b05d7638`.
- v4.8, « des personnes » (2026-10-26) : décision du propriétaire sur #649 du 26/10, pour la
  règle épicène C11.9 (D7). « Je ramène aussi des passagers » et « J’emmène aussi des
  passagers » deviennent « Je ramène aussi des personnes » et « J’emmène aussi des
  personnes » dans les mots de la v4.5 et la table générale, les critères (E1, et ceux des
  autres versions qui les citent), les états, la table des échecs et les maquettes.
  L’anglais ne change pas. `main` porte déjà ces libellés. Restent tels quels, comme
  historique : la ligne v4.5 de la liste des versions, et ces révisions.
- v4.8 (suite) (2026-10-26) : revue de design de la v4.8, modifications demandées.
  - Bloquant, tranché par le coordinateur (v4.8-18) : le serveur ne lit pas la valeur de
    `phone` pour savoir si qui conduit en a un. C’est une condition de présence sous le
    verrou de la Person (`phone IS NOT NULL`), qui rend un booléen. `phone-visibility.ts`
    et `event-rows.ts` ne changent pas. Règles 7 et 8, T4.7, T5.6 et T6.2 le disent. La
    documentation ajoute les lignes d’`architecture.md` (tâche 1) et de
    `review-checklist.md` (PR à elle, fusionnée par le propriétaire).
  - « Pas de numéro pour qui conduit » et « numéro vidé par qui conduit » deviennent des
    refus qui portent l’état (`driverWithoutPhone`, `phoneWhileDriving`, v4.8-19) : la page
    retire le lien `tel:` périmé et montre le champ en erreur. T4.8, T5.5 et T5.7 suivent.
    Deux clés nouvelles, `Actions.why.driverWithoutPhone` et
    `Actions.why.phoneWhileDriving`, pour la barre quand la feuille est fermée, et deux
    lignes dans « Chaque échec, mot pour mot ».
  - v4.5-1 rendue telle que décidée, avec la note « Devenu « des personnes » en v4.8,
    décision du propriétaire du 26/10 (#649). »
  - La page ajoute l’état 18 : « Téléphone de Claire » en erreur après le refus du
    serveur.
  - La v4.7 n’y change pas d’un octet. Republiée à la même URL : version 37 de l’artifact,
    `index.html` sha1 `3d949fe67e46a1bc32569bdc1d637a967b6ba59a`.
- v4.9 (2026-10-31) : l’icône de voiture devant « Voiture de… » (demande du propriétaire).
  Aucun mot nouveau. La page ajoute la section « L’icône de voiture de l’en-tête (v4.9) » et
  l’icône dans les 36 en-têtes de fiche déjà dessinés. Critères CI1.1 à CI1.8. Republiée à la
  même URL. Pas encore relue en revue de design.
