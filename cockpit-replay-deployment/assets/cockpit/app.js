let terminal, fitAddon, canvasAddon, selectedRow = null, selectedRecording = null, pageOffset = 0, sortBy = "started", sortDirection = "desc";
const pageSize = 50;
let player = null, replayProcess = null, replayToken = 0, scrubbing = false, resumeAfterSeek = false, activeQuickRange = null;
let rangePicker = null;
const selectedRecordings = new Map();
let visibleRecordings = [];
const columnPreferenceKey = "tlogreplay-visible-columns";
const columnWidthPreferenceKey = "tlogreplay-column-widths";
const theme = { background: "#151515", foreground: "#f8f8f2", cursor: "#f8f8f2", black: "#f8f8f2", red: "#ff6b6b", green: "#8bd450", yellow: "#ffd166", blue: "#6ea8fe", magenta: "#d98cff", cyan: "#66d9ef", white: "#f8f8f2", brightBlack: "#c7c7c7", brightRed: "#ff8787", brightGreen: "#a8e66f", brightYellow: "#ffe08a", brightBlue: "#91b9ff", brightMagenta: "#e7b0ff", brightCyan: "#9cecff", brightWhite: "#fff" };
const el = id => document.getElementById(id);
const command = (args, options = {}) => cockpit.spawn(args, { superuser: "require", err: "message", ...options });

function status(message) { el("status").textContent = message; }
function healthValue(id, value) { el(id).textContent = value ?? "—"; }
function formatBytes(bytes) { const value = Number(bytes) || 0; if (value < 1024) return `${value} B`; const units = ["KiB", "MiB", "GiB", "TiB"]; let size = value / 1024, unit = 0; while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; } return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`; }
function formatSystemdTime(value) { return !value || value === "n/a" ? "Not available" : value.replace(/\s+UTC$/, " UTC"); }
async function loadHealth() {
  const indicator = el("health-status");
  indicator.textContent = "Refreshing…";
  try {
    const health = JSON.parse(await command(["/usr/local/libexec/tlog-replay-health"]));
    healthValue("health-last-sync", formatSystemdTime(health.sync.last_success));
    healthValue("health-next-sync", formatSystemdTime(health.sync.next_scheduled));
    healthValue("health-recordings", String(health.catalogue.recordings));
    healthValue("health-ready", String(health.catalogue.replay_ready));
    healthValue("health-archived", String(health.catalogue.archive_only));
    healthValue("health-cache-size", formatBytes(health.cache.bytes));
    indicator.textContent = health.sync.result === "success" ? "Healthy" : `Attention: ${health.sync.result || "unknown"}`;
    indicator.classList.toggle("is-healthy", health.sync.result === "success");
    indicator.classList.toggle("is-attention", health.sync.result !== "success");
    el("health-detail").textContent = `${health.cache.archives} local archive${health.cache.archives === 1 ? "" : "s"} and ${health.cache.replay_files} replay file${health.cache.replay_files === 1 ? "" : "s"}.`;
  } catch (error) {
    indicator.textContent = "Status unavailable";
    indicator.classList.remove("is-healthy"); indicator.classList.add("is-attention");
    el("health-detail").textContent = `Unable to read catalogue health: ${error.message || error}`;
  }
}
function recordingLabel() { return selectedRecording ? selectedRecording.recording_id : "recording"; }
function addOption(select, value, label) { const item = document.createElement("option"); item.value = value; item.textContent = label; select.appendChild(item); }
function fit() { try { fitAddon.fit(); } catch (_) {} }
function resetTerminal(message = "") { terminal.reset(); terminal.options.theme = theme; if (message) terminal.write(`\x1b[97m${message}\x1b[0m\r\n`); terminal.refresh(0, terminal.rows - 1); }
function initialiseTerminal() {
  if (typeof Terminal === "undefined" || typeof FitAddon === "undefined" || typeof CanvasAddon === "undefined") throw new Error("The local Xterm.js assets did not load.");
  terminal = new Terminal({ allowProposedApi: false, convertEol: false, cursorBlink: false, disableStdin: true, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 14, scrollback: 10000, theme });
  fitAddon = new FitAddon.FitAddon(); terminal.loadAddon(fitAddon); terminal.open(el("terminal"));
  canvasAddon = new CanvasAddon.CanvasAddon(); terminal.loadAddon(canvasAddon);
  requestAnimationFrame(() => { fit(); resetTerminal("Select a recording and choose Replay."); });
  new ResizeObserver(fit).observe(el("terminal"));
}
function inputEpoch(id) { const value = el(id).value, epoch = Date.parse(`${value}:00Z`) / 1000; return value && Number.isFinite(epoch) ? epoch : null; }
function localDatetime(utc) { return utc ? new Date(utc).toISOString().slice(0, 16) : ""; }
function updateQuickRangeUi() { document.querySelectorAll("[data-range-ms]").forEach(button => button.classList.toggle("is-selected", Number(button.dataset.rangeMs) === activeQuickRange)); }
function rangeSummary() { const from = el("from").value, to = el("to").value; if (!from || !to) return "Select a date range"; const format = value => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(`${value}:00Z`)).replace(",", ""); return `${format(from)} – ${format(to)}`; }
function updateRangeSummary() { el("range-trigger").textContent = rangeSummary(); }
function applyDefaultHour() { const until = new Date(), since = new Date(until.getTime() - 3600000); el("from").value = localDatetime(since.toISOString()); el("to").value = localDatetime(until.toISOString()); activeQuickRange = 3600000; updateQuickRangeUi(); updateRangeSummary(); }
function browseSearch() { search().catch(error => status(`Unable to search recordings: ${error.message || error}`)); }
function applyQuickRange(range) { if (activeQuickRange === range) { activeQuickRange = null; updateQuickRangeUi(); browseSearch(); return; } const until = new Date(), since = new Date(until.getTime() - range); el("from").value = localDatetime(since.toISOString()); el("to").value = localDatetime(until.toISOString()); activeQuickRange = range; updateQuickRangeUi(); updateRangeSummary(); browseSearch(); }
function pickerParts(value) { const date = new Date(`${value}:00Z`); return { date: value.slice(0, 10), hour: String(date.getUTCHours()).padStart(2, "0"), minute: String(date.getUTCMinutes()).padStart(2, "0"), view: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)) }; }
function pickerValue(date, hour, minute) { return `${date}T${hour}:${minute}`; }
function setPickerSelects(side) { const parts = pickerParts(rangePicker[`draft${side}`]); el(`${side}-hour`).value = parts.hour; el(`${side}-minute`).value = parts.minute; }
function renderCalendar(side) { const view = rangePicker[`view${side}`], target = el(`${side}-calendar`), selected = pickerParts(rangePicker[`draft${side}`]).date; target.replaceChildren(); el(`${side}-month`).textContent = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(view); ["M","T","W","T","F","S","S"].forEach(day => { const node = document.createElement("span"); node.className = "calendar-day-name"; node.textContent = day; target.appendChild(node); }); const first = (view.getUTCDay() + 6) % 7, days = new Date(Date.UTC(view.getUTCFullYear(), view.getUTCMonth() + 1, 0)).getUTCDate(), minimum = (el("from").dataset.min || "").slice(0,10), maximum = (el("to").dataset.max || "").slice(0,10); for (let cell = 0; cell < 42; cell += 1) { const day = cell - first + 1, button = document.createElement("button"); button.type = "button"; button.className = "calendar-day"; if (day < 1 || day > days) { button.disabled = true; button.classList.add("is-empty"); } else { const date = `${view.getUTCFullYear()}-${String(view.getUTCMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`; button.textContent = String(day); button.dataset.date = date; button.classList.toggle("is-selected", date === selected); button.disabled = Boolean((minimum && date < minimum) || (maximum && date > maximum)); } target.appendChild(button); } }
function renderPicker() { ["from", "to"].forEach(side => { renderCalendar(side); setPickerSelects(side); }); }
function openRangePicker() { rangePicker = { draftfrom: el("from").value, draftto: el("to").value, viewfrom: pickerParts(el("from").value).view, viewto: pickerParts(el("to").value).view }; renderPicker(); el("range-popover").hidden = false; el("range-trigger").setAttribute("aria-expanded", "true"); }
function closeRangePicker() { el("range-popover").hidden = true; el("range-trigger").setAttribute("aria-expanded", "false"); rangePicker = null; }
function initialiseRangePicker() { ["from", "to"].forEach(side => { const hour = el(`${side}-hour`), minute = el(`${side}-minute`); for (let value = 0; value < 24; value += 1) addOption(hour, String(value).padStart(2,"0"), String(value).padStart(2,"0")); for (let value = 0; value < 60; value += 1) addOption(minute, String(value).padStart(2,"0"), String(value).padStart(2,"0")); [hour, minute].forEach(control => control.addEventListener("change", () => { const parts = pickerParts(rangePicker[`draft${side}`]); rangePicker[`draft${side}`] = pickerValue(parts.date, el(`${side}-hour`).value, el(`${side}-minute`).value); })); el(`${side}-calendar`).addEventListener("click", event => { const date = event.target.dataset.date; if (!date) return; const parts = pickerParts(rangePicker[`draft${side}`]); rangePicker[`draft${side}`] = pickerValue(date, parts.hour, parts.minute); renderPicker(); }); }); document.querySelectorAll(".month-previous,.month-next").forEach(button => button.addEventListener("click", () => { const side = button.dataset.side, current = rangePicker[`view${side}`]; rangePicker[`view${side}`] = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + (button.classList.contains("month-next") ? 1 : -1), 1)); renderCalendar(side); })); el("range-trigger").addEventListener("click", () => el("range-popover").hidden ? openRangePicker() : closeRangePicker()); el("range-now").addEventListener("click", () => { const now = localDatetime(new Date().toISOString()); rangePicker.draftto = now; rangePicker.viewto = pickerParts(now).view; renderPicker(); }); el("range-cancel").addEventListener("click", closeRangePicker); el("range-apply").addEventListener("click", () => { if (Date.parse(`${rangePicker.draftto}:00Z`) < Date.parse(`${rangePicker.draftfrom}:00Z`)) { window.alert("The end of the range must be later than its start."); return; } el("from").value = rangePicker.draftfrom; el("to").value = rangePicker.draftto; activeQuickRange = null; updateQuickRangeUi(); updateRangeSummary(); closeRangePicker(); browseSearch(); }); document.addEventListener("click", event => { const control = el("range-control"); if (!el("range-popover").hidden && !control.contains(event.target)) closeRangePicker(); }); document.addEventListener("keydown", event => { if (event.key === "Escape" && !el("range-popover").hidden) closeRangePicker(); }); }
function startCatalogueSearch() { browseSearch(); }
function clearCatalogueSearch() { browseSearch(); }
function selectRow(row) { if (selectedRow) selectedRow.classList.remove("selected"); selectedRow = row; if (row) row.classList.add("selected"); }
function append(row, value, className = "", title = "", column = "") { const cell = document.createElement("td"); cell.textContent = value ?? ""; if (className) cell.className = className; if (title) cell.title = title; if (column) cell.dataset.column = column; row.appendChild(cell); }
function friendlyDate(utc) { const date = new Date(utc); return Number.isNaN(date.getTime()) ? utc : new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date).replace(",", ""); }
function shorten(value, head = 12, tail = 7) { return value && value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value; }
function selectedColumns() { return new Set(Array.from(document.querySelectorAll("[data-column-toggle]")).filter(control => control.checked).map(control => control.dataset.columnToggle)); }
function applyColumnPreferences() { const visible = selectedColumns(); document.querySelectorAll("[data-column]").forEach(node => { node.hidden = !visible.has(node.dataset.column); }); }
function initialiseColumnResizing() { let saved = {}; try { saved = JSON.parse(localStorage.getItem(columnWidthPreferenceKey)) || {}; } catch (_) {} document.querySelectorAll("col[data-column]").forEach(column => { if (saved[column.dataset.column]) column.style.width = `${saved[column.dataset.column]}px`; }); document.querySelectorAll(".column-resize").forEach(handle => handle.addEventListener("pointerdown", event => { const column = document.querySelector(`col[data-column="${handle.dataset.resizeColumn}"]`); const header = handle.parentElement; if (!column || !header) return; const startX = event.clientX, startWidth = header.getBoundingClientRect().width; handle.setPointerCapture(event.pointerId); const resize = move => { const width = Math.max(80, Math.round(startWidth + move.clientX - startX)); column.style.width = `${width}px`; }; const finish = () => { try { const widths = JSON.parse(localStorage.getItem(columnWidthPreferenceKey)) || {}; widths[column.dataset.column] = Math.round(header.getBoundingClientRect().width); localStorage.setItem(columnWidthPreferenceKey, JSON.stringify(widths)); } catch (_) {} handle.removeEventListener("pointermove", resize); handle.removeEventListener("pointerup", finish); handle.removeEventListener("pointercancel", finish); }; handle.addEventListener("pointermove", resize); handle.addEventListener("pointerup", finish); handle.addEventListener("pointercancel", finish); event.preventDefault(); })); }
function updateSortIndicators() { document.querySelectorAll("th[data-sort]").forEach(header => { const indicator = header.querySelector(".sort-indicator"); const active = header.dataset.sort === sortBy; header.setAttribute("aria-sort", active ? (sortDirection === "asc" ? "ascending" : "descending") : "none"); if (indicator) indicator.textContent = active ? (sortDirection === "asc" ? "▲" : "▼") : "↕"; }); }
function initialiseSorting() { document.querySelectorAll("th[data-sort]").forEach(header => { const sort = () => { if (sortBy === header.dataset.sort) sortDirection = sortDirection === "asc" ? "desc" : "asc"; else { sortBy = header.dataset.sort; sortDirection = "asc"; } updateSortIndicators(); search().catch(error => status(`Unable to sort recordings: ${error.message || error}`)); }; header.addEventListener("click", event => { if (!event.target.classList.contains("column-resize")) sort(); }); header.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); sort(); } }); }); updateSortIndicators(); }
function initialiseColumns() { try { const saved = JSON.parse(localStorage.getItem(columnPreferenceKey)); if (Array.isArray(saved)) document.querySelectorAll("[data-column-toggle]").forEach(control => { control.checked = saved.includes(control.dataset.columnToggle); }); } catch (_) {} document.querySelectorAll("[data-column-toggle]").forEach(control => control.addEventListener("change", () => { localStorage.setItem(columnPreferenceKey, JSON.stringify(Array.from(selectedColumns()))); applyColumnPreferences(); })); document.addEventListener("click", event => { document.querySelectorAll(".column-picker[open]").forEach(picker => { if (!picker.contains(event.target)) picker.open = false; }); }); document.addEventListener("keydown", event => { if (event.key === "Escape") document.querySelectorAll(".column-picker[open]").forEach(picker => { picker.open = false; }); }); initialiseColumnResizing(); applyColumnPreferences(); }
function recordingState(recording) { return recording.cached ? "Ready" : recording.availability === "missing" ? "Unavailable" : "Archived"; }
function updateSelectionUi() {
  const count = selectedRecordings.size;
  const summary = el("selected-count");
  if (summary) summary.textContent = count ? `${count} selected` : "No selection";
  document.querySelectorAll("[data-export-format]").forEach(button => { button.disabled = count === 0; });
  if (el("clear-selection")) el("clear-selection").disabled = count === 0;
  const selectPage = el("select-page");
  if (selectPage) {
    const visibleSelected = visibleRecordings.filter(recording => selectedRecordings.has(recording.recording_id)).length;
    selectPage.checked = Boolean(visibleRecordings.length) && visibleSelected === visibleRecordings.length;
    selectPage.indeterminate = visibleSelected > 0 && visibleSelected < visibleRecordings.length;
  }
}
function setSelected(recording, selected) {
  if (selected) selectedRecordings.set(recording.recording_id, recording);
  else selectedRecordings.delete(recording.recording_id);
  updateSelectionUi();
}
function clearSelection() { selectedRecordings.clear(); document.querySelectorAll("[data-recording-select]").forEach(control => { control.checked = false; }); updateSelectionUi(); }
function decodeExport(value) { const source = atob(value), bytes = new Uint8Array(source.length); for (let index = 0; index < source.length; index += 1) bytes[index] = source.charCodeAt(index); return bytes; }
async function exportSelected(format) {
  const recordings = Array.from(selectedRecordings.values());
  if (!recordings.length) return;
  const summary = el("selected-count");
  const label = format === "csv" ? "CSV" : format === "xlsx" ? "Excel" : "JSONL ZIP";
  if (summary) summary.textContent = `Preparing ${label}…`;
  try {
    const args = ["/usr/local/libexec/tlog-replay-export", "--format", format];
    recordings.forEach(recording => args.push("--recording-id", recording.recording_id));
    const result = JSON.parse(await command(args));
    const blob = new Blob([decodeExport(result.data_b64)], { type: result.content_type });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = result.filename;
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    if (summary) summary.textContent = `${recordings.length} selected · ${label} downloaded`;
  } catch (error) {
    if (summary) summary.textContent = `Export failed: ${error.message || error}`;
  }
}
function initialiseSelection() {
  const headerRow = document.querySelector(".recording-table-scroll thead tr");
  const colgroup = document.querySelector(".recording-table-scroll colgroup");
  const stateHeader = headerRow.querySelector('th[data-column="state"]');
  const stateColumn = colgroup.querySelector('col[data-column="state"]');
  if (stateHeader) stateHeader.remove();
  if (stateColumn) stateColumn.remove();
  const actionHeader = headerRow.lastElementChild;
  const actionColumn = colgroup.lastElementChild;
  if (actionHeader) { actionHeader.className = "status-header"; actionHeader.innerHTML = '<input id="select-page" type="checkbox" aria-label="Select all recordings on this page"><span>Status</span>'; headerRow.prepend(actionHeader); }
  if (actionColumn) colgroup.prepend(actionColumn);
  el("select-page").addEventListener("change", event => {
    const select = event.target.checked;
    visibleRecordings.forEach(recording => setSelected(recording, select));
    document.querySelectorAll("[data-recording-select]").forEach(control => { control.checked = select; });
  });
  const tools = document.querySelector(".recording-tools");
  const summary = document.createElement("span"); summary.id = "selected-count"; summary.className = "export-summary"; summary.textContent = "No selection";
  const clear = document.createElement("button"); clear.id = "clear-selection"; clear.className = "clear-selection"; clear.type = "button"; clear.textContent = "Clear"; clear.disabled = true; clear.addEventListener("click", clearSelection);
  const menu = document.createElement("details"); menu.className = "export-menu";
  menu.innerHTML = '<summary>Export</summary><div class="export-menu-panel"><button type="button" data-export-format="csv" disabled>CSV</button><button type="button" data-export-format="xlsx" disabled>Excel</button><button type="button" data-export-format="jsonl-zip" disabled>Raw JSONL (.zip)</button></div>';
  menu.querySelectorAll("[data-export-format]").forEach(button => button.addEventListener("click", () => { menu.open = false; exportSelected(button.dataset.exportFormat); }));
  document.addEventListener("click", event => { if (menu.open && !menu.contains(event.target)) menu.open = false; });
  document.addEventListener("keydown", event => { if (event.key === "Escape") menu.open = false; });
  tools.prepend(menu); tools.prepend(clear); tools.prepend(summary);
}
function availabilityDescription(recording) {
  if (recording.cached) return { state: "ready", label: "Cached locally — replay ready" };
  if (recording.availability === "missing") return { state: "unavailable", label: "Unavailable" };
  return { state: "archived", label: "Archived — retrieve before replay" };
}
function renderRecordings(recordings, total) {
  const body = el("recordings"); body.replaceChildren(); visibleRecordings = recordings; el("recording-count").textContent = `${total} recording${total === 1 ? "" : "s"} found`;
  recordings.forEach(recording => { const row = document.createElement("tr"); const availability = availabilityDescription(recording); append(row, friendlyDate(recording.started_utc), "date-cell", recording.started_utc, "started"); append(row, recording.recording_id, "id-cell", recording.recording_id, "recording-id"); append(row, recording.username, "user-cell", recording.username, "user"); append(row, recording.host, "host-cell", recording.host, "host"); append(row, recording.event_count, "events-cell", "", "events"); const action = document.createElement("td"), checkbox = document.createElement("input"), indicator = document.createElement("span"), button = document.createElement("button"); checkbox.type = "checkbox"; checkbox.checked = selectedRecordings.has(recording.recording_id); checkbox.dataset.recordingSelect = recording.recording_id; checkbox.setAttribute("aria-label", `Select ${recording.recording_id}`); checkbox.addEventListener("change", event => setSelected(recording, event.target.checked)); indicator.className = `availability-dot availability-${availability.state}`; indicator.setAttribute("role", "img"); indicator.setAttribute("aria-label", availability.label); indicator.title = availability.label; button.className = "replay-button"; button.textContent = recording.availability === "missing" ? "Unavailable" : "▶ Replay"; button.disabled = recording.availability === "missing"; button.addEventListener("click", () => loadReplay(recording, row)); action.className = "action-cell"; action.append(checkbox, indicator, button); row.prepend(action); body.appendChild(row); });
  applyColumnPreferences();
  el("previous").disabled = pageOffset === 0; el("next").disabled = pageOffset + pageSize >= total;
  updateSelectionUi();
}
async function loadFilters() {
  const filters = JSON.parse(await command(["/usr/local/libexec/tlog-replay-query", "filters"]));
  for (const [id, values, label] of [["user", filters.users, "All users"], ["host", filters.hosts, "All hosts"]]) { const select = el(id); select.replaceChildren(); addOption(select, "", label); values.forEach(value => addOption(select, value, value)); }
  const earliest = localDatetime(filters.earliest_recording_utc), now = localDatetime(new Date().toISOString());
  ["from", "to"].forEach(id => { el(id).dataset.min = earliest; el(id).dataset.max = now; });
  applyDefaultHour();
}
async function search(resetPage = true) {
  if (resetPage) pageOffset = 0;
  el("recording-count").textContent = "Loading recordings…";
  const args = ["/usr/local/libexec/tlog-replay-query", "list", "--limit", String(pageSize), "--offset", String(pageOffset), "--sort-by", sortBy, "--sort-direction", sortDirection];
  if (el("user").value) args.push("--user", el("user").value); if (el("host").value) args.push("--host", el("host").value);
  const after = inputEpoch("from"), before = inputEpoch("to"), catalogueSearch = el("recording-id").value.trim();
  if (after !== null) args.push("--after", String(after)); if (before !== null) args.push("--before", String(before));
  if (catalogueSearch) args.push("--search", catalogueSearch);
  const result = JSON.parse(await command(args)); selectedRow = null; renderRecordings(result.recordings, result.total);
}
function formatDuration(milliseconds) {
  const total = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${minutes}:${String(seconds).padStart(2, "0")}`;
}
function playbackPosition() {
  if (!player) return 0;
  if (player.paused || player.finished || player.startedAt === null) return player.position;
  return Math.min(player.duration, player.position + (performance.now() - player.startedAt) * (player.speed || 1));
}
function renderTimeline(position = playbackPosition()) {
  if (!player) return;
  const bounded = Math.max(0, Math.min(player.duration, position));
  el("timeline").max = String(Math.max(1, Math.round(player.duration)));
  if (!scrubbing) el("timeline").value = String(Math.round(bounded));
  el("current-time").textContent = formatDuration(bounded);
  el("total-time").textContent = formatDuration(player.duration);
}
function decodeBinary(value) { const source = atob(value), bytes = new Uint8Array(source.length); for (let index = 0; index < source.length; index += 1) bytes[index] = source.charCodeAt(index); return bytes; }
function writeFrameImmediately(frame) {
  if (frame.text !== undefined) terminal.write(frame.text);
  else if (frame.bytes_b64 !== undefined) terminal.write(decodeBinary(frame.bytes_b64));
  else if (frame.columns && frame.rows) terminal.resize(frame.columns, frame.rows);
}
function writeFrame(frame) {
  if (frame.columns && frame.rows) { terminal.resize(frame.columns, frame.rows); return Promise.resolve(); }
  const value = frame.text !== undefined ? frame.text : frame.bytes_b64 !== undefined ? decodeBinary(frame.bytes_b64) : null;
  if (value === null) return Promise.resolve();
  return new Promise(resolve => terminal.write(value, resolve));
}
function restoreTerminalAt(session, position) {
  resetTerminal();
  session.nextFrame = 0;
  while (session.nextFrame < session.frames.length && session.frames[session.nextFrame].at_ms <= position) {
    writeFrameImmediately(session.frames[session.nextFrame]);
    session.nextFrame += 1;
  }
  session.position = position;
}
function finishReplay(session) {
  if (player !== session) return;
  session.finished = true; session.playing = false; session.position = session.duration; session.startedAt = null;
  if (session.timer) clearTimeout(session.timer);
  session.timer = null;
  status(`Playback completed — ${recordingLabel()}.`); updatePlayerUi();
}
function scheduleFrames(session) {
  if (player !== session || session.paused || session.finished || session.rendering) return;
  const position = playbackPosition();
  renderTimeline(position);
  if (session.nextFrame >= session.frames.length && position >= session.duration) { finishReplay(session); return; }
  const nextPosition = session.nextFrame < session.frames.length ? session.frames[session.nextFrame].at_ms : session.duration;
  if (nextPosition <= position) {
    const frame = session.frames[session.nextFrame];
    session.nextFrame += 1;
    session.rendering = true;
    writeFrame(frame).then(() => new Promise(resolve => requestAnimationFrame(resolve))).then(() => {
      session.rendering = false;
      if (player === session && !session.paused && !session.finished) scheduleFrames(session);
    }).catch(() => { session.rendering = false; });
    return;
  }
  const delay = Math.max(0, (nextPosition - position) / session.speed);
  session.timer = setTimeout(() => scheduleFrames(session), Math.min(delay, 50));
}
function startScheduler(session) {
  if (session.timer) clearTimeout(session.timer);
  session.startedAt = performance.now();
  scheduleFrames(session);
}
function pauseScheduler(session) {
  if (!session || session.finished) return;
  session.position = playbackPosition(); session.startedAt = null;
  if (session.timer) clearTimeout(session.timer);
  session.timer = null;
}
function startNativeTimeline(session) {
  if (!session || session.finished || session.paused) return;
  if (session.progressFrame) cancelAnimationFrame(session.progressFrame);
  session.startedAt = performance.now();
  const tick = () => {
    if (player !== session || session.paused || session.finished) return;
    renderTimeline(); session.progressFrame = requestAnimationFrame(tick);
  };
  tick();
}
function pauseNativeTimeline(session) {
  if (!session) return;
  session.position = playbackPosition(); session.startedAt = null;
  if (session.progressFrame) cancelAnimationFrame(session.progressFrame);
  session.progressFrame = null;
}
function nativeGoto(milliseconds) {
  const value = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(value / 3600000), minutes = Math.floor((value % 3600000) / 60000), seconds = Math.floor((value % 60000) / 1000), fraction = value % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(fraction).padStart(3, "0")}`;
}
function updatePlayerUi() {
  const ready = Boolean(player);
  const native = Boolean(player?.native);
  document.body.classList.toggle("native-replay", native);
  ["restart", "fullscreen"].forEach(id => { el(id).disabled = !ready; });
  ["play-pause", "stop", "step"].forEach(id => { el(id).disabled = !ready || player.finished; });
  ["speed", "backward", "forward"].forEach(id => { el(id).disabled = !ready || player.finished || native; });
  el("timeline").disabled = !ready || player.finished;
  if (!ready) { el("current-time").textContent = "0:00"; el("total-time").textContent = "0:00"; return; }
  if (native) {
    el("play-pause").textContent = player.paused ? "▶ Resume" : "❚❚ Pause";
    el("play-pause").setAttribute("aria-label", player.paused ? "Resume" : "Pause");
    renderTimeline();
    return;
  }
  el("play-pause").textContent = player.paused ? "▶ Play" : "❚❚ Pause";
  el("play-pause").setAttribute("aria-label", player.paused ? "Play" : "Pause");
  renderTimeline();
}
function stopNativeReplay(quiet = false) {
  if (!replayProcess) return;
  replayToken += 1;
  pauseNativeTimeline(player); replayProcess.close("terminated"); replayProcess = null; player = null;
  resetTerminal();
  if (!quiet) status(`Playback stopped — ${recordingLabel()}.`);
  updatePlayerUi();
}
function restartReplay() { if (selectedRecording) loadReplay(selectedRecording, selectedRow); }
function togglePlay() {
  if (!player || player.finished) return;
  if (player.native) {
    replayProcess?.input("p", true); player.paused = !player.paused;
    if (player.paused) pauseNativeTimeline(player); else startNativeTimeline(player);
    status(player.paused ? `Paused — ${recordingLabel()}.` : `Now playing ${recordingLabel()} at recorded speed.`);
    updatePlayerUi(); return;
  }
  if (player.paused) { player.paused = false; startScheduler(player); }
  else { pauseScheduler(player); player.paused = true; }
  status(player.paused ? `Paused — ${recordingLabel()}.` : `Now playing ${recordingLabel()} · ${player.speed}×.`);
  updatePlayerUi();
}
function step() {
  if (!player || player.finished) return;
  if (player.native) {
    if (!player.paused) { replayProcess?.input("p", true); player.paused = true; pauseNativeTimeline(player); }
    replayProcess?.input(".", true); status(`Paused — ${recordingLabel()} · advanced one recorded event.`); updatePlayerUi(); return;
  }
  if (!player.paused) { pauseScheduler(player); player.paused = true; }
  if (player.nextFrame >= player.frames.length) { finishReplay(player); return; }
  const frame = player.frames[player.nextFrame];
  writeFrameImmediately(frame); player.nextFrame += 1; player.position = frame.at_ms;
  status(`Paused — ${recordingLabel()} · advanced one recorded terminal event.`); updatePlayerUi();
}
function setNativeSpeed(target) {
  if (!player || player.finished) return;
  const position = playbackPosition();
  if (!Number.isFinite(target) || target <= 0) return;
  player.speed = target;
  player.position = position;
  if (!player.paused) startScheduler(player);
  status(player.paused ? `Paused — ${recordingLabel()} · ${player.speed}×.` : `Now playing ${recordingLabel()} · ${player.speed}×.`);
  updatePlayerUi();
}
async function loadReplay(recording, row, options = {}) {
  const gotoMs = Math.max(0, options.gotoMs || 0), startPaused = Boolean(options.paused);
  stopNativeReplay(true);
  selectedRecording = recording; selectRow(row);
  el("replay-details").textContent = `${recording.username} on ${recording.host} · ${recording.event_count} event(s)`;
  player = null; updatePlayerUi(); resetTerminal(`Preparing replay for ${recording.recording_id}…`);
  const token = ++replayToken;
  try {
    status(recording.cached ? "Opening cached recording…" : "Retrieving recording from Object Storage…");
    await command(["/usr/local/libexec/tlog-replay-prepare", recording.recording_id]);
    if (token !== replayToken) return;
    let duration = 0;
    try { duration = Number(JSON.parse(await command(["/usr/local/libexec/tlog-replay-timeline", recording.recording_id])).duration_ms) || 0; } catch (_) {}
    fit(); player = { native: true, paused: startPaused, finished: false, position: Math.min(gotoMs, duration), duration, startedAt: null, progressFrame: null }; updatePlayerUi();
    const args = ["/usr/local/libexec/tlog-replay-play", recording.recording_id];
    if (gotoMs > 0) args.push("--goto", nativeGoto(gotoMs));
    if (startPaused) args.push("--paused");
    status(startPaused ? `Paused — ${recordingLabel()} · ${formatDuration(player.position)}.` : `Now playing ${recordingLabel()} at recorded speed.`);
    replayProcess = cockpit.spawn(args, { superuser: "require", pty: true, err: "out", window: { cols: terminal.cols, rows: terminal.rows } });
    replayProcess.stream(chunk => { if (token === replayToken) terminal.write(chunk); });
    if (!startPaused) startNativeTimeline(player);
    await replayProcess;
    if (token === replayToken) { replayProcess = null; pauseNativeTimeline(player); player.finished = true; player.position = player.duration; status(`Playback completed — ${recordingLabel()}.`); updatePlayerUi(); }
  } catch (error) {
    if (token === replayToken) { replayProcess = null; player = null; resetTerminal(`Unable to prepare replay: ${error.message || error}`); status("Replay preparation failed."); updatePlayerUi(); }
  }
}
function seek(position) {
  if (!player || !selectedRecording || player.finished) return;
  const target = Math.max(0, Math.min(player.duration, position));
  if (player.native) { loadReplay(selectedRecording, selectedRow, { gotoMs: target, paused: player.paused }); return; }
  const wasPaused = player.paused;
  pauseScheduler(player); restoreTerminalAt(player, target); player.paused = wasPaused;
  if (!wasPaused) startScheduler(player);
  status(wasPaused ? `Paused — ${recordingLabel()} · ${formatDuration(target)}.` : `Now playing ${recordingLabel()} · ${formatDuration(target)} · ${player.speed}×.`);
  updatePlayerUi();
}
function fullscreen() { const panel = el("replay-panel"); if (document.fullscreenElement) document.exitFullscreen(); else panel.requestFullscreen?.(); }
async function initialise() { try { initialiseColumns(); initialiseSelection(); initialiseSorting(); initialiseTerminal(); initialiseRangePicker(); await loadFilters(); await Promise.all([search(), loadHealth()]); status("Select a recording to begin."); } catch (error) { status(`Unable to load the replay catalogue: ${error.message || error}`); } }

el("open-recording").addEventListener("click", startCatalogueSearch);
el("recording-id").addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); el("open-recording").click(); } });
el("recording-id").addEventListener("input", event => { if (!event.target.value.trim()) clearCatalogueSearch(); });
el("user").addEventListener("change", browseSearch);
el("host").addEventListener("change", browseSearch);
el("previous").addEventListener("click", () => { pageOffset = Math.max(0, pageOffset - pageSize); search(false); });
el("next").addEventListener("click", () => { pageOffset += pageSize; search(false); });
el("restart").addEventListener("click", restartReplay);
el("play-pause").addEventListener("click", togglePlay);
el("stop").addEventListener("click", () => stopNativeReplay());
el("backward").addEventListener("click", () => seek(playbackPosition() - 10000));
el("forward").addEventListener("click", () => seek(playbackPosition() + 10000));
el("step").addEventListener("click", step);
el("speed").addEventListener("change", event => setNativeSpeed(Number(event.target.value)));
el("timeline").addEventListener("input", event => {
  if (!player) return;
  scrubbing = true;
  const position = Number(event.target.value);
  el("current-time").textContent = formatDuration(position);
});
el("timeline").addEventListener("change", event => {
  const position = Number(event.target.value);
  scrubbing = false;
  seek(position);
});
document.querySelectorAll("[data-range-ms]").forEach(button => button.addEventListener("click", () => applyQuickRange(Number(button.dataset.rangeMs))));
el("all-indexed").addEventListener("click", () => { el("from").value = el("from").dataset.min; el("to").value = localDatetime(new Date().toISOString()); activeQuickRange = null; updateQuickRangeUi(); updateRangeSummary(); browseSearch(); });
el("refresh-health").addEventListener("click", loadHealth);
el("fullscreen").addEventListener("click", fullscreen); initialise();
