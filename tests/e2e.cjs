// Run against an isolated server seeded with fictional data.
// npm install --no-save playwright; npx playwright install chromium
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const base = process.env.BASE_URL || "http://127.0.0.1:8000";
const output = "test-results";
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL
      ? { channel: process.env.BROWSER_CHANNEL }
      : {}),
  });
  const errors = [];
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  async function login(role) {
    await page.goto(base + "/campus");
    await page
      .getByLabel("E-mail", { exact: true })
      .fill(role + "@demo.codecampus.test");
    await page.getByLabel("Senha", { exact: true }).fill("Aprender!2026");
    await page.getByRole("button", { name: "Entrar no campus" }).click();
    await page.locator(".page-heading h1").waitFor();
  }
  async function nav(key) {
    if (await page.locator(".mobile-menu").isVisible())
      await page.locator(".mobile-menu").click();
    await page.locator(`.nav [data-nav="${key}"]`).click();
    await page.locator(".page-heading").waitFor();
  }
  await login("student");
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator(".class-card").count(), 1);
  await page.screenshot({
    path: output + "/dashboard-desktop.png",
    fullPage: true,
  });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "overflow " + width,
    );
    if (width === 390)
      await page.screenshot({
        path: output + "/dashboard-mobile.png",
        fullPage: true,
      });
  }
  await nav("classes");
  await page.locator('[data-action="class"]').first().click();
  await page.locator(".module").first().waitFor();
  assert.equal(await page.locator(".module").count(), 8);
  await page.locator('[data-action="lesson"]').first().click();
  await page.locator(".lesson-reader").waitFor();
  assert(await page.locator(".lesson-body").innerText());
  await page.getByRole("button", { name: "Aula concluída" }).click();
  await page.waitForFunction(() =>
    document.querySelector("#toast").textContent.includes("descoberta"),
  );
  await nav("projects");
  await page.getByRole("button", { name: "Ver projeto" }).click();
  await page
    .getByRole("button", { name: /Entregar projeto|Enviar nova versão/ })
    .click();
  await page
    .getByLabel("Repositório HTTPS")
    .fill("https://github.com/example/codecampus-demo");
  await page
    .getByLabel("O que você construiu?")
    .fill("Projeto fictício para validar o fluxo.");
  await page.getByRole("button", { name: "Enviar projeto" }).click();
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
  assert(
    (await page.locator(".submission-card").innerText()).includes("VERSÃO"),
  );
  await nav("exams");
  await page
    .getByRole("button", { name: /Iniciar prova|Retomar prova/ })
    .click();
  await page.getByRole("button", { name: "Estou pronto" }).click();
  await page.locator(".question").first().waitFor();
  assert.equal(await page.locator(".question").count(), 3);
  await page.locator(".question input").first().check();
  await page.waitForFunction(
    () =>
      document.querySelector("#save-status")?.textContent ===
      "Respostas sincronizadas",
  );
  await page
    .getByRole("button", { name: "Concluir avaliação", exact: true })
    .click();
  await page.getByRole("button", { name: "Concluir e enviar" }).click();
  await page.locator(".result").waitFor();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.locator('[data-action="logout"]').click();
  await page.locator("#login-form").waitFor();
  await login("teacher");
  await nav("projects");
  await page.getByRole("button", { name: "Ver projeto" }).last().click();
  await page.getByRole("button", { name: "Avaliar entrega" }).first().click();
  await page
    .getByLabel("Feedback e próximos passos")
    .fill("Bom trabalho. Amplie a cobertura dos testes.");
  await page.getByRole("button", { name: "Publicar feedback" }).click();
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
  await nav("classes");
  await page.locator('[data-action="class"]').last().click();
  await page.getByRole("button", { name: "Enviar material" }).click();
  await page.getByLabel("Arquivo do computador").setInputFiles({
    name: "demo.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Material fictício para teste"),
  });
  await page.getByRole("button", { name: "Enviar arquivo" }).click();
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
  await page
    .locator(".resource-link")
    .filter({ hasText: "demo.txt" })
    .waitFor();
  await nav("exams");
  await page.getByRole("button", { name: "Criar avaliação" }).click();
  await page
    .getByLabel("Turma", { exact: true })
    .selectOption({ label: "Engenharia & IA · Future Builders" });
  await page
    .getByLabel("Título", { exact: true })
    .fill("Revisão de algoritmos");
  await page
    .getByLabel("Pergunta", { exact: true })
    .fill("Qual estrutura executa uma repetição?");
  for (let i = 1; i <= 4; i++)
    await page
      .getByLabel("Alternativa " + i, { exact: true })
      .fill(["Laço", "Comentário", "Nome", "Espaço"][i - 1]);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
  await page
    .locator(".cards .panel")
    .filter({ hasText: "Revisão de algoritmos" })
    .getByRole("button", { name: "Editar", exact: true })
    .click();
  await page.getByLabel("Publicar para os alunos", { exact: true }).check();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
  await page
    .locator(".cards .panel")
    .filter({ hasText: "Revisão de algoritmos" })
    .getByText("Publicado", { exact: true })
    .waitFor();
  await page.locator('[data-action="logout"]').click();
  await page.locator("#login-form").waitFor();
  await login("guardian");
  await nav("projects");
  await page.getByRole("button", { name: "Ver projeto" }).click();
  assert(
    (await page.locator(".project-workspace").innerText()).includes(
      "Bom trabalho",
    ),
  );
  assert.equal(
    await page.getByRole("button", { name: "Entregar projeto" }).count(),
    0,
  );
  await page.locator('[data-action="logout"]').click();
  await page.locator("#login-form").waitFor();
  await login("admin");
  await nav("users");
  assert.equal(await page.locator("[data-person]").count(), 4);
  await page.getByRole("button", { name: "Histórico de auditoria" }).click();
  await page
    .getByRole("cell", { name: "asset.upload", exact: true })
    .first()
    .waitFor();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await nav("settings");
  await page
    .getByRole("heading", { name: "Certificados", exact: true })
    .waitFor();
  await nav("users");
  await page.getByRole("button", { name: "Cadastrar pessoa" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Professor Fictício");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("professor-ficticio@example.test");
  await page.getByLabel("Perfil", { exact: true }).selectOption("teacher");
  await page.getByLabel("Senha inicial", { exact: true }).fill("Ficticia!2026");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
  await page
    .getByRole("cell", { name: "Professor Fictício", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: four roles, classes, lessons, submission, grading, uploads, exam autosave/finish, guardian feedback, audit, responsive 320/390/768/1440, no JS errors.",
  );
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
