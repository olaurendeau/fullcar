# Vue organisateur

- Artifact : https://claude.ai/artifact/6WQ2cPNX5cxh4UAA8hqtJF
- Epic : https://github.com/olaurendeau/fullcar/issues/154
- Origine : revue de design de l'humain sur #66 (section « Administrateur (vue globale) »), décision https://github.com/olaurendeau/fullcar/issues/66#issuecomment-6250124984
- Tableau des participants dessiné dessous : #66 v4.1 (`event-board`, approuvée)
- Page : `index.html` (autonome ; maquettes à 360 px de large, et des navigateurs de 1280 px montrés à 75 % et à 55 %)
- Version : v3.2.2 (la carte se replie, demande de l'humain du 2026-10-19 ; revue v3.2.1 appliquée)

## Décisions de l'humain (2026-10-18)

- **DO1 = (a) : visibilité du téléphone.** L'organisateur voit le numéro de chaque personne **sans voiture sur un leg**, pour ce leg seulement. Pour une voiture, il voit seulement si son conducteur a un numéro, jamais ce numéro. Partout ailleurs, tableau sous le panneau compris, la règle d'aujourd'hui (#66 C10.1) reste. `Admin.adminLink.hint` est modifiée.
- **DO2 = (c) : pas de QR code dans cet epic.** Le lien à partager garde la disposition d'aujourd'hui. L'epic #67 (lien perso) aura besoin d'un QR code et décidera comment le produire.

## Ce que la page montre

L'espace organisateur de `/e/{id}/admin#{jeton}`, au-dessus de l'en-tête de l'événement et du tableau des participants (#66 v4.1, inchangé, C11.7).

### Ordre sous 1024 px

1. « Espace organisateur » (h2) et « Actualiser » (`outline`, 44 px), sur une même ligne. **v3.2** : le h2 contient le bouton qui replie la carte (voir « Replier la carte »), et c'est ce bouton qui reçoit le focus après « Réessayer » ; le h2 n'a plus `tabIndex={-1}`.
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

Non dessinés, faute d'UI propre :

- copie impossible et partage natif absent : inchangés, #3 C4.4 et C4.5 (O4.3) ;
- stockage indisponible (v3.2) : le panneau est déplié, comme à une première visite, et rien ne le signale ;
- relecture réussie après une action : le panneau suit, sans message de plus.

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
19. (v3.2, corrigée en v3.2.1) Le titre est le bouton qui replie, sur le motif de « Vos inscriptions » (#66), **mais avec le chevron collé au titre**, alors que « Vos inscriptions » le met au bout de la ligne. — C'est le même geste que l'autre carte repliable de l'écran. Au bout du bouton, le chevron toucherait « Actualiser » et se lirait comme un menu de ce bouton. Un bouton-icône de 44 px de plus ne tiendrait pas à côté d'« Actualiser » à 360 px. L'écart est voulu : ne pas aligner les deux cartes plus tard.
20. (v3.2) Le nom reste « Espace organisateur », l'état est dit par `aria-expanded`, et le résumé est hors du bouton. — Un nom qui change à chaque toucher, et un titre de deux lignes à pastilles, se lisent mal ; le résumé disparaît au dépli.
21. (v3.2) L'état est gardé par événement (`fullcar:organiser-folded:{id}`), et la clé n'existe que replié. — Un événement juste créé arrive toujours déplié, liens et avertissement visibles (#3 C4.2). Replier un événement ne cache pas les liens d'un autre. Un panneau déplié n'écrit rien.
22. (v3.2, précisée en v3.2.2) Le résumé reprend les textes de la vignette, une ligne par leg, **qui peut passer à la ligne**, et n'est pas un bouton. — Ni mot ni ambre nouveaux, et la preuve est simple : même texte que la vignette. Le seul geste de la carte repliée est de la déplier.
23. (v3.2) Replié et retiré, la phrase de retrait remplace le résumé. — Le résumé est une donnée lue, comme les vignettes.
24. (v3.2) Aucune animation. — C'est ce que fait « Vos inscriptions ». Une hauteur animée ferait travailler la compensation du défilement (O1.11) à chaque image. `prefers-reduced-motion` est ainsi tenu par construction.
25. (v3.2) Après « Réessayer », le focus va sur le bouton du titre. — Il existe dans les deux états ; un h2 focusable qui contient un bouton serait deux arrêts pour un seul titre.
26. (v3.2.1) Aucun espace entre le bouton du titre et « Actualiser » ; un toucher juste à gauche d'« Actualiser » replie la carte. — 8 px d'écart feraient passer « Actualiser » à la ligne sur les téléphones les plus étroits. Le geste raté se défait d'un toucher, sans requête et sans rien perdre.

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
- (v3.2) Replier d'autres cartes, ou garder l'état des listes dépliées (O5.7 : jusqu'au rechargement, rien n'est stocké).
- (v3.2) Synchroniser l'état replié entre onglets, ou entre appareils.
- (v3.2) Retirer la clé à la purge de l'événement.
- (v3.2) L'icône qui tourne pendant une lecture sous `prefers-reduced-motion` : elle est partagée avec toute l'application.

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
