// Global app namespace + persisted state store (localStorage-backed, pub/sub).
window.App = window.App || {};

(function () {
  const STORAGE_KEY = "seatingChart.v1";

  function uid(prefix) {
    const rand = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
    return (prefix ? prefix + "-" : "") + rand;
  }

  function makeEmptyPeriod(index) {
    return {
      id: uid("period"),
      label: "Period " + index,
      students: [],
      avoidPairs: [],
      mustPairs: [],
      assignment: {}, // seatId -> studentId
      savedCharts: [], // { id, name, assignment, createdAt, lastUsedAt }
    };
  }

  function defaultClassroom() {
    return {
      layout: { rows: 0, cols: 0, groups: [] },
      preferredPerTable: 4,
      preferredMinPerTable: 2,
      suitPattern: ["spade", "heart", "diamond", "club"],
      autoAssignPhoneNumbers: false,
    };
  }

  function defaultState() {
    const periods = {};
    const order = [];
    for (let i = 1; i <= 5; i++) {
      const p = makeEmptyPeriod(i);
      periods[p.id] = p;
      order.push(p.id);
    }
    return { periodOrder: order, periods, activePeriodId: order[0], classroom: defaultClassroom() };
  }

  // One-time migration for anyone with pre-existing data from when the room
  // layout/preferred table size/seat suits/auto-phone-numbers were stored
  // per-period: carries the first period's settings forward as the new shared
  // classroom setup, since a real classroom doesn't change between periods.
  function migrateToSharedClassroom(state) {
    if (state.classroom) return state;
    const firstPeriod = state.periods[state.periodOrder[0]];
    const fallback = defaultClassroom();
    state.classroom = {
      layout: (firstPeriod && firstPeriod.layout) || fallback.layout,
      preferredPerTable: (firstPeriod && firstPeriod.preferredPerTable) || fallback.preferredPerTable,
      preferredMinPerTable: (firstPeriod && firstPeriod.preferredMinPerTable) || fallback.preferredMinPerTable,
      suitPattern: (firstPeriod && firstPeriod.suitPattern) || fallback.suitPattern,
      autoAssignPhoneNumbers: !!(firstPeriod && firstPeriod.autoAssignPhoneNumbers),
    };
    state.periodOrder.forEach((pid) => {
      const p = state.periods[pid];
      delete p.layout;
      delete p.preferredPerTable;
      delete p.preferredMinPerTable;
      delete p.suitPattern;
      delete p.autoAssignPhoneNumbers;
    });
    return state;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.periods || !parsed.periodOrder) return defaultState();
      return migrateToSharedClassroom(parsed);
    } catch (e) {
      console.error("Failed to load saved data, starting fresh.", e);
      return defaultState();
    }
  }

  const state = load();
  const listeners = [];

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Failed to save data to localStorage.", e);
    }
  }

  function notify() {
    for (const fn of listeners) fn(state);
  }

  const store = {
    state,
    uid,
    subscribe(fn) {
      listeners.push(fn);
      return () => {
        const idx = listeners.indexOf(fn);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    // Run a mutator against the live state, then persist + notify.
    update(mutator) {
      mutator(state);
      persist();
      notify();
    },
    getActivePeriod() {
      return state.periods[state.activePeriodId];
    },
    getClassroom() {
      return state.classroom;
    },
  };

  App.store = store;
})();
