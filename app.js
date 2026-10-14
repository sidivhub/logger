let db = null;
let currentTable = null;
let currentColumns = [];
let currentRecords = [];
let editingRecordId = null;

// IndexedDB Initialization (Single store design avoids dynamic upgrade bugs)
const request = indexedDB.open('PWA_CRUD_DB_V2', 1);

request.onupgradeneeded = (event) => {
  db = event.target.result;
  if (!db.objectStoreNames.contains('app_data')) {
    db.createObjectStore('app_data', { keyPath: 'key' });
  }
};

request.onsuccess = (event) => {
  db = event.target.result;
  loadTablesList();
};

request.onerror = (event) => {
  console.error('IndexedDB error:', event.target.error);
  alert('Database failed to open.');
};

// --- DOM Elements ---
const tableListEl = document.getElementById('table-list');
const currentTableTitleEl = document.getElementById('current-table-title');
const tableViewContainer = document.getElementById('table-view-container');
const toolbarEl = document.getElementById('toolbar');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');

const btnNewTable = document.getElementById('btn-new-table');
const btnManageColumns = document.getElementById('btn-manage-columns');
const btnExportJson = document.getElementById('btn-export-json');
const btnExportCsv = document.getElementById('btn-export-csv');
const importFile = document.getElementById('import-file');
const lblImport = document.getElementById('lbl-import');
const btnAddRecord = document.getElementById('btn-add-record');

// Modals
const modalTable = document.getElementById('modal-table');
const tableNameInput = document.getElementById('table-name-input');
const modalColumns = document.getElementById('modal-columns');
const modalRecord = document.getElementById('modal-record');
const recordForm = document.getElementById('record-form');
const recordModalTitle = document.getElementById('record-modal-title');
const recordFieldsContainer = document.getElementById('record-fields-container');

// --- Helper Storage Functions ---
function getAppData(key) {
  return new Promise((resolve) => {
    const tx = db.transaction('app_data', 'readonly');
    const req = tx.objectStore('app_data').get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => resolve(null);
  });
}

function setAppData(key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('app_data', 'readwrite');
    const req = tx.objectStore('app_data').put({ key, value });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function loadTablesList() {
  const tables = (await getAppData('table_list')) || [];
  tableListEl.innerHTML = '';

  tables.forEach(tableName => {
    const li = document.createElement('li');
    li.className = `table-item ${currentTable === tableName ? 'active' : ''}`;
    li.innerHTML = `<span>${tableName}</span> <button class="delete-table" title="Delete Table">🗑️</button>`;
    
    li.querySelector('span').onclick = () => selectTable(tableName);
    li.querySelector('.delete-table').onclick = (ev) => {
      ev.stopPropagation();
      deleteTable(tableName);
    };

    tableListEl.appendChild(li);
  });
}

async function selectTable(tableName) {
  currentTable = tableName;
  currentTableTitleEl.textContent = tableName;
  btnManageColumns.disabled = false;
  btnExportJson.disabled = false;
  btnExportCsv.disabled = false;
  importFile.disabled = false;
  lblImport.style.opacity = '1';
  lblImport.style.pointerEvents = 'auto';
  toolbarEl.style.display = 'flex';

  await loadTablesList(); 
  await fetchTableData();
}

async function fetchTableData() {
  const meta = await getAppData(`meta_${currentTable}`);
  currentColumns = meta ? meta.columns : [{ name: 'id', type: 'text' }, { name: 'Name', type: 'text' }];
  currentRecords = (await getAppData(`data_${currentTable}`)) || [];
  
  renderTable();
  updateSortOptions();
}

// --- Table Rendering & Filtering ---
function renderTable() {
  const query = searchInput.value.toLowerCase();
  const sortBy = sortSelect.value;

  let filtered = currentRecords.filter(record => {
    return currentColumns.some(col => {
      const val = record[col.name];
      return val !== undefined && val !== null && String(val).toLowerCase().includes(query);
    });
  });

  if (sortBy) {
    filtered.sort((a, b) => {
      if (a[sortBy] < b[sortBy]) return -1;
      if (a[sortBy] > b[sortBy]) return 1;
      return 0;
    });
  }

  if (currentColumns.length === 0) {
    tableViewContainer.innerHTML = `<p class="placeholder-text">No columns configured. Click ⚙️ Columns to add fields.</p>`;
    return;
  }

  let html = `<table><thead><tr>`;
  currentColumns.forEach(col => {
    html += `<th>${col.name} <small>(${col.type})</small></th>`;
  });
  html += `<th class="actions-cell">Actions</th></tr></thead><tbody>`;

  if (filtered.length === 0) {
    html += `<tr><td colspan="${currentColumns.length + 1}" class="placeholder-text">No records found.</td></tr>`;
  } else {
    filtered.forEach(record => {
      html += `<tr>`;
      currentColumns.forEach(col => {
        let val = record[col.name] !== undefined ? record[col.name] : '';
        if (col.type === 'boolean') val = val ? '✅ Yes' : '❌ No';
        html += `<td>${escapeHtml(String(val))}</td>`;
      });
      html += `<td class="actions-cell">
        <button class="btn btn-secondary" onclick="openEditRecord('${record.id}')">✏️</button>
        <button class="btn btn-danger" onclick="deleteRecord('${record.id}')">🗑️</button>
      </td></tr>`;
    });
  }

  html += `</tbody></table>`;
  tableViewContainer.innerHTML = html;
}

function updateSortOptions() {
  sortSelect.innerHTML = `<option value="">Sort by...</option>`;
  currentColumns.forEach(col => {
    const opt = document.createElement('option');
    opt.value = col.name;
    opt.textContent = col.name;
    sortSelect.appendChild(opt);
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

searchInput.oninput = renderTable;
sortSelect.onchange = renderTable;

// --- Table Management Actions ---
btnNewTable.onclick = () => {
  tableNameInput.value = '';
  modalTable.classList.add('open');
};

document.getElementById('modal-table-cancel').onclick = () => modalTable.classList.remove('open');

document.getElementById('modal-table-save').onclick = async () => {
  const name = tableNameInput.value.trim();
  if (!name) return alert('Enter table name');
  
  let tables = (await getAppData('table_list')) || [];
  if (tables.includes(name)) {
    return alert('Table already exists');
  }

  tables.push(name);
  await setAppData('table_list', tables);
  await setAppData(`meta_${name}`, { 
    columns: [{ name: 'id', type: 'text' }, { name: 'Name', type: 'text' }] 
  });
  await setAppData(`data_${name}`, []);

  modalTable.classList.remove('open');
  await loadTablesList();
  selectTable(name);
};

async function deleteTable(tableName) {
  if (!confirm(`Delete table "${tableName}" and all its records?`)) return;
  
  let tables = (await getAppData('table_list')) || [];
  tables = tables.filter(t => t !== tableName);
  await setAppData('table_list', tables);

  // Clear data keys
  const tx = db.transaction('app_data', 'readwrite');
  const store = tx.objectStore('app_data');
  store.delete(`meta_${tableName}`);
  store.delete(`data_${tableName}`);

  tx.oncomplete = async () => {
    if (currentTable === tableName) {
      currentTable = null;
      currentTableTitleEl.textContent = 'Select or Create a Table';
      tableViewContainer.innerHTML = `<p class="placeholder-text">Choose a table from the sidebar to view data.</p>`;
      toolbarEl.style.display = 'none';
      btnManageColumns.disabled = true;
      btnExportJson.disabled = true;
      btnExportCsv.disabled = true;
      importFile.disabled = true;
      lblImport.style.opacity = '0.5';
      lblImport.style.pointerEvents = 'none';
    }
    await loadTablesList();
  };
}

// --- Column Management Modal ---
btnManageColumns.onclick = () => {
  renderColumnsList();
  modalColumns.classList.add('open');
};

document.getElementById('modal-columns-close').onclick = () => modalColumns.classList.remove('open');

const colTypeSelect = document.getElementById('col-type');
const colOptionsInput = document.getElementById('col-options');
colTypeSelect.onchange = (e) => {
  colOptionsInput.style.display = e.target.value === 'select' ? 'block' : 'none';
};

function renderColumnsList() {
  const container = document.getElementById('columns-list');
  container.innerHTML = '';
  currentColumns.forEach(col => {
    const div = document.createElement('div');
    div.className = 'column-item';
    div.innerHTML = `<span><strong>${col.name}</strong> (${col.type})</span> ${col.name !== 'id' ? `<button class="btn btn-danger" onclick="deleteColumn('${col.name}')">Delete</button>` : ''}`;
    container.appendChild(div);
  });
}

document.getElementById('btn-add-column').onclick = async () => {
  const name = document.getElementById('col-name').value.trim();
  const type = colTypeSelect.value;
  const options = document.getElementById('col-options').value.split(',').map(s => s.trim()).filter(Boolean);

  if (!name) return alert('Enter column name');
  if (currentColumns.some(c => c.name === name)) return alert('Column already exists');

  currentColumns.push({ name, type, options });
  await setAppData(`meta_${currentTable}`, { columns: currentColumns });

  document.getElementById('col-name').value = '';
  document.getElementById('col-options').value = '';
  renderColumnsList();
  fetchTableData();
};

window.deleteColumn = async (colName) => {
  if (!confirm(`Delete column "${colName}"?`)) return;
  currentColumns = currentColumns.filter(c => c.name !== colName);
  await setAppData(`meta_${currentTable}`, { columns: currentColumns });

  renderColumnsList();
  fetchTableData();
};

// --- Record CRUD Operations ---
btnAddRecord.onclick = () => {
  editingRecordId = null;
  recordModalTitle.textContent = 'Add Record';
  buildRecordForm({});
  modalRecord.classList.add('open');
};

window.openEditRecord = (id) => {
  editingRecordId = id;
  recordModalTitle.textContent = 'Edit Record';
  const record = currentRecords.find(r => r.id === id);
  buildRecordForm(record || {});
  modalRecord.classList.add('open');
};

document.getElementById('modal-record-cancel').onclick = () => modalRecord.classList.remove('open');

function buildRecordForm(data) {
  recordFieldsContainer.innerHTML = '';
  currentColumns.forEach(col => {
    const val = data[col.name] !== undefined ? data[col.name] : '';
    const div = document.createElement('div');
    div.className = 'field-group';
    div.innerHTML = `<label>${col.name} (${col.type})</label>`;

    let input;
    if (col.type === 'number') {
      input = `<input type="number" name="${col.name}" value="${val}" class="input">`;
    } else if (col.type === 'date') {
      input = `<input type="date" name="${col.name}" value="${val}" class="input">`;
    } else if (col.type === 'boolean') {
      input = `<select name="${col.name}" class="input"><option value="true" ${val === true ? 'selected' : ''}>Yes</option><option value="false" ${val === false || val === '' ? 'selected' : ''}>No</option></select>`;
    } else if (col.type === 'select') {
      input = `<select name="${col.name}" class="input">`;
      (col.options || []).forEach(opt => {
        input += `<option value="${opt}" ${val === opt ? 'selected' : ''}>${opt}</option>`;
      });
      input += `</select>`;
    } else {
      input = `<input type="text" name="${col.name}" value="${val}" class="input">`;
    }

    div.innerHTML += input;
    recordFieldsContainer.appendChild(div);
  });
}

recordForm.onsubmit = async (e) => {
  e.preventDefault();
  const formData = new FormData(recordForm);
  const recordId = editingRecordId || 'rec_' + Date.now() + Math.random().toString(36).substr(2, 5);
  const record = { id: recordId };

  currentColumns.forEach(col => {
    let raw = formData.get(col.name);
    if (col.type === 'number') record[col.name] = raw ? Number(raw) : 0;
    else if (col.type === 'boolean') record[col.name] = raw === 'true';
    else record[col.name] = raw;
  });

  if (editingRecordId) {
    const idx = currentRecords.findIndex(r => r.id === editingRecordId);
    if (idx !== -1) currentRecords[idx] = record;
  } else {
    currentRecords.push(record);
  }

  await setAppData(`data_${currentTable}`, currentRecords);
  modalRecord.classList.remove('open');
  fetchTableData();
};

window.deleteRecord = async (id) => {
  if (!confirm('Delete this record?')) return;
  currentRecords = currentRecords.filter(r => r.id !== id);
  await setAppData(`data_${currentTable}`, currentRecords);
  fetchTableData();
};

// --- Import & Export ---
btnExportJson.onclick = () => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ columns: currentColumns, records: currentRecords }, null, 2));
  const dlAnchor = document.createElement('a');
  dlAnchor.setAttribute("href", dataStr);
  dlAnchor.setAttribute("download", `${currentTable}_backup.json`);
  document.body.appendChild(dlAnchor);
  dlAnchor.click();
  dlAnchor.remove();
};

btnExportCsv.onclick = () => {
  if (currentColumns.length === 0) return;
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += currentColumns.map(c => c.name).join(",") + "\r\n";

  currentRecords.forEach(record => {
    let row = currentColumns.map(c => {
      let val = record[c.name] !== undefined ? record[c.name] : '';
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(",");
    csvContent += row + "\r\n";
  });

  const encodedUri = encodeURI(csvContent);
  const dlAnchor = document.createElement('a');
  dlAnchor.setAttribute("href", encodedUri);
  dlAnchor.setAttribute("download", `${currentTable}_export.csv`);
  document.body.appendChild(dlAnchor);
  dlAnchor.click();
  dlAnchor.remove();
};

importFile.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  const isJson = file.name.endsWith('.json');

  reader.onload = async (event) => {
    const content = event.target.result;
    if (isJson) {
      try {
        const parsed = JSON.parse(content);
        if (parsed.columns && parsed.records) {
          currentColumns = parsed.columns;
          currentRecords = parsed.records;
          await setAppData(`meta_${currentTable}`, { columns: currentColumns });
          await setAppData(`data_${currentTable}`, currentRecords);

          importFile.value = '';
          fetchTableData();
          alert('JSON imported successfully!');
        }
      } catch (err) {
        alert('Invalid JSON file.');
      }
    } else {
      const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return;
      const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());

      headers.forEach(h => {
        if (!currentColumns.some(c => c.name === h)) {
          currentColumns.push({ name: h, type: 'text' });
        }
      });

      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.replace(/^"|"$/g, ''));
        const record = { id: 'rec_' + Date.now() + Math.random().toString(36).substr(2, 5) };
        headers.forEach((h, idx) => {
          record[h] = vals[idx] !== undefined ? vals[idx] : '';
        });
        currentRecords.push(record);
      }

      await setAppData(`meta_${currentTable}`, { columns: currentColumns });
      await setAppData(`data_${currentTable}`, currentRecords);

      importFile.value = '';
      fetchTableData();
      alert('CSV imported successfully!');
    }
  };
  reader.readAsText(file);
};
