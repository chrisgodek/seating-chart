window.App = window.App || {};
App.ui = App.ui || {};

(function () {
  const { el } = App.util;

  // The physical room is shared by every period, so a change to the table
  // structure (rows/cols/tables) invalidates every period's current seat
  // assignment (seat ids are tied to specific tables).
  function mutateLayout(fn) {
    App.store.update((state) => {
      fn(state.classroom.layout);
      state.periodOrder.forEach((id) => { state.periods[id].assignment = {}; });
    });
  }

  // Everything else about the classroom (preferences, markers, class name) is
  // shared too, but doesn't touch seat ids — no need to clear anyone's chart.
  function mutateSetting(fn) {
    App.store.update((state) => { fn(state.classroom); });
  }

  function render(classroom) {
    const panel = el("div", { class: "panel layout-panel" });
    panel.appendChild(el("div", { class: "section-title", text: "Classroom Layout" }));
    panel.appendChild(el("div", { class: "hint", text: "Shared across all periods — set this up once for your room." }));

    const layout = classroom.layout;

    const classNameInput = el("input", { type: "text", placeholder: "e.g., Mr. Godek's Class", value: classroom.className || "", style: "width: 260px;" });
    classNameInput.addEventListener("change", () => {
      mutateSetting((c) => { c.className = classNameInput.value.trim(); });
    });
    panel.appendChild(el("div", { class: "layout-config-row" }, [
      el("div", { class: "field" }, [el("label", { text: "Class name" }), classNameInput]),
    ]));
    panel.appendChild(el("div", { class: "hint", text: "Shown on the printed chart and saved image. Leave blank to omit." }));

    const rowsInput = el("input", { type: "number", min: 0, max: 10, value: layout.rows });
    const colsInput = el("input", { type: "number", min: 0, max: 10, value: layout.cols });
    const maxInput = el("input", { type: "number", min: 1, max: 16, value: classroom.preferredPerTable });
    const minInput = el("input", { type: "number", min: 1, max: 16, value: classroom.preferredMinPerTable });

    rowsInput.addEventListener("change", () => {
      const rows = Math.max(0, Math.min(10, parseInt(rowsInput.value, 10) || 0));
      mutateLayout((l) => {
        l.rows = rows;
        l.groups = l.groups.filter((g) => g.row < rows);
      });
    });
    colsInput.addEventListener("change", () => {
      const cols = Math.max(0, Math.min(10, parseInt(colsInput.value, 10) || 0));
      mutateLayout((l) => {
        l.cols = cols;
        l.groups = l.groups.filter((g) => g.col < cols);
      });
    });
    maxInput.addEventListener("change", () => {
      const val = Math.max(1, Math.min(16, parseInt(maxInput.value, 10) || 1));
      mutateSetting((c) => {
        c.preferredPerTable = val;
        if (c.preferredMinPerTable > val) c.preferredMinPerTable = val;
      });
    });
    minInput.addEventListener("change", () => {
      const val = Math.max(1, Math.min(16, parseInt(minInput.value, 10) || 1));
      mutateSetting((c) => {
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
        onchange: () => mutateSetting((c) => { c.autoAssignPhoneNumbers = !c.autoAssignPhoneNumbers; }),
      }),
      "Auto-assign phone hotel #s by table (Table 1 = #1, 2, 3…, Table 2 continues from there, etc.)",
    ]);
    panel.appendChild(autoPhoneToggle);

    panel.appendChild(el("div", { class: "section-title", style: "margin-top:16px;", text: "Seat Markers" }));
    panel.appendChild(el("div", { class: "hint", text: "Applied to every table by seat position, in reading order (top-left, top-right, bottom-left, bottom-right for a 2×2 table). The pattern repeats for tables larger than 4 seats." }));

    const markerTypeSelect = el("select", {}, [
      el("option", { value: "suit", text: "Playing card suits", selected: classroom.seatMarkerType !== "color" }),
      el("option", { value: "color", text: "Colors", selected: classroom.seatMarkerType === "color" }),
    ]);
    markerTypeSelect.addEventListener("change", () => {
      mutateSetting((c) => { c.seatMarkerType = markerTypeSelect.value; });
    });
    panel.appendChild(el("div", { class: "layout-config-row" }, [
      el("div", { class: "field" }, [el("label", { text: "Marker type" }), markerTypeSelect]),
    ]));

    const markerLabels = ["Seat 1", "Seat 2", "Seat 3", "Seat 4"];
    const markerRow = el("div", { class: "layout-config-row" });
    if (classroom.seatMarkerType === "color") {
      classroom.colorPattern.forEach((colorKey, idx) => {
        const select = el("select", {}, Object.keys(App.util.COLORS).map((key) =>
          el("option", { value: key, text: App.util.COLORS[key].label, selected: key === colorKey })
        ));
        select.addEventListener("change", () => {
          mutateSetting((c) => { c.colorPattern[idx] = select.value; });
        });
        markerRow.appendChild(el("div", { class: "field" }, [el("label", { text: markerLabels[idx] }), select]));
      });
    } else {
      classroom.suitPattern.forEach((suitKey, idx) => {
        const select = el("select", {}, Object.keys(App.util.SUITS).map((key) =>
          el("option", { value: key, text: App.util.SUITS[key].symbol + " " + App.util.SUITS[key].label, selected: key === suitKey })
        ));
        select.addEventListener("change", () => {
          mutateSetting((c) => { c.suitPattern[idx] = select.value; });
        });
        markerRow.appendChild(el("div", { class: "field" }, [el("label", { text: markerLabels[idx] }), select]));
      });
    }
    panel.appendChild(markerRow);

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
            onclick: () => mutateLayout((l) => {
              l.groups.push({ id: App.store.uid("group"), row: r, col: c, seatRows: 2, seatCols: 2, isFront: r === 0 });
            }),
          }));
          continue;
        }

        const seatRowsInput = el("input", { type: "number", min: 1, max: 6, value: group.seatRows });
        seatRowsInput.addEventListener("change", () => {
          const val = Math.max(1, Math.min(6, parseInt(seatRowsInput.value, 10) || 1));
          mutateLayout((l) => {
            l.groups.find((g) => g.id === group.id).seatRows = val;
          });
        });
        const seatColsInput = el("input", { type: "number", min: 1, max: 6, value: group.seatCols });
        seatColsInput.addEventListener("change", () => {
          const val = Math.max(1, Math.min(6, parseInt(seatColsInput.value, 10) || 1));
          mutateLayout((l) => {
            l.groups.find((g) => g.id === group.id).seatCols = val;
          });
        });

        const frontToggle = el("label", { class: "checkbox-row" }, [
          el("input", {
            type: "checkbox",
            checked: group.isFront,
            onchange: () => mutateLayout((l) => {
              const g = l.groups.find((x) => x.id === group.id);
              g.isFront = !g.isFront;
            }),
          }),
          "Front",
        ]);

        const removeBtn = el("button", {
          class: "small danger",
          text: "✕",
          onclick: () => mutateLayout((l) => {
            l.groups = l.groups.filter((g) => g.id !== group.id);
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
