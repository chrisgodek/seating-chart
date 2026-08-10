window.App = window.App || {};

(function () {
  function fullName(student) {
    return [student.firstName, student.lastName].filter(Boolean).join(" ").trim();
  }

  // The string to alphabetize a student by — first name or last name led,
  // with the other name as a tiebreaker. Used by the A→Z / Z→A seating modes.
  function sortableName(student, by) {
    const first = (student.firstName || "").trim();
    const last = (student.lastName || "").trim();
    return by === "last" ? [last, first].filter(Boolean).join(" ") : [first, last].filter(Boolean).join(" ");
  }

  function formatTimestamp(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) +
      " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  const SUITS = {
    spade: { symbol: "♠", color: "dark", label: "Spades" },
    heart: { symbol: "♥", color: "red", label: "Hearts" },
    diamond: { symbol: "♦", color: "red", label: "Diamonds" },
    club: { symbol: "♣", color: "dark", label: "Clubs" },
  };

  const COLORS = {
    blue: { swatch: "#3b82f6", label: "Blue" },
    yellow: { swatch: "#eab308", label: "Yellow" },
    green: { swatch: "#22c55e", label: "Green" },
    red: { swatch: "#ef4444", label: "Red" },
  };

  // Table display numbers ("Table 1", "Table 2"...), assigned front-to-back,
  // left-to-right by grid position so they stay stable as tables are edited.
  function numberTables(layout) {
    const sorted = layout.groups.slice().sort((a, b) => (a.row - b.row) || (a.col - b.col));
    const numbers = {};
    sorted.forEach((g, i) => { numbers[g.id] = i + 1; });
    return numbers;
  }

  // Which suit belongs at a given seat index within a table (reading order:
  // top-left, top-right, bottom-left, bottom-right for a 2x2 table). The
  // 4-entry pattern repeats for tables with more than 4 seats.
  function suitForSeatIndex(suitPattern, index) {
    const pattern = suitPattern && suitPattern.length ? suitPattern : ["spade", "heart", "diamond", "club"];
    return pattern[index % pattern.length];
  }

  // Which color belongs at a given seat index — same reading-order/repeat rules as suits.
  function colorForSeatIndex(colorPattern, index) {
    const pattern = colorPattern && colorPattern.length ? colorPattern : ["blue", "yellow", "green", "red"];
    return pattern[index % pattern.length];
  }

  // Unified lookup for whichever seat-marker style the classroom is using
  // (playing-card suits or plain colors), so callers don't need to branch.
  function getSeatMarker(classroom, index) {
    if (classroom.seatMarkerType === "color") {
      const key = colorForSeatIndex(classroom.colorPattern, index);
      return { type: "color", key, swatch: COLORS[key].swatch, label: COLORS[key].label };
    }
    const key = suitForSeatIndex(classroom.suitPattern, index);
    return { type: "suit", key, symbol: SUITS[key].symbol, textColor: SUITS[key].color, label: SUITS[key].label };
  }

  // Auto-assigned phone hotel numbers: Table 1's seats get #1..N, Table 2
  // continues where Table 1 left off, and so on — tied to the seat/table, not
  // whichever student happens to sit there, so it stays correct across reshuffles.
  function computeAutoPhoneNumbers(layout) {
    const sorted = layout.groups.slice().sort((a, b) => (a.row - b.row) || (a.col - b.col));
    const numbers = {};
    let counter = 1;
    sorted.forEach((g) => {
      const capacity = App.seating.groupCapacity(g);
      for (let i = 0; i < capacity; i++) {
        numbers[App.seating.seatId(g.id, i)] = counter++;
      }
    });
    return numbers;
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    attrs = attrs || {};
    for (const key in attrs) {
      const val = attrs[key];
      if (val === undefined || val === null || val === false) continue;
      if (key === "class") node.className = val;
      else if (key === "text") node.textContent = val;
      else if (key === "html") node.innerHTML = val;
      else if (key.startsWith("on") && typeof val === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), val);
      } else if (key in node) {
        try { node[key] = val; } catch (e) { node.setAttribute(key, val); }
      } else {
        node.setAttribute(key, val);
      }
    }
    (children || []).forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  App.util = { fullName, sortableName, formatTimestamp, el, SUITS, COLORS, numberTables, suitForSeatIndex, colorForSeatIndex, getSeatMarker, computeAutoPhoneNumbers };
})();
