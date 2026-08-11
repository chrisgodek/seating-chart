(function () {
  const { el } = App.util;

  function render() {
    const state = App.store.state;
    const period = App.store.getActivePeriod();
    const classroom = App.store.getClassroom();
    document.documentElement.style.setProperty("--print-scale", String(App.util.printFontScale(classroom)));
    const root = document.getElementById("app");
    root.innerHTML = "";

    root.appendChild(el("div", { class: "header-bar" }, [
      el("h1", { text: "Seating Chart" }),
    ]));
    root.appendChild(App.ui.periods.renderTabs(state));

    const mainGrid = el("div", { class: "main-grid" });

    const sidebar = el("div", { class: "sidebar sidebar-info" }, [
      App.ui.roster.render(period, classroom),
      App.ui.constraints.render(period),
      App.ui.savedCharts.render(period),
    ]);

    const centerCol = el("div", { class: "sidebar sidebar-room" }, [
      App.ui.layout.render(classroom),
      App.ui.chart.render(period, classroom),
    ]);

    mainGrid.appendChild(sidebar);
    mainGrid.appendChild(centerCol);
    root.appendChild(mainGrid);
  }

  App.rerender = render;
  App.store.subscribe(render);
  render();
})();
