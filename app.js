const workspace = document.getElementById('workspace');

let shipLibrary = [];
let shipCrew = [{ name: 'Crewman 1', perk: 'none' }];
let customRoomsDatabase = [];
let currentFleet = [];
let activeFleetShipId = null;


const STATE_KEY = 'corvet_state_v2';
let storageRecoveryRequired = false;
let autosaveRecoveryRequired = false;
const storedRecoveryData = {};
const UI_TYPES = new Set(['header', 'points', 'target-die', 'portrait', 'hull', 'shields', 'speed', 'power', 'crew-manifest']);

function newId(prefix = 'ship') {
  return prefix + '_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
}

function requireData(condition, message) {
  if (!condition) throw new Error(message);
}

function validId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
}

function isSafePortrait(value) {
  return typeof value === 'string' && /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-zA-Z0-9+/=\r\n]+$/.test(value);
}

function normalizeCustomRooms(value) {
  requireData(Array.isArray(value), 'Custom rooms must be a list.');
  const ids = new Set();
  return value.map(r => {
    requireData(r && validId(r.id) && r.id.startsWith('custom_') && !ids.has(r.id), 'Invalid or duplicate custom room ID.');
    ids.add(r.id);
    requireData(typeof r.name === 'string' && r.name.length <= 500, 'Invalid custom room name.');
    for (const key of ['cost', 'width', 'height', 'max_connections', 'max_hp', 'ammo']) {
      const n = r[key] ?? (key === 'ammo' ? 0 : undefined);
      requireData(Number.isSafeInteger(n) && n >= (['width', 'height', 'max_hp'].includes(key) ? 1 : 0) && n <= 1000000, 'Invalid custom room ' + key + '.');
    }
    return {id:r.id, name:r.name, type:'custom', cost:r.cost, width:r.width, height:r.height,
      max_connections:r.max_connections, max_hp:r.max_hp, ammo:r.ammo ?? 0,
      is_mannable:r.is_mannable === true, has_arc:r.has_arc === true, archived:r.archived === true};
  });
}

function normalizeLayout(value, database = roomDatabase) {
  requireData(Array.isArray(value) && value.length > 0 && value.length <= 2000, 'Ship layout must be a non-empty list (maximum 2,000 items).');
  const seenUI = new Set();
  return value.map(item => {
    requireData(item && validId(item.id) && typeof item.isUI === 'boolean', 'Invalid layout item.');
    const position = key => {
      const raw = item[key];
      requireData(typeof raw === 'number' || (typeof raw === 'string' && /^-?\d+(?:\.\d+)?(?:px)?$/.test(raw)), 'Invalid room position.');
      const n = parseFloat(raw);
      requireData(Number.isFinite(n) && Math.abs(n) <= 100000, 'Invalid room position.');
      return Math.round(n) + 'px';
    };
    const out = {id:item.id, isUI:item.isUI, left:position('left'), top:position('top'), customText:item.customText ?? null,
      customClassText:item.customClassText ?? null, arcState:item.arcState ?? null};
    requireData(out.customText === null || typeof out.customText === 'string', 'Invalid ship text.');
    requireData(out.customClassText === null || typeof out.customClassText === 'string', 'Invalid ship class.');
    requireData(out.arcState === null || (Number.isInteger(out.arcState) && out.arcState >= 0 && out.arcState <= 3), 'Invalid firing arc.');
    if (!out.isUI) {
      requireData(database.some(r => r.id === out.id), 'Unknown room: ' + out.id + '. Import its custom room definition first.');
    } else {
      requireData(UI_TYPES.has(out.id), 'Unknown board element: ' + out.id);
      requireData(out.id === 'portrait' || !seenUI.has(out.id), 'Duplicate board element: ' + out.id);
      seenUI.add(out.id);
      if (out.id === 'hull') requireData(hullDatabase.some(h => h.id === out.customText), 'Unknown hull.');
      if (out.id === 'shields') requireData(shieldDatabase.some(h => h.id === out.customText), 'Unknown shields.');
      if (out.id === 'portrait' && out.customText) requireData(isSafePortrait(out.customText), 'Portrait must be a PNG, JPEG, GIF or WebP data image.');
      if (out.id === 'crew-manifest') {
        const crew = JSON.parse(out.customText || '[]');
        requireData(Array.isArray(crew) && crew.length <= 500, 'Crew manifest must be a list.');
        crew.forEach(c => requireData(c && typeof c.name === 'string' && crewPerks.some(p => p.id === (c.perk || 'none')), 'Invalid crew member or specialisation.'));
        out.customText = JSON.stringify(crew.map(c => ({name:c.name, perk:c.perk || 'none'})));
      }
    }
    return out;
  });
}

function shipSignature(ship) {
  return JSON.stringify([ship.name, ship.layout]);
}

function shipDesignSignature(ship) {
  return JSON.stringify(ship.layout.map(item => item.isUI && item.id === 'header' ? {...item, customText:null} : item));
}

function isNumberedCopy(name, base) {
  if (!name.startsWith(base + ' (') || !name.endsWith(')')) return false;
  return /^\d+$/.test(name.slice(base.length + 2, -1));
}

function uniqueShipName(name, library) {
  if (!library.some(s => s.name === name)) return name;
  let number = 2;
  while (library.some(s => s.name === `${name} (${number})`)) number++;
  return `${name} (${number})`;
}

function setShipName(ship, name) {
  ship.name = name;
  ship.id = name;
  const header = ship.layout.find(item => item.isUI && item.id === 'header');
  if (header) header.customText = name;
  return ship;
}

function normalizeLibrary(value, database = roomDatabase) {
  requireData(Array.isArray(value), 'Ship library must be a list.');
  const result = [];
  for (const ship of value) {
    requireData(ship && typeof ship.name === 'string' && ship.name.length <= 500, 'Each ship needs a name.');
    const out = {name:ship.name, layout:normalizeLayout(ship.layout, database)};
    if (ship.id !== undefined) requireData(typeof ship.id === 'string' && ship.id.length <= 500, 'Invalid ship ID.');
    if (ship.id && ship.id !== ship.name) Object.defineProperty(out, '_previousId', {value:ship.id});
    const existing = result.find(s => s.name === out.name);
    if (existing && shipSignature(existing) === shipSignature(out)) continue;
    setShipName(out, uniqueShipName(out.name, result));
    result.push(out);
  }
  return result;
}

function normalizeFleet(value, library = shipLibrary) {
  requireData(Array.isArray(value), 'Fleet must be a list.');
  const ids = new Set();
  return value.map(f => {
    requireData(f && (typeof f.shipId === 'string' || typeof f.shipName === 'string'), 'Invalid fleet entry.');
    const ship = library.find(s => s.id === f.shipId || s._previousId === f.shipId || s.name === f.shipName);
    let id = f.id == null ? newId('fleet') : String(f.id);
    if (ids.has(id)) id = newId('fleet');
    ids.add(id);
    return {id, shipId:ship?.name || f.shipName || f.shipId || null, shipName:ship?.name || f.shipName || 'Unknown ship'};
  });
}

function readStored(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) storedRecoveryData[key] = raw;
    return raw;
  } catch (e) {
    storageRecoveryRequired = true;
    return null;
  }
}

function persistState(library = shipLibrary, customRooms = customRoomsDatabase, fleet = currentFleet) {
  if (storageRecoveryRequired) {
    alert('Saved data needs recovery before changes can be saved. Use the recovery notice above.');
    return false;
  }
  try {
    const checkedRooms = normalizeCustomRooms(customRooms);
    normalizeLibrary(library, [...roomDatabase.filter(r => !r.id.startsWith('custom_')), ...checkedRooms]);
    normalizeFleet(fleet, library);
  } catch (e) {
    alert('Unable to save this data: ' + e.message);
    return false;
  }
  try {
    // One atomic localStorage write prevents half-imported ships/custom rooms.
    localStorage.setItem(STATE_KEY, JSON.stringify({schemaVersion:2, corvetLibrary:library, customRooms, fleet}));
    return true;
  } catch (e) {
    alert('Unable to save. Browser storage may be full or unavailable. Export a backup before closing this page.');
    return false;
  }
}

function installCustomRooms(rooms) {
  customRoomsDatabase = rooms;
  for (let i = roomDatabase.length - 1; i >= 0; i--) {
    if (roomDatabase[i].id.startsWith('custom_')) roomDatabase.splice(i, 1);
  }
  roomDatabase.push(...rooms);
}

function loadStoredState() {
  const raw = readStored(STATE_KEY);
  const legacy = Object.fromEntries(['corvet_library','corvet_custom_rooms','corvet_fleet'].map(key => [key, readStored(key)]));
  try {
    const data = raw !== null ? JSON.parse(raw) : {
      corvetLibrary:JSON.parse(legacy.corvet_library || '[]'),
      customRooms:JSON.parse(legacy.corvet_custom_rooms || '[]'),
      fleet:JSON.parse(legacy.corvet_fleet || '[]')
    };
    requireData(data && (raw === null || data.schemaVersion === 2), 'Unsupported saved-data version.');
    const custom = normalizeCustomRooms(data.customRooms);
    const database = [...roomDatabase.filter(r => !r.id.startsWith('custom_')), ...custom];
    const library = normalizeLibrary(data.corvetLibrary, database);
    const fleet = normalizeFleet(data.fleet, library);
    installCustomRooms(custom);
    shipLibrary = library;
    currentFleet = fleet;
  } catch (e) {
    storageRecoveryRequired = true;
    console.error('Saved data was preserved for recovery:', e);
  }
}

function showRecoveryNotice() {
  if (!storageRecoveryRequired && !autosaveRecoveryRequired) return;
  const box = document.createElement('div');
  box.id = 'recovery-notice';
  box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:20000;background:#5c2c2c;color:white;padding:12px';
  const message = document.createElement('p');
  message.textContent = 'Some saved data could not be loaded. The original data is preserved. Download it before resetting; saving affected data is paused.';
  const download = document.createElement('button');
  download.textContent = 'Download saved data';
  download.onclick = () => downloadJSON(storedRecoveryData, 'corvet-recovery.json');
  const reset = document.createElement('button');
  reset.textContent = 'Reset unreadable data';
  reset.onclick = () => {
    if (!confirm('Reset the unreadable saved data? Download a recovery copy first.')) return;
    try {
      const keys = storageRecoveryRequired ? [STATE_KEY, 'corvet_library', 'corvet_custom_rooms', 'corvet_fleet'] : [];
      if (autosaveRecoveryRequired) keys.push('corvet_autosave');
      keys.forEach(key => localStorage.removeItem(key));
      location.reload();
    } catch (e) { alert('Browser storage is unavailable. Please enable local storage for this page.'); }
  };
  box.append(message, download, reset);
  document.body.appendChild(box);
}

function downloadJSON(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function mergeLibraryData(data) {
  requireData(data && (data.schemaVersion === undefined || data.schemaVersion === 2), 'Unsupported backup version.');
  const custom = normalizeCustomRooms(data.customRooms ?? []);
  const nextCustom = [...customRoomsDatabase];
  for (const room of custom) {
    const existing = nextCustom.find(r => r.id === room.id);
    requireData(!existing || JSON.stringify({...existing, archived:false}) === JSON.stringify({...room, archived:false}),
      'A custom room ID has conflicting definitions: ' + room.name);
    if (!existing) nextCustom.push(room);
  }
  const database = [...roomDatabase.filter(r => !r.id.startsWith('custom_')), ...nextCustom];
  const incoming = normalizeLibrary(data.corvetLibrary, database);
  const merged = [...shipLibrary];
  let added = 0;
  for (const ship of incoming) {
    if (merged.some(s => shipSignature(s) === shipSignature(ship))) continue;
    if (merged.some(s => isNumberedCopy(s.name, ship.name) && shipDesignSignature(s) === shipDesignSignature(ship))) continue;
    if (merged.some(s => s.name === ship.name)) setShipName(ship, uniqueShipName(ship.name, merged));
    merged.push(ship);
    added++;
  }
  if (!persistState(merged, nextCustom)) return null;
  shipLibrary = merged;
  installCustomRooms(nextCustom);
  refreshRoomMenu();
  updateFleetDropdown();
  renderFleetSidebar();
  return added;
}

function refreshRoomMenu(selectedId = document.getElementById('room-select').value) {
  const select = document.getElementById('room-select');
  select.innerHTML = '';
  roomDatabase.filter(r => r.type !== 'core' && !r.archived).sort((a,b) => a.name.localeCompare(b.name)).forEach(room => {
    const option = document.createElement('option');
    option.value = room.id;
    option.textContent = `${room.name} (${room.cost} pts)`;
    select.appendChild(option);
  });
  if ([...select.options].some(o => o.value === selectedId)) select.value = selectedId;
  updateCustomRoomDeleteButton();
}

// --- SORTING HELPERS ---
function getShipClass(layout) {
  if (!layout) return "PLEASE RESAVE SHIP";
  const header = layout.find(item => item.id === 'header');
  return (header && header.customClassText && header.customClassText.trim() !== '') 
    ? header.customClassText.toUpperCase() 
    : "PLEASE RESAVE SHIP";
}

function getSortedLibrary() {
  return [...shipLibrary].sort((a, b) => {
    const classA = getShipClass(a.layout);
    const classB = getShipClass(b.layout);
    if (classA < classB) return -1;
    if (classA > classB) return 1;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
}

function escapeHtml(unsafe) {
  return (unsafe || "").toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function calculateLayoutCost(layout) {
  if (!layout) return 0;
  let total = 0;
  layout.forEach(item => {
    if (!item.isUI) {
      const roomData = roomDatabase.find(db => db.id === item.id);
      if (roomData && roomData.cost) total += roomData.cost;
    } else if (item.id === 'hull' && item.customText) {
      const hullData = hullDatabase.find(h => h.id === item.customText);
      if (hullData && hullData.cost) total += hullData.cost;
    } else if (item.id === 'shields' && item.customText) {
      const shieldData = shieldDatabase.find(s => s.id === item.customText);
      if (shieldData && shieldData.cost) total += shieldData.cost;
    } else if (item.id === 'crew-manifest' && item.customText) {
       try {
         const parsedCrew = JSON.parse(item.customText);
         total += (Math.max(0, parsedCrew.length - 1) * crewConfig.cost);
         parsedCrew.forEach(c => {
           if (c.perk && c.perk !== 'none') {
             const pData = crewPerks.find(p => p.id === c.perk);
             if (pData) total += pData.cost;
           }
         });
       } catch(e) {}
    }
  });
  return total;
}

function getShipPoints(ship) {
  // Always calculate dynamically to prevent stale points after rebalancing room costs
  return calculateLayoutCost(ship.layout);
}
function updatePoints() {
  const currentLayout = getCurrentLayoutData();
  const total = calculateLayoutCost(currentLayout);

  const pointsDisplay = document.getElementById('points-total');
  if (pointsDisplay) pointsDisplay.textContent = 'Total Points: ' + total;
  
  const boardPoints = document.getElementById('board-points-display');
  if (boardPoints) boardPoints.textContent = total + " Points";
}

function init() {
  loadStoredState();
  populateDropdown();
  updateFleetDropdown();
  renderFleetSidebar();
  loadThemePreference();
  
  const autosave = readStored('corvet_autosave');
  if (autosave) {
    try {
      const saved = JSON.parse(autosave);
      const layoutData = normalizeLayout(Array.isArray(saved) ? saved : saved.layout);
      loadShipToWorkspace(layoutData);
    } catch (e) {
      autosaveRecoveryRequired = true;
      setupDefaultWorkspace();
    }
  } else {
    setupDefaultWorkspace();
  }
  showRecoveryNotice();
}

function loadThemePreference() {
  if (readStored('corvet_printer_friendly') === 'true') {
    document.body.classList.add('printer-friendly');
  }
  updateThemeButton();
}

function updateThemeButton() {
  const btn = document.getElementById('btn-theme');
  if (!btn) return;
  const icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>`;  
  if (document.body.classList.contains('printer-friendly')) {
    btn.innerHTML = `${icon} Printer Friendly: ON`;
    btn.classList.add('active-mode');
  } else {
    btn.innerHTML = `${icon} Printer Friendly: OFF`;
    btn.classList.remove('active-mode');
  }
}

function setupDefaultWorkspace() {
  workspace.innerHTML = ''; 
  document.getElementById('ship-name-input').value = 'NEW SHIP';
  document.getElementById('ship-class-input').value = 'CORVETTE';
  shipCrew = [{ name: 'Crewman 1', perk: 'none' }]; 
  setupBoardElements();
  setupCoreRooms();
  syncDropdownsToBoard();
  updatePoints();
  updateDoors();
  updateTargetNumbers();
  updateZIndices();
  renderCrewSidebar();
}

function autoSaveWorkspace() {
  if (storageRecoveryRequired || autosaveRecoveryRequired) return;
  const layoutData = getCurrentLayoutData();
  try {
    localStorage.setItem('corvet_autosave', JSON.stringify({layout:layoutData}));
  } catch(e) {
    document.getElementById('warnings-container').textContent = 'Autosave failed. Export or free browser storage before closing this page.';
  }
}

function populateDropdown() {
  const select = document.getElementById('room-select');
  const optionalRooms = roomDatabase.filter(r => r.type !== 'core' && !r.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
  
  optionalRooms.forEach(room => {
    const option = document.createElement('option');
    option.value = room.id;
    option.textContent = `${room.name} (${room.cost} pts)`;
    select.appendChild(option);
  });

  const hullSelect = document.getElementById('hull-select');
  hullDatabase.forEach(hull => {
    const option = document.createElement('option');
    option.value = hull.id;
    option.textContent = `${hull.name} (${hull.cost} pts)`;
    hullSelect.appendChild(option);
  });
  hullSelect.value = "hull_medium"; 

  const shieldSelect = document.getElementById('shield-select');
  shieldDatabase.forEach(shield => {
    const option = document.createElement('option');
    option.value = shield.id;
    option.textContent = `${shield.name} (${shield.cost} pts)`;
    shieldSelect.appendChild(option);
  });
  shieldSelect.value = "shield_medium";

  const populateCore = (categoryId, elementId) => {
    const sel = document.getElementById(elementId);
    const variants = roomDatabase.filter(r => r.core_category === categoryId)
      .sort((a, b) => a.name.localeCompare(b.name));
    variants.forEach(room => {
      const option = document.createElement('option');
      option.value = room.id;
      option.textContent = `${room.name} (${room.cost} pts)`;
      sel.appendChild(option);
    });
  };
  
  populateCore('reactor', 'reactor-select');
  populateCore('engine', 'engine-select');
  populateCore('helm', 'helm-select');
  document.getElementById('reactor-select').value = "reactor"; 
}

function setupBoardElements() {
  createUIElement('header', 500, 20);
  createUIElement('points', 500, 90); 
  createUIElement('target-die', 500, 125); 
  createUIElement('portrait', 20, 120);
  createUIElement('hull', 20, 20);
  createUIElement('shields', 110, 15);
  createUIElement('speed', 700, 400);
  createUIElement('power', 20, 900);
  createUIElement('crew-manifest', 20, 320);
}

function createUIElement(type, startX, startY, customText = null, customClassText = null) {
  const el = document.createElement('div');
  el.dataset.uiType = type;
  el.style.left = startX + 'px';
  el.style.top = startY + 'px';

  if (type === 'header') {
    el.className = 'board-ui ship-header-ui';
    el.id = 'ship-header';
    el.innerHTML = `
      <div id="ship-name-display" class="ship-name-text">${escapeHtml(customText ?? document.getElementById('ship-name-input').value)}</div>
      <div id="ship-class-display" class="ship-class-text">${escapeHtml(customClassText ?? document.getElementById('ship-class-input').value)}</div>
    `;
  } else if (type === 'hull') {
    el.className = 'board-ui hull-ui';
    el.dataset.hullId = customText || 'hull_medium';
    const hullData = hullDatabase.find(h => h.id === el.dataset.hullId) || hullDatabase[1];
    el.innerHTML = `<div>${hullData.hp}</div><div class="ui-label">HULL</div>`;
  } else if (type === 'shields') {
    el.className = 'board-ui shield-ui';
    el.dataset.shieldId = customText || 'shield_medium';
    const shieldData = shieldDatabase.find(s => s.id === el.dataset.shieldId) || shieldDatabase[1];
    el.innerHTML = `
      <svg class="shield-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon points="50,5 95,25 95,75 50,95 5,75 5,25"/>
      </svg>
      <span>${shieldData.hp}</span>
      <div class="ui-label">SHIELDS</div>
    `;
  } else if (type === 'power') {
    el.className = 'board-ui power-pool-ui';
    el.textContent = 'Power Pool';
  } else if (type === 'speed') {
    el.className = 'board-ui speed-track-ui';
    el.innerHTML = `
      <div class="speed-box">SP</div>
      <div class="speed-box">12</div>
      <div class="speed-box">10</div>
      <div class="speed-box">8</div>
      <div class="speed-box">6</div>
      <div class="speed-box">4</div>
      <div class="speed-box">2</div>
      <div class="speed-box">0</div>
    `;
  } else if (type === 'points') {
    el.className = 'board-ui points-ui';
    el.id = 'board-points-display';
    el.textContent = 'TOTAL PTS: 0';
  } else if (type === 'target-die') {
    el.className = 'board-ui target-die-ui';
    el.id = 'board-target-die';
    el.textContent = 'TARGET DIE: D0';
  } else if (type === 'portrait') {
    el.className = 'board-ui portrait-ui';
    if (isSafePortrait(customText)) {
      el.classList.add('has-image');
      el.innerHTML = `<img /><div class="portrait-placeholder">Double-Click<br>To Add Image</div>`;
      el.querySelector('img').src = customText;
    } else {
      el.innerHTML = `<img src="" /><div class="portrait-placeholder">Double-Click<br>To Add Image</div>`;
    }
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete-room';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.title = 'Delete Image Box';
    deleteBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    deleteBtn.addEventListener('click', () => {
      el.remove();
      updateDoors();
      autoSaveWorkspace();
    });
    el.appendChild(deleteBtn);
    
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      window.activePortraitForUpload = el;
      document.getElementById('file-portrait').click();
    });
  } else if (type === 'crew-manifest') {
    el.className = 'board-ui crew-manifest-ui';
    el.id = 'board-crew-manifest';
    renderCrewOnBoard(el);
  }

  workspace.appendChild(el);
  makeDraggable(el, false);
}

function setupCoreRooms() {
  createRoom('helm', 320, 50);
  createRoom('engine', 320, 800);
  createRoom('reactor', 320, 500);
}

function createRoom(roomId, startX = 100, startY = 100, arcState = 0) {
  const roomData = roomDatabase.find(r => r.id === roomId);
  if (!roomData) {
    console.warn(`Room ID ${roomId} missing.`);
    alert(`Warning: A saved room could not be found. It may have been deleted.`);
    return;
  }

  const room = document.createElement('div');
  room.classList.add('room');
  room.dataset.id = roomData.id;
  
  room.style.width = roomData.width + 'px';
  room.style.height = roomData.height + 'px';
  room.style.left = startX + 'px';
  room.style.top = startY + 'px';

  if (roomData.type === 'corridor') {
    workspace.appendChild(room);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete-room';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.title = 'Delete Corridor';
    deleteBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    deleteBtn.addEventListener('click', () => {
      room.remove();
      updatePoints();
      updateDoors();
      updateTargetNumbers();
      autoSaveWorkspace();
    });
    room.appendChild(deleteBtn);

    makeDraggable(room, true);
    return;
  }

  const inner = document.createElement('div');
  inner.classList.add('room-inner');

  if (roomData.max_hp !== undefined) {
    const hpBox = document.createElement('div');
    if (roomData.core_category === 'reactor') {
      hpBox.classList.add('reactor-hp-box');
    } else {
      hpBox.classList.add('hp-box');
    }
    hpBox.textContent = roomData.max_hp;
    inner.appendChild(hpBox);
  }

  if (roomData.ammo && roomData.ammo > 0) {
    const ammoBox = document.createElement('div');
    ammoBox.classList.add('ammo-box');
    ammoBox.textContent = 'A' + roomData.ammo; 
    inner.appendChild(ammoBox);
  }

  if (roomData.is_mannable) {
    const circle = document.createElement('div');
    circle.classList.add('manned-circle');
    inner.appendChild(circle);
  }

  if (roomData.has_arc) {
    const arcDiv = document.createElement('div');
    arcDiv.classList.add('arc-circle');
    arcDiv.dataset.arc = arcState || 0;
    arcDiv.style.transform = `rotate(${(arcState || 0) * 90}deg)`;
    
    arcDiv.innerHTML = `
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" stroke-width="4"/>
        <line x1="16.06" y1="16.06" x2="83.94" y2="83.94" stroke="currentColor" stroke-width="4"/>
        <line x1="16.06" y1="83.94" x2="83.94" y2="16.06" stroke="currentColor" stroke-width="4"/>
        <path d="M50,50 L16.06,16.06 A48,48 0 0,1 83.94,16.06 Z" fill="currentColor" />
      </svg>
    `;

    arcDiv.addEventListener('mousedown', (e) => {
      e.stopPropagation(); 
    });

    arcDiv.addEventListener('click', () => {
      let currentArc = parseInt(arcDiv.dataset.arc) || 0;
      currentArc = (currentArc + 1) % 4;
      arcDiv.dataset.arc = currentArc;
      arcDiv.style.transform = `rotate(${currentArc * 90}deg)`;
      autoSaveWorkspace();
    });

    inner.appendChild(arcDiv);
  }

  const nameDiv = document.createElement('div');
  nameDiv.classList.add('room-name');
  nameDiv.textContent = roomData.name;
  inner.appendChild(nameDiv);

  const targetDiv = document.createElement('div');
  targetDiv.classList.add('target-number');
  inner.appendChild(targetDiv);

  if (roomData.type !== 'core') {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete-room';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.title = 'Delete Room';
    deleteBtn.addEventListener('mousedown', (e) => e.stopPropagation()); 
    deleteBtn.addEventListener('click', () => {
      room.remove();
      updatePoints();
      updateDoors();
      updateTargetNumbers();
      autoSaveWorkspace();
    });
    inner.appendChild(deleteBtn);
  }

  room.appendChild(inner);
  workspace.appendChild(room);
  makeDraggable(room, true);
}

function makeDraggable(element, shouldSnap = true) {
  let startX, startY;
  let groupData = [];

  const onMouseMove = (e) => {
    let dx = e.clientX - startX;
    let dy = e.clientY - startY;
    groupData.forEach(item => {
      item.el.style.left = (item.initialLeft + dx) + 'px';
      item.el.style.top = (item.initialTop + dy) + 'px';
    });
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    groupData.forEach(item => {
      item.el.classList.remove('dragging');
      if (shouldSnap) snapToGrid(item.el);
    });
    updateZIndices();
    updateDoors();
    updateTargetNumbers();
    autoSaveWorkspace(); 
  };

  element.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    
    const groupBtn = document.getElementById('btn-group-move');
    const isGroupMove = groupBtn && groupBtn.classList.contains('active-mode');
    
    if (isGroupMove && element.classList.contains('room')) {
      groupData = Array.from(workspace.querySelectorAll('.room')).map(r => ({
        el: r,
        initialLeft: r.offsetLeft,
        initialTop: r.offsetTop
      }));
    } else {
      groupData = [{
        el: element,
        initialLeft: element.offsetLeft,
        initialTop: element.offsetTop
      }];
    }

    groupData.forEach(item => {
      item.el.style.zIndex = 10000;
      item.el.classList.add('dragging');
    });
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

function snapToGrid(element) {
  const gridSize = 10;
  let newLeft = Math.round(element.offsetLeft / gridSize) * gridSize;
  let newTop = Math.round(element.offsetTop / gridSize) * gridSize;
  
  element.style.left = newLeft + 'px';
  element.style.top = newTop + 'px';
}

function updateDoors() {
  workspace.querySelectorAll('.door').forEach(d => d.remove());
  
  const rooms = Array.from(workspace.querySelectorAll('.room'));
  const connections = new Array(rooms.length).fill(0);
  const overlaps = new Array(rooms.length).fill(false);
  const adjacency = rooms.map(() => []);
  
  for(let i = 0; i < rooms.length; i++) {
    for(let j = i + 1; j < rooms.length; j++) {
      const r1 = rooms[i];
      const r2 = rooms[j];
      
      const l1 = parseInt(r1.style.left) || 0;
      const w1 = parseInt(r1.style.width) || 130;
      const right1 = l1 + w1;
      const t1 = parseInt(r1.style.top) || 0;
      const h1 = parseInt(r1.style.height) || 180;
      const b1 = t1 + h1;
      
      const l2 = parseInt(r2.style.left) || 0;
      const w2 = parseInt(r2.style.width) || 130;
      const right2 = l2 + w2;
      const t2 = parseInt(r2.style.top) || 0;
      const h2 = parseInt(r2.style.height) || 180;
      const b2 = t2 + h2;
      
      // Strict overlap check
      if (l1 < right2 && right1 > l2 && t1 < b2 && b1 > t2) {
        overlaps[i] = true;
        overlaps[j] = true;
      }
      
      if (right1 === l2 || right2 === l1) {
        const overlapTop = Math.max(t1, t2);
        const overlapBottom = Math.min(b1, b2);
        if (overlapBottom - overlapTop >= 54) {
          const y = (overlapTop + overlapBottom) / 2;
          const x = (right1 === l2) ? right1 : right2;
          const door = document.createElement('div');
          door.className = 'door door-v';
          door.style.left = x + 'px';
          door.style.top = y + 'px';
          workspace.appendChild(door);
          connections[i]++;
          connections[j]++;
          adjacency[i].push(j);
          adjacency[j].push(i);
        }
      }
      
      if (b1 === t2 || b2 === t1) {
        const overlapLeft = Math.max(l1, l2);
        const overlapRight = Math.min(right1, right2);
        if (overlapRight - overlapLeft >= 54) {
          const x = (overlapLeft + overlapRight) / 2;
          const y = (b1 === t2) ? b1 : b2;
          const door = document.createElement('div');
          door.className = 'door door-h';
          door.style.left = x + 'px';
          door.style.top = y + 'px';
          workspace.appendChild(door);
          connections[i]++;
          connections[j]++;
          adjacency[i].push(j);
          adjacency[j].push(i);
        }
      }
    }
  }
  
  const reached = new Set();
  const root = rooms.findIndex(r => roomDatabase.find(db => db.id === r.dataset.id)?.core_category === 'helm');
  const pending = rooms.length ? [Math.max(0, root)] : [];
  while (pending.length) {
    const index = pending.pop();
    if (reached.has(index)) continue;
    reached.add(index);
    adjacency[index].forEach(next => { if (!reached.has(next)) pending.push(next); });
  }
  updateWarnings(rooms, connections, overlaps, reached);
}

function updateZIndices() {
  workspace.querySelectorAll('.room, .board-ui').forEach(el => {
    if (!el.classList.contains('dragging')) {
      const x = parseInt(el.style.left) || 0;
      const y = parseInt(el.style.top) || 0;
      el.style.zIndex = x + y; 
    }
  });
}

function updateTargetNumbers() {
  const rooms = Array.from(workspace.querySelectorAll('.room')).filter(r => {
    const data = roomDatabase.find(db => db.id === r.dataset.id);
    return data && data.type !== 'corridor';
  });

  rooms.sort((a, b) => parseInt(a.style.top) - parseInt(b.style.top) || parseInt(a.style.left) - parseInt(b.style.left));

  rooms.forEach((room, index) => {
    const targetEl = room.querySelector('.target-number');
    if (targetEl) {
      targetEl.textContent = index + 1;
    }
  });

  const roomCount = rooms.length;
  let dieType = 0;
  if (roomCount === 0) dieType = 0;
  else if (roomCount <= 4) dieType = 4;
  else if (roomCount <= 6) dieType = 6;
  else if (roomCount <= 8) dieType = 8;
  else if (roomCount <= 10) dieType = 10;
  else if (roomCount <= 12) dieType = 12;
  else if (roomCount <= 20) dieType = 20;
  else dieType = 100;

  const dieDisplay = document.getElementById('board-target-die');
  if (dieDisplay) {
    dieDisplay.textContent = `TARGET DIE: D${dieType}`;
  }
}

function updateWarnings(rooms, connections, overlaps, reached = new Set()) {
  const warningsDiv = document.getElementById('warnings-container');
  if (!warningsDiv) return;
  
  let corridorCount = 0;
  let standardRoomCount = 0;
  let overConnectedRooms = false;
  let overConnectedCorridors = false;
  let underConnectedCorridors = false;
  let hasOverlaps = false;
  let hasDisconnected = false;
  
  rooms.forEach((r, idx) => {
    const data = roomDatabase.find(db => db.id === r.dataset.id);
    if (!data) return;
    
    let hasError = false;

    if (overlaps && overlaps[idx]) {
      hasError = true;
      hasOverlaps = true;
    }

    if (!reached.has(idx) && rooms.length > 1) {
      hasError = true;
      hasDisconnected = true;
    }

    if (data.type === 'corridor') {
      corridorCount++;
      if (connections[idx] > data.max_connections) {
        overConnectedCorridors = true;
        hasError = true;
      }
      if (connections[idx] > 0 && connections[idx] < 2) {
        underConnectedCorridors = true;
        hasError = true;
      }
    } else {
      standardRoomCount++;
      if (connections[idx] > data.max_connections) {
        overConnectedRooms = true;
        hasError = true;
      }
    }
    
    if (hasError) {
      r.classList.add('error-highlight');
    } else {
      r.classList.remove('error-highlight');
    }
  });
  
  let warnings = [];
  if (getOutOfBoundsElements().length) warnings.push('⚠ Content is outside the A4 page. Move it inside before printing.');
  const missingCore = ['helm', 'engine', 'reactor'].filter(category => !rooms.some(r => roomDatabase.find(db => db.id === r.dataset.id)?.core_category === category));
  if (missingCore.length) warnings.push('⚠ Missing core systems: ' + missingCore.join(', '));
  
  const requiredCorridors = Math.floor(standardRoomCount / 3);
  const allowedCrew = 1 + Math.ceil(standardRoomCount / crewConfig.roomsPerCrew);

  if (hasOverlaps) {
    warnings.push("⚠ Rooms cannot overlap");
  }
  if (hasDisconnected) {
    warnings.push("⚠ All rooms must be physically connected");
  }
  if (corridorCount < requiredCorridors) {
    warnings.push(`⚠️ Not enough corridors (Min ${requiredCorridors} required for ${standardRoomCount} rooms)`);
  }
  if (shipCrew.length > allowedCrew) {
    warnings.push(`⚠️ Too many crew (Max ${allowedCrew} allowed for ${standardRoomCount} rooms)`);
  }
  if (overConnectedRooms) {
    warnings.push("⚠ A room exceeds its max permitted connections");
  }
  if (overConnectedCorridors) {
    warnings.push("⚠ A corridor exceeds its max permitted connections");
  }
  if (underConnectedCorridors) {
    warnings.push("⚠ Corridors must have at least 2 connections");
  }
  
  warningsDiv.innerHTML = warnings.join('<br>');
}

document.getElementById('ship-name-input').addEventListener('input', (e) => {
  const display = document.getElementById('ship-name-display');
  if (display) {
    display.textContent = e.target.value;
  }
  updateDoors();
  autoSaveWorkspace();
});

document.getElementById('ship-class-input').addEventListener('input', (e) => {
  const display = document.getElementById('ship-class-display');
  if (display) {
    display.textContent = e.target.value;
  }
  updateDoors();
  autoSaveWorkspace();
});

const PAGE_WIDTH = 210 * 96 / 25.4;
const PAGE_HEIGHT = 297 * 96 / 25.4;

function getOutOfBoundsElements() {
  return [...workspace.querySelectorAll('.room, .board-ui')].filter(el => {
    // Empty portrait placeholders are not printed.
    if (el.dataset.uiType === 'portrait' && !el.classList.contains('has-image')) return false;
    const left = parseFloat(el.style.left), top = parseFloat(el.style.top);
    const width = el.offsetWidth || parseFloat(el.style.width) || 0;
    const height = el.offsetHeight || parseFloat(el.style.height) || 0;
    return left < 0 || top < 0 || left + width > PAGE_WIDTH + 0.5 || top + height > PAGE_HEIGHT + 0.5;
  });
}

function getEmptySpace(width, height) {
  const els = workspace.querySelectorAll('.room, .board-ui');
  for (let y = 10; y + height <= PAGE_HEIGHT - 4; y += 10) {
    for (let x = 10; x + width <= PAGE_WIDTH - 4; x += 10) {
      const blocked = [...els].some(el => x < el.offsetLeft + el.offsetWidth && x + width > el.offsetLeft &&
        y < el.offsetTop + el.offsetHeight && y + height > el.offsetTop);
      if (!blocked) return {x,y};
    }
  }
  return null;
}

document.getElementById('btn-add').addEventListener('click', () => {
  const selectedId = document.getElementById('room-select').value;
  const roomData = roomDatabase.find(r => r.id === selectedId);
  if (!roomData) return;
  
  const coords = getEmptySpace(roomData.width, roomData.height);
  if (!coords) { alert('There is no free space on the A4 page. Move or remove an item first.'); return; }
  createRoom(selectedId, coords.x, coords.y); 
  
  updatePoints();
  updateDoors();
  updateTargetNumbers();
  updateZIndices();
  autoSaveWorkspace();
});

document.getElementById('btn-add-image')?.addEventListener('click', () => {
  const coords = getEmptySpace(180, 180); 
  if (!coords) { alert('There is no free space on the A4 page. Move or remove an item first.'); return; }
  createUIElement('portrait', coords.x, coords.y);
  updateZIndices();
  autoSaveWorkspace();
});

document.getElementById('btn-print').addEventListener('click', () => {
  if (getOutOfBoundsElements().length) { alert('Some content is outside the A4 page. Move it inside before printing.'); return; }
  window.print();
});

document.getElementById('btn-refresh-numbers').addEventListener('click', () => {
  updateTargetNumbers();
  autoSaveWorkspace();
});

document.getElementById('btn-group-move').addEventListener('click', (e) => {  
  const btn = e.currentTarget;
  btn.classList.toggle('active-mode');
  const icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M19 9l3 3-3 3M9 19l3 3 3 3M2 12h20M12 2v20"/></svg>`;
  if (btn.classList.contains('active-mode')) {
    btn.innerHTML = `${icon} Group Move: ON`;
  } else {
    btn.innerHTML = `${icon} Group Move: OFF`;
  }
});

document.getElementById('btn-theme').addEventListener('click', () => {
  const body = document.body;
  body.classList.toggle('printer-friendly');
  try { localStorage.setItem('corvet_printer_friendly', body.classList.contains('printer-friendly')); }
  catch (e) { alert('The theme changed, but browser storage is unavailable to remember it.'); }
  updateThemeButton();
});

document.getElementById('file-portrait').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_SIZE = 400; 
      let width = img.width;
      let height = img.height;

      if (width > height && width > MAX_SIZE) {
        height *= MAX_SIZE / width;
        width = MAX_SIZE;
      } else if (height > MAX_SIZE) {
        width *= MAX_SIZE / height;
        height = MAX_SIZE;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      
      if (window.activePortraitForUpload) {
        window.activePortraitForUpload.classList.add('has-image');
        window.activePortraitForUpload.querySelector('img').src = compressedDataUrl;
        updateDoors();
        autoSaveWorkspace();
        window.activePortraitForUpload = null; 
      }
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = ''; 
});

function getCurrentLayoutData() {
  const elements = workspace.querySelectorAll('.room, .board-ui');
  const layoutData = [];
  elements.forEach(el => {
    let arcState = null;
    const arcEl = el.querySelector('.arc-circle');
    if (arcEl) {
      arcState = parseInt(arcEl.dataset.arc);
    }

    let customImg = null;
    if (el.dataset.uiType === 'portrait' && el.classList.contains('has-image')) {
      customImg = el.querySelector('img').src;
    }

    layoutData.push({
      id: el.dataset.id || el.dataset.uiType,
      isUI: el.classList.contains('board-ui'),
      left: el.style.left,
      top: el.style.top,
      customText: el.id === 'ship-header' ? document.getElementById('ship-name-display').textContent : 
                  (el.dataset.uiType === 'portrait' ? customImg : 
                  (el.dataset.uiType === 'hull' ? el.dataset.hullId : 
                  (el.dataset.uiType === 'shields' ? el.dataset.shieldId : 
                  (el.dataset.uiType === 'crew-manifest' ? JSON.stringify(shipCrew) : null)))),
      customClassText: el.id === 'ship-header' ? document.getElementById('ship-class-display').textContent : null,
      arcState: arcState
    });
  });
  return layoutData;
}

function loadShipToWorkspace(layoutData) {
  layoutData = normalizeLayout(layoutData);
  workspace.innerHTML = ''; 
  
  const crewData = layoutData.find(item => item.id === 'crew-manifest');
  if (crewData && crewData.customText) {
    try { shipCrew = JSON.parse(crewData.customText); } 
    catch (e) { shipCrew = [{ name: 'Crewman 1', perk: 'none' }]; }
  } else {
    shipCrew = [{ name: 'Crewman 1', perk: 'none' }];
  }

  layoutData.forEach(item => {
    if (item.isUI) {
      createUIElement(item.id, parseInt(item.left), parseInt(item.top), item.customText, item.customClassText);
      if (item.id === 'header') {
        document.getElementById('ship-name-input').value = item.customText ?? '';
        document.getElementById('ship-class-input').value = item.customClassText ?? '';
      }
    } else {
      createRoom(item.id, parseInt(item.left), parseInt(item.top), item.arcState);
    }
  });
  
  const defaults = [['header',500,20],['points',500,90],['target-die',500,125],['hull',20,20],['shields',110,15],['speed',700,400],['power',20,900],['crew-manifest',20,320]];
  defaults.forEach(([id,x,y]) => {
    if (!layoutData.some(i => i.isUI && i.id === id)) createUIElement(id,x,y,id === 'header' ? 'UNTITLED SHIP' : null,id === 'header' ? 'CORVETTE' : null);
  });
  document.getElementById('ship-name-input').value = document.getElementById('ship-name-display').textContent;
  document.getElementById('ship-class-input').value = document.getElementById('ship-class-display').textContent;
  syncDropdownsToBoard();
  updatePoints();
  updateDoors();
  updateTargetNumbers();
  updateZIndices();
  renderCrewSidebar();
}

document.getElementById('btn-new').addEventListener('click', () => {
  if (confirm("Start a new ship? Any unsaved layout changes will be lost.")) {
    setupDefaultWorkspace();
    autoSaveWorkspace();
  }
});

document.getElementById('btn-save-lib').addEventListener('click', () => {
  const name = document.getElementById('ship-name-input').value.trim() || 'UNTITLED SHIP';
  document.getElementById('ship-name-input').value = name;
  document.getElementById('ship-name-display').textContent = name;
  const existing = shipLibrary.find(s => s.name === name);
  if (existing && !confirm(`Overwrite existing ship "${name}" in library?`)) return;
  const ship = {id:name, name, layout:getCurrentLayoutData()};
  const next = existing ? shipLibrary.map(s => s.name === name ? ship : s) : [...shipLibrary, ship];
  if (!persistState(next)) return;
  shipLibrary = next;
  autoSaveWorkspace();
  updateFleetDropdown();
  renderFleetSidebar();
  alert(`Ship "${name}" saved to library.`);
});

document.getElementById('btn-export').addEventListener('click', () => {
  downloadJSON({schemaVersion:2, corvetLibrary:shipLibrary, customRooms:customRoomsDatabase},
    `corvet_library_${new Date().toISOString().slice(0,10)}.json`);
});

document.getElementById('btn-merge').addEventListener('click', () => document.getElementById('file-merge').click());
document.getElementById('file-merge').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = event => {
    try {
      const added = mergeLibraryData(JSON.parse(event.target.result));
      if (added !== null) alert(`Added ${added} ships. Identical ships were skipped; different versions were kept separately.`);
    } catch (err) { alert('Import cancelled. ' + err.message); }
  };
  reader.onerror = () => alert('Could not read this file. No saved data was changed.');
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('btn-wipe').addEventListener('click', () => {
  if (confirm("Are you sure you want to permanently delete all ships in your library? Make sure you have exported a backup first.")) {
    if (!persistState([])) return;
    shipLibrary = [];
    updateFleetDropdown();
    renderFleetSidebar();
    alert("Library wiped.");
  }
});

// --- Modal Logic ---
const modal = document.getElementById('modal-overlay');

document.getElementById('btn-open-lib').addEventListener('click', () => {
  const listContainer = document.getElementById('library-list');
  listContainer.innerHTML = '';
  
  if (shipLibrary.length === 0) {
    listContainer.innerHTML = '<div style="color:#888; text-align:center; padding: 20px;">Library is empty.</div>';
  } else {
    const sortedLib = getSortedLibrary();

    sortedLib.forEach((ship) => {
      let shipPoints = getShipPoints(ship);
      const shipClass = getShipClass(ship.layout);

      const item = document.createElement('div');
      item.className = 'library-item';
      
      const title = document.createElement('div');
      title.innerHTML = `<strong style="font-size: 16px; color: #1a1a1a;">${escapeHtml(ship.name)}</strong><br><span style="font-size:12px; color:#4a7c82; font-weight:bold; text-transform:uppercase;">${escapeHtml(shipClass)}</span><br><span style="font-size:12px; color:#888;">${shipPoints} Points</span>`;      
      const actions = document.createElement('div');
      actions.className = 'library-item-actions';
      
      const btnLoad = document.createElement('button');
      btnLoad.className = 'btn-load';
      btnLoad.textContent = 'Load';
      btnLoad.onclick = () => {
        if(confirm(`Load "${ship.name}"? Current unsaved board changes will be lost.`)) {
          loadShipToWorkspace(ship.layout);
          autoSaveWorkspace(); 
          modal.style.display = 'none';
        }
      };
      
      const btnDelete = document.createElement('button');
      btnDelete.className = 'btn-delete';
      btnDelete.textContent = 'Delete';
      btnDelete.onclick = () => {
        if(confirm(`Delete "${ship.name}" from library?`)) {
          const next = shipLibrary.filter(s => s.name !== ship.name);
          if (!persistState(next)) return;
          shipLibrary = next;
          updateFleetDropdown();
          renderFleetSidebar();
          document.getElementById('btn-open-lib').click(); 
        }
      };
      
      actions.appendChild(btnLoad);
      actions.appendChild(btnDelete);
      item.appendChild(title);
      item.appendChild(actions);
      listContainer.appendChild(item);
    });
  }
  modal.style.display = 'flex';
});

document.getElementById('close-modal').addEventListener('click', () => modal.style.display = 'none');
document.getElementById('btn-close-modal').addEventListener('click', () => modal.style.display = 'none');
window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });


function syncDropdownsToBoard() {
  workspace.querySelectorAll('.room').forEach(el => {
    const dbRoom = roomDatabase.find(r => r.id === el.dataset.id);
    if (dbRoom && dbRoom.core_category) {
       const sel = document.getElementById(`${dbRoom.core_category}-select`);
       if (sel) sel.value = dbRoom.id;
    }
  });
  const hullUi = workspace.querySelector('.hull-ui');
  if (hullUi && hullUi.dataset.hullId) {
    document.getElementById('hull-select').value = hullUi.dataset.hullId;
  }
  const shieldUi = workspace.querySelector('.shield-ui');
  if (shieldUi && shieldUi.dataset.shieldId) {
    document.getElementById('shield-select').value = shieldUi.dataset.shieldId;
  }
}

function swapCoreRoom(category, selectElementId) {
  const newRoomId = document.getElementById(selectElementId).value;
  const currentRoomEl = Array.from(workspace.querySelectorAll('.room')).find(el => {
    const dbRoom = roomDatabase.find(r => r.id === el.dataset.id);
    return dbRoom && dbRoom.core_category === category;
  });

  let left = 320, top = 500, arc = 0; 
  if (currentRoomEl) {
    left = parseInt(currentRoomEl.style.left);
    top = parseInt(currentRoomEl.style.top);
    const arcEl = currentRoomEl.querySelector('.arc-circle');
    if (arcEl) arc = parseInt(arcEl.dataset.arc) || 0;
    currentRoomEl.remove();
  }

  createRoom(newRoomId, left, top, arc);
  updatePoints();
  updateDoors();
  updateTargetNumbers();
  if (typeof updateZIndices === 'function') updateZIndices();
  autoSaveWorkspace();
}

document.getElementById('reactor-select').addEventListener('change', () => swapCoreRoom('reactor', 'reactor-select'));
document.getElementById('engine-select').addEventListener('change', () => swapCoreRoom('engine', 'engine-select'));
document.getElementById('helm-select').addEventListener('change', () => swapCoreRoom('helm', 'helm-select'));

document.getElementById('hull-select').addEventListener('change', (e) => {
  const hullData = hullDatabase.find(h => h.id === e.target.value);
  const hullUi = workspace.querySelector('.hull-ui');
  if (hullUi && hullData) {
    hullUi.dataset.hullId = hullData.id;
    const hpBox = hullUi.querySelector('div:first-child');
    if (hpBox) hpBox.textContent = hullData.hp;
  }
  updatePoints();
  autoSaveWorkspace();
});

document.getElementById('shield-select').addEventListener('change', (e) => {
  const shieldData = shieldDatabase.find(s => s.id === e.target.value);
  const shieldUi = workspace.querySelector('.shield-ui');
  if (shieldUi && shieldData) {
    shieldUi.dataset.shieldId = shieldData.id;
    const hpSpan = shieldUi.querySelector('span');
    if (hpSpan) hpSpan.textContent = shieldData.hp;
  }
  updatePoints();
  autoSaveWorkspace();
});

// --- CREW ROSTER LOGIC ---
function renderCrewOnBoard(el = document.getElementById('board-crew-manifest')) {
  if (!el) return;
  let listHtml = shipCrew.map(c => {
    let html = `<div>&bull; ${escapeHtml(c.name)}</div>`;
    if (c.perk && c.perk !== 'none') {
      const perkData = crewPerks.find(p => p.id === c.perk);
      if (perkData) {
        html += `<div style="font-size: 11px; font-style: italic; font-weight: normal; padding-left: 14px; margin-top: -2px; text-transform: none;">${escapeHtml(perkData.name)}</div>`;
      }
    }
    return `<div style="margin-bottom: 4px;">${html}</div>`;
  }).join('');
  
  el.innerHTML = `
    <div class="crew-header">Crew Manifest</div>
    <div class="crew-list" style="gap: 2px;">${listHtml}</div>
  `;
}

function renderCrewSidebar() {
  const container = document.getElementById('crew-sidebar-list');
  if (!container) return;
  container.innerHTML = '';
  
  shipCrew.forEach((crew, index) => {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '5px';
    wrapper.style.marginBottom = '5px';
    wrapper.style.paddingBottom = '10px';
    wrapper.style.borderBottom = '1px dashed #3a3835';
    
    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.gap = '5px';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = crew.name;
    input.style.flexGrow = '1';
    input.addEventListener('input', (e) => {
      shipCrew[index].name = e.target.value;
      renderCrewOnBoard();
      updateDoors();
      autoSaveWorkspace();
    });
    
    const delBtn = document.createElement('button');
    delBtn.innerHTML = '&times;';
    delBtn.className = 'btn-danger';
    delBtn.style.padding = '0 10px';
    delBtn.style.fontWeight = 'bold';
    delBtn.title = 'Remove Crew';
    delBtn.addEventListener('click', () => {
      shipCrew.splice(index, 1);
      renderCrewSidebar();
      renderCrewOnBoard();
      updatePoints();
      updateTargetNumbers(); 
      updateDoors(); 
      autoSaveWorkspace();
    });
    
    const select = document.createElement('select');
    select.style.width = '100%';
    crewPerks.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name === 'No Perk' ? 'No Perk' : `${p.name} (${p.cost} pts)`;
      select.appendChild(opt);
    });
    select.value = crew.perk || 'none';
    select.addEventListener('change', (e) => {
      shipCrew[index].perk = e.target.value;
      renderCrewOnBoard();
      updatePoints();
      autoSaveWorkspace();
    });
    
    topRow.appendChild(input);
    topRow.appendChild(delBtn);
    wrapper.appendChild(topRow);
    wrapper.appendChild(select);
    container.appendChild(wrapper);
  });
}

document.getElementById('btn-add-crew').addEventListener('click', () => {
  shipCrew.push({ name: `Crewman ${shipCrew.length + 1}`, perk: 'none' });
  renderCrewSidebar();
  renderCrewOnBoard();
  updatePoints();
  updateDoors(); 
  autoSaveWorkspace();
});

// --- CUSTOM ROOM LOGIC ---
const roomModalOverlay = document.getElementById('room-modal-overlay');

document.getElementById('btn-custom-room').addEventListener('click', () => {
  roomModalOverlay.style.display = 'flex';
});

document.getElementById('close-room-modal').addEventListener('click', () => {
  roomModalOverlay.style.display = 'none';
});

window.addEventListener('click', (e) => {
  if (e.target === roomModalOverlay) roomModalOverlay.style.display = 'none';
});

document.getElementById('btn-save-custom-room').addEventListener('click', () => {
  const name = document.getElementById('cr-name').value || 'Custom Room';
  const cost = Math.max(0, parseInt(document.getElementById('cr-cost').value) || 0);
  const hp = Math.max(1, parseInt(document.getElementById('cr-hp').value) || 1);
  const isMannable = document.getElementById('cr-mannable').checked;
  const hasArc = document.getElementById('cr-arc').checked;
  const ammo = Math.max(0, parseInt(document.getElementById('cr-ammo').value) || 0);
  
  const newRoom = {
    id: newId('custom'),
    name: name,
    type: 'custom',
    cost: cost,
    width: 130, // Locked to standard width
    height: 180, // Locked to standard height
    max_connections: 3,
    max_hp: hp,
    is_mannable: isMannable,
    ammo: ammo,
    has_arc: hasArc
  };
  
  let next;
  try { next = normalizeCustomRooms([...customRoomsDatabase, newRoom]); }
  catch (e) { alert(e.message); return; }
  if (!persistState(shipLibrary, next)) return;
  installCustomRooms(next);
  refreshRoomMenu(newRoom.id);
  roomModalOverlay.style.display = 'none';
});

function updateCustomRoomDeleteButton() {
  const select = document.getElementById('room-select');
  const delBtn = document.getElementById('btn-delete-custom-room');
  if (select && delBtn) {
    delBtn.style.display = select.value.startsWith('custom_') ? 'block' : 'none';
  }
}

document.getElementById('room-select').addEventListener('change', updateCustomRoomDeleteButton);

setTimeout(updateCustomRoomDeleteButton, 100);

document.getElementById('btn-delete-custom-room').addEventListener('click', () => {
  const selectedId = document.getElementById('room-select').value;
  if (!selectedId.startsWith('custom_')) return;
  if (!confirm('Remove this custom room from the menu? Its definition will be kept so saved ships and backups still work.')) return;
  const next = customRoomsDatabase.map(r => r.id === selectedId ? {...r, archived:true} : r);
  if (!persistState(shipLibrary, next)) return;
  installCustomRooms(next);
  refreshRoomMenu();
});

// --- ABOUT MODAL LOGIC ---
const aboutModalOverlay = document.getElementById('about-modal-overlay');

document.getElementById('btn-about').addEventListener('click', () => {
  aboutModalOverlay.style.display = 'flex';
});

document.getElementById('btn-about-fleet').addEventListener('click', () => {
  aboutModalOverlay.style.display = 'flex';
});

document.getElementById('close-about-modal').addEventListener('click', () => {  aboutModalOverlay.style.display = 'none';
});

document.getElementById('btn-close-about').addEventListener('click', () => {
  aboutModalOverlay.style.display = 'none';
});

window.addEventListener('click', (e) => {
  if (e.target === aboutModalOverlay) aboutModalOverlay.style.display = 'none';
});

// --- COMPONENT SHEET PRINTING LOGIC ---
document.getElementById('btn-print-components').addEventListener('click', () => {
  const container = document.createElement('div');
  container.id = 'components-print-container';
  
  const wrap = (content) => `<div class="cut-wrapper">${content}</div>`;
  let html = '';
  
  const combinedCardHTML = `
    <div class="board-ui" style="width: 190px; border: 3px solid #1a1a1a; display: flex; flex-direction: column; background: #ffffff;">
      <div style="display: flex; justify-content: space-around; align-items: flex-start; padding: 15px 5px 35px 5px; border-bottom: 3px solid #1a1a1a;">
        <div class="hull-ui" style="position: relative; left: 0; top: 0; box-shadow: none;"><div></div><div class="ui-label">HULL</div></div>
        <div class="shield-ui" style="position: relative; left: 0; top: 0;">
          <svg class="shield-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="50,5 95,25 95,75 50,95 5,75 5,25"/></svg>
          <span></span><div class="ui-label">SHIELDS</div>
        </div>
      </div>
      <div class="crew-manifest-ui" style="position: relative; left: 0; top: 0; width: 100%; border: none; box-shadow: none;">
        <div class="crew-header">Crew Manifest</div>
        <div class="crew-list" style="padding: 10px;">
          ${'<div style="border-bottom: 2px dotted #1a1a1a; height: 18px; margin-bottom: 6px;"></div>'.repeat(6)}
        </div>
      </div>
    </div>
  `;
  html += wrap(combinedCardHTML);

  const powerPoolHTML = `<div class="board-ui power-pool-ui" style="width: 250px; height: 120px; box-shadow: none; border-color: #1a1a1a;">Power Pool</div>`;
  for(let i=0; i<3; i++) html += wrap(powerPoolHTML);

  const speedTrackHTML = `
    <div class="board-ui speed-track-ui" style="width: 50px; box-shadow: none; border-color: #1a1a1a;">
      <div class="speed-box">SP</div>
      <div class="speed-box">12</div>
      <div class="speed-box">10</div>
      <div class="speed-box">8</div>
      <div class="speed-box">6</div>
      <div class="speed-box">4</div>
      <div class="speed-box">2</div>
      <div class="speed-box">0</div>
    </div>
  `;
  for(let i=0; i<3; i++) html += wrap(speedTrackHTML);

  function generateRoomHTML(roomData) {
    if (roomData.type === 'corridor') {
      return `<div class="room" data-id="${roomData.id}" style="width: ${roomData.width}px; height: ${roomData.height}px; box-shadow: none; border-color: #1a1a1a;"></div>`;
    }
    
    let rHtml = `<div class="room" data-id="${roomData.id}" style="width: ${roomData.width}px; height: ${roomData.height}px; box-shadow: none; border-color: #1a1a1a;"><div class="room-inner">`;
    if (roomData.max_hp !== undefined) rHtml += `<div class="${roomData.core_category === 'reactor' ? 'reactor-hp-box' : 'hp-box'}">${roomData.max_hp}</div>`;
    if (roomData.ammo && roomData.ammo > 0) rHtml += `<div class="ammo-box">A${roomData.ammo}</div>`;
    if (roomData.is_mannable) rHtml += `<div class="manned-circle"></div>`;
    if (roomData.has_arc) rHtml += `<div class="arc-circle" style="transform: rotate(0deg);"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" stroke-width="4"/><line x1="16.06" y1="16.06" x2="83.94" y2="83.94" stroke="currentColor" stroke-width="4"/><line x1="16.06" y1="83.94" x2="83.94" y2="16.06" stroke="currentColor" stroke-width="4"/><path d="M50,50 L16.06,16.06 A48,48 0 0,1 83.94,16.06 Z" fill="currentColor" /></svg></div>`;
    
    rHtml += `<div class="room-name">${escapeHtml(roomData.name)}</div><div class="target-number"></div></div></div>`;
    return rHtml;
  }
  
  roomDatabase.filter(room => !room.archived).forEach(room => html += wrap(generateRoomHTML(room)));
  
  container.innerHTML = html;
  document.body.appendChild(container);
  
  printTemporaryContainer(container, 'print-components-mode');
});

// --- FLEET BUILDER LOGIC ---

function updateFleetDropdown() {
  const sel = document.getElementById('fleet-ship-select');
  if (!sel) return;
  sel.innerHTML = '';
  if (shipLibrary.length === 0) {
    sel.innerHTML = '<option disabled>Library is empty</option>';
    return;
  }
  
  const sortedLib = getSortedLibrary();
  
  sortedLib.forEach(ship => {
    const shipClass = getShipClass(ship.layout);
    const pts = getShipPoints(ship);
    
    const opt = document.createElement('option');
    opt.value = ship.id;
    opt.textContent = `${ship.name} - ${shipClass} (${pts} pts)`;
    sel.appendChild(opt);
  });
}

function renderFleetSidebar() {
  const container = document.getElementById('fleet-list');
  const totalDisplay = document.getElementById('fleet-points-total');
  const previewArea = document.getElementById('fleet-workspace');
  if (!container || !totalDisplay) return;
  
  container.innerHTML = '';
  let totalPts = 0;
  
  if (currentFleet.length === 0) {
    container.innerHTML = '<div style="color:#888; text-align:center; padding: 20px;">Fleet is empty.</div>';
    if(previewArea) previewArea.innerHTML = '<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #a19d94; opacity: 0.5;">Select a ship from the fleet to preview</div>';
  } else {
    currentFleet.forEach(fItem => {
      const ship = shipLibrary.find(s => s.id === fItem.shipId);
      const pts = ship ? getShipPoints(ship) : 0;
      const shipClass = ship ? getShipClass(ship.layout) : 'Unknown';
      totalPts += pts;
      
      const wrapper = document.createElement('div');
      wrapper.className = 'fleet-item' + (activeFleetShipId === fItem.id ? ' active' : '');
      wrapper.style.display = 'flex';
      wrapper.style.justifyContent = 'space-between';
      wrapper.style.alignItems = 'center';
      wrapper.style.background = '#2a2826';
      wrapper.style.border = '1px solid #4a4742';
      wrapper.style.padding = '8px';
      
      wrapper.onclick = () => {
         activeFleetShipId = fItem.id;
         renderFleetSidebar(); 
      };
      
      let nameHtml = ship ? `<strong>${escapeHtml(ship.name)}</strong><br><span class="fleet-item-meta" style="font-size:12px; color:#a19d94;">${escapeHtml(shipClass)} | ${pts} pts</span>` : `<strong style="color:#ff4444;">Missing: ${escapeHtml(fItem.shipName)}</strong>`;
      
      const nameDiv = document.createElement('div');
      nameDiv.innerHTML = nameHtml;
      nameDiv.style.pointerEvents = 'none'; 
      
      const delBtn = document.createElement('button');
      delBtn.innerHTML = '&times;';
      delBtn.className = 'btn-danger';
      delBtn.style.padding = '4px 8px';
      delBtn.title = 'Remove from Fleet';
      delBtn.onclick = (e) => {
        e.stopPropagation(); 
        const next = currentFleet.filter(f => f.id !== fItem.id);
        if (!persistState(shipLibrary, customRoomsDatabase, next)) return;
        currentFleet = next;
        if (activeFleetShipId === fItem.id) {
           activeFleetShipId = null;
           if(previewArea) previewArea.innerHTML = '<div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #a19d94; opacity: 0.5;">Select a ship from the fleet to preview</div>';
        }
        renderFleetSidebar();
      };
      
      wrapper.appendChild(nameDiv);
      wrapper.appendChild(delBtn);
      container.appendChild(wrapper);
    });
  }
  totalDisplay.textContent = `Fleet Total: ${totalPts} pts`;
  if (activeFleetShipId) {
    const item = currentFleet.find(f => f.id === activeFleetShipId);
    const ship = item && shipLibrary.find(s => s.id === item.shipId);
    if (ship) renderFleetPreview(ship);
    else if (previewArea) previewArea.textContent = 'This ship is missing from the library.';
  }
}

function withShipLayout(layout, callback) {
  const nodes = [...workspace.childNodes];
  const savedCrew = shipCrew;
  const controls = ['ship-name-input','ship-class-input','hull-select','shield-select','reactor-select','engine-select','helm-select'];
  const values = controls.map(id => document.getElementById(id).value);
  const warnings = document.getElementById('warnings-container').innerHTML;
  const points = document.getElementById('points-total').textContent;
  const builder = document.getElementById('builder-screen');
  const css = builder.style.cssText;
  workspace.replaceChildren();
  try {
    builder.style.display = 'flex';
    builder.style.position = 'absolute';
    builder.style.visibility = 'hidden';
    loadShipToWorkspace(layout);
    return callback();
  } finally {
    workspace.replaceChildren(...nodes);
    shipCrew = savedCrew;
    controls.forEach((id, i) => document.getElementById(id).value = values[i]);
    document.getElementById('warnings-container').innerHTML = warnings;
    document.getElementById('points-total').textContent = points;
    builder.style.cssText = css;
    renderCrewSidebar();
  }
}

function cloneBoard() {
  const clone = workspace.cloneNode(true);
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  return [...clone.childNodes];
}

function renderFleetPreview(ship) {
  const previewArea = document.getElementById('fleet-workspace');
  if (!previewArea) return;
  try { withShipLayout(ship.layout, () => previewArea.replaceChildren(...cloneBoard())); }
  catch (e) { previewArea.textContent = 'Unable to preview ship: ' + e.message; }
}

document.getElementById('btn-add-to-fleet').addEventListener('click', () => {
  const ship = shipLibrary.find(s => s.id === document.getElementById('fleet-ship-select').value);
  if (!ship) return;
  const next = [...currentFleet, {id:newId('fleet'), shipId:ship.id, shipName:ship.name}];
  if (!persistState(shipLibrary, customRoomsDatabase, next)) return;
  currentFleet = next;
  renderFleetSidebar();
});

document.getElementById('btn-toggle-fleet').addEventListener('click', () => {
  document.getElementById('builder-screen').style.display = 'none';
  document.getElementById('fleet-screen').style.display = 'flex';
  renderFleetSidebar();
});

document.getElementById('btn-back-builder').addEventListener('click', () => {
  document.getElementById('fleet-screen').style.display = 'none';
  document.getElementById('builder-screen').style.display = 'flex';
});

document.getElementById('btn-print-fleet').addEventListener('click', () => {
  if (!currentFleet.length) { alert('Your fleet is empty.'); return; }
  const container = document.createElement('div');
  container.id = 'fleet-print-container';
  try {
    for (const item of currentFleet) {
      const ship = shipLibrary.find(s => s.id === item.shipId);
      if (!ship) throw new Error('A fleet ship is missing. Remove the missing entry or restore its ship.');
      withShipLayout(ship.layout, () => {
        if (getOutOfBoundsElements().length) throw new Error(ship.name + ' has content outside the A4 page. Fix its layout before printing.');
        const page = document.createElement('div');
        page.className = 'fleet-page';
        page.append(...cloneBoard());
        container.appendChild(page);
      });
    }
  } catch (e) { alert(e.message); return; }
  document.body.appendChild(container);
  printTemporaryContainer(container, 'print-fleet-mode');
});

function printTemporaryContainer(container, mode) {
  document.documentElement.classList.add(mode);
  document.body.classList.add(mode);
  const cleanup = () => {
    container.remove();
    document.documentElement.classList.remove(mode);
    document.body.classList.remove(mode);
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(() => {
    try { window.print(); }
    catch (e) { cleanup(); alert('Printing could not start.'); }
  }, 500);
}

init();
