# Produit

## Pour qui

Des groupes qui se déplacent ensemble vers un événement ponctuel : des amis, un club, une
troupe de scouts, un mariage, un week-end au ski. L'organisateur n'est pas un
professionnel : il fait ça une fois, dans l'urgence, souvent depuis son téléphone.

Le cas le plus fréquent, et celui qui doit être le plus simple : **des parents conduisent
des enfants, à l'aller seulement, ou au retour seulement.** Un outil qui force à créer deux
événements pour ça a déjà perdu.

L'organisateur a un compte : une adresse e-mail, sans mot de passe. Les participants n'en
ont jamais.

## Ce qui est pénible ailleurs

Les concurrents (Covievent, Covoitribu) demandent un **login par e-mail à chaque
modification** — donc un aller-retour par la boîte mail pour changer un horaire —, affichent
une interface chargée, et ne gèrent pas le retour. Ce sont les trois choses à ne pas
reproduire, dans cet ordre.

## Promesses

- **Zéro compte pour les participants.** Un participant ne donne jamais d'adresse e-mail et
  n'a jamais de compte : son identité, c'est un lien et un jeton dans le navigateur.
- **Un compte léger pour l'organisateur.** Une adresse e-mail, pas de mot de passe : un lien
  de connexion par e-mail, puis une session qui dure. Il retrouve ses événements dans
  « Mes événements », sur n'importe quel appareil, sans repasser par sa boîte mail pour
  modifier un événement. Créer un événement n'attend ni la confirmation de l'adresse, ni
  l'envoi de l'e-mail.
- **Un seul écran.** Tout l'événement tient sur une page : voitures, places libres,
  personnes sans voiture. Pas de navigation à apprendre.
- **Un geste.** Après la première inscription, rejoindre une voiture est un seul tap quand
  l'appareil a exactement une personne « sans voiture » sur ce leg ; sinon le tap ouvre la
  feuille pour choisir qui monte.
- **Aller et retour indépendants**, dans le même événement, sous deux onglets.
- **Effacé à 30 jours.** 30 jours après le dernier leg (heure de Paris), tout ce qui concerne
  les participants est effacé : prénoms, téléphones, voitures, lieux de départ, notes,
  inscriptions. Restent le titre, le lieu et les dates, dans l'historique de l'organisateur,
  jusqu'à la suppression de son compte, par lui ou après 3 ans sans visite. Un événement
  sans compte est supprimé en entier.
- **Des e-mails, pas de courrier.** Quatre e-mails seulement : confirmer l'adresse, se
  connecter, la réponse à une demande de connexion sans compte, et l'avertissement avant la
  suppression d'un compte inactif. Aucun texte saisi par quelqu'un, aucune image, aucun suivi.

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
  Ride ; elle choisit ensuite son arrêt sur la fiche de la voiture. Le geste reste unique.
- **Le conducteur retire sa voiture** : ses passagers repassent « sans voiture » sur ce leg,
  et le bandeau de couverture le reflète.
- **Le conducteur réduit ses places** sous le nombre d'occupants : il choisit qui sort ; les
  sortants repassent « sans voiture ».
- **Retirer une personne** : depuis sa feuille, sur l'appareil qui l'a inscrite, ou par
  l'organisateur depuis son espace, après une confirmation. Tout ce qui la concerne est
  effacé : prénom, numéro, voitures, places. Ses passagers repassent « sans voiture » sur ce
  leg. Personne n'est prévenu, et rien ne s'annule.
- **Fraîcheur** : la page se recharge quand elle revient au premier plan, et interroge le
  serveur toutes les 15 s environ tant qu'elle est visible. Pas de websocket.
- **Lien court** : `/e/{id}` doit rester court et tenir dans un SMS.

## Ce qui compte comme fait

Un critère n'est tenu que s'il est **prouvé par un test**, pas constaté à l'œil :

| critère | preuve attendue |
|---|---|
| créer un événement en moins de 30 s | test de bout en bout depuis `/` : 8 actions pour un nouvel organisateur (l'adresse comprise), 7 avec une session ; aucun e-mail ni aucune réponse du fournisseur attendus sur ce chemin |
| rejoindre une voiture en 1 tap après la 1re inscription, quand l'appareil a exactement une personne « sans voiture » sur ce leg | test de bout en bout, un seul clic sur la place libre ; avec deux personnes « sans voiture », le clic ouvre la feuille |
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
- organisateur sur un autre appareil : il se connecte, et « Mes événements » le ramène à
  l'espace organisateur ;
- adresse pas encore confirmée : l'événement marche, l'espace organisateur ne s'ouvre que
  dans le navigateur de création (le lien à partager y ramène), et ailleurs l'écran renvoie
  à l'e-mail de confirmation ;
- e-mail qui ne part pas : l'événement existe quand même, et l'avis le dit ;
- lien de connexion expiré ou déjà utilisé : la page le dit, et en redemande un en un tap ;
- événement anonymisé, ouvert par le lien à partager ;
- événement dont le compte a été supprimé : ouvert aux participants, sans organisateur.

## La carte

Dans chaque leg, une **Carte** montre le lieu de l'événement et le lieu de chaque voiture de
ce leg qui a une position (départ à l'aller, dépose au retour), relié à l'événement par une
ligne droite, au point exact, voitures comprises ; une voiture à moins de 25 m du lieu de
l'événement n'a pas de ligne. Elle est en lecture seule : elle ne dit rien que la liste ne
dise déjà, et on n'y choisit ni n'y déplace aucune position. Ses tuiles sont servies par
notre origine : le navigateur ne parle qu'à elle. Restent hors périmètre :
l'itinéraire, la distance, la durée, et les Arrêts sur la carte (#68).

## Hors périmètre V1

Notifications, appariement automatique, paiement, messagerie, comptes pour les
participants, co-organisateurs. Les quatre e-mails du compte ne sont pas des
notifications. Proposer l'un de ces sujets est une décision produit : remonter à l'humain,
ne pas le glisser dans une PR.
