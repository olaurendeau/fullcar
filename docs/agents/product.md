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

## Règles d'interaction

- **Prendre une place.** Un tap sur une place libre place directement la personne de
  l'appareil si elle est la seule « sans voiture » sur ce leg. Sinon une feuille s'ouvre avec
  les personnes de l'appareil qui ne sont pas dans une voiture : celles « sans voiture »
  précochées, celles « pas concernées » décochées. On ajuste, on valide. Une personne peut
  ainsi placer plusieurs personnes d'un coup, dans la limite des places libres. Sans aucune
  personne sur l'appareil, le tap ouvre la première inscription (prénom, téléphone
  facultatif), qui place directement.
- **Ajouter une personne** : la case « aller et retour » (cochée) la déclare sans voiture sur
  les deux legs ; décochée, seulement sur l'onglet en cours. Chaque leg se bascule ensuite
  séparément entre dans une voiture, sans voiture et pas concernée.
- **Rehausseurs** (option) : une personne qui a besoin d'un rehausseur peut prendre une place
  dans une voiture qui n'en a plus de libre. On l'avertit (« plus de rehausseur dans cette
  voiture ») sans bloquer : le parent peut fournir le sien.
- **Arrêts** (option points de RDV) : le tap sur une place libre place la personne au lieu du
  Ride ; elle choisit ensuite son arrêt sur la carte de la voiture. Le geste reste unique.
- **Le conducteur retire sa voiture** : ses passagers repassent « sans voiture » sur ce leg,
  et le bandeau de couverture le reflète.
- **Le conducteur réduit ses places** sous le nombre d'occupants : il choisit qui sort ; les
  sortants repassent « sans voiture ».
- **Fraîcheur** : la page se recharge quand elle revient au premier plan, et interroge le
  serveur toutes les 15 s environ tant qu'elle est visible. Pas de websocket.
- **Lien court** : `/e/{id}` doit se dicter et tenir dans un SMS.

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
