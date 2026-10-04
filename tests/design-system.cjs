// Run against a fictional seeded CodeCampus server; does not mutate academic data.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const base = process.env.BASE_URL || "http://127.0.0.1:8000";
fs.mkdirSync("test-results", { recursive: true });
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL
      ? { channel: process.env.BROWSER_CHANNEL }
      : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base);
    await page.locator("#login-form").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: "test-results/login-desktop.png",
      fullPage: true,
    });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "login overflow " + width,
      );
    }
    await page
      .getByLabel("E-mail", { exact: true })
      .fill("teacher@demo.codecampus.test");
    await page.getByLabel("Senha", { exact: true }).fill("Aprender!2026");
    await page.getByRole("button", { name: "Entrar no campus" }).click();
    await page.locator(".page-heading h1").waitFor();
    assert.equal(await page.locator('.nav [aria-current="page"]').count(), 1);
    await page.screenshot({
      path: "test-results/dashboard-teacher.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.locator(".mobile-menu").click();
    assert.equal(
      await page.locator(".mobile-menu").getAttribute("aria-expanded"),
      "true",
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator(".mobile-menu").getAttribute("aria-expanded"),
      "false",
    );
    assert.equal(await page.locator(".sidebar").isVisible(), false);
    await page.locator(".mobile-menu").click();
    await page.locator(".menu-scrim").click({ position: { x: 350, y: 200 } });
    assert.equal(
      await page.locator(".mobile-menu").getAttribute("aria-expanded"),
      "false",
    );
    await page.locator(".mobile-menu").click();
    await page.locator('.nav [data-nav="classes"]').click();
    await page.locator(".cards .class-card").first().waitFor();
    assert.equal(
      await page.locator(".mobile-menu").getAttribute("aria-expanded"),
      "false",
    );
    await page.screenshot({
      path: "test-results/classes-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('[data-action="class"]').last().click();
    await page.locator(".module").first().waitFor();
    await page.screenshot({
      path: "test-results/modules-desktop.png",
      fullPage: true,
    });
    await page.locator('[data-action="lesson"]').first().click();
    await page.locator("#dialog[open]").waitFor();
    await page.screenshot({ path: "test-results/lesson-dialog.png" });
    await page.keyboard.press("Escape");
    await page.goto(base + "/static/design-system.html");
    await page.evaluate(() => document.fonts.ready);
    assert(
      await page.evaluate(
        () =>
          document.fonts.check('16px "Source Sans 3"') &&
          document.fonts.check('20px "Space Grotesk"') &&
          document.fonts.check('14px "IBM Plex Mono"'),
      ),
      "local fonts loaded",
    );
    const pairs = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const value = (n) => style.getPropertyValue("--" + n).trim();
      return [
        ["ink", "paper"],
        ["muted", "paper"],
        ["muted", "surface"],
        ["on-action", "action"],
        ["ink", "highlight"],
        ["accent", "paper"],
        ["success", "success-soft"],
        ["warning", "warning-soft"],
        ["danger", "danger-soft"],
        ["info", "info-soft"],
        ["control-border", "surface"],
        ["focus", "paper"],
      ].map(([fg, bg]) => [fg, bg, value(fg), value(bg)]);
    });
    function lum(hex) {
      const rgb = hex
        .slice(1)
        .match(/../g)
        .map((v) => parseInt(v, 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    }
    for (const [fg, bg, a, b] of pairs) {
      const ratio =
        (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
      assert(
        ratio >= (fg === "control-border" || fg === "focus" ? 3 : 4.5),
        `${fg}/${bg} contrast ${ratio}`,
      );
    }
    await page.getByRole("tab", { name: "Aulas", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page
        .getByRole("tab", { name: "Projetos", exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
    await page
      .getByRole("button", { name: "Ver detalhes", exact: true })
      .click();
    assert(
      await page
        .locator("#dialog")
        .evaluate((node) => node.contains(document.activeElement)),
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#dialog").isVisible(), false);
    await page.screenshot({
      path: "test-results/design-system-desktop.png",
      fullPage: true,
    });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "gallery overflow " + width,
      );
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page
        .locator(".button")
        .first()
        .evaluate((node) => getComputedStyle(node).transitionDuration),
      "0s",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: local fonts, 12 contrast pairs, keyboard tabs/dialog, mobile menu, responsive login/gallery, reduced motion, teacher/class/lesson screenshots.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
