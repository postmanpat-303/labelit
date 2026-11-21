import { formatCsv, parseCsv } from "./csv.mjs";
import { barcodeNames, isBarcodeValue, normaliseBarcode } from "./label.mjs";

const listStorageKey = "labelit-csv-lists-v1";

export function setupCsvPrinting({ getDesign, getPrinters, getPrinter, checkDesign, renderPreview, paintPreview, setBusy, sendBatch }) {
  const byId = id => document.getElementById(id);
  const open = byId("csv-open");
  const dialog = byId("csv-dialog");
  const close = byId("csv-close");
  const printerPicker = byId("csv-printer");
  const file = byId("csv-file");
  const paste = byId("csv-paste");
  const loadPaste = byId("csv-load-paste");
  const newAddresses = byId("csv-new-addresses");
  const recordEditor = byId("csv-records");
  const recordFields = byId("csv-record-fields");
  const findRecord = byId("csv-find-record");
  const findNext = byId("csv-find-next");
  const addRecord = byId("csv-add-record");
  const applyRecord = byId("csv-apply-record");
  const discardRecord = byId("csv-discard-record");
  const draftNote = byId("csv-drafts");
  const serialForm = byId("csv-serial-form");
  const saved = byId("csv-saved");
  const savedField = byId("csv-saved-field");
  const listName = byId("csv-list-name");
  const saveList = byId("csv-save-list");
  const exportList = byId("csv-export-list");
  const removeList = byId("csv-remove-list");
  const listStatus = byId("csv-list-status");
  const setup = byId("csv-setup");
  const mapping = byId("csv-mapping");
  const preview = byId("csv-preview");
  const context = preview.getContext("2d");
  const previewRow = byId("csv-row");
  const previous = byId("csv-previous");
  const next = byId("csv-next");
  const from = byId("csv-from");
  const through = byId("csv-through");
  const targetNote = byId("csv-target");
  const print = byId("csv-send");
  const proof = byId("csv-proof");
  const check = byId("csv-check");
  const allRows = byId("csv-all-rows");
  const issues = byId("csv-issues");
  const startAtPreview = byId("csv-start-at-preview");
  const recallRange = byId("csv-last-range");
  const status = byId("csv-status");
  let design, target, data, fields, busy = false;
  let savedId;
  let editingRow;
  let lastRange;
  let importVersion = 0;
  let previewVersion = 0;
  let printerVersion = 0;
  let printerIssue = "";
  const drafts = new Map();

  function merged(record, reportIssues) {
    const elements = design.elements.slice();
    const warnings = [];
    const mappedText = [];
    for (const { index, select } of fields) {
      if (!select.value) continue;
      const element = elements[index];
      const value = record[Number(select.value)];
      if (element.type === "barcode") {
        const text = normaliseBarcode(element.format && element.format !== "code39" ? value : value.trim(), element.format);
        if (!isBarcodeValue(text, element.format)) {
          warnings.push(`${data.columns[Number(select.value)]} has an empty or invalid ${barcodeNames[element.format ?? "code39"]} value.`);
          elements[index] = null;
          continue;
        }
        elements[index] = { ...element, text };
      } else {
        elements[index] = { ...element, text: value };
        if (value) mappedText.push({ element: elements[index], column: data.columns[Number(select.value)] });
      }
    }
    const result = { ...design, dpi: target?.dpi ?? design.dpi, elements: elements.filter(Boolean) };
    try {
      checkDesign(context, result, target, mappedText);
    } catch (error) {
      warnings.push(error.message);
    }
    if (warnings.length) reportIssues(warnings.join(" "));
    return result;
  }

  function update({ preserveStatus = false } = {}) {
    if (!data || busy) return;
    const first = from.valueAsNumber;
    const last = through.valueAsNumber;
    const validRange = from.validity.valid && through.validity.valid && first <= last;
    const count = validRange ? last - first + 1 : 0;
    previous.disabled = !(previewRow.valueAsNumber > 1);
    next.disabled = !(previewRow.valueAsNumber < data.records.length);
    print.textContent = count === 1 ? "Print 1 label" : count ? `Print ${count} labels` : "Print rows";
    const hasMapping = fields.some(({ select }) => select.value);
    print.disabled = !target || !count || !hasMapping;
    proof.disabled = true;
    startAtPreview.disabled = !previewRow.validity.valid;
    recallRange.hidden = !lastRange;
    check.disabled = !count || !hasMapping;
    targetNote.textContent = target
      ? `${target.name} · ${design.width} × ${design.height} mm · ${target.dpi} dpi${target.tone === "thermal" ? " · Thermal dots" : ""}${count ? ` · ${count === 1 ? `Row ${first}` : `Rows ${first}–${last}`}` : ""}`
      : printerIssue || "Choose a printer above to print these rows.";
    const version = ++previewVersion;
    if (!previewRow.validity.valid || !Number.isInteger(previewRow.valueAsNumber)) {
      preview.hidden = true;
      return;
    }
    if (editingRow !== previewRow.valueAsNumber) updateRecordFields();
    let warning = "";
    const sample = merged(data.records[previewRow.valueAsNumber - 1], message => { warning = message; });
    if (!preserveStatus) status.textContent = warning ? `Preview row ${previewRow.value}: ${warning}`
      : first > last ? "Through row must be at or after From row." : "";
    preview.hidden = true;
    renderPreview(sample, target).then(frame => {
      if (!dialog.open || version !== previewVersion) return;
      paintPreview(preview, frame, sample);
      preview.hidden = false;
      proof.disabled = busy || !target || !hasMapping || !previewRow.validity.valid;
    }).catch(error => {
      if (dialog.open && version === previewVersion) status.textContent = `Could not preview the row. ${error.message}`;
    });
  }

  function readLists() {
    const lists = JSON.parse(localStorage.getItem(listStorageKey) ?? "[]");
    if (!Array.isArray(lists)) throw new Error("The saved list library could not be read.");
    return lists;
  }

  function updateSavedOptions(lists) {
    saved.replaceChildren(new Option("Choose a list", ""));
    for (const list of lists) saved.add(new Option(list.name, list.id));
    saved.value = savedId ?? "";
    savedField.hidden = lists.length === 0;
  }

  function saveCurrentList(name) {
    const lists = readLists();
    const existing = lists.find(list => list.id === savedId);
    if (savedId && !existing) throw new Error("This saved list was removed. Import the file again to save a new copy.");
    name ??= existing.name;
    if (lists.some(list => list.id !== savedId && list.name.toLowerCase() === name.toLowerCase())) {
      throw new Error("A saved list already uses that name.");
    }
    const mappings = Object.fromEntries(fields.map(({ index, select }) => [
      design.elements[index].id, select.value ? data.columns[Number(select.value)] : ""
    ]));
    const entry = {
      id: savedId ?? crypto.randomUUID(), name, ...data,
      mappings: { ...existing?.mappings, [design.id]: mappings },
      lastRanges: lastRange ? { ...existing?.lastRanges, [design.id]: lastRange } : existing?.lastRanges
    };
    const next = existing ? lists.map(list => list.id === savedId ? entry : list) : [...lists, entry];
    localStorage.setItem(listStorageKey, JSON.stringify(next));
    savedId = entry.id;
    return next;
  }

  function loadMapping(mappings = {}) {
    fields = [];
    mapping.replaceChildren();
    for (const [index, element] of design.elements.entries()) {
      if (["image", "shape"].includes(element.type)) continue;
      const field = document.createElement("label");
      const select = document.createElement("select");
      const type = element.type === "barcode" ? "Barcode" : "Text";
      const content = element.text.trim().split("\n")[0].slice(0, 36);
      field.textContent = content ? `${type} ${index + 1} · ${content}` : `${type} ${index + 1}`;
      select.add(new Option("Keep original", ""));
      data.columns.forEach((column, number) => select.add(new Option(column, number)));
      const stored = mappings[element.id];
      const match = stored === undefined
        ? data.columns.findIndex(column => column.toLowerCase() === element.text.trim().toLowerCase())
        : data.columns.indexOf(stored);
      if (match !== -1) select.value = String(match);
      select.onchange = () => {
        clearIssues();
        update();
        if (!savedId) return;
        try {
          saveCurrentList();
          listStatus.textContent = "Column mapping saved.";
        } catch (error) {
          listStatus.textContent = error.message;
        }
      };
      field.append(select);
      mapping.append(field);
      fields.push({ index, select });
    }
    if (!fields.length) mapping.textContent = "Close this window and add text or a barcode to the design.";
  }

  function loadRecords(source, name, id, mappings, range) {
    data = source;
    savedId = id;
    lastRange = range && range.last <= data.records.length ? range : undefined;
    saved.value = id ?? "";
    listName.value = name.slice(0, 80);
    listStatus.textContent = "";
    removeList.hidden = !id;
    removeList.textContent = "Remove saved list";
    loadMapping(mappings);
    for (const input of [previewRow, from, through]) input.max = data.records.length;
    previewRow.value = from.value = "1";
    editingRow = undefined;
    findRecord.value = "";
    through.value = "1";
    byId("csv-row-label").firstChild.textContent = `Preview row (of ${data.records.length}) `;
    setup.hidden = false;
    clearIssues();
    update();
  }

  function updateRecordFields() {
    editingRow = previewRow.valueAsNumber;
    const record = drafts.get(editingRow) ?? data.records[editingRow - 1];
    applyRecord.disabled = !record;
    recordFields.replaceChildren();
    if (!record) {
      updateDraftNote();
      return;
    }
    data.columns.forEach((column, index) => {
      const label = document.createElement("label");
      const input = document.createElement("textarea");
      label.textContent = column;
      input.rows = 1;
      input.value = record[index];
      label.append(input);
      recordFields.append(label);
    });
    updateDraftNote();
  }

  function updateDraftNote() {
    const current = drafts.has(editingRow);
    discardRecord.hidden = !current;
    draftNote.hidden = !drafts.size;
    draftNote.textContent = current
      ? `Row ${editingRow} has unapplied edits. Apply or discard them before printing this row.`
      : `${drafts.size} ${drafts.size === 1 ? "row has" : "rows have"} unapplied edits.`;
  }

  const recordValues = () => Array.from(recordFields.querySelectorAll("textarea"), input => input.value);
  recordFields.oninput = () => {
    if (!editingRow) return;
    const values = recordValues();
    if (values.every((value, index) => value === data.records[editingRow - 1][index])) drafts.delete(editingRow);
    else drafts.set(editingRow, values);
    clearIssues();
    updateDraftNote();
  };

  function canLeaveList() {
    if (!drafts.size) return true;
    previewRow.value = drafts.keys().next().value;
    recordEditor.open = true;
    update();
    status.textContent = "Apply or discard the pending row changes first.";
    recordFields.querySelector("textarea")?.focus();
    return false;
  }

  function writeRecord(row, values) {
    const previous = data.records;
    const records = previous.slice();
    records[row - 1] = values;
    data.records = records;
    try {
      if (savedId) saveCurrentList();
    } catch (error) {
      data.records = previous;
      listStatus.textContent = error.message;
      return false;
    }
    for (const input of [previewRow, from, through]) input.max = records.length;
    byId("csv-row-label").firstChild.textContent = `Preview row (of ${records.length}) `;
    clearIssues();
    return true;
  }

  newAddresses.onclick = () => {
    if (!canLeaveList()) return;
    const columns = ["Recipient", "Address line 1", "Address line 2", "Town or city", "County or region", "Postal code", "Country"];
    importVersion++;
    file.value = "";
    loadRecords({ columns, records: [columns.map(() => "")] }, "Addresses");
    recordEditor.open = true;
    recordFields.querySelector("textarea")?.focus();
  };
  findNext.onclick = () => {
    const query = findRecord.value.trim().toLocaleLowerCase();
    if (!query) {
      findRecord.focus();
      return;
    }
    const current = previewRow.valueAsNumber || 0;
    for (let offset = 0; offset < data.records.length; offset++) {
      const index = (current + offset) % data.records.length;
      if (data.records[index].some(value => value.toLocaleLowerCase().includes(query))) {
        previewRow.value = index + 1;
        update();
        return;
      }
    }
    status.textContent = "No matching records.";
  };
  findRecord.onkeydown = event => {
    if (event.key === "Enter") { event.preventDefault(); findNext.click(); }
  };
  addRecord.onclick = () => {
    const row = data.records.length + 1;
    if (!writeRecord(row, data.columns.map(() => ""))) return;
    previewRow.value = row;
    update();
    recordFields.querySelector("textarea")?.focus();
    listStatus.textContent = savedId ? "Record added to the saved list." : "Record added. Save the list to keep it on this device.";
  };
  applyRecord.onclick = () => {
    if (!editingRow) return;
    const values = recordValues();
    if (!writeRecord(editingRow, values)) return;
    drafts.delete(editingRow);
    updateDraftNote();
    update();
    listStatus.textContent = savedId ? "Record changes saved." : "Record updated. Save the list to keep the changes on this device.";
  };
  discardRecord.onclick = () => {
    drafts.delete(editingRow);
    updateRecordFields();
    clearIssues();
    update();
  };

  function selectPrinter() {
    target = undefined;
    printerIssue = "";
    if (printerPicker.value) {
      try {
        target = getPrinter(printerPicker.value, design);
      } catch (error) {
        printerIssue = error.message;
      }
    }
    clearIssues();
    update();
  }

  printerPicker.onchange = selectPrinter;
  open.hidden = false;
  open.onclick = () => {
    design = getDesign();
    target = undefined;
    printerIssue = "Loading printers…";
    data = undefined;
    savedId = undefined;
    drafts.clear();
    file.value = "";
    paste.value = "";
    setup.hidden = true;
    status.textContent = "";
    try {
      updateSavedOptions(readLists());
    } catch {
      updateSavedOptions([]);
      status.textContent = "Saved lists could not be loaded. You can still open a CSV file.";
    }
    printerPicker.replaceChildren(new Option("Loading printers…", ""));
    printerPicker.disabled = true;
    dialog.showModal();
    const version = ++printerVersion;
    getPrinters().then(({ names, selected }) => {
      if (!dialog.open || version !== printerVersion) return;
      printerPicker.replaceChildren(new Option(names.length ? "Select a printer" : "No Windows printers found", ""),
        ...names.map(name => new Option(name, name)));
      printerPicker.value = names.includes(selected) ? selected : "";
      printerPicker.disabled = !names.length;
      selectPrinter();
      if (!names.length) {
        printerIssue = "No Windows printers found.";
        update();
      }
    }).catch(error => {
      if (!dialog.open || version !== printerVersion) return;
      printerIssue = `Could not load printers. ${error.message ?? error}`;
      printerPicker.replaceChildren(new Option("Printers unavailable", ""));
      update();
    });
  };
  close.onclick = () => { if (!busy && canLeaveList()) dialog.close(); };
  dialog.oncancel = event => { if (busy || !canLeaveList()) event.preventDefault(); };
  dialog.onclose = () => { importVersion++; previewVersion++; printerVersion++; };
  saved.onchange = () => {
    const id = saved.value;
    if (!id || !canLeaveList()) {
      saved.value = savedId ?? "";
      return;
    }
    importVersion++;
    try {
      const list = readLists().find(entry => entry.id === id);
      if (!list) throw new Error("This saved list is unavailable.");
      file.value = "";
      loadRecords({ columns: list.columns, records: list.records }, list.name, list.id,
        list.mappings?.[design.id], list.lastRanges?.[design.id]);
    } catch (error) {
      status.textContent = error.message;
    }
  };
  file.onchange = async () => {
    const selected = file.files[0];
    if (!selected) return;
    if (!canLeaveList()) {
      file.value = "";
      return;
    }
    const version = ++importVersion;
    setup.hidden = true;
    try {
      if (selected.size > 8 * 1024 * 1024) throw new Error("Choose a CSV file no larger than 8 MB.");
      const parsed = parseCsv(await selected.text());
      if (version !== importVersion) return;
      loadRecords(parsed, selected.name.replace(/\.csv$/i, ""));
    } catch (error) {
      if (version === importVersion) {
        setup.hidden = !data;
        status.textContent = error.message;
      }
    }
  };
  loadPaste.onclick = () => {
    if (!canLeaveList()) return;
    const source = paste.value;
    try {
      const firstLine = source.split(/\r?\n/, 1)[0];
      const parsed = parseCsv(source, firstLine.includes("\t") ? "\t" : ",");
      importVersion++;
      file.value = "";
      loadRecords(parsed, "Pasted rows");
      byId("csv-paste-panel").open = false;
    } catch (error) {
      status.textContent = error.message;
      paste.focus();
    }
  };
  serialForm.onsubmit = event => {
    event.preventDefault();
    if (busy || !canLeaveList()) return;
    const prefix = byId("csv-serial-prefix").value;
    const first = byId("csv-serial-start").valueAsNumber;
    const count = byId("csv-serial-count").valueAsNumber;
    const digits = byId("csv-serial-digits").valueAsNumber;
    const dateFormat = byId("csv-serial-date").value;
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const date = dateFormat === "iso" ? `${year}-${month}-${day}` : `${day}/${month}/${year}`;
    const columns = dateFormat ? ["Serial", "Date"] : ["Serial"];
    const records = Array.from({ length: count }, (_, index) => {
      const serial = prefix + String(first + index).padStart(digits, "0");
      return dateFormat ? [serial, date] : [serial];
    });
    importVersion++;
    file.value = "";
    loadRecords({ columns, records }, "Serial numbers");
    byId("csv-serial-panel").open = false;
  };

  saveList.onclick = () => {
    const name = listName.value.trim();
    if (!name) {
      listStatus.textContent = "Enter a name for the list.";
      listName.focus();
      return;
    }
    try {
      updateSavedOptions(saveCurrentList(name));
      removeList.hidden = false;
      removeList.textContent = "Remove saved list";
      listStatus.textContent = "List and column mappings saved on this device.";
    } catch (error) {
      listStatus.textContent = error.name === "QuotaExceededError"
        ? "Local storage is full. Export the list as CSV to keep a copy." : error.message;
    }
  };
  exportList.onclick = () => {
    const url = URL.createObjectURL(new Blob([formatCsv(data)], { type: "text/csv;charset=utf-8" }));
    const download = document.createElement("a");
    download.href = url;
    download.download = `${listName.value.trim().replace(/[<>:"/\\|?*]/g, "_") || "Label-IT list"}.csv`;
    download.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  removeList.onclick = () => {
    if (removeList.textContent !== "Confirm removal") {
      removeList.textContent = "Confirm removal";
      listStatus.textContent = "This removes Label-IT's saved copy. You can still export the open list.";
      return;
    }
    try {
      const lists = readLists().filter(list => list.id !== savedId);
      localStorage.setItem(listStorageKey, JSON.stringify(lists));
      savedId = undefined;
      updateSavedOptions(lists);
      removeList.hidden = true;
      listStatus.textContent = "Saved copy removed.";
    } catch (error) {
      listStatus.textContent = error.message;
    }
  };

  function clearIssues() {
    issues.replaceChildren();
    issues.hidden = true;
  }

  function checkRows(first, last) {
    clearIssues();
    for (let row = first; row <= last; row++) {
      const report = message => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `Row ${row}: ${message}`;
        button.onclick = () => {
          previewRow.value = row;
          update();
          previewRow.focus();
        };
        item.append(button);
        issues.append(item);
      };
      if (drafts.has(row)) report("Apply or discard the pending row changes before printing.");
      else merged(data.records[row - 1], report);
    }
    issues.hidden = !issues.childElementCount;
    return issues.childElementCount;
  }

  check.onclick = () => {
    const errors = checkRows(from.valueAsNumber, through.valueAsNumber);
    status.textContent = errors ? `${errors} ${errors === 1 ? "row needs" : "rows need"} attention.` : "Every row in this range is ready.";
  };
  allRows.onclick = () => {
    from.value = "1";
    through.value = data.records.length;
    clearIssues();
    update();
  };
  startAtPreview.onclick = () => {
    if (!previewRow.validity.valid) return;
    from.value = previewRow.value;
    if (through.valueAsNumber < from.valueAsNumber) through.value = from.value;
    clearIssues();
    update();
  };
  recallRange.onclick = () => {
    if (!lastRange) return;
    from.value = lastRange.first;
    through.value = lastRange.last;
    clearIssues();
    update();
  };
  previewRow.oninput = update;
  for (const input of [from, through]) input.oninput = () => { clearIssues(); update(); };
  previous.onclick = () => { previewRow.stepDown(); update(); };
  next.onclick = () => { previewRow.stepUp(); update(); };
  byId("csv-print-form").onsubmit = async event => {
    event.preventDefault();
    if (busy || print.disabled) return;
    await sendRange(from.valueAsNumber, through.valueAsNumber);
  };
  proof.onclick = async () => {
    if (busy || proof.disabled) return;
    await sendRange(previewRow.valueAsNumber, previewRow.valueAsNumber, true);
  };

  async function sendRange(first, last, previewOnly = false) {
    const errors = checkRows(first, last);
    if (errors) {
      status.textContent = `${issues.firstElementChild.textContent} ${errors > 1 ? `(${errors} rows need attention.)` : ""}`.trim();
      return;
    }
    const total = last - first + 1;
    const designAt = row => merged(data.records[row - 1], message => { throw new Error(`Row ${row}: ${message}`); });
    busy = true;
    setBusy(true);
    const controls = [printerPicker, file, paste, loadPaste, newAddresses, findRecord, findNext, addRecord, applyRecord, discardRecord, ...serialForm.elements,
      ...recordFields.querySelectorAll("textarea"), saved, listName, saveList, exportList, removeList, previewRow, previous, next,
      from, through, close, print, proof, check, allRows, startAtPreview, recallRange, ...fields.map(field => field.select)];
    for (const control of controls) control.disabled = true;
    try {
      await sendBatch({ first, last, designAt, target, onProgress: message => { status.textContent = message; } });
      status.textContent = `Sent ${total} ${total === 1 ? "label" : "labels"} to ${target.name} in one job.`;
      if (!previewOnly) {
        lastRange = { first, last };
        recallRange.hidden = false;
        if (savedId) {
          try { saveCurrentList(); } catch (error) { listStatus.textContent = `Could not save the printed range. ${error.message}`; }
        }
      }
    } catch (error) {
      status.textContent = `Batch did not finish. ${error.message ?? error}`;
    } finally {
      busy = false;
      setBusy(false);
      for (const control of controls) control.disabled = false;
      update({ preserveStatus: true });
    }
  }
}
