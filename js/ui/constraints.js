window.App = window.App || {};
App.ui = App.ui || {};

(function () {
  const { el, fullName } = App.util;

  function pairExists(list, a, b) {
    return list.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  }

  function addMustGroup(periodId, ids) {
    App.store.update((state) => {
      const p = state.periods[periodId];
      for (let i = 1; i < ids.length; i++) {
        if (!pairExists(p.mustPairs, ids[0], ids[i])) p.mustPairs.push([ids[0], ids[i]]);
      }
    });
  }

  function addAvoidGroup(periodId, ids) {
    App.store.update((state) => {
      const p = state.periods[periodId];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          if (!pairExists(p.avoidPairs, ids[i], ids[j])) p.avoidPairs.push([ids[i], ids[j]]);
        }
      }
    });
  }

  function nameFor(period, id) {
    const s = period.students.find((x) => x.id === id);
    return s ? fullName(s) : "(removed student)";
  }

  function render(period) {
    const panel = el("div", { class: "panel" });
    panel.appendChild(el("div", { class: "section-title", text: "Seating Constraints" }));

    const selected = App.ui.roster.getSelected();
    const canCreate = selected.length >= 2;
    panel.appendChild(el("div", { class: "toolbar-row" }, [
      el("button", {
        text: "Must sit together",
        disabled: !canCreate,
        onclick: () => { addMustGroup(period.id, selected); App.ui.roster.clearSelected(); },
      }),
      el("button", {
        text: "Keep apart",
        disabled: !canCreate,
        onclick: () => { addAvoidGroup(period.id, selected); App.ui.roster.clearSelected(); },
      }),
    ]));

    const list = el("div", { class: "constraint-list" });
    if (!period.mustPairs.length && !period.avoidPairs.length) {
      list.appendChild(el("div", { class: "empty-state", text: "No constraints yet." }));
    }
    period.mustPairs.forEach((pair, i) => {
      list.appendChild(el("div", { class: "constraint-chip must" }, [
        el("span", { text: "Together: " + nameFor(period, pair[0]) + " + " + nameFor(period, pair[1]) }),
        el("button", {
          class: "small",
          text: "✕",
          onclick: () => App.store.update((state) => {
            state.periods[period.id].mustPairs.splice(i, 1);
          }),
        }),
      ]));
    });
    period.avoidPairs.forEach((pair, i) => {
      list.appendChild(el("div", { class: "constraint-chip avoid" }, [
        el("span", { text: "Apart: " + nameFor(period, pair[0]) + " + " + nameFor(period, pair[1]) }),
        el("button", {
          class: "small",
          text: "✕",
          onclick: () => App.store.update((state) => {
            state.periods[period.id].avoidPairs.splice(i, 1);
          }),
        }),
      ]));
    });
    panel.appendChild(list);

    return panel;
  }

  App.ui.constraints = { render };
})();
