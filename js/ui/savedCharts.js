window.App = window.App || {};
App.ui = App.ui || {};

(function () {
  const { el, formatTimestamp } = App.util;

  function render(period) {
    const panel = el("div", { class: "panel" });
    panel.appendChild(el("div", { class: "section-title", text: "Saved Charts" }));

    const hasChart = Object.keys(period.assignment).length > 0;
    panel.appendChild(el("div", { class: "toolbar-row" }, [
      el("button", {
        class: "primary",
        text: "Save current chart",
        disabled: !hasChart,
        onclick: () => {
          const defaultName = "Chart — " + new Date().toLocaleDateString();
          const name = window.prompt("Name this seating chart:", defaultName);
          if (!name) return;
          App.store.update((state) => {
            const p = state.periods[period.id];
            const now = new Date().toISOString();
            p.savedCharts.push({
              id: App.store.uid("chart"),
              name,
              assignment: Object.assign({}, p.assignment),
              createdAt: now,
              lastUsedAt: now,
            });
          });
        },
      }),
    ]));

    if (!period.savedCharts.length) {
      panel.appendChild(el("div", { class: "empty-state", text: "No saved charts yet for this period." }));
      return panel;
    }

    period.savedCharts
      .slice()
      .sort((a, b) => new Date(b.lastUsedAt) - new Date(a.lastUsedAt))
      .forEach((chart) => {
        const row = el("div", { class: "saved-chart-row" });
        row.appendChild(el("div", { class: "name-row" }, [
          el("span", { text: chart.name }),
        ]));
        row.appendChild(el("div", {
          class: "timestamps",
          text: "Created " + formatTimestamp(chart.createdAt) + " · Last used " + formatTimestamp(chart.lastUsedAt),
        }));
        row.appendChild(el("div", { class: "actions" }, [
          el("button", {
            class: "small",
            text: "Load",
            onclick: () => {
              App.ui.chart.clearWarning(period.id);
              App.store.update((state) => {
                const p = state.periods[period.id];
                const saved = p.savedCharts.find((c) => c.id === chart.id);
                p.assignment = Object.assign({}, saved.assignment);
                saved.lastUsedAt = new Date().toISOString();
              });
            },
          }),
          el("button", {
            class: "small",
            text: "Rename",
            onclick: () => {
              const newName = window.prompt("Rename chart:", chart.name);
              if (!newName) return;
              App.store.update((state) => {
                const saved = state.periods[period.id].savedCharts.find((c) => c.id === chart.id);
                saved.name = newName;
              });
            },
          }),
          el("button", {
            class: "small danger",
            text: "Delete",
            onclick: () => {
              if (!window.confirm('Delete saved chart "' + chart.name + '"?')) return;
              App.store.update((state) => {
                const p = state.periods[period.id];
                p.savedCharts = p.savedCharts.filter((c) => c.id !== chart.id);
              });
            },
          }),
        ]));
        panel.appendChild(row);
      });

    return panel;
  }

  App.ui.savedCharts = { render };
})();
