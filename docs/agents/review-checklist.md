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
- À partir de #154, le jeton d'admin n'entre que dans le corps de `loadOrganiserPanel`, et,
  à partir de #263, dans celui d'`updateEvent`. Pour un jeton d'admin faux, absent ou mal
  formé, la réponse ne contient que `{ state: "invalid" }` pour `loadOrganiserPanel`, et que
  `{ ok: false, error: "invalid" }` pour `updateEvent`, qui n'écrit alors rien. La réponse
  du panneau n'est ni stockée dans le navigateur, ni journalisée (O6.4).
- À partir de #66, le jeton personnel est tiré **par le navigateur** avec
  `crypto.getRandomValues` (128 bits, 22 caractères base64url), et rangé sur l'appareil
  avant l'envoi. Un jeton personnel tiré
  par le serveur, ou par un autre générateur, est bloquant.
- Le serveur refuse tout jeton personnel qui n'a pas exactement cette forme (trop court,
  trop long, hors alphabet, absent, autre chose qu'une chaîne).
- À partir de #66, seul `src/app/e/[id]/device-token.ts` touche au jeton personnel dans le
  navigateur.
- `Referrer-Policy: no-referrer` présent sur toutes les pages.

## Visibilité du téléphone

- La règle (même voiture pour le même leg, conducteur compris, ou personne de l'appareil ;
  pour l'organisateur, à partir de #154, le numéro d'une personne sans voiture sur un leg,
  dans la liste de ce leg de la réponse de l'espace organisateur, et nulle part ailleurs)
  est appliquée **côté serveur**. Masquer dans la vue ne compte pas : la donnée ne doit pas
  quitter le serveur.
- Un seul endroit décide : à partir de #66, `src/domain/phone-visibility.ts`. Une deuxième
  implémentation de la règle est bloquante, même si elle est correcte aujourd'hui.
- Le numéro est posé voiture par voiture, et dans la section des personnes de l'appareil
  et, pour l'organisateur, dans la liste « Sans voiture » du leg, jamais sur la personne :
  un numéro qui suit la personne d'un leg à l'autre est une fuite.
- Une seule requête lit la colonne `phone` : à partir de #66, `src/db/event-rows.ts`. Une
  autre lecture de `phone` est bloquante. Lire la ligne entière d'une personne compte comme
  lire `phone`, même si le mot n'apparaît pas : `selectAll()` sur `person`, `returningAll()`
  après `insertInto("person")` ou une mise à jour de `person`, une fonction JSON qui prend
  toute la ligne (`to_json(person)`, `row_to_json`, `jsonObjectFrom` sur `selectAll()`).
- `event-rows.ts` renvoie les téléphones à part (`phonesById`), et seuls
  `withVisiblePhones` et `withOrganiserPhones` (`phone-visibility.ts`) les reçoivent. Un
  `row.phone` recopié ailleurs (dans le board, par exemple) est bloquant, comme une liste de
  colonnes contenant `phone` exportée par `event-rows.ts` : la porte de merge ne voit ni
  l'un ni l'autre.
- La réponse de l'espace organisateur ne porte aucun numéro de conducteur, de passager
  placé ni de personne pas concernée. Du numéro de son conducteur, une voiture ne dit que
  s'il existe. Pour un jeton d'admin faux, absent ou mal formé, elle ne porte ni numéro ni
  donnée du panneau : `withOrganiserPhones` ne rend rien. Un booléen « vérifié » passé à la
  règle au lieu du jeton est bloquant : la règle vérifie elle-même.
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
- Les autres clés étrangères suivent le tableau d'`architecture.md` : `stop.ride_id`,
  `placement (person_id, event_id)` et `ride (driver_id, event_id)` en `CASCADE`,
  `placement (ride_id, event_id, leg)` en `SET NULL (ride_id)`, `placement.stop_id` en
  `SET NULL`. Un écart est bloquant : une cascade sur la clé `placement → ride` effacerait
  les Placements au lieu de renvoyer les passagers « sans voiture », et une clé
  `placement → ride` sans `event_id` ni `leg` laisserait un Placement pointer vers le Ride
  d'un autre événement ou d'un autre leg. Une nouvelle clé absente du tableau est bloquante
  tant que la PR ne l'y ajoute pas.
- La purge est testée : une donnée créée pour un événement passé disparaît 30 jours après
  son dernier leg, avec et sans retour.
- Aucune requête du navigateur vers un tiers, aucun script distant, aucune police web : la
  pile de polices système suffit. Speed Insights reste désactivé.
- À partir de #346, Vercel Web Analytics n'est monté qu'en production
  (`NEXT_PUBLIC_VERCEL_ENV`), avec `analyticsBeforeSend`. Une page vue qui part avec un
  identifiant d'événement, une query ou un fragment, un `beforeSend` retiré, un `mode`
  forcé ou un événement personnalisé (`track`) sont bloquants.
- La route de purge refuse tout appel sans le bon `CRON_SECRET`.

## Sentry (à partir de #234)

- Sans `NEXT_PUBLIC_SENTRY_DSN`, rien ne charge le SDK : `@sentry/nextjs` n'est importé
  qu'avec `import()`, après la vérification du DSN, et `withSentryConfig` ne s'applique pas.
  Ailleurs que dans un test, un `import` de `@sentry/…` qui n'est pas un `import type` est
  bloquant.
- Les options viennent de `sentryOptions` (`src/observability/options.ts`) : `dataCollection`
  entièrement coupé, `tracePropagationTargets: []`, `traceLifecycle: "stream"`. Une option
  qui rouvre une collecte, une option `replays*`, une intégration hors des listes exactes
  (`SERVER_INTEGRATIONS`, `BROWSER_INTEGRATIONS`) ou des sessions sont bloquantes.
- Les hooks restent ceux de `scrub.ts` (`beforeSend`, `beforeSendSpan`, `beforeBreadcrumb`),
  plus `createDsc` et `beforeEnvelope`, posés par `registerHooks`. Un hook retiré, ou une
  donnée de personne passée au SDK à la main (`setUser`, `setTag`, `setExtra`, `setContext`,
  `captureMessage`), est bloquant.
- Dans le navigateur, une erreur qui peut partir a un `name` qui finit par `Error` :
  `@sentry/browser` ne retire la première ligne de sa pile que si elle contient `Error: `,
  sinon il la lit comme une frame, et son message avec (#239). Sur le serveur, `@sentry/core`
  saute toujours la première ligne. Des deux côtés, toute autre ligne du message qui a l'air
  d'une frame en devient une : `codeFramesOnly` (`src/observability/options.ts`), posé par
  `startServerSentry` et `startBrowserSentry`, ne garde de toute erreur que les frames de code
  (#361), et sur le serveur `databaseErrors` ne garde du `DatabaseError` de pg que son code.
- Le navigateur ne parle qu'à notre origine (`tunnelRoute: "/monitoring"`). Aucun DSN ni
  jeton Sentry écrit en dur ; `SENTRY_AUTH_TOKEN` n'est lu qu'au build, et sans lui aucune
  source map n'est produite.

## Postgres

- Les migrations ont une descente, et elle est testée.
- Une migration reste compatible avec le code déjà déployé (expansion puis contraction) :
  renommer ou supprimer d'un coup une colonne que ce code lit encore est bloquant.
- L'URL de la base vient de `DATABASE_URL` ou `DATABASE_URL_UNPOOLED`, jamais écrite en dur.
- Occuper une place verrouille la ligne du Ride (`SELECT … FOR UPDATE`) dans la transaction,
  avant de compter les places restantes. Une insertion conditionnelle sans ce verrou est
  bloquante : deux taps simultanés sur la dernière place surchargeraient la voiture.
- À partir de #260, l'ordre des verrous est Event, puis Ride, puis Person. Une écriture sur
  un leg qui ne commence pas sa transaction par `lockEvent(trx, id, "share")` (directement
  ou par `lockLegs`) est bloquante : une suppression du retour simultanée laisserait une
  ligne du retour sous un `retour_at` à `null`. Une modification de l'événement prend
  `lockEvent(trx, id, "noKeyUpdate")` ; un Ride ou une Person verrouillé avant l'Event est
  bloquant.
- Une écriture sur un retour que l'événement n'a plus répond `noRetour` avec l'état, avant
  tout autre refus de la transaction (`rideGone` et `forbidden` compris) ; seuls une
  requête mal formée (`invalid`) et les erreurs de champs passent avant. Une suppression du
  retour qui ne recompte pas ses lignes sous le verrou de l'Event, ou qui supprime les
  Rides du retour sans ses Placements, est bloquante.
- La transaction qui supprime le retour est en `READ COMMITTED`. En `REPEATABLE READ`, le
  recomptage manque une écriture validée pendant l'attente du verrou, la suppression passe,
  et la ligne de cette écriture reste cachée sous un `retour_at` à `null` : bloquant.
- Aucune transaction longue autour d'une purge ou d'un import.
- Les requêtes passent par Kysely avec des paramètres liés : aucune concaténation de SQL.
- `sql` n'est ni passé en argument, ni rangé dans un objet, ni importé par un chemin
  calculé : la règle `sql.raw` ne le suit pas sous un autre nom.
- Kysely n'est pas réexporté par un module local (`export * from "kysely"`,
  `export { sql } from "kysely"`), et aucun espace de noms Kysely n'est obtenu par
  affectation après coup ou par `.then` sur `import("kysely")` : le lint ne suit pas ces
  chemins.
- `sql` n'est pas tiré de `import("kysely")` autrement que sous son nom : ni renommé avec
  une valeur par défaut (`const { sql: q = … } = await import("kysely")`), ni déstructuré
  jusqu'à `raw` (`const { sql: { raw } } = await import("kysely")`, puis `raw(input)`), ni
  renommé par affectation (`({ sql: q } = await import("kysely"))`). Le lint refuse la
  déclaration `const { sql: q } = await import("kysely")`, mais laisse passer ces trois-là.

## Emplacement du code et exécution

- Le code est à sa place (tableau « Emplacement du code » d'`architecture.md`) : une
  fonction d'accès aux données (`src/db/<entité>.ts`) qui crée ou prend sa connexion au
  lieu de recevoir `db` est bloquante, un test ne pourrait pas lui passer sa transaction.
- Une server action reste mince et renvoie des données simples et des clés d'erreur. Un
  `redirect()` vers une URL qui contient un jeton est bloquant.
- Un `loading.tsx` sur une route qui peut répondre 404 est bloquant : le statut part en 200.
- Une heure d'événement relue en `Date` dans le fuseau du serveur ou du navigateur, ou mise
  en forme dans un autre fuseau qu'UTC, est bloquante : elle changerait selon la machine.
  Une `Date` construite en UTC par `wallClockAsUtc` pour la mise en forme par next-intl
  (`timeZone: "UTC"`) est le chemin prévu.

## Tests

- Vitest n'écrit que dans `fullcar_test`, où chaque test qui écrit s'isole avec
  `withRollback` (ou, à partir de #66, `withCommittedEvent` pour un test de concurrence),
  et dans `fullcar_migrations_test`, réservée au test d'aller-retour des migrations.
- Un test sous `withRollback` ne lit que les lignes de son propre événement, ou compare
  deux comptages faits dans sa transaction. Une lecture sans filtre (`selectFrom("event")`
  sans `where`, ou une liste comparée en entier) est bloquante : à partir de #66, les
  lignes validées d'un test de concurrence y apparaîtraient au hasard, et
  `REPEATABLE READ` ne cache pas celles validées avant la première requête.
- À partir de #66, un test de concurrence s'exécute sur des données validées, sous un
  événement qui n'appartient qu'à lui et qui est supprimé à la fin (`withCommittedEvent`).
  Un verrou « prouvé » par la présence de `FOR UPDATE` dans le SQL, ou par un test sous
  `withRollback`, est bloquant : il ne montre aucune écriture simultanée.
- Un test de bout en bout amorce ses données par une fixture, directement en base, et
  possède son événement. Une route HTTP réservée aux tests est bloquante.
- À partir de #365, aucune vérification de bout en bout n'affiche un jeton, un lien
  administrateur ou un numéro en échouant, ni par ce qu'elle compare, ni par le message
  qu'elle passe à `expect`. Un tableau rempli depuis le réseau (`Request`, corps, en-têtes,
  ou textes filtrés sur un jeton) qui peut porter un jeton, un lien administrateur ou un
  numéro ne s'affirme que par son nombre (`.length`), jamais par `toHaveLength` ni
  `toEqual`. Une chaîne qui peut contenir un jeton, un lien administrateur ou un numéro ne
  s'affirme que par un booléen. Un texte dont chaque jeton a d'abord été remplacé
  (`hideToken`, `hide`) et qui ne porte aucun numéro n'est plus concerné. Seule exception
  pour un numéro semé : celui qu'on attend à l'écran (`toHaveText`, `href="tel:…"`) ou
  qu'on relit dans la base peut paraître dans un échec.

## États vides

Chaque écran touché garde un état vide pensé : événement sans voiture, voiture complète,
personne sans voiture alors qu'il reste des places.
