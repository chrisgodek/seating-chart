window.App = window.App || {};
App.ui = App.ui || {};

(function () {
  const { el, fullName } = App.util;
  const lastUnmetByPeriod = {};

  function computeConflicts(period, classroom) {
    const conflictSeats = new Set();
    const seatOf = {}; // studentId -> {sid, groupId}
    classroom.layout.groups.forEach((g) => {
      const capacity = App.seating.groupCapacity(g);
      const occupied = [];
      for (let i = 0; i < capacity; i++) {
        const sid = App.seating.seatId(g.id, i);
        const studentId = period.assignment[sid];
        if (studentId) {
          occupied.push({ sid, studentId });
          seatOf[studentId] = { sid, groupId: g.id };
        }
      }
      for (let i = 0; i < occupied.length; i++) {
        for (let j = i + 1; j < occupied.length; j++) {
          const a = occupied[i], b = occupied[j];
          const conflict = period.avoidPairs.some(([x, y]) =>
            (x === a.studentId && y === b.studentId) || (x === b.studentId && y === a.studentId)
          );
          if (conflict) { conflictSeats.add(a.sid); conflictSeats.add(b.sid); }
        }
      }
    });
    // "Must sit together" pairs that ended up at different tables are conflicts too.
    period.mustPairs.forEach(([a, b]) => {
      const seatA = seatOf[a], seatB = seatOf[b];
      if (seatA && seatB && seatA.groupId !== seatB.groupId) {
        conflictSeats.add(seatA.sid);
        conflictSeats.add(seatB.sid);
      }
    });
    return conflictSeats;
  }

  // Live (recomputed every render, so it stays correct after manual drags too) —
  // tables with a nonzero headcount that's still below the preferred minimum.
  function computeThinGroups(period, classroom) {
    const thin = new Set();
    const min = classroom.preferredMinPerTable || 1;
    classroom.layout.groups.forEach((g) => {
      const capacity = App.seating.groupCapacity(g);
      let count = 0;
      for (let i = 0; i < capacity; i++) {
        if (period.assignment[App.seating.seatId(g.id, i)]) count++;
      }
      if (count > 0 && count < min) thin.add(g.id);
    });
    return thin;
  }

  function swapSeats(periodId, fromId, toId) {
    App.store.update((state) => {
      const p = state.periods[periodId];
      const a = p.assignment[fromId];
      const b = p.assignment[toId];
      if (b === undefined) delete p.assignment[fromId]; else p.assignment[fromId] = b;
      if (a === undefined) delete p.assignment[toId]; else p.assignment[toId] = a;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapText(ctx, text, cx, cy, maxWidth, lineHeight) {
    const words = text.split(" ");
    const lines = [];
    let current = "";
    words.forEach((w) => {
      const test = current ? current + " " + w : w;
      if (current && ctx.measureText(test).width > maxWidth) {
        lines.push(current);
        current = w;
      } else {
        current = test;
      }
    });
    if (current) lines.push(current);
    const startY = cy - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => ctx.fillText(line, cx, startY + i * lineHeight));
  }

  const FONT = "-apple-system, Helvetica, Arial, sans-serif";

  // Draws the seating chart fresh onto a canvas (not a DOM screenshot), so the
  // exported image follows the same "clean" rules as print: no conflict/thin
  // highlighting, no "Front" word — just the room, tables, and students.
  function buildChartCanvas(period, classroom) {
    const SCALE = 2;
    const SEAT_W = 130, SEAT_H = 66, SEAT_GAP = 8;
    const TABLE_PAD = 14, HEADER_H = 26, TABLE_GAP = 26, MARGIN = 36, BANNER_H = 96;

    const layout = classroom.layout;
    const groups = layout.groups;
    const maxSeatCols = Math.max(1, ...groups.map((g) => g.seatCols));
    const maxSeatRows = Math.max(1, ...groups.map((g) => g.seatRows));
    const cellW = TABLE_PAD * 2 + maxSeatCols * SEAT_W + (maxSeatCols - 1) * SEAT_GAP;
    const cellH = HEADER_H + TABLE_PAD * 2 + maxSeatRows * SEAT_H + (maxSeatRows - 1) * SEAT_GAP;

    const width = MARGIN * 2 + layout.cols * cellW + Math.max(0, layout.cols - 1) * TABLE_GAP;
    const height = MARGIN * 2 + BANNER_H + layout.rows * cellH + Math.max(0, layout.rows - 1) * TABLE_GAP;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * SCALE);
    canvas.height = Math.round(height * SCALE);
    const ctx = canvas.getContext("2d");
    ctx.scale(SCALE, SCALE);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#000000";
    ctx.font = "800 30px " + FONT;
    ctx.fillText("Whiteboard / Front of Class", width / 2, MARGIN + 30);
    ctx.beginPath();
    ctx.moveTo(MARGIN, MARGIN + 44);
    ctx.lineTo(width - MARGIN, MARGIN + 44);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000000";
    ctx.stroke();
    ctx.font = "700 20px " + FONT;
    ctx.fillText(classroom.className ? classroom.className + " — " + period.label : period.label, width / 2, MARGIN + 74);

    const tableNumbers = App.util.numberTables(layout);
    const autoPhoneNumbers = classroom.autoAssignPhoneNumbers ? App.util.computeAutoPhoneNumbers(layout) : null;

    groups.forEach((g) => {
      const x = MARGIN + g.col * (cellW + TABLE_GAP);
      const y = MARGIN + BANNER_H + g.row * (cellH + TABLE_GAP);
      const tableW = TABLE_PAD * 2 + g.seatCols * SEAT_W + (g.seatCols - 1) * SEAT_GAP;
      const tableH = HEADER_H + TABLE_PAD * 2 + g.seatRows * SEAT_H + (g.seatRows - 1) * SEAT_GAP;

      ctx.strokeStyle = g.isFront ? "#b5750a" : "#000000";
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, tableW, tableH, 10);
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillStyle = g.isFront ? "#b5750a" : "#000000";
      ctx.font = "700 14px " + FONT;
      ctx.fillText("Table " + tableNumbers[g.id], x + TABLE_PAD, y + 20);

      const capacity = App.seating.groupCapacity(g);
      for (let i = 0; i < capacity; i++) {
        const sr = Math.floor(i / g.seatCols);
        const sc = i % g.seatCols;
        const sx = x + TABLE_PAD + sc * (SEAT_W + SEAT_GAP);
        const sy = y + HEADER_H + TABLE_PAD + sr * (SEAT_H + SEAT_GAP);

        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#999999";
        ctx.lineWidth = 1.5;
        roundRect(ctx, sx, sy, SEAT_W, SEAT_H, 6);
        ctx.fill();
        ctx.stroke();

        const sid = App.seating.seatId(g.id, i);
        const studentId = period.assignment[sid];
        const student = studentId ? period.students.find((s) => s.id === studentId) : null;
        const marker = App.util.getSeatMarker(classroom, i);

        if (marker.type === "color") {
          ctx.beginPath();
          ctx.arc(sx + SEAT_W - 13, sy + 13, 6, 0, Math.PI * 2);
          ctx.fillStyle = marker.swatch;
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(0,0,0,0.35)";
          ctx.stroke();
        } else {
          ctx.textAlign = "right";
          ctx.fillStyle = marker.textColor === "red" ? "#c0392b" : "#000000";
          ctx.font = "700 13px " + FONT;
          ctx.fillText(marker.symbol, sx + SEAT_W - 8, sy + 17);
        }

        ctx.textAlign = "center";
        ctx.fillStyle = "#000000";
        ctx.font = "600 13px " + FONT;
        wrapText(ctx, student ? fullName(student) : "Empty", sx + SEAT_W / 2, sy + SEAT_H / 2 - 2, SEAT_W - 16, 15);

        const phoneLine = autoPhoneNumbers
          ? "#" + autoPhoneNumbers[sid]
          : (student && student.phoneNumber ? "#" + student.phoneNumber : null);
        if (phoneLine) {
          ctx.font = "400 11px " + FONT;
          ctx.fillStyle = "#555555";
          ctx.fillText(phoneLine, sx + SEAT_W / 2, sy + SEAT_H - 8);
        }
      }
    });

    return canvas;
  }

  function downloadChartImage(period, classroom) {
    const canvas = buildChartCanvas(period, classroom);
    canvas.toBlob((blob) => {
      if (!blob) { alert("Couldn't generate the image."); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (period.label || "seating-chart").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") + "-seating-chart.jpg";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, "image/jpeg", 0.92);
  }

  // Builds the table/seat grid for one period against the shared classroom
  // layout. Shared by the live on-screen chart and the "print all" pages so
  // both stay in sync automatically.
  function buildSeatingGrid(period, classroom, options) {
    options = options || {};
    const conflicts = computeConflicts(period, classroom);
    const thinGroups = computeThinGroups(period, classroom);
    const tableNumbers = App.util.numberTables(classroom.layout);
    const autoPhoneNumbers = classroom.autoAssignPhoneNumbers ? App.util.computeAutoPhoneNumbers(classroom.layout) : null;
    const layout = classroom.layout;
    const grid = el("div", {
      class: "room-grid",
      style: `grid-template-columns: repeat(${layout.cols}, minmax(140px, 1fr)); grid-template-rows: repeat(${layout.rows}, auto);`,
    });

    for (let r = 0; r < layout.rows; r++) {
      for (let c = 0; c < layout.cols; c++) {
        const group = layout.groups.find((g) => g.row === r && g.col === c);
        if (!group) {
          grid.appendChild(el("div", { class: "table-group blank" }));
          continue;
        }
        const capacity = App.seating.groupCapacity(group);
        const seatGrid = el("div", {
          class: "seat-grid",
          style: `grid-template-columns: repeat(${group.seatCols}, 1fr);`,
        });
        for (let i = 0; i < capacity; i++) {
          const sid = App.seating.seatId(group.id, i);
          const studentId = period.assignment[sid];
          const student = studentId ? period.students.find((s) => s.id === studentId) : null;
          const marker = App.util.getSeatMarker(classroom, i);
          const markerBadge = marker.type === "color"
            ? el("span", { class: "color-badge", style: "background:" + marker.swatch, title: marker.label })
            : el("span", { class: "suit-badge suit-" + marker.textColor, text: marker.symbol });
          const phoneLine = autoPhoneNumbers
            ? "#" + autoPhoneNumbers[sid]
            : (student && student.phoneNumber ? "#" + student.phoneNumber : null);
          const classes = ["seat"];
          if (student) classes.push("filled");
          if (conflicts.has(sid)) classes.push("conflict");
          seatGrid.appendChild(el("div", {
            class: classes.join(" "),
            "data-seat-id": sid,
          }, [
            markerBadge,
            el("span", { class: "seat-name", text: student ? fullName(student) : "Empty" }),
            phoneLine ? el("span", { class: "seat-phone", text: phoneLine }) : null,
          ]));
        }
        const isThin = thinGroups.has(group.id);
        grid.appendChild(el("div", { class: "table-group" + (group.isFront ? " front" : "") + (isThin ? " thin" : "") }, [
          el("div", { class: "table-header" }, [
            el("span", { class: group.isFront ? "front-tag" : "" }, [
              group.isFront ? el("span", { class: "front-word", text: "Front " }) : null,
              "Table " + tableNumbers[group.id],
            ]),
            isThin ? el("span", { class: "thin-tag", text: "Below min" }) : null,
          ]),
          seatGrid,
        ]));
      }
    }

    if (options.interactive) {
      App.dnd.attach(grid, (fromId, toId) => swapSeats(period.id, fromId, toId));
    }

    return grid;
  }

  function buildPrintHeader(period, classroom) {
    return el("div", { class: "print-header" }, [
      el("div", { class: "print-header-banner", text: "Whiteboard / Front of Class" }),
      el("div", { class: "print-header-sub", text: classroom.className ? classroom.className + " — " + period.label : period.label }),
    ]);
  }

  // One printable page (header + room grid) for a single period — used to
  // build up the multi-period "print all" job below.
  function buildPrintablePage(period, classroom) {
    const page = el("div", { class: "print-page" });
    page.appendChild(buildPrintHeader(period, classroom));
    page.appendChild(buildSeatingGrid(period, classroom, { interactive: false }));
    return page;
  }

  let printAllContainer = null;
  function getPrintAllContainer() {
    if (!printAllContainer) {
      printAllContainer = document.createElement("div");
      printAllContainer.id = "print-all-container";
      document.body.appendChild(printAllContainer);
    }
    return printAllContainer;
  }
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("printing-all");
    if (printAllContainer) printAllContainer.innerHTML = "";
  });

  // Prints one page per period that has a roster filled in, skipping any
  // periods with no students instead of forcing you to print each one by hand.
  function printAllFilledPeriods(classroom) {
    const state = App.store.state;
    const eligible = state.periodOrder
      .map((id) => state.periods[id])
      .filter((p) => p.students.length > 0);

    if (!eligible.length) {
      alert("No periods have a roster filled in yet.");
      return;
    }

    const container = getPrintAllContainer();
    container.innerHTML = "";
    eligible.forEach((p) => container.appendChild(buildPrintablePage(p, classroom)));

    document.body.classList.add("printing-all");
    window.print();
  }

  function render(period, classroom) {
    const panel = el("div", { class: "panel seating-chart-panel" });
    panel.appendChild(el("div", { class: "section-title", text: "Seating Chart" }));

    const hasSeats = classroom.layout.groups.length > 0;
    const hasStudents = period.students.length > 0;

    panel.appendChild(el("div", { class: "toolbar-row" }, [
      el("button", {
        class: "primary",
        text: "Randomize",
        disabled: !hasSeats || !hasStudents,
        onclick: () => {
          App.store.update((state) => {
            const p = state.periods[period.id];
            const result = App.seating.assignSeats(p, state.classroom);
            p.assignment = result.assignment;
            lastUnmetByPeriod[period.id] = result.unmet;
          });
        },
      }),
      el("button", {
        text: "A→Z",
        title: "Seat alphabetically by name",
        disabled: !hasSeats || !hasStudents,
        onclick: () => {
          App.store.update((state) => {
            const p = state.periods[period.id];
            const result = App.seating.assignSeatsOrdered(p, state.classroom, "asc");
            p.assignment = result.assignment;
            lastUnmetByPeriod[period.id] = result.unmet;
          });
        },
      }),
      el("button", {
        text: "Z→A",
        title: "Seat in reverse alphabetical order",
        disabled: !hasSeats || !hasStudents,
        onclick: () => {
          App.store.update((state) => {
            const p = state.periods[period.id];
            const result = App.seating.assignSeatsOrdered(p, state.classroom, "desc");
            p.assignment = result.assignment;
            lastUnmetByPeriod[period.id] = result.unmet;
          });
        },
      }),
      el("button", {
        text: "Clear seats",
        disabled: !Object.keys(period.assignment).length,
        onclick: () => {
          delete lastUnmetByPeriod[period.id];
          App.store.update((state) => { state.periods[period.id].assignment = {}; });
        },
      }),
      el("button", {
        text: "Print",
        disabled: !Object.keys(period.assignment).length,
        onclick: () => window.print(),
      }),
      el("button", {
        text: "Print All Filled Periods",
        title: "Print one page per period that has a roster",
        disabled: !App.store.state.periodOrder.some((id) => App.store.state.periods[id].students.length > 0),
        onclick: () => printAllFilledPeriods(classroom),
      }),
      el("button", {
        text: "Save as Image (JPG)",
        disabled: !Object.keys(period.assignment).length,
        onclick: () => downloadChartImage(period, classroom),
      }),
    ]));

    const unmet = lastUnmetByPeriod[period.id];
    if (unmet && (unmet.unplacedIds.length || unmet.avoidViolations.length || unmet.frontOverflowCount)) {
      const lines = [];
      if (unmet.unplacedIds.length) lines.push(unmet.unplacedIds.length + " student(s) couldn't be seated — add more tables or seats.");
      if (unmet.frontOverflowCount) lines.push(unmet.frontOverflowCount + " front-priority student(s) didn't fit in the front seats.");
      if (unmet.avoidViolations.length) lines.push(unmet.avoidViolations.length + " \"keep apart\" pair(s) ended up at the same table.");
      panel.appendChild(el("div", { class: "warning-banner", text: lines.join(" ") }));
    }

    if (!hasSeats) {
      panel.appendChild(el("div", { class: "empty-state", text: "Design a classroom layout below to see the seating chart." }));
      return panel;
    }
    if (!hasStudents) {
      panel.appendChild(el("div", { class: "empty-state", text: "Add students to the roster to start seating them." }));
      return panel;
    }

    panel.appendChild(buildPrintHeader(period, classroom));

    const grid = buildSeatingGrid(period, classroom, { interactive: true });
    panel.appendChild(grid);
    panel.appendChild(el("div", { class: "legend" }, [
      el("span", {}, [el("span", { class: "swatch", style: "background: var(--front-badge)" }), "Front table"]),
      el("span", {}, [el("span", { class: "swatch", style: "background: var(--danger)" }), "Seating rule broken (keep-apart or must-sit-together)"]),
      el("span", {}, [el("span", { class: "swatch", style: "background: var(--warning)" }), "Below preferred minimum per table"]),
      el("span", {}, ["Drag a seated student onto another seat to swap them."]),
    ]));

    return panel;
  }

  App.ui.chart = { render, clearWarning: (periodId) => { delete lastUnmetByPeriod[periodId]; } };
})();
