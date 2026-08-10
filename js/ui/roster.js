window.App = window.App || {};
App.ui = App.ui || {};

(function () {
  const { el, fullName } = App.util;
  let selectedIds = new Set();
  let lastPeriodId = null;
  let pasteBoxOpen = false;

  function toggleSelect(id) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
  }

  function getSelected() {
    return Array.from(selectedIds);
  }

  function clearSelected() {
    selectedIds.clear();
  }

  function render(period, classroom) {
    if (period.id !== lastPeriodId) {
      selectedIds.clear();
      pasteBoxOpen = false;
      lastPeriodId = period.id;
    }

    const panel = el("div", { class: "panel" });
    panel.appendChild(el("div", { class: "section-title", text: "Roster — " + period.students.length + " students" }));

    const courseNameInput = el("input", { type: "text", placeholder: "e.g., IM2", value: period.courseName || "", style: "width: 200px;" });
    courseNameInput.addEventListener("change", () => {
      App.store.update((state) => {
        state.periods[period.id].courseName = courseNameInput.value.trim();
      });
    });
    panel.appendChild(el("div", { class: "layout-config-row" }, [
      el("div", { class: "field" }, [el("label", { text: "Course name" }), courseNameInput]),
    ]));
    panel.appendChild(el("div", { class: "hint", text: `Shown on the printed chart, e.g. "${period.label} - IM2".` }));

    function addParsedStudents(parsed) {
      if (!parsed.length) {
        alert("No students found in that file.");
        return;
      }
      App.store.update((state) => {
        const p = state.periods[period.id];
        const existing = new Set(p.students.map((s) => (s.firstName + "|" + s.lastName).toLowerCase()));
        parsed.forEach((s) => {
          const key = (s.firstName + "|" + s.lastName).toLowerCase();
          if (existing.has(key)) return;
          existing.add(key);
          p.students.push({ id: App.store.uid("student"), firstName: s.firstName, lastName: s.lastName, front: false, phoneNumber: "" });
        });
      });
    }

    const fileInput = el("input", { type: "file", accept: ".csv,.txt,text/csv,text/plain", style: "display:none" });
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const name = file.name.toLowerCase();
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result);
        addParsedStudents(name.endsWith(".txt") ? App.csv.parseTextRoster(text) : App.csv.parseRoster(text));
      };
      reader.readAsText(file);
      e.target.value = "";
    });

    const toolbar = el("div", { class: "toolbar-row" }, [
      el("button", { text: "Upload Roster", onclick: () => fileInput.click() }),
      el("button", {
        text: pasteBoxOpen ? "Cancel Paste" : "Paste List",
        onclick: () => { pasteBoxOpen = !pasteBoxOpen; App.rerender(); },
      }),
      el("button", {
        class: "danger",
        text: "Clear Roster",
        disabled: !period.students.length,
        onclick: () => {
          if (!window.confirm(`Remove all ${period.students.length} student(s) from ${period.label}? This also clears their pairing rules and current seating for this period.`)) return;
          clearSelected();
          App.ui.chart.clearWarning(period.id);
          App.store.update((state) => {
            const p = state.periods[period.id];
            p.students = [];
            p.avoidPairs = [];
            p.mustPairs = [];
            p.assignment = {};
          });
        },
      }),
      fileInput,
    ]);
    panel.appendChild(toolbar);
    panel.appendChild(el("div", { class: "hint", text: "CSV or a plain text file with one name per line." }));

    if (pasteBoxOpen) {
      const textarea = el("textarea", {
        class: "paste-textarea",
        rows: 6,
        placeholder: "Paste names here, one per line — \"Alice Anderson\", \"Anderson, Alice\", or two columns copied straight from a spreadsheet.",
      });
      const addPastedBtn = el("button", {
        class: "primary",
        text: "Add Pasted Names",
        onclick: () => {
          const parsed = App.csv.parsePastedRoster(textarea.value);
          if (!parsed.length) {
            alert("No students found in that text.");
            return;
          }
          pasteBoxOpen = false;
          addParsedStudents(parsed);
        },
      });
      panel.appendChild(el("div", { class: "paste-box" }, [
        textarea,
        el("div", { class: "toolbar-row" }, [
          addPastedBtn,
          el("button", { text: "Cancel", onclick: () => { pasteBoxOpen = false; App.rerender(); } }),
        ]),
      ]));
    }

    const firstInput = el("input", { type: "text", placeholder: "First name" });
    const lastInput = el("input", { type: "text", placeholder: "Last name" });
    const addStudent = () => {
      const firstName = firstInput.value.trim();
      const lastName = lastInput.value.trim();
      if (!firstName && !lastName) return;
      App.store.update((state) => {
        state.periods[period.id].students.push({ id: App.store.uid("student"), firstName, lastName, front: false, phoneNumber: "" });
      });
    };
    firstInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addStudent(); });
    lastInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addStudent(); });
    panel.appendChild(el("div", { class: "toolbar-row" }, [
      firstInput,
      lastInput,
      el("button", { text: "Add", onclick: addStudent }),
    ]));

    if (classroom.autoAssignPhoneNumbers) {
      panel.appendChild(el("div", { class: "hint", text: "Phone hotel numbers are auto-assigned by table (see Classroom Layout). Manual numbers below are ignored while that's on." }));
    }

    if (selectedIds.size >= 2) {
      panel.appendChild(el("div", { class: "hint", text: selectedIds.size + " selected — use the Constraints panel below to pair them." }));
    } else {
      panel.appendChild(el("div", { class: "hint", text: "Check two or more students to create a must-sit or avoid-sit pair." }));
    }

    if (!period.students.length) {
      panel.appendChild(el("div", { class: "empty-state", text: "No students yet. Upload a roster or add students above." }));
      return panel;
    }

    const list = el("div", { class: "roster-list" });
    period.students
      .slice()
      .sort((a, b) => fullName(a).localeCompare(fullName(b)))
      .forEach((s) => {
        const checkbox = el("input", {
          type: "checkbox",
          checked: selectedIds.has(s.id),
          onchange: () => { toggleSelect(s.id); App.rerender(); },
        });

        const phoneInput = el("input", {
          type: "text",
          class: "phone-input",
          placeholder: "#",
          title: "Phone hotel number",
          value: s.phoneNumber || "",
          disabled: !!classroom.autoAssignPhoneNumbers,
        });
        phoneInput.addEventListener("change", () => {
          App.store.update((state) => {
            const stu = state.periods[period.id].students.find((x) => x.id === s.id);
            stu.phoneNumber = phoneInput.value.trim();
          });
        });

        const frontBtn = el("button", {
          class: "small" + (s.front ? " front-badge" : ""),
          text: "Front",
          style: s.front ? "border:none;" : undefined,
          onclick: () => {
            App.store.update((state) => {
              const stu = state.periods[period.id].students.find((x) => x.id === s.id);
              stu.front = !stu.front;
            });
          },
        });

        const deleteBtn = el("button", {
          class: "small danger row-delete",
          text: "✕",
          onclick: () => {
            App.store.update((state) => {
              const p = state.periods[period.id];
              p.students = p.students.filter((x) => x.id !== s.id);
              p.avoidPairs = p.avoidPairs.filter(([a, b]) => a !== s.id && b !== s.id);
              p.mustPairs = p.mustPairs.filter(([a, b]) => a !== s.id && b !== s.id);
              Object.keys(p.assignment).forEach((seat) => {
                if (p.assignment[seat] === s.id) delete p.assignment[seat];
              });
            });
          },
        });

        const row = el("div", { class: "roster-row" + (selectedIds.has(s.id) ? " selected" : "") }, [
          checkbox,
          el("span", { class: "name", text: fullName(s) || "(unnamed)" }),
          phoneInput,
          frontBtn,
          deleteBtn,
        ]);
        list.appendChild(row);
      });
    panel.appendChild(list);

    return panel;
  }

  App.ui.roster = { render, getSelected, clearSelected };
})();
