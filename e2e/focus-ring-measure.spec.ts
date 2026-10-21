import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { expectRing, noteUnfocused, press, rgba, walk } from "./focus-ring";

/*
 * #319, epic #236: the focus-ring measure (language-switch v3.3.1, steps 0 to 6) checked on
 * synthetic pages, without the application. The ring colour is written in oklch, as the
 * `--ring` token is: the measure reads it in sRGB.
 */

const RING = "outline: 2px solid oklch(0.556 0 0); outline-offset: 2px;";
// Tailwind writes several shadow layers, transparent when unused, focused or not.
const LAYERS = "box-shadow: 0 0 0 0 transparent, 0 1px 2px 0 rgb(0 0 0 / 0.05);";
const FOCUSED_LAYERS = "box-shadow: 0 0 0 3px transparent, 0 1px 2px 0 rgb(0 0 0 / 0.05);";
// The old ring-3 ring-ring/50: one layer more, the halo.
const HALO = "box-shadow: 0 0 0 3px oklch(0.708 0 0 / 0.5), 0 1px 2px 0 rgb(0 0 0 / 0.05);";
const SHORT = { timeout: 1_500 };

async function open(page: Page, body: string, css = "") {
  await page.setContent(
    `<style>body { margin: 0; padding: 24px; } button { ${LAYERS} } button:focus-visible { ${FOCUSED_LAYERS} }
    :focus-visible { ${RING} } ${css}</style>${body}`,
  );
}

test.describe("the focus-ring measure", () => {
  test("rgba reads a colour in sRGB, its opacity included", async ({ page }) => {
    await open(page, '<p style="color: oklch(0.556 0 0); background: rgb(235 235 235 / 0.5)">texte</p>');
    const text = page.getByText("texte");
    expect(await rgba(text, "color")).toEqual({ r: 115, g: 115, b: 115, a: 1 });
    const background = await rgba(text, "background-color");
    expect(background).toMatchObject({ r: 235, g: 235, b: 235 });
    expect(background.a).toBeCloseTo(0.5, 2);
    // Written in camelCase, or no colour at all: an error, not black.
    await expect(rgba(text, "backgroundColor")).rejects.toThrow('rgba: backgroundColor is no colour property ("")');
    await expect(rgba(text, "display")).rejects.toThrow('rgba: display is no colour property ("block")');
  });

  test("a 2 px outline on white gives 4.74", async ({ page }) => {
    await open(page, "<button>Créer</button>");
    await press(page, "Tab");
    const ring = await expectRing(page.getByRole("button"));
    expect(ring.background).toBe("rgb(255, 255, 255)");
    expect(ring.ratio.toFixed(2)).toBe("4.74");
  });

  test("the old halo fails, and so does a halo added to the outline", async ({ page }) => {
    await open(
      page,
      "<button>Ancien</button><button>Les deux</button>",
      `button:first-child:focus-visible { outline: none; ${HALO} } button:last-child:focus-visible { ${HALO} }`,
    );
    await press(page, "Tab");
    const old = expectRing(page.getByRole("button", { name: "Ancien" }), SHORT);
    await expect(old).rejects.toThrow(/outlineStyle none, not solid/);
    await expect(old).rejects.toThrow(/1 visible boxShadow layer more than unfocused/);
    await press(page, "Tab");
    const both = expectRing(page.getByRole("button", { name: "Les deux" }), SHORT);
    await expect(both).rejects.toThrow(/^(?![\s\S]*outlineStyle)[\s\S]*1 visible boxShadow layer more than unfocused/);
  });

  test("an element focused by a click, its outline on :focus only, fails", async ({ page }) => {
    await open(page, "<button>Créer</button>", `button:focus { ${RING} }`);
    await noteUnfocused(page);
    await page.getByRole("button").click();
    await expect(expectRing(page.getByRole("button"), SHORT)).rejects.toThrow(
      /ratio 4\.74:1: no keyboard focus \(:focus-visible\)$/,
    );
  });

  test("a coloured layer of no length, as ring-0 writes, is no visible layer", async ({ page }) => {
    await open(
      page,
      '<input type="checkbox" aria-label="Léa">',
      "input:focus-visible { box-shadow: 0 0 0 0 rgb(255 255 255); }",
    );
    await press(page, "Tab");
    await expectRing(page.getByRole("checkbox"), SHORT);
  });

  test("an element the key renders, then focuses, counts as no visible layer unfocused", async ({ page }) => {
    // Enter shows a line and focuses it, as « Afficher les N autres » does with the sixth.
    await open(
      page,
      `<button>Avec halo</button><button>Afficher</button><script>
        for (const button of document.querySelectorAll("button")) {
          button.addEventListener("click", () => {
            const line = Object.assign(document.createElement("span"), { tabIndex: -1 });
            line.textContent = button.textContent === "Afficher" ? "Sixième" : "Halo";
            line.className = button.textContent === "Afficher" ? "" : "halo";
            button.after(line);
            line.focus();
          });
        }
      </script>`,
      `.halo:focus-visible { ${HALO} }`,
    );
    await press(page, "Tab");
    await press(page, "Tab");
    await press(page, "Enter");
    const ring = await expectRing(page.getByText("Sixième"), SHORT);
    expect(ring.ratio.toFixed(2)).toBe("4.74");
    await press(page, "Shift+Tab");
    await press(page, "Shift+Tab");
    await expect(page.getByRole("button", { name: "Avec halo" })).toBeFocused();
    await press(page, "Enter");
    await expect(expectRing(page.getByText("Halo", { exact: true }), SHORT)).rejects.toThrow(
      /ratio 4\.74:1: 2 visible boxShadow layer more than unfocused$/,
    );
  });

  test("a parent at opacity 0.5 fails", async ({ page }) => {
    await open(page, '<div style="opacity: 0.5"><button>Placer</button></div>');
    await press(page, "Tab");
    await expect(expectRing(page.getByRole("button"), SHORT)).rejects.toThrow(/opacity 0\.5, not 1/);
  });

  test("a composed muted background gives 4.35", async ({ page }) => {
    await open(page, '<div style="background: rgb(235 235 235 / 0.5)"><div><button>Aller</button></div></div>');
    await press(page, "Tab");
    const ring = await expectRing(page.getByRole("button"));
    expect(ring.background).toBe("rgb(245, 245, 245)");
    expect(ring.ratio.toFixed(2)).toBe("4.35");
  });

  test("at -2 px, the background is read on the element itself", async ({ page }) => {
    await open(
      page,
      '<div style="background: rgb(23 23 23); padding: 8px"><button>Replier</button></div>',
      "button { background: oklch(0.97 0 0); border: 0; } button:focus-visible { outline-offset: -2px; }",
    );
    await press(page, "Tab");
    const ring = await expectRing(page.getByRole("button"), { offset: -2 });
    expect(ring.background).toBe("rgb(245, 245, 245)");
    expect(ring.ratio.toFixed(2)).toBe("4.35");
  });

  test("an endless animation does not hold the measure", async ({ page }) => {
    await open(
      page,
      '<span class="spin">⟳</span><button>Réessayer</button>',
      "@keyframes spin { to { transform: rotate(1turn); } } .spin { display: inline-block; animation: spin 1s linear infinite; }",
    );
    await press(page, "Tab");
    await expectRing(page.getByRole("button"), SHORT);
  });

  test("a finite transition is waited for: its end, not its start, is measured", async ({ page }) => {
    // The colour holds at #737373 until the transition ends, then jumps to #eeeeee.
    await open(
      page,
      "<button>Fermer</button>",
      `button { ${RING} } button:focus-visible { outline-color: #eee; transition: outline-color 1s steps(1, end); }`,
    );
    await press(page, "Tab");
    await expect(expectRing(page.getByRole("button"), { timeout: 3_000 })).rejects.toThrow(
      /outlineColor rgba\(238, 238, 238, 1\), not rgba\(115, 115, 115, 1\)/,
    );
  });

  test("a transition cancelled while it is waited for does not throw", async ({ page }) => {
    await open(
      page,
      `<button>Valider</button><script>
        const button = document.querySelector("button");
        button.addEventListener("focus", () => setTimeout(() => button.getAnimations().forEach((a) => a.cancel()), 200));
      </script>`,
      "button { background: white; transition: background-color 2s; } button:focus-visible { background: #eee; }",
    );
    await press(page, "Tab");
    await expectRing(page.getByRole("button"));
  });

  test("the failure names the element, the background and the ratio to two decimals", async ({ page }) => {
    await open(
      page,
      '<div style="background: rgb(245 245 245)"><button>Valider</button></div>',
      "button:focus-visible { outline-color: #ccc; }",
    );
    await press(page, "Tab");
    await expect(expectRing(page.getByRole("button"), SHORT)).rejects.toThrow(
      '<button> "Valider" on rgb(245, 245, 245), ratio 1.47:1: outlineColor rgba(204, 204, 204, 1), not rgba(115, 115, 115, 1); contrast below 3:1',
    );
  });

  test("an unfocused state read by nothing before the keyboard moved fails", async ({ page }) => {
    await open(page, "<button>Créer</button>");
    await page.keyboard.press("Tab");
    await expect(expectRing(page.getByRole("button"), SHORT)).rejects.toThrow(/no unfocused state/);
  });
});

test.describe("walk", () => {
  const PAGE = `<input aria-label="Titre"><div style="background: oklch(0.97 0 0)"><button class="in">Replier</button></div>
    <a href="#contact">Nous contacter</a><button>Après</button>`;
  const INSIDE = ".in { border: 0; background: white; } .in:focus-visible { outline-offset: -2px; }";

  test("measures every element Tab reaches, up to its target", async ({ page }) => {
    await open(page, PAGE, INSIDE);
    const reached = await walk(page, {
      until: page.getByRole("link", { name: "Nous contacter" }),
      offsets: [[page.getByRole("button", { name: "Replier" }), -2]],
    });
    expect(reached).toEqual(['<input> "Titre"', '<button> "Replier"', '<a> "Nous contacter"']);
  });

  test("fails on an element that fails the measure", async ({ page }) => {
    await open(page, PAGE, INSIDE);
    await expect(walk(page, { until: page.getByRole("link"), ...SHORT })).rejects.toThrow(
      /<button> "Replier" on rgb\(245, 245, 245\).*outlineOffset -2px, not 2px/,
    );
  });

  test("fails when it reaches nothing", async ({ page }) => {
    await open(page, "<p>Rien à atteindre</p>");
    await expect(walk(page, { until: page.getByRole("link"), ...SHORT })).rejects.toThrow(/reached nothing/);
  });

  test("fails when it does not end on its target", async ({ page }) => {
    await open(page, '<button>Autre</button><a href="#contact" tabindex="-1">Nous contacter</a>');
    await expect(walk(page, { until: page.getByRole("link"), ...SHORT })).rejects.toThrow(
      /ended on <button> "Autre", not on its target/,
    );
  });
});
