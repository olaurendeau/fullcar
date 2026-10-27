import { describe, expect, it } from "vitest";
import type { DeviceState } from "./board";
import { phoneAsk } from "./phone-ask";
import type { PhonePerson, VisibleCar, VisibleDevicePerson } from "./phone-visibility";

// event-board v4.8, rule 1: a car's card asks the device for a number when none of its persons in
// that car has one. The numbers are fakes: only whether one is there counts.

const person = (firstName: string, phone: string | null = null): PhonePerson => ({ id: firstName.toLowerCase(), firstName, phone });

function car(driver: PhonePerson, passengers: PhonePerson[] = []): Pick<VisibleCar, "id" | "driver" | "passengers"> {
  return { id: `car-of-${driver.id}`, driver, passengers };
}

function own(member: PhonePerson, state: DeviceState): VisibleDevicePerson {
  return { ...member, state };
}

const marc = person("Marc", "06 00 00 00 01");
const inLeg = (passenger: PhonePerson, of = marc) => own(passenger, { kind: "passenger", rideId: `car-of-${of.id}`, driver: of });

describe("phoneAsk: what a car's card asks the device (v4.8 rule 1)", () => {
  it("asks a passenger of the device without a number, in the words that name who drives (T1.1)", () => {
    const lea = person("Léa");
    expect(phoneAsk(car(marc, [lea]), [inLeg(lea)])).toEqual({ kind: "passenger", personId: "léa", firstName: "Léa", driver: "Marc" });
  });

  it("asks once, for the first passenger of the device in the card's order (T1.4)", () => {
    const [lea, tom] = [person("Léa"), person("Tom")];
    // The device's own order puts Tom first: the card's order decides.
    expect(phoneAsk(car(marc, [lea, tom]), [inLeg(tom), inLeg(lea)])).toMatchObject({ personId: "léa", firstName: "Léa" });
  });

  it("asks nothing when one person of the device in the car has a number (T1.4)", () => {
    const [lea, tom] = [person("Léa"), person("Tom", "07 00 00 00 02")];
    expect(phoneAsk(car(marc, [lea, tom]), [inLeg(lea), inLeg(tom)])).toBeNull();
  });

  it("asks nothing of a car where the device has nobody, whoever there has no number (T1.5, T1.10)", () => {
    const [sophie, lea] = [person("Sophie"), person("Léa")];
    expect(phoneAsk(car(person("Karim"), [sophie]), [own(lea, { kind: "withoutCar" })])).toBeNull();
    expect(phoneAsk(car(person("Karim"), [sophie]), [])).toBeNull();
  });

  it("asks nothing for another device's person without a number, beside one of the device with a number (T1.10)", () => {
    const [lea, sophie] = [person("Léa", "06 00 00 00 03"), person("Sophie")];
    expect(phoneAsk(car(marc, [lea, sophie]), [inLeg(lea)])).toBeNull();
  });

  it("asks the device's driver without a number, in the words for the people on board, before her passengers (T1.6)", () => {
    const [claire, lea] = [person("Claire"), person("Léa")];
    const driving = own(claire, { kind: "driver", rideId: "car-of-claire" });
    expect(phoneAsk(car(claire, [lea]), [inLeg(lea, claire), driving])).toEqual({ kind: "driver", personId: "claire", firstName: "Claire" });
  });

  it("asks nothing of the device's driver who has a number, though her passenger of the device has none", () => {
    const [claire, lea] = [person("Claire", "06 00 00 00 04"), person("Léa")];
    const driving = own(claire, { kind: "driver", rideId: "car-of-claire" });
    expect(phoneAsk(car(claire, [lea]), [driving, inLeg(lea, claire)])).toBeNull();
  });
});
