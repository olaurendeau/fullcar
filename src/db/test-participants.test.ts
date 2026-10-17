import { describe, expect, it } from "vitest";
import { isPersonalToken } from "@/domain/personal-token";
import { tokenMatches } from "@/domain/token-hash";
import { readTokenHolders } from "./persons";
import { withRollback } from "./test-db";
import { seedEvent } from "./test-events";
import { seedPerson } from "./test-participants";

describe("seedPerson", () => {
  it("draws a personal token unless given one, and stores its hash", async () => {
    await withRollback(async (trx) => {
      const { id: eventId } = await seedEvent(trx);
      const drawn = await seedPerson(trx, eventId);
      const given = await seedPerson(trx, eventId, {}, drawn.token);
      expect(isPersonalToken(drawn.token)).toBe(true);
      expect(given.token).toBe(drawn.token);
      expect(given.id).not.toBe(drawn.id);
      const holders = await readTokenHolders(trx, eventId);
      expect(holders).toHaveLength(2);
      for (const holder of holders) {
        expect(tokenMatches(drawn.token, holder.tokenHash)).toBe(true);
      }
    });
  });
});
