# Changer de langue

- Artifact : https://claude.ai/artifact/QuLmJJeHC1vhFjxctxo4eG
- Epic : https://github.com/olaurendeau/fullcar/issues/113
- v3, revue en v3.1, v3.2, v3.3 et v3.3.1 (approuvée) : l’anneau de focus, pour toute l’application. Tâche :
  https://github.com/olaurendeau/fullcar/issues/236 ; inclut la règle de #314
- v3.3.2 : F1.12 lit aussi les fichiers `.ts` de `src/`, sauf les `.test.ts` et `.spec.ts`
  (#337, PR #342)
- v3.3.3 : le pointeur, pour toute l’application (#347) : la main sur ce qui se clique, la
  flèche sur ce qui est inactif ; « Placer » inactif passe de `not-allowed` à la flèche
- Page : `index.html` (autonome, maquettes à 360 px de large). Les sections de la v2
  montrent l’écran tel qu’il était le 17/10 (en-tête « Aller » / « Retour », bas de page sans
  « Accueil ») : seules les sections « L’anneau de focus (v3) » et « Le pointeur (v3.3.3) »
  sont à jour de l’écran actuel.

## Ce qui change en v3.3.3 : le pointeur (#347)

### Pourquoi dans cette maquette

Pour la même raison que l’anneau (décision 7) : c’est une règle de toute l’application, posée
une fois dans `src/app/globals.css`, et cette maquette dessine toutes les pages. Une maquette
d’écran (`event-board`, `organizer-view`) n’en porterait qu’un morceau (décision 18).

### Le problème

Sur ordinateur, à la souris, le pointeur reste une flèche au survol d’un bouton. Depuis
Tailwind 4, `preflight` ne donne plus `cursor: pointer` à `<button>`, et aucun composant ne le
remet. Une personne qui survole une place libre, une cellule de la matrice, un onglet ou
« Fermer » ne voit pas que c’est cliquable. Les liens (`<a href>`) ont déjà la main, que leur
donne le navigateur ; les `<label>` des cases et des boutons radio aussi (`cursor-pointer`).

### La règle

1. **La main** (`cursor: pointer`) sur tout `<button>` et tout élément `role="button"`
   **actifs**. Cela couvre, sans classe de plus : les boutons de toutes les variantes ; les
   onglets, les cases et les boutons radio (Radix en fait des `<button>`) ; les prénoms et
   les cellules de la matrice ; le bouton de « Vos inscriptions » ; les places libres ; les
   tuiles de l’espace organisateur et le bouton qui le replie ; le bouton de langue ; ce qui
   ouvre une feuille ou la confirmation (« Modifier », « Retirer la voiture », « Ajouter une
   personne », « Proposer une voiture », « Voir la voiture ») ; « Fermer » des feuilles et de la
   barre ; « Annuler », celui de la confirmation « Retirer la voiture ? » comme celui de la
   barre, après une réussite (#340) ; « Copier », « Partager », « Actualiser », « Réessayer », « Afficher
   les N autres ». Ce que contient le bouton (icône, texte) hérite de la main.
2. **Les liens** (« Accueil », « Nous contacter », `tel:`, « Créer un événement ») et les
   `<label>` qui portent une case ou un bouton radio gardent la main qu’ils ont déjà.
3. **Inactif** (`disabled` ou `aria-disabled="true"`) : la flèche (`cursor: default`),
   jamais la main, jamais `not-allowed`. C’est la convention des systèmes (un bouton inactif
   de macOS ou de Windows montre la flèche) et celle du `preflight` de Tailwind 3. « Placer »
   inactif passe donc de `not-allowed` à la flèche (règle 7 de la v3, décision 19).
4. **Les champs** gardent le curseur du navigateur ; la règle ne les touche pas. Un champ de
   texte, de téléphone ou une zone de texte montre le curseur texte (`text`) ; un champ de
   date ou d’heure, la flèche (`default`), que Chromium lui donne. Le libellé d’un champ
   (« Titre ») garde la flèche (`default`) du navigateur.
5. **Ce qui n’est pas cliquable ne change pas** : le panneau d’onglet, la liste de la barre,
   les titres et les repères, même focalisables, gardent `auto`.
6. **Sans condition de média** : la règle ne teste ni `hover` ni `pointer: fine`. Un écran
   tactile ne dessine aucun pointeur ; la condition n’ajouterait qu’une branche que le projet
   e2e (Pixel 7, tactile) ne pourrait pas lire (décision 20).

### Où le pointeur change

| fichier | élément | aujourd’hui | v3.3.3 |
|---|---|---|---|
| `src/app/globals.css` | règle de base | aucune règle de pointeur | la main sur `button` et `[role="button"]` ; la flèche s’ils sont inactifs |
| `src/components/event/seat-sheet.tsx:367` | « Placer » inactif | `aria-disabled:cursor-not-allowed` | classe retirée : la flèche, par la règle de base |
| `src/components/ui/checkbox.tsx`, `radio-group.tsx` | case, bouton radio inactifs (aucun ne l’est aujourd’hui) | `disabled:cursor-not-allowed` | classe retirée : la flèche |
| `src/components/ui/button.tsx` | bouton `disabled` | `disabled:pointer-events-none` | inchangé : le survol traverse le bouton, et la flèche reste |
| `src/components/ui/input.tsx`, `textarea.tsx`, `label.tsx` | champ, libellé inactifs (aucun ne l’est) | `disabled:cursor-not-allowed`, `peer-disabled:cursor-not-allowed` | inchangés, hors périmètre |
| `event-fields.tsx:143`, `leaving-step.tsx:60`, `ride-form.tsx:464`, `ride-form.tsx:506` | `<label>` d’une case ou d’un bouton radio | `cursor-pointer` | inchangés |

### Les états

| état | ce qui se voit à la souris | critère |
|---|---|---|
| un bouton, un onglet, une case, une cellule, une place libre, actifs | la main | P1.1 à P1.9 |
| un lien | la main (inchangé) | P1.1, P1.2, P1.4 |
| le libellé d’une case ou d’un bouton radio | la main (inchangé) | P1.2, P1.6 |
| un champ de texte, de téléphone, une zone de texte | le curseur texte, `text` (inchangé) | P1.2, P1.6 |
| un champ de date, d’heure ; le libellé d’un champ | la flèche, `default` (inchangé) | P1.2, P1.6 |
| un bouton `disabled` : avant le chargement, sans JavaScript, pendant un envoi, pendant la lecture des personnes de l’appareil | la flèche | P1.3, P1.5, P1.7 |
| un bouton `aria-disabled` : « Placer » sans case cochée, « Actualiser » pendant une lecture | la flèche | P1.6, P1.9 |
| ce qui n’est pas cliquable : panneau d’onglet, titre, liste de la barre | inchangé, `auto` | P1.1, P1.4, P1.8 |
| un écran tactile | aucun pointeur ; la valeur calculée est la même | P1.10 |
| vide, hors ligne, échec | sans objet : le pointeur ne dépend d’aucune donnée | — |

### Les mots de la v3.3.3

Aucun. Le pointeur n’a pas de texte, et aucun nom accessible ne change.

### Critères de la v3.3.3

**H2. Voir ce qui se clique.** En tant que personne qui utilise une souris, je vois au survol,
à la main, ce qui réagit à un clic, et à la flèche ce qui est inactif.

**La lecture** : `cursorOf(locator)`, une aide de test dans `e2e/`, rend
`getComputedStyle(element).cursor`, lu une fois l’élément visible. La valeur calculée ne
dépend pas du survol : le test n’a pas besoin de `hover()`. Les valeurs attendues, chacune
exacte : **la main** = `pointer` ; **la flèche** = `default` ; **le texte** = `text` ;
`auto` est nommé là où il est attendu. Ce que le navigateur donne sans la règle, mesuré en
revue dans le Chromium de Playwright 1.64 (Pixel 7 et Desktop Chrome) : `text` pour un champ
de texte, de téléphone et une zone de texte ; `default` pour un champ de date ou d’heure et
pour un `<label>` ; `auto` pour un titre, un paragraphe et un `role="tabpanel"` ; `pointer`
pour un lien. Les tests tournent dans le projet `e2e` (Pixel 7), page en français
(`locale: "fr-FR"`) ; P1.10 dans un contexte de bureau.

- **P1.1** `/` : « Créer un événement » (lien), « English » et « Nous contacter » ont la
  main. Le titre « Fullcar » a `auto`.
- **P1.2** `/nouveau`, une fois la page hydratée (« Créer » actif) :
  - la main : « Créer » ; la case « Retour » (`role="checkbox"`) et le `<label>` qui la
    contient ; la case « Rehausseurs » et son `<label>` ; « Accueil » ; « English » ;
  - le texte : le champ « Titre » ;
  - la flèche : les champs « Date de début » (date) et « Heure de début » (heure), et le
    libellé « Titre » (`<label>` d’un champ), tels que le navigateur les donne.
- **P1.3** `/nouveau` sans JavaScript (`javaScriptEnabled: false`) : « Créer » et « English »
  sont `disabled` (L4.3) et ont la flèche ; « Accueil » et « Nous contacter » ont la main.
- **P1.4** `/e/{id}`, la scène de F1.3 (Claire conduit à l’aller, Léa est passagère de Marc et
  a un numéro), onglet Aller :
  - la main : les onglets « Aller » et « Retour » (`role="tab"`) ; le bouton de « Vos
    inscriptions » ; le prénom « Claire » et la cellule « Léa, Aller : Avec Marc » de la
    matrice ; une place libre de la voiture de Claire (« Place libre : prendre une place dans
    la voiture de Claire ») ; « Modifier » et « Retirer la voiture » de sa carte ; le lien
    « Appeler Léa au 07 22 33 44 55 » ; « Ajouter une personne » ; « Proposer une voiture » ;
    « Accueil », « English », « Nous contacter » ;
  - `auto` : le panneau d’onglet (`role="tabpanel"`) et le titre de l’événement.
- **P1.5** `/e/{id}`, pendant la lecture des personnes de l’appareil : la scène de P1.4, les
  actions serveur retenues avant le chargement (`holdActions`, `e2e/device.ts:21`, comme
  C5.9) : « Ajouter une personne », « Proposer une voiture » et chaque place libre sont
  `disabled` et ont la flèche. Les actions relâchées, ils sont actifs et ont la main.
- **P1.6** Les feuilles :
  - « Proposer une voiture », ouverte dans la scène de P1.4 : un bouton radio de « Qui
    conduit ? » et le `<label>` qui le contient, « Valider » et « Fermer » ont la main ;
    « Lieu de départ » (texte) et « Note (facultatif) » (zone de texte) ont le texte ;
    « Heure de départ » (heure) a la flèche ;
  - la feuille des places, dans la scène de F1.9 (Tom et Léa sans voiture, la voiture de
    Sophie) : chaque case, son `<label>` et « Fermer » ont la main. Toutes les cases
    décochées, « Placer » (`aria-disabled="true"`) a la flèche ; la case de Tom seule
    cochée, « Placer 1 personne » a la main ;
  - la feuille d’une personne, ouverte par le prénom « Claire » (scène de P1.4) :
    « Modifier » a la main ; après « Modifier », « Prénom » a le texte, « Valider » et
    « Fermer » ont la main.
- **P1.7** La confirmation « Retirer la voiture ? », ouverte depuis la carte de Claire (scène
  de P1.4) : « Retirer la voiture » et « Annuler » ont la main. Les actions retenues
  (`holdActions`), « Retirer la voiture » activé : il est `disabled` pendant l’envoi et a la
  flèche.
- **P1.8** La barre de messages : à la suite de P1.6 (feuille des places), « Placer
  1 personne » activé, la feuille se ferme et la barre (`[data-message-bar]`) affiche « Tom
  est dans la voiture de Sophie ». Son « Annuler » (#340) et son « Fermer » ont la main ; la
  liste des messages (le groupe « Messages ») a `auto`.
- **P1.9** `/e/{id}/admin` avec un lien valide, `navigator.share` simulé comme en F1.7, et une
  liste « Sans voiture » de plus de cinq lignes : le bouton qui replie l’espace (« Espace
  organisateur »), une tuile, « Copier », « Partager », « Actualiser » et « Afficher les N
  autres » ont la main. Les lectures du panneau retenues (`holdActionsWith` sur le jeton,
  comme `holdPanelReads`), « Actualiser » activé : il est `aria-disabled="true"` et a la
  flèche ; la lecture relâchée, il a la main.
- **P1.10** Sur ordinateur : un contexte `devices["Desktop Chrome"]`, sans écran tactile,
  où le test vérifie d’abord que `matchMedia("(pointer: fine)").matches` vaut `true`. Sur
  `/`, « Créer un événement » et « English » ont la main : la règle ne dépend pas de
  l’appareil.
- **P1.11** Le scan de F1.12 (les fichiers `.tsx`, `.css` et `.ts` de `src/`, sauf les
  `.test.ts` et `.spec.ts`) ne trouve l’utilitaire `cursor-not-allowed`, quelles que soient
  ses variantes, que dans `input.tsx`, `textarea.tsx` et `label.tsx`. Ailleurs, une classe de
  composant battrait la règle de base, qui est dans la couche `base`.

**Non prouvable par un test** : que la main se voie au survol réel d’une souris. La valeur
calculée en est la mesure ; un survol à l’œil sur ordinateur, une fois, reste utile.

### Pour le développement

- La règle, dans la couche `base` de `src/app/globals.css` :

  ```css
  button, [role="button"] { cursor: pointer; }
  :is(button, [role="button"]):is(:disabled, [aria-disabled="true"]) { cursor: default; }
  ```

  La seconde ligne est plus spécifique que la première et l’emporte sur un élément inactif.
- Retirer `aria-disabled:cursor-not-allowed` de « Placer » (`seat-sheet.tsx:367`), et
  `disabled:cursor-not-allowed` de `checkbox.tsx` et `radio-group.tsx` : un utilitaire est
  dans la couche `utilities`, qui bat `base`.
- Ne pas ajouter `cursor-pointer` composant par composant : une seule règle (P1.11 garde
  l’autre sens).

### Hors périmètre de la v3.3.3

- Le survol lui-même (couleurs de fond au survol) : inchangé.
- Les champs et libellés inactifs : aucun n’existe ; leurs classes shadcn restent.
- Le fond de la feuille (`overlay`), qui la ferme au clic : la flèche, comme le veut la
  convention d’un fond de boîte de dialogue.
- Le widget Crisp, qui n’est pas à nous.

## Ce qui change en v3 : l’anneau de focus (#236), revu en v3.1

### Pourquoi dans cette maquette

L’anneau de focus est le même sur tous les écrans : il vient d’un jeton (`--ring`) et des
composants de `src/components/ui/`. Il lui faut une seule maquette, la plus globale. C’est
celle-ci (décision 7) :

- son bouton est dans le bas de page partagé, sur **toutes** les pages ;
- c’est la seule maquette qui dessine déjà toutes les pages : l’accueil, la page d’un
  événement, l’espace organisateur, l’événement introuvable ;
- l’anneau mesuré par #236 est celui de ce bouton, et la décision 9 de la maquette `home`
  le recopie pour « Accueil ».

Les autres maquettes (`event-board`, `home`, `organizer-view`) gardent l’ancien anneau dans
leurs dessins jusqu’à leur prochaine révision. Elles renvoient ici.

**#314** (les repères focalisés par le script sans aucun anneau) suit la même règle : la v3.1
l’y inclut (décision 16). Les critères de ses repères sont F1.17 ; le découpage en tâches
reste au coordinateur.

### Le problème

Une personne qui se déplace au clavier (Tab, flèches, ou un contacteur) ne voit presque pas
où est le focus. L’anneau actuel, `focus-visible:ring-3 focus-visible:ring-ring/50`, est un
halo de 3 px de `#a1a1a1` à 50 % d’opacité. WCAG 1.4.11 demande 3:1 contre les couleurs
voisines. Mesuré :

| où | ancien anneau | contraste |
|---|---|---|
| fond blanc (`background`) | `#d0d0d0` (ring/50 sur blanc) | 1,54:1 |
| fond `muted` (`#f5f5f5`, la barre des onglets) | ring/50 sur `muted` | 1,49:1 |
| barre de messages sombre (`primary`, `#171717`) | ring/50 sur `primary` | 2,68:1 |
| onglets : contour de 1 px `outline-ring` en plus | `#a1a1a1` | 2,58:1 sur blanc, 2,37:1 sur `muted` |
| bouton de variante `destructive` : `ring-destructive/20` | rouge à 20 % sur blanc | 1,44:1 |
| panneau d’onglet, titre de l’événement, titres de leg et de liste de l’organisateur, alerte « lien non valide », « Chargement… » | `outline-none`, aucun anneau | — |

Aujourd’hui, rien ne remplace l’anneau : la personne cherche à l’œil quel élément a changé.

### La règle

1. **La forme.** Un contour plein de **2 px**, à **2 px** du bord de l’élément, qui suit ses
   coins arrondis : `outline: 2px solid var(--ring); outline-offset: 2px`. Au focus, aucun
   halo (`box-shadow`) ne s’ajoute.
2. **La couleur.** Le jeton `--ring` passe de `oklch(0.708 0 0)` (`#a1a1a1`) à
   `oklch(0.556 0 0)` (`#737373`), la valeur de `--muted-foreground`, **opaque**. Une seule
   couleur partout (décision 9).
3. **Le décalage de 2 px** laisse voir le fond de l’endroit entre l’élément et le contour.
   Le contour ne touche donc que ce fond, quelle que soit la couleur de l’élément : un bouton
   rouge, un bouton noir, une cellule ambre (décision 8).
4. **Trois décalages, pas un** (décisions 10 et 14) :
   - **2 px**, partout par défaut ;
   - **0 px** dans la barre de messages : « Fermer » et la liste des messages, focalisable
     quand elle défile (#311). La barre n’a que 4 px de marge intérieure en haut, en bas et à
     droite : à 2 px, le bord extérieur du contour toucherait la bordure de la barre, rouge
     (`#e7000b`) quand elle porte un échec, soit 1,01:1. À 0 px, il reste 2 px du fond de la
     barre entre le contour et la bordure ;
   - **−2 px** (à l’intérieur) pour le bouton qui replie l’espace organisateur : il touche
     « Actualiser », sans espace entre eux (décision 26 d’organizer-view). Un contour
     extérieur passerait sur la bordure d’« Actualiser ».

   « Annuler », **dans** la liste de la barre depuis #340, prend 0 px comme « Fermer » : le
   code lui donne `focus-visible:outline-offset-0` (`message-bar.tsx`), et sa rangée lui
   laisse 4 px en haut et en bas. Son côté droit, lui, est coupé par la liste, qui défile et
   ne lui laisse aucune marge à droite : le contour n’est pas entier, ce que la mesure a
   confirmé ; voir l’issue ouverte, liée sur la PR de #347. Aucun critère F1 ne le mesure
   (corrigé en v3.3.3 : la v3 le disait non construit et lui prédisait −2 px).
5. **Partout où un élément reçoit le focus** : boutons de toutes les variantes,
   `destructive` compris ; liens (« Accueil », « Nous contacter », `tel:`, « Créer un
   événement ») ; champs, zone de texte, cases, boutons radio ; onglets et **panneau
   d’onglet** (Radix le met dans l’ordre de Tab) ; prénoms et cellules de la matrice ; bouton
   de « Vos inscriptions » ; places libres ; tuiles de l’espace organisateur ; ce bouton de
   langue ; la liste et « Fermer » de la barre ; et **les repères que le script focalise** :
   titre d’une carte, bandeau de couverture, lignes des listes de l’organisateur (qui ont
   déjà un anneau), et ceux de #314 (titre de l’événement, titres de leg et de liste de
   l’organisateur, alerte « lien non valide », « Chargement de vos inscriptions… »). Un
   élément sans style à lui prend le même contour par la règle de base.
6. **Les champs** gardent en plus leur bordure de focus (`border-ring`, désormais `#737373`).
   Un champ **en erreur** montre son halo rouge (`ring-destructive/20`) **seulement quand il
   n’a pas le focus**. Au focus, il garde sa bordure rouge et son message, et n’a aucun halo :
   à côté du contour, le halo (`#faccce`) ferait 3,3:1 et mêlerait deux signaux
   (décision 11). Sans le focus, rien ne change.
7. **Rien de ce qui reçoit le focus n’est translucide**, avec ou sans le focus : l’opacité
   s’appliquerait aussi au contour (1,96:1 à 50 %). Un bouton **inactif** qui garde le focus,
   `aria-disabled` (« Placer » de la feuille des places), le dit par ses couleurs et non plus
   par son opacité : fond `muted` (`#f5f5f5`), texte `muted-foreground` (`#737373`, 4,35:1),
   même libellé, curseur flèche (`default` depuis la v3.3.3, qui remplace `not-allowed` :
   règle 3 du pointeur, décision 19). Actif, il reste noir (`primary`). Le contour
   l’entoure comme les autres, sur le blanc de la feuille (décision 15).
8. **À la souris, rien ne change** : le contour suit `:focus-visible`. Un clic sur un bouton
   ne le montre pas ; un clic dans un champ de texte le montre, comme le fait le navigateur.
9. **En couleurs forcées** (thèmes de contraste de Windows), le contour reste, dans la
   couleur du système ; un `box-shadow` y disparaîtrait.

### Les contrastes du nouvel anneau

`#737373`, mesuré avec la formule de WCAG 2.x (luminance relative) :

| fond touché par le contour | où | contraste |
|---|---|---|
| blanc `#ffffff` (`background`, `popover`) | pages, feuilles, cartes, barre en échec, boîte de confirmation (ses deux boutons) | 4,74:1 |
| `muted` `#f5f5f5` | barre des onglets, rangées de passagers (lien `tel:`) | 4,35:1 |
| `primary` `#171717` | barre de messages avec une réussite seule (« Fermer », la liste) | 3,78:1 |
| `amber-100` `#fef3c6` | aucun contour ne le touche (décalage) ; pour mémoire | 4,26:1 |
| rouge `#e7000b` | aucun contour ne le touche : décalage du bouton rouge, décalage de 0 dans la barre ; collé, ce serait | 1,01:1 |

Le seuil est 3:1.

### Où l’anneau apparaît aujourd’hui

| fichier | élément | aujourd’hui | v3.1 : décalage, fond touché |
|---|---|---|---|
| `src/app/globals.css` | règle de base `*` | `outline-ring/50` ; le navigateur dessine son contour `auto` | 2 px, selon l’endroit |
| `src/components/ui/button.tsx` | toutes les variantes | `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50` ; `destructive` : `focus-visible:border-destructive/40 focus-visible:ring-destructive/20` | 2 px, blanc ou `primary` |
| `src/components/ui/input.tsx`, `textarea.tsx` | champs | `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50` ; en erreur `aria-invalid:ring-3 aria-invalid:ring-destructive/20` | 2 px, blanc ; halo d’erreur hors focus seulement |
| `src/components/ui/checkbox.tsx`, `radio-group.tsx` | cases, boutons radio | idem | 2 px, blanc |
| `src/components/ui/tabs.tsx` | onglet (`TabsTrigger`) | `focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring` | 2 px, `muted` |
| `src/components/ui/tabs.tsx` | panneau (`TabsContent`) | `outline-none` | 2 px, blanc |
| `src/components/ui/alert-dialog.tsx` | contenu (focalisé par Radix en repli) | `outline-none` | `outline-hidden` |
| `src/components/event/remove-ride-dialog.tsx` | « Retirer la voiture » (`Button`, `bg-destructive`), « Annuler » (`AlertDialogCancel`) | `Button` | 2 px, blanc (`bg-popover`) |
| `src/components/i18n/language-switch.tsx` | ce bouton | `focus-visible:ring-3 focus-visible:ring-ring/50` | 2 px, blanc |
| `src/components/contact/contact-footer.tsx` | « Accueil » ; « Nous contacter » (sans classe) | idem ; règle de base | 2 px, blanc |
| `src/components/event/persons-matrix.tsx` | prénom, cellule | idem | 2 px, blanc |
| `src/components/event/device-persons.tsx` | bouton de « Vos inscriptions » ; « Chargement… » (repère, #314) | idem ; `outline-none` | 2 px, blanc |
| `src/components/event/coverage-banner.tsx` | bandeau (repère) | idem | 2 px, blanc |
| `src/components/event/ride-card.tsx` | titre de la carte (repère), place libre | idem | 2 px, blanc |
| `src/components/event/phone-link.tsx` | lien `tel:` (sans classe) | règle de base | 2 px, blanc ou `muted` |
| `src/components/event/event-view.tsx` | titre de l’événement (repère, #314) | `outline-none` | 2 px, blanc |
| `src/components/event/organiser-tiles.tsx` | tuile | `focus-visible:border-ring` + idem | 2 px, blanc |
| `src/components/event/organiser-lists.tsx` | ligne (repère) ; titre de liste (repère, #314) | idem ; `outline-none` | 2 px, blanc |
| `src/components/event/organiser-leg.tsx` | titre de leg (repère, #314) | `outline-none` | 2 px, blanc |
| `src/components/event/admin-panel.tsx` | bouton qui replie l’espace ; alerte « lien non valide » (repère, #314) | idem + `focus-visible:ring-inset` ; `outline-none` | −2 px, blanc ; 2 px, blanc |
| `src/components/event/message-bar.tsx` | la liste (`focus-visible:ring-3 focus-visible:ring-ring/50`, #311), « Fermer » (`Button`) | idem | 0 px, `primary` ou blanc |
| `src/components/event/seat-sheet.tsx` | « Placer » `aria-disabled` | `aria-disabled:opacity-50` | 2 px, blanc ; inactif en couleurs |

### Les états

| état | ce qui se voit | critère |
|---|---|---|
| un élément atteint au clavier, sur fond blanc | contour `#737373` de 2 px à 2 px, 4,74:1 | F1.1 à F1.4 |
| un onglet, sur la barre des onglets | idem, 4,35:1 | F1.3 |
| le bouton rouge et « Annuler » de la confirmation | idem, sur le blanc de la boîte, 4,74:1 | F1.5 |
| « Fermer » de la barre avec une réussite (fond sombre) | contour à 0 px, 3,78:1 | F1.6 |
| « Fermer » de la barre avec un échec (bordure rouge) | contour à 0 px, 2 px de blanc avant la bordure | F1.6 |
| la liste de la barre qui défile, atteinte par Tab | contour à 0 px | F1.6 |
| le bouton qui replie l’espace organisateur | contour à −2 px | F1.7 |
| un champ en erreur qui a le focus | contour, bordure rouge, pas de halo | F1.8 |
| « Placer » inactif, avec et sans le focus | fond gris, texte gris, opaque ; contour au focus | F1.9 |
| un clic de souris sur un bouton | pas de contour | F1.10 |
| couleurs forcées | le contour reste | F1.11 |
| un repère focalisé par une action | le même contour | F1.16, F1.17 |
| sans JavaScript | le même contour, sur ce qui reste focalisable (liens) | F1.18 |
| hors ligne, chargement, vide | sans objet : l’anneau ne dépend d’aucune donnée | — |

### Les mots de la v3

Aucun. L’anneau n’a pas de texte, et aucun nom accessible ne change. « Placer » inactif garde
son libellé.

### Critères de la v3

**H1. Voir où est le focus.** En tant que personne qui se déplace au clavier, je vois à tout
moment quel élément a le focus, sur fond blanc, gris ou sombre, sans avoir à le chercher.

**Les couleurs se lisent en sRGB.** `getComputedStyle` rend `oklch(…)` ou `oklab(…)`, avec
une opacité, et non `rgb(…)`. Chaque couleur lue passe par un canevas, comme `rgb()` de
`e2e/ride-remove.spec.ts:73` : on la peint sur un pixel et on relit `getImageData`, qui
rend `r, g, b` et l’opacité `a`. Les valeurs attendues ci-dessous sont celles de cette
lecture.

**La mesure** (une aide de test, par exemple `ringContrast(locator)` dans `e2e/`) :

0. **valeurs stables** (v3.2, précisé en v3.3) : les composants ont `transition-all` ou
   `transition-colors`, et les feuilles apparaissent en fondu. Avant de lire, on attend la
   fin des seules animations **finies** : celles de `document.getAnimations()` dont
   `effect.getTiming().iterations !== Infinity`, par `Promise.allSettled` sur leurs promesses
   `finished` : une transition annulée rejette sa promesse (`AbortError`), et ce rejet ne
   doit pas faire échouer l’attente (v3.3.1). Les
   animations sans fin (l’icône qui tourne de « Chargement de vos inscriptions… »,
   `device-persons.tsx:88` ; celle de `ReadButton` pendant une lecture, `read-button.tsx:30` ;
   la ligne de chargement de l’organisateur, `organiser-screen.tsx:144`) sont ignorées : les
   attendre bloquerait le test. Puis la mesure est relue par `expect.poll` jusqu’à ce
   qu’elle passe ou que le délai expire ;
1. l’élément reçoit le focus **au clavier** : Tab, Maj+Tab, ou les flèches dans un groupe à
   tabindex mobile (onglets, boutons radio de Radix), jamais par `focus()`. Un repère le
   reçoit par l’action au clavier qui l’y envoie dans l’application ;
2. `outlineStyle` = `solid`, `outlineWidth` = `2px`, `outlineColor` lu en sRGB =
   `rgb(115, 115, 115)` et opaque, et `outlineOffset` = `2px` (`0px` dans la barre, `-2px`
   pour le bouton qui replie l’espace) ;
3. le fond touché : en remontant depuis le parent de l’élément (depuis l’élément lui-même
   pour `-2px`), on compose les `backgroundColor` lus en sRGB, avec leur opacité, jusqu’à une
   couleur opaque ; à défaut, le blanc de la page ;
4. le contraste entre le contour et ce fond, par la formule de WCAG 2.x, vaut **au moins
   3** ; le message d’échec donne l’élément, le fond et le rapport à deux décimales ;
5. le produit des `opacity` de l’élément et de ses ancêtres vaut 1 ;
6. le `boxShadow` au focus n’a **aucun calque visible de plus** que sans le focus. Un calque
   est visible si sa couleur, lue en sRGB, a une opacité non nulle et si l’un de ses
   décalages, son flou ou son extension n’est pas nul. (Tailwind écrit toujours plusieurs
   calques, transparents quand ils ne servent pas : on ne compare donc pas la chaîne.)

Critères :

- **F1.1** `/nouveau` : depuis le haut de la page, Tab jusqu’à « Nous contacter » ; **chaque**
  élément atteint passe la mesure. Les champs, la case « Retour », les options, « Créer »,
  « Accueil », ce bouton et « Nous contacter » en font partie. Le test échoue si la liste des
  éléments atteints est vide ou ne finit pas sur « Nous contacter ».
- **F1.2** `/` : la même promenade au clavier, « Créer un événement » compris.
- **F1.3** `/e/{id}`, avec une **copie** de la scène de `person-edit.spec.ts`, propre au
  nouveau test, où **Léa a un numéro** (`07 22 33 44 55`, v3.2). Le `seedScene` partagé ne
  change pas : `person-edit.spec.ts` compte sur Léa sans numéro (v3.3). À l’aller, Claire conduit sa voiture et Léa
  est passagère de Marc ; au retour, il n’y a aucune voiture. Les onglets ne sont dans
  l’ordre de Tab que par l’onglet actif, et la flèche droite **sélectionne** « Retour », ce
  qui cache le panneau Aller. D’où **une promenade par onglet** (v3.2) :
  1. **onglet Aller actif** : depuis le haut, Tab jusqu’à « Nous contacter » ; chaque élément
     atteint passe la mesure, en particulier :
     - un prénom et une cellule de la matrice, le bouton de « Vos inscriptions » : fond
       blanc ;
     - l’onglet « Aller », puis le panneau d’onglet, atteint par Tab après les onglets : fond
       `rgb(245, 245, 245)` pour l’onglet, blanc pour le panneau ;
     - sur la carte de Claire, une place libre, « Modifier » et « Retirer la voiture » : fond
       blanc ;
     - sur la carte de Marc, le lien `tel:` de Léa, dans sa rangée de passager : fond
       `rgb(245, 245, 245)` ;
  2. **onglet Retour** : Maj+Tab jusqu’à l’onglet « Aller », puis **flèche droite** :
     « Retour » a le focus et est sélectionné ; il passe la mesure, fond
     `rgb(245, 245, 245)`, rapport d’au moins 4,3. Puis Tab jusqu’à « Nous contacter » :
     le panneau Retour, « Ajouter une personne » et « Proposer une voiture » de ce leg passent
     la mesure, fond blanc ;
  3. enfin **flèche gauche** depuis « Retour » (après Maj+Tab jusqu’à lui) : « Aller » a le
     focus et passe la mesure.
- **F1.4** La feuille « Proposer une voiture » ouverte au clavier : la promenade dans la
  feuille, dont « Qui conduit ? » (boutons radio, parcourus aux flèches), la zone « Note »,
  les cases de « Qui monte avec vous ? », « Valider » et « Fermer ».
- **F1.5** La confirmation « Retirer la voiture ? » ouverte au clavier : le bouton rouge
  « Retirer la voiture » et « Annuler » ont tous deux pour fond touché `rgb(255, 255, 255)`
  (la boîte, `bg-popover`), rapport 4,74.
- **F1.6** La barre de messages :
  - avec une réussite seule, « Fermer » atteint au clavier : `outlineOffset` = `0px`, fond
    `rgb(23, 23, 23)`, rapport d’au moins 3,7 ;
  - avec un échec, « Fermer » : `outlineOffset` = `0px`, fond blanc, et **2 px au moins**
    entre le bord extérieur du contour et la bordure rouge, de chaque côté : la boîte de
    « Fermer », agrandie de 2 px, reste à 2 px au moins à l’intérieur de la boîte intérieure
    de la barre (`getBoundingClientRect` de la barre, moins sa bordure). Les boîtes sont en
    sous-pixels : la comparaison tolère 0,5 px (écart d’au moins 1,5 px) (v3.2) ;
  - quatre échecs et une réussite à 360 × 780 (la scène de #311) : la liste qui défile,
    atteinte par Tab, a `outlineOffset` = `0px`, passe la mesure, et la même règle des 2 px
    vaut pour elle.
- **F1.7** `/e/{id}/admin` avec un lien valide. `navigator.share` est simulé avant le
  chargement (`page.addInitScript`), pour que « Partager » s’affiche dans Chromium headless.
  La promenade dans l’espace organisateur : le bouton qui replie l’espace a `outlineOffset`
  = `-2px` ; une tuile, « Copier », « Partager » et « Actualiser » passent la mesure.
- **F1.8** `/nouveau`, « Titre » rempli et « Lieu » vide ; « Créer » activé par Entrée :
  « Lieu », premier champ en erreur, **reçoit le focus de « Créer »**
  (`create-event-form.tsx:51`, `showErrors`), au clavier, donc `:focus-visible` (v3.2) :
  - au focus : aucun calque de `boxShadow` visible, `borderColor` lu en sRGB =
    `rgb(231, 0, 11)`, et la mesure passe ;
  - le focus parti (Tab) : « Lieu » a exactement un calque visible, rouge, d’une
    extension de 3 px (le halo, inchangé) ;
  - le message « Champ requis. » reste affiché dans les deux cas.
- **F1.9** La feuille des places avec « Placer » inactif (`aria-disabled="true"`, aucune
  case cochée), atteint au clavier :
  - le produit des opacités vaut 1, avec et sans le focus ;
  - `backgroundColor` lu en sRGB = `rgb(245, 245, 245)` et `color` = `rgb(115, 115, 115)` ;
  - la mesure passe (fond touché blanc) ;
  - une case cochée : « Placer » est actif, `backgroundColor` = `rgb(23, 23, 23)`.
- **F1.10** `/e/{id}` : un clic de souris sur le bouton de « Vos inscriptions », qui replie
  ou déplie la section et garde le focus : `document.activeElement` est ce bouton, et son
  `outlineStyle` vaut `none` tant qu’aucune touche n’a été pressée.
- **F1.11** `page.emulateMedia({ forcedColors: "active" })`, puis Tab jusqu’à ce bouton :
  `outlineStyle` = `solid` et `outlineWidth` = `2px`.
- **F1.12** Un test Vitest lit chaque fichier `.tsx`, `.css` et `.ts` de `src/`, sauf les
  `.test.ts` et `.spec.ts`, qui citent les anciennes classes pour les trouver (v3.3.2, #337).
  Il coupe chaque classe en variantes et utilitaire (`a:b:utilitaire`), et n’y trouve aucune
  de celles-ci :
  - l’utilitaire `ring-ring/50` ou `outline-ring/50`, quelles que soient les variantes ;
  - l’utilitaire `outline-none` ;
  - un utilitaire qui commence par `ring` (`ring-3`, `ring-[3px]`, `ring-ring…`,
    `ring-destructive…`, `ring-inset`) ou `outline-1`, avec la variante `focus-visible`.
    La variante `not-focus-visible` n’est pas `focus-visible` : le halo d’erreur
    `aria-invalid:not-focus-visible:ring-3` est permis.

  Le rapport liste les fichiers et les classes fautifs. Un second test fixe, par leur nom, les
  fichiers lus : `button.tsx`, `globals.css`, `classes.ts` et `page.test.tsx` le sont ;
  `focus-ring.test.ts`, `rows.spec.ts` et `README.md` ne le sont pas.
- **F1.13** `globals.css` : `--ring` vaut `oklch(0.556 0 0)` dans `:root` (Vitest) ; c’est
  aussi ce que lit F1.1, `rgb(115, 115, 115)`.
- **F1.16** Les repères qui ont déjà un anneau, focalisés **comme l’application le fait**,
  passent la mesure (fond blanc) :
  - **le titre d’une carte** : Tab jusqu’à la cellule « Léa, Aller : Avec Marc », Entrée,
    puis Tab jusqu’à « Voir la voiture » et Entrée : « Voiture de Marc » a le focus ;
  - **le bandeau de couverture** : la feuille des places de la voiture de Marc ouverte au
    clavier ; la voiture est retirée en base par un autre appareil et la page relit l’état,
    comme dans les tests de C6.8 ; Échap ferme la feuille, et le focus va au bandeau du leg
    (`focusCar`, la voiture n’existe plus) ;
  - **une ligne d’une liste de l’organisateur** : `/e/{id}/admin`, une liste de plus de cinq
    lignes, « Afficher les N autres » activé par Entrée : la sixième ligne a le focus.
- **F1.17** (#314) Les repères qui n’ont aucun anneau aujourd’hui, focalisés par l’action qui
  les focalise dans l’application, passent la mesure :
  - « Chargement de vos inscriptions… » : « Réessayer » activé par Entrée, la lecture
    retenue (`page.route`) ;
  - l’alerte « lien non valide » (v3.2) : l’application ne la focalise qu’**après
    « Réessayer »**, quand la seconde vérification trouve le lien non valide
    (`organiser-screen.tsx:58-61`), jamais à la fin de la première. Le test ouvre
    `/e/{id}/admin#{faux jeton}` en retenant la vérification par `page.route` et la fait
    échouer (erreur réseau) : l’alerte d’échec et « Réessayer » s’affichent. La route ne
    vise que le `POST` de l’action serveur (en-tête `next-action`), jamais le `GET` de la page
    (v3.3), et parmi ces `POST`, seulement celui dont le corps porte le jeton, comme
    `holdActionsWith` : seule la vérification échoue (v3.3.1). Il relâche la
    route, presse **Entrée** sur « Réessayer », et la vérification répond « invalid » :
    l’alerte « lien non valide » a le focus et passe la mesure ;
  - les autres repères, par les déclencheurs qui existent déjà (v3.2) :
    - **le titre de l’événement** : `focusLandmark` (`focus.ts:19`), qui le focalise quand
      la page n’a pas d’onglets. La scène est celle de `device-persons.spec.ts:399`
      (« without tabs, « Fermer » on a line whose landmark is gone… ») : événement sans
      retour, une voiture supprimée pendant que la réponse est retenue, sa ligne dans la
      barre sans repère. « Fermer » est activé par **Entrée**, pas par un clic (v3.3) : le
      titre a le focus et passe la mesure ;
    - **un titre de leg de l’espace organisateur** : une tuile (`goToLeg`,
      `organiser-tiles.tsx:39`), activée par Entrée : le titre du leg a le focus ;
    - **un titre de liste de l’organisateur** : une relecture qui retire la ligne qui a le
      focus (`noteFocus`, `organiser-screen.tsx:72`). Au clavier seulement, comme
      `organiser-after-action.spec.ts:462` mais sans `focus()` (v3.3) :
      1. une liste « Sans voiture » de plus de cinq lignes, dépliée ; les lectures du
         panneau retenues (`holdPanelReads`) ;
      2. **Entrée** sur « Actualiser » (dans le panneau, `admin-panel.tsx:103`) : la lecture
         part et reste retenue ;
      3. **Tab** jusqu’à « Réduire la liste », qui est sous « Actualiser » (v3.3.1), puis
         **Entrée** deux fois (replier, puis
         « Afficher les N autres ») : le focus est sur la sixième ligne ;
      4. la personne de cette ligne est supprimée en base ;
      5. la lecture est relâchée : la ligne disparaît, et le titre de la liste a le focus
         (celui du leg si la liste est vide) ; il passe la mesure.
- **F1.18** Sans JavaScript (`javaScriptEnabled: false`), `/e/{id}` : Tab jusqu’à
  « Accueil », puis jusqu’à « Nous contacter » ; les deux passent la mesure. Le bouton de
  langue, inactif sans JavaScript (L4.3), n’est pas atteint.

**`e2e/home-link.spec.ts`, à faire au passage** (commentaire de #236, venu de la relecture
de #299) :

- **F1.14** A3.5 réécrit : « Accueil » atteint par Maj+Tab depuis ce bouton, et ce bouton
  atteint par **Tab** depuis « Accueil », sans aucun `focus()`. Les deux ont le même contour
  (`outlineStyle`, `outlineWidth`, `outlineOffset`, `outlineColor` lu en sRGB) et passent la
  mesure. Les assertions `boxShadow` différent de `none` et `outlineStyle` = `none`
  disparaissent : elles décrivent l’ancien anneau.
- **F1.15** A3.7 : le `waitForTimeout(500)` (ligne 241 aujourd’hui) est remplacé par
  l’attente de la réponse RSC de `/`. L’attente est **armée avant** le clic sur « Accueil »
  (`const home = page.waitForResponse(…)`, puis le clic, puis `await home`), sur le chemin
  `/` et l’en-tête `rsc`, sinon une réponse rapide passerait avant elle. Le fichier ne
  contient plus aucun `waitForTimeout`.

**Non prouvable par un test** : qu’une personne voie l’anneau du premier coup d’œil. Le
rapport de contraste en est la mesure ; une revue à l’œil, à 360 px, sur un téléphone en
plein soleil, reste utile.

### Pour le développement

- La forme recommandée : un utilitaire unique dans `globals.css`, par exemple
  `@utility focus-ring { outline: 2px solid var(--ring); outline-offset: 2px; }`, appliqué
  par `focus-visible:focus-ring`, avec `focus-visible:outline-offset-0` dans la barre et
  `focus-visible:-outline-offset-2` pour le bouton qui replie l’espace ; et une règle de base
  `:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }` pour les
  éléments sans classe.
- Dans les composants de `src/components/ui/` : remplacer `outline-none
  focus-visible:ring-3 focus-visible:ring-ring/50` par l’utilitaire ; retirer
  `focus-visible:ring-destructive/20` et `focus-visible:border-destructive/40` de la variante
  `destructive` ; retirer `focus-visible:ring-[3px]` et `focus-visible:outline-1` des
  onglets ; écrire le halo d’erreur `aria-invalid:not-focus-visible:ring-3
  aria-invalid:not-focus-visible:ring-destructive/20`.
- **Plus aucun `outline-none`** (F1.12). Un élément qui reçoit le focus prend le contour ; le
  seul qui ne doit pas le montrer, le contenu d’une boîte de dialogue que Radix focalise en
  repli, prend `outline-hidden` : Tailwind 4 lui garde un contour transparent, visible en
  couleurs forcées.
- « Placer » inactif : `aria-disabled:bg-muted aria-disabled:text-muted-foreground`, sans
  `opacity`. Sa flèche vient de la règle de base du pointeur (v3.3.3), sans classe à lui.
- La palette `.dark` n’est jamais appliquée : elle n’est pas touchée.

### Hors périmètre de la v3

- La palette sombre (`.dark`).
- Les couleurs au survol, et celles des boutons hors focus, sauf « Placer » inactif
  (règle 7). Le pointeur au survol est la v3.3.3.
- Le widget de discussion Crisp, qui n’est pas à nous.
- Redessiner les maquettes `event-board`, `home` et `organizer-view` : elles renvoient ici.

## Ce que la page montre

Un bouton discret dans le bas de page partagé (`src/components/contact/contact-footer.tsx`),
avant le lien « Nous contacter », qui nomme l'autre langue dans cette langue : « English »
sur une page en français, « Français » sur une page en anglais. Un tap passe la page dans
cette langue sans recharger le document, et l'appareil s'en souvient (cookie `NEXT_LOCALE`).

Les couleurs des maquettes sont celles de `src/app/globals.css` (`--muted-foreground`
≈ `#737373`, `--destructive` ≈ `#e7000b`), et chaque texte est celui de `messages/*.json`.

## États couverts

| état | section de la page | critères |
|---|---|---|
| le contrôle, page FR et page EN ; `lang` sur le bouton lui-même | « Le contrôle » | L1.1, L1.2 |
| accueil complet avant / après, de l'accroche au bas de page : titre et dates saisis, « Retour » et « Rehausseurs » cochées, lieu en erreur | « Accueil » | L1.1, L1.3, L1.7, L3.4, L3.5 |
| espace organisateur, jeton valide, après : page complète en anglais à 360 × 780, pli marqué (liens et avertissement au-dessus, bas de page en dessous) | « Espace organisateur » | L3.1, L3.2, L2.7, L1.2 (C4.2 de #3) |
| espace organisateur, faux jeton, avant (FR) et après (EN) : alerte « lien non valide », fragment conservé | « Espace organisateur » | L3.2, L3.3 |
| espace organisateur, pas de jeton, après (EN) | « Espace organisateur » | L3.3 |
| page d'un événement en anglais (dates reformatées) | « Page d'un événement et Événement introuvable » | L1.4 |
| Événement introuvable en anglais | idem | L1.5 |
| pendant le changement (bouton inactif) | « Quand ça ne se passe pas comme prévu » | L4.4 |
| échec : hors ligne ou serveur, dans les deux sens | idem | L4.1 |
| cookies refusés | idem | L4.2 |
| sans JavaScript, avant hydratation | idem | L4.3 |

| v3.3.3 : le pointeur, la main sur un bouton, un lien, un onglet, une case et son libellé ; la flèche sur « Placer » inactif et « Créer » sans JavaScript ; le texte sur un champ | « Le pointeur (v3.3.3) » | P1.1 à P1.11 |
| v3.1 : l’anneau de focus sur fond blanc, `muted` et sombre ; avant / après ; confirmation ; barre en réussite et en échec, liste qui défile ; champ en erreur ; contour intérieur ; « Placer » inactif | « L’anneau de focus (v3) » | F1.1 à F1.11, F1.16 |

Non dessiné, parce que sans UI propre : la persistance au rechargement et à la visite
suivante (L2.1 à L2.6), et le parcours de création en anglais (L2.8).

## Les mots

Espace de clés `LanguageSwitch`. Chaque fichier contient les mots lus par quelqu'un qui
**quitte** sa langue, donc écrits dans l'autre (décision 4).

| clé | `messages/fr.json` | `messages/en.json` |
|---|---|---|
| `LanguageSwitch.label` | English | Français |
| `LanguageSwitch.failed` | The language could not be changed. Check your connection, then try again. | La langue n’a pas pu être changée. Vérifiez la connexion, puis réessayez. |
| `LanguageSwitch.cookiesBlocked` | Your browser blocks cookies, which keep the language choice. Allow them for this site, then try again. | Votre navigateur bloque les cookies, qui retiennent le choix de la langue. Autorisez-les pour ce site, puis réessayez. |

Les textes existants (`Contact.link`, tous les autres espaces) ne changent pas.

Un message d'échec suit le motif d'alerte existant (`<p role="alert" className="text-sm
text-destructive">`, comme `CreateEvent.failed`), porte le `lang` de la langue demandée,
et se place au-dessus de la ligne du bas de page, jamais après « Nous contacter ».

## Décisions

1. Décision : cookie `NEXT_LOCALE` (`fr` ou `en`, `Path=/`, `SameSite=Lax`, `Secure` en
   HTTPS, 365 jours, renouvelé à chaque changement), posé seulement sur un tap. — Raison :
   le serveur rend la page et lit déjà ce cookie avant `Accept-Language`
   (`src/i18n/negotiate.ts`, `docs/agents/architecture.md`, section i18n) ; `localStorage`
   lui est invisible et ferait clignoter chaque page, le 404 et `<html lang>` compris.
   Cookie fonctionnel demandé par la personne : pas de bandeau.
2. Décision : un bouton qui nomme l'autre langue, pas un sélecteur. — Raison : deux langues,
   un tap, et « English » se reconnaît sans lire le français.
3. Décision : un `<button>` avant « Nous contacter », qui porte lui-même `lang`. — Raison :
   K1 de #69 (le lien Crisp est le dernier lien, rien après lui) tient sans retouche ;
   aucun en-tête ajouté.
4. Décision : les messages de `LanguageSwitch` sont dans la langue demandée. — Raison :
   la personne qui tape « English » lit l'anglais ; un échec écrit dans la langue qu'elle
   quitte ne lui sert à rien.
5. Décision : pas de rechargement du document. — Raison : garder ce qui est saisi ou coché,
   le fragment, et ne pas revérifier le jeton d'admin (aucune requête ne le porte).
6. Décision : tout ou rien. — Raison : un échec qui aurait quand même enregistré le choix
   changerait la langue au rechargement suivant, sans que la personne comprenne pourquoi.

### Nouvelles en v3 (#236)

7. Décision : cette maquette porte l’anneau de focus de toute l’application. — Raison :
   c’est la plus globale. Son bouton est sur toutes les pages, elle dessine déjà toutes les
   pages, et l’anneau mesuré par #236 est le sien ; `home` le recopie (décision 9 de `home`).
8. Décision : un contour plein (`outline`) de 2 px, à 2 px du bord, plutôt que le halo
   (`box-shadow`) de shadcn. — Raison : le décalage laisse le fond de l’endroit entre
   l’élément et le contour, qui ne touche donc que ce fond. Collé à un bouton rouge, le même
   gris ferait 1,01:1. Un contour reste aussi en couleurs forcées, où un `box-shadow`
   disparaît, et c’est déjà la forme du contour par défaut du navigateur.
9. Décision : une seule couleur, `--ring` = `oklch(0.556 0 0)` (`#737373`), opaque. —
   Raison : c’est la valeur de `--muted-foreground`, une couleur que la palette a déjà, déjà
   mesurée (4,74:1, cellules « Ne fait pas… », ce bouton lui-même) : aucune couleur n’entre
   dans la palette. Elle passe aussi 3:1 sur la barre sombre (3,78:1), ce que ne font ni
   `--foreground` ni `#525252` (2,29:1). Une couleur par contexte ferait un jeton de plus,
   et un oubli de plus possible (v3.1).
10. Décision : le bouton qui replie l’espace organisateur a son contour à l’intérieur
    (−2 px). — Raison : il touche « Actualiser », sans espace (décision 26 d’organizer-view) ;
    un contour extérieur passerait sur sa bordure (corrigé en v3.1 : la v3 parlait d’un
    contour coupé).
11. Décision : le halo rouge d’un champ en erreur ne s’affiche que sans le focus
    (`aria-invalid:not-focus-visible:…`) ; au focus, bordure rouge et message restent. —
    Raison : le halo (`#faccce`), à côté du contour, abaisse le contraste à 3,3:1 et mêle
    deux signaux. Écrit ainsi, il ne laisse au focus aucun calque visible, et aucune classe
    `focus-visible:ring-` (F1.12) (v3.1).
12. Décision : rien de ce qui reçoit le focus n’est translucide, avec ou sans le focus (v3.1). — Raison : l’opacité s’applique
    aussi au contour ; à 50 %, il tombe à 1,96:1.
13. Décision : la palette `.dark` n’est pas touchée. — Raison : elle n’est jamais appliquée.

### Nouvelles en v3.1 (revue de la v3)

14. Décision : dans la barre de messages, « Fermer » et la liste ont leur contour à 0 px. —
    Raison : la barre n’a que 4 px de marge intérieure ; à 2 px, le contour toucherait sa
    bordure, rouge quand elle porte un échec (1,01:1). À 0 px, il reste 2 px de son fond. La
    liste, focalisable quand elle défile (#311), dessine son contour hors de sa boîte : elle
    ne le coupe pas.
15. Décision : « Placer » inactif se dit par ses couleurs, fond `muted` et texte
    `muted-foreground` (4,35:1), sans opacité, avec et sans le focus. — Raison : forcer
    l’opacité à 1 au seul focus cachait l’état inactif au moment où on le lit ; des couleurs
    le gardent visible, et le contour reste opaque.
16. Décision : les repères de #314 suivent la même règle, sans exception. — Raison : un
    élément qui reçoit le focus le montre ; une règle à part pour les repères ferait deux
    anneaux. Leurs critères sont F1.17 ; leur construction peut rester la tâche #314.
17. Décision : les couleurs lues par les tests passent en sRGB par un canevas. — Raison :
    `getComputedStyle` rend `oklch` et `oklab`, avec opacité ; c’est déjà la méthode de
    `ride-remove.spec.ts`.

### Nouvelles en v3.3.3 (#347)

18. Décision : le pointeur est porté par cette maquette, à côté de l’anneau. — Raison : c’est
    une règle de toute l’application, posée une fois dans `globals.css` ; cette maquette
    dessine toutes les pages et porte déjà la règle de focus. Dans `event-board` ou
    `organizer-view`, elle ne couvrirait qu’un écran, et l’autre maquette l’ignorerait.
19. Décision : un élément inactif montre la flèche (`default`), pas `not-allowed`, « Placer »
    compris. — Raison : c’est la convention des systèmes et du `preflight` de Tailwind 3. Un
    bouton `disabled` de `button.tsx` a `pointer-events: none` : le survol le traverse et
    montre la flèche quoi qu’on écrive ; `not-allowed` ne se verrait que sur les `aria-disabled`
    (« Placer », « Actualiser »), et l’application aurait deux pointeurs pour un même état.
20. Décision : la règle ne dépend d’aucune condition de média (`hover`, `pointer: fine`). —
    Raison : un écran tactile ne dessine pas de pointeur, la condition ne changerait rien de
    visible ; sans elle, les tests du projet `e2e` (Pixel 7) lisent la même valeur qu’un
    ordinateur, et P1.10 le vérifie sur un contexte de bureau.

## Révisions

- v1 (2026-10-17) : première version, publiée. Revue de design : changements demandés
  (L3.3 non dessiné ; six suggestions).
- v2 (2026-10-17) : L3.3 dessiné (faux jeton avant/après, pas de jeton après) ; `lang` sur
  le bouton lui-même (L1.1) ; légende L2.6 corrigée en L2.7 ; accueil complet avec
  l'accroche (L1.3) et « Retour » et options conservés (L3.4) ; panneau organisateur
  complet en anglais à 360 × 780 avec le pli (L1.2, C4.2 de #3) ; gris des maquettes
  aligné sur `--muted-foreground` (`#737373`) ; messages d'échec au motif d'alerte
  existant, `text-sm text-destructive` (L4.1, L4.2). Toutes les remarques appliquées,
  aucune contestée. Republiée à la même URL.
- v3 (2026-10-21) : #236, l’anneau de focus, pour toute l’application.
  - Partie de v2 : la copie locale, `origin/main` (`docs/design/language-switch/`) et
    l’artifact publié étaient identiques.
  - Pourquoi ici : la maquette la plus globale (décision 7).
  - La règle : un contour plein de 2 px, à 2 px du bord, en `#737373` (`--ring`), opaque ;
    à l’intérieur là où il serait coupé ; pas de halo au focus d’un champ en erreur ; rien
    de translucide au focus ; inchangé à la souris ; présent en couleurs forcées.
  - Les contrastes mesurés, avant et après, et l’inventaire de chaque fichier qui dessine un
    anneau.
  - Critères F1.1 à F1.15, dont les deux points de `home-link.spec.ts` venus de la relecture
    de #299.
  - La page ajoute la section « L’anneau de focus (v3) » : avant / après, sur fond blanc,
    `muted` et sombre, avec le bouton rouge, le champ en erreur et le contour intérieur. Le
    gris des anneaux des maquettes v2 (`--app-ring`) passe à `#737373`.
  - Pas encore relue en revue de design. Republiée à la même URL.
- v3 (suite) : revue de design : changements demandés. Sept bloquants :
  1. les couleurs lues sont en `oklch` / `oklab`, pas en `rgb` : la mesure ne pouvait pas
     passer ;
  2. F1.8, l’étape 6 de la mesure et F1.12 se contredisaient ;
  3. la confirmation n’a pas de pied gris : « Annuler » touche le blanc ;
  4. l’onglet « Retour » ne s’atteint pas par Tab (tabindex mobile de Radix) ;
  5. aucun critère pour les repères focalisés par le script ;
  6. la liste de la barre, focalisable depuis #311, sans décalage décidé ni test ; un critère
     sur « Annuler », qui n’est pas construit ;
  7. forcer l’opacité de « Placer » au focus cachait son état inactif.

  S’y ajoutent huit suggestions.
- v3.1 (2026-10-21) : les sept bloquants sont corrigés, et les huit suggestions appliquées,
  sans en refuser aucune.
  - La mesure lit chaque couleur en sRGB par un canevas, et compose les fonds avec leur
    opacité. Son étape 6 compte les calques visibles du `boxShadow` au lieu de comparer des
    chaînes.
  - Le halo d’erreur s’écrit `aria-invalid:not-focus-visible:…`. F1.8 vérifie le halo sans
    le focus et son absence au focus ; F1.12 coupe les classes en variantes.
  - F1.5 : fond blanc pour les deux boutons ; le dessin n’a plus de pied gris.
  - F1.3 et F1.4 : les flèches dans les groupes à tabindex mobile. Le panneau d’onglet,
    focalisable, prend l’anneau.
  - F1.16 : le titre d’une carte, le bandeau, une ligne de l’organisateur, focalisés comme
    le fait l’application. F1.17 : les repères de #314, inclus dans la règle (décision 16).
  - Barre : « Fermer » et la liste à 0 px, pour laisser 2 px de fond avant la bordure rouge
    (décision 14) ; F1.6 le mesure. Le critère sur « Annuler » est retiré.
  - « Placer » inactif : fond `muted`, texte `muted-foreground`, sans opacité (décision 15),
    dessiné.
  - Suggestions : la raison de la décision 9 (la valeur de `--muted-foreground`) ; 1,44:1
    pour `ring-destructive/20` ; la raison du contour intérieur (« Actualiser ») ; plus
    d’`outline-none` (`outline-hidden` pour le seul contenu de dialogue) ; `navigator.share`
    simulé pour F1.7 ; `waitForResponse` armé avant le clic (F1.15) ; la ligne « sans
    JavaScript » des états a son critère, F1.18.
  - Rendu vérifié avec Chrome headless, à 1280 et 500 px : aucun débordement horizontal,
    aucune cible sous 44 px dans la nouvelle section. Republiée à la même URL.
- v3.1 (suite) : revue de design : changements demandés. Deux bloquants, dans les critères
  seulement : le déclencheur de l’alerte « lien non valide » (F1.17), et F1.3, où la flèche
  droite cache le panneau Aller et où la scène n’avait ni voiture au retour ni passager avec
  un numéro. Quatre suggestions.
- v3.2 (2026-10-21) : les deux bloquants sont corrigés, et les quatre suggestions appliquées,
  sans en refuser aucune. Seuls les critères changent ; la règle et les dessins non.
  - F1.17 : l’alerte « lien non valide » se mesure après « Réessayer » (première vérification
    échouée par `page.route`, route relâchée, Entrée, réponse « invalid »).
  - F1.3 : une promenade par onglet ; « Retour » par la flèche droite, puis le panneau Retour ;
    « Aller » de nouveau par la flèche gauche. Léa a un numéro dans la scène, pour le lien
    `tel:` d’une rangée de passager.
  - La mesure attend que les animations soient finies et se relit par `expect.poll`
    (étape 0).
  - F1.6 tolère 0,5 px d’arrondi sur l’écart de 2 px.
  - F1.17 nomme les déclencheurs existants : `focusLandmark` sans onglets, `goToLeg` par une
    tuile, `noteFocus` à une relecture.
  - F1.8 : « Lieu » reçoit le focus de « Créer ».
  - Republiée à la même URL.
- v3.2 (suite) : revue de design : changements demandés. Un bloquant, venu de l’étape 0 :
  attendre que `document.getAnimations()` soit vide ne finit jamais, à cause des icônes qui
  tournent sans fin. Quatre suggestions, des précisions de procédure de test.
- v3.3 (2026-10-21) : le bloquant est corrigé, et les quatre suggestions appliquées, sans en
  refuser aucune. Seuls les critères changent.
  - Étape 0 : on n’attend que les animations finies (`iterations !== Infinity`).
  - F1.3 : le nouveau test a sa propre copie de la scène ; le `seedScene` partagé reste tel
    quel.
  - F1.17 : la route d’échec ne vise que le `POST` `next-action` ; le titre de l’événement par
    la scène de `device-persons.spec.ts:399`, avec Entrée ; le titre de liste par le chemin au
    clavier d’« Actualiser » retenu, « Réduire la liste », Entrée deux fois, suppression en
    base, relâche.
  - Republiée à la même URL.
- v3.3 (suite) : revue de design : quatre des cinq changements tiennent. Deux corrections de
  texte demandées, validées d’avance par le relecteur.
- v3.3.1 (2026-10-21) : les deux corrections, telles quelles, et la suggestion facultative.
  - F1.17, titre de liste, étape 3 : « Tab » (vers l’avant) jusqu’à « Réduire la liste »,
    qui est sous « Actualiser ».
  - Étape 0 : `Promise.allSettled` sur les promesses `finished`, qu’une transition annulée
    rejette (`AbortError`).
  - F1.17, « lien non valide » : la route d’échec ne vise que le `POST` dont le corps porte
    le jeton (comme `holdActionsWith`).
  - Revue de design : **approuvée**, sans autre cycle (décision du coordinateur). Republiée
    à la même URL.
- v3.3.2 (2026-10-21) : F1.12 seul, sans rien redessiner. Le scan lit aussi les fichiers
  `.ts` de `src/`, sauf les `.test.ts` et `.spec.ts` (#337, PR #342) : une liste de classes
  peut vivre dans un `.ts`. Un second test fixe les fichiers lus et ceux qui sont exclus. La
  page ne change que son numéro de version et sa phrase d’introduction : elle ne détaille
  pas F1.12, et renvoie au README pour F1.1 à F1.18. Pas encore relue en revue de design.
  Republiée à la même URL.
- v3.3.2 (suite) : revue de design : **approuvée**. Une correction de texte, appliquée sans
  nouvelle revue : l’en-tête du README et la page disaient « sauf les tests » et « tests
  exclus », alors que F1.12 lit les `.test.tsx` ; ils disent désormais « sauf les `.test.ts`
  et `.spec.ts` ». Cette ligne de révisions dit aussi que la page renvoie à F1.12 sans le
  détailler. Republiée à la même URL.
- v3.3.3 (2026-10-21) : le pointeur, pour toute l’application (#347), signalé par le
  propriétaire : sur ordinateur, les boutons ne donnent pas la main au survol (Tailwind 4).
  - La règle : la main sur `button` et `[role="button"]` actifs, par la couche `base` de
    `globals.css` ; la flèche sur un élément `disabled` ou `aria-disabled` ; les liens, les
    libellés de case et les champs de texte gardent ce qu’ils ont. Sans condition de média.
  - Une règle de la v3 change : « Placer » inactif passe de `not-allowed` à la flèche
    (règle 7, décision 19). Les classes `cursor-not-allowed` de `seat-sheet.tsx`,
    `checkbox.tsx` et `radio-group.tsx` sont retirées.
  - Critères P1.1 à P1.11 : la valeur calculée de `cursor`, sur un échantillon nommé de
    chaque page (`/`, `/nouveau`, `/e/{id}`, `/e/{id}/admin`), des feuilles, de la
    confirmation et de la barre, inactifs compris ; un contexte de bureau ; le scan de F1.12.
  - La page ajoute la section « Le pointeur (v3.3.3) », dont les exemples portent la vraie
    règle (un survol à la souris la montre), et le dessin de « Placer » inactif prend la
    flèche. Pas encore relue en revue de design. Republiée à la même URL.
- v3.3.3 (suite) : revue de design : changements demandés. Deux bloquants, mesurés par le
  relecteur dans le Chromium de Playwright 1.64 : un champ de date ou d’heure et un `<label>`
  donnent `default`, pas `auto` ni `text`. Cinq suggestions. Corrigé sur place, sans changer
  de numéro : la v3.3.3 n’avait pas été copiée dans le dépôt.
  - La lecture : chaque valeur attendue est exacte (`text`, `default`, `auto`, `pointer`),
    avec ce que le navigateur donne sans la règle. Règle 4 et tableau des états alignés.
  - P1.2 : « Titre » a `text` ; « Date de début », « Heure de début » et le libellé
    « Titre » ont la flèche. P1.6 : « Heure de départ » a la flèche ; la case de Tom seule
    cochée.
  - Suggestions appliquées, sans en refuser aucune : « Annuler » de la barre (#340) dans
    P1.8, dans la règle 1 et dessiné ; la règle 4 de la v3 alignée sur le code (0 px) ; la
    page reçoit les décisions 18 à 20 et le hors-périmètre de la v3.3.3, et sa ligne v3.1
    parle des couleurs au survol ; `seat-sheet.tsx:367`.
  - Republiée à la même URL.
- v3.3.3 : **approuvée** par la revue de design. Deux corrections appliquées sans nouvelle
  version ni nouvelle revue : sur la page, l’exemple du champ « Heure de départ » est sorti
  du dessin de la feuille des places et placé sous un titre « Proposer une voiture », la
  feuille d’où il vient ; la règle 4 de la v3 dit que le contour d’« Annuler » dans la barre
  est coupé à droite par la liste (mesuré ; suivi dans une issue ouverte). Republiée à la
  même URL.
