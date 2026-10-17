# Changer de langue

- Artifact : https://claude.ai/artifact/QuLmJJeHC1vhFjxctxo4eG
- Epic : https://github.com/olaurendeau/fullcar/issues/113
- Page : `index.html` (autonome, maquettes à 360 px de large)

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
