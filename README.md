# Fullcar

Group carpooling for an event. No account for participants, no ads, no tracking.

An organiser creates an event, shares a link, and everyone says in a single gesture that
they are driving or looking for a seat — on the way there, on the way back, or both.

## Why

Existing tools (Covievent, Covoitribu) ask for an e-mail login on every change, show a
cluttered interface, and do not handle the return trip: you have to create a second event.
The most common case — parents who drive children there but not back — is a pain to
express in them.

## Principles

- **No account for participants**: a participant never gives an e-mail address and never
  has an account; their identity is a link and a token in the browser.
- **A light account for the organiser**: an e-mail address, no password — a sign-in link by
  e-mail, then a lasting session. They find their events under "My events", on any device.
- **A single screen**, mobile first, usable at 360 px wide.
- **Outbound and return trips**, native and independent within the same event.
- **i18n from the start**: French and English.
- **No ads, no tracking.**
- **Erased at day 30**: 30 days after the last trip (Paris time), everything about the
  participants is erased; the title, place and dates stay in the organiser's history until
  the account is deleted, by the organiser or after 3 years without a visit, and an event
  without an account is deleted entirely.

The organiser account, sign-in, "My events" and the day-30 erasure are being built
(epic [#581](https://github.com/olaurendeau/fullcar/issues/581)).

## Stack

Next.js (App Router) in TypeScript, shadcn/ui, Postgres via Kysely, next-intl. Neon in
production, hosted on Vercel. Locally, **everything runs through Docker**: all you need is
Docker and `make`, nothing else to install. The details and the
reasons are in [`docs/agents/architecture.md`](docs/agents/architecture.md).

## Getting started

All you need is Docker and `make`:

```bash
make up      # dev server on http://localhost:3000, with its Postgres database
make check   # lint, typecheck, i18n keys, tests, build
make e2e     # end-to-end tests (Playwright, 360 px) against the production build
make ci      # make check, then the end-to-end tests on its build (a single build): what CI runs
make down    # stops everything and wipes the local data
make help    # the rest
```

Development follows the [ola-workflow](https://github.com/olaurendeau/ola-workflow) plugin:
the documents the agents read are in [`docs/agents/`](docs/agents/) (in French), and the
project profile in [`.claude/workflow.json`](.claude/workflow.json).

## Sentry environment variables

All optional. Without `NEXT_PUBLIC_SENTRY_DSN`, Sentry is neither loaded nor configured, and
nothing is sent. The `NEXT_PUBLIC_` variables are read at build time: redeploy after a
change.

| variable | role |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | the Sentry project DSN (organisation in the EU region); enables Sentry on the server and in the browser |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | the share of traces sent, between `0` and `1` (for example `0.1`); missing or invalid, no traces |
| `SENTRY_AUTH_TOKEN` | build only: uploads the source maps to Sentry, then removes them from the build; without it, none are produced |
| `SENTRY_ORG`, `SENTRY_PROJECT` | build only, with `SENTRY_AUTH_TOKEN`: where to upload the source maps |

The release and the environment come from Vercel (`VERCEL_GIT_COMMIT_SHA`, `VERCEL_ENV`, and
their `NEXT_PUBLIC_` versions in the browser): "Automatically expose System Environment
Variables" must stay enabled.

## Vercel Web Analytics

Vercel's audience measurement is only loaded on the production deployment
(`NEXT_PUBLIC_VERCEL_ENV` is `production`): nothing locally, in CI or on a preview. It sets
no cookie. A page view is sent reduced to its origin and its route (`/`, `/nouveau`,
`/e/[id]`, `/e/[id]/admin`): no event identifier, no query, no fragment, hence no token.
Any other page is not sent.

**For the owner to do**: in the Vercel dashboard, open **Analytics**, choose the project,
click **Enable**, then redeploy. Without this activation, the script does not exist on the
domain and nothing is sent. "Automatically expose System Environment Variables" must stay
enabled: without `NEXT_PUBLIC_VERCEL_ENV`, the component is not mounted.

## License

[MIT](LICENSE) © 2026 Olivier Laurendeau
