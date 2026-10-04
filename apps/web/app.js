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
paths.history = "M3 12a9 9 0 1 0 3-7 M3 3v5h5 M12 7v5l3 2";
paths.review = "M4 4h16v16H4z M8 8h8m-8 4h4m-4 4h8";
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
  overview: { courses: [], history: [] },
  view: null,
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
const empty = (text, action = "") =>
  `<div class="empty"><span class="empty-mark" aria-hidden="true">{ }</span><p>${esc(text)}</p>${action}</div>`;
const progressBar = (value, label) =>
  `<div class="learning-progress"><div><span>${esc(label)}</span><strong>${value}%</strong></div><progress max="100" value="${value}" aria-label="${esc(label)}">${value}%</progress></div>`;
const courseSummary = (id) => state.overview.courses.find((c) => c.id === id);
const latestSubmissions = () => {
  const latest = new Map();
  for (const s of state.submissions) {
    const key = s.assignment_id + ":" + s.student_id;
    if (!latest.has(key) || latest.get(key).version < s.version)
      latest.set(key, s);
  }
  return [...latest.values()];
};
const deadlineLabel = (a) => {
  const days = Math.ceil((a.due_at * 1000 - Date.now()) / 86400000);
  return days < 0
    ? "Prazo encerrado"
    : days === 0
      ? "Entrega hoje"
      : days === 1
        ? "Entrega amanhã"
        : `${days} dias para entregar`;
};
function setRoute(value) {
  const hash = "#" + value;
  if (location.hash !== hash) history.pushState(null, "", hash);
}
function setActive(page) {
  state.page = page;
  $$(".nav [data-nav]").forEach((b) => {
    b.classList.toggle("active", b.dataset.nav === page);
    if (b.dataset.nav === page) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  closeMenu();
}
function focusContent() {
  $("#content").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "instant" });
}
async function openRoute() {
  const [page, cid, lid] = location.hash.slice(1).split("/");
  if (page === "course" && cid) {
    await classDetail(cid, false);
    if (lid) await lessonView(lid, false);
  } else if (page === "student" && cid && lid)
    await handleAction("student-progress", cid + ":" + lid);
  else if (page === "project" && cid) await assignmentView(cid, false);
  else await navigate(page || "home", false);
}
window.addEventListener("popstate", () => {
  if (state.user) openRoute().catch((e) => toast(e.message));
});
const button = (text, action, id = "", secondary = false) =>
  `<button class="button ${secondary ? "secondary" : ""}" data-action="${action}" data-id="${esc(id)}">${esc(text)}</button>`;
function art() {
  return `<div class="hero-art" aria-hidden="true"><div class="lab-diagram"><span class="diagram-caption">PROCESSO / 001</span><div class="diagram-flow"><span>?</span><i></i><span>{ }</span><i></i><span>↗</span></div><div class="diagram-labels"><span>PERGUNTAR</span><span>CONSTRUIR</span><span>EVOLUIR</span></div><div class="diagram-footer"><span>IDEIAS EM MOVIMENTO</span><span>CC—LAB</span></div></div></div>`;
}
const brandMark = `<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M16 9 5 20l11 11M24 9l11 11-11 11M23 5l-6 30" stroke="currentColor" stroke-width="3"/></svg></span>`;
function loginPage() {
  document.body.classList.remove("menu-open");
  $("#app").innerHTML =
    `<main class="login" id="content" tabindex="-1"><section class="login-story"><div class="brand">${brandMark}CodeCampus</div><h1>O mundo se<br>constrói com<br><em>boas perguntas.</em></h1><p>Um lugar para experimentar, escrever código e aprender com o que você constrói. Da primeira descoberta ao primeiro projeto de verdade.</p>${art()}</section><section class="login-main"><div class="login-card"><p class="eyebrow">ACESSO AO CAMPUS / 01</p><h2>Vamos começar.</h2><p class="muted">Alunos, professores e responsáveis: seu trabalho começa aqui.</p><form id="login-form"><label>E-mail<input type="email" name="email" required autocomplete="username" placeholder="voce@escola.com" aria-describedby="login-error"></label><label>Senha<input type="password" name="password" required autocomplete="current-password" minlength="1" maxlength="128" placeholder="Sua senha" aria-describedby="login-error"></label><p class="form-error" id="login-error" role="alert"></p><button class="button" type="submit">Entrar no campus ${icon("arrow")}</button></form><p class="login-foot"><a href="/">Conheça as aulas do CodeCampus ↗</a><br>Sua conta é criada pela escola. Para recuperar o acesso, entre em contato com a administração.<br>Materiais e entregas são privados.</p></div></section></main>`;
  $("#login-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submit = $("button", form);
    submit.disabled = true;
    $(".form-error", form).textContent = "";
    try {
      const result = await api("/auth/login", {
        method: "POST",
        body: Object.fromEntries(new FormData(form)),
      });
      Object.assign(state, result);
      await refresh();
      shell();
      await openRoute();
    } catch (error) {
      $(".form-error", form).textContent = error.message;
      $(".form-error", form).tabIndex = -1;
      $(".form-error", form).focus();
    } finally {
      submit.disabled = false;
    }
  };
}
async function refresh() {
  const [
    classes,
    assignments,
    submissions,
    announcements,
    exams,
    dashboard,
    overview,
  ] = await Promise.all(
    [
      "/classrooms",
      "/assignments",
      "/submissions",
      "/announcements",
      "/exams",
      "/dashboard",
      "/learning-overview",
    ].map((p) => api(p)),
  );
  Object.assign(state, {
    classes,
    assignments,
    submissions,
    announcements,
    exams,
    dashboard,
    overview,
  });
  if (staff()) state.users = await api("/users");
  const badge = $('.nav [data-nav="projects"] .badge');
  if (badge)
    badge.textContent = staff()
      ? latestSubmissions().filter((s) => s.grade === null).length
      : state.assignments.filter(
          (a) => !state.submissions.some((s) => s.assignment_id === a.id),
        ).length;
  const sideProgress = $(".side-note .learning-progress");
  if (sideProgress)
    sideProgress.outerHTML = progressBar(
      state.dashboard.progress,
      staff() ? "Conclusão das aulas" : "Aulas concluídas",
    );
}
function shell() {
  const nav = [
    ["home", staff() ? "Painel de ensino" : "Minha jornada"],
    ["classes", "Minhas turmas"],
    ["projects", "Projetos"],
    ["exams", "Avaliações"],
    ["announcements", "Mural"],
    ...(!staff() ? [["notifications", "Avisos e feedback"]] : []),
    ...(staff()
      ? [["review", "Entregas e feedback"]]
      : [["history", "Histórico de aprendizagem"]]),
    ...(staff() ? [["reports", "Acompanhamento"]] : []),
    ...(state.user.role === "admin" ? [["users", "Pessoas e acessos"]] : []),
    ["settings", "Minha conta"],
  ];
  $("#app").innerHTML =
    `<div class="shell"><aside class="sidebar" id="campus-navigation"><a class="brand" href="#home" data-nav="home">${brandMark}<span>CodeCampus<small>APRENDER CONSTRUINDO</small></span></a><div class="nav-label">${staff() ? "ESPAÇO DO PROFESSOR" : state.user.role === "guardian" ? "ESPAÇO DA FAMÍLIA" : "SEU ESPAÇO DE APRENDIZAGEM"}</div><nav class="nav" aria-label="Menu principal">${nav.map(([key, label]) => `<button data-nav="${key}">${icon(key)}${label}${key === "projects" ? `<span class="badge">${staff() ? latestSubmissions().filter((s) => s.grade === null).length : state.assignments.filter((a) => !state.submissions.some((s) => s.assignment_id === a.id)).length}</span>` : ""}</button>`).join("")}</nav><div class="side-note"><p class="eyebrow">${staff() ? "SUA OFICINA" : "SUA JORNADA"}</p><strong>${staff() ? "Ensinar. Acompanhar. Evoluir." : "Uma descoberta por dia."}</strong>${progressBar(state.dashboard.progress, staff() ? "Conclusão das aulas" : "Aulas concluídas")}<a href="/" class="campus-public-link">Conhecer o CodeCampus ↗</a></div><div class="side-bottom nav"><button data-action="logout">${icon("logout")}Sair do campus</button></div></aside><button class="menu-scrim" data-action="close-menu" aria-label="Fechar menu" tabindex="-1"></button><div class="main"><header class="topbar"><button class="icon-button mobile-menu" data-action="menu" aria-label="Abrir menu" aria-controls="campus-navigation" aria-expanded="false">${icon("menu")}</button><div class="breadcrumb">Seu campus <span>/</span> <strong id="breadcrumb">Visão geral</strong></div><div class="top-actions"><span class="date">${new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}</span><button class="icon-button notification-button" data-nav="notifications" aria-label="Ver avisos">${icon("bell")}</button><div class="profile"><div class="avatar">${esc(
      state.user.name
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join(""),
    )}</div><div><strong>${esc(state.user.name)}</strong><small>${roles[state.user.role]}</small></div></div></div></header><main class="content" id="content" tabindex="-1"></main></div></div>`;
  $("#app").onclick = async (e) => {
    const nav = e.target.closest("[data-nav]");
    if (nav) {
      e.preventDefault();
      await navigate(nav.dataset.nav);
      return;
    }
    const action = e.target.closest("[data-action]");
    if (action) {
      action.disabled = true;
      try {
        await handleAction(action.dataset.action, action.dataset.id);
      } catch (error) {
        toast(error.message);
      } finally {
        if (action.isConnected) action.disabled = false;
      }
    }
  };
}
function closeMenu() {
  document.body.classList.remove("menu-open");
  $(".sidebar")?.classList.remove("open");
  const toggle = $(".mobile-menu");
  toggle?.setAttribute("aria-expanded", "false");
  toggle?.setAttribute("aria-label", "Abrir menu");
}
document.addEventListener("keydown", (event) => {
  const sidebar = $(".sidebar.open");
  if (sidebar && event.key === "Tab") {
    const targets = $$("button, a[href]", sidebar).filter((el) => !el.disabled);
    const first = targets[0],
      last = targets.at(-1);
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        !sidebar.contains(document.activeElement))
    ) {
      event.preventDefault();
      last?.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last ||
        !sidebar.contains(document.activeElement))
    ) {
      event.preventDefault();
      first?.focus();
    }
  }

  if (event.key === "Escape" && $(".sidebar.open")) {
    closeMenu();
    $(".mobile-menu")?.focus();
  }
});
async function navigate(page, updateRoute = true) {
  const token = ++navigation;
  state.view = null;
  if (updateRoute) setRoute(page);
  state.page = page;
  const labels = {
    home: staff() ? "Painel de ensino" : "Minha jornada",
    review: "Entregas e feedback",
    history: "Histórico de aprendizagem",
    notifications: "Avisos e feedback",
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
  $("#content").innerHTML =
    '<div class="loading-state" role="status"><span class="loading-line"></span><span class="loading-line short"></span><p>Preparando seu espaço…</p></div>';
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
        history: historyPage,
        review: reviewPage,
        notifications: notificationsPage,
      }[page] || homePage
    )();
    if (token !== navigation) return;
    $("#content").innerHTML = html;
    $("#content").focus({ preventScroll: true });
    if (page === "classes" || page === "projects" || page === "review")
      wireLibraryFilters();
    if (page === "users")
      $("#people-search").oninput = (e) =>
        $$("[data-person]").forEach(
          (r) =>
            (r.hidden = !r.textContent
              .toLowerCase()
              .includes(e.target.value.toLowerCase())),
        );
  } catch (error) {
    if (state.user && token === navigation)
      $("#content").innerHTML = empty(
        error.message,
        button("Tentar novamente", "retry", page, true),
      );
  }
}
function heading(title, subtitle, action = "") {
  return `<div class="page-heading"><div><p class="eyebrow">CODECAMPUS / ${staff() ? "ENSINO EM MOVIMENTO" : "APRENDER CONSTRUINDO"}</p><h1>${esc(title)}</h1><p class="muted">${esc(subtitle)}</p></div>${action}</div>`;
}
function classCard(c) {
  const summary = courseSummary(c.id),
    percent = summary?.progress || 0;
  return `<article class="class-card" data-library-item data-search="${esc(c.title.toLowerCase())}" data-status="${percent === 100 ? "completed" : "active"}"><div class="class-art ${esc(c.color)}"><div class="track">CC / ${esc(c.age_band)}<span>${c.color === "purple" ? "Engenharia aplicada" : c.color === "mint" ? "Primeiras descobertas" : c.color === "orange" ? "Ideias em ação" : "Laboratório de código"}</span></div><span class="code-symbol" aria-hidden="true">${c.color === "mint" ? "01" : c.color === "blue" ? "02" : c.color === "orange" ? "↗" : "03"}</span></div><div class="class-body"><div class="course-kicker"><span class="tag">${esc(c.age_band)}</span><span class="tiny muted">${c.modules} módulos · ${summary?.lessons || 0} aulas</span></div><h3>${esc(c.title)}</h3><p>${esc(c.description)}</p>${progressBar(percent, staff() ? "Conclusão entre alunos" : state.user.role === "guardian" ? "Conclusão dos alunos vinculados" : `${summary?.completed || 0} de ${summary?.lessons || 0} aulas concluídas`)}<div class="class-foot"><span>${staff() ? `${c.students} alunos · ${summary?.drafts || 0} rascunhos` : esc(c.teacher_name)}</span><button class="text-button" data-action="class" data-id="${c.id}">Acessar turma →</button></div>${!staff() && summary?.next_lesson ? `<button class="button secondary course-continue" data-action="continue-course" data-id="${c.id}">Continuar aprendendo ${icon("arrow")}</button>` : ""}</div></article>`;
}
function projectRow(a) {
  const own = latestSubmissions().find((s) => s.assignment_id === a.id),
    overdue = a.due_at * 1000 < Date.now();
  return `<div class="list-row"><div class="list-icon">${icon("projects")}</div><div class="list-copy"><strong>${esc(a.title)}</strong><small>${esc(className(a.classroom_id))} · ${date(a.due_at)}</small></div><span class="tag ${own ? "mint" : overdue ? "danger" : "orange"}">${own ? (own.grade === null ? "Em avaliação" : "Feedback disponível") : deadlineLabel(a)}</span><button class="text-button" data-action="assignment" data-id="${a.id}">Abrir →</button></div>`;
}
function activityItems(limit = 4) {
  const records = [
    ...state.overview.history.map((h) => ({
      time: h.completed_at,
      title: h.title,
      detail: staff()
        ? `${h.student_name} concluiu uma aula`
        : "Aula concluída",
      action: staff() ? "reports" : "history",
      nav: true,
    })),
    ...state.submissions.map((s) => ({
      time: s.submitted_at,
      title:
        state.assignments.find((a) => a.id === s.assignment_id)?.title ||
        "Projeto",
      detail: `${staff() ? s.student_name + " · " : ""}Entrega · versão ${s.version}`,
      action: "assignment",
      id: s.assignment_id,
    })),
    ...state.announcements.map((a) => ({
      time: a.created_at,
      title: a.title,
      detail: "Aviso na turma",
      action: "announcements",
      nav: true,
    })),
  ]
    .sort((a, b) => b.time - a.time)
    .slice(0, limit);
  return (
    records
      .map(
        (r) =>
          `<div class="activity-item"><span class="activity-marker" aria-hidden="true"></span><div><small>${esc(r.detail)} · ${date(r.time)}</small><button class="text-button" ${r.nav ? `data-nav="${r.action}"` : `data-action="${r.action}" data-id="${r.id}"`}>${esc(r.title)}</button></div></div>`,
      )
      .join("") ||
    '<p class="hint">As aulas concluídas, entregas e avisos aparecerão aqui.</p>'
  );
}
function homePage() {
  const d = state.dashboard,
    name = state.user.name.split(" ")[0],
    student = state.user.role === "student",
    teaching = staff();
  const latest = latestSubmissions(),
    pending = latest.filter((s) => s.grade === null),
    todo = state.assignments
      .filter((a) => !latest.some((s) => s.assignment_id === a.id))
      .sort((a, b) => a.due_at - b.due_at);
  const lastClass = state.overview.history[0]?.classroom_id,
    next =
      state.overview.courses.find((c) => c.id === lastClass && c.next_lesson) ||
      state.overview.courses.find((c) => c.next_lesson);
  const hero = teaching
    ? `<section class="momentum teaching-momentum"><div><p class="eyebrow">SUA PRÓXIMA AÇÃO</p><h2>${pending.length ? `${pending.length} entrega${pending.length === 1 ? "" : "s"} esperando seu olhar.` : "O próximo passo começa com você."}</h2><p>${pending.length ? "Feedback claro transforma uma entrega em uma nova descoberta. Comece pelos projetos aguardando avaliação." : "Organize as aulas, acompanhe os alunos e abra espaço para a próxima descoberta."}</p><div class="chips">${pending.length ? '<button class="button" data-nav="review">Revisar entregas ' + icon("arrow") + "</button>" : '<button class="button" data-nav="classes">Organizar minhas turmas ' + icon("arrow") + "</button>"}${button("Publicar aviso", "new-announcement", "", true)}</div></div><div class="momentum-index"><span class="eyebrow">EM SUAS TURMAS</span><strong>${d.students}</strong><span>alunos matriculados</span><small>${state.overview.courses.reduce((n, c) => n + c.drafts, 0)} aulas em rascunho</small></div></section>`
    : `<section class="momentum"><div><p class="eyebrow">${next ? "CONTINUE DE ONDE SUA JORNADA SEGUE" : "SUA OFICINA ESTÁ ABERTA"}</p><h2>${next ? esc(next.next_lesson.title) : student ? (d.lessons && d.progress === 100 ? "Você concluiu suas aulas. Celebre e continue criando." : "Toda descoberta começa com uma boa pergunta.") : "Acompanhe cada nova descoberta."}</h2><p>${next ? `${esc(next.title)} · ${esc(next.next_lesson.module_title)}` : student ? "Explore suas turmas e transforme o que aprendeu em projetos." : "Aulas, entregas e feedback dos alunos vinculados à sua conta, em um só lugar."}</p>${next ? `<div class="chips"><button class="button" data-action="continue-course" data-id="${next.id}">Continuar aprendendo ${icon("arrow")}</button><span class="momentum-meta">${next.next_lesson.minutes} min · Próxima aula</span></div>` : '<button class="button" data-nav="classes">Explorar minhas turmas ' + icon("arrow") + "</button>"}</div><div class="momentum-index"><span class="eyebrow">PASSO A PASSO</span><strong>${d.progress}<small>%</small></strong><span>${d.completed} conclusões registradas</span>${progressBar(d.progress, "Sua aprendizagem")}</div></section>`;
  const metrics = teaching
    ? [
        [state.classes.length, "Turmas sob sua gestão"],
        [d.lessons, "Aulas publicadas"],
        [pending.length, "Entregas para avaliar"],
        [d.progress + "%", "Conclusão entre alunos"],
      ]
    : [
        [state.classes.length, "Turmas na sua jornada"],
        [d.completed, "Aulas concluídas"],
        [todo.length, "Projetos para entregar"],
        [
          latest.filter((s) => s.grade !== null).length,
          "Projetos com feedback",
        ],
      ];
  return (
    heading(
      teaching ? `Sua oficina, ${name}.` : `Bom ter você aqui, ${name}.`,
      teaching
        ? "Uma visão clara para cuidar de cada jornada."
        : "Seu próximo passo está logo aqui.",
      `<span class="pill"><span class="status-dot"></span>${teaching ? "Espaço do professor" : "Seu campus"}</span>`,
    ) +
    hero +
    `<div class="stats">${metrics.map(([n, label], i) => `<div class="stat"><span class="metric-index">0${i + 1}</span><div><strong>${n}</strong><span>${label}</span></div></div>`).join("")}</div><div class="dashboard-grid"><div><div class="section-title"><div><p class="eyebrow">${teaching ? "ENSINAR & ACOMPANHAR" : "SUAS TRILHAS"}</p><h2>${teaching ? "Turmas em movimento" : "Aprendizado que ganha forma"}</h2></div><button class="text-button" data-nav="classes">Ver todas →</button></div><div class="class-grid">${state.classes.slice(0, 2).map(classCard).join("") || empty("Nenhuma turma vinculada ainda. A administração pode ajudar você a começar.")}</div><section class="project-list"><div class="section-title"><div><p class="eyebrow">${teaching ? "OLHAR PARA CADA ENTREGA" : "DO CONCEITO À PRÁTICA"}</p><h2>${teaching ? "Projetos e próximos prazos" : "Seu próximo projeto"}</h2></div><button class="text-button" data-nav="projects">Ver projetos →</button></div>${(teaching ? [...state.assignments].sort((a, b) => a.due_at - b.due_at) : todo).slice(0, 3).map(projectRow).join("") || empty(teaching ? "Crie o primeiro projeto para sua turma." : "Nenhum projeto aguardando entrega. Confira seus feedbacks e continue aprendendo.", teaching ? button("Novo projeto", "new-assignment") : '<button class="button secondary" data-nav="projects">Ver meus projetos</button>')}</section></div><aside class="right-rail"><section class="panel rail-section"><p class="eyebrow">CADERNO DE BORDO</p><h2>Movimento recente</h2>${activityItems()}</section><section class="panel rail-section"><p class="eyebrow">TEMPO PARA APRENDER</p><h2>Encontros da turma</h2>${
      state.classes
        .slice(0, 3)
        .map(
          (c) =>
            `<div class="agenda-item"><div class="agenda-copy"><strong>${esc(c.title)}</strong><span>${esc(c.schedule || "Horário a combinar")}</span></div></div>`,
        )
        .join("") ||
      '<p class="hint">Os horários aparecerão quando uma turma for vinculada.</p>'
    }</section><section class="panel rail-section challenge"><p class="eyebrow">${teaching ? "CUIDADO COM A JORNADA" : "UM PASSO DE CADA VEZ"}</p><h3>${teaching ? "Como a turma está evoluindo?" : "Seu trabalho merece uma revisão."}</h3><p>${teaching ? "Veja o progresso individual, as entregas e a presença de cada aluno." : "Leia os feedbacks recebidos e transforme uma primeira versão em algo melhor."}</p><button class="text-button" data-nav="${teaching ? "reports" : "projects"}">${teaching ? "Acompanhar alunos" : "Ver feedback dos projetos"} →</button></section></aside></div><footer class="footer"><span>CodeCampus · Aprender construindo</span><span>Perguntar. Construir. Evoluir.</span></footer>`
  );
}
function libraryFilters(kind) {
  return `<div class="library-toolbar"><label class="library-search">${kind === "courses" ? "Buscar turma" : kind === "review" ? "Buscar aluno ou projeto" : "Buscar projeto"}<input id="library-search" type="search" placeholder="${kind === "review" ? "Nome do aluno ou projeto…" : "Digite um título…"}"></label><label>Status<select id="library-status"><option value="all">Todos</option>${kind === "courses" ? '<option value="active">Em andamento</option><option value="completed">Concluídos</option>' : kind === "review" ? '<option value="pending">Aguardando avaliação</option><option value="graded">Com feedback</option>' : '<option value="todo">Para entregar</option><option value="pending">Em avaliação</option><option value="graded">Com feedback</option>'}</select></label><span id="library-count" role="status" aria-live="polite"></span></div>`;
}
function wireLibraryFilters() {
  const search = $("#library-search"),
    filter = $("#library-status");
  if (!search) return;
  const update = () => {
    let count = 0;
    for (const item of $$("[data-library-item]")) {
      const match =
        item.dataset.search.includes(
          search.value.trim().toLocaleLowerCase("pt-BR"),
        ) &&
        (filter.value === "all" || item.dataset.status === filter.value);
      item.hidden = !match;
      if (match) count++;
    }
    $("#library-count").textContent =
      `${count} resultado${count === 1 ? "" : "s"}`;
    $("#library-empty").hidden = count > 0;
  };
  search.oninput = update;
  filter.onchange = update;
  update();
}
function classesPage() {
  return (
    heading(
      "Minhas turmas",
      staff()
        ? "Organize o conteúdo e acompanhe cada etapa do aprendizado."
        : "Encontre seu lugar na jornada e siga para a próxima aula.",
      staff() ? button("＋ Nova turma", "new-class") : "",
    ) +
    libraryFilters("courses") +
    `<div class="cards">${state.classes.map(classCard).join("")}</div><div id="library-empty" hidden>${empty("Nenhuma turma encontrada. Tente outro título ou status.")}</div>`
  );
}
function projectsPage() {
  return (
    heading(
      "Projetos",
      "Seu espaço para construir, entregar e evoluir com feedback.",
      staff() ? button("＋ Novo projeto", "new-assignment") : "",
    ) +
    libraryFilters("projects") +
    `<div class="cards">${state.assignments
      .map((a) => {
        const own = latestSubmissions().find((s) => s.assignment_id === a.id),
          status = own ? (own.grade === null ? "pending" : "graded") : "todo";
        return `<article class="panel assignment-card" data-library-item data-search="${esc((a.title + " " + className(a.classroom_id)).toLowerCase())}" data-status="${status}"><div class="course-kicker"><span class="tag">${esc(className(a.classroom_id))}</span>${icon("projects")}</div><h3>${esc(a.title)}</h3><p class="muted">${esc(a.description.slice(0, 140))}</p><div class="assignment-deadline"><span class="eyebrow">PRAZO DE ENTREGA</span><strong>${fullDate(a.due_at)}</strong></div><span class="tag ${own ? "mint" : a.due_at * 1000 < Date.now() ? "danger" : "orange"}">${own ? (own.grade === null ? "Entregue · versão " + own.version : "Avaliado · " + own.grade + "/100") : deadlineLabel(a)}</span><div class="assignment-action">${button("Ver projeto →", "assignment", a.id)}</div></article>`;
      })
      .join(
        "",
      )}</div><div id="library-empty" hidden>${empty("Nenhum projeto encontrado para este filtro.")}</div>`
  );
}
function historyPage() {
  return (
    heading(
      "Histórico de aprendizagem",
      "Cada aula concluída é um passo que fica registrado.",
    ) +
    `<section class="history-summary">${progressBar(state.dashboard.progress, "Conclusão das aulas")}<p class="hint">A conclusão é registrada por você; não representa tempo de vídeo assistido.</p></section><div class="history-list">${state.overview.history.map((h) => `<article class="history-entry"><span class="history-check">${icon("check")}</span><div><small>${date(h.completed_at)} · ${esc(h.classroom_title)}</small><h3>${esc(h.title)}</h3><p>${esc(h.module_title)}${state.user.role === "guardian" ? " · " + esc(h.student_name) : ""}</p></div><button class="button secondary" data-action="revisit" data-id="${h.classroom_id}:${h.lesson_id}">Revisitar aula</button></article>`).join("") || empty("Sua primeira conclusão vai aparecer aqui. Escolha uma aula para começar.", '<button class="button" data-nav="classes">Explorar minhas turmas</button>')}</div>`
  );
}
function reviewPage() {
  if (!staff()) return empty("Esta área é exclusiva da equipe.");
  const rows = latestSubmissions();
  return (
    heading(
      "Entregas e feedback",
      "Uma fila organizada para orientar o próximo passo de cada aluno.",
    ) +
    libraryFilters("review") +
    `<div class="review-list">${rows
      .map((s) => {
        const a = state.assignments.find((a) => a.id === s.assignment_id);
        return `<article class="review-row" data-library-item data-search="${esc((s.student_name + " " + a.title).toLowerCase())}" data-status="${s.grade === null ? "pending" : "graded"}"><div class="avatar">${esc(s.student_name.slice(0, 1))}</div><div class="review-copy"><strong>${esc(s.student_name)}</strong><p>${esc(a.title)}</p><small>${esc(className(a.classroom_id))} · v${s.version} · ${date(s.submitted_at)}</small></div><span class="tag ${s.grade === null ? "orange" : "mint"}">${s.grade === null ? "Aguardando avaliação" : s.grade + "/100"}</span><button class="button secondary" data-action="assignment" data-id="${a.id}">Revisar projeto</button></article>`;
      })
      .join(
        "",
      )}</div><div id="library-empty" hidden>${empty("Nenhuma entrega encontrada. Os projetos enviados pelos alunos aparecerão aqui.")}</div>`
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
function notificationsPage() {
  const feedback = latestSubmissions().filter((s) => s.grade !== null);
  const todo = state.assignments.filter(
    (a) => !latestSubmissions().some((s) => s.assignment_id === a.id),
  );
  return (
    heading(
      "Avisos e feedback",
      "Prazos, orientações e mensagens relevantes para sua jornada.",
    ) +
    `<div class="notification-layout"><section><div class="section-title"><h2>Feedback dos projetos</h2><span class="tag">${feedback.length} projetos</span></div>${
      feedback
        .map((s) => {
          const a = state.assignments.find((a) => a.id === s.assignment_id);
          return `<article class="panel feedback-notification"><span class="eyebrow">ORIENTAÇÃO PARA A PRÓXIMA VERSÃO</span><h3>${esc(a.title)}</h3><p>${esc(s.feedback)}</p><div class="chips"><span class="tag mint">${s.grade}/100</span>${button("Ver projeto →", "assignment", a.id, true)}</div></article>`;
        })
        .join("") ||
      empty(
        "Os feedbacks aparecerão depois que seu professor avaliar uma entrega.",
      )
    }<div class="section-title"><h2>Mensagens da turma</h2></div>${state.announcements.map((a) => `<article class="panel notice-full"><span class="tag">${esc(className(a.classroom_id))}</span><h3>${esc(a.title)}</h3><p>${esc(a.body)}</p><small class="muted">${esc(a.author_name)} · ${date(a.created_at)}</small></article>`).join("") || empty("Nenhum aviso publicado por enquanto.")}</section><aside><section class="panel rail-section"><p class="eyebrow">PARA SE ORGANIZAR</p><h2>Projetos para entregar</h2>${
      todo
        .sort((a, b) => a.due_at - b.due_at)
        .map(projectRow)
        .join("") ||
      '<p class="hint">Suas entregas estão em dia. Continue pelas aulas ou confira seus feedbacks.</p>'
    }</section></aside></div>`
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
    heading("Minha conta", "Seu acesso, sua jornada e suas conquistas.") +
    `<div class="account-layout"><section class="panel account-profile"><span class="eyebrow">SEU PERFIL NO CAMPUS</span><div class="account-identity"><div class="avatar">${esc(
      state.user.name
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join(""),
    )}</div><div><h2>${esc(state.user.name)}</h2><p class="muted">${esc(state.user.email)}</p><span class="tag">${roles[state.user.role]}</span></div></div><div class="account-security"><h3>Acesso individual e protegido</h3><p class="hint">Use uma senha exclusiva. Alterá-la encerra as sessões abertas em outros dispositivos.</p>${button("Alterar senha", "password", "", true)}</div>${links.length ? `<div class="account-security"><h3>Alunos vinculados</h3>${links.map((l) => `<p>${esc(l.student_name)}<small class="muted"> · vínculo registrado em ${date(l.consent_at)}</small></p>`).join("")}</div>` : ""}</section><div><section class="panel"><p class="eyebrow">APRENDIZADO QUE FICA</p><h2>Certificados</h2>${certificates.map((c) => `<a class="certificate-link" href="/api/certificates/${c.id}/document" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">↗</span><span><strong>${esc(c.classroom_title)}</strong><small>${esc(c.student_name)}</small></span></a>`).join("") || empty("Seu certificado aparece após a conclusão das aulas, aprovação nos projetos e avaliações e emissão pela escola.", '<button class="button secondary" data-nav="classes">Ver minhas turmas</button>')}</section><section class="panel"><p class="eyebrow">CUIDADO COM O QUE IMPORTA</p><h2>Privacidade e proteção</h2><p class="hint">Materiais e projetos exigem acesso à turma. Contas são individuais. Nunca envie senhas, chaves de API ou dados pessoais nos projetos.</p><p class="hint">Para corrigir seus dados, recuperar acesso ou solicitar exclusão, entre em contato com a administração da escola.</p><a class="text-button" href="/">Conhecer o CodeCampus ↗</a></section></div></div>`
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
  d.onclick = async (event) => {
    const b = event.target.closest("[data-action]");
    if (b) {
      try {
        await handleAction(b.dataset.action, b.dataset.id);
      } catch (error) {
        toast(error.message);
      }
    }
  };
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
      view = state.view ? { ...state.view } : null;
    submit.disabled = true;
    try {
      await onSubmit(Object.fromEntries(new FormData(form)), form);
      if (!state.user) {
        d.close();
        toast("Senha alterada. Entre novamente.");
        return;
      }
      await refresh();
      if (!view) await navigate(state.page);
      if (view?.kind === "course") await classDetail(view.classId);
      if (view?.kind === "lesson") {
        await classDetail(view.classId);
        await lessonView(view.id);
      }
      if (view?.kind === "project") await assignmentView(view.id);
      d.close();
      toast("Tudo certo. Alteração salva.");
    } catch (error) {
      $(".form-error", form).textContent = error.message;
      $(".form-error", form).tabIndex = -1;
      $(".form-error", form).focus();
    } finally {
      submit.disabled = false;
    }
  };
  return d;
}
function table(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
async function classDetail(id, updateRoute = true) {
  const token = ++navigation,
    c = state.classes.find((c) => c.id === id);
  if (!c) throw new Error("Esta turma não está disponível para sua conta.");
  setActive("classes");
  state.currentClass = id;
  state.view = { kind: "course", classId: id };
  if (updateRoute) setRoute("course/" + id);
  $("#breadcrumb").textContent = c.title;
  $("#content").innerHTML =
    '<div class="loading-state" role="status"><span class="loading-line"></span><p>Organizando sua trilha…</p></div>';
  const [modules, assets] = await Promise.all([
    api(`/classrooms/${id}/modules`),
    api(`/classrooms/${id}/assets`),
  ]);
  if (token !== navigation) return;
  state.modules = modules;
  state.assets = assets;
  const summary = courseSummary(id),
    lessons = modules.flatMap((m) => m.lessons),
    student = state.user.role === "student";
  const published = lessons.filter((l) => l.published),
    completed = published.filter((l) => l.completed).length;
  const percent = student
    ? published.length
      ? Math.round((completed / published.length) * 100)
      : 0
    : summary?.progress || 0;
  $("#content").innerHTML =
    `<button class="text-button back-link" data-nav="classes">← Todas as turmas</button><div class="detail-header course-header"><div><p class="eyebrow">SUA TRILHA / ${esc(c.age_band)}</p><h1>${esc(c.title)}</h1><p class="muted">${esc(c.description)}</p><div class="chips"><span class="pill">${esc(c.schedule || "Horário a combinar")}</span><span class="pill">Professor: ${esc(c.teacher_name)}</span></div></div><div class="course-header-progress">${progressBar(percent, student ? `${completed} de ${published.length} aulas concluídas` : "Conclusão entre alunos")}<p class="hint">${modules.length} módulos · ${published.length} aulas · ${Math.round((published.reduce((n, l) => n + l.minutes, 0) / 60) * 10) / 10} h de roteiros</p>${summary?.next_lesson ? `<button class="button" data-action="continue-course" data-id="${id}">Continuar aprendendo ${icon("arrow")}</button>` : ""}</div></div><div class="course-layout"><div><div class="section-title"><div><p class="eyebrow">UMA ETAPA DE CADA VEZ</p><h2>Trilha de aprendizagem</h2></div><div class="chips">${staff() ? button("＋ Módulo", "new-module", id, true) : ""}</div></div>${
      modules
        .map((m, index) => {
          const done = m.lessons.filter((l) => l.completed).length;
          return `<section class="module"><div class="module-heading"><span class="module-index">${String(index + 1).padStart(2, "0")}</span><div class="module-copy"><h3>${esc(m.title)}</h3><p>${esc(m.description)}</p><small>${m.lessons.length} aulas${student ? ` · ${done} concluídas` : ""}</small></div>${staff() ? `<div class="module-actions"><button class="text-button" data-action="edit-module" data-id="${m.id}">Editar</button><button class="text-button" data-action="new-lesson" data-id="${m.id}">＋ Aula</button></div>` : done === m.lessons.length && done ? '<span class="tag mint">Módulo concluído</span>' : ""}</div>${m.lessons.map((l, i) => `<div class="lesson ${l.completed ? "is-complete" : ""}"><span class="lesson-number">${l.completed ? "✓" : String(i + 1).padStart(2, "0")}</span><div class="lesson-copy"><strong>${esc(l.title)}</strong><small>${l.minutes} min · ${l.completed ? "Concluído" : l.published ? "Publicado" : "Rascunho"}${l.video_url ? " · Vídeo e roteiro" : " · Roteiro"}</small></div><button class="button small secondary" data-action="lesson" data-id="${l.id}">Abrir aula</button></div>`).join("") || '<div class="lesson"><p class="hint no-margin">Este módulo ainda não tem aulas.</p></div>'}</section>`;
        })
        .join("") ||
      empty(
        "Esta turma ainda não tem módulos.",
        staff() ? button("Criar primeiro módulo", "new-module", id) : "",
      )
    }</div><aside class="course-aside"><section class="panel rail-section"><p class="eyebrow">SUA OFICINA</p><h2>${staff() ? "Gerenciar turma" : "Construir na prática"}</h2>${
      staff()
        ? `<div class="management-actions">${button("Editar turma", "edit-class", id, true)}${button("Progresso dos alunos", "report", id, true)}${button("Fazer chamada", "attendance", id, true)}${state.user.role === "admin" ? button("Matrículas", "enrollment", id, true) : '<p class="hint">Novas matrículas são organizadas pela administração.</p>'}</div>`
        : state.assignments
            .filter((a) => a.classroom_id === id)
            .map(projectRow)
            .join("") ||
          '<p class="hint">Os projetos aparecerão quando seu professor os publicar.</p>'
    }</section><section class="panel rail-section"><p class="eyebrow">RECURSOS PRIVADOS</p><h2>Materiais da turma</h2>${staff() ? button("↑ Enviar material", "upload-material", id, true) : ""}<div class="resource-list">${
      assets
        .filter((a) => !a.lesson_id)
        .map(resourceLink)
        .join("") ||
      '<p class="hint">Nenhum material geral enviado. Os anexos das aulas estão dentro de cada aula.</p>'
    }</div><p class="hint">Disponíveis apenas para pessoas vinculadas à turma.</p></section></aside></div>`;
  focusContent();
}
function resourceLink(a) {
  return `<a class="resource-link" href="/api/assets/${a.id}/download"><span class="resource-icon" aria-hidden="true">↓</span><span><strong>${esc(a.name)}</strong><small>${(a.size / 1024 / 1024).toFixed(2)} MB · Download privado</small></span></a>`;
}
function videoContent(lesson, assets) {
  if (lesson.video_url) {
    const url = new URL(lesson.video_url);
    let embed = "";
    if (
      [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "youtu.be",
        "www.youtube-nocookie.com",
      ].includes(url.hostname)
    ) {
      const id =
        url.hostname === "youtu.be"
          ? url.pathname.slice(1)
          : url.pathname.startsWith("/embed/")
            ? url.pathname.split("/")[2]
            : url.searchParams.get("v");
      if (/^[a-zA-Z0-9_-]{11}$/.test(id || ""))
        embed = "https://www.youtube-nocookie.com/embed/" + id;
    }
    if (url.hostname === "vimeo.com" || url.hostname === "www.vimeo.com") {
      const id = url.pathname.split("/").filter(Boolean).pop();
      if (/^\d+$/.test(id || ""))
        embed = "https://player.vimeo.com/video/" + id;
    }
    if (
      url.hostname === "player.vimeo.com" &&
      /^\/video\/\d+$/.test(url.pathname)
    )
      embed = "https://player.vimeo.com" + url.pathname;
    return embed
      ? `<section class="lesson-video"><div class="video-consent"><span class="eyebrow">VIDEOAULA</span><h3>Prepare seu espaço. Vamos construir.</h3><p>O player externo será carregado quando você escolher assistir.</p><button class="button" data-video="${esc(embed)}">Carregar videoaula ${icon("arrow")}</button><a class="text-button" href="${esc(lesson.video_url)}" target="_blank" rel="noopener noreferrer">Abrir vídeo em outra aba ↗</a></div></section>`
      : `<section class="video-link-card"><span class="eyebrow">VIDEOAULA</span><h3>Assista ao conteúdo da aula</h3><a class="button secondary" href="${esc(lesson.video_url)}" target="_blank" rel="noopener noreferrer">Assistir à videoaula ↗</a></section>`;
  }
  const video = assets.find((a) =>
    ["video/mp4", "video/webm"].includes(a.mime),
  );
  return video
    ? `<section class="lesson-video"><video controls preload="none" aria-label="Vídeo da aula: ${esc(lesson.title)}" src="/api/assets/${video.id}/download">Seu navegador não reproduz este vídeo. ${resourceLink(video)}</video></section>`
    : "";
}
function lessonText(body) {
  return body
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      if (lines.length > 1 && lines[0].length < 85 && !/^\d/.test(lines[0]))
        return `<section class="reading-section"><h3>${esc(lines[0])}</h3><p>${esc(lines.slice(1).join("\n"))}</p></section>`;
      return `<p>${esc(block)}</p>`;
    })
    .join("");
}
async function lessonView(id, updateRoute = true) {
  const lessons = state.modules.flatMap((m) => m.lessons),
    lesson = lessons.find((l) => l.id === id);
  if (!lesson) throw new Error("Esta aula não está disponível para sua conta.");
  const module = state.modules.find((m) => m.lessons.some((l) => l.id === id)),
    assets = state.assets.filter((a) => a.lesson_id === id),
    index = lessons.findIndex((l) => l.id === id);
  state.view = { kind: "lesson", id, classId: state.currentClass };
  if (updateRoute) setRoute(`course/${state.currentClass}/${id}`);
  setActive("classes");
  $("#breadcrumb").textContent = "Aula / " + module.title;
  $("#content").innerHTML =
    `<div class="lesson-topline"><button class="text-button" data-action="class" data-id="${state.currentClass}">← Voltar à trilha</button><span class="tag ${lesson.completed ? "mint" : lesson.published ? "" : "orange"}">${lesson.completed ? "Concluído" : lesson.published ? "Publicado" : "Rascunho"}</span></div><div class="learning-workspace"><article class="lesson-reader"><header class="lesson-title"><p class="eyebrow">${esc(module.title)} / AULA ${String(index + 1).padStart(2, "0")}</p><h1>${esc(lesson.title)}</h1><p class="muted">${lesson.minutes} minutos de roteiro · ${esc(className(state.currentClass))}</p></header>${videoContent(lesson, assets)}<section class="lesson-reading"><p class="eyebrow">SEU ROTEIRO DE DESCOBERTAS</p><div class="lesson-body">${lessonText(lesson.body) || "<p>O professor está preparando o roteiro desta aula.</p>"}</div></section><section class="lesson-resources"><div class="section-title"><h2>Materiais desta aula</h2>${staff() ? button("Enviar anexo", "upload-lesson", id, true) : ""}</div><div class="resource-list">${assets.map(resourceLink).join("") || '<p class="hint">Esta aula não possui anexos.</p>'}</div></section><div class="lesson-completion"><div><h3>${lesson.completed ? "Mais uma descoberta na sua jornada." : "Pronto para o próximo passo?"}</h3><p>${staff() ? "Revise o roteiro e os recursos antes de publicar." : "Conclua o roteiro e os desafios antes de marcar sua aula."}</p></div>${staff() ? button("Editar aula", "edit-lesson", id, true) : state.user.role === "student" ? button(lesson.completed ? "Aula concluída ✓" : "Marcar como concluída", "complete", id) : ""}</div><nav class="lesson-pagination" aria-label="Navegação entre aulas">${index > 0 ? `<button class="button secondary" data-action="lesson" data-id="${lessons[index - 1].id}">← Aula anterior</button>` : "<span></span>"}${index < lessons.length - 1 ? `<button class="button secondary" data-action="lesson" data-id="${lessons[index + 1].id}">Próxima aula →</button>` : `<button class="button secondary" data-action="class" data-id="${state.currentClass}">Ver minha trilha →</button>`}</nav></article><aside class="lesson-outline"><p class="eyebrow">NESTA TRILHA</p><h2>Seu caminho</h2>${progressBar(courseSummary(state.currentClass)?.progress || 0, "Aulas concluídas")}<nav aria-label="Aulas da trilha">${state.modules.map((m) => `<div class="outline-module"><h3>${esc(m.title)}</h3>${m.lessons.map((l) => `<button ${l.id === id ? 'aria-current="page"' : ""} data-action="lesson" data-id="${l.id}"><span aria-hidden="true">${l.completed ? "✓" : l.id === id ? "→" : "○"}</span><span>${esc(l.title)}<small>${l.minutes} min${l.completed ? " · Concluído" : ""}</small></span></button>`).join("")}</div>`).join("")}</nav></aside></div>`;
  const load = $("[data-video]");
  if (load)
    load.onclick = () => {
      const frame = document.createElement("iframe");
      frame.src = load.dataset.video;
      frame.title = "Videoaula: " + lesson.title;
      frame.allow = "fullscreen; picture-in-picture";
      frame.allowFullscreen = true;
      frame.referrerPolicy = "no-referrer";
      $(".lesson-video").replaceChildren(frame);
    };
  focusContent();
}
async function assignmentView(id, updateRoute = true) {
  const token = ++navigation;
  const a = state.assignments.find((a) => a.id === id);
  if (!a) throw new Error("Projeto não disponível para sua conta.");
  const submissions = state.submissions.filter((s) => s.assignment_id === id),
    latest = latestSubmissions().filter((s) => s.assignment_id === id),
    assets = await api(`/classrooms/${a.classroom_id}/assets`);
  if (token !== navigation) return;
  setActive("projects");
  state.view = { kind: "project", id };
  if (updateRoute) setRoute("project/" + id);
  $("#breadcrumb").textContent = a.title;
  $("#content").innerHTML =
    `<button class="text-button back-link" data-nav="projects">← Todos os projetos</button>${heading(a.title, className(a.classroom_id), staff() ? button("Editar projeto", "edit-assignment", id, true) : "")}<div class="project-workspace"><div><section class="panel project-brief"><p class="eyebrow">O DESAFIO</p><h2>Da ideia à sua solução</h2><div class="lesson-body">${lessonText(a.description)}</div></section><section class="panel rubric-panel"><p class="eyebrow">COMO SEU PROJETO SERÁ AVALIADO</p><h2>Critérios de avaliação</h2>${a.rubric.map((r) => `<div class="rubric-row"><span>${esc(r.label)}</span><strong>${r.weight}%</strong><progress value="${r.weight}" max="100" aria-label="Peso de ${esc(r.label)}"></progress></div>`).join("")}</section><section class="submission-section"><div class="section-title"><div><p class="eyebrow">CONSTRUIR. REVISAR. EVOLUIR.</p><h2>${staff() ? "Entregas dos alunos" : state.user.role === "guardian" ? "Entregas dos alunos vinculados" : "Suas entregas"}</h2></div><span class="tag">${submissions.length} versões</span></div>${submissions.map((s) => `<article class="submission-card"><header><div><span class="eyebrow">VERSÃO ${s.version} · ${date(s.submitted_at)}</span><h3>${esc(s.student_name)}</h3></div><span class="tag ${s.grade !== null ? "mint" : "orange"}">${s.grade !== null ? "Avaliado · " + s.grade + "/100" : "Aguardando avaliação"}</span></header>${s.late ? '<p class="late-note">Entrega registrada fora do prazo.</p>' : ""}<p class="submission-notes">${esc(s.notes || "Nenhuma observação enviada.")}</p><div class="chips">${s.repository_url ? `<a class="button secondary" href="${esc(s.repository_url)}" target="_blank" rel="noopener noreferrer">Abrir repositório ↗</a>` : ""}${s.asset_id ? `<a class="button secondary" href="/api/assets/${s.asset_id}/download">Baixar anexo ↓</a>` : ""}</div>${s.grade !== null ? `<section class="feedback-block"><p class="eyebrow">FEEDBACK DO PROFESSOR</p><p>${esc(s.feedback)}</p>${s.rubric_scores ? `<div class="feedback-scores">${a.rubric.map((r, i) => `<div><span>${esc(r.label)}</span><strong>${s.rubric_scores[i]}/100</strong></div>`).join("")}</div>` : ""}</section>` : ""}${staff() ? `<div class="submission-actions">${button("Avaliar entrega", "grade", s.id, true)}</div>` : ""}</article>`).join("") || empty("O projeto ainda não recebeu uma entrega. Sua primeira versão pode começar agora.")}</section></div><aside class="project-sidebar"><section class="panel project-submit"><p class="eyebrow">SUA PRÓXIMA AÇÃO</p><h2>${staff() ? "Orientar a próxima versão" : "Faça sua ideia acontecer."}</h2><div class="assignment-deadline"><span class="eyebrow">ENTREGA ATÉ</span><strong>${fullDate(a.due_at)}</strong><span class="tag ${a.due_at * 1000 < Date.now() ? "danger" : "orange"}">${deadlineLabel(a)}</span></div>${state.user.role === "student" ? `<p>Envie um arquivo ou repositório HTTPS e conte o que você construiu.</p>${button(submissions.length ? "Enviar nova versão" : "Entregar projeto", "submit", id)}<p class="hint">Cada nova entrega preserva as versões anteriores.</p>` : staff() ? `<p>${latest.filter((s) => s.grade === null).length} entregas recentes aguardam avaliação.</p><button class="button secondary" data-nav="review">Ver fila de entregas</button>` : '<p class="hint">A entrega é feita pela conta do aluno.</p>'}</section><section class="panel rail-section"><p class="eyebrow">ANTES DE ENVIAR</p><h2>Checklist da entrega</h2><ul class="submission-checklist"><li>Revise o desafio e os critérios.</li><li>Explique como executar a solução.</li><li>Teste os principais cenários.</li><li>Use somente dados fictícios.</li><li>Não inclua senhas ou chaves.</li></ul></section><section class="panel rail-section"><h2>Recursos da turma</h2><div class="resource-list">${
      assets
        .filter(
          (a) =>
            !a.lesson_id && !state.submissions.some((s) => s.asset_id === a.id),
        )
        .map(resourceLink)
        .join("") ||
      '<p class="hint">O professor ainda não enviou recursos gerais.</p>'
    }</div></section></aside></div>`;
  focusContent();
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
      document.body.classList.toggle("menu-open", open);
      if (open) $(".sidebar .nav button")?.focus();
      $(".mobile-menu").setAttribute("aria-expanded", String(open));
      $(".mobile-menu").setAttribute(
        "aria-label",
        open ? "Fechar menu" : "Abrir menu",
      );
      break;
    }
    case "retry":
      await navigate(id);
      break;
    case "continue-course": {
      const next = courseSummary(id)?.next_lesson;
      await classDetail(id);
      if (next) await lessonView(next.id);
      break;
    }
    case "revisit": {
      const [cid, lid] = id.split(":");
      await classDetail(cid);
      await lessonView(lid);
      break;
    }
    case "close-menu":
      closeMenu();
      $(".mobile-menu").focus();
      break;
    case "logout":
      await api("/auth/logout", { method: "POST" });
      state.user = null;
      setRoute("home");
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
      await refresh();
      if (token === navigation) {
        await classDetail(classId);
        await lessonView(id);
      }
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
    case "student-progress": {
      const [cid, sid] = id.split(":");
      const data = await api(`/reports/${cid}/students/${sid}`);
      $("#dialog").close();
      setActive("reports");
      state.view = null;
      setRoute(`student/${cid}/${sid}`);
      $("#content").innerHTML =
        heading(
          data.name,
          "Aprendizagem individual · " + className(cid),
          '<button class="button secondary" data-nav="reports">← Acompanhamento</button>',
        ) +
        `<section class="history-summary"><p class="eyebrow">${esc(data.email)}</p>${progressBar(data.summary.progress, `${data.summary.completed} de ${data.summary.lessons} aulas concluídas`)}</section><section class="panel"><h2>Percurso de aprendizagem</h2>${table(
          ["Aula", "Módulo", "Conclusão"],
          data.lessons.map((l) => [
            esc(l.title),
            esc(l.module),
            l.completed_at
              ? `<span class="tag mint">Concluído · ${date(l.completed_at)}</span>`
              : '<span class="tag">A concluir</span>',
          ]),
        )}</section>`;
      focusContent();
      break;
    }
    case "report": {
      const rows = await api(`/reports/${id}`);
      const d = dialog(
        "Acompanhamento · " + className(id),
        table(
          ["Aluno", "Aulas", "Projetos", "Média", "Presença", "Conclusão"],
          rows.map((r) => [
            `<button class="text-button" data-action="student-progress" data-id="${id}:${r.id}">${esc(r.name)} →</button>`,
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
    try {
      await openRoute();
    } catch (error) {
      await navigate("home");
      toast(error.message);
    }
  } catch {
    loginPage();
  }
}
start();
