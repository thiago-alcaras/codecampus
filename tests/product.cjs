// Role-specific product regression checks against the isolated demo used by CI.
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
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    async function fit(label) {
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 960 });
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${label} overflow at ${width}`,
        );
        if (width === 390 || width === 1440)
          await page.screenshot({
            path: `test-results/product-${label}-${width}.png`,
            fullPage: true,
          });
      }
    }
    async function nav(key) {
      if (await page.locator(".mobile-menu").isVisible())
        await page.locator(".mobile-menu").click();
      await page.locator(`.nav [data-nav="${key}"]`).click();
      await page.locator(".page-heading").waitFor();
    }
    async function login(role) {
      await page.goto(base + "/campus");
      await page
        .getByLabel("E-mail", { exact: true })
        .fill(`${role}@demo.codecampus.test`);
      await page.getByLabel("Senha", { exact: true }).fill("Aprender!2026");
      await page.getByRole("button", { name: "Entrar no campus" }).click();
      await page.locator(".momentum").waitFor();
    }
    await page.goto(base);
    await page.evaluate(() => document.fonts.ready);
    await fit("landing");
    await page.getByLabel("Explore o currículo").selectOption("2");
    assert.equal(await page.locator("[data-curriculum]:visible").count(), 1);
    assert.equal(
      await page.locator('[data-curriculum="2"] details').count(),
      8,
    );
    await page.locator('[data-curriculum="2"] summary').last().click();
    assert(
      (await page
        .locator('[data-curriculum="2"] details')
        .last()
        .getAttribute("open")) !== null,
    );
    await login("student");
    await fit("student");
    await page.locator('.momentum [data-action="continue-course"]').click();
    await page.locator(".lesson-reader").waitFor();
    const deepLink = page.url();
    await fit("lesson");
    await page.reload();
    await page.locator(".lesson-reader").waitFor();
    assert.equal(page.url(), deepLink);
    const title = await page.locator(".lesson-title h1").innerText();
    await page
      .getByRole("button", { name: "Próxima aula", exact: false })
      .click();
    assert.notEqual(await page.locator(".lesson-title h1").innerText(), title);
    await page.goBack();
    await page.waitForFunction(
      (expected) =>
        document.querySelector(".lesson-title h1")?.textContent === expected,
      title,
    );
    await page.goForward();
    await page.waitForFunction(
      (expected) =>
        document.querySelector(".lesson-title h1") &&
        document.querySelector(".lesson-title h1").textContent !== expected,
      title,
    );
    await nav("history");
    await page.locator(".history-entry").first().waitFor();
    await fit("history");
    await nav("classes");
    await page
      .getByLabel("Buscar turma", { exact: true })
      .fill("not-a-real-course");
    assert.equal(await page.locator("[data-library-item]:visible").count(), 0);
    assert(await page.locator("#library-empty").isVisible());
    await page.getByLabel("Buscar turma", { exact: true }).fill("");
    await page.locator('[data-action="class"]').first().click();
    await page.locator(".course-header").waitFor();
    await fit("course");
    await nav("projects");
    await page.getByRole("button", { name: "Ver projeto" }).first().click();
    await page.locator(".project-workspace").waitFor();
    await fit("project");
    await nav("notifications");
    await fit("notifications");
    await page.locator('[data-action="logout"]').click();
    await page.locator("#login-form").waitFor();
    await login("teacher");
    assert(await page.locator(".teaching-momentum").isVisible());
    assert.equal(await page.locator('.nav [data-nav="history"]').count(), 0);
    await fit("instructor");
    await nav("review");
    await fit("review");
    await nav("classes");
    await page
      .locator(".class-card")
      .filter({ hasText: "Future Builders" })
      .locator('[data-action="class"]')
      .click();
    await page.getByRole("button", { name: "Progresso dos alunos" }).click();
    await page.locator('[data-action="student-progress"]').first().click();
    await page
      .getByRole("heading", { name: "Percurso de aprendizagem" })
      .waitFor();
    await fit("student-report");
    await nav("classes");
    await page.getByRole("button", { name: "Nova turma" }).click();
    const testTitle = "Oficina de teste " + Date.now();
    await page.getByLabel("Nome da turma", { exact: true }).fill(testTitle);
    await page
      .getByLabel("Descrição", { exact: true })
      .fill("Turma fictícia para validar a experiência de autoria.");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await page.locator("dialog[open]").waitFor({ state: "hidden" });
    await page
      .locator(".class-card")
      .filter({ hasText: testTitle })
      .locator('[data-action="class"]')
      .click();
    const authoredClass = page.url().split("#course/")[1];
    await page.locator('[data-action="new-module"]').first().click();
    await page
      .getByLabel("Título", { exact: true })
      .fill("Fundamentos de teste");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await page.locator("dialog[open]").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Aula", exact: false }).click();
    await page.getByLabel("Título", { exact: true }).fill("Aula de autoria");
    await page
      .getByLabel("Conteúdo e roteiro", { exact: true })
      .fill(
        "Objetivo\nEntender o fluxo.\n\nDesafio\nConstruir uma solução com dados fictícios.",
      );
    await page
      .getByLabel("Vídeo (link HTTPS opcional)")
      .fill("https://www.youtube.com/watch?v=abcdefghijk");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await page.locator("dialog[open]").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Abrir aula" }).click();
    assert.equal(
      await page.locator(".lesson-topline .tag").innerText(),
      "Rascunho",
    );
    await page
      .getByRole("button", { name: "Editar aula", exact: true })
      .click();
    await page.getByLabel("Publicar para os alunos", { exact: true }).check();
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await page.locator("dialog[open]").waitFor({ state: "hidden" });
    assert.equal(
      await page.locator(".lesson-topline .tag").innerText(),
      "Publicado",
    );
    await page
      .getByRole("button", { name: "Enviar anexo", exact: true })
      .click();
    await page.getByLabel("Arquivo do computador").setInputFiles({
      name: "roteiro-test.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Recurso de aula fictício"),
    });
    await page.getByRole("button", { name: "Enviar arquivo" }).click();
    await page.locator("dialog[open]").waitFor({ state: "hidden" });
    await page
      .locator(".resource-link")
      .filter({ hasText: "roteiro-test.txt" })
      .waitFor();
    await fit("authoring");
    await page.locator('[data-action="logout"]').click();
    await page.locator("#login-form").waitFor();
    await login("admin");
    const identity = await (
      await page.request.get(base + "/api/auth/me")
    ).json();
    const people = await (await page.request.get(base + "/api/users")).json();
    const student = people.find(
      (p) => p.email === "student@demo.codecampus.test",
    );
    const enrolled = await page.request.post(
      base + `/api/classrooms/${authoredClass}/enrollments`,
      {
        headers: { "X-CSRF-Token": identity.csrf },
        data: { student_id: student.id },
      },
    );
    assert.equal(enrolled.status(), 201);
    await page.locator('[data-action="logout"]').click();
    await page.locator("#login-form").waitFor();
    await login("student");
    await nav("classes");
    await page
      .locator(".class-card")
      .filter({ hasText: testTitle })
      .locator('[data-action="class"]')
      .click();
    await page.getByRole("button", { name: "Abrir aula" }).click();
    assert.equal(await page.locator(".lesson-video iframe").count(), 0);
    await page.route("https://www.youtube-nocookie.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<html><body>Test player</body></html>",
      }),
    );
    await page.getByRole("button", { name: "Carregar videoaula" }).click();
    assert.equal(
      await page.locator(".lesson-video iframe").getAttribute("src"),
      "https://www.youtube-nocookie.com/embed/abcdefghijk",
    );
    const download = await page.locator(".resource-link").getAttribute("href");
    const file = await page.request.get(base + download);
    assert.equal(await file.text(), "Recurso de aula fictício");
    await page.getByRole("button", { name: "Marcar como concluída" }).click();
    await page.getByRole("button", { name: "Aula concluída" }).waitFor();
    assert.equal(
      await page.locator(".lesson-outline progress").getAttribute("value"),
      "100",
    );
    const noJS = await browser.newContext({ javaScriptEnabled: false });
    const staticPage = await noJS.newPage();
    await staticPage.goto(base);
    assert.equal((await staticPage.request.get(base + download)).status(), 401);
    assert.equal(
      await staticPage.locator("[data-curriculum]:visible").count(),
      3,
    );
    assert(
      await staticPage
        .getByRole("link", { name: "Conversar com Thiago" })
        .isVisible(),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: public curriculum/no-JS, role dashboards, continue learning, deep-link reload/back, search, course/lesson/project/history/feedback/report layouts and instructor authoring/publish/upload/student completion at 320/390/768/1440.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
