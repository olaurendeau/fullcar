# Description de l’événement

- Artifact : https://claude.ai/artifact/KVWTqFEG6W7HpfQB5rTF8q
- Epic : https://github.com/olaurendeau/fullcar/issues/654 (réponses : https://github.com/olaurendeau/fullcar/issues/654#issuecomment-6409499165 ; revue de la v1 et décisions du coordinateur : https://github.com/olaurendeau/fullcar/issues/654#issuecomment-6409664334)
- Page : `index.html` (autonome ; maquettes à 360 px de large, un navigateur de 1280 px à 50 %)
- Version : v3 (à relire ; revue de la v2 appliquée : un bloquant, trois suggestions ; aucune question ouverte)
- Voisines, **non republiées** : `event-board` v4.6 (l’en-tête, « L’ordre de l’écran », les
  feuilles pleine hauteur et leur barre d’actions, #650), `organizer-view` v3.5 (« Modifier
  l’événement », M2 à M8 ; les legs repliés, #648), `organizer-account` v4 (création sur
  `/nouveau`, jour 30 OA8, e-mails), `home` v2.1 (`/nouveau`), `event-map` (la Carte d’un leg),
  `visual-identity` (en cours : les couleurs de la maquette sont celles d’aujourd’hui).

## Réponses (enregistrées sur #654)

- Q1, jour 30 : (a), décision du propriétaire (26/10/2026). La description est effacée avec les inscriptions.
- Q2, où l’écrire : (a), décision du coordinateur. À la création et dans « Modifier l’événement ».
- Q3, les liens : (a), décision du propriétaire. Les URL `http(s)` deviennent des liens, strictement.
- Revue de la v1, décisions du coordinateur : une URL trompeuse reste du texte ; pas
  d’`og:description` ; une hauteur maximale pour la zone de saisie.

## Pourquoi une page à part

Decision : une nouvelle page `event-description`, pas une révision d’`event-board`. — Reason :
la fonctionnalité touche quatre maquettes (création, feuille « Modifier l’événement »,
en-tête, jour 30), dont plusieurs en révision par d’autres designers. Une page par
fonctionnalité, comme `remove-person` (#645). La prochaine révision d’`event-board` ajoute à
« L’ordre de l’écran » : « 1. En-tête : titre, lieu, Début et Fin, puis la description
(`event-description`) ». Celle d’`organizer-account` reprend `Anonymized.body` modifiée.

## Ce que la page montre

Un texte libre et facultatif de l’organisateur, d’au plus 1000 caractères, avec les retours à
la ligne. Il l’écrit à la création (un champ de plus, vide, qui ne change pas le chemin le plus
court) et dans « Modifier l’événement ». La zone de saisie grandit jusqu’à 6 lignes, sans
jamais dépasser, dans une feuille, la hauteur du corps moins 16 px ; puis elle défile. Tout le groupe le lit dans l’en-tête, sous les dates, replié au-delà de 4 lignes. Une URL
`http(s)://` devient un lien quand ce qu’on lit est exactement l’endroit où il mène ; sinon,
elle reste du texte. Le texte est effacé au jour 30 avec les inscriptions. Il n’apparaît jamais
dans un e-mail, les métadonnées, Sentry ou un journal.

## Le problème

L’organisateur a des détails à donner : le rendez-vous avant le départ, le matériel, le
programme, un lien. L’événement n’a que le titre (80), le lieu (120) et les dates ; le seul
texte libre, la note, est celle d’une voiture. Aujourd’hui, il bourre le titre, ou il envoie un
second message dans le groupe. Ce message se perd, et celui qui arrive par le lien ne le voit
jamais.

## Histoires

- **H1** Écrire en créant, ou ne rien taper, sans que la création prenne plus de temps (DS1.1–DS1.8, DS1.14).
- **H2** Ajouter, corriger, effacer depuis « Modifier l’événement » (DS1.9–DS1.14).
- **H3** Le participant la lit sous les dates, sans perdre le bandeau de son leg (DS2.1–DS2.13).
- **H4** Un lien s’ouvre dans un nouvel onglet, à l’adresse exacte qu’on lit, sans que Fullcar le suive ni le résume (DS3.1–DS3.12).
- **H5** Une personne nommée dedans sait que le texte disparaît au jour 30 et ne part nulle part ailleurs (DS4.1–DS5.7).

## Écrire

- Le champ est dans `EventFormFields`, partagé. À la création : après « Heure de fin » (ou après
  la case « Retour » décochée), avant « Options ». Dans la feuille : dernier champ du corps.
- `Textarea` existant, `field-sizing-content`, puis `overflow-y: auto`. Pas de `maxlength`.
- **Hauteur maximale : le plus petit de deux nombres.**
  - **6 lignes**, avec la marge intérieure (16 px) et la bordure (2 px) : 162 px avec les lignes
    de 24 px (`text-base`, sous 768 px), 138 px avec les lignes de 20 px (`md:text-sm`, à partir
    de 768 px).
  - **Dans une feuille, la hauteur du corps moins 16 px** (8 px de chaque côté, règle 5
    d’event-board v4.6), relue avec `visualViewport` (règle 4).
- La hauteur minimale, 64 px, cède au plafond quand il est plus petit. Sur `/nouveau` (pas une
  feuille), et sous 240 px visibles (règle 8 : le titre et la barre défilent avec le corps),
  seules les 6 lignes valent. Ni la zone, ni la ligne du curseur ne passent jamais sous la barre :
  **aucune exception à la règle 5**.
- Mesuré sur la maquette : le titre et la barre prennent 174 px.

  | zone visible | corps | zone |
  |---|---|---|
  | 360 × 640, clavier fermé | 466 px | 162 px |
  | 369 px (clavier ouvert, capture 1 de #650) | 195 px | 162 px, à 10 et 23 px du titre et de la barre |
  | 270 px (iPhone SE, clavier ouvert, règle 8) | 96 px | 80 px, à 8 px de chaque côté (W4c) |

- Normalisation, par une seule fonction du domaine sûre dans le navigateur, partagée par le
  serveur et le compteur :
  - le texte est rogné au début et à la fin ;
  - `\r\n` et `\r` deviennent `\n` ;
  - les blancs en fin de ligne sont retirés ;
  - trois retours ou plus deviennent deux ;
  - un texte invisible seulement n’est pas une description (`null`) ;
  - 1000 points de code au plus, NUL refusé.
- Le compteur apparaît à 900 caractères comptés comme le serveur les compte ; il passe en rouge
  au-delà de 1000. L’erreur arrive à l’envoi.
- Feuille : M2.5 (rien changé), M2.6 (lecture seule, « Envoi en cours… » dans la barre), M6.1–M6.2
  (`before` porte la description) et M8 (échecs) restent inchangés, avec la description en plus.

## Lire

- Le texte est dans le `<header>`, après les dates, avant la barre de messages et « Vos
  inscriptions ». Pages : `/e/{id}`, `/e/{id}/admin`, et `/e/{id}/moi` une fois livrée. 16 px sur
  24, `white-space: pre-wrap`, `tab-size: 4`, `wrap-anywhere`, sans icône ni libellé. Rien sans
  description.
- Au-delà de 4 lignes : 4 lignes (96 px) finies par « … », puis le bouton des listes du panneau
  (`Button` `outline`, `h-11 w-full`, 8 px sous le texte, sans chevron), « Afficher toute la
  description » / « Réduire la description ». Repliée à chaque chargement, en mémoire seulement.
- **Ce que rend le serveur** : le texte entier, déjà replié par CSS. Le bouton s’y ajoute si le
  texte a plus de 4 lignes par `\n` ou plus de 140 points de code. Le navigateur mesure ensuite
  et corrige : `scrollHeight > clientHeight + 1`. Le texte ne bouge donc jamais. Seul le bouton
  (44 + 8 px) peut apparaître ou disparaître une fois, à l’hydratation, quand la devinette se
  trompe.
- **Nouvelle mesure** : un `ResizeObserver` sur le texte (rotation, largeur, taille du texte,
  zoom), `document.fonts.ready`, et chaque changement du texte (6 lignes remplacées par 5
  gardent la même hauteur repliée : aucun redimensionnement ne le signalerait).
- **Sans JavaScript** : un `<noscript><style>` déplie le texte et cache le bouton. Ce n’est pas
  `@media (scripting: none)`, absent de Safari avant 17.
- Mesuré sur la maquette (Chrome headless, 360 px) :
  - le texte va de 166 à 262 px, le bouton de 270 à 314 px ;
  - le bandeau va de 468 à 508 px, avec « Vos inscriptions » repliée.

  Le pli ajoute au plus 164 px à l’en-tête. Sur le cas le plus haut d’event-board (bandeau à
  494–534 px, matrice dépliée), le bandeau finit donc vers 698 px, sous 780 : C9.2 tient
  (DS2.9 le prouve).
- Un lien caché par le pli qui reçoit le focus déplie la description.

## Les liens

1. **Candidat.** Il commence par `http://` ou `https://` (toute casse), au début du texte ou
   après un caractère qui n’est ni une lettre, ni un chiffre, ni `_ - . / @ +`. Il finit au
   premier blanc : tabulation, `\n`, ou catégorie Zs (dont U+00A0 et U+202F). Sortent ensuite
   de sa fin, autant de fois qu’il le faut : `. , ; : ! ? … > " ' » ” ’`, et une `)` ou un `]`
   sans ouvrant.
2. **Refus** : le candidat entier reste du texte dans quatre cas.
   - Il contient un caractère Cf, ou de U+200B à U+200F, U+2028 à U+202E, U+2060 à U+2064,
     U+FEFF, ou un caractère Cc autre que la tabulation et `\n` (dont U+0085) (DS3.10).
   - L’autorité contient `@` (DS3.9).
   - L’autorité n’est pas `[A-Za-z0-9.-]+(:\d{1,5})?`, ou un label commence par `xn--` (DS3.11).
   - `new URL()` échoue, ou son `host` n’est pas l’autorité tapée en minuscules (DS3.11).
3. **Lien** : `<a href="{candidat}" target="_blank" rel="noopener noreferrer nofollow ugc"
   dir="ltr">`, en `unicode-bidi: isolate` (DS3.12), suivi de `Contact.newTab` en `sr-only`.
   Aucun aperçu, aucune redirection, rien d’ajouté.

Les cas L1 à L23 sont dans le tableau de la page, et forment le test DS3.1.

## Jour 30

La description est effacée (`null`) dans la transaction de l’anonymisation (OA8.1). Les pages
anonymisées (OA8.3, OA8.4) et « Mes événements » ne la montrent jamais. Compte supprimé : elle
reste lisible jusqu’au jour 30, et personne ne peut la modifier.

## Où elle ne va jamais

Elle ne va dans aucun de ces endroits :

- les e-mails (DS5.1) ;
- le `<head>` (DS5.2) ;
- les métadonnées : ni description, ni `og:`, ni `twitter:`, comme sur `main` (DS5.3) ;
- les moteurs de recherche : `noindex` inchangé (DS5.4) ;
- Sentry et les journaux (DS5.5) ;
- Web Analytics (DS5.6) ;
- une URL (DS5.7).

**Risque accepté** (décision du coordinateur) : une messagerie peut fabriquer un aperçu à partir
du début du corps de la page, donc de la description, et cet aperçu reste dans la discussion
après le jour 30. Le titre de l’événement est déjà dans ces aperçus aujourd’hui, avec la même
durée, et seuls ceux qui ont le lien le voient.

## États couverts

| état | maquette | critères |
|---|---|---|
| pas de description | R1, W1 | DS1.2, DS2.1 |
| courte, un lien ; quatre lignes exactement | R2 | DS2.3, DS2.5, DS3.2 |
| longue : repliée à 360 × 780, dépliée | R3, R4 | DS2.4, DS2.6, DS2.9 |
| devinette du serveur fausse ; rotation ; texte agrandi | — | DS2.13 |
| 1000 caractères sans espace | R5 | DS2.3 |
| invisible seulement ; trop de retours ; blancs en fin de ligne | — | DS1.4, DS1.5 |
| 1000 caractères en saisie, puis au-delà | W3 | DS1.6, DS1.7, DS1.14 |
| 1000 caractères dans la feuille, clavier fermé et ouvert | W4, W4b | DS1.14 |
| iPhone SE, clavier ouvert (270 px visibles) | W4c | DS1.14 |
| caractère interdit, requête forgée, pas le droit | — | DS1.8, DS1.13 |
| feuille : modifier, vider, rien changé, simultané | W4 | DS1.9–DS1.11 |
| envoi en cours | W5 | DS1.12 |
| hors ligne, échec, disparu | W6 | DS1.12 |
| mise à jour d’une page ouverte | — | DS2.7, DS2.8 |
| sans JavaScript, Safari avant 17 compris | R6 | DS2.11 |
| espace organisateur (v3.5) | R7 | DS2.2 |
| anglais | R8 | DS2.4 |
| lien caché atteint au clavier | R9 | DS3.7 |
| lien trompeur, contrôle Cc | tableau L14–L23 | DS3.9–DS3.12 |
| 1280 px | ordinateur | DS2.10 |
| jour 29, jour 30, supprimé, compte supprimé | J1, J2 | DS4.1–DS4.5 |
| aperçu de partage | P1 | DS5.2, DS5.3 |

## Les mots

| clé | fr | en |
|---|---|---|
| `CreateEvent.description` | Description (facultatif) | Description (optional) |
| `CreateEvent.descriptionHint` | Ce que le groupe doit savoir. Visible par toutes les personnes qui ont le lien, effacée 30 jours après l’événement. | What the group should know. Visible to everyone who has the link, erased 30 days after the event. |
| `CreateEvent.descriptionCount` | {count} caractères sur {max} | {count} of {max} characters |
| `CreateEvent.errors.tooLong` (inchangée) | 1000 caractères au maximum. | 1000 characters at most. |
| `CreateEvent.errors.invalidText` (inchangée) | Ce texte contient un caractère non autorisé. | This text contains a character that is not allowed. |
| `Event.description.more` | Afficher toute la description | Show the whole description |
| `Event.description.less` | Réduire la description | Show less |
| `Contact.newTab` (inchangée) | (s’ouvre dans un nouvel onglet) | (opens in a new tab) |
| `Anonymized.body` (modifiée, organizer-account) | Le {date}, 30 jours après l’événement, la description, les prénoms, les numéros, les voitures et les inscriptions ont été effacés. Il reste le titre, le lieu et les dates. | On {date}, 30 days after the event, the description, first names, phone numbers, cars and sign-ups were erased. The title, place and dates remain. |

Retirée en v2 : `Event.metaDescription`.

## Focus

- Le bouton garde le focus ; le code le lui donne sur WebKit, comme « Réduire la liste ». Après
  « Réduire », il revient en vue (`scrollIntoView({ block: "nearest" })`).
- Un lien caché qui reçoit le focus déplie la description.
- Un bouton qui disparaît avec le focus envoie le focus sur `#event-title`.
- Sur `/admin`, l’ordre au clavier suit organizer-view v3.5 : l’espace organisateur entier,
  puis l’en-tête (les liens de la description, puis son bouton). Aucune règle de focus du
  panneau ne vise l’en-tête.
- Le premier champ en erreur prend le focus, mis en vue entre l’en-tête et la barre de la
  feuille (v4.6, règle 5).
- Aucune animation.

## Critères

DS1.1 à DS5.7, écrits en entier dans la page (section « Critères d’acceptation »), dans
l’ordre. Changés en v2 : DS1.2, DS1.4, DS1.7, DS1.12, DS2.2, DS2.4, DS2.6, DS2.11, DS3.1,
DS3.2, DS3.3, DS4.3, DS5.2, DS5.3. Nouveaux : DS1.14, DS2.13, DS3.9 à DS3.12. Changés en v3 :
DS1.14 (avec un cas à 360 × 270), DS2.8, DS2.13, DS3.1, DS3.10. Le marqueur des
tests de fuite est `Zorglub4729`.

- **DS1.2** dépend de #581. Tant qu’elle n’est pas livrée, A2.2 de #232 vaut : 7 actions depuis
  `/`. Ensuite, ce sont OA1.2 et OA1.3 : 8 actions sans session, 7 avec. Toujours en moins de 30 s.
- **DS3.3** : Playwright pour le navigateur, et un espion de `fetch` dans Vitest pour le serveur.

## Décisions

Les mêmes, dans le même ordre, que la section « Décisions » de `index.html` (20 décisions) :

- une page à part ;
- le mot « Description », jamais « note » ;
- le champ à la création et dans la feuille (Q2 = a) ;
- 1000 points de code après normalisation ;
- `pre-wrap`, avec les blancs de fin de ligne retirés et une ligne vide au plus ;
- un compteur à 900 qui compte comme le serveur, sans `maxlength` ;
- une zone plafonnée au plus petit de 6 lignes et du corps moins 16 px ;
- dans l’en-tête pour tout le monde ;
- repliée au-delà de 4 lignes, en mémoire ;
- le bouton des listes, pas le bouton de titre de v3.5 ;
- le serveur rend le texte replié et devine le bouton ;
- `<noscript><style>` sans JavaScript ;
- ni icône ni libellé ;
- des liens `http(s)` (Q3 = a) ;
- les URL trompeuses restent du texte ;
- les contrôles Cc aussi ;
- un lien isolé du texte autour ;
- un lien caché focalisé déplie la description ;
- effacée au jour 30 (Q1 = a) ;
- aucune métadonnée, avec le risque accepté.

## Hors périmètre

- La mise en forme, les images et les pièces jointes.
- Les aperçus de liens, les raccourcisseurs, le comptage des clics, les IDN comme liens.
- Prévenir les participants d’un changement : les notifications sont hors V1.
- Répondre ou commenter : la messagerie est hors V1.
- Une description par leg ou par voiture.
- La traduction.
- La description dans « Mes événements », un e-mail, les métadonnées, une image Open Graph ou
  les moteurs.
- L’historique des versions, savoir qui l’a lue.
- « Copier la description ».
- Les options (#68).

## Documentation à mettre à jour (chemins sensibles, PR mergée par l’humain)

- `docs/agents/glossary.md` : l’Event porte « description (facultative) » ; une ligne
  **Description** ; l’Anonymisation l’efface.
- `docs/agents/product.md`, « Effacé à 30 jours » : ajouter « la description de l’événement ».
- La migration de la colonne (`**/migrations/**`).
- `/confidentialite` : la ligne « Ce que nous gardons », texte du propriétaire.

## Pour l’architecte

- `EventHeader` et `EventState` portent la description.
- `validateEvent` et `validateEventChange` la valident, par la normalisation partagée avec le
  compteur.
- `updateEvent` la compare dans `before`, et la purge l’efface.
- Le découpage en liens et la devinette du pli sont des fonctions pures du domaine, sûres dans
  le navigateur.

## Révisions

- v1 (25/10/2026) : première version, épique #654. Publiée sur https://claude.ai/artifact/KVWTqFEG6W7HpfQB5rTF8q.
- v2 (26/10/2026) : réponses Q1 = a et Q3 = a (propriétaire), Q2 = a (coordinateur),
  enregistrées sur #654.
  - **Revue de la v1** : modifications demandées, avec trois bloquants, tranchés par le
    coordinateur.
    1. Les URL trompeuses restent du texte : identifiant avant `@`, caractère invisible ou
       bidirectionnel, hôte non ASCII, `xn--` ou réécrit. Le lien est isolé (DS3.9 à DS3.12,
       L14 à L22).
    2. Pas d’`og:description` ; le risque est accepté (DS5.3).
    3. Une hauteur maximale de 6 lignes pour la zone de saisie, dessinée à 1000 caractères sur
       `/nouveau` et dans la feuille v4.6, clavier fermé et ouvert (DS1.14, W3, W4, W4b).
  - **Suggestions appliquées** :
    - le bouton des listes ;
    - ce que rend le serveur, la mesure, Safari avant 17 (DS2.4, DS2.11, DS2.13) ;
    - le compteur qui compte comme le serveur ;
    - le découpage des liens (Zs, `…`, `>`, ponctuation répétée, ce qui précède `http`) ;
    - `pre-wrap` ;
    - DS1.2 selon #581 ;
    - `/moi` une fois livrée ;
    - un espion de `fetch` ;
    - « Show less » ;
    - organizer-view v3.5 (R7, focus) ;
    - l’envoi en cours dessiné (W5).
  - Republiée à la même URL.
- v3 (26/10/2026) : la revue de la v2 confirme les trois bloquants de la v1 levés et approuve
  les ajouts.
  - **Bloquant levé** : sur un iPhone SE clavier ouvert, la zone passait sous « Valider ». Elle
    est plafonnée au plus petit de 6 lignes et de la hauteur du corps moins 16 px, sans exception
    à la règle 5 de v4.6 (DS1.14, avec un cas à 360 × 270 ; dessin W4c).
  - **Suggestions appliquées** :
    - la mesure du pli est refaite quand le texte change (DS2.8, DS2.13) ;
    - les contrôles Cc autres que la tabulation et `\n` sont refusés dans une URL (DS3.10, L23) ;
    - le plafond est dit en lignes, 162 px puis 138 px avec `md:text-sm`.
  - Republiée à la même URL.
