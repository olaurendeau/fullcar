# Identité visuelle

- Artifact : https://claude.ai/artifact/CgmdvcwzPok7aKuY4ReKhn
- Epic : https://github.com/olaurendeau/fullcar/issues/651
- Page : `index.html` (autonome ; téléphones à 360 px, avant et après ; navigateurs de 1280 × 800 à 45 %)
- Version : v3, spécification de la direction B « Pétrole », après la revue de design de la v2
- Voisines : `home`, `event-board`, `organizer-view`, `organizer-account`, `event-map`, `language-switch`, `place-autocomplete` (elles reçoivent une ligne d’amendement, voir plus bas) ; `github-link` (inchangée).

## Choix du propriétaire (#651)

- Direction **B « Pétrole »**.
- **Pas d’en-tête** ; la marque **M1** (la voiture de `icon.svg`, recolorée) sur l’accueil et la page introuvable seulement ; favicon et icône Apple recolorés.
- « Tout le monde a une place » **reste gris**.

## Ce que la page montre

| section | contenu |
|---|---|
| Avant, après, à 360 px | accueil, `/nouveau`, tableau, feuille ouverte, espace organisateur (« Partager » en pétrole), détails (état vide, barres réussie et en échec, focus, inactif), page introuvable dessinée comme le code ; aujourd’hui à gauche, v3 à droite |
| À 1280 px | accueil et page introuvable, marque de 36 et 28 px |
| Les jetons | le diff de `globals.css` et les valeurs sRGB lues par les tests |
| Les composants | fichier par fichier, classes avant et après |
| La marque | place, taille, texte de remplacement, composant `BrandMark`, `icon.svg`, `apple-icon.png`, `favicon.ico` |
| Les critères | VI1 à VI5 |
| Les états | sans JavaScript, anglais, inactif, échec, couleurs forcées |
| Les maquettes existantes | ce qu’elles montrent de dépassé, et la ligne d’amendement |
| Écarté | A, C, l’en-tête, M2, M3, le bandeau teinté |

## Les jetons (`src/app/globals.css`)

```diff
@@ @theme inline @@
     --color-primary-foreground: var(--primary-foreground);
     --color-primary: var(--primary);
+    --color-inverse-foreground: var(--inverse-foreground);
+    --color-inverse: var(--inverse);
+    --color-brand-soft: var(--brand-soft);

@@ :root @@
-    --primary: oklch(0.205 0 0);
+    --primary: oklch(0.42 0.08 195);
     --primary-foreground: oklch(0.985 0 0);
+    /* The success bar's own dark (#651): the ring #737373 at 0 px keeps 3,78:1 on it,
+       which no colour as light as --primary allows. */
+    --inverse: oklch(0.205 0 0);
+    --inverse-foreground: oklch(0.985 0 0);
+    /* The light tint of --primary (#651): home steps, empty-state and not-found tiles. */
+    --brand-soft: oklch(0.965 0.02 195);

@@ the focus ring's comment @@
-   touches the background around the element, 3:1 at least on white, `muted` and `primary`.
+   touches the background around the element, 3:1 at least on white, `muted` and `inverse`.
```

| jeton | sRGB lu par un test |
|---|---|
| `--primary` | `rgb(0, 90, 91)` (#005a5b) |
| `--primary-foreground` (inchangé) | `rgb(250, 250, 250)` |
| `--inverse` | `rgb(23, 23, 23)` |
| `--inverse-foreground` | `rgb(250, 250, 250)` |
| `--brand-soft` | `rgb(229, 248, 248)` (#e5f8f8) |

Le bloc `.dark`, `--ring`, `--destructive`, `--background`, `--muted`, `--border` ne changent pas.

Écrans P3 : `oklch(0.42 0.08 195)` sort d’un cheveu de sRGB (rouge linéaire −0,008). Un écran large gamme affiche la vraie couleur, un rien plus saturée ; Chromium la ramène à `rgb(0, 90, 91)` partout où un test la lit (canevas sRGB). La luminance y est un peu plus basse : « Créer » passe de 7,70:1 à 7,80:1 ; le contraste n’est jamais plus faible que mesuré.

## Les composants

| fichier | élément | avant | après |
|---|---|---|---|
| `src/components/event/message-bar.tsx` l. 295 | barre réussie | `bg-primary font-medium text-primary-foreground` | `bg-inverse font-medium text-inverse-foreground` |
| idem l. 144 | « Annuler » | `border-primary-foreground/45 bg-transparent text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground` | `border-inverse-foreground/45 bg-transparent text-inverse-foreground hover:bg-inverse-foreground/15 hover:text-inverse-foreground` |
| idem l. 303 | « Fermer » | `hover:bg-primary-foreground/15 hover:text-primary-foreground` | `hover:bg-inverse-foreground/15 hover:text-inverse-foreground` |
| `src/components/event/leg-tabs.tsx` (`LegTrigger`) | nom de l’onglet sélectionné | `<span>{t(`Event.legs.${leg}`)}</span>`, qui hérite du déclencheur | `LegTrigger` reçoit `selected={props.tab === leg}` ; `<span className={cn(selected && "text-primary")}>`. Pas de `data-active:text-primary` sur le déclencheur : shadcn écrit `data-active` en `:where()` (0,1,0), qui perd contre `hover:text-foreground` (0,2,0) de `tabs.tsx` ; le nom virerait au noir sous la souris. `tabs.tsx` ne change pas. |
| `src/components/event/copyable-link.tsx` (`ShareButton`) | « Partager » | `default`, #171717 | aucune classe ne change : pétrole par le jeton |
| `src/components/event/leaflet-map.ts` l. 155 | commentaire du drapeau | `white on a black square` | `white on a --primary square` (classes l. 159 et l. 184 inchangées) |
| `src/app/page.tsx` | chiffres des étapes | `bg-muted` | `bg-brand-soft text-primary` |
| idem | titre | `<h1>` seul | `<div className="flex items-start gap-2.5"><BrandMark className="size-9" /><h1 …>` |
| `src/components/event/empty-leg.tsx` | tuile `Car` | `bg-muted text-muted-foreground` | `bg-brand-soft text-primary` |
| `src/app/e/[id]/not-found.tsx` | tuile `SearchX` | `bg-muted text-muted-foreground` | `bg-brand-soft text-primary` |
| idem | titre | `<h1>` seul | `<div className="flex items-start gap-2.5"><BrandMark className="mt-0.5 size-7" /><h1 className="min-w-0 …">` |
| `src/components/brand/brand-mark.tsx` (nouveau) | la marque | — | voir la page |
| `src/app/icon.svg`, `apple-icon.png`, `favicon.ico` | icônes | #171717 | #005a5b |

Suivent le jeton sans changer de classe : boutons `default` (« Créer » de `/nouveau`, « Partager » compris), cases et radios cochées (« Retour » de `/nouveau`, « Aller et retour »), drapeau et points de la carte. Ne changent pas : `coverage-banner.tsx`, `persons-matrix.tsx`, `no-car-pill.tsx`, `cell-sheet.tsx`, `ride-card.tsx`, `organiser-tiles.tsx`, `contact-footer.tsx`, les e-mails.

## La marque

| | accueil `/` | page introuvable |
|---|---|---|
| place | à gauche du h1 « Fullcar », hors du h1 | à gauche du h1 « Événement introuvable », sous la tuile `SearchX`, hors du h1 |
| taille, 360 et 1280 px | 36 × 36 (`size-9`) | 28 × 28 (`size-7`), `mt-0.5` |
| écart | 10 px (`gap-2.5`) | 10 px |
| texte de remplacement | aucun : `aria-hidden="true"`, `focusable="false"`, pas de `<title>`, pas de lien | idem |

Ailleurs : nulle part.

### Les icônes

| fichier | aujourd’hui (#103) | après |
|---|---|---|
| `icon.svg` | fond #171717 | les deux `#171717` deviennent `#005a5b`, carré plein |
| `favicon.ico`, 16 px | dessinée à la main, PNG RVBA, 9 gris de #171717 à #fafafa | la même image recolorée : gris *g* → `#005a5b + (g − 23) / 227 × (#fafafa − #005a5b)` par canal, arrondi, alpha inchangé ; pas rendue depuis le SVG |
| `favicon.ico`, 32 et 48 px | PNG RVBA rendus du SVG | rendus du nouveau `icon.svg`, PNG RVBA (type 6, 32 bits) ; Next refuse une entrée RVB |
| `apple-icon.png` | 180 × 180 RVB opaque | rendu du nouveau `icon.svg`, 180 × 180 RVB opaque |

Gamme de l’entrée 16 : 23 → (0, 90, 91) ; 48 → (28, 108, 109) ; 74 → (56, 126, 127) ; 99 → (84, 144, 144) ; 124 → (111, 161, 162) ; 149 → (139, 179, 179) ; 174 → (166, 196, 197) ; 200 → (195, 215, 215) ; 225 → (222, 232, 232) ; 250 → (250, 250, 250). L’entrée d’aujourd’hui n’utilise pas 74.

Production, une fois, sans dépendance nouvelle, script non versionné :
- **sharp** (déjà dans `node_modules` par Next), dans le conteneur du slot : `sharp("src/app/icon.svg", { density: 1440 }).resize(n, n).ensureAlpha().png()` pour 32 et 48 ; `.resize(180, 180).flatten({ background: "#005a5b" }).removeAlpha().png()` pour l’icône Apple ; l’entrée 16 recolorée pixel par pixel (`raw()`, la formule, `.png()`).
- **ou qlmanage** (macOS) : `qlmanage -t -s 1440 -o out src/app/icon.svg`, puis moyenne de blocs (1440 = 32 × 45 = 48 × 30 = 180 × 8) en Python sans bibliothèque.
- Le conteneur ICO à la main : en-tête de 6 octets, une entrée de 16 octets par taille (16, 32, 48 ; 32 bits), puis les trois PNG.

## Les critères

Couleurs lues comme `e2e/contrast.ts` : `getComputedStyle`, peint sur un canevas de 1 px, relu en sRGB ; une couleur transparente est composée sur `#ffffff` d’abord. Tolérance ±1 par canal, ±0,05 sur un ratio.

**VI1 · Les jetons**
- VI1.1 « Créer un événement » sur `/` : fond `rgb(0, 90, 91)`, texte `rgb(250, 250, 250)`.
- VI1.2 Barre réussie : fond `rgb(23, 23, 23)`, texte `rgb(250, 250, 250)` ; « Annuler » texte `rgb(250, 250, 250)` ; F1.6 inchangé.
- VI1.3 Aucune attente de couleur existante n’est modifiée (F1.13, `focus-ring*.spec.ts`, `ride-remove.spec.ts`, `sheet.spec.ts`, C9.3, O1.3, O8.3).
- VI1.4 `--brand-soft` relu `rgb(229, 248, 248)` ; `--inverse` relu `rgb(23, 23, 23)`.

**VI2 · Où la couleur apparaît**
- VI2.1 Chiffres de « Comment ça marche » : fond `rgb(229, 248, 248)`, texte `rgb(0, 90, 91)`.
- VI2.2 Pixel 7 : nom de l’onglet sélectionné `rgb(0, 90, 91)`, l’autre non ; s’échangent au tap.
- VI2.2b Souris : `test.use({ locale: "fr-FR", viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false })` ; clic sur « Retour », pointeur laissé dessus : son nom `rgb(0, 90, 91)` (`expect.poll`) ; pointeur ensuite sur « Aller » : « Retour » reste `rgb(0, 90, 91)`, « Aller » non.
- VI2.3 La pastille sous l’onglet sélectionné garde l’ambre de C9.3.
- VI2.4 Tuile de l’état vide : fond `rgb(229, 248, 248)`, couleur `rgb(0, 90, 91)`.
- VI2.5 Tuile de la page introuvable : idem.
- VI2.6 « Proposer une voiture » quand il manque des places, « Trouver une place » : fond `rgb(0, 90, 91)`.
- VI2.7 Avec retour, dans « Ajouter une personne », la case « Aller et retour » cochée : fond `rgb(0, 90, 91)`.
- VI2.8 Drapeau de la carte : fond `rgb(0, 90, 91)` ; étiquette d’un point : bordure `rgb(0, 90, 91)`.
- VI2.9 `/nouveau`, hydratée : « Créer » fond `rgb(0, 90, 91)`.
- VI2.10 `/nouveau` : la case « Retour », cochée par défaut, fond `rgb(0, 90, 91)` ; décochée, non ; les cases des options, décochées, non.
- VI2.11 `/e/{id}/admin`, `navigator.share` fourni par `page.addInitScript` : « Partager » fond `rgb(0, 90, 91)`, « Copier » fond `rgb(255, 255, 255)`.

**VI3 · Où elle n’apparaît pas**
- VI3.1 « Tout le monde a une place » et « 1 sans voiture · 2 places libres » : fond `rgb(245, 245, 245)`.
- VI3.2 Fond du `body` `rgb(255, 255, 255)` sur `/`, `/nouveau`, `/e/{id}`, `/e/{id}/admin`.
- VI3.3 Cellule « Avec Marc » et ligne de passager : fond `rgb(245, 245, 245)`.
- VI3.4 Liens du bas de page et « English » : `rgb(115, 115, 115)`.
- VI3.5 Barre en échec : fond `rgb(255, 255, 255)`, bordure `rgb(231, 0, 11)`.

**VI4 · La marque**
- VI4.1 `/`, 360 × 780 et 1280 × 800 : un `[data-brand-mark]`, 36 × 36, à 10 px (±1) du h1, hauts alignés (±1).
- VI4.2 `/e/{id}` inconnu et `/e/{id}/admin` inconnu (même page, C6.4), deux largeurs : un `[data-brand-mark]`, 28 × 28, à 10 px du h1, haut 2 px (±1) sous celui du h1 ; aucun défilement de côté à 360 px.
- VI4.3 `aria-hidden="true"`, pas de `<title>`, hors lien, jamais focalisée ; noms des h1 inchangés (« Fullcar », « Événement introuvable » ; « Fullcar », « Event not found »).
- VI4.4 Aucun `[data-brand-mark]` sur `/nouveau`, `/e/{id}`, `/e/{id}/admin`.
- VI4.5 `fill` du `rect` `rgb(0, 90, 91)`, du premier `path` `rgb(250, 250, 250)`.
- VI4.6 `/icon.svg` contient `fill="#005a5b"` deux fois, plus de `#171717`.
- VI4.7 `/apple-icon.png` : 180 × 180 ; pixel (2, 2) `rgb(0, 90, 91)` ±2 ; pixel (89, 98) `rgb(250, 250, 250)` ±2.
- VI4.8 `/favicon.ico` lu en octets (`page.request.get`) : 3 entrées, 16, 32 et 48 px, chacune un PNG de type de couleur 6 (octet 25) et 32 bits dans le répertoire. Chaque PNG en `data:` dans une `<img>`, peint sur un canevas : pixel (1, 1) `rgba(0, 90, 91, 255)` ±2, centre (n/2, n/2) `rgba(250, 250, 250, 255)` ±2. L’entrée 16 n’a que des couleurs de la gamme recolorée (±1). `icons.spec.ts` inchangé.

**VI5 · Le contraste**

| id | paire | avant-plan | fond | attendu | seuil | lecture |
|---|---|---|---|---|---|---|
| VI5.1 | texte de « Créer un événement » | #fafafa | #005a5b | 7,70:1 | 4,5:1 | `contrast(lien, lien)` |
| VI5.2 | le même, survolé | #fafafa | `primary/80` sur blanc, #337b7c | 4,72:1 | 4,5:1 | `test.use({ locale: "fr-FR", viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false })` comme `home.spec.ts` ; survol, fin de transition, `backgroundColor` composé sur blanc |
| VI5.3 | nom de l’onglet sélectionné | #005a5b | #ffffff | 8,04:1 | 4,5:1 | `contrast(span, onglet)` |
| VI5.4 | chiffre d’étape | #005a5b | #e5f8f8 | 7,31:1 | 4,5:1 | `contrast(chiffre, chiffre)` |
| VI5.5 | icône de l’état vide | #005a5b | #e5f8f8 | 7,31:1 | 3:1 | `contrast(tuile, tuile)` |
| VI5.6 | icône de la page introuvable | #005a5b | #e5f8f8 | 7,31:1 | 3:1 | `contrast(tuile, tuile)` |
| VI5.7 | voiture de la marque | #fafafa | #005a5b | 7,70:1 | 3:1 | `fill` du `path` et du `rect` |
| VI5.8 | case cochée contre la feuille | #005a5b | #ffffff | 8,04:1 | 3:1 | `backgroundColor` des deux |
| VI5.9 | drapeau de la carte | #fafafa | #005a5b | 7,70:1 | 3:1 | `contrast(drapeau, drapeau)` |
| VI5.12 | bordure de l’étiquette d’un point de voiture (`leaflet-map.ts` l. 184) | #005a5b | #ffffff | 8,04:1 | 3:1 | `borderTopColor` et `backgroundColor` de l’étiquette |
| VI5.13 | texte de « Partager » et de « Créer » | #fafafa | #005a5b | 7,70:1 | 4,5:1 | `contrast(bouton, bouton)` |
| VI5.10 | anneau autour d’un bouton principal | #737373 | #ffffff | 4,74:1 | 3:1 | inchangé (`e2e/focus-ring.ts`) |
| VI5.11 | barre réussie, texte et anneau | #fafafa, #737373 | #171717 | 17,18:1, 3,78:1 | 4,5:1, 3:1 | inchangé (F1.6) |

## Les mots

Aucun mot ajouté ni changé, en français comme en anglais. La marque est décorative.

## Les maquettes existantes

Pas republiées. Elles dessinent encore `--app-primary` en #171717 : boutons principaux (« Partager » compris dans `organizer-view`), barre réussie (qui reste juste), chiffres et tuiles grises, onglet sélectionné noir, drapeau noir. Une ligne d’amendement sous l’en-tête du README.

Pour `home`, `event-board`, `organizer-view`, `organizer-account`, `language-switch`, `place-autocomplete` :

```
- Couleurs : remplacées par `visual-identity` v3 (#651). Ce que cette page dessine en `--app-primary` (#171717) est désormais #005a5b, sauf la barre de message réussie, qui reste #171717 ; l’onglet sélectionné, les tuiles teintées et la marque y sont décrits.
```

Pour `event-map` :

```
- Couleurs : remplacées par `visual-identity` v3 (#651). Le drapeau et le contour des étiquettes, en `--app-primary` (#171717) dans cette page, sont désormais #005a5b. Les autres #171717 de la page, les routes des tuiles dessinées, ne changent pas.
```

`github-link` : pas de ligne.

## Hors périmètre

Mode sombre ; e-mails ; tout en-tête ; une couleur pour « Tout le monde a une place » ; police, coins, ombres, mouvement, émojis, illustrations ; tuiles de la carte ; tout mot.

## Écarté

| option | raison |
|---|---|
| A · Bleu nuit | à L ≤ 0,27 pour garder l’anneau à 3:1 sur la barre, il se lit comme du noir |
| C · Indigo sur papier | tout l’écran change, ≈ 21 attentes de tests, rouge à 4,57:1 |
| H1 · en-tête de 48 px | repousse la première fiche de 48 px, un arrêt de focus de plus, ne peut porter ni « Mes événements » ni la langue |
| M2, M3 | M2 illisible à 16 px, M3 générique |
| bandeau teinté | un sens nouveau ; le propriétaire le garde gris |

## Décisions

1. Decision : B, pas d’en-tête, M1 sur l’accueil et la page introuvable, icônes recolorées, bandeau gris. — Reason : choix du propriétaire sur #651.
2. Decision : la barre réussie garde #171717 par `--inverse`. — Reason : l’anneau #737373 à 0 px y garde 3,78:1.
3. Decision : `--primary` à L = 0,42. — Reason : survol à 4,72:1 au lieu de 4,43:1.
4. Decision : marque décorative, sans texte de remplacement. — Reason : le h1 voisin nomme la page.
5. Decision : 36 px sur l’accueil, 28 px sur la page introuvable. — Reason : hauteur de ligne du h1 de 36 px ; 28 px centré sur la ligne de 32 px.
6. Decision : l’état vide d’un leg garde l’icône `Car`, teintée. — Reason : il parle d’une voiture absente, pas de Fullcar.
7. Decision : `.dark` non modifié. — Reason : appliqué nulle part.
8. Decision : une ligne d’amendement dans les README des maquettes dépassées, sans les republier. — Reason : une maquette, un artifact.
9. Decision : la couleur de l’onglet sélectionné est posée sur le `span` du nom, d’après `props.tab`. — Reason : revue de la v2 ; `data-active` en `:where()` perd contre `hover:text-foreground` ; une couleur propre au `span` l’emporte sur tout héritage, sans dépendre de l’ordre des variantes.
10. Decision : l’entrée 16 px du favicon est recolorée, pas rendue. — Reason : #103, le 16 px est dessiné à la main.
11. Decision : « Partager » passe au pétrole. — Reason : décision du relecteur de la v2 ; c’est le code (bouton `default`) et le dessin d’`organizer-view`.
12. Decision : aucun script de production des icônes n’est versionné. — Reason : une seule fois ; rien à maintenir.

## Révisions

- v1 (25/10/2026, publiée) : exploration, trois directions, l’en-tête, trois marques, contraste mesuré.
- v2 (25/10/2026, publiée à la même URL) : spécification de la direction B après le choix du propriétaire ; A, C, l’en-tête, M2, M3 et le bandeau teinté dans « Écarté ».
- v3 (26/10/2026, publiée à la même URL) : revue de design de la v2, **changements demandés**. Bloquants traités : l’onglet sélectionné colore son nom sur le `span` (le survol le rendait noir), VI2.2b le prouve à la souris ; le favicon garde ses trois entrées RVBA, le 16 px recoloré (#103), VI4.8 lit chaque entrée ; « Partager » en pétrole, dessiné. Suggestions appliquées : `/nouveau` dessiné et couvert (VI2.9, VI2.10) ; page introuvable dessinée comme le code, `/e/{id}/admin` inconnu couvert ; VI5.12, VI5.13 ; `test.use` de VI5.2 ; « Aller et retour » ; note P3 ; commentaire de `leaflet-map.ts` ; production des icônes ; ligne propre à `event-map`. Écart : sur `/nouveau`, la case cochée par défaut est « Retour », pas « Aller et retour » (celle-ci est dans « Ajouter une personne », VI2.7).
