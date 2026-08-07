window.App = window.App || {};

(function () {
  function seatId(groupId, index) {
    return groupId + ":" + index;
  }

  function groupCapacity(g) {
    return g.seatRows * g.seatCols;
  }

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildClusters(students, mustPairs) {
    const parent = {};
    students.forEach((s) => { parent[s.id] = s.id; });
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
    const studentIds = new Set(students.map((s) => s.id));
    (mustPairs || []).forEach(([a, b]) => {
      if (studentIds.has(a) && studentIds.has(b)) union(a, b);
    });
    const groups = {};
    students.forEach((s) => {
      const root = find(s.id);
      (groups[root] = groups[root] || []).push(s);
    });
    return Object.values(groups).map((members) => ({
      id: "cluster-" + members[0].id,
      members,
      isFront: members.some((m) => m.front),
      size: members.length,
    }));
  }

  // Splits `totalSize` people across the fewest tables possible (front-to-back
  // order), as evenly as possible, so seating can aim for each used table to
  // land on or near the preferred minimum instead of packing one table full
  // and leaving a thin leftover. Returns {groupId: targetHeadcount}.
  function computeTargets(tables, totalSize, preferredMax) {
    const targets = {};
    if (!tables.length) return targets;
    if (totalSize <= 0) { tables.forEach((t) => { targets[t.id] = 0; }); return targets; }
    const k = Math.max(1, Math.min(tables.length, Math.ceil(totalSize / preferredMax)));
    const base = Math.floor(totalSize / k);
    const extra = totalSize % k;
    tables.forEach((t, i) => { targets[t.id] = i < k ? base + (i < extra ? 1 : 0) : 0; });
    return targets;
  }

  // Places clusters into groups from `groupPool` (each {id, row, capacity}).
  // Candidates are ordered front-row-first (so a row fills before the next one
  // opens — "auto-populate from the front"), then by which table is furthest
  // below its fair-share `target` (so students spread evenly toward the
  // preferred minimum instead of maxing out one table before the next), with
  // random jitter to break ties so seating still varies between randomizations.
  // Prefers a candidate that avoids co-locating an "avoid pair". Mutates
  // `remainingCap` and `occupancy` (groupId -> studentId[]); returns unplaced clusters.
  function placeClusters(clusters, groupPool, occupancy, remainingCap, avoidSet, violations, targets) {
    const unplaced = [];
    for (const cluster of shuffled(clusters)) {
      const candidates = groupPool
        .filter((g) => remainingCap[g.id] >= cluster.size)
        .map((g) => ({ g, jitter: Math.random() }))
        .sort((a, b) => {
          if (a.g.row !== b.g.row) return a.g.row - b.g.row;
          const deficitA = (targets[a.g.id] || 0) - (a.g.capacity - remainingCap[a.g.id]);
          const deficitB = (targets[b.g.id] || 0) - (b.g.capacity - remainingCap[b.g.id]);
          if (deficitA !== deficitB) return deficitB - deficitA;
          // Deficit is tied — let randomness (not "which table already has more people")
          // decide, so e.g. front-priority students actually spread across front tables
          // instead of always stacking into whichever one got the first pick.
          return a.jitter - b.jitter;
        })
        .map((x) => x.g);
      if (!candidates.length) { unplaced.push(cluster); continue; }
      // Prefer a candidate group with no existing occupant on this cluster's avoid-list.
      let chosen = candidates.find((g) => {
        const occupants = occupancy[g.id] || [];
        return !occupants.some((occId) =>
          cluster.members.some((m) => avoidSet.has(m.id + "|" + occId) || avoidSet.has(occId + "|" + m.id))
        );
      });
      if (!chosen) chosen = candidates[0];
      occupancy[chosen.id] = (occupancy[chosen.id] || []).concat(cluster.members.map((m) => m.id));
      remainingCap[chosen.id] -= cluster.size;
      // Count any avoid-pair violations created by this placement.
      const occupants = (occupancy[chosen.id] || []).slice(0, -cluster.size);
      cluster.members.forEach((m) => {
        occupants.forEach((occId) => {
          if (avoidSet.has(m.id + "|" + occId) || avoidSet.has(occId + "|" + m.id)) violations.push([m.id, occId]);
        });
      });
    }
    return unplaced;
  }

  // Runs one full randomized placement attempt; returns { occupancy, score, unplacedIds, frontOverflowCount }.
  function attempt(students, layout, avoidPairs, mustPairs, preferredMax, preferredMin) {
    const clusters = buildClusters(students, mustPairs);
    const frontClusters = clusters.filter((c) => c.isFront);
    const normalClusters = clusters.filter((c) => !c.isFront);

    // Front-flagged tables — only front-priority students are restricted to this pool.
    const frontGroups = layout.groups.filter((g) => g.isFront)
      .map((g) => ({ id: g.id, row: g.row, capacity: Math.min(groupCapacity(g), preferredMax) }))
      .sort((a, b) => a.row - b.row);
    // Every table, front and normal — everyone else (and front overflow) can use any of these,
    // so a front table with more seats than front-priority students still ends up full.
    const allGroups = layout.groups
      .map((g) => ({ id: g.id, row: g.row, capacity: Math.min(groupCapacity(g), preferredMax) }))
      .sort((a, b) => a.row - b.row);

    const totalSize = frontClusters.reduce((n, c) => n + c.size, 0) + normalClusters.reduce((n, c) => n + c.size, 0);
    const targets = computeTargets(allGroups, totalSize, preferredMax);

    const remainingCap = {};
    allGroups.forEach((g) => { remainingCap[g.id] = g.capacity; });
    const occupancy = {};
    const avoidSet = new Set();
    (avoidPairs || []).forEach(([a, b]) => avoidSet.add(a + "|" + b));

    const violations = [];
    // Front-priority students go into front tables first, spread across whichever front
    // tables need them most (targets are shared room-wide, so this still favors the
    // frontmost tables) rather than stacking every front-priority student into one table.
    let unplacedFront = placeClusters(frontClusters, frontGroups, occupancy, remainingCap, avoidSet, violations, targets);
    // If front tables genuinely can't hold every front-priority student, the rest spill anywhere.
    let overflowUnplaced = placeClusters(unplacedFront, allGroups, occupancy, remainingCap, avoidSet, violations, targets);
    // Everyone else fills whatever's left, front tables included — this is what auto-fills
    // front seats a front-priority student didn't need with regular students instead of
    // leaving them empty.
    let unplacedNormal = placeClusters(normalClusters, allGroups, occupancy, remainingCap, avoidSet, violations, targets);

    const unplacedClusters = overflowUnplaced.concat(unplacedNormal);
    const unplacedIds = [];
    unplacedClusters.forEach((c) => c.members.forEach((m) => unplacedIds.push(m.id)));

    // Tables left with a nonzero but below-preferred-minimum headcount are penalized
    // so the randomized search favors solidly-filled tables over thinly-spread ones.
    let thinPenalty = 0;
    layout.groups.forEach((g) => {
      const count = (occupancy[g.id] || []).length;
      if (count > 0 && count < preferredMin) thinPenalty += preferredMin - count;
    });

    const frontOverflowCount = unplacedFront.reduce((n, c) => n + c.size, 0);
    const score = violations.length * 10 + unplacedIds.length * 100 + frontOverflowCount * 5 + thinPenalty * 4;
    return {
      occupancy,
      score,
      unplacedIds,
      avoidViolations: violations,
      frontOverflowCount,
    };
  }

  // Main entry point: assigns students to seats for the given period's roster,
  // using the shared classroom's layout/preferences.
  // Returns { assignment: {seatId: studentId}, unmet: {unplacedIds, avoidViolations, frontOverflowCount} }.
  function assignSeats(period, classroom) {
    const students = period.students;
    const layout = classroom.layout;
    const preferredMax = classroom.preferredPerTable || 4;
    const preferredMin = classroom.preferredMinPerTable || 1;

    if (!students.length || !layout.groups.length) {
      return { assignment: {}, unmet: { unplacedIds: students.map((s) => s.id), avoidViolations: [], frontOverflowCount: 0 } };
    }

    const ATTEMPTS = 120;
    let best = null;
    for (let i = 0; i < ATTEMPTS; i++) {
      const result = attempt(students, layout, period.avoidPairs, period.mustPairs, preferredMax, preferredMin);
      if (!best || result.score < best.score) best = result;
      if (best.score === 0) break;
    }

    // Convert group occupancy into concrete seat ids.
    const assignment = {};
    for (const g of layout.groups) {
      const occupants = best.occupancy[g.id] || [];
      occupants.forEach((studentId, i) => {
        assignment[seatId(g.id, i)] = studentId;
      });
    }

    return {
      assignment,
      unmet: {
        unplacedIds: best.unplacedIds,
        avoidViolations: best.avoidViolations,
        frontOverflowCount: best.frontOverflowCount,
      },
    };
  }

  // Fills seats in a fixed order (not randomized): front-priority students first
  // into front tables (front-to-back), then everyone else — still in the same
  // sorted order — fills whatever's left, front tables included. Used by the
  // A→Z / Z→A seating modes.
  function fillInOrder(groups, queue, assignment, usedIds, preferredMax) {
    let qi = 0;
    for (const g of groups) {
      const cap = Math.min(groupCapacity(g), preferredMax);
      for (let i = 0; i < cap; i++) {
        const sid = seatId(g.id, i);
        if (assignment[sid]) continue;
        while (qi < queue.length && usedIds.has(queue[qi].id)) qi++;
        if (qi >= queue.length) continue;
        assignment[sid] = queue[qi].id;
        usedIds.add(queue[qi].id);
        qi++;
      }
    }
  }

  // Main entry point for alphabetical (or reverse-alphabetical) seating.
  // direction: "asc" or "desc". Returns the same shape as assignSeats().
  function assignSeatsOrdered(period, classroom, direction) {
    const layout = classroom.layout;
    const preferredMax = classroom.preferredPerTable || 4;

    if (!period.students.length || !layout.groups.length) {
      return { assignment: {}, unmet: { unplacedIds: period.students.map((s) => s.id), avoidViolations: [], frontOverflowCount: 0 } };
    }

    const groupsByRow = layout.groups.slice().sort((a, b) => (a.row - b.row) || (a.col - b.col));
    const frontGroups = groupsByRow.filter((g) => g.isFront);

    const sorted = period.students.slice().sort((a, b) => App.util.fullName(a).localeCompare(App.util.fullName(b)));
    if (direction === "desc") sorted.reverse();

    const assignment = {};
    const usedIds = new Set();

    // Front-priority students claim front seats first, in the chosen order.
    const frontQueue = sorted.filter((s) => s.front);
    fillInOrder(frontGroups, frontQueue, assignment, usedIds, preferredMax);

    // Everyone not yet seated (leftover front-priority + everyone else), still
    // in the same order, fills whatever's left — front tables included.
    fillInOrder(groupsByRow, sorted, assignment, usedIds, preferredMax);

    const unplacedIds = sorted.filter((s) => !usedIds.has(s.id)).map((s) => s.id);
    let frontOverflowCount = 0;
    frontQueue.forEach((s) => {
      const seatEntry = Object.keys(assignment).find((sid) => assignment[sid] === s.id);
      const groupId = seatEntry ? seatEntry.split(":")[0] : null;
      const group = groupId ? layout.groups.find((g) => g.id === groupId) : null;
      if (!group || !group.isFront) frontOverflowCount++;
    });

    return {
      assignment,
      unmet: { unplacedIds, avoidViolations: [], frontOverflowCount },
    };
  }

  App.seating = { seatId, groupCapacity, assignSeats, assignSeatsOrdered };
})();
