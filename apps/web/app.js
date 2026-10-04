const $ = (s, root = document) => root.querySelector(s),
  $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  home: "M3 10 12 3l9 7v11h-6v-7H9v7H3z",
  classes: "M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3z",
  projects: "M4 6h6l2 2h8v12H4z M8 13h8m-8 3h5",
  exams: "M6 3h12v18H6z M9 7h6m-6 4h6m-6 4h3",
  announcements: "m3 10 16-5v14L3 14z M7 15l2 6h3",
  reports: "M4 20V10m8 10V4m8 16v-7",
  users:
    "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M19 8v6m-3-3h6",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  check: "m4 12 5 5L20 6",
  logout: "M10 4H4v16h6m4-13 5 5-5 5M9 12h10",
  bell: "M6 8a6 6 0 0 1 12 0v7l2 2H4l2-2z M10 21h4",
  menu: "M3 6h18M3 12h18M3 18h18",
  clock: "M12 8v5l3 2 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20",
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.classes}"/></svg>`;
const roles = {
  admin: "Administração",
  teacher: "Professor",
  student: "Aluno",
  guardian: "Responsável",
};
const state = {
  user: null,
  csrf: "",
  page: "home",
  classes: [],
  assignments: [],
  submissions: [],
  announcements: [],
  exams: [],
  dashboard: {},
  users: [],
  currentClass: null,
};
let navigation = 0,
  toastTimer,
  examController = null;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 5000);
}
async function api(path, options = {}) {
  const { method = "GET", body } = options;
  const headers = {};
  if (method !== "GET") headers["X-CSRF-Token"] = state.csrf;
  if (body && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const response = await fetch("/api" + path, {
    method,
    headers,
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  if (!response.ok) {
    let error;
    try {
      error = await response.json();
    } catch {
      error = { detail: "Falha na conexão com o campus." };
    }
    const detail = Array.isArray(error.detail)
      ? error.detail.map((e) => e.msg).join("\n")
      : error.detail;
    if (response.status === 401 && state.user) {
      state.user = null;
      examController?.abort();
      document.body.classList.remove("exam-active");
      loginPage();
    }
    throw new Error(detail || "Não foi possível concluir.");
  }
  return response.json();
}
const staff = () => ["admin", "teacher"].includes(state.user?.role);
const date = (t) =>
  new Date(t * 1000).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
const fullDate = (t) => new Date(t * 1000).toLocaleString("pt-BR");
const className = (id) =>
  state.classes.find((c) => c.id === id)?.title || "Turma";
const empty = (text) => `<div class="empty">${esc(text)}</div>`;
const button = (text, action, id = "", secondary = false) =>
  `<button class="button ${secondary ? "secondary" : ""}" data-action="${action}" data-id="${esc(id)}">${esc(text)}</button>`;
function art() {
  return `<div class="hero-art" aria-hidden="true"><div class="lab-diagram"><span class="diagram-caption">PROCESSO / 001</span><div class="diagram-flow"><span>?</span><i></i><span>{ }</span><i></i><span>↗</span></div><div class="diagram-labels"><span>PERGUNTAR</span><span>CONSTRUIR</span><span>EVOLUIR</span></div><div class="diagram-footer"><span>IDEIAS EM MOVIMENTO</span><span>CC—LAB</span></div></div></div>`;
}
const brandMark = `<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M16 9 5 20l11 11M24 9l11 11-11 11M23 5l-6 30" stroke="currentColor" stroke-width="3"/></svg></span>`;
function loginPage() {
  $("#app").innerHTML =
    `<main class="login" id="content" tabindex="-1"><section class="login-story"><div class="brand">${brandMark}CodeCampus</div><h1>O mundo se<br>constrói com<br><em>boas perguntas.</em></h1><p>Um lugar para experimentar, escrever código e aprender com o que você constrói. Da primeira descoberta ao primeiro projeto de verdade.</p>${art()}</section><section class="login-main"><div class="login-card"><p class="eyebrow">ACESSO AO CAMPUS / 01</p><h2>Vamos começar.</h2><p class="muted">Alunos, professores e responsáveis: seu trabalho começa aqui.</p><form id="login-form"><label>E-mail<input type="email" name="email" required autocomplete="username" placeholder="voce@escola.com"></label><label>Senha<input type="password" name="password" required autocomplete="current-password" minlength="1" maxlength="128" placeholder="Sua senha"></label><p class="form-error" role="alert"></p><button class="button" type="submit">Entrar no campus ${icon("arrow")}</button></form><p class="login-foot">Sua conta é criada pela escola. Para recuperar o acesso, entre em contato com a administração.<br>Materiais e entregas são privados.</p></div></section></main>`;
  $("#login-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submit = $("button", form);
    submit.disabled = true;
    try {
      const result = await api("/auth/login", {
        method: "POST",
        body: Object.fromEntries(new FormData(form)),
      });
      Object.assign(state, result);
      await refresh();
      shell();
      navigate("home");
    } catch (error) {
      $(".form-error", form).textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  };
}
async function refresh() {
  const [classes, assignments, submissions, announcements, exams, dashboard] =
    await Promise.all(
      [
        "/classrooms",
        "/assignments",
        "/submissions",
        "/announcements",
        "/exams",
        "/dashboard",
      ].map((p) => api(p)),
    );
  Object.assign(state, {
    classes,
    assignments,
    submissions,
    announcements,
    exams,
    dashboard,
  });
  if (staff()) state.users = await api("/users");
}
function shell() {
  const nav = [
    ["home", "Visão geral"],
    ["classes", "Minhas turmas"],
    ["projects", "Projetos"],
    ["exams", "Avaliações"],
    ["announcements", "Mural"],
    ...(staff() ? [["reports", "Acompanhamento"]] : []),
    ...(state.user.role === "admin" ? [["users", "Pessoas e acessos"]] : []),
    ["settings", "Minha conta"],
  ];
  $("#app").innerHTML =
    `<div class="shell"><aside class="sidebar" id="campus-navigation"><a class="brand" href="#home" data-nav="home">${brandMark}<span>CodeCampus<small>APRENDER CONSTRUINDO</small></span></a><div class="nav-label">SEU CAMPUS</div><nav class="nav" aria-label="Menu principal">${nav.map(([key, label]) => `<button data-nav="${key}">${icon(key)}${label}${key === "projects" ? `<span class="badge">${state.assignments.length}</span>` : ""}</button>`).join("")}</nav><div class="side-note"><strong>Caderno de bordo</strong><p>Um projeto de cada vez.<br>Uma descoberta por dia.</p><button class="text-button" data-nav="classes">Explore suas turmas →</button></div><div class="side-bottom nav"><button data-action="logout">${icon("logout")}Sair do campus</button></div></aside><button class="menu-scrim" data-action="close-menu" aria-label="Fechar menu" tabindex="-1"></button><div class="main"><header class="topbar"><button class="icon-button mobile-menu" data-action="menu" aria-label="Abrir menu" aria-controls="campus-navigation" aria-expanded="false">${icon("menu")}</button><div class="breadcrumb">Seu campus <span>/</span> <strong id="breadcrumb">Visão geral</strong></div><div class="top-actions"><span class="date">${new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}</span><button class="icon-button" data-nav="announcements" aria-label="Ver avisos">${icon("bell")}</button><div class="profile"><div class="avatar">${esc(
      state.user.name
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join(""),
    )}</div><div><strong>${esc(state.user.name)}</strong><small>${roles[state.user.role]}</small></div></div></div></header><main class="content" id="content" tabindex="-1"></main></div></div>`;
  $("#app").onclick = async (e) => {
    const nav = e.target.closest("[data-nav]");
    if (nav) {
      navigate(nav.dataset.nav);
      return;
    }
    const action = e.target.closest("[data-action]");
    if (action) {
      try {
        await handleAction(action.dataset.action, action.dataset.id);
      } catch (error) {
        toast(error.message);
      }
    }
  };
}
function closeMenu() {
  $(".sidebar")?.classList.remove("open");
  const toggle = $(".mobile-menu");
  toggle?.setAttribute("aria-expanded", "false");
  toggle?.setAttribute("aria-label", "Abrir menu");
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $(".sidebar.open")) {
    closeMenu();
    $(".mobile-menu")?.focus();
  }
});
async function navigate(page) {
  const token = ++navigation;
  state.page = page;
  const labels = {
    home: "Visão geral",
    classes: "Minhas turmas",
    projects: "Projetos",
    exams: "Avaliações",
    announcements: "Mural",
    reports: "Acompanhamento",
    users: "Pessoas e acessos",
    settings: "Minha conta",
  };
  $$(".nav [data-nav]").forEach(
    (b) => (
      b.classList.toggle("active", b.dataset.nav === page),
      b.dataset.nav === page
        ? b.setAttribute("aria-current", "page")
        : b.removeAttribute("aria-current")
    ),
  );
  closeMenu();
  $("#breadcrumb").textContent = labels[page] || page;
  $("#content").innerHTML = '<div class="initial">Carregando…</div>';
  try {
    const html = await (
      {
        home: homePage,
        classes: classesPage,
        projects: projectsPage,
        exams: examsPage,
        announcements: announcementsPage,
        reports: reportsPage,
        users: usersPage,
        settings: settingsPage,
      }[page] || homePage
    )();
    if (token !== navigation) return;
    $("#content").innerHTML = html;
    $("#content").focus({ preventScroll: true });
    if (page === "users")
      $("#people-search").oninput = (e) =>
        $$("[data-person]").forEach(
          (r) =>
            (r.hidden = !r.textContent
              .toLowerCase()
              .includes(e.target.value.toLowerCase())),
        );
  } catch (error) {
    if (token === navigation) $("#content").innerHTML = empty(error.message);
  }
}
function heading(title, subtitle, action = "") {
  return `<div class="page-heading"><div><h1>${esc(title)}</h1><p class="muted">${esc(subtitle)}</p></div>${action}</div>`;
}
function classCard(c) {
  return `<article class="class-card"><div class="class-art ${esc(c.color)}"><div class="track">CC / ${esc(c.age_band)}<span>${c.color === "purple" ? "Engenharia aplicada" : c.color === "mint" ? "Primeiras descobertas" : c.color === "orange" ? "Ideias em ação" : "Laboratório de código"}</span></div><span class="code-symbol" aria-hidden="true">${c.color === "mint" ? "01" : c.color === "blue" ? "02" : c.color === "orange" ? "↗" : "03"}</span></div><div class="class-body"><span class="tag">${esc(c.age_band)}</span><h3>${esc(c.title)}</h3><p>${esc(c.description)}</p><div class="chips"><span class="muted tiny">${c.modules} módulos</span><span class="muted tiny">· ${c.students} alunos</span></div><div class="class-foot"><span>${esc(c.teacher_name)}</span><button class="text-button" data-action="class" data-id="${c.id}">Acessar turma →</button></div></div></article>`;
}
function homePage() {
  const d = state.dashboard,
    name = state.user.name.split(" ")[0];
  const student = state.user.role === "student";
  const todo = state.assignments.filter(
    (a) => !state.submissions.some((s) => s.assignment_id === a.id),
  );
  return (
    heading(
      `Olá, ${name}.`,
      student
        ? "Vamos transformar suas ideias em código?"
        : "Cada descoberta começa com uma boa experiência de aprendizado.",
      `<span class="pill"><span class="status-dot"></span>Campus conectado</span>`,
    ) +
    `<section class="hero"><div class="hero-copy"><p class="eyebrow">OFICINA ABERTA / CODECAMPUS</p><h2>${student ? "Aprender é colocar<br>uma ideia em prática." : "Ensinar é abrir espaço<br>para novas descobertas."}</h2><p>Da primeira linha de código aos projetos com inteligência artificial. Sua jornada acontece aqui.</p><button class="button" data-nav="classes">${student ? "Continuar aprendendo" : "Explorar as turmas"} ${icon("arrow")}</button></div>${art()}</section><div class="stats">${[
      [d.classrooms, "Turmas no seu campus", "classes", ""],
      [d.lessons, "Aulas disponíveis", "exams", "mint"],
      [d.assignments, "Projetos para construir", "projects", "orange"],
      [d.progress + "%", "Progresso de aprendizagem", "reports", "blue"],
    ]
      .map(
        ([n, label, i, color]) =>
          `<div class="stat"><div class="stat-icon ${color}">${icon(i)}</div><div><strong>${n}</strong><span>${label}</span></div></div>`,
      )
      .join(
        "",
      )}</div><div class="dashboard-grid"><div><div class="section-title"><h2>${staff() ? "Suas turmas" : "Minha jornada"}</h2><button class="text-button" data-nav="classes">Ver todas →</button></div><div class="class-grid">${state.classes.slice(0, 2).map(classCard).join("") || empty("A escola ainda não vinculou uma turma à sua conta.")}</div><section class="project-list"><div class="section-title"><h2>Ideias em construção</h2><button class="text-button" data-nav="projects">Todos os projetos →</button></div>${
      state.assignments
        .slice(0, 3)
        .map(
          (a) =>
            `<div class="list-row"><div class="list-icon">${icon("projects")}</div><div class="list-copy"><strong>${esc(a.title)}</strong><small>${esc(className(a.classroom_id))}</small></div><span class="tag">Até ${date(a.due_at)}</span><button class="text-button" data-action="assignment" data-id="${a.id}">Abrir →</button></div>`,
        )
        .join("") || empty("Novos projetos aparecerão aqui.")
    }</section></div><aside class="right-rail"><section class="panel"><div class="section-title"><h2>Encontros da turma</h2>${icon("clock")}</div><p class="agenda-day">Horários informados pela escola</p>${
      state.classes
        .slice(0, 3)
        .map(
          (c) =>
            `<div class="agenda-item"><div class="agenda-copy"><strong>${esc(c.title)}</strong><span>${esc(c.schedule || "Horário a combinar")}</span></div></div>`,
        )
        .join("") || '<p class="hint">Sem encontros cadastrados.</p>'
    }</section><section class="panel"><div class="section-title"><h2>Novidades do campus</h2><button class="text-button" data-nav="announcements">Ver tudo</button></div>${
      state.announcements
        .slice(0, 2)
        .map(
          (a) =>
            `<div class="notice"><strong>${esc(a.title)}</strong><p>${esc(a.body.slice(0, 110))}${a.body.length > 110 ? "…" : ""}</p><small>${esc(a.author_name)} · ${date(a.created_at)}</small></div>`,
        )
        .join("") || '<p class="hint">Nenhum aviso por enquanto.</p>'
    }</section><section class="panel challenge"><p class="eyebrow">PEQUENOS PASSOS, GRANDES IDEIAS</p><h3>O que você vai criar hoje?</h3><p>${student ? `${todo.length} projeto(s) aguardando sua primeira entrega. Compartilhe suas ideias e aprenda com o feedback.` : "Acompanhe as entregas, celebre o progresso e ajude cada aluno a dar seu próximo passo."}</p><button class="text-button" data-nav="projects">Explorar projetos →</button></section></aside></div><footer class="footer"><span>CodeCampus · Aprender construindo</span><span>Perguntar. Construir. Evoluir.</span></footer>`
  );
}
function classesPage() {
  return (
    heading(
      "Minhas turmas",
      "Cada turma, uma nova possibilidade.",
      state.user.role === "admin" ? button("＋ Nova turma", "new-class") : "",
    ) +
    `<div class="cards">${state.classes.map(classCard).join("") || empty("Nenhuma turma disponível.")}</div>`
  );
}
function projectsPage() {
  return (
    heading(
      "Projetos",
      "Construa, compartilhe e evolua com feedback.",
      staff() ? button("＋ Novo projeto", "new-assignment") : "",
    ) +
    `<div class="cards">${
      state.assignments
        .map((a) => {
          const own = state.submissions.find((s) => s.assignment_id === a.id);
          return `<article class="panel"><span class="tag">${esc(className(a.classroom_id))}</span><h3>${esc(a.title)}</h3><p class="muted">${esc(a.description.slice(0, 140))}</p><div class="meta">Entrega até ${fullDate(a.due_at)}</div>${own ? `<span class="tag mint">${own.grade === null ? "Entregue · versão " + own.version : "Avaliado · " + own.grade + "/100"}</span>` : ""}<div>${button("Ver projeto →", "assignment", a.id)}</div></article>`;
        })
        .join("") || empty("A equipe ainda não publicou projetos.")
    }</div>`
  );
}
function examsPage() {
  return (
    heading(
      "Avaliações",
      "Checkpoints para reconhecer o que você aprendeu.",
      staff() ? button("＋ Criar avaliação", "new-exam") : "",
    ) +
    `<div class="cards">${state.exams.map((e) => `<article class="panel"><span class="tag">${esc(className(e.classroom_id))}</span><h3>${esc(e.title)}</h3><p class="muted">${e.question_count} questões · ${e.duration_minutes} minutos</p><p class="hint">${e.published ? "Publicado" : "Rascunho"}${e.attempt?.finished_at ? " · Resultado: " + e.attempt.grade + "/100" : ""}</p>${staff() ? button("Ver resultados", "exam-results", e.id) + button("Editar", "edit-exam", e.id, true) : state.user.role === "student" ? button(e.attempt?.finished_at ? "Ver resultado" : e.attempt ? "Retomar prova" : "Iniciar prova", "exam-intro", e.id) : '<p class="hint">Avaliação disponível para o aluno.</p>'}</article>`).join("") || empty("Nenhuma avaliação publicada.")}</div>`
  );
}
function announcementsPage() {
  return (
    heading(
      "Mural do campus",
      "Combinados, descobertas e os próximos encontros.",
      staff() ? button("＋ Publicar aviso", "new-announcement") : "",
    ) +
    state.announcements
      .map(
        (a) =>
          `<article class="panel"><span class="tag">${esc(className(a.classroom_id))}</span><h3>${esc(a.title)}</h3><p class="lesson-body">${esc(a.body)}</p><small class="muted">${esc(a.author_name)} · ${fullDate(a.created_at)}</small></article>`,
      )
      .join("") +
    (state.announcements.length
      ? ""
      : empty("Tudo tranquilo por aqui. Novos avisos aparecerão neste mural."))
  );
}
function reportsPage() {
  return (
    heading(
      "Acompanhamento",
      "Progresso, projetos e presença em um só lugar.",
    ) +
    `<div class="cards">${state.classes.map((c) => `<article class="panel"><h3>${esc(c.title)}</h3><p class="muted">${c.students} alunos · ${c.modules} módulos</p><div class="chips">${button("Relatório", "report", c.id)}${button("Chamada", "attendance", c.id, true)}</div></article>`).join("")}</div>`
  );
}
function usersPage() {
  return (
    heading(
      "Pessoas e acessos",
      "Contas individuais e vínculos definidos pela administração.",
      button("＋ Cadastrar pessoa", "new-user"),
    ) +
    `<div class="chips meta">${button("Vincular responsável", "link-guardian", "", true)}${button("Histórico de auditoria", "audit", "", true)}</div><label class="search">Buscar pessoa<input id="people-search" type="search" placeholder="Nome, e-mail ou perfil"></label><div class="table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Conta</th></tr></thead><tbody>${state.users.map((u) => `<tr data-person><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${roles[u.role]}</td><td>${u.id === state.user.id ? "Sua conta" : `<button class="text-button" data-action="toggle-user" data-id="${u.id}">${u.active ? "Desativar" : "Reativar"}</button> <button class="text-button" data-action="reset-password" data-id="${u.id}">Redefinir senha</button>`}</td></tr>`).join("")}</tbody></table></div>`
  );
}
async function settingsPage() {
  let links = [];
  if (state.user.role === "guardian") links = await api("/guardian-links");
  const certificates = await api("/certificates");
  return (
    heading("Minha conta", "Cuide do seu acesso ao campus.") +
    `<section class="panel"><h3>${esc(state.user.name)}</h3><p class="muted">${esc(state.user.email)} · ${roles[state.user.role]}</p>${button("Alterar senha", "password")}</section><section class="panel"><h3>Certificados</h3>${certificates.map((c) => `<p><a href="/api/certificates/${c.id}/document" target="_blank" rel="noopener noreferrer">${esc(c.classroom_title)} · ${esc(c.student_name)} ↗</a></p>`).join("") || '<p class="hint">Certificados aparecem após a conclusão das aulas, aprovação nos projetos e avaliações e emissão pela escola.</p>'}</section>${links.length ? `<section class="panel"><h3>Alunos vinculados</h3>${links.map((l) => `<p>${esc(l.student_name)} · vínculo registrado em ${date(l.consent_at)}</p>`).join("")}</section>` : ""}<section class="panel"><h3>Privacidade e proteção</h3><p class="hint">Materiais e projetos exigem acesso à turma. Contas são individuais. Nunca envie senhas, chaves de API ou dados pessoais nos projetos. Solicitações de correção, exclusão ou recuperação de acesso devem ser encaminhadas à administração da escola.</p></section>`
  );
}

const field = (label, name, type = "text", value = "", attrs = "") =>
  `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
const area = (label, name, value = "", attrs = "") =>
  `<label>${esc(label)}<textarea name="${name}" ${attrs}>${esc(value)}</textarea></label>`;
const select = (label, name, items) =>
  `<label>${esc(label)}<select aria-label="${esc(label)}" name="${name}" required>${items.map(([id, text]) => `<option value="${esc(id)}">${esc(text)}</option>`).join("")}</select></label>`;
const classSelect = () =>
  select(
    "Turma",
    "classroom_id",
    state.classes.map((c) => [c.id, c.title]),
  );
function dialog(title, html) {
  const d = $("#dialog");
  d.onclick = null;
  d.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2><button class="close" aria-label="Fechar">×</button></div>${html}`;
  $(".close", d).onclick = () => d.close();
  if (!d.open) d.showModal();
  return d;
}
function formDialog(title, fields, onSubmit, label = "Salvar") {
  const d = dialog(
    title,
    `<form>${fields}<p class="form-error" role="alert"></p><div class="form-actions"><button class="button" type="submit">${label}</button></div></form>`,
  );
  $("form", d).onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget,
      submit = $("[type=submit]", form),
      classId = $(".detail-header") ? state.currentClass : null;
    submit.disabled = true;
    try {
      await onSubmit(Object.fromEntries(new FormData(form)), form);
      if (!state.user) {
        d.close();
        toast("Senha alterada. Entre novamente.");
        return;
      }
      await refresh();
      await navigate(state.page);
      if (classId) await classDetail(classId);
      d.close();
      toast("Tudo certo. Alteração salva.");
    } catch (error) {
      $(".form-error", form).textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  };
  return d;
}
function table(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
async function classDetail(id) {
  const token = ++navigation;
  state.currentClass = id;
  state.page = "classes";
  const c = state.classes.find((c) => c.id === id);
  const [modules, assets] = await Promise.all([
    api(`/classrooms/${id}/modules`),
    api(`/classrooms/${id}/assets`),
  ]);
  if (token !== navigation) return;
  $("#content").innerHTML =
    `<button class="text-button" data-nav="classes">← Todas as turmas</button><div class="detail-header"><span class="tag">${esc(c.age_band)}</span><h1>${esc(c.title)}</h1><p class="muted">${esc(c.description)}</p><div class="chips"><span class="pill">${esc(c.schedule)}</span><span class="pill">Professor: ${esc(c.teacher_name)}</span></div></div><div class="section-title"><h2>Trilha de aprendizagem</h2><div class="chips">${staff() ? button("＋ Módulo", "new-module", id, true) : ""}${state.user.role === "admin" ? button("Editar turma", "edit-class", id, true) : ""}${state.user.role === "admin" ? button("Matrículas", "enrollment", id, true) : ""}</div></div>${modules.map((m) => `<section class="module"><div class="module-heading"><div><h3>${esc(m.title)}</h3><p>${esc(m.description)}</p></div>${staff() ? `<div><button class="text-button" data-action="edit-module" data-id="${m.id}">Editar</button><button class="text-button" data-action="new-lesson" data-id="${m.id}">＋ Aula</button></div>` : ""}</div>${m.lessons.map((l, i) => `<div class="lesson"><span class="lesson-number">${l.completed ? "✓" : String(i + 1).padStart(2, "0")}</span><div class="lesson-copy"><strong>${esc(l.title)}</strong><small>${l.minutes} min · ${l.published ? "Publicado" : "Rascunho"}${l.completed ? " · Concluído" : ""}</small></div><button class="button small secondary" data-action="lesson" data-id="${l.id}">Abrir aula</button></div>`).join("") || '<div class="lesson"><p class="hint no-margin">Novas aulas serão adicionadas aqui.</p></div>'}</section>`).join("") || empty("Esta turma ainda não tem módulos.")}<div class="section-title"><h2>Materiais da turma</h2>${staff() ? button("↑ Enviar material", "upload-material", id, true) : ""}</div>${
      assets.length
        ? table(
            ["Arquivo", "Tamanho", "Enviado em", "Acesso"],
            assets.map((a) => [
              esc(a.name),
              (a.size / 1024 / 1024).toFixed(2) + " MB",
              date(a.created_at),
              `<a href="/api/assets/${a.id}/download">Baixar ↓</a>`,
            ]),
          )
        : empty("Nenhum material enviado.")
    }<p class="hint">Materiais são privados. Downloads exigem acesso à turma.</p>`;
  state.modules = modules;
  state.assets = assets;
}
async function lessonView(id) {
  const lesson = state.modules
      .flatMap((m) => m.lessons)
      .find((l) => l.id === id),
    assets = state.assets.filter((a) => a.lesson_id === id);
  const d = dialog(
    lesson.title,
    `<p class="meta">${lesson.minutes} minutos · ${lesson.published ? "Publicado" : "Rascunho"}</p><div class="lesson-body">${esc(lesson.body)}</div>${lesson.video_url ? `<p><a href="${esc(lesson.video_url)}" target="_blank" rel="noopener noreferrer">Assistir à videoaula ↗</a></p>` : ""}${assets.map((a) => `<p><a href="/api/assets/${a.id}/download">${esc(a.name)} ↓</a></p>`).join("")}<div class="form-actions">${staff() ? button("Editar aula", "edit-lesson", id, true) + button("Enviar anexo", "upload-lesson", id, true) : state.user.role === "student" ? button(lesson.completed ? "Aula concluída ✓" : "Marcar como concluída", "complete", id) : ""}</div>`,
  );
  d.onclick = async (e) => {
    const b = e.target.closest("[data-action]");
    if (b)
      try {
        await handleAction(b.dataset.action, b.dataset.id);
      } catch (error) {
        toast(error.message);
      }
  };
}
async function assignmentView(id) {
  const a = state.assignments.find((a) => a.id === id),
    submissions = state.submissions.filter((s) => s.assignment_id === id);
  const d = dialog(
    a.title,
    `<span class="tag">${esc(className(a.classroom_id))}</span><p class="meta">Entrega até ${fullDate(a.due_at)}</p><div class="lesson-body">${esc(a.description)}</div><h3 class="meta">Critérios de avaliação</h3>${table(
      ["Critério", "Peso"],
      a.rubric.map((r) => [esc(r.label), r.weight + "%"]),
    )}<h3 class="meta">${staff() ? "Entregas dos alunos" : "Suas entregas"}</h3>${staff() ? button("Editar projeto", "edit-assignment", id, true) : ""}${submissions.map((s) => `<section class="help-box"><strong>${esc(s.student_name)} · versão ${s.version}${s.late ? " · Fora do prazo" : ""}</strong><p class="hint">${fullDate(s.submitted_at)}</p>${s.repository_url ? `<a href="${esc(s.repository_url)}" target="_blank" rel="noopener noreferrer">Abrir repositório ↗</a>` : ""}${s.asset_id ? `<p><a href="/api/assets/${s.asset_id}/download">Baixar anexo ↓</a></p>` : ""}<p>${esc(s.notes)}</p><p>${s.grade !== null ? `Nota: <strong>${s.grade}/100</strong><br>${esc(s.feedback)}` : "Aguardando avaliação"}</p>${staff() ? button("Avaliar entrega", "grade", s.id, true) : ""}</section>`).join("") || '<p class="hint">Nenhuma entrega ainda.</p>'}${state.user.role === "student" ? `<div class="form-actions">${button(submissions.length ? "Enviar nova versão" : "Entregar projeto", "submit", id)}</div>` : ""}`,
  );
  d.onclick = async (e) => {
    const b = e.target.closest("[data-action]");
    if (b)
      try {
        await handleAction(b.dataset.action, b.dataset.id);
      } catch (error) {
        toast(error.message);
      }
  };
}
async function uploadFor(classId, lessonId = null, file) {
  const form = new FormData();
  form.append("file", file);
  if (lessonId) form.append("lesson_id", lessonId);
  return api(`/classrooms/${classId}/assets`, { method: "POST", body: form });
}
async function handleAction(action, id) {
  switch (action) {
    case "menu": {
      const open = $(".sidebar").classList.toggle("open");
      $(".mobile-menu").setAttribute("aria-expanded", String(open));
      $(".mobile-menu").setAttribute(
        "aria-label",
        open ? "Fechar menu" : "Abrir menu",
      );
      break;
    }
    case "close-menu":
      closeMenu();
      $(".mobile-menu").focus();
      break;
    case "logout":
      await api("/auth/logout", { method: "POST" });
      state.user = null;
      loginPage();
      break;
    case "class":
      await classDetail(id);
      break;
    case "lesson":
      await lessonView(id);
      break;
    case "assignment":
      await assignmentView(id);
      break;
    case "complete": {
      const token = navigation,
        classId = state.currentClass;
      await api(`/lessons/${id}/complete`, { method: "POST" });
      $("#dialog").close();
      await refresh();
      if (token === navigation) await classDetail(classId);
      toast("Mais uma descoberta na sua jornada!");
      break;
    }
    case "new-user":
      formDialog(
        "Cadastrar pessoa",
        field("Nome", "name", "text", "", 'required maxlength="120"') +
          field("E-mail", "email", "email", "", "required") +
          select("Perfil", "role", Object.entries(roles)) +
          field(
            "Senha inicial",
            "password",
            "password",
            "",
            'required minlength="12" maxlength="128" autocomplete="new-password"',
          ) +
          '<p class="hint">Compartilhe a senha inicial por um canal privado. A pessoa pode alterá-la em Minha conta.</p>',
        (data) => api("/users", { method: "POST", body: data }),
      );
      break;
    case "toggle-user": {
      const u = state.users.find((u) => u.id === id);
      formDialog(
        u.active ? "Desativar conta" : "Reativar conta",
        `<p class="hint">${esc(u.name)}: ${u.active ? "as sessões serão encerradas e novos acessos bloqueados." : "o acesso será liberado novamente."}</p>`,
        () =>
          api(`/users/${id}`, { method: "PATCH", body: { active: !u.active } }),
        "Confirmar",
      );
      break;
    }
    case "link-guardian":
      formDialog(
        "Vincular responsável",
        select(
          "Responsável",
          "guardian_id",
          state.users
            .filter((u) => u.role === "guardian")
            .map((u) => [u.id, u.name]),
        ) +
          select(
            "Aluno",
            "student_id",
            state.users
              .filter((u) => u.role === "student")
              .map((u) => [u.id, u.name]),
          ) +
          '<label class="check"><input type="checkbox" name="consent_confirmed" required>O consentimento foi coletado e conferido pela escola.</label>',
        (data) =>
          api("/guardian-links", {
            method: "POST",
            body: { ...data, consent_confirmed: true },
          }),
      );
      break;
    case "new-class":
      formDialog(
        "Nova turma",
        field("Nome da turma", "title", "text", "", "required") +
          area("Descrição", "description") +
          select(
            "Professor",
            "teacher_id",
            state.users
              .filter((u) => u.role === "teacher" && u.active)
              .map((u) => [u.id, u.name]),
          ) +
          field("Faixa etária", "age_band", "text", "14–17 anos", "required") +
          field(
            "Encontros",
            "schedule",
            "text",
            "",
            'placeholder="Sábados · 09h às 12h"',
          ) +
          select("Identidade", "color", [
            ["purple", "Tinta · Engenharia"],
            ["mint", "Folha · Exploração"],
            ["blue", "Planta · Desenvolvimento"],
            ["orange", "Sinal · Criação"],
          ]),
        (data) => api("/classrooms", { method: "POST", body: data }),
      );
      break;
    case "enrollment": {
      const enrolled = await api(`/classrooms/${id}/students`);
      const d = formDialog(
        "Matrículas da turma",
        select(
          "Aluno para matricular",
          "student_id",
          state.users
            .filter(
              (u) =>
                u.role === "student" && !enrolled.some((e) => e.id === u.id),
            )
            .map((u) => [u.id, u.name]),
        ) +
          table(
            ["Matriculado", "Ação"],
            enrolled.map((u) => [
              esc(u.name),
              `<button type="button" class="text-button" data-unenroll="${u.id}">Remover matrícula</button>`,
            ]),
          ),
        (data) =>
          api(`/classrooms/${id}/enrollments`, { method: "POST", body: data }),
        "Matricular",
      );
      $$("[data-unenroll]", d).forEach(
        (b) =>
          (b.onclick = async () => {
            try {
              await api(`/classrooms/${id}/enrollments/${b.dataset.unenroll}`, {
                method: "DELETE",
              });
              b.closest("tr").remove();
              await refresh();
              toast("Matrícula removida.");
            } catch (error) {
              toast(error.message);
            }
          }),
      );
      break;
    }
    case "edit-module": {
      const m = state.modules.find((m) => m.id === id);
      formDialog(
        "Editar módulo",
        field("Título", "title", "text", m.title, "required") +
          area("Objetivos", "description", m.description) +
          field(
            "Posição",
            "position",
            "number",
            m.position,
            'required min="1"',
          ),
        (data) =>
          api(`/modules/${id}`, {
            method: "PUT",
            body: { ...data, position: +data.position },
          }),
      );
      break;
    }
    case "edit-class": {
      const c = state.classes.find((c) => c.id === id);
      formDialog(
        "Editar turma",
        field("Nome", "title", "text", c.title, "required") +
          area("Descrição", "description", c.description) +
          field("Faixa etária", "age_band", "text", c.age_band, "required") +
          field("Encontros", "schedule", "text", c.schedule),
        (data) =>
          api(`/classrooms/${id}`, {
            method: "PUT",
            body: { ...data, teacher_id: c.teacher_id, color: c.color },
          }),
      );
      break;
    }
    case "new-module":
      formDialog(
        "Novo módulo",
        field("Título", "title", "text", "", "required") +
          area("Objetivos", "description") +
          field("Posição", "position", "number", "1", 'required min="1"'),
        (data) =>
          api(`/classrooms/${id}/modules`, {
            method: "POST",
            body: { ...data, position: +data.position },
          }),
      );
      break;
    case "new-lesson":
    case "edit-lesson": {
      const existing =
        action === "edit-lesson"
          ? state.modules.flatMap((m) => m.lessons).find((l) => l.id === id)
          : {};
      formDialog(
        existing.id ? "Editar aula" : "Nova aula",
        field("Título", "title", "text", existing.title || "", "required") +
          area("Conteúdo e roteiro", "body", existing.body || "") +
          field(
            "Vídeo (link HTTPS opcional)",
            "video_url",
            "url",
            existing.video_url || "",
          ) +
          `<div class="form-grid">${field("Duração em minutos", "minutes", "number", existing.minutes || 60, 'required min="1" max="600"')}${field("Posição", "position", "number", existing.position || 1, 'required min="1"')}</div><label class="check"><input type="checkbox" name="published" ${existing.published ? "checked" : ""}>Publicar para os alunos</label>`,
        (data) =>
          api(existing.id ? `/lessons/${id}` : `/modules/${id}/lessons`, {
            method: existing.id ? "PUT" : "POST",
            body: {
              ...data,
              minutes: +data.minutes,
              position: +data.position,
              published: !!data.published,
            },
          }),
      );
      break;
    }
    case "upload-material":
    case "upload-lesson": {
      const classId = action === "upload-lesson" ? state.currentClass : id;
      formDialog(
        "Enviar material privado",
        '<label>Arquivo do computador<input type="file" name="file" required accept=".pdf,.txt,.csv,.zip,.png,.jpg,.jpeg,.mp4,.webm,.docx,.pptx"></label><p class="hint">PDF, textos, imagens, vídeos, ZIP, Word ou PowerPoint. Limite padrão: 100 MB. Arquivos não são publicados no GitHub.</p>',
        (_, form) =>
          uploadFor(
            classId,
            action === "upload-lesson" ? id : null,
            form.file.files[0],
          ),
        "Enviar arquivo",
      );
      break;
    }
    case "new-assignment":
      assignmentForm();
      break;
    case "edit-assignment":
      assignmentForm(id);
      break;
    case "submit": {
      const a = state.assignments.find((a) => a.id === id);
      formDialog(
        "Entregar projeto",
        field(
          "Repositório HTTPS (opcional)",
          "repository_url",
          "url",
          "",
          'placeholder="https://github.com/..."',
        ) +
          '<label>Arquivo ZIP ou documento (opcional)<input name="file" type="file" accept=".zip,.pdf,.txt,.docx,.pptx"></label>' +
          area("O que você construiu?", "notes") +
          '<p class="hint">Envie um link ou arquivo. Novas entregas criam uma versão e preservam o histórico. Entregas atrasadas são identificadas para o professor.</p>',
        async (data, form) => {
          let asset = null;
          if (form.file.files[0])
            asset = await uploadFor(a.classroom_id, null, form.file.files[0]);
          return api(`/assignments/${id}/submissions`, {
            method: "POST",
            body: {
              repository_url: data.repository_url,
              notes: data.notes,
              asset_id: asset?.id || null,
            },
          });
        },
        "Enviar projeto",
      );
      break;
    }
    case "grade": {
      const s = state.submissions.find((s) => s.id === id),
        a = state.assignments.find((a) => a.id === s.assignment_id);
      formDialog(
        "Feedback para " + s.student_name,
        a.rubric
          .map((r, i) =>
            field(
              `${r.label} · peso ${r.weight}%`,
              "score" + i,
              "number",
              s.rubric_scores?.[i] ?? 80,
              'required min="0" max="100"',
            ),
          )
          .join("") +
          area(
            "Feedback e próximos passos",
            "feedback",
            s.feedback || "",
            'required minlength="3"',
          ),
        (data) =>
          api(`/submissions/${id}/grade`, {
            method: "POST",
            body: {
              scores: a.rubric.map((_, i) => +data["score" + i]),
              feedback: data.feedback,
            },
          }),
        "Publicar feedback",
      );
      break;
    }
    case "new-announcement":
      formDialog(
        "Publicar aviso",
        classSelect() +
          field("Título", "title", "text", "", "required") +
          area("Mensagem", "body", "", "required"),
        (data) =>
          api(`/classrooms/${data.classroom_id}/announcements`, {
            method: "POST",
            body: { title: data.title, body: data.body },
          }),
        "Publicar",
      );
      break;
    case "password":
      formDialog(
        "Alterar senha",
        field(
          "Senha atual",
          "current",
          "password",
          "",
          'required autocomplete="current-password"',
        ) +
          field(
            "Nova senha",
            "password",
            "password",
            "",
            'required minlength="12" maxlength="128" autocomplete="new-password"',
          ) +
          '<p class="hint">A alteração encerra todas as sessões. Entre novamente usando a nova senha.</p>',
        async (data) => {
          await api("/auth/password", { method: "POST", body: data });
          state.user = null;
          loginPage();
        },
      );
      break;
    case "report": {
      const rows = await api(`/reports/${id}`);
      const d = dialog(
        "Acompanhamento · " + className(id),
        table(
          ["Aluno", "Aulas", "Projetos", "Média", "Presença", "Conclusão"],
          rows.map((r) => [
            esc(r.name),
            r.progress + "%",
            r.submitted,
            r.average === null ? "—" : r.average + "/100",
            r.attendance === null ? "—" : r.attendance + "%",
            `<button class="text-button" data-certificate="${r.id}">Emitir certificado</button>`,
          ]),
        ) +
          `<div class="form-actions"><button class="button secondary" id="export-report">Exportar CSV</button></div>`,
      );
      $$("[data-certificate]", d).forEach(
        (b) =>
          (b.onclick = async () => {
            try {
              await api(
                `/classrooms/${id}/certificates/${b.dataset.certificate}`,
                { method: "POST" },
              );
              toast("Certificado emitido e disponível em Minha conta.");
            } catch (error) {
              toast(error.message);
            }
          }),
      );
      $("#export-report", d).onclick = () => {
        const quote = (s) =>
          '"' +
          String(s ?? "")
            .replace(/^([=+@-])/, "\t$1")
            .replace(/"/g, '""') +
          '"';
        const text =
          "\ufeff" +
          [
            ["Aluno", "Progresso", "Projetos", "Média", "Presença"],
            ...rows.map((r) => [
              r.name,
              r.progress,
              r.submitted,
              r.average,
              r.attendance,
            ]),
          ]
            .map((r) => r.map(quote).join(";"))
            .join("\r\n");
        const url = URL.createObjectURL(
          new Blob([text], { type: "text/csv;charset=utf-8" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "acompanhamento.csv";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      break;
    }
    case "attendance": {
      const students = await api(`/classrooms/${id}/students`);
      formDialog(
        "Chamada · " + className(id),
        field(
          "Data",
          "date",
          "date",
          new Date().toLocaleDateString("en-CA"),
          "required",
        ) +
          students
            .map(
              (s) =>
                `<label class="check"><input type="checkbox" name="student_${s.id}" checked>${esc(s.name)}</label>`,
            )
            .join(""),
        (data) =>
          api(`/classrooms/${id}/attendance`, {
            method: "PUT",
            body: {
              date: data.date,
              present: Object.fromEntries(
                students.map((s) => [s.id, !!data["student_" + s.id]]),
              ),
            },
          }),
      );
      break;
    }
    case "audit": {
      const rows = await api("/audit");
      dialog(
        "Histórico de auditoria",
        table(
          ["Data", "Ação", "Pessoa", "Registro"],
          rows.map((r) => [
            fullDate(r.created_at),
            esc(r.action),
            esc(
              state.users.find((u) => u.id === r.actor_id)?.name || "Sistema",
            ),
            esc(r.target.slice(0, 12)),
          ]),
        ),
      );
      break;
    }
    case "new-exam":
      newExam();
      break;
    case "edit-exam":
      newExam(id);
      break;
    case "reset-password":
      formDialog(
        "Redefinir senha",
        field(
          "Nova senha temporária",
          "password",
          "password",
          "",
          'required minlength="12" maxlength="128" autocomplete="new-password"',
        ) +
          '<p class="hint">Confirme a identidade da pessoa fora da plataforma. A alteração encerra todas as sessões. Envie a senha por um canal privado.</p>',
        (data) =>
          api(`/users/${id}/reset-password`, { method: "POST", body: data }),
      );
      break;
    case "exam-intro":
      examIntro(id);
      break;
    case "exam-results": {
      const rows = await api(`/exams/${id}/results`);
      dialog(
        "Resultados da avaliação",
        `<p class="hint">Ocorrências indicam eventos técnicos e devem ser revisadas pelo professor. Não comprovam fraude.</p>${table(
          ["Aluno", "Resultado", "Estado", "Ocorrências"],
          rows.map((r) => [
            esc(r.student_name),
            r.grade === null ? "—" : r.grade + "/100",
            r.finished_at ? "Encerrada" : "Em andamento",
            r.events.length +
              `<br><small>${r.events.map((e) => esc(e.kind)).join(", ")}</small>`,
          ]),
        )}`,
      );
      break;
    }
  }
}

function assignmentForm(id = null) {
  const a = id ? state.assignments.find((a) => a.id === id) : null;
  const localDate = a
    ? new Date(
        a.due_at * 1000 - new Date(a.due_at * 1000).getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16)
    : "";
  formDialog(
    a ? "Editar projeto" : "Novo projeto",
    (a ? "" : classSelect()) +
      field("Título", "title", "text", a?.title || "", "required") +
      area(
        "Desafio e critérios de sucesso",
        "description",
        a?.description || "",
        'required minlength="10"',
      ) +
      field("Prazo", "due", "datetime-local", localDate, "required") +
      area(
        "Rubrica (um critério:peso por linha)",
        "rubric",
        a
          ? a.rubric.map((r) => r.label + ":" + r.weight).join("\n")
          : "Funcionalidade:40\nQualidade e testes:35\nDocumentação:25",
        "required",
      ) +
      '<p class="hint">Pesos devem somar 100. Após uma entrega, os critérios são preservados.</p>',
    (data) => {
      const rubric = data.rubric
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const i = line.lastIndexOf(":");
          return { label: line.slice(0, i).trim(), weight: +line.slice(i + 1) };
        });
      return api(
        a
          ? `/assignments/${id}`
          : `/classrooms/${data.classroom_id}/assignments`,
        {
          method: a ? "PUT" : "POST",
          body: {
            title: data.title,
            description: data.description,
            due_at: Math.floor(new Date(data.due).getTime() / 1000),
            rubric,
          },
        },
      );
    },
  );
}

function newExam(id = null) {
  const existing = id ? state.exams.find((e) => e.id === id) : null;
  const d = formDialog(
    existing ? "Editar avaliação" : "Criar avaliação",
    (existing ? "" : classSelect()) +
      field("Título", "title", "text", existing?.title || "", "required") +
      field(
        "Duração em minutos",
        "duration_minutes",
        "number",
        existing?.duration_minutes || 20,
        'required min="1" max="180"',
      ) +
      `<div id="questions-editor"></div><button type="button" class="button secondary" id="add-question">＋ Questão</button><label class="check"><input type="checkbox" name="published" ${existing?.published ? "checked" : ""}>Publicar para os alunos</label><p class="hint">Cada aluno tem uma tentativa. Perguntas e alternativas são embaralhadas. A prova precisa de revisão pedagógica antes de publicar.</p>`,
    (data, form) => {
      const questions = $$(".question-editor", form).map((q) => ({
        prompt: $("[name=prompt]", q).value,
        options: $$("[name=option]", q).map((i) => i.value),
        correct: +$("[name=correct]", q).value,
      }));
      return api(
        existing ? `/exams/${id}` : `/classrooms/${data.classroom_id}/exams`,
        {
          method: existing ? "PUT" : "POST",
          body: {
            title: data.title,
            duration_minutes: +data.duration_minutes,
            published: !!data.published,
            questions,
          },
        },
      );
    },
  );
  function add(question = null) {
    const q = document.createElement("div");
    q.className = "question-editor";
    const options = question?.options || ["", "", "", ""];
    q.innerHTML =
      area(
        "Pergunta",
        "prompt",
        question?.prompt || "",
        'required minlength="3"',
      ) +
      options
        .map((value, i) =>
          field("Alternativa " + (i + 1), "option", "text", value, "required"),
        )
        .join("") +
      select(
        "Alternativa correta",
        "correct",
        options.map((_, i) => [i, String(i + 1)]),
      );
    $("[name=correct]", q).value = question?.correct ?? 0;
    $("#questions-editor", d).append(q);
  }
  $("#add-question", d).onclick = () => add();
  if (existing) existing.questions.forEach(add);
  else add();
}
function examIntro(id) {
  const exam = state.exams.find((e) => e.id === id);
  if (exam.attempt?.finished_at) {
    dialog(
      "Avaliação concluída",
      `<p class="muted">${esc(exam.title)}</p><p class="result">${exam.attempt.grade}<small>/100</small></p><p class="hint">Converse com seu professor sobre os próximos passos.</p>`,
    );
    return;
  }
  const d = dialog(
    "Antes de começar",
    `<p><strong>${esc(exam.title)}</strong></p><p class="hint">Você terá ${exam.duration_minutes} minutos e uma tentativa. O tempo continua contando se a conexão cair ou a página for fechada. Suas respostas são salvas enquanto você responde.</p><div class="help-box">A prova solicitará tela cheia. Trocas de aba, perda de foco e tentativas de copiar ou imprimir podem gerar registros para revisão do professor. O navegador não consegue impedir capturas de tela do sistema operacional ou uso de outros dispositivos.</div><p class="hint">Use um ambiente tranquilo. Se precisar de adaptação ou ajuda com acessibilidade, converse com a escola antes de iniciar.</p><div class="form-actions"><button class="button" id="start-exam">Estou pronto · iniciar</button></div>`,
  );
  $("#start-exam", d).onclick = async (e) => {
    e.target.disabled = true;
    try {
      if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen().catch(() => {});
      const attempt = await api(`/exams/${id}/start`, { method: "POST" });
      d.close();
      await examScreen(exam, attempt);
    } catch (error) {
      toast(error.message);
      e.target.disabled = false;
    }
  };
}
async function examScreen(exam, attempt) {
  if (attempt.finished_at) {
    if (document.fullscreenElement)
      await document.exitFullscreen().catch(() => {});
    await refresh();
    await navigate("exams");
    return;
  }
  examController?.abort();
  examController = new AbortController();
  const signal = examController.signal;
  document.body.classList.add("exam-active");
  $("#app").innerHTML =
    `<main class="exam-screen" id="content"><div class="exam-toolbar"><div><strong>${esc(exam.title)}</strong><div class="hint" id="save-status">Respostas sincronizadas</div></div><span class="timer" id="timer" aria-label="Tempo restante"></span></div><div id="exam-warning" role="status"></div><p class="exam-note">Uma questão de cada vez. Seu tempo é controlado pelo servidor. Trocas de contexto são registradas para revisão.</p>${attempt.questions.map((q, i) => `<section class="panel question"><p class="eyebrow">QUESTÃO ${i + 1} DE ${attempt.questions.length}</p><h3>${esc(q.prompt)}</h3>${q.options.map((o, j) => `<label class="option"><input type="radio" name="q${i}" value="${j}" ${attempt.answers[String(i)] === j ? "checked" : ""}>${esc(o)}</label>`).join("")}</section>`).join("")}<button class="button" id="finish-exam">Concluir avaliação</button></main>`;
  const offset = attempt.server_time * 1000 - Date.now();
  let queue = Promise.resolve(),
    pendingError = false,
    ending = false;
  function warning(message) {
    $("#exam-warning").className = "exam-warning";
    $("#exam-warning").textContent = message;
  }
  async function event(kind) {
    try {
      await api(`/attempts/${attempt.id}/events`, {
        method: "POST",
        body: { kind },
      });
    } catch {}
  }
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) {
        event("tab_hidden");
        warning("Uma troca de aba foi registrada. Continue a avaliação.");
      }
    },
    { signal },
  );
  window.addEventListener("blur", () => event("window_blur"), { signal });
  document.addEventListener(
    "fullscreenchange",
    () => {
      if (!document.fullscreenElement) {
        event("fullscreen_exit");
        warning("A saída de tela cheia foi registrada.");
      }
    },
    { signal },
  );
  for (const [type, kind] of [
    ["copy", "copy_attempt"],
    ["paste", "paste_attempt"],
    ["contextmenu", "context_menu"],
  ])
    document.addEventListener(
      type,
      (e) => {
        e.preventDefault();
        event(kind);
      },
      { signal },
    );
  document.addEventListener(
    "keydown",
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        event("print_shortcut");
        warning("A tentativa de impressão foi registrada.");
      }
    },
    { signal },
  );
  window.addEventListener(
    "beforeunload",
    (e) => {
      e.preventDefault();
      e.returnValue = "";
    },
    { signal },
  );
  $$(".question input").forEach(
    (input) =>
      (input.onchange = () => {
        const index = input.name.slice(1);
        attempt.answers[index] = +input.value;
        $("#save-status").textContent = "Salvando…";
        queue = queue.then(async () => {
          try {
            await api(`/attempts/${attempt.id}/answers`, {
              method: "PUT",
              body: { answers: { ...attempt.answers } },
            });
            pendingError = false;
            $("#save-status").textContent = "Respostas sincronizadas";
          } catch (error) {
            pendingError = true;
            $("#save-status").textContent =
              "Falha ao salvar. Verifique sua conexão.";
            warning(error.message);
          }
        });
      }),
  );
  async function end(force = false) {
    if (ending) return;
    ending = true;
    $("#finish-exam").disabled = true;
    try {
      await queue;
      if (pendingError && !force) {
        await api(`/attempts/${attempt.id}/answers`, {
          method: "PUT",
          body: { answers: attempt.answers },
        });
      }
      const result = await api(`/attempts/${attempt.id}/finish`, {
        method: "POST",
      });
      clearInterval(interval);
      examController.abort();
      document.body.classList.remove("exam-active");
      if (document.fullscreenElement)
        await document.exitFullscreen().catch(() => {});
      await refresh();
      shell();
      await navigate("exams");
      dialog(
        "Você concluiu a avaliação!",
        `<p class="muted">${esc(exam.title)}</p><p class="result">${result.grade}<small>/100</small></p><p class="hint">Converse com seu professor sobre os próximos passos.</p>`,
      );
    } catch (error) {
      toast(error.message);
      ending = false;
      $("#finish-exam").disabled = false;
    }
  }
  $("#finish-exam").onclick = () => {
    const d = dialog(
      "Concluir avaliação?",
      `<p class="hint">${Object.keys(attempt.answers).length} de ${attempt.questions.length} questões respondidas. Depois de concluir, você não poderá alterar as respostas.</p><button class="button" id="confirm-finish">Concluir e enviar</button>`,
    );
    $("#confirm-finish", d).onclick = () => {
      d.close();
      end();
    };
  };
  const tick = () => {
    const remaining = Math.max(
      0,
      Math.floor((attempt.deadline * 1000 - Date.now() - offset) / 1000),
    );
    $("#timer").textContent =
      String(Math.floor(remaining / 60)).padStart(2, "0") +
      ":" +
      String(remaining % 60).padStart(2, "0");
    if (!remaining) end(true);
  };
  const interval = setInterval(tick, 1000);
  tick();
}
async function start() {
  try {
    const result = await api("/auth/me");
    Object.assign(state, result);
    await refresh();
    shell();
    navigate("home");
  } catch {
    loginPage();
  }
}
start();
