window.App = window.App || {};
App.ui = App.ui || {};

(function () {
  const { el } = App.util;

  function renderTabs(state) {
    const container = el("div", { class: "period-tabs" });
    state.periodOrder.forEach((id) => {
      const period = state.periods[id];
      const tab = el("div", {
        class: "period-tab" + (id === state.activePeriodId ? " active" : ""),
        text: period.label,
        title: "Double-click to rename",
        onclick: () => App.store.update((s) => { s.activePeriodId = id; }),
        ondblclick: () => {
          const name = window.prompt("Rename period:", period.label);
          if (!name) return;
          App.store.update((s) => { s.periods[id].label = name; });
        },
      });
      container.appendChild(tab);
    });
    return container;
  }

  App.ui.periods = { renderTabs };
})();
