# Vocabulaire du domaine

Les mêmes mots dans le code, la base, l'UI et les issues. Un synonyme est un défaut.

| terme | définition |
|---|---|
| **Event** | un déplacement de groupe : titre, lieu, date et heure d'aller, date et heure de retour, options activées, jeton d'admin. |
| **Leg** | un sens du trajet : `aller` ou `retour`. Jamais « trajet » tout court, qui prête à confusion avec Ride. |
| **Person** | quelqu'un qui participe : prénom, téléphone (optionnel), besoin de rehausseur (si l'option est active), jeton propriétaire. Une Person n'est pas un compte : elle n'a pas de mot de passe et peut être créée par quelqu'un d'autre. |
| **Ride** | une voiture proposée pour **un** leg : conducteur (Person), lieu et heure de départ, nombre de places, rehausseurs disponibles, participation aux frais, note libre. Une voiture à l'aller et une voiture au retour sont deux Rides. |
| **Placement** | le fait qu'une Person occupe une place dans un Ride pour un leg donné, ou soit explicitement **sans voiture**. La clé est le couple (Person, Leg) : une personne a au plus un Placement par leg. |
| **Sans voiture** | un état déclaré, pas une absence d'information. C'est ce qui alimente le bandeau de couverture et la liste à placer. |
| **Jeton d'admin** | créé avec l'événement, permet de tout modifier. Dans l'URL `/e/{id}/admin/{token}`. |
| **Jeton personnel** | créé à la première inscription, stocké en `localStorage`. Permet de modifier **toutes** les personnes créées avec lui. Transférable par le « lien perso » (URL + QR). |
| **Lien perso** | l'URL qui porte le jeton personnel, et son QR code, pour passer d'un appareil à l'autre. |
| **Couverture** | combien de personnes restent sans voiture pour un leg. C'est le chiffre du bandeau, et la seule métrique que l'organisateur regarde. |
| **Option** | un réglage d'organisateur qui **retire ou ajoute de l'UI** : rehausseurs, participation aux frais, point de rendez-vous. Désactivée, l'option est absente de l'écran, pas grisée. |
| **Purge** | suppression des données 30 jours après la date de retour de l'événement. |
