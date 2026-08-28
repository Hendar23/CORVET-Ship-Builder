const workspace = document.getElementById('workspace');

let shipLibrary = [];

function init() {
  populateDropdown();
  loadLibraryFromLocal();
  loadThemePreference();
  
  const autosave = localStorage.getItem('corvet_autosave');
  if (autosave) {
    try {
      const layoutData = JSON.parse(autosave);
      loadShipToWorkspace(layoutData);
    } catch (e) {
      setupDefaultWorkspace();
    }
  } else {
    setupDefaultWorkspace();
  }
}

function loadThemePreference() {
  if (localStorage.getItem('corvet_printer_friendly') === 'true') {
    document.body.classList.add('printer-friendly');
  }
  updateThemeButton();
}

function updateThemeButton() {
  const btn = document.getElementById('btn-theme');
  if (!btn) return;
  const icon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>`;  if (document.body.classList.contains('printer-friendly')) {
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
  setupBoardElements();
  setupCoreRooms();
  updatePoints();
  updateDoors();
  updateTargetNumbers();
  updateZIndices();
  syncDropdownsToBoard();
}

function autoSaveWorkspace() {
  const layoutData = getCurrentLayoutData();
  localStorage.setItem('corvet_autosave', JSON.stringify(layoutData));
}

function loadLibraryFromLocal() {
  const savedData = localStorage.getItem('corvet_library');
  if (savedData) {
    try {
      shipLibrary = JSON.parse(savedData);
    } catch (e) {
      console.error("Could not parse saved library.", e);
    }
  }
}

function saveLibraryToLocal() {
  localStorage.setItem('corvet_library', JSON.stringify(shipLibrary));
}

function populateDropdown() {
  const select = document.getElementById('room-select');
  const optionalRooms = roomDatabase.filter(r => r.type !== 'core');
  
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

  const populateCore = (categoryId, elementId) => {
    const sel = document.getElementById(elementId);
    const variants = roomDatabase.filter(r => r.core_category === categoryId);
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
      <div id="ship-name-display" class="ship-name-text">${customText || document.getElementById('ship-name-input').value}</div>
      <div id="ship-class-display" class="ship-class-text">${customClassText || document.getElementById('ship-class-input').value}</div>
    `;
  } else if (type === 'hull') {
    el.className = 'board-ui hull-ui';
    el.dataset.hullId = customText || 'hull_medium';
    const hullData = hullDatabase.find(h => h.id === el.dataset.hullId) || hullDatabase[1];
    el.innerHTML = `<div>${hullData.hp}</div><div class="ui-label">HULL</div>`;
  } else if (type === 'shields') {
    el.className = 'board-ui shield-ui';
    el.innerHTML = `
      <svg class="shield-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon points="50,5 95,25 95,75 50,95 5,75 5,25"/>
      </svg>
      <span>3</span>
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
    el.id = 'board-portrait';
    if (customText && customText.startsWith('data:image')) {
      el.classList.add('has-image');
      el.innerHTML = `<img src="${customText}" /><div class="portrait-placeholder">Double-Click<br>To Add Image</div>`;
    } else {
      el.innerHTML = `<img src="" /><div class="portrait-placeholder">Double-Click<br>To Add Image</div>`;
    }
    
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      document.getElementById('file-portrait').click();
    });
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
  if (!roomData) return;

  const room = document.createElement('div');
  room.classList.add('room');
  room.dataset.id = roomData.id;
  
  room.style.width = roomData.width + 'px';
  room.style.height = roomData.height + 'px';
  room.style.left = startX + 'px';
  room.style.top = startY + 'px';

  if (roomData.type === 'corridor') {
    workspace.appendChild(room);
    
    // Corridors still get delete buttons
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
    hpBox.classList.add('hp-box');
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

  // Delete Button
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
    startX = e.clientX;
    startY = e.clientY;
    
    const groupBtn = document.getElementById('btn-group-move');
    const isGroupMove = groupBtn && groupBtn.classList.contains('active-mode');
    
    // Group move only triggers if the toggle is ON and you grab a room/corridor
    if (isGroupMove && element.classList.contains('room')) {
      groupData = Array.from(document.querySelectorAll('.room')).map(r => ({
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
  document.querySelectorAll('.door').forEach(d => d.remove());
  
  const rooms = Array.from(document.querySelectorAll('.room'));
  const connections = new Array(rooms.length).fill(0);
  
  for(let i = 0; i < rooms.length; i++) {
    for(let j = i + 1; j < rooms.length; j++) {
      const r1 = rooms[i];
      const r2 = rooms[j];
      
      const l1 = r1.offsetLeft;
      const right1 = l1 + r1.offsetWidth;
      const t1 = r1.offsetTop;
      const b1 = t1 + r1.offsetHeight;
      
      const l2 = r2.offsetLeft;
      const right2 = l2 + r2.offsetWidth;
      const t2 = r2.offsetTop;
      const b2 = t2 + r2.offsetHeight;
      
      // Vertical Edge Adjacency (Left/Right)
      if (right1 === l2 || right2 === l1) {
        const overlapTop = Math.max(t1, t2);
        const overlapBottom = Math.min(b1, b2);
        
        if (overlapBottom - overlapTop >= 20) {
          const y = (overlapTop + overlapBottom) / 2;
          const x = (right1 === l2) ? right1 : right2;
          
          const door = document.createElement('div');
          door.className = 'door door-v';
          door.style.left = x + 'px';
          door.style.top = y + 'px';
          workspace.appendChild(door);
          
          connections[i]++;
          connections[j]++;
        }
      }
      
      // Horizontal Edge Adjacency
      
      // Horizontal Edge Adjacency (Top/Bottom)
      if (b1 === t2 || b2 === t1) {
        const overlapLeft = Math.max(l1, l2);
        const overlapRight = Math.min(right1, right2);
        
        if (overlapRight - overlapLeft >= 20) {
          const x = (overlapLeft + overlapRight) / 2;
          const y = (b1 === t2) ? b1 : b2;
          
          const door = document.createElement('div');
          door.className = 'door door-h';
          door.style.left = x + 'px';
          door.style.top = y + 'px';
          workspace.appendChild(door);
          
          connections[i]++;
          connections[j]++;
        }
      }
    }
  }
  
  updateWarnings(rooms, connections);
}

function updateZIndices() {
  document.querySelectorAll('.room, .board-ui').forEach(el => {
    if (!el.classList.contains('dragging')) {
      // Calculate spatial z-index so bottom-right elements overlap top-left shadows
      const x = parseInt(el.style.left) || 0;
      const y = parseInt(el.style.top) || 0;
      el.style.zIndex = x + y; 
    }
  });
}

function updateTargetNumbers() {
  const rooms = Array.from(document.querySelectorAll('.room')).filter(r => {
    const data = roomDatabase.find(db => db.id === r.dataset.id);
    return data && data.type !== 'corridor';
  });

  // Sort top-to-bottom, then left-to-right (using a 20px threshold for rows)
  rooms.sort((a, b) => {
    const aTop = parseInt(a.style.top);
    const bTop = parseInt(b.style.top);
    if (Math.abs(aTop - bTop) > 20) {
      return aTop - bTop;
    }
    const aLeft = parseInt(a.style.left);
    const bLeft = parseInt(b.style.left);
    return aLeft - bLeft;
  });

  rooms.forEach((room, index) => {
    const targetEl = room.querySelector('.target-number');
    if (targetEl) {
      targetEl.textContent = index + 1;
    }
  });

  // Calculate the nearest standard polyhedral die
  const roomCount = rooms.length;
  let dieType = 0;
  if (roomCount === 0) dieType = 0;
  else if (roomCount <= 4) dieType = 4;
  else if (roomCount <= 6) dieType = 6;
  else if (roomCount <= 8) dieType = 8;
  else if (roomCount <= 10) dieType = 10;
  else if (roomCount <= 12) dieType = 12;
  else if (roomCount <= 20) dieType = 20;
  else dieType = 100; // For massive dreadnoughts!

  const dieDisplay = document.getElementById('board-target-die');
  if (dieDisplay) {
    dieDisplay.textContent = `TARGET DIE: D${dieType}`;
  }
}

function updateWarnings(rooms, connections) {
  const warningsDiv = document.getElementById('warnings-container');
  if (!warningsDiv) return;
  
  let corridorCount = 0;
  let standardRoomCount = 0;
  let overConnectedRooms = false;
  let overConnectedCorridors = false;
  let underConnectedCorridors = false;
  
  rooms.forEach((r, idx) => {
    const data = roomDatabase.find(db => db.id === r.dataset.id);
    if (!data) return;
    
    if (data.type === 'corridor') {
      corridorCount++;
      if (connections[idx] > 4) overConnectedCorridors = true;
      if (connections[idx] < 2) underConnectedCorridors = true;
    } else {
      standardRoomCount++;
      if (connections[idx] > 3) overConnectedRooms = true;
    }
  });
  
  let warnings = [];
  
  const requiredCorridors = Math.floor(standardRoomCount / 3);
  if (corridorCount < requiredCorridors) {
    warnings.push(`⚠ Not enough corridors (Min ${requiredCorridors} required for ${standardRoomCount} rooms)`);
  }
  if (overConnectedRooms) {
    warnings.push("⚠ Room exceeds max connections (3)");
  }
  if (overConnectedCorridors) {
    warnings.push("⚠ Corridor exceeds max connections (4)");
  }
  if (underConnectedCorridors) {
    warnings.push("⚠ Corridors must have at least 2 connections");
  }
  
  warningsDiv.innerHTML = warnings.join('<br>');
}

function updatePoints() {
  const rooms = document.querySelectorAll('.room');
  let total = 0;
  rooms.forEach(r => {
    const data = roomDatabase.find(db => db.id === r.dataset.id);
    if (data && data.cost) {
      total += data.cost;
    }
  });

  const hullSelect = document.getElementById('hull-select');
  if (hullSelect) {
    const hullData = hullDatabase.find(h => h.id === hullSelect.value);
    if (hullData && hullData.cost) total += hullData.cost;
  }

  document.getElementById('points-total').textContent = 'Total Points: ' + total;
  const boardPoints = document.getElementById('board-points-display');
  if (boardPoints) boardPoints.textContent = total + " Points";
}

// Sync sidebar input to the board elements
document.getElementById('ship-name-input').addEventListener('input', (e) => {
  const display = document.getElementById('ship-name-display');
  if (display) {
    display.textContent = e.target.value;
  }
  autoSaveWorkspace();
});

document.getElementById('ship-class-input').addEventListener('input', (e) => {
  const display = document.getElementById('ship-class-display');
  if (display) {
    display.textContent = e.target.value;
  }
  autoSaveWorkspace();
});

document.getElementById('btn-add').addEventListener('click', () => {
  const selectedId = document.getElementById('room-select').value;
  createRoom(selectedId, 50, 50); 
  updatePoints();
  updateDoors();
  updateTargetNumbers();
  updateZIndices();
  autoSaveWorkspace();
});

document.getElementById('btn-print').addEventListener('click', () => {
  window.print();
});

document.getElementById('btn-refresh-numbers').addEventListener('click', () => {
  updateTargetNumbers();
  autoSaveWorkspace();
});

document.getElementById('btn-group-move').addEventListener('click', (e) => {  const btn = e.currentTarget;
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
  localStorage.setItem('corvet_printer_friendly', body.classList.contains('printer-friendly'));
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
      
      const portraitEl = document.getElementById('board-portrait');
      if (portraitEl) {
        portraitEl.classList.add('has-image');
        portraitEl.querySelector('img').src = compressedDataUrl;
        autoSaveWorkspace();
      }
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = ''; 
});

// --- LIBRARY & WORKSPACE MANAGEMENT ---

function getCurrentLayoutData() {
  const elements = document.querySelectorAll('.room, .board-ui');
  const layoutData = [];
  elements.forEach(el => {
    let arcState = null;
    const arcEl = el.querySelector('.arc-circle');
    if (arcEl) {
      arcState = parseInt(arcEl.dataset.arc);
    }

    let customImg = null;
    if (el.id === 'board-portrait' && el.classList.contains('has-image')) {
      customImg = el.querySelector('img').src;
    }

    layoutData.push({
      id: el.dataset.id || el.dataset.uiType,
      isUI: el.classList.contains('board-ui'),
      left: el.style.left,
      top: el.style.top,
      customText: el.id === 'ship-header' ? document.getElementById('ship-name-display').textContent : 
                  (el.id === 'board-portrait' ? customImg : 
                  (el.dataset.uiType === 'hull' ? document.getElementById('hull-select').value : null)),
      customClassText: el.id === 'ship-header' ? document.getElementById('ship-class-display').textContent : null,
      arcState: arcState
    });
  });
  return layoutData;
}

function loadShipToWorkspace(layoutData) {
  workspace.innerHTML = ''; 
  layoutData.forEach(item => {
    if (item.isUI) {
      createUIElement(item.id, parseInt(item.left), parseInt(item.top), item.customText, item.customClassText);
      if (item.id === 'header') {
        if (item.customText) document.getElementById('ship-name-input').value = item.customText;
        if (item.customClassText) document.getElementById('ship-class-input').value = item.customClassText;
      }
    } else {
      createRoom(item.id, parseInt(item.left), parseInt(item.top), item.arcState);
    }
  });
  updatePoints();
  updateDoors();
  updateTargetNumbers();
  updateZIndices();
  syncDropdownsToBoard();
}

document.getElementById('btn-new').addEventListener('click', () => {
  if (confirm("Start a new ship? Any unsaved layout changes will be lost.")) {
    setupDefaultWorkspace();
    autoSaveWorkspace();
  }
});

document.getElementById('btn-save-lib').addEventListener('click', () => {
  const shipName = document.getElementById('ship-name-input').value;
  const layout = getCurrentLayoutData();
  const currentPoints = parseInt(document.getElementById('points-total').textContent.replace('Total Points: ', '')) || 0;
  
  const existingIndex = shipLibrary.findIndex(s => s.name === shipName);
  if (existingIndex >= 0) {
    if (confirm(`Overwrite existing ship "${shipName}" in library?`)) {
      shipLibrary[existingIndex] = { name: shipName, layout: layout, points: currentPoints };
      alert(`Ship "${shipName}" updated.`);
    }
  } else {
    shipLibrary.push({ name: shipName, layout: layout, points: currentPoints });
    alert(`Ship "${shipName}" saved to library.`);
  }
  saveLibraryToLocal();
});

document.getElementById('btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ corvetLibrary: shipLibrary }, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `corvet_library_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btn-import').addEventListener('click', () => document.getElementById('file-import').click());
document.getElementById('file-import').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (data.corvetLibrary) {
        shipLibrary = data.corvetLibrary;
        saveLibraryToLocal();
        alert("Library imported successfully. Previous library was overwritten.");
      } else {
        alert("Invalid file format.");
      }
    } catch (err) { alert("Error reading file."); }
  };
  reader.readAsText(file);
  e.target.value = ''; 
});

document.getElementById('btn-merge').addEventListener('click', () => document.getElementById('file-merge').click());
document.getElementById('file-merge').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (data.corvetLibrary) {
        shipLibrary = [...shipLibrary, ...data.corvetLibrary];
        saveLibraryToLocal();
        alert(`Merged ${data.corvetLibrary.length} ships into your library.`);
      }
    } catch (err) { alert("Error reading file."); }
  };
  reader.readAsText(file);
  e.target.value = ''; 
});

document.getElementById('btn-wipe').addEventListener('click', () => {
  if (confirm("Are you sure you want to permanently delete all ships in your library? Make sure you have exported a backup first.")) {
    shipLibrary = [];
    saveLibraryToLocal();
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
    shipLibrary.forEach((ship, index) => {
      let shipPoints = ship.points;
      
      // Fallback for ships saved before the points variable was added
      if (shipPoints === undefined) {
        shipPoints = 0;
        ship.layout.forEach(item => {
          if (!item.isUI) {
            const roomData = roomDatabase.find(db => db.id === item.id);
            if (roomData && roomData.cost) shipPoints += roomData.cost;
          } else if (item.id === 'hull' && item.customText) {
            const hullData = hullDatabase.find(h => h.id === item.customText);
            if (hullData && hullData.cost) shipPoints += hullData.cost;
          }
        });
      }

      const item = document.createElement('div');
      item.className = 'library-item';
      
      const title = document.createElement('div');
      title.innerHTML = `<strong>${ship.name}</strong><br><span style="font-size:12px; color:#888;">${shipPoints} Points</span>`;
      
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
          shipLibrary.splice(index, 1);
          saveLibraryToLocal();
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

init();

function syncDropdownsToBoard() {
  document.querySelectorAll('.room').forEach(el => {
    const dbRoom = roomDatabase.find(r => r.id === el.dataset.id);
    if (dbRoom && dbRoom.core_category) {
       const sel = document.getElementById(`${dbRoom.core_category}-select`);
       if (sel) sel.value = dbRoom.id;
    }
  });
  const hullUi = document.querySelector('.hull-ui');
  if (hullUi && hullUi.dataset.hullId) {
    document.getElementById('hull-select').value = hullUi.dataset.hullId;
  }
}

function swapCoreRoom(category, selectElementId) {
  const newRoomId = document.getElementById(selectElementId).value;
  const currentRoomEl = Array.from(document.querySelectorAll('.room')).find(el => {
    const dbRoom = roomDatabase.find(r => r.id === el.dataset.id);
    return dbRoom && dbRoom.core_category === category;
  });

  let left = 320, top = 500, arc = 0; 
  if (currentRoomEl) {
    left = parseInt(currentRoomEl.style.left) || 320;
    top = parseInt(currentRoomEl.style.top) || 500;
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
  const hullUi = document.querySelector('.hull-ui');
  if (hullUi && hullData) {
    hullUi.dataset.hullId = hullData.id;
    const hpBox = hullUi.querySelector('div:first-child');
    if (hpBox) hpBox.textContent = hullData.hp;
  }
  updatePoints();
  autoSaveWorkspace();
});