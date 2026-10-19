import { expect, test } from "./fixtures";
import { htmlByLegSection } from "./organiser";

/* The helpers of `organiser.ts` that a mistake would turn into a test that always passes. */

test.describe("htmlByLegSection", () => {
  test("cuts each leg's section out of the rest of the page", async ({ page }) => {
    await page.setContent(
      '<p>before</p><section aria-labelledby="organiser-leg-aller">A</section><section aria-labelledby="organiser-leg-retour">R</section>',
    );
    const { sections, rest } = await htmlByLegSection(page);
    expect(Object.keys(sections)).toEqual(["aller", "retour"]);
    expect(sections.aller).toContain(">A</section>");
    expect(rest).toContain("before");
    expect(rest).not.toContain("organiser-leg-");
  });

  // A second section of the same leg, hidden, would replace the first in `sections` while both
  // leave `rest`: a number in either would be checked against the wrong one, or not at all.
  test("throws on two sections of the same leg", async ({ page }) => {
    await page.setContent(
      '<section aria-labelledby="organiser-leg-aller">A</section><section hidden aria-labelledby="organiser-leg-aller">B</section>',
    );
    await expect(htmlByLegSection(page)).rejects.toThrow("two sections for the leg aller");
  });
});
