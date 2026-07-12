// Dependency-free RFC-4180 CSV serialization + a text/csv attachment response
// helper. This is the ONLY place in the server that emits a non-JSON response
// (every other handler goes through utils/apiResponse.js), so the deviation
// from the JSON convention is contained here and in the export module.

const LINE_BREAK = '\r\n';

// A field is quoted when it contains a comma, double-quote, CR, or LF. Embedded
// double-quotes are escaped by doubling them (RFC 4180 §2.6/2.7).
function escapeField(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const str = typeof value === 'string' ? value : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

// rows: array of plain objects. columns: [{ key, header? }] — header defaults to
// key. Emits a header line followed by one line per row.
function toCsv(rows, columns) {
  const headerLine = columns.map((col) => escapeField(col.header ?? col.key)).join(',');
  const dataLines = rows.map((row) => columns.map((col) => escapeField(row[col.key])).join(','));
  return [headerLine, ...dataLines].join(LINE_BREAK);
}

// A titled block: a title line, a blank line, then the header + rows. Used to
// stack several tables into one downloadable CSV (multi-profile MySporty export
// and the multi-dataset admin exports).
function toCsvSection(title, rows, columns) {
  return `${escapeField(title)}${LINE_BREAK}${LINE_BREAK}${toCsv(rows, columns)}`;
}

// Join titled sections with a blank line between them. Falsy sections (e.g. a
// dataset the caller chose to omit) are dropped.
function joinSections(sections) {
  return sections.filter(Boolean).join(`${LINE_BREAK}${LINE_BREAK}`);
}

// Send a CSV string as a file download. Sets Content-Disposition: attachment via
// res.attachment(), forces text/csv, and prepends a UTF-8 BOM so Excel opens
// UTF-8 content (accents, etc.) correctly.
const BOM = '\uFEFF';

function sendCsv(res, filename, csv) {
  res.attachment(filename);
  res.type('text/csv; charset=utf-8');
  res.send(`${BOM}${csv}`);
}

module.exports = {
  toCsv,
  toCsvSection,
  joinSections,
  sendCsv,
};
