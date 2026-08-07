window.App = window.App || {};

// Pointer-events-based drag-and-drop for swapping two seats. Works uniformly
// across mouse and touch (avoids HTML5 DnD's poor touch/Safari support).
(function () {
  function attach(container, onSwap) {
    let dragState = null;

    function clearDragOver() {
      container.querySelectorAll(".seat.drag-over").forEach((el) => el.classList.remove("drag-over"));
    }

    container.addEventListener("pointerdown", (e) => {
      const seatEl = e.target.closest(".seat");
      if (!seatEl || !seatEl.classList.contains("filled")) return;
      e.preventDefault();
      dragState = { fromId: seatEl.dataset.seatId, seatEl };
      try { seatEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      seatEl.classList.add("dragging");
    });

    container.addEventListener("pointermove", (e) => {
      if (!dragState) return;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const seatEl = target && target.closest && target.closest(".seat");
      clearDragOver();
      if (seatEl && seatEl !== dragState.seatEl) seatEl.classList.add("drag-over");
    });

    function finish(e) {
      if (!dragState) return;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const seatEl = target && target.closest && target.closest(".seat");
      clearDragOver();
      dragState.seatEl.classList.remove("dragging");
      if (seatEl && seatEl !== dragState.seatEl && seatEl.dataset.seatId) {
        onSwap(dragState.fromId, seatEl.dataset.seatId);
      }
      dragState = null;
    }

    container.addEventListener("pointerup", finish);
    container.addEventListener("pointercancel", () => {
      if (dragState) dragState.seatEl.classList.remove("dragging");
      dragState = null;
      clearDragOver();
    });
  }

  App.dnd = { attach };
})();
