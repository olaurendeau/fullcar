# Lien « Code source sur GitHub »

- Artifact : https://claude.ai/artifact/ApnBAy1gXjDhmpMmoAzTbz
- Epic : https://github.com/olaurendeau/fullcar/issues/489
- Voisines : `home` (#232) et `language-switch` (#113) décrivent le bas de page avant ce
  changement ; elles ne sont pas republiées, cette maquette les complète pour le bas de page.
- Page : `index.html` (autonome, maquettes à 360 px de large, plus un ordinateur à 1280 px)

## Ce que la page montre

Le bas de page partagé (`src/components/contact/contact-footer.tsx`) gagne un lien vers le
dépôt public `https://github.com/olaurendeau/fullcar`, sur toutes les pages qui l’ont. Le bas
de page passe d’une ligne à deux, toujours les mêmes :

- ligne 1 : « Accueil » (absent de `/`), le bouton de langue ;
- ligne 2 : « Code source sur GitHub », « Nous contacter », qui reste le dernier lien.

Le lien a l’allure de « Nous contacter » (14 px, gris, souligné, 44 px, anneau de base), sans
icône, en nouvel onglet, `rel="noopener noreferrer"`.

## États couverts

| état | section | critères |
|---|---|---|
| toutes les pages sauf `/`, FR, 360 px | « Le bas de page à 360 px » | G1, G3, G4, G5 |
| `/`, FR, 360 px : ligne 1 réduite au bouton de langue | idem | G3, G5 |
| toutes les pages sauf `/`, EN, 360 px | idem | G9 |
| focus clavier sur le lien | idem | G10 |
| écartés : ligne unique qui se replie ; GitHub après « Nous contacter » | « Pourquoi deux lignes fixes » | — |
| ordinateur, 1280 px : les mêmes deux lignes | « Sur un ordinateur » | G6 |
| depuis `/e/{id}/admin#{jeton}` : avant, nouvel onglet, onglet d’origine | « Depuis l’espace organisateur » | G7 |
| échec du changement de langue : message au-dessus de la ligne 1 | « Quand ça ne se passe pas comme prévu » | G3 |
| sans JavaScript : lien actif, langue grisée | idem | G11 |
| hors ligne, GitHub indisponible, navigateur intégré, dépôt devenu privé | note, rien d’ajouté | — |

Aucun état vide, un, plusieurs, ni de permission : le lien est fixe et identique pour tout le
monde.

## Les mots

| clé | fr | en |
|---|---|---|
| `Contact.sourceCode` (nouvelle) | Code source sur GitHub | Source code on GitHub |
| `Contact.newTab` (existante, réutilisée en `sr-only`) | (s’ouvre dans un nouvel onglet) | (opens in a new tab) |

Nom accessible : « Code source sur GitHub (s’ouvre dans un nouvel onglet) » / « Source code
on GitHub (opens in a new tab) ».

## Critères

- **G1** Sur chacune des pages de `e2e/contact.spec.ts` (`/`, `/nouveau`, « Événement
  introuvable », `/e/{id}`, `/e/{id}/admin` avec jeton valide, faux ou absent) : exactement un
  lien de nom accessible « Code source sur GitHub (s’ouvre dans un nouvel onglet) », dans le
  `footer`, `href` exactement `https://github.com/olaurendeau/fullcar`. Aucun dans le panneau
  « Espace organisateur ».
- **G2** `target="_blank"`, `rel` contient `noopener` et `noreferrer`.
- **G3** Dans l’ordre du document, les liens et boutons du `footer` sont « Accueil »,
  « English », « Code source sur GitHub », « Nous contacter » (sur `/` : « English », « Code
  source sur GitHub », « Nous contacter »). Le dernier `<a>` de la page est toujours celui de
  Crisp (K1). Quand il s’affiche, le message d’échec de langue précède « Accueil » (« English »
  sur `/`). Tab depuis « English » atteint le lien GitHub, puis « Nous contacter ».
- **G4** Sa taille de police et sa couleur calculées sont celles de « Nous contacter », sa
  police est plus petite que celle du `body`, il est souligné, son curseur est `pointer`.
- **G5** À 360 × 780, en FR et en EN, sur `/` et sur `/e/{id}` :
  - « Accueil » (absent sur `/`) et le bouton de langue ont le même `y` ;
  - « Code source sur GitHub » et « Nous contacter » ont le même `y`, supérieur d’au moins
    44 px à celui de la ligne 1 ;
  - chacune de ces quatre commandes a au moins 44 px de haut, et son libellé visible tient sur
    une seule ligne : un `Range` sur son premier nœud texte ne donne que des rectangles
    (`getClientRects()`) de même `top` ;
  - `scrollWidth − clientWidth` vaut 0.
- **G6** À 1280 × 800, sur `/e/{id}` : les mêmes deux lignes, mêmes `y` deux à deux.
- **G7** Depuis `/e/{id}/admin#{jeton}`, un clic ouvre un nouvel onglet dont l’URL est
  exactement `https://github.com/olaurendeau/fullcar` ; `window.opener` y vaut `null` ; la
  requête n’a pas d’en-tête `Referer`, et ni le jeton ni l’identifiant de l’événement
  n’apparaissent dans son URL, ses en-têtes ou son corps ; l’onglet d’origine garde son URL,
  fragment compris, et le panneau reste affiché. Le test intercepte `github.com` : aucun test
  ne contacte GitHub.
- **G8** Sur chacune des pages de G1, aucune requête vers un domaine de GitHub (`github.com`,
  `*.github.com`, `*.githubusercontent.com`, `*.githubassets.com`) avant le clic.
- **G9** Après le passage en anglais sur place, le lien s’appelle « Source code on GitHub
  (opens in a new tab) » et son `href` est le même qu’avant ; dans un navigateur en `en-GB`,
  ce nom sur `/` et sur `/e/{id}`.
- **G10** Atteint par Tab, le lien montre l’anneau de base (contour 2 px `#737373`, décalé de
  2 px), comme « Nous contacter ».
- **G11** JavaScript désactivé, sur `/nouveau` : le lien est présent avec le même `href`,
  `target` et `rel`.

### Critères qui changent ailleurs

- A3.2 de #232, réécrit : « Sur `/`, il n’y a aucun lien « Accueil ». La ligne 1 du bas de
  page n’a que « English » ; la ligne 2 est « Code source sur GitHub », puis « Nous
  contacter ». » Le test « A3.2, A3.6 » de `e2e/home-link.spec.ts` attend `footerRow` =
  `[switch, sourceCode, contact]`.
- A3.3 de #232 : l’ordre devient celui de G3.
- A3.4 de #232 : « les trois sur une ligne » est remplacé par G5.
- F1.1, F1.2, F1.3 de #236 : le lien GitHub s’insère juste avant « Nous contacter » dans les
  éléments atteints par Tab, et y passe la mesure de l’anneau (F1.1 : les cinq derniers sont
  « Créer », « Accueil », « English », « Code source sur GitHub », « Nous contacter » ; F1.2 :
  « Créer un événement », « English », « Code source sur GitHub », « Nous contacter »).
- F1.18 de #236, réécrit : « Sans JavaScript (`javaScriptEnabled: false`), `/e/{id}` : Tab
  jusqu’à « Accueil », puis Tab sur « Code source sur GitHub », puis Tab sur « Nous
  contacter » ; les trois passent la mesure, sur fond blanc. Le bouton de langue, inactif
  sans JavaScript (L4.3), n’est pas atteint. » Le test de `e2e/focus-ring-board.spec.ts`
  appuie une fois sur Tab après « Accueil » : il en faut deux.
- L4.1 de #113 : le message d’échec s’affiche « au-dessus de la ligne 1 du bas de page ».
  L4.3 : c’est la ligne 1 qui ne bouge pas à l’hydratation.
- Décision 8 de `docs/design/home` : l’ordre « Accueil », langue, « Nous contacter » est
  prolongé en « Accueil », langue, « Code source sur GitHub », « Nous contacter ».
- K1 à K7 de #69 et C11.4 : inchangés.

## Décisions

Les mêmes, dans le même ordre, que la section « Décisions » de `index.html`.

1. Décision : dans `ContactFooter`, donc sur toutes les pages qui ont le bas de page, `/`
   comprise ; pas dans le panneau organisateur. — Raison : un bas de page identique partout
   (décision 7 de #232).
2. Décision : « Code source sur GitHub », pas « GitHub » seul. — Raison : le libellé dit ce
   qu’on trouve derrière à quelqu’un qui ne connaît pas GitHub.
3. Décision : du texte, sans logo. — Raison : comme « Accueil » et « Nous contacter » ;
   `lucide-react` 1.55 n’a plus d’icône de marque.
4. Décision : deux lignes fixes à toutes les largeurs. — Raison : quatre éléments ne tiennent
   pas sur 328 px en français ; un repli laissé au navigateur dépend de la police et de la
   langue.
5. Décision : « Nous contacter » reste le dernier lien. — Raison : K1 à K7 de #69 et C11.4
   tiennent sans retouche.
6. Décision : `target="_blank"`, `rel="noopener noreferrer"`, adresse fixe. — Raison : comme
   « Nous contacter » ; le jeton d’admin est dans le fragment, l’identifiant dans le chemin.
7. Décision : aucune requête vers GitHub avant le tap. — Raison : aucun tiers sur les pages
   (K5 de #69).
8. Décision : clé `Contact.sourceCode`. — Raison : `Contact` porte déjà les mots du bas de
   page.

## Pour le développement

- `src/components/i18n/language-switch.tsx` change aussi : il met aujourd’hui `before`
  (« Accueil »), le bouton et `children` (« Nous contacter ») dans une seule rangée flex, le
  message d’échec au-dessus. Sa rangée ne porte plus que « Accueil » et le bouton, le message
  reste au-dessus d’elle, et la ligne 2 vient après. La forme du code est au choix du
  développeur.
- Marge à 360 px : la ligne 2 en français mesure environ 321 px sur 328 si l’image Playwright
  rend `system-ui` en DejaVu Sans (estimation d’après les métriques de la police, pas une
  mesure), soit environ 7 px de reste.
  Un libellé plus long sur cette ligne, dans l’une ou l’autre langue, se revérifie avec G5.

## Hors périmètre

Logo, badge, nombre d’étoiles ou tout appel à GitHub ; lien vers les issues ; licence, numéro
de version ou page « À propos » ; en-tête ou lien dans le panneau organisateur ; changement
de « Nous contacter » ; bas de page sur une seule ligne aux grandes largeurs.

## Révisions

- v1 (2026-10-23) : première version, publiée.
  Revue de design : changements demandés (bloquants : A3.2 de #232 et F1.18 de #236 absents
  des critères qui changent ; huit suggestions).
- v1.1 (2026-10-23) : A3.2 et F1.18 réécrits ; G5 mesure le nombre de lignes du libellé au
  lieu de la hauteur, et nomme les quatre commandes ; G3 : le message précède « Accueil »
  (« English » sur `/`) ; `language-switch.tsx` signalé ; marge de 7 px à 360 px notée ; plus
  d’anneau sur « Avant le tap » ; epic #489 ; décision 8 de `home`, L4.1 et L4.3 de #113
  mentionnées. Nom accessible déjà en ’ (U+2019) dans la page et le README ; corrigé dans le
  texte de l’epic. Toutes les remarques appliquées, aucune contestée. Republiée à la même URL.
  Revue de design : approuvée, quatre retouches de mots demandées.
- v1.2 (2026-10-23) : légende de la carte `/` (seule l’absence d’« Accueil » est inchangée
  dans A3.2) ; légende « Sans JavaScript » alignée sur L4.3 réécrit (ligne 1) ; la marge de
  321 px sur 328 est une estimation, pas une mesure ; A3.2 avant A3.3 dans la liste de la
  page. Rien d’autre. Republiée à la même URL.
