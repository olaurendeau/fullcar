# Produit

## Pour qui

Des groupes qui se déplacent ensemble vers un événement ponctuel : des amis, un club, une
troupe de scouts, un mariage, un week-end au ski. L'organisateur n'est pas un
professionnel : il fait ça une fois, dans l'urgence, souvent depuis son téléphone.

Le cas le plus fréquent, et celui qui doit être le plus simple : **des parents conduisent
des enfants, à l'aller seulement, ou au retour seulement.** Un outil qui force à créer deux
événements pour ça a déjà perdu.

## Ce qui est pénible ailleurs

Les concurrents (Covievent, Covoitribu) demandent un **login par e-mail à chaque
modification** — donc un aller-retour par la boîte mail pour changer un horaire —, affichent
une interface chargée, et ne gèrent pas le retour. Ce sont les trois choses à ne pas
reproduire, dans cet ordre.

## Promesses

- **Zéro compte.** Aucune adresse e-mail obligatoire, à aucun moment. L'identité, c'est un
  lien et un jeton dans le navigateur.
- **Un seul écran.** Tout l'événement tient sur une page : voitures, places libres,
  personnes sans voiture. Pas de navigation à apprendre.
- **Un geste.** Après la première inscription, rejoindre une voiture est un seul tap.
- **Aller et retour indépendants**, dans le même événement, sous deux onglets.
- **Rien à nettoyer.** Les données disparaissent 30 jours après l'événement.

## Ce qui compte comme fait

Un critère n'est tenu que s'il est **prouvé par un test**, pas constaté à l'œil :

| critère | preuve attendue |
|---|---|
| créer un événement en moins de 30 s | test de bout en bout, chemin le plus court compté |
| rejoindre une voiture en 1 tap après la 1re inscription | test de bout en bout, un seul clic sur la place libre |
| un appareil gère plusieurs personnes | test : deux personnes créées avec le même jeton, les deux modifiables |
| aller et retour indépendants | test : placer quelqu'un à l'aller ne le place pas au retour |
| utilisable sur 360 px | capture à 360 px, aucun débordement horizontal |

## États qui ne sont pas des cas limites

Ils sont la moitié du produit, et chacun doit avoir une UI pensée :

- événement vide (aucune voiture, aucune personne) ;
- personne sans voiture alors qu'il reste des places ailleurs ;
- voiture complète ;
- quelqu'un qui conduit à l'aller et cherche une place au retour ;
- jeton perdu (appareil changé) — le « lien perso » et son QR code sont la réponse ;
- lien d'admin perdu : rien à faire, et il faut le dire honnêtement avant.

## Hors périmètre V1

Carte, notifications, appariement automatique, paiement, messagerie, comptes. Proposer l'un
de ces sujets est une décision produit : remonter à l'humain, ne pas le glisser dans une PR.
