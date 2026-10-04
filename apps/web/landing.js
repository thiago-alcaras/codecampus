// Progressive enhancement: all curricula remain readable without JavaScript.
const curriculumSelect = document.querySelector("#curriculum-select");
if (curriculumSelect) {
  const updateCurriculum = () => {
    document.querySelectorAll("[data-curriculum]").forEach((panel) => {
      panel.hidden = panel.dataset.curriculum !== curriculumSelect.value;
    });
  };
  curriculumSelect.addEventListener("change", updateCurriculum);
  updateCurriculum();
}
