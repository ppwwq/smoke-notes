/* global window, document */
const sizes = {
  desktop: "1440 × 900",
  portrait: "390 × 844",
  ipadPortrait: "820 × 1180",
  ipadLandscape: "1180 × 820",
};
function render(state) {
  document
    .querySelectorAll("[data-mode]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.mode === state.mode),
      ),
    );
  document.querySelector("#source").value = state.source;
  document.querySelector("#dimensions").textContent = sizes[state.mode];
  document.querySelector("#scale").textContent = state.scale + "%";
  document.querySelector("#status").textContent = state.status;
  document.querySelector("#hint").textContent =
    state.source === "local"
      ? "示例修改自动保存在此预览工具中"
      : "线上正式版 · 配对后操作会同步到你的云端便签";
}
window.preview.onState(render);
window.preview.action("state").then(render);
document
  .querySelectorAll("[data-mode]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      window.preview.action("mode", button.dataset.mode),
    ),
  );
document
  .querySelector("#source")
  .addEventListener("change", (event) =>
    window.preview.action("source", event.target.value),
  );
document
  .querySelector("#reload")
  .addEventListener("click", () => window.preview.action("reload"));
document
  .querySelector("#rotate")
  .addEventListener("click", () => window.preview.action("rotate"));
