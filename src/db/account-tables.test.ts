import { randomUUID } from "node:crypto";
import { sql, type Insertable, type Selectable, type Transaction, type Updateable } from "kysely";
import { describe, expect, expectTypeOf, it } from "vitest";
import { emailAddress } from "@/domain/email-address";
import type { AccountTable, Database, EmailLinkTable, EmailSendTable, EventTable, SessionTable } from "./schema";
import { withRollback } from "./test-db";
import { seedEvent } from "./test-events";

type Trx = Transaction<Database>;

/** A distinct 32-byte hash per number: a token hash is a key. */
const hash = (n: number) => Buffer.alloc(32, n);

/** An address of its own: a concurrency test may commit accounts in parallel. */
const anAddress = () => `camille-${randomUUID()}@exemple.fr`;

async function addAccount(trx: Trx, fields: Partial<Insertable<AccountTable>> = {}) {
  const { id } = await trx
    .insertInto("account")
    .values({ email: anAddress(), locale: "fr", ...fields })
    .returning("id")
    .executeTakeFirstOrThrow();
  return id;
}

async function addSession(trx: Trx, accountId: string, fields: Partial<Insertable<SessionTable>> = {}) {
  await trx
    .insertInto("session")
    .values({ token_hash: hash(1), account_id: accountId, ...fields })
    .execute();
}

async function addLink(trx: Trx, fields: Insertable<EmailLinkTable>) {
  await trx.insertInto("email_link").values(fields).execute();
}

async function addSend(trx: Trx, fields: Partial<Insertable<EmailSendTable>> = {}) {
  const { id } = await trx
    .insertInto("email_send")
    .values({ kind: "login", email: anAddress(), ...fields })
    .returning("id")
    .executeTakeFirstOrThrow();
  return id;
}

/** An event confirmed by a new account: what a used confirmation link leaves. */
async function aConfirmedEvent(trx: Trx) {
  const accountId = await addAccount(trx);
  const { id } = await seedEvent(trx);
  await trx
    .updateTable("event")
    .set({ account_id: accountId, confirmed_at: new Date() })
    .where("id", "=", id)
    .execute();
  return { accountId, eventId: id };
}

async function eventRow(trx: Trx, id: string) {
  return trx.selectFrom("event").selectAll().where("id", "=", id).executeTakeFirst();
}

/** The writes are refused, and by the constraint named: not by some other one. */
async function expectRefusedBy(write: (trx: Trx) => Promise<unknown>, constraint: unknown) {
  await expect(withRollback(write)).rejects.toMatchObject({ constraint });
}

function columns(trx: Trx, table: string) {
  return sql<{ name: string; type: string; nullable: string; default: string | null }>`
    select column_name as name, data_type as type, is_nullable as nullable,
           column_default as default
    from information_schema.columns
    where table_schema = 'public' and table_name = ${table}
    order by ordinal_position`.execute(trx);
}

const TIMESTAMP = "timestamp with time zone";

// Addresses as src/domain/email-address.ts writes them, in several scripts: the database
// must accept every one, since one address is one account.
const NORMALISED = [
  " Camille.Durand@Exemple.FR ",
  "ÉLODIE@exemple.fr",
  "ÉMILE@exemple.fr",
  "STRAẞE@exemple.de",
  "İSTANBUL@örnek.com.tr",
  "ΟΔΥΣΣΕΥΣ@παράδειγμα.ελ",
  "ПРИМЕР@пример.рф",
].map((raw) => {
  const read = emailAddress(raw);
  if (!("value" in read)) throw new Error(`not an address: ${raw}`);
  return read.value;
});

// What a write that forgot the domain would store: case, spaces, a decomposed accent.
const NOT_NORMALISED = [
  ["an uppercase ASCII letter", "Camille@exemple.fr"],
  ["an uppercase accented letter", "Élodie@exemple.fr"],
  ["a decomposed accent", "élodie@exemple.fr"],
  ["a leading space", " camille@exemple.fr"],
  ["a trailing space", "camille@exemple.fr "],
];

describe("account tables", () => {
  // What the epic stores, and nothing else: no password, no IP address, no user agent,
  // and no column for a token, only the hash of one.
  it.each([
    [
      "account",
      [
        { name: "id", type: "uuid", nullable: "NO", default: "gen_random_uuid()" },
        { name: "email", type: "text", nullable: "NO", default: null },
        { name: "locale", type: "text", nullable: "NO", default: null },
        { name: "created_at", type: TIMESTAMP, nullable: "NO", default: "now()" },
        { name: "last_visit_at", type: TIMESTAMP, nullable: "NO", default: "now()" },
        { name: "warned_at", type: TIMESTAMP, nullable: "YES", default: null },
      ],
    ],
    [
      "session",
      [
        { name: "token_hash", type: "bytea", nullable: "NO", default: null },
        { name: "account_id", type: "uuid", nullable: "NO", default: null },
        { name: "created_at", type: TIMESTAMP, nullable: "NO", default: "now()" },
        { name: "last_visit_at", type: TIMESTAMP, nullable: "NO", default: "now()" },
      ],
    ],
    [
      "email_link",
      [
        { name: "token_hash", type: "bytea", nullable: "NO", default: null },
        { name: "kind", type: "text", nullable: "NO", default: null },
        { name: "account_id", type: "uuid", nullable: "YES", default: null },
        { name: "event_id", type: "text", nullable: "YES", default: null },
        { name: "created_at", type: TIMESTAMP, nullable: "NO", default: "now()" },
        { name: "used_at", type: TIMESTAMP, nullable: "YES", default: null },
        { name: "return_event_id", type: "text", nullable: "YES", default: null },
      ],
    ],
    [
      "email_send",
      [
        { name: "id", type: "uuid", nullable: "NO", default: "gen_random_uuid()" },
        { name: "kind", type: "text", nullable: "NO", default: null },
        { name: "email", type: "text", nullable: "NO", default: null },
        { name: "event_id", type: "text", nullable: "YES", default: null },
        { name: "sent_at", type: TIMESTAMP, nullable: "NO", default: "now()" },
      ],
    ],
  ])("%s has exactly its columns", async (table, expected) => {
    const { rows } = await withRollback((trx) => columns(trx, table));
    expect(rows).toEqual(expected);
  });

  it("types the kinds, the locale and the send status, and never lets an account's creation be written", () => {
    expectTypeOf<Selectable<AccountTable>["locale"]>().toEqualTypeOf<"fr" | "en">();
    expectTypeOf<Selectable<EmailLinkTable>["kind"]>().toEqualTypeOf<"login" | "confirmation">();
    expectTypeOf<Selectable<EmailSendTable>["kind"]>().toEqualTypeOf<"confirmation" | "login">();
    expectTypeOf<Selectable<EventTable>["send_status"]>().toEqualTypeOf<
      "sending" | "sent" | "failed" | "address_limit" | null
    >();
    expectTypeOf<Selectable<EventTable>["admin_token_hash"]>().toEqualTypeOf<Buffer | null>();
    // A new event always has a token: only a revocation writes null.
    expectTypeOf<Insertable<EventTable>["admin_token_hash"]>().toEqualTypeOf<Buffer>();
    expectTypeOf<Updateable<EventTable>["admin_token_hash"]>().toEqualTypeOf<Buffer | null | undefined>();
    expectTypeOf<Insertable<AccountTable>>().not.toHaveProperty("created_at");
  });

  describe("account", () => {
    it("draws its id and dates, and gives back what was written", async () => {
      const email = anAddress();
      const row = await withRollback(async (trx) => {
        const id = await addAccount(trx, { email, locale: "en" });
        return trx.selectFrom("account").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
      });
      expect(row).toMatchObject({ email, locale: "en", warned_at: null });
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(row.created_at).toBeInstanceOf(Date);
      expect(row.last_visit_at).toBeInstanceOf(Date);
    });

    it("keeps a visit seeded in the past", async () => {
      const visit = new Date("2023-10-25T08:00:00Z");
      const row = await withRollback(async (trx) => {
        const id = await addAccount(trx, { last_visit_at: visit });
        return trx.selectFrom("account").select("last_visit_at").where("id", "=", id).executeTakeFirstOrThrow();
      });
      expect(row.last_visit_at).toEqual(visit);
    });

    it("is one per address", async () => {
      await expectRefusedBy(async (trx) => {
        const email = anAddress();
        await addAccount(trx, { email });
        await addAccount(trx, { email, locale: "en" });
      }, "account_email_unique");
    });

    it("accepts every address as the domain writes it", async () => {
      const stored = await withRollback(async (trx) => {
        const ids = [];
        for (const email of NORMALISED) ids.push(await addAccount(trx, { email }));
        const rows = await trx.selectFrom("account").select(["id", "email"]).where("id", "in", ids).execute();
        return ids.map((id) => rows.find((row) => row.id === id)?.email);
      });
      expect(stored).toEqual(NORMALISED);
    });

    it.each(NOT_NORMALISED)("refuses an address with %s", async (_, email) => {
      await expectRefusedBy((trx) => addAccount(trx, { email }), "account_email_normalised");
    });

    // Counted in code points, as the domain does: a car emoji is one, though two UTF-16 units.
    it("accepts an address of 254 code points and refuses 255, or none", async () => {
      const email = await withRollback(async (trx) => {
        const id = await addAccount(trx, { email: "🚗".repeat(254) });
        return (await trx.selectFrom("account").select("email").where("id", "=", id).executeTakeFirstOrThrow()).email;
      });
      expect(email).toBe("🚗".repeat(254));
      for (const tooLong of ["🚗".repeat(255), ""]) {
        await expectRefusedBy((trx) => addAccount(trx, { email: tooLong }), "account_email_length");
      }
    });

    it("refuses a locale that is neither fr nor en", async () => {
      await expectRefusedBy(
        (trx) => sql`insert into account (email, locale) values (${anAddress()}, 'de')`.execute(trx),
        "account_locale",
      );
    });
  });

  describe("session", () => {
    it("draws its dates, and keeps a visit seeded in the past", async () => {
      const visit = new Date("2026-07-26T08:00:00Z");
      const row = await withRollback(async (trx) => {
        await addSession(trx, await addAccount(trx), { last_visit_at: visit });
        return trx.selectFrom("session").selectAll().where("token_hash", "=", hash(1)).executeTakeFirstOrThrow();
      });
      expect(row.token_hash).toEqual(hash(1));
      expect(row.created_at).toBeInstanceOf(Date);
      expect(row.last_visit_at).toEqual(visit);
    });

    it("is keyed by its token hash", async () => {
      await expectRefusedBy(async (trx) => {
        const accountId = await addAccount(trx);
        await addSession(trx, accountId);
        await addSession(trx, accountId);
      }, "session_pkey");
    });

    it.each([31, 33, 0])("refuses a token hash of %i bytes", async (size) => {
      await expectRefusedBy(
        async (trx) => addSession(trx, await addAccount(trx), { token_hash: Buffer.alloc(size, 1) }),
        "session_token_hash_length",
      );
    });

    it("belongs to an existing account", async () => {
      await expectRefusedBy((trx) => addSession(trx, randomUUID()), "session_account_fk");
    });

    it("goes with its account, and only with it", async () => {
      const left = await withRollback(async (trx) => {
        const gone = await addAccount(trx);
        const kept = await addAccount(trx);
        await addSession(trx, gone, { token_hash: hash(1) });
        await addSession(trx, gone, { token_hash: hash(2) });
        await addSession(trx, kept, { token_hash: hash(3) });
        await trx.deleteFrom("account").where("id", "=", gone).execute();
        return trx.selectFrom("session").select("account_id").where("account_id", "in", [gone, kept]).execute();
      });
      expect(left).toHaveLength(1);
    });
  });

  describe("email_link", () => {
    it("holds a sign-in link for an account and a confirmation link for an event, unused", async () => {
      const rows = await withRollback(async (trx) => {
        const accountId = await addAccount(trx);
        const { id: eventId } = await seedEvent(trx);
        await addLink(trx, { token_hash: hash(1), kind: "login", account_id: accountId });
        await addLink(trx, { token_hash: hash(2), kind: "confirmation", event_id: eventId });
        return {
          accountId,
          eventId,
          links: await trx
            .selectFrom("email_link")
            .selectAll()
            .where("token_hash", "in", [hash(1), hash(2)])
            .orderBy("kind", "desc")
            .execute(),
        };
      });
      expect(rows.links).toMatchObject([
        { kind: "login", account_id: rows.accountId, event_id: null, used_at: null, return_event_id: null },
        { kind: "confirmation", account_id: null, event_id: rows.eventId, used_at: null, return_event_id: null },
      ]);
      expect(rows.links[0]?.created_at).toBeInstanceOf(Date);
    });

    // OA4.4: the email's link is always /connexion/lien, so the page that asked for it is
    // kept with the link: /e/{id}/admin when it has an event, /mes-evenements otherwise.
    it("keeps the event a sign-in link returns to", async () => {
      const rows = await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        await addLink(trx, { token_hash: hash(1), kind: "login", account_id: await addAccount(trx), return_event_id: eventId });
        return {
          eventId,
          link: await trx.selectFrom("email_link").selectAll().where("token_hash", "=", hash(1)).executeTakeFirst(),
        };
      });
      expect(rows.link).toMatchObject({ kind: "login", event_id: null, return_event_id: rows.eventId });
    });

    it("returns to an existing event, when it has one", async () => {
      await expectRefusedBy(
        async (trx) =>
          addLink(trx, { token_hash: hash(1), kind: "login", account_id: await addAccount(trx), return_event_id: "Zz9zZz9z" }),
        "email_link_return_event_fk",
      );
    });

    // The link still signs in; it returns to /mes-evenements instead.
    it("outlives the event it returns to, without it", async () => {
      const link = await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        await addLink(trx, { token_hash: hash(1), kind: "login", account_id: await addAccount(trx), return_event_id: eventId });
        await trx.deleteFrom("event").where("id", "=", eventId).execute();
        return trx.selectFrom("email_link").selectAll().where("token_hash", "=", hash(1)).executeTakeFirst();
      });
      expect(link).toMatchObject({ kind: "login", return_event_id: null });
    });

    it("is keyed by its token hash", async () => {
      await expectRefusedBy(async (trx) => {
        const accountId = await addAccount(trx);
        await addLink(trx, { token_hash: hash(1), kind: "login", account_id: accountId });
        await addLink(trx, { token_hash: hash(1), kind: "login", account_id: accountId });
      }, "email_link_pkey");
    });

    it.each([31, 33, 0])("refuses a token hash of %i bytes", async (size) => {
      await expectRefusedBy(
        async (trx) =>
          addLink(trx, { token_hash: Buffer.alloc(size, 1), kind: "login", account_id: await addAccount(trx) }),
        "email_link_token_hash_length",
      );
    });

    it("refuses a kind that is neither login nor confirmation", async () => {
      await expectRefusedBy(
        async (trx) =>
          sql`insert into email_link (token_hash, kind, account_id)
              values (${hash(1)}, 'reset', ${await addAccount(trx)})`.execute(trx),
        "email_link_kind",
      );
    });

    // A sign-in link confirms nothing, and a confirmation link attaches only its own event.
    it.each([
      ["a sign-in link without an account", "login", { account: false, event: false, back: false }],
      ["a sign-in link with an event", "login", { account: true, event: true, back: false }],
      ["a confirmation link without an event", "confirmation", { account: false, event: false, back: false }],
      ["a confirmation link with an account", "confirmation", { account: true, event: true, back: false }],
      ["a confirmation link with an event to return to", "confirmation", { account: false, event: true, back: true }],
    ] as const)("refuses %s", async (_, kind, has) => {
      await expectRefusedBy(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        await addLink(trx, {
          token_hash: hash(1),
          kind,
          account_id: has.account ? await addAccount(trx) : null,
          event_id: has.event ? eventId : null,
          return_event_id: has.back ? eventId : null,
        });
      }, "email_link_target");
    });

    it("belongs to an existing account or event", async () => {
      await expectRefusedBy(
        (trx) => addLink(trx, { token_hash: hash(1), kind: "login", account_id: randomUUID() }),
        "email_link_account_fk",
      );
      await expectRefusedBy(
        (trx) => addLink(trx, { token_hash: hash(1), kind: "confirmation", event_id: "Zz9zZz9z" }),
        "email_link_event_fk",
      );
    });

    it("goes with its account, or with its event", async () => {
      const left = await withRollback(async (trx) => {
        const accountId = await addAccount(trx);
        const { id: eventId } = await seedEvent(trx);
        const { id: otherId } = await seedEvent(trx);
        await addLink(trx, { token_hash: hash(1), kind: "login", account_id: accountId });
        await addLink(trx, { token_hash: hash(2), kind: "confirmation", event_id: eventId });
        await addLink(trx, { token_hash: hash(3), kind: "confirmation", event_id: otherId });
        await trx.deleteFrom("account").where("id", "=", accountId).execute();
        await trx.deleteFrom("event").where("id", "=", eventId).execute();
        return trx
          .selectFrom("email_link")
          .select("token_hash")
          .where("token_hash", "in", [hash(1), hash(2), hash(3)])
          .execute();
      });
      expect(left).toEqual([{ token_hash: hash(3) }]);
    });
  });

  describe("email_send", () => {
    it("draws its id and its time, and keeps a time seeded in the past", async () => {
      const sentAt = new Date("2026-10-25T07:00:00Z");
      const rows = await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        const drawn = await addSend(trx, { kind: "confirmation", event_id: eventId });
        const seeded = await addSend(trx, { sent_at: sentAt });
        return trx.selectFrom("email_send").selectAll().where("id", "in", [drawn, seeded]).execute();
      });
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.sent_at)).toContainEqual(sentAt);
      for (const row of rows) expect(row.sent_at).toBeInstanceOf(Date);
    });

    it("refuses a kind that is neither confirmation nor login", async () => {
      await expectRefusedBy(
        (trx) => sql`insert into email_send (kind, email) values ('warning', ${anAddress()})`.execute(trx),
        "email_send_kind",
      );
    });

    it("refuses an event on the answer to a sign-in request", async () => {
      await expectRefusedBy(
        async (trx) => addSend(trx, { kind: "login", event_id: (await seedEvent(trx)).id }),
        "email_send_event_kind",
      );
    });

    it("belongs to an existing event, when it has one", async () => {
      await expectRefusedBy(
        (trx) => addSend(trx, { kind: "confirmation", event_id: "Zz9zZz9z" }),
        "email_send_event_fk",
      );
    });

    it.each(NOT_NORMALISED)("refuses an address with %s", async (_, email) => {
      await expectRefusedBy((trx) => addSend(trx, { email }), "email_send_email_normalised");
    });

    it("refuses an address of 255 code points, or none", async () => {
      for (const email of ["🚗".repeat(255), ""]) {
        await expectRefusedBy((trx) => addSend(trx, { email }), "email_send_email_length");
      }
    });

    // Its address and the global cap still count it: the event is gone, the email went out.
    it("outlives its event, without it", async () => {
      const row = await withRollback(async (trx) => {
        const { id: eventId } = await seedEvent(trx);
        const id = await addSend(trx, { kind: "confirmation", event_id: eventId });
        await trx.deleteFrom("event").where("id", "=", eventId).execute();
        return trx.selectFrom("email_send").selectAll().where("id", "=", id).executeTakeFirst();
      });
      expect(row).toMatchObject({ kind: "confirmation", event_id: null });
    });
  });

  describe("event, with an account", () => {
    it("starts with no account, unconfirmed, nothing pending, no send and not anonymised", async () => {
      const row = await withRollback(async (trx) => eventRow(trx, (await seedEvent(trx)).id));
      expect(row).toMatchObject({
        account_id: null,
        confirmed_at: null,
        pending_email: null,
        send_status: null,
        send_status_at: null,
        anonymised_at: null,
      });
    });

    it("holds a pending event, its address and the result of its email", async () => {
      const email = anAddress();
      const at = new Date("2026-10-25T08:00:00Z");
      const row = await withRollback(async (trx) => {
        const { id } = await seedEvent(trx);
        await trx
          .updateTable("event")
          .set({ pending_email: email, send_status: "address_limit", send_status_at: at })
          .where("id", "=", id)
          .execute();
        return eventRow(trx, id);
      });
      expect(row).toMatchObject({ pending_email: email, send_status: "address_limit", send_status_at: at });
    });

    it.each(["sending", "sent", "failed", "address_limit"] as const)("accepts the send status %s", async (status) => {
      const row = await withRollback(async (trx) => {
        const { id } = await seedEvent(trx);
        await trx
          .updateTable("event")
          .set({ send_status: status, send_status_at: new Date() })
          .where("id", "=", id)
          .execute();
        return eventRow(trx, id);
      });
      expect(row?.send_status).toBe(status);
    });

    it("refuses another send status", async () => {
      await expectRefusedBy(async (trx) => {
        const { id } = await seedEvent(trx);
        await sql`update event set send_status = 'queued', send_status_at = now() where id = ${id}`.execute(trx);
      }, "event_send_status");
    });

    it.each([
      ["a send status without its time", { send_status: "sent" as const }],
      ["a send time without its status", { send_status_at: new Date() }],
    ])("refuses %s", async (_, fields) => {
      await expectRefusedBy(async (trx) => {
        const { id } = await seedEvent(trx);
        await trx.updateTable("event").set(fields).where("id", "=", id).execute();
      }, "event_send_status_pair");
    });

    it.each(NOT_NORMALISED)("refuses a pending address with %s", async (_, email) => {
      await expectRefusedBy(async (trx) => {
        const { id } = await seedEvent(trx);
        await trx.updateTable("event").set({ pending_email: email }).where("id", "=", id).execute();
      }, "event_pending_email_normalised");
    });

    it("refuses a pending address of 255 code points, or none", async () => {
      for (const email of ["🚗".repeat(255), ""]) {
        await expectRefusedBy(async (trx) => {
          const { id } = await seedEvent(trx);
          await trx.updateTable("event").set({ pending_email: email }).where("id", "=", id).execute();
        }, "event_pending_email_length");
      }
    });

    it("belongs to an existing account, when it has one", async () => {
      await expectRefusedBy(async (trx) => {
        const { id } = await seedEvent(trx);
        await trx
          .updateTable("event")
          .set({ account_id: randomUUID(), confirmed_at: new Date() })
          .where("id", "=", id)
          .execute();
      }, "event_account_fk");
    });

    it("is confirmed when it has an account", async () => {
      await expectRefusedBy(async (trx) => {
        const accountId = await addAccount(trx);
        const { id } = await seedEvent(trx);
        await trx.updateTable("event").set({ account_id: accountId }).where("id", "=", id).execute();
      }, "event_account_confirmed");
    });

    it("has no pending address once confirmed", async () => {
      await expectRefusedBy(async (trx) => {
        const { eventId } = await aConfirmedEvent(trx);
        await trx.updateTable("event").set({ pending_email: anAddress() }).where("id", "=", eventId).execute();
      }, "event_confirmed_no_pending");
    });

    it("may lose its token: a revoked token is a null hash", async () => {
      const row = await withRollback(async (trx) => {
        const { id } = await seedEvent(trx);
        await trx.updateTable("event").set({ admin_token_hash: null }).where("id", "=", id).execute();
        return eventRow(trx, id);
      });
      expect(row?.admin_token_hash).toBeNull();
    });

    it("keeps no token and no position once anonymised", async () => {
      const row = await withRollback(async (trx) => {
        const { eventId } = await aConfirmedEvent(trx);
        await trx
          .updateTable("event")
          .set({ admin_token_hash: null, location_lat: null, location_lng: null, anonymised_at: new Date() })
          .where("id", "=", eventId)
          .execute();
        return eventRow(trx, eventId);
      });
      expect(row).toMatchObject({ admin_token_hash: null, location_lat: null, location_lng: null });
      expect(row?.anonymised_at).toBeInstanceOf(Date);
    });

    it.each([
      ["a token", { admin_token_hash: hash(9), location_lat: null, location_lng: null }],
      ["a position", { admin_token_hash: null, location_lat: 48.1173, location_lng: -1.67779 }],
    ])("refuses an anonymised event with %s", async (_, fields) => {
      await expectRefusedBy(async (trx) => {
        const { eventId } = await aConfirmedEvent(trx);
        await trx
          .updateTable("event")
          .set({ ...fields, anonymised_at: new Date() })
          .where("id", "=", eventId)
          .execute();
      }, "event_anonymised_bare");
    });

    // OA9.5: the event stays open to participants, with no organiser, until its day 30.
    it("outlives its account, confirmed and without it", async () => {
      const row = await withRollback(async (trx) => {
        const { accountId, eventId } = await aConfirmedEvent(trx);
        await trx.deleteFrom("account").where("id", "=", accountId).execute();
        return eventRow(trx, eventId);
      });
      expect(row).toMatchObject({ account_id: null, anonymised_at: null });
      expect(row?.confirmed_at).toBeInstanceOf(Date);
    });
  });
});
