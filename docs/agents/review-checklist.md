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
- Le jeton d'admin n'entre que dans le corps de sept server actions : `loadOrganiserPanel`
  (à partir de #154), `updateEvent` (#263), `removePersonAsOrganiser` (#672), `resendEmail`
  (#901), `fixEmail` (#602), `signOut` (#895) et `deleteAccount` (#905). Une huitième, ou un
  jeton d'admin reçu par une autre action, est bloquant. Les cinq premières le reçoivent avec la session,
  `{ adminToken, session }` (à partir de #596) ; `signOut` et `deleteAccount` reçoivent la
  session et **tous** les jetons d'admin que le navigateur garde (`MAX_ADMIN_TOKENS` à la
  fois, le reste est ignoré), pour les révoquer : elles ne décident aucun accès, et ne
  répondent jamais de jeton. `removeAsOrganiser` n'est pas un point d'entrée : c'est le cas
  d'usage derrière `removePersonAsOrganiser`, comme `editEvent` derrière `updateEvent`. Les
  listes de ces sept actions dans les commentaires de `src/app/e/[id]/admin/admin-token-store.ts`
  et de `src/app/e/[id]/admin/actions.ts` disent les mêmes sept. Seul
  `src/domain/organiser-access.ts` décide qui
  administre (épique #581). La règle n'ouvre le panneau qu'à la session du compte de
  l'événement ou au jeton d'admin du navigateur qui l'a créé, et jamais sur un événement
  orphelin (`orphan`) ni anonymisé, quel que soit le jeton : sur un événement anonymisé, la
  session du compte lit `ended`, une autre session `notYours`, personne `signIn`. Ce que
  chaque action répond quand l'accès est refusé, et n'écrit rien alors :
  - `loadOrganiserPanel` : hors du panneau, ne contient que l'état que la règle décide
    (`orphan`, `ended`, `pending`, `notYours`, `signIn`) et aucune donnée du panneau, sauf
    deux : `notYours` n'ajoute que l'adresse de la session du visiteur, et, depuis #868,
    `ended` répond à la session du compte de l'événement ce qu'il en reste (titre, lieu,
    dates) et le jour 30 (`erasedOn`), jamais à une autre session ni à un jeton seul. Elle
    ne répond `{ state: "invalid" }` qu'à un identifiant inconnu ou mal formé.
  - `updateEvent` : `{ ok: false, error: "eventNotFound" }` à un identifiant d'événement
    inconnu ou mal formé, puis, à partir de #772, `{ ok: false, error: "eventEnded" }` à un
    événement anonymisé, quels que soient le jeton et la session : l'anonymisation a effacé
    le hash du jeton (« La purge » dans `architecture.md`) ; puis
    `{ ok: false, error: "invalid" }` quand la règle n'ouvre rien.
  - `removePersonAsOrganiser` : `{ ok: false, error: "invalid" }` à un identifiant de
    personne mal formé, avant tout contrôle de l'accès (RP3.4) ; puis
    `{ ok: false, error: "eventNotFound" }` à un identifiant
    d'événement inconnu ou mal formé, puis `{ ok: false, error: "noOrganiserAccess" }` quand
    la règle n'ouvre rien, y compris sur un événement anonymisé.
  - `resendEmail` : `{ ok: false, error: "eventNotFound" }`, puis `"eventEnded"` à un
    événement anonymisé, puis `"invalid"` quand la règle n'ouvre rien ; ensuite seulement
    `"notPending"` (rien n'attend de confirmation) et `"tooMany"` (une limite d'envoi), qui
    supposent l'accès accordé.
  - `fixEmail` : les mêmes trois refus, dans le même ordre (`"eventNotFound"`, `"eventEnded"`,
    `"invalid"`) ; ensuite seulement `"address"` (ce qui est saisi n'est pas une adresse : la
    réponse porte le code de l'erreur, jamais l'adresse), `"notPending"` et `"tooMany"`, qui
    supposent l'accès accordé. Aucun lien n'est supprimé, aucun envoi n'est inscrit tant que
    l'accès est refusé.
  - `deleteAccount` : `{ deleted: false }` pour une session inconnue, mal formée, expirée ou
    fermée entre-temps ; les jetons d'admin reçus ne sont alors pas révoqués.
  - `signOut` : ne refuse rien, répond toujours `{ signedOut: true }`, quelle que soit la
    session, et révoque les jetons reçus.

  À partir de #843, `updateEvent` décide l'accès une seconde fois sous
  `lockEvent(trx, id, "noKeyUpdate")`, avant toute écriture, comme `resendEmail` et `fixEmail` ;
  `removePersonAsOrganiser` le fait sous le verrou de l'Event aussi (partagé, puis
  `noKeyUpdate` à la reprise) : une session fermée, un compte supprimé ou un jeton révoqué
  pendant l'attente du verrou y est vu. Une écriture de l'organisateur qui ne décide l'accès
  qu'avant le verrou est bloquante. La réponse du panneau n'est ni stockée dans le navigateur,
  ni journalisée (O6.4).
- À partir de #855, il n'y a plus de lien d'organisateur. Seul
  `src/app/e/[id]/admin/admin-token-store.ts` touche au jeton d'admin dans le navigateur :
  celui qui a créé l'événement le garde dans `localStorage` sous `fullcar:admin-token:{id}`
  et nulle part ailleurs (sans `localStorage`, dans la mémoire de la page). Il n'est jamais
  lu dans l'URL, et un fragment sur `/e/{id}/admin` est ignoré (OA7.5). Un jeton d'admin lu
  dans l'URL, fragment compris, ou rangé sous une autre clé, est bloquant. Ce point ne vaut
  que pour le jeton d'admin : les liens de connexion et de confirmation
  (`src/email/messages.ts`) portent toujours leur jeton dans le fragment.
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
  Un test de présence de `phone` sous le verrou est permis (`phone IS NOT NULL`, un
  booléen, jamais la valeur) ; lire sa valeur hors de la requête unique reste bloquant.
- Un Ride créé a un conducteur avec un numéro ; vider le numéro de qui conduit est refusé,
  sous le verrou de sa Person.
- `event-rows.ts` renvoie les téléphones à part (`phonesById`), et seuls
  `withVisiblePhones` et `withOrganiserPhones` (`phone-visibility.ts`) les reçoivent. Un
  `row.phone` recopié ailleurs (dans le board, par exemple) est bloquant, comme une liste de
  colonnes contenant `phone` exportée par `event-rows.ts` : la porte de merge ne voit ni
  l'un ni l'autre.
- La réponse de l'espace organisateur ne porte aucun numéro de conducteur, de passager
  placé ni de personne pas concernée. Du numéro de son conducteur, une voiture ne dit que
  s'il existe. Quand `organiser-access.ts` n'accorde pas l'accès, elle ne porte ni numéro
  ni donnée du panneau : `withOrganiserPhones` ne rend rien. Un booléen « vérifié » passé à la
  règle est bloquant. Jusqu'à #596, elle reçoit le jeton et le vérifie elle-même ; à partir
  de #596, elle ne reçoit qu'une autorisation, d'un type que seul
  `src/domain/organiser-access.ts` produit, et une autorisation fabriquée ailleurs est
  bloquante.
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

- Aucune donnée nouvelle sans nécessité : prénom et téléphone optionnel suffisent à un
  participant. À partir de #581, l'organisateur donne une adresse e-mail, et rien d'autre ;
  un champ e-mail sur une page de participant (`/e/{id}`, ses feuilles, `/e/{id}/moi`) est
  bloquant (OA1.1).
- Chaque table qui tient à un événement a une clé étrangère vers l'Event en
  `ON DELETE CASCADE`, sinon elle échappe à la suppression. Amendement de #581 : une table
  qui ne tient à aucun événement (`account`, `session`, `email_send`) n'a pas cette clé, et
  la tâche quotidienne la nettoie par âge. Une nouvelle table sans clé vers l'Event et sans
  nettoyage dans la même PR est bloquante : elle garderait ses lignes pour toujours. Une
  ligne nettoyée avant qu'une règle ait fini de la lire (un lien expiré qui doit encore dire
  « Ce lien a expiré ») est bloquante aussi.
- Les autres clés étrangères suivent le tableau d'`architecture.md` : `stop (ride_id, event_id, leg)`
  (`stop_ride_fk`, composite), `stop.event_id` (`stop_event_fk`),
  `placement (person_id, event_id)` et `ride (driver_id, event_id)` en `CASCADE`,
  `placement (ride_id, event_id, leg)` en `SET NULL (ride_id)`, `placement.stop_id` en
  `SET NULL`. Un écart est bloquant : une cascade sur la clé `placement → ride` effacerait
  les Placements au lieu de renvoyer les passagers « sans voiture », et une clé
  `placement → ride` sans `event_id` ni `leg` laisserait un Placement pointer vers le Ride
  d'un autre événement ou d'un autre leg. Une nouvelle clé absente du tableau est bloquante
  tant que la PR ne l'y ajoute pas.
- La purge est testée : une donnée créée pour un événement passé disparaît 30 jours après
  son dernier leg, avec et sans retour. À partir de #588, au jour 30 à l'heure de Paris, un
  événement avec compte est anonymisé (un prénom et un numéro amorcés ne sont plus dans
  aucune table, OA8.1) et un événement sans compte est supprimé en entier (OA2.7). Le jour
  29 n'est pas touché, une deuxième exécution ne change rien, et chaque événement est traité
  dans sa propre transaction, sous `lockEvent(trx, id, "noKeyUpdate")` (OA8.2). Une écriture
  acceptée sur un événement anonymisé est bloquante.
- Une nouvelle table de données de participants que l'anonymisation ne vide pas est
  bloquante : elle garderait des prénoms ou des numéros après le jour 30.
- « Aujourd'hui », « passé » et le jour 30 ne se calculent que par `src/domain/day-thirty.ts`,
  à l'heure de Paris. Un deuxième calcul, ou un « maintenant » lu dans le fuseau du serveur
  ou du navigateur pour le comparer à une heure d'événement, est bloquant.
- À partir de #610, supprimer un compte efface son adresse de toutes les tables, y compris
  l'adresse en attente d'un événement créé ailleurs avec elle (OA9.5, décision 4 du
  coordinateur sur #581), ferme toutes ses sessions et révoque les jetons d'admin de ses
  événements. Une adresse qui reste quelque part est bloquante.
- À partir de #616, un compte inactif n'est supprimé qu'après l'envoi effectif de son
  avertissement (`warned_at`). L'inactivité se mesure à la dernière visite, jamais à
  l'ouverture de la session (OA9.7).
- Aucune adresse e-mail ni aucun jeton dans un journal ou un événement Sentry (OA11.1), et
  le journal de la purge ne porte que des nombres.
- Les e-mails ne portent aucun texte saisi par quelqu'un (ni titre, ni lieu, ni prénom),
  aucune image, et la requête à Brevo ne demande aucun suivi (OA3.3). Un cinquième e-mail est
  bloquant.
- Aucune requête du navigateur vers un tiers, aucun script distant, aucune police web : la
  pile de polices système suffit. Speed Insights reste désactivé.
- À partir de #346, Vercel Web Analytics n'est monté qu'en production
  (`NEXT_PUBLIC_VERCEL_ENV`), avec `analyticsBeforeSend`. Une page vue qui part avec un
  identifiant d'événement, une query ou un fragment, un `beforeSend` retiré, un `mode`
  forcé ou un événement personnalisé (`track`) sont bloquants.
- La route de purge refuse tout appel sans le bon `CRON_SECRET`, comparé à temps constant,
  et refuse tout appel quand `CRON_SECRET` n'est pas configuré.

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
  saute toujours la première ligne. Des deux côtés, le parseur du SDK fait une frame de toute
  autre ligne du message qui a l'air d'en être une. Trois règles traitent ces lignes et ces
  frames. Retirer ou contourner l'une d'elles est bloquant :
  - dans le navigateur, `startBrowserSentry` passe `stackParser: scriptFramesOnly(…)` à
    `init` (`src/observability/client.ts`). Quand la pile a une frame de script, dont le
    fichier est une URL sans espace, ce parseur ne garde que ces frames-là et celles dont le
    fichier est `<anonymous>` ou `[native code]`. Pour une ligne du message sans URL,
    `allowUrls: [/\/_next\//]` regarde alors la vraie frame du haut (#379). Une ligne avec
    une URL, comme `    at Marc (https://…/_next/a.js:1:2)`, passe ce parseur : seul
    `messagesWithoutFrames`, ci-dessous, en retire la frame ;
  - `codeFramesOnly` (`src/observability/options.ts`), posé par `registerServerHooks`
    (`src/observability/server.ts`) et par `startBrowserSentry`, ne garde de chaque erreur
    et de ses causes que deux sortes de frames (#361, #395). Les frames de code ont une
    ligne dans un fichier du build ou de Node (`inCode`). Les frames du runtime n'ont pas de
    ligne, leur fichier est `<anonymous>` ou `[native code]`, et leur nom n'est fait que de
    noms d'objets intégrés à ECMAScript et de leurs membres. Ces objets viennent d'une liste
    fixe, et leurs membres sont lus une fois, au chargement (`inRuntime`,
    `src/observability/scrub.ts`) ;
  - `messagesWithoutFrames(parse)` (`src/observability/options.ts`) est posé avec
    `client.on("preprocessEvent", …)` par `registerServerHooks` (`src/observability/server.ts`)
    et par `startBrowserSentry` (`src/observability/client.ts`), avec le parseur du SDK tel
    quel : `client.getOptions().stackParser` sur le serveur, `sentry.defaultStackParser` dans
    le navigateur, jamais `scriptFramesOnly(…)`. `preprocessEvent` passe avant tout
    processeur d'événement : dans le navigateur, `allowUrls` regarde donc la vraie frame du
    haut, et les fichiers des frames sont encore ceux qu'a lus le parseur (#388). Le poser
    d'un côté ou de l'autre avec `addEventProcessor` est bloquant. Les deux côtés restent
    ainsi symétriques. Le serveur n'a pas d'`allowUrls`, et seul le test d'enregistrement de
    `src/observability/options.test.ts` y garde ce point.
    Après la première ligne, `messagesWithoutFrames` retire du message de chaque erreur et de
    ses causes toute ligne que le parseur lit comme une frame (#393, #386). Le parseur de Node
    lit `at ` n'importe où dans une ligne : des lignes comme « Le format attendu » ou « Un état
    incohérent » quittent donc aussi le message. C'est un coût accepté, la vie privée avant le
    diagnostic, et pas un défaut à relever. `messagesWithoutFrames` retire aussi de la pile toute
    frame que ces lignes se lisent comme, comparée sur sa fonction, son fichier, sa ligne et
    sa colonne (`readAs`, #395, #388). Une ligne sans fichier est comparée sans fichier : le
    parseur lui donne celui d'une autre ligne. Une telle ligne retire donc toute frame de même
    fonction, de même ligne et de même colonne, quel que soit son fichier, une des nôtres
    comprise. C'est un coût accepté. Ce retrait de
    la pile ne tient que si le texte de la pile contient le message.

  Sur le serveur, `databaseErrors` ne garde du `DatabaseError` de pg que son code.
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
- Les combinaisons de cas (types d'erreur, variantes de jeton, valeurs invalides) se testent
  dans Vitest, et le bout en bout garde un seul test par branchement. À relever comme
  suggestion, pas comme bloquant. Les preuves de bout en bout du tableau « Ce qui compte
  comme fait » de `product.md` restent de bout en bout, chaque cas compris : « créer un
  événement en moins de 30 s » (8 actions pour un nouvel organisateur, 7 avec une session)
  et « rejoindre une voiture en 1 tap » (un seul clic sur la place libre ; avec deux
  personnes « sans voiture », ou sur une voiture à Arrêts, le clic ouvre la feuille). Raison : le bout en bout faisait
  87 % du temps de la CI, mesuré avant #652.
- Un test de bout en bout amorce ses données par une fixture, directement en base, et
  possède son événement. Une route HTTP réservée aux tests est bloquante.
- À partir de #365, aucune vérification de bout en bout n'affiche un jeton, un lien qui en
  porte un (de connexion ou de confirmation ; depuis #855, il n'y a plus de lien
  d'organisateur) ou un numéro en échouant, ni par ce qu'elle compare, ni par le message
  qu'elle passe à `expect`. Un tableau rempli depuis le réseau (`Request`, corps, en-têtes,
  ou textes filtrés sur un jeton) qui peut porter un jeton, un lien qui en porte un ou un
  numéro ne s'affirme que par son nombre (`.length`), jamais par `toHaveLength` ni
  `toEqual`. Une chaîne qui peut contenir un jeton, un lien qui en porte un ou un numéro ne
  s'affirme que par un booléen. Un texte dont chaque jeton a d'abord été remplacé
  (`hideToken`, `hide`) et qui ne porte aucun numéro n'est plus concerné. Seule exception
  pour un numéro semé : celui qu'on attend à l'écran (`toHaveText`, `href="tel:…"`) ou
  qu'on relit dans la base peut paraître dans un échec.

## États vides

Chaque écran touché garde un état vide pensé : événement sans voiture, voiture complète,
personne sans voiture alors qu'il reste des places.
