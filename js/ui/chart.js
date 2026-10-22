window.App = window.App || {};
App.ui = App.ui || {};

(function () {
  const { el } = App.util;
  const lastUnmetByPeriod = {};

  // e.g. "Mr. Godek's Class — Period 1 - IM2" (class name and course name are
  // both optional; either or both can be left blank).
  function printLabel(period, classroom) {
    const periodPart = period.courseName ? period.label + " - " + period.courseName : period.label;
    return classroom.className ? classroom.className + " — " + periodPart : periodPart;
  }

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

  // Largest font that fits `text` in a maxW x maxH box, on one line or split
  // across two (whichever lets the text be bigger). Used for the slide image.
  function fitName(ctx, text, maxW, maxH, weight) {
    const widthAt = (line, px) => { ctx.font = weight + " " + px + "px " + FONT; return ctx.measureText(line).width; };
    let size = maxH * 0.5;
    const w1 = widthAt(text, size);
    if (w1 > maxW) size *= maxW / w1;
    let best = { size, lines: [text] };
    const words = text.split(" ");
    for (let k = 1; k < words.length; k++) {
      const lines = [words.slice(0, k).join(" "), words.slice(k).join(" ")];
      const widest = Math.max(widthAt(lines[0], 100), widthAt(lines[1], 100));
      const twoSize = Math.min(maxH * 0.38, (100 * maxW) / widest);
      if (twoSize > best.size * 1.1) best = { size: twoSize, lines };
    }
    return best;
  }

  // Alphabetical "Name ...... Table 3 ♠" list of every seated student, laid
  // out in however many columns lets the text be largest.
  function drawSeatList(ctx, period, classroom, names, tableNumbers, x0, y0, w, h) {
    const entries = [];
    classroom.layout.groups.forEach((g) => {
      const capacity = App.seating.groupCapacity(g);
      for (let i = 0; i < capacity; i++) {
        const studentId = period.assignment[App.seating.seatId(g.id, i)];
        if (!studentId || !names[studentId]) continue;
        entries.push({ name: names[studentId], table: "Table " + tableNumbers[g.id], marker: App.util.getSeatMarker(classroom, i) });
      }
    });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#000000";
    ctx.font = "800 40px " + FONT;
    ctx.fillText("Find your seat", x0, y0 + 40);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + 58);
    ctx.lineTo(x0 + w, y0 + 58);
    ctx.stroke();
    if (!entries.length) return;

    const top = y0 + 76, areaH = y0 + h - top;
    const COL_GAP = 36;
    const measure = (text, weight) => { ctx.font = weight + " 100px " + FONT; return ctx.measureText(text).width; };
    const nameW = Math.max(...entries.map((e) => measure(e.name, "600")));
    const tableW = Math.max(...entries.map((e) => measure(e.table, "700")));
    const entryW = nameW + tableW + 100 * 1.6; // gap + seat marker, at 100px

    let best = null;
    for (let cols = 1; cols <= 4; cols++) {
      const rows = Math.ceil(entries.length / cols);
      const colW = (w - (cols - 1) * COL_GAP) / cols;
      const size = Math.min(48, (areaH / rows) * 0.62, (100 * colW) / entryW);
      if (!best || size > best.size) best = { cols, rows, colW, size };
    }
    const { rows, colW, size } = best;
    const rowH = Math.min(areaH / rows, size * 1.7);

    entries.forEach((e, idx) => {
      const col = Math.floor(idx / rows), row = idx % rows;
      const ex = x0 + col * (colW + COL_GAP);
      const ey = top + row * rowH;
      if (row % 2 === 0) {
        ctx.fillStyle = "#f0f0f0";
        roundRect(ctx, ex - 8, ey, colW + 16, rowH, 6);
        ctx.fill();
      }
      const baseline = ey + rowH / 2 + size * 0.36;
      ctx.textAlign = "left";
      ctx.fillStyle = "#000000";
      ctx.font = "600 " + size + "px " + FONT;
      ctx.fillText(e.name, ex, baseline);

      const markerX = ex + colW - size * 0.45;
      if (e.marker.type === "color") {
        ctx.beginPath();
        ctx.arc(markerX, ey + rowH / 2, size * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = e.marker.swatch;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.stroke();
      } else {
        ctx.textAlign = "center";
        ctx.fillStyle = e.marker.textColor === "red" ? "#c0392b" : "#000000";
        ctx.font = "700 " + size + "px " + FONT;
        ctx.fillText(e.marker.symbol, markerX, baseline);
      }
      ctx.textAlign = "right";
      ctx.fillStyle = "#000000";
      ctx.font = "700 " + size + "px " + FONT;
      ctx.fillText(e.table, ex + colW - size * 1.1, baseline);
    });
  }

  // Draws the seating chart fresh onto a canvas (not a DOM screenshot), so the
  // exported image follows the same "clean" rules as print: no conflict/thin
  // highlighting, no "Front" word — just the room, tables, and students.
  // format "print": sized by the Print text size setting (the JPG).
  // format "slide": a fixed 1920x1080 (16:9) image for Google Slides, with the
  // room scaled to fill it and each name sized as large as its seat allows.
  function buildChartCanvas(period, classroom, format) {
    const slide = format === "slide";
    const SCALE = slide ? 1 : 2;
    const { flipRows, flipCols } = App.util.chartOrientation(classroom.chartView);
    const names = App.util.displayNameMap(period.students, classroom.nameDisplay);

    // Room geometry in base units; G scales all of it.
    // Slides get a taller table header and bigger table numbers / seat symbols
    // so they read from the back of the room.
    const SEAT_W = 130, SEAT_H = 66, SEAT_GAP = 8, TABLE_PAD = 14, TABLE_GAP = 26;
    const HEADER_H = slide ? 40 : 26;
    const tableFont = slide ? 26 : 14, markerFont = slide ? 24 : 13, markerInset = slide ? 16 : 13;
    const layout = classroom.layout;
    const groups = layout.groups;
    const maxSeatCols = Math.max(1, ...groups.map((g) => g.seatCols));
    const maxSeatRows = Math.max(1, ...groups.map((g) => g.seatRows));
    const cellW = TABLE_PAD * 2 + maxSeatCols * SEAT_W + (maxSeatCols - 1) * SEAT_GAP;
    const cellH = HEADER_H + TABLE_PAD * 2 + maxSeatRows * SEAT_H + (maxSeatRows - 1) * SEAT_GAP;
    const gridW = layout.cols * cellW + Math.max(0, layout.cols - 1) * TABLE_GAP;
    const gridH = layout.rows * cellH + Math.max(0, layout.rows - 1) * TABLE_GAP;

    // "Room + name list" slides keep the room on the right and fill the rest
    // with an alphabetical find-your-seat list — handy for tall rooms that
    // would otherwise leave most of a 16:9 slide empty.
    const withList = slide && classroom.slideLayout === "list";
    let width, height, G, margin, frontFont, labelFont, frontH, labelH;
    if (slide) {
      width = 1920; height = 1080; margin = 36;
      frontFont = 40; labelFont = 32; frontH = 72; labelH = 52;
      const roomMaxW = (width - margin * 2) * (withList ? 0.6 : 1);
      G = Math.min(roomMaxW / gridW, (height - margin * 2 - frontH - labelH) / gridH);
    } else {
      const S = App.util.printFontScale(classroom); // same "Print font size" setting as the printout
      G = S; margin = 36 * S;
      frontFont = 30 * S; labelFont = 20 * S; frontH = 56 * S; labelH = 40 * S;
      width = margin * 2 + gridW * G;
      height = margin * 2 + frontH + labelH + gridH * G;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * SCALE);
    canvas.height = Math.round(height * SCALE);
    const ctx = canvas.getContext("2d");
    ctx.scale(SCALE, SCALE);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Horizontal span of the room (and its banner/label): the whole width, or
    // the right part when the name list takes the left side.
    const roomX1 = width - margin;
    const roomX0 = withList ? Math.min(roomX1 - gridW * G, roomX1 - 620) : margin;
    const roomMid = (roomX0 + roomX1) / 2;

    // Student view: whiteboard banner, then period label, then the room.
    // Teacher view: period label, the room, then the whiteboard at the bottom.
    function drawFrontBanner(y0, lineOnTop) {
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#000000";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 3;
      const lineY = lineOnTop ? y0 + frontH * 0.15 : y0 + frontH * 0.8;
      const textY = lineOnTop ? y0 + frontH * 0.15 + frontFont * 1.25 : y0 + frontFont;
      ctx.font = "800 " + Math.round(frontFont) + "px " + FONT;
      ctx.fillText("Whiteboard / Front of Class", roomMid, textY);
      ctx.beginPath();
      ctx.moveTo(roomX0, lineY);
      ctx.lineTo(roomX1, lineY);
      ctx.stroke();
    }
    function drawLabel(y0) {
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#000000";
      ctx.font = "700 " + Math.round(labelFont) + "px " + FONT;
      ctx.fillText(printLabel(period, classroom), roomMid, y0 + labelFont);
    }

    let gridTop;
    if (flipRows) {
      drawLabel(margin);
      gridTop = margin + labelH;
      drawFrontBanner(height - margin - frontH, true);
    } else {
      drawFrontBanner(margin, false);
      drawLabel(margin + frontH);
      gridTop = margin + frontH + labelH;
    }
    const availH = height - margin * 2 - frontH - labelH;
    const gridX = roomMid - (gridW * G) / 2;
    const gridY = gridTop + (availH - gridH * G) / 2;

    const tableNumbers = App.util.numberTables(layout);
    const autoPhoneNumbers = classroom.autoAssignPhoneNumbers ? App.util.computeAutoPhoneNumbers(layout) : null;

    groups.forEach((g) => {
      const row = flipRows ? layout.rows - 1 - g.row : g.row;
      const col = flipCols ? layout.cols - 1 - g.col : g.col;
      const x = gridX + col * (cellW + TABLE_GAP) * G;
      const y = gridY + row * (cellH + TABLE_GAP) * G;
      const tableW = (TABLE_PAD * 2 + g.seatCols * SEAT_W + (g.seatCols - 1) * SEAT_GAP) * G;
      const tableH = (HEADER_H + TABLE_PAD * 2 + g.seatRows * SEAT_H + (g.seatRows - 1) * SEAT_GAP) * G;

      ctx.strokeStyle = g.isFront ? "#b5750a" : "#000000";
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, tableW, tableH, 10 * G);
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = g.isFront ? "#b5750a" : "#000000";
      ctx.font = "800 " + Math.round(tableFont * G) + "px " + FONT;
      ctx.fillText("Table " + tableNumbers[g.id], x + TABLE_PAD * G, y + (HEADER_H - 6) * G);

      const capacity = App.seating.groupCapacity(g);
      const seatW = SEAT_W * G, seatH = SEAT_H * G;
      for (let i = 0; i < capacity; i++) {
        const sr0 = Math.floor(i / g.seatCols);
        const sc0 = i % g.seatCols;
        const sr = flipRows ? g.seatRows - 1 - sr0 : sr0;
        const sc = flipCols ? g.seatCols - 1 - sc0 : sc0;
        const sx = x + (TABLE_PAD + sc * (SEAT_W + SEAT_GAP)) * G;
        const sy = y + (HEADER_H + TABLE_PAD + sr * (SEAT_H + SEAT_GAP)) * G;

        const sid = App.seating.seatId(g.id, i);
        const studentId = period.assignment[sid];
        const student = studentId ? period.students.find((s) => s.id === studentId) : null;
        const marker = App.util.getSeatMarker(classroom, i);

        ctx.fillStyle = slide && !student ? "#f2f2f2" : "#ffffff";
        ctx.strokeStyle = "#999999";
        ctx.lineWidth = 1.5;
        roundRect(ctx, sx, sy, seatW, seatH, 6 * G);
        ctx.fill();
        ctx.stroke();

        if (marker.type === "color") {
          ctx.beginPath();
          ctx.arc(sx + seatW - markerInset * G, sy + markerInset * G, markerFont * 0.45 * G, 0, Math.PI * 2);
          ctx.fillStyle = marker.swatch;
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(0,0,0,0.35)";
          ctx.stroke();
        } else {
          ctx.textAlign = "right";
          ctx.textBaseline = "alphabetic";
          ctx.fillStyle = marker.textColor === "red" ? "#c0392b" : "#000000";
          ctx.font = "700 " + Math.round(markerFont * G) + "px " + FONT;
          ctx.fillText(marker.symbol, sx + seatW - 6 * G, sy + (markerFont + 3) * G);
        }

        const phoneLine = autoPhoneNumbers
          ? "#" + autoPhoneNumbers[sid]
          : (student && student.phoneNumber ? "#" + student.phoneNumber : null);
        const phoneBand = phoneLine ? 15 * G : 0;

        ctx.textAlign = "center";
        ctx.fillStyle = "#000000";
        if (slide) {
          if (student) {
            // Name box sits left of the seat symbol in the top-right corner.
            const boxW = seatW - 38 * G, boxCx = sx + 6 * G + boxW / 2;
            const fit = fitName(ctx, names[student.id] || "(unnamed)", boxW, seatH - phoneBand - 6 * G, "700");
            ctx.font = "700 " + fit.size + "px " + FONT;
            ctx.textBaseline = "middle";
            const lineH = fit.size * 1.1;
            const cy = sy + (seatH - phoneBand) / 2 + 2 * G;
            fit.lines.forEach((line, li) => ctx.fillText(line, boxCx, cy + (li - (fit.lines.length - 1) / 2) * lineH));
            ctx.textBaseline = "alphabetic";
          }
        } else {
          ctx.textBaseline = "alphabetic";
          ctx.font = "600 " + Math.round(13 * G) + "px " + FONT;
          wrapText(ctx, student ? (names[student.id] || "(unnamed)") : "Empty", sx + seatW / 2, sy + seatH / 2 - 2 * G, seatW - 16 * G, 15 * G);
        }

        if (phoneLine) {
          ctx.textBaseline = "alphabetic";
          ctx.font = "400 " + Math.round(11 * G) + "px " + FONT;
          ctx.fillStyle = "#555555";
          ctx.fillText(phoneLine, sx + seatW / 2, sy + seatH - 6 * G);
        }
      }
    });

    if (withList) drawSeatList(ctx, period, classroom, names, tableNumbers, margin, margin, roomX0 - 56 - margin, height - margin * 2);

    return canvas;
  }

  function chartFileName(period, suffix) {
    return (period.label || "seating-chart").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") + suffix;
  }

  function downloadCanvas(canvas, fileName, type, quality) {
    canvas.toBlob((blob) => {
      if (!blob) { alert("Couldn't generate the image."); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, type, quality);
  }

  function downloadChartImage(period, classroom) {
    downloadCanvas(buildChartCanvas(period, classroom, "print"), chartFileName(period, "-seating-chart.jpg"), "image/jpeg", 0.92);
  }

  function downloadSlideImage(period, classroom) {
    downloadCanvas(buildChartCanvas(period, classroom, "slide"), chartFileName(period, "-seating-chart-slide.png"), "image/png");
  }

  // Copies the slide image to the clipboard so it can be pasted straight into
  // Google Slides (Cmd+V). Falls back to a download if the browser says no.
  function copySlideImage(period, classroom, button) {
    const canvas = buildChartCanvas(period, classroom, "slide");
    const blobPromise = new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"));
    if (!navigator.clipboard || !window.ClipboardItem) {
      alert("This browser can't copy images — downloading the slide image instead.");
      downloadSlideImage(period, classroom);
      return;
    }
    navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]).then(() => {
      const original = button.textContent;
      button.textContent = "Copied! Paste into Slides";
      setTimeout(() => { button.textContent = original; }, 2000);
    }).catch(() => {
      alert("Couldn't copy the image — downloading it instead.");
      downloadSlideImage(period, classroom);
    });
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
    const names = App.util.displayNameMap(period.students, classroom.nameDisplay);
    const { flipRows, flipCols } = App.util.chartOrientation(classroom.chartView);
    const grid = el("div", {
      class: "room-grid",
      style: `grid-template-columns: repeat(${layout.cols}, minmax(140px, 1fr)); grid-template-rows: repeat(${layout.rows}, auto);`,
    });

    // Loop over display positions; flip back to the real room position so
    // seat ids (and drag-and-drop) are unaffected by the view.
    for (let dr = 0; dr < layout.rows; dr++) {
      for (let dc = 0; dc < layout.cols; dc++) {
        const r = flipRows ? layout.rows - 1 - dr : dr;
        const c = flipCols ? layout.cols - 1 - dc : dc;
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
        for (let di = 0; di < capacity; di++) {
          const dsr = Math.floor(di / group.seatCols), dsc = di % group.seatCols;
          const sr = flipRows ? group.seatRows - 1 - dsr : dsr;
          const sc = flipCols ? group.seatCols - 1 - dsc : dsc;
          const i = sr * group.seatCols + sc;
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
            el("span", { class: "seat-name", text: student ? (names[student.id] || "(unnamed)") : "Empty" }),
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

  // The chart with its whiteboard bar and period label, in reading order for
  // the current view: whiteboard on top for students, at the bottom for the
  // teacher view. Shared by the live chart and the "print all" pages.
  function buildChartBody(period, classroom, options) {
    const { flipRows } = App.util.chartOrientation(classroom.chartView);
    const frontBar = el("div", { class: "front-bar" + (flipRows ? " bottom" : ""), text: "Whiteboard / Front of Class" });
    const label = el("div", { class: "print-label print-only", text: printLabel(period, classroom) });
    const grid = buildSeatingGrid(period, classroom, options);
    return el("div", { class: "chart-body" }, flipRows ? [label, grid, frontBar] : [frontBar, label, grid]);
  }

  // One printable page for a single period — used to build up the
  // multi-period "print all" job below.
  function buildPrintablePage(period, classroom) {
    const page = el("div", { class: "print-page" });
    page.appendChild(buildChartBody(period, classroom, { interactive: false }));
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
      el("select", {
        title: "Sort A→Z / Z→A by first or last name",
        onchange: (e) => {
          App.store.update((state) => { state.classroom.alphabetizeBy = e.target.value; });
        },
      }, [
        el("option", { value: "first", text: "First name", selected: classroom.alphabetizeBy !== "last" }),
        el("option", { value: "last", text: "Last name", selected: classroom.alphabetizeBy === "last" }),
      ]),
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
    ]));

    const hasAssignment = Object.keys(period.assignment).length > 0;
    const setClassroom = (key) => (e) => App.store.update((state) => { state.classroom[key] = e.target.value; });
    panel.appendChild(el("div", { class: "toolbar-row" }, [
      el("label", { class: "inline-field" }, [
        "Names",
        el("select", { onchange: setClassroom("nameDisplay") }, [
          el("option", { value: "full", text: "Full names", selected: classroom.nameDisplay !== "first" }),
          el("option", { value: "first", text: "First names", selected: classroom.nameDisplay === "first" }),
        ]),
      ]),
      el("label", { class: "inline-field" }, [
        "View",
        el("select", { onchange: setClassroom("chartView") }, [
          el("option", { value: "student", text: "Student view (whiteboard at top)", selected: classroom.chartView === "student" }),
          el("option", { value: "teacher", text: "Teacher view (from the whiteboard)", selected: classroom.chartView === "teacher" }),
          el("option", { value: "mirror", text: "Flip left \u2194 right", selected: classroom.chartView === "mirror" }),
        ]),
      ]),
    ]));

    panel.appendChild(el("div", { class: "toolbar-row" }, [
      el("select", {
        title: "Print & saved-image text size",
        onchange: (e) => {
          App.store.update((state) => { state.classroom.printFontSize = e.target.value; });
        },
      }, Object.keys(App.util.PRINT_FONT_SCALES).map((key) =>
        el("option", {
          value: key,
          text: key === "normal" ? "Normal text" : key === "large" ? "Large text" : "Extra large text",
          selected: (classroom.printFontSize || "normal") === key,
        })
      )),
      el("button", {
        text: "Print",
        disabled: !hasAssignment,
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
        disabled: !hasAssignment,
        onclick: () => downloadChartImage(period, classroom),
      }),
      el("select", {
        title: "What goes on the slide image",
        onchange: setClassroom("slideLayout"),
      }, [
        el("option", { value: "room", text: "Slide: room only", selected: classroom.slideLayout !== "list" }),
        el("option", { value: "list", text: "Slide: room + Find your seat list", selected: classroom.slideLayout === "list" }),
      ]),
      el("button", {
        text: "Copy for Slides",
        title: "Copy a 16:9 slide image of the chart, then paste it into Google Slides",
        disabled: !hasAssignment,
        onclick: (e) => copySlideImage(period, classroom, e.currentTarget),
      }),
      el("button", {
        text: "Download Slide (PNG)",
        title: "Download a 16:9 slide image of the chart",
        disabled: !hasAssignment,
        onclick: () => downloadSlideImage(period, classroom),
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

    panel.appendChild(buildChartBody(period, classroom, { interactive: true }));
    panel.appendChild(el("div", { class: "legend" }, [
      el("span", {}, [el("span", { class: "swatch", style: "background: var(--front-badge)" }), "Front table"]),
      el("span", {}, [el("span", { class: "swatch", style: "background: var(--danger)" }), "Seating rule broken (keep-apart or must-sit-together)"]),
      el("span", {}, [el("span", { class: "swatch", style: "background: var(--warning)" }), "Below preferred minimum per table"]),
      el("span", {}, ["Drag a seated student onto another seat to swap them."]),
    ]));

    return panel;
  }

  App.ui.chart = {
    render,
    clearWarning: (periodId) => { delete lastUnmetByPeriod[periodId]; },
    setWarning: (periodId, unmet) => { lastUnmetByPeriod[periodId] = unmet; },
  };
})();
