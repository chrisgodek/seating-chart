window.App = window.App || {};

(function () {
  // RFC4180-ish CSV parser: handles quoted fields, embedded commas, escaped quotes.
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        // skip, \n handles the line break
      } else {
        field += c;
      }
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((r) => r.some((f) => f.trim() !== ""));
  }

  // Splits a single "full name" cell into {firstName, lastName}. Handles both
  // "Last, First" and "First Last" notations.
  function parseFullName(full) {
    full = (full || "").trim();
    if (!full) return { firstName: "", lastName: "" };
    if (full.includes(",")) {
      const parts = full.split(",");
      return { lastName: parts[0].trim(), firstName: (parts[1] || "").trim() };
    }
    const idx = full.indexOf(" ");
    if (idx === -1) return { firstName: full, lastName: "" };
    return { firstName: full.slice(0, idx).trim(), lastName: full.slice(idx + 1).trim() };
  }

  // Converts spreadsheet-style rows (array of arrays of strings) into
  // [{firstName, lastName}]. Supports headers like "First Name"/"Last Name",
  // a single "Name" column ("First Last" or "Last, First"), or falls back to
  // treating the first column as a full name with no header.
  function rowsToStudents(rows) {
    if (!rows.length) return [];

    const headerRow = rows[0];
    const looksLikeHeader = headerRow.some((h) => /name/i.test(h));
    const dataRows = looksLikeHeader ? rows.slice(1) : rows;

    let firstIdx = -1, lastIdx = -1, fullIdx = -1;
    if (looksLikeHeader) {
      headerRow.forEach((h, i) => {
        const t = (h || "").trim().toLowerCase();
        if (/^first/.test(t)) firstIdx = i;
        else if (/^last/.test(t)) lastIdx = i;
        else if (fullIdx === -1 && /name/.test(t)) fullIdx = i;
      });
    }
    if (firstIdx === -1 && lastIdx === -1 && fullIdx === -1) {
      // No header to go by. If every row has exactly two columns, assume
      // [First, Last] rather than treating column 1 as a full name and
      // silently dropping column 2 (common when pasting two spreadsheet
      // columns with no header row).
      if (dataRows.length && dataRows.every((r) => r.length === 2)) {
        firstIdx = 0;
        lastIdx = 1;
      } else {
        fullIdx = 0;
      }
    }

    const students = [];
    for (const r of dataRows) {
      let firstName = "", lastName = "";
      if (firstIdx >= 0 || lastIdx >= 0) {
        firstName = (firstIdx >= 0 ? r[firstIdx] || "" : "").trim();
        lastName = (lastIdx >= 0 ? r[lastIdx] || "" : "").trim();
      } else {
        const parsed = parseFullName(r[fullIdx]);
        firstName = parsed.firstName;
        lastName = parsed.lastName;
      }
      if (!firstName && !lastName) continue;
      students.push({ firstName, lastName });
    }
    return students;
  }

  // Parses roster CSV text into [{firstName, lastName}].
  function parseRoster(text) {
    return rowsToStudents(parseCSV(text));
  }

  // Parses a plain-text roster, one name per line ("First Last" or "Last, First").
  function parseTextRoster(text) {
    return text
      .split(/\r\n|\r|\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseFullName(line))
      .filter((s) => s.firstName || s.lastName);
  }

  // Parses a block of pasted text: one student per line, either a plain name
  // ("First Last" or "Last, First") or two spreadsheet columns pasted with a
  // tab between them (e.g. copied straight out of Excel/Sheets). Each line is
  // judged on its own — unlike a real CSV file, a paste can freely mix plain
  // names and tab-separated pairs line to line. A leading header line
  // ("First Name\tLast Name") is detected and skipped.
  function parsePastedRoster(text) {
    const lines = text.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];

    const firstLineIsHeader = lines[0].includes("\t") &&
      lines[0].split("\t").some((f) => /^first\b|^last\b|name/i.test(f.trim()));
    const dataLines = firstLineIsHeader ? lines.slice(1) : lines;

    const students = [];
    dataLines.forEach((line) => {
      let firstName = "", lastName = "";
      if (line.includes("\t")) {
        const parts = line.split("\t").map((p) => p.trim());
        firstName = parts[0] || "";
        lastName = parts[1] || "";
      } else {
        const parsed = parseFullName(line);
        firstName = parsed.firstName;
        lastName = parsed.lastName;
      }
      if (firstName || lastName) students.push({ firstName, lastName });
    });
    return students;
  }

  App.csv = { parseCSV, parseRoster, parseTextRoster, parsePastedRoster };
})();
