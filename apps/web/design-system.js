const dialog = document.querySelector("#dialog");
let toastTimer;
function toast(text) {
  const node = document.querySelector("#toast");
  node.textContent = text;
  node.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("visible"), 4500);
}
document
  .querySelectorAll("[data-demo]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      button.dataset.demo === "dialog"
        ? dialog.showModal()
        : toast("Demonstração concluída. Nenhuma alteração foi enviada."),
    ),
  );
dialog.querySelector(".close").addEventListener("click", () => dialog.close());
document
  .querySelector("#demo-close")
  .addEventListener("click", () => dialog.close());
document.querySelector("#demo-form").addEventListener("submit", (event) => {
  event.preventDefault();
  toast("Formulário válido. Este exemplo não envia dados.");
});
const tabs = [...document.querySelectorAll("[data-tab]")];
function activate(tab) {
  tabs.forEach((item) => {
    const selected = item === tab;
    item.classList.toggle("active", selected);
    item.setAttribute("aria-selected", String(selected));
    item.tabIndex = selected ? 0 : -1;
  });
  const panel = document.querySelector("#demo-tab");
  panel.setAttribute("aria-labelledby", tab.id);
  panel.textContent = {
    Aulas: "Aulas: aprenda um conceito e experimente na prática.",
    Projetos: "Projetos: construa, entregue e evolua com feedback.",
    Materiais: "Materiais: encontre os arquivos publicados pelo professor.",
  }[tab.dataset.tab];
}
tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => activate(tab));
  tab.addEventListener("keydown", (event) => {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : null;
    if (next !== null) {
      event.preventDefault();
      activate(tabs[next]);
      tabs[next].focus();
    }
  });
});
