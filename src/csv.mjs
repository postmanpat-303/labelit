export function parseCsv(source, separator = ",") {
  source = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const records = [];
  let row = [];
  let value = "";
  let quoted = false;
  let closed = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        value += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else {
        value += char;
      }
    } else if (char === separator || char === "\n") {
      row.push(value);
      value = "";
      closed = false;
      if (char === "\n") {
        if (row.some(cell => cell !== "") || row.length > 1) records.push(row);
        row = [];
      }
    } else if (closed || (char === '"' && value !== "")) {
      throw new Error(`Unexpected character near CSV record ${records.length + 1}.`);
    } else if (char === '"') {
      quoted = true;
    } else {
      value += char;
    }
  }
  if (quoted) throw new Error("A quoted CSV field is missing its closing quote.");
  if (row.length || value !== "" || closed) records.push([...row, value]);
  const columns = records.shift()?.map(cell => cell.trim());
  if (!columns?.length || columns.some(cell => !cell) || new Set(columns).size !== columns.length) {
    throw new Error("The first CSV row must contain a unique name for each column.");
  }
  if (!records.length) throw new Error("The CSV has column names but no data rows.");
  const invalid = records.findIndex(record => record.length !== columns.length);
  if (invalid !== -1) throw new Error(`Data row ${invalid + 1} has the wrong number of columns.`);
  return { columns, records };
}

export function formatCsv({ columns, records }) {
  return [columns, ...records].map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(",")).join("\r\n") + "\r\n";
}
