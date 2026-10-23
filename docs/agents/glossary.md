# Vocabulaire du domaine

Les mêmes mots dans le code, la base, l'UI et les issues. Un synonyme est un défaut.

| terme | définition |
|---|---|
| **Event** | un déplacement de groupe : titre, lieu, début, fin, options activées, jeton d'admin. Le **début** (`aller_at`) est la date et l'heure de l'aller. La **fin** (`retour_at`) est la date et l'heure auxquelles part le retour ; elle est vide s'il n'y a pas de retour, donc un événement sans retour n'a pas de fin. Le retour est coché par défaut à la création et peut être décoché : l'événement n'a alors qu'un leg, et pas d'onglets. |
| **Leg** | un sens du trajet : `aller` ou `retour`. Jamais « trajet » tout court, qui prête à confusion avec Ride. |
| **Person** | quelqu'un qui participe : prénom, téléphone (optionnel), besoin de rehausseur (si l'option est active), jeton personnel. Une Person n'est pas un compte : elle n'a pas de mot de passe et peut être créée par quelqu'un d'autre. |
| **Ride** | une voiture proposée pour **un** leg : conducteur (Person), lieu et heure, nombre de places, rehausseurs disponibles, participation aux frais, note libre. Une voiture à l'aller et une voiture au retour sont deux Rides. Le **lieu** est celui du départ à l'aller, et celui de la dépose au retour (au retour, on part de l'événement). L'heure est préremplie avec celle de l'Event. |
| **Position** | les coordonnées d'un lieu, quand il a été choisi parmi les propositions : latitude et longitude (`location_lat`, `location_lng`), les deux ou aucune. Facultative, sur l'Event et sur le Ride ; un lieu tapé sans choisir de proposition n'en a pas. Un lieu est le couple de son texte et de sa position. |
| **Places** | les places **passagers** proposées, conducteur exclu. |
| **Participation** | un montant facultatif par passager, affiché sur le Ride. Le reste (modalités, péage…) va dans la note. |
| **Placement** | le fait qu'une Person occupe une place dans un Ride pour un leg donné, ou soit explicitement **sans voiture**. La clé est le couple (Person, Leg) : une personne a au plus un Placement par leg. Un passager peut y préciser l'**arrêt** où il monte (ou descend, au retour) ; sans arrêt, c'est le lieu du Ride. |
| **Arrêt** (`Stop`) | un point de rendez-vous sur la route d'un Ride : lieu et heure, ordonnés. Ajouté par le conducteur, seulement si l'option « points de RDV » est active. Au retour, ce sont des points de dépose. |
| **État sur un leg** | pour chaque leg, une Person est soit **dans une voiture** (conductrice d'un Ride, ou passagère), soit **sans voiture**, soit **pas concernée** (elle ne fait pas ce trajet). Pas concernée = aucun Placement et ne conduit pas. Une conductrice n'a pas de Placement sur le leg où elle conduit. |
| **Sans voiture** | un état déclaré, pas une absence d'information. C'est ce qui alimente le bandeau de couverture et la liste à placer. |
| **Pas concernée** | l'absence de Placement sur un leg, pour une personne qui ne conduit pas sur ce leg : elle ne fait pas ce trajet. Exemple : le parent qui dépose à l'aller et ne revient pas. N'entre pas dans la couverture. |
| **Jeton d'admin** | créé avec l'événement, permet de tout modifier, et donne les numéros des personnes sans voiture (DO1). Voyage dans le fragment de l'URL, `/e/{id}/admin#{token}`, jamais dans le chemin. |
| **Jeton personnel** | créé à la première inscription, stocké en `localStorage`. Permet de modifier **toutes** les personnes créées avec lui. Transférable par le « lien perso » (URL + QR). |
| **Lien perso** | l'URL qui porte le jeton personnel dans son fragment, `/e/{id}/moi#{token}`, et son QR code, pour passer d'un appareil à l'autre. |
| **Couverture** | combien de personnes restent sans voiture pour un leg. C'est le chiffre du bandeau, et la seule métrique que l'organisateur regarde. |
| **Option** | un réglage d'organisateur qui **retire ou ajoute de l'UI** : rehausseurs, participation aux frais, points de RDV (arrêts sur la route des Rides). Désactivée, l'option est absente de l'écran, pas grisée. |
| **Purge** | suppression des données 30 jours après la date du **dernier leg** : celle du retour si l'événement en a un, sinon celle de l'aller. |
