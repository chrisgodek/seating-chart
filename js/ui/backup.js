window.App = window.App || {};
App.ui = App.ui || {};

// Download Backup / Restore Backup. Everything lives in this browser's
// storage, which can be wiped (e.g. Safari clears sites unused for 7 days),
// so a backup file is the way to keep classes safe or move them elsewhere.
(function () {
  const { el } = App.util;
  const REMIND_AFTER_DAYS = 14;

  function daysSince(iso) {
    return iso ? (Date.now() - new Date(iso).getTime()) / 86400000 : Infinity;
  }

  function relativeTime(iso) {
    const days = daysSince(iso);
    if (days < 1) return "today";
    if (days < 2) return "yesterday";
    if (days < 14) return Math.floor(days) + " days ago";
    if (days < 60) return Math.floor(days / 7) + " weeks ago";
    return Math.floor(days / 30) + " months ago";
  }

  function downloadBackup() {
    const now = new Date();
    App.store.update((state) => { state.lastBackupAt = now.toISOString(); });
    const backup = { app: "seating-chart", version: 1, exportedAt: now.toISOString(), data: App.store.state };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const pad = (n) => String(n).padStart(2, "0");
    a.href = url;
    a.download = `seating-chart-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function restoreFromText(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
    // Accept our backup wrapper, or a bare state object.
    const data = parsed && parsed.data ? parsed.data : parsed;
    if (!App.store.isValidState(data)) {
      alert("That file isn't a Seating Chart backup.");
      return;
    }
    const studentCount = data.periodOrder.reduce((n, id) => n + ((data.periods[id].students || []).length), 0);
    const when = parsed.exportedAt ? " from " + App.util.formatTimestamp(parsed.exportedAt) : "";
    if (!window.confirm(`Restore this backup${when} (${studentCount} students)?\n\nThis replaces ALL classes, rosters, layouts and saved charts currently in this browser.`)) return;
    App.store.replaceAll(data);
  }

  function render(state) {
    const fileInput = el("input", { type: "file", accept: ".json,application/json", style: "display:none" });
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => restoreFromText(String(reader.result));
      reader.readAsText(file);
    });

    const hasStudents = state.periodOrder.some((id) => state.periods[id].students.length > 0);
    const stale = hasStudents && daysSince(state.lastBackupAt) > REMIND_AFTER_DAYS;
    const status = state.lastBackupAt ? "Last backup: " + relativeTime(state.lastBackupAt) : "Not backed up yet";

    return el("div", { class: "backup-bar" }, [
      el("span", {
        class: "backup-status" + (stale ? " stale" : ""),
        text: status,
        title: "Your classes are saved only in this browser. Download a backup now and then to keep them safe.",
      }),
      el("button", { text: "Download Backup", class: stale ? "primary" : "", onclick: downloadBackup }),
      el("button", { text: "Restore Backup", onclick: () => fileInput.click() }),
      fileInput,
    ]);
  }

  App.ui.backup = { render };
})();
