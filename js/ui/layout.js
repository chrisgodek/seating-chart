window.App = window.App || {};
App.ui = App.ui || {};

(function () {
  const { el } = App.util;

  // The room is shared by every period, so any change to it invalidates every
  // period's current seat assignment (seat ids are tied to specific tables).
  function mutateClassroom(fn) {
    App.store.update((state) => {
      fn(state.classroom);
      state.periodOrder.forEach((id) => { state.periods[id].assignment = {}; });
    });
  }

  function render(classroom) {
    const panel = el("div", { class: "panel layout-panel" });
    panel.appendChild(el("div", { class: "section-title", text: "Classroom Layout" }));
    panel.appendChild(el("div", { class: "hint", text: "Shared across all periods — set this up once for your room." }));

    const layout = classroom.layout;

    const rowsInput = el("input", { type: "number", min: 0, max: 10, value: layout.rows });
    const colsInput = el("input", { type: "number", min: 0, max: 10, value: layout.cols });
    const maxInput = el("input", { type: "number", min: 1, max: 16, value: classroom.preferredPerTable });
    const minInput = el("input", { type: "number", min: 1, max: 16, value: classroom.preferredMinPerTable });

    rowsInput.addEventListener("change", () => {
      const rows = Math.max(0, Math.min(10, parseInt(rowsInput.value, 10) || 0));
      mutateClassroom((c) => {
        c.layout.rows = rows;
        c.layout.groups = c.layout.groups.filter((g) => g.row < rows);
      });
    });
    colsInput.addEventListener("change", () => {
      const cols = Math.max(0, Math.min(10, parseInt(colsInput.value, 10) || 0));
      mutateClassroom((c) => {
        c.layout.cols = cols;
        c.layout.groups = c.layout.groups.filter((g) => g.col < cols);
      });
    });
    maxInput.addEventListener("change", () => {
      const val = Math.max(1, Math.min(16, parseInt(maxInput.value, 10) || 1));
      mutateClassroom((c) => {
        c.preferredPerTable = val;
        if (c.preferredMinPerTable > val) c.preferredMinPerTable = val;
      });
    });
    minInput.addEventListener("change", () => {
      const val = Math.max(1, Math.min(16, parseInt(minInput.value, 10) || 1));
      mutateClassroom((c) => {
        c.preferredMinPerTable = Math.min(val, c.preferredPerTable);
      });
    });

    panel.appendChild(el("div", { class: "layout-config-row" }, [
      el("div", { class: "field" }, [el("label", { text: "Rows" }), rowsInput]),
      el("div", { class: "field" }, [el("label", { text: "Columns" }), colsInput]),
      el("div", { class: "field" }, [el("label", { text: "Preferred max / table" }), maxInput]),
      el("div", { class: "field" }, [el("label", { text: "Preferred min / table" }), minInput]),
    ]));

    const autoPhoneToggle = el("label", { class: "checkbox-row" }, [
      el("input", {
        type: "checkbox",
        checked: !!classroom.autoAssignPhoneNumbers,
        onchange: () => mutateClassroom((c) => { c.autoAssignPhoneNumbers = !c.autoAssignPhoneNumbers; }),
      }),
      "Auto-assign phone hotel #s by table (Table 1 = #1, 2, 3…, Table 2 continues from there, etc.)",
    ]);
    panel.appendChild(autoPhoneToggle);

    panel.appendChild(el("div", { class: "section-title", style: "margin-top:16px;", text: "Seat Suits" }));
    panel.appendChild(el("div", { class: "hint", text: "Applied to every table by seat position, in reading order (top-left, top-right, bottom-left, bottom-right for a 2×2 table). The pattern repeats for tables larger than 4 seats." }));
    const suitLabels = ["Seat 1", "Seat 2", "Seat 3", "Seat 4"];
    const suitRow = el("div", { class: "layout-config-row" });
    classroom.suitPattern.forEach((suitKey, idx) => {
      const select = el("select", {}, Object.keys(App.util.SUITS).map((key) =>
        el("option", { value: key, text: App.util.SUITS[key].symbol + " " + App.util.SUITS[key].label, selected: key === suitKey })
      ));
      select.addEventListener("change", () => {
        mutateClassroom((c) => { c.suitPattern[idx] = select.value; });
      });
      suitRow.appendChild(el("div", { class: "field" }, [el("label", { text: suitLabels[idx] }), select]));
    });
    panel.appendChild(suitRow);

    if (!layout.rows || !layout.cols) {
      panel.appendChild(el("div", { class: "empty-state", text: "Set rows and columns above, then click a cell to place a table group." }));
      return panel;
    }

    const tableNumbers = App.util.numberTables(layout);
    const grid = el("div", {
      class: "room-grid",
      style: `grid-template-columns: repeat(${layout.cols}, minmax(140px, 1fr)); grid-template-rows: repeat(${layout.rows}, auto);`,
    });

    for (let r = 0; r < layout.rows; r++) {
      for (let c = 0; c < layout.cols; c++) {
        const group = layout.groups.find((g) => g.row === r && g.col === c);
        if (!group) {
          grid.appendChild(el("div", {
            class: "table-group empty-slot",
            text: "+ Add table",
            onclick: () => mutateClassroom((cl) => {
              cl.layout.groups.push({ id: App.store.uid("group"), row: r, col: c, seatRows: 2, seatCols: 2, isFront: r === 0 });
            }),
          }));
          continue;
        }

        const seatRowsInput = el("input", { type: "number", min: 1, max: 6, value: group.seatRows });
        seatRowsInput.addEventListener("change", () => {
          const val = Math.max(1, Math.min(6, parseInt(seatRowsInput.value, 10) || 1));
          mutateClassroom((cl) => {
            cl.layout.groups.find((g) => g.id === group.id).seatRows = val;
          });
        });
        const seatColsInput = el("input", { type: "number", min: 1, max: 6, value: group.seatCols });
        seatColsInput.addEventListener("change", () => {
          const val = Math.max(1, Math.min(6, parseInt(seatColsInput.value, 10) || 1));
          mutateClassroom((cl) => {
            cl.layout.groups.find((g) => g.id === group.id).seatCols = val;
          });
        });

        const frontToggle = el("label", { class: "checkbox-row" }, [
          el("input", {
            type: "checkbox",
            checked: group.isFront,
            onchange: () => mutateClassroom((cl) => {
              const g = cl.layout.groups.find((x) => x.id === group.id);
              g.isFront = !g.isFront;
            }),
          }),
          "Front",
        ]);

        const removeBtn = el("button", {
          class: "small danger",
          text: "✕",
          onclick: () => mutateClassroom((cl) => {
            cl.layout.groups = cl.layout.groups.filter((g) => g.id !== group.id);
          }),
        });

        grid.appendChild(el("div", { class: "table-group" + (group.isFront ? " front" : "") }, [
          el("div", { class: "table-header" }, [
            el("span", { text: "Table " + tableNumbers[group.id], class: group.isFront ? "front-tag" : "" }),
            removeBtn,
          ]),
          el("div", { class: "table-controls" }, [
            el("span", { text: "Seats:" }),
            seatRowsInput,
            el("span", { text: "×" }),
            seatColsInput,
            frontToggle,
          ]),
        ]));
      }
    }

    panel.appendChild(grid);
    return panel;
  }

  App.ui.layout = { render };
})();
