import { describe, expect, it } from "vitest";
import { clearTransfer, readTransfer, writeTransfer, writeTransferResult } from "./events";
import { anAddress, seedLink } from "./test-accounts";
import { withRollback } from "./test-db";
import { confirmSeededEvent, seedEvent } from "./test-events";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const ago = (ms: number) => new Date(Date.now() - ms);

/** A confirmed event: the only kind a handover can wait on (OT5.1). */
async function aConfirmedEvent(trx: Parameters<typeof confirmSeededEvent>[0]) {
  const { id } = await seedEvent(trx);
  await confirmSeededEvent(trx, id);
  return id;
}

describe("readTransfer", () => {
  it("gives nothing for an unknown event", async () => {
    await withRollback(async (trx) => {
      expect(await readTransfer(trx, "zzzzzzzz")).toBeUndefined();
    });
  });

  it("gives an empty row for an event that is not being handed over", async () => {
    await withRollback(async (trx) => {
      const id = await aConfirmedEvent(trx);
      expect(await readTransfer(trx, id)).toEqual({ email: null, status: null, at: null, lastLinkAt: null });
    });
  });

  it("gives the address, the result kept of its email, and the date of the most recent transfer link", async () => {
    await withRollback(async (trx) => {
      const id = await aConfirmedEvent(trx);
      const email = anAddress();
      const at = ago(5 * MINUTE);
      await writeTransfer(trx, id, { email, status: "sending", at });
      await seedLink(trx, { kind: "transfer", eventId: id }, { createdAt: ago(3 * DAY) });
      const latest = ago(2 * DAY);
      await seedLink(trx, { kind: "transfer", eventId: id }, { createdAt: latest, usedAt: ago(DAY) });
      await seedLink(trx, { kind: "transfer", eventId: id }, { createdAt: ago(4 * DAY) });
      expect(await readTransfer(trx, id)).toEqual({ email, status: "sending", at, lastLinkAt: latest });
    });
  });

  it("does not read the transfer links of another event", async () => {
    await withRollback(async (trx) => {
      const id = await aConfirmedEvent(trx);
      const other = await aConfirmedEvent(trx);
      await writeTransfer(trx, id, { email: anAddress(), status: "address_limit", at: new Date() });
      await seedLink(trx, { kind: "transfer", eventId: other });
      expect((await readTransfer(trx, id))?.lastLinkAt).toBeNull();
    });
  });
});

describe("writeTransfer", () => {
  it("writes the address with the first result of its email, and replaces the one that waited", async () => {
    await withRollback(async (trx) => {
      const id = await aConfirmedEvent(trx);
      const [first, second] = [anAddress(), anAddress()];
      const at = ago(MINUTE);
      await writeTransfer(trx, id, { email: first, status: "sending", at });
      expect(await readTransfer(trx, id)).toMatchObject({ email: first, status: "sending", at });
      await writeTransfer(trx, id, { email: second, status: "address_limit", at: new Date() });
      expect(await readTransfer(trx, id)).toMatchObject({ email: second, status: "address_limit" });
    });
  });

  it("leaves the account, the confirmation and the admin token of the event as they are (OT1.5)", async () => {
    await withRollback(async (trx) => {
      const id = await aConfirmedEvent(trx);
      const before = await trx.selectFrom("event").select(["account_id", "confirmed_at", "admin_token_hash"]).where("id", "=", id).executeTakeFirst();
      await writeTransfer(trx, id, { email: anAddress(), status: "sending", at: new Date() });
      const after = await trx.selectFrom("event").select(["account_id", "confirmed_at", "admin_token_hash"]).where("id", "=", id).executeTakeFirst();
      expect(after).toEqual(before);
      expect(after?.account_id).not.toBeNull();
      expect(after?.admin_token_hash).not.toBeNull();
    });
  });

});

describe("writeTransferResult", () => {
  it("writes sent or failed over the sending it wrote", async () => {
    await withRollback(async (trx) => {
      for (const result of ["sent", "failed"] as const) {
        const id = await aConfirmedEvent(trx);
        const since = ago(MINUTE);
        await writeTransfer(trx, id, { email: anAddress(), status: "sending", at: since });
        expect(await writeTransferResult(trx, id, since, result)).toBe(true);
        const row = await readTransfer(trx, id);
        expect(row?.status).toBe(result);
        expect(row?.at?.getTime()).toBeGreaterThan(since.getTime());
      }
    });
  });

  it("leaves a status written since: a resend, a change of address, a stop by the limit", async () => {
    await withRollback(async (trx) => {
      const id = await aConfirmedEvent(trx);
      const since = ago(MINUTE);
      await writeTransfer(trx, id, { email: anAddress(), status: "sending", at: since });
      const replacedAt = ago(30_000);
      const replacement = anAddress();
      await writeTransfer(trx, id, { email: replacement, status: "sending", at: replacedAt });
      expect(await writeTransferResult(trx, id, since, "sent")).toBe(false);
      expect(await readTransfer(trx, id)).toMatchObject({ email: replacement, status: "sending", at: replacedAt });
      await writeTransfer(trx, id, { email: replacement, status: "address_limit", at: since });
      expect(await writeTransferResult(trx, id, since, "failed")).toBe(false);
      expect((await readTransfer(trx, id))?.status).toBe("address_limit");
    });
  });

  it("writes nothing once the handover is cancelled, nor over a result already written", async () => {
    await withRollback(async (trx) => {
      const id = await aConfirmedEvent(trx);
      const since = ago(MINUTE);
      await writeTransfer(trx, id, { email: anAddress(), status: "sending", at: since });
      expect(await writeTransferResult(trx, id, since, "sent")).toBe(true);
      expect(await writeTransferResult(trx, id, since, "failed")).toBe(false);
      expect((await readTransfer(trx, id))?.status).toBe("sent");
      await clearTransfer(trx, id);
      expect(await writeTransferResult(trx, id, since, "sent")).toBe(false);
      expect(await readTransfer(trx, id)).toEqual({ email: null, status: null, at: null, lastLinkAt: null });
    });
  });

  it("writes nothing for an unknown event", async () => {
    await withRollback(async (trx) => {
      expect(await writeTransferResult(trx, "zzzzzzzz", new Date(), "sent")).toBe(false);
    });
  });
});

describe("clearTransfer", () => {
  it("clears the address and its result, and says whether a handover was waiting", async () => {
    await withRollback(async (trx) => {
      const id = await aConfirmedEvent(trx);
      expect(await clearTransfer(trx, id)).toBe(false);
      await writeTransfer(trx, id, { email: anAddress(), status: "sending", at: new Date() });
      expect(await clearTransfer(trx, id)).toBe(true);
      expect(await readTransfer(trx, id)).toEqual({ email: null, status: null, at: null, lastLinkAt: null });
      expect(await clearTransfer(trx, id)).toBe(false);
    });
  });

  it("leaves the transfer links to deleteTransferLinks, and the account of the event as it was", async () => {
    await withRollback(async (trx) => {
      const id = await aConfirmedEvent(trx);
      await writeTransfer(trx, id, { email: anAddress(), status: "sending", at: new Date() });
      await seedLink(trx, { kind: "transfer", eventId: id });
      await clearTransfer(trx, id);
      const links = await trx.selectFrom("email_link").select("token_hash").where("event_id", "=", id).execute();
      expect(links).toHaveLength(1);
      expect((await trx.selectFrom("event").select("account_id").where("id", "=", id).executeTakeFirst())?.account_id).not.toBeNull();
    });
  });
});
