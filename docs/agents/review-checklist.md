# Points de revue propres à Fullcar

À ajouter à la checklist de base. Chaque point est là parce qu'il est invisible dans l'UI de
celui qui écrit le code.

## Jetons

- Au moins 128 bits, d'un générateur cryptographique — pas `Math.random`, pas un UUID v1,
  pas un horodatage.
- Hashés en base. Aucun chemin n'écrit un jeton en clair, migrations comprises.
- Jamais journalisés : ni le jeton, ni l'URL complète qui le contient, ni une version
  tronquée. Vérifier aussi les journaux d'accès et les rapports d'erreur.
- Jamais dans le chemin ni dans la query string : uniquement dans le fragment (`#…`) ou dans
  le corps d'une requête. Un jeton dans un chemin finit dans les journaux de Vercel.
- Comparaison à temps constant.
- `Referrer-Policy: no-referrer` présent sur toutes les pages.

## Visibilité du téléphone

- La règle (admin, ou même voiture pour le même leg) est appliquée **côté serveur**. Masquer
  dans la vue ne compte pas : la donnée ne doit pas quitter le serveur.
- Un seul endroit décide. Une deuxième implémentation de la règle est bloquante, même si
  elle est correcte aujourd'hui.
- Vérifier les réponses d'API, pas seulement les écrans : un champ `phone` dans un JSON est
  une fuite même si aucune vue ne l'affiche.

## Aller et retour

- Toute requête et toute écriture portent le `leg`. Une absence de `leg` est bloquante.
- Une action à l'aller ne modifie rien au retour, sauf case « aller et retour » cochée
  explicitement.

## i18n

- Aucune chaîne visible en dur. FR et EN livrées dans la même PR.
- Les pluriels et les nombres passent par le mécanisme d'i18n, pas par une concaténation.

## Mobile

- 360 px sans débordement horizontal.
- Les places libres sont des cibles tactiles d'au moins 44 px.
- Le parcours « rejoindre une voiture » reste à un seul tap quand l'appareil a exactement une
  personne « sans voiture » sur ce leg. Sinon le tap ouvre la feuille : ce n'est pas un défaut.

## Vie privée et purge

- Aucune donnée nouvelle sans nécessité : prénom et téléphone optionnel suffisent à la V1.
- Chaque table a une clé étrangère vers l'Event en `ON DELETE CASCADE`, sinon elle échappe
  à la purge.
- Les autres clés étrangères suivent le tableau d'`architecture.md` : `stop.ride_id` et
  `placement.person_id` en `CASCADE`, `placement.ride_id` et `placement.stop_id` en
  `SET NULL`. Un écart est bloquant : une cascade sur `placement.ride_id` effacerait les
  Placements au lieu de renvoyer les passagers « sans voiture ». Une nouvelle clé absente
  du tableau est bloquante tant que la PR ne l'y ajoute pas.
- La purge est testée : une donnée créée pour un événement passé disparaît 30 jours après
  son dernier leg, avec et sans retour.
- Aucun tracking, aucune requête vers un tiers, aucun script distant, aucune police web :
  la pile de polices système suffit. Vercel Web Analytics et Speed Insights restent
  désactivés.
- La route de purge refuse tout appel sans le bon `CRON_SECRET`.

## Postgres

- Les migrations ont une descente, et elle est testée.
- Une migration reste compatible avec le code déjà déployé (expansion puis contraction) :
  renommer ou supprimer d'un coup une colonne que ce code lit encore est bloquant.
- L'URL de la base vient de `DATABASE_URL` ou `DATABASE_URL_UNPOOLED`, jamais écrite en dur.
- Occuper une place verrouille la ligne du Ride (`SELECT … FOR UPDATE`) dans la transaction,
  avant de compter les places restantes. Une insertion conditionnelle sans ce verrou est
  bloquante : deux taps simultanés sur la dernière place surchargeraient la voiture.
- Aucune transaction longue autour d'une purge ou d'un import.
- Les requêtes passent par Kysely avec des paramètres liés : aucune concaténation de SQL.

## États vides

Chaque écran touché garde un état vide pensé : événement sans voiture, voiture complète,
personne sans voiture alors qu'il reste des places.
