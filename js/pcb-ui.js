/**
 * PCBUIManager – manages all UI panels, modals, and the connection table.
 */
class PCBUIManager {
  constructor(app) {
    this.app      = app;
    this.activeTab = 'props';
  }

  // ── Tabs ───────────────────────────────────────────────────
  switchTab(name) {
    this.activeTab = name;
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    document.querySelectorAll('.tab-content').forEach(c => {
      c.classList.toggle('active', c.id === `tab-${name}`);
    });

    if (name === 'conn')   this.refreshConnectionTable();
    if (name === 'nets')   this.refreshNetList();
  }

  // ── Properties panel ───────────────────────────────────────
  showNoSelection() {
    document.getElementById('prop-content').innerHTML =
      '<div class="empty-state">Nothing selected.<br>Click a hole, trace, or module.</div>';
  }

  showHoleProps(hole) {
    const board = this.app.board;
    const mod   = hole.moduleId != null ? board.modules.get(hole.moduleId) : null;
    const pin   = mod ? mod.pins[hole.pinIndex] : null;

    const netOptions = ['<option value="">— None —</option>',
      ...Array.from(board.nets.keys()).map(n =>
        `<option value="${n}" ${hole.net === n ? 'selected' : ''}>${this._esc(n)}</option>`),
      '<option value="__new__">+ New net…</option>'
    ].join('');

    document.getElementById('prop-content').innerHTML = `
      <div class="prop-group">
        <div class="prop-group-title">Hole</div>
        <div class="prop-row">
          <span class="prop-label">Position</span>
          <span class="prop-value">(${hole.col}, ${hole.row})</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Coord (mm)</span>
          <span class="prop-value">${(hole.col*board.spacing).toFixed(2)}, ${(hole.row*board.spacing).toFixed(2)}</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Net</span>
          <select class="prop-select" id="hole-net-sel">${netOptions}</select>
        </div>
        <div class="prop-row" id="hole-new-net-row" style="display:none">
          <span class="prop-label"></span>
          <input class="prop-input" id="hole-new-net-inp" placeholder="Net name…" autocomplete="off">
        </div>
      </div>
      ${mod ? `
      <div class="prop-group">
        <div class="prop-group-title">Module Pin</div>
        <div class="prop-row">
          <span class="prop-label">Module</span>
          <span class="prop-value">${this._esc(mod.name)}</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Pin #</span>
          <span class="prop-value">${pin.num} — ${this._esc(pin.name)}</span>
        </div>
      </div>` : ''}
    `;

    const applyNet = (netName) => {
      this.app._saveSnapshot();
      if (netName) board.addNet(netName);
      board.assignHoleNet(hole.id, netName || null);
      if (mod && pin != null) board.setModulePinNet(mod.id, hole.pinIndex, netName || null);
      this.app.renderer2d.draw();
      this.refreshConnectionTable();
      this.refreshNetList();
    };

    document.getElementById('hole-net-sel')?.addEventListener('change', e => {
      if (e.target.value === '__new__') {
        document.getElementById('hole-new-net-row').style.display = 'flex';
        document.getElementById('hole-new-net-inp')?.focus();
      } else {
        document.getElementById('hole-new-net-row').style.display = 'none';
        applyNet(e.target.value);
      }
    });
    document.getElementById('hole-new-net-inp')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const name = e.target.value.trim();
        if (name) applyNet(name);
      }
    });
  }

  showModuleProps(mod) {
    const board = this.app.board;
    const fp    = board.footprints.get(mod.footprintId);

    const netOptions = (current) => ['<option value="">— None —</option>',
      ...Array.from(board.nets.keys()).map(n =>
        `<option value="${n}" ${current === n ? 'selected' : ''}>${this._esc(n)}</option>`),
      '<option value="__new__">+ New net…</option>'
    ].join('');

    const pinRows = mod.pins.map((pin, idx) => `
      <div class="prop-row">
        <span class="prop-label" style="width:100px">P${pin.num} ${this._esc(pin.name)}</span>
        <select class="prop-select pin-net-sel" data-pinidx="${idx}">${netOptions(pin.net)}</select>
      </div>
    `).join('');

    document.getElementById('prop-content').innerHTML = `
      <div class="prop-group">
        <div class="prop-group-title">Module</div>
        <div class="prop-row">
          <span class="prop-label">Name</span>
          <input class="prop-input" id="mod-name-inp" value="${this._esc(mod.name)}">
        </div>
        <div class="prop-row">
          <span class="prop-label">Footprint</span>
          <span class="prop-value">${this._esc(fp ? fp.name : mod.footprintId)}</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Position</span>
          <span class="prop-value">(${mod.col}, ${mod.row})</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Rotation</span>
          <div style="display:flex;align-items:center;gap:6px">
            <button class="rot-btn" data-delta="-1" title="Rotate 90° CCW (counter-clockwise)"
                    style="background:var(--surface2);border:1px solid var(--border);color:var(--text);
                           padding:3px 8px;border-radius:4px;cursor:pointer;font-size:14px">↺</button>
            <span id="mod-rot-val" style="min-width:36px;text-align:center;font-weight:600">${mod.rotation || 0}°</span>
            <button class="rot-btn" data-delta="1" title="Rotate 90° CW (Tab)″
                    style="background:var(--surface2);border:1px solid var(--border);color:var(--text);
                           padding:3px 8px;border-radius:4px;cursor:pointer;font-size:14px">↻</button>
          </div>
        </div>
        <div class="prop-actions">
          <button id="mod-del-btn" class="danger">Delete Module</button>
        </div>
      </div>
      <div class="prop-group">
        <div class="prop-group-title">Pins</div>
        ${pinRows}
      </div>
    `;

    document.getElementById('mod-name-inp')?.addEventListener('change', e => {
      board.renameModule(mod.id, e.target.value);
      this.app.renderer2d.draw();
      this.refreshConnectionTable();
    });

    document.querySelectorAll('.rot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.app._saveSnapshot();
        board.rotateModule(mod.id, parseInt(btn.dataset.delta));
        const updated = board.modules.get(mod.id);
        if (updated) {
          document.getElementById('mod-rot-val').textContent = `${updated.rotation}°`;
          this.app.renderer2d.draw();
          this.showModuleProps(updated);   // refresh pin positions in props
          this.refreshConnectionTable();
        }
      });
    });

    document.getElementById('mod-del-btn')?.addEventListener('click', () => {
      this.app._saveSnapshot();
      board.removeModule(mod.id);
      this.app.renderer2d.selectedIds.clear();
      this.app.onSelectionChange(null);
      this.app.renderer2d.draw();
      this.refreshConnectionTable();
      this.refreshNetList();
    });

    const applyPinNet = (pidx, netName) => {
      this.app._saveSnapshot();
      if (netName) board.addNet(netName);
      board.setModulePinNet(mod.id, pidx, netName || null);
      this.app.renderer2d.draw();
      this.refreshConnectionTable();
      this.refreshNetList();
    };

    document.querySelectorAll('.pin-net-sel').forEach(sel => {
      sel.addEventListener('change', e => {
        const pidx = parseInt(e.target.dataset.pinidx);
        if (e.target.value === '__new__') {
          const name = prompt('New net name:');
          if (name && name.trim()) applyPinNet(pidx, name.trim());
          else e.target.value = mod.pins[pidx].net || ''; // revert
        } else {
          applyPinNet(pidx, e.target.value);
        }
      });
    });
  }

  showTraceProps(trace) {
    const board = this.app.board;
    const h1 = board.getHoleById(trace.from);
    const h2 = board.getHoleById(trace.to);
    const netOptions = ['<option value="">— None —</option>',
      ...Array.from(board.nets.keys()).map(n =>
        `<option value="${n}" ${trace.net === n ? 'selected' : ''}>${this._esc(n)}</option>`)
    ].join('');

    document.getElementById('prop-content').innerHTML = `
      <div class="prop-group">
        <div class="prop-group-title">Trace</div>
        <div class="prop-row">
          <span class="prop-label">Layer</span>
          <span class="prop-value" style="color:${trace.layer==='top'?'#cc3333':'#3366cc'}">${trace.layer.toUpperCase()}</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">From</span>
          <span class="prop-value">(${h1?h1.col:'?'},${h1?h1.row:'?'})</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">To</span>
          <span class="prop-value">(${h2?h2.col:'?'},${h2?h2.row:'?'})</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Net</span>
          <select class="prop-select" id="trace-net-sel">${netOptions}</select>
        </div>
        <div class="prop-actions">
          <button id="trace-del-btn" class="danger">Delete Trace</button>
        </div>
      </div>
    `;

    document.getElementById('trace-net-sel')?.addEventListener('change', e => {
      this.app._saveSnapshot();
      trace.net = e.target.value || null;
      this.app.renderer2d.draw();
      this.refreshConnectionTable();
      this.refreshNetList();
    });

    document.getElementById('trace-del-btn')?.addEventListener('click', () => {
      this.app._saveSnapshot();
      board.removeTrace(trace.id);
      this.app.onSelectionChange(null);
      this.app.renderer2d.draw();
      this.refreshConnectionTable();
      this.refreshNetList();
    });
  }

  // ── Connection Table ───────────────────────────────────────
  refreshConnectionTable() {
    const { modules, rows } = this.app.board.connectionTable();
    const wrap = document.getElementById('conn-table-wrap');

    if (modules.length === 0) {
      wrap.innerHTML = '<div class="empty-state">No modules placed yet.</div>';
      return;
    }

    const header = `<tr>
      <th>Net</th>
      ${modules.map(m => `<th title="${this._esc(m.footprintId)}">${this._esc(m.name)}</th>`).join('')}
    </tr>`;

    const bodyRows = rows.map(({ net, cells }) => {
      const netObj  = this.app.board.nets.get(net);
      const color   = netObj ? netObj.color : '#888';
      const colorDot = `<span class="net-color" style="background:${color};display:inline-block"></span>`;
      const tds = cells.map(c => c
        ? `<td class="conn-pin-cell">${this._esc(c)}</td>`
        : `<td class="conn-empty">·</td>`
      ).join('');
      return `<tr><td class="conn-net-cell">${colorDot} ${this._esc(net)}</td>${tds}</tr>`;
    }).join('');

    wrap.innerHTML = `
      <table id="conn-table">
        <thead>${header}</thead>
        <tbody>${bodyRows || '<tr><td colspan="100" style="text-align:center;color:#888;padding:12px">No net connections yet.</td></tr>'}</tbody>
      </table>
    `;
  }

  // ── Net list ───────────────────────────────────────────────
  refreshNetList() {
    const board = this.app.board;
    const list  = document.getElementById('net-list');
    if (!list) return;

    if (board.nets.size === 0) {
      list.innerHTML = '<div class="empty-state">No nets defined.<br>Create a net below.</div>';
      return;
    }

    list.innerHTML = Array.from(board.nets.values()).map(net => {
      // Count holes on this net
      let count = 0;
      for (const h of board.holes.values()) { if (h.net === net.name) count++; }
      return `
        <div class="net-item" data-net="${this._esc(net.name)}">
          <span class="net-color" style="background:${net.color}"></span>
          <span class="net-name">${this._esc(net.name)}</span>
          <span class="net-count">${count}p</span>
          <input type="color" value="${net.color}" class="net-color-inp" data-net="${this._esc(net.name)}"
                 title="Change net color" style="width:20px;height:20px;margin-left:auto">
          <button class="net-del-btn" data-net="${this._esc(net.name)}"
                  style="background:none;border:none;color:#e94560;cursor:pointer;font-size:12px"
                  title="Delete net">✕</button>
        </div>
      `;
    }).join('');

    // Highlight on click
    list.querySelectorAll('.net-item').forEach(item => {
      item.addEventListener('click', e => {
        if (e.target.closest('.net-color-inp') || e.target.closest('.net-del-btn')) return;
        const name = item.dataset.net;
        const r2d = this.app.renderer2d;
        r2d.highlightNet = r2d.highlightNet === name ? null : name;
        r2d.draw();
        list.querySelectorAll('.net-item').forEach(i =>
          i.classList.toggle('selected', i.dataset.net === name && r2d.highlightNet === name));
        document.getElementById('sb-net').textContent = r2d.highlightNet || '—';
      });
    });

    list.querySelectorAll('.net-color-inp').forEach(inp => {
      inp.addEventListener('input', e => {
        const name = inp.dataset.net;
        const net  = board.nets.get(name);
        if (net) { net.color = e.target.value; this.app.renderer2d.draw(); }
      });
    });

    list.querySelectorAll('.net-del-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const name = btn.dataset.net;
        if (confirm(`Delete net "${name}"?`)) {
          board.removeNet(name);
          this.refreshNetList();
          this.app.renderer2d.draw();
        }
      });
    });
  }

  // ── Footprint library ──────────────────────────────────────
  refreshFootprintList(filter = '') {
    const board = this.app.board;
    const list  = document.getElementById('fp-list');
    const q     = filter.toLowerCase();

    list.innerHTML = '';
    for (const fp of board.footprints.values()) {
      if (q && !fp.name.toLowerCase().includes(q) &&
               !fp.description.toLowerCase().includes(q)) continue;

      const item = document.createElement('div');
      item.className = 'fp-item';
      item.draggable = true;
      item.dataset.fpId = fp.id;
      item.innerHTML = `<div class="fp-name">${this._esc(fp.name)}</div>
                        <div class="fp-desc">${this._esc(fp.description || '')}</div>`;

      item.addEventListener('click', () => {
        this.app.startPlaceMode(fp.id);
      });

      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('fpId', fp.id);
        item.classList.add('dragging-fp');
      });
      item.addEventListener('dragend', () => item.classList.remove('dragging-fp'));

      list.appendChild(item);
    }

    if (!list.childElementCount) {
      list.innerHTML = '<div class="empty-state">No footprints found.</div>';
    }
  }

  // ── Board settings modal ───────────────────────────────────
  showBoardSettings() {
    const b = this.app.board;
    this._showModal('Board Settings', `
      <div class="modal-row">
        <label>Board Name</label>
        <input type="text" id="bs-name" value="${this._esc(b.name)}">
      </div>
      <div class="modal-row">
        <label>Columns</label>
        <input type="number" id="bs-cols" value="${b.cols}" min="5" max="100">
      </div>
      <div class="modal-row">
        <label>Rows</label>
        <input type="number" id="bs-rows" value="${b.rows}" min="5" max="100">
      </div>
      <div class="modal-row">
        <label>Grid Spacing (mm)</label>
        <input type="number" id="bs-spacing" value="${b.spacing}" min="1" max="10" step="0.01">
      </div>
      <div class="modal-row">
        <label>Drill Ø (mm)</label>
        <input type="number" id="bs-drill" value="${b.drillDia}" min="0.3" max="3" step="0.1">
      </div>
      <div class="modal-row">
        <label>Pad Ø (mm)</label>
        <input type="number" id="bs-pad" value="${b.padDia}" min="0.5" max="5" step="0.1">
      </div>
    `, () => {
      b.name     = document.getElementById('bs-name').value || b.name;
      const cols = parseInt(document.getElementById('bs-cols').value);
      const rows = parseInt(document.getElementById('bs-rows').value);
      b.spacing  = parseFloat(document.getElementById('bs-spacing').value) || b.spacing;
      b.drillDia = parseFloat(document.getElementById('bs-drill').value) || b.drillDia;
      b.padDia   = parseFloat(document.getElementById('bs-pad').value) || b.padDia;
      if (cols > 0 && rows > 0) b.resize(cols, rows);
      this.app.renderer2d.draw();
      this.app.renderer3d.rebuild();
    });
  }

  // ── New footprint modal ────────────────────────────────────
  showNewFootprint() {
    this._showModal('Create Footprint', `
      <div class="modal-row">
        <label>ID</label>
        <input type="text" id="nfp-id" placeholder="MY-FP-1">
      </div>
      <div class="modal-row">
        <label>Name</label>
        <input type="text" id="nfp-name" placeholder="My Footprint">
      </div>
      <div class="modal-row">
        <label>Description</label>
        <input type="text" id="nfp-desc" placeholder="Optional description">
      </div>
      <div style="margin-top:8px">
        <div class="prop-group-title" style="font-size:11px;color:#888;margin-bottom:6px">
          PINS (col & row are relative to origin, 0-indexed)
        </div>
        <div id="nfp-pins">
          ${this._pinRow(1,'Pin1',0,0)}
          ${this._pinRow(2,'Pin2',1,0)}
        </div>
        <button id="nfp-add-pin" style="margin-top:4px;width:100%;background:#16213e;border:1px dashed #2a4a7f;
                color:#53d8fb;padding:4px;border-radius:4px;cursor:pointer">+ Add Pin</button>
      </div>
    `, () => {
      const id   = document.getElementById('nfp-id').value.trim();
      const name = document.getElementById('nfp-name').value.trim();
      if (!id || !name) { alert('ID and Name are required.'); return false; }

      const pins = [];
      document.querySelectorAll('.nfp-pin-row').forEach(row => {
        pins.push({
          num:    parseInt(row.querySelector('.pin-num').value),
          name:   row.querySelector('.pin-name').value,
          relCol: parseInt(row.querySelector('.pin-col').value),
          relRow: parseInt(row.querySelector('.pin-row').value)
        });
      });

      const fp = { id, name, description: document.getElementById('nfp-desc').value,
                   pins, cols: 0, rows: 0 };
      this.app.board.addFootprint(fp);
      this.refreshFootprintList();
    });

    // Dynamic add-pin button
    setTimeout(() => {
      let pinNum = 3;
      document.getElementById('nfp-add-pin')?.addEventListener('click', () => {
        const container = document.getElementById('nfp-pins');
        container.insertAdjacentHTML('beforeend', this._pinRow(pinNum++, `Pin${pinNum-1}`, pinNum-2, 0));
        this._bindPinRowDelete();
      });
      this._bindPinRowDelete();
    }, 0);
  }

  _pinRow(num, name, col, row) {
    return `<div class="fp-pin-row nfp-pin-row">
      <input class="pin-num" type="number" value="${num}" style="width:36px" placeholder="#" min="1">
      <input class="pin-name" type="text" value="${name}" style="width:64px" placeholder="Name">
      <input class="pin-col" type="number" value="${col}" style="width:36px" placeholder="Col">
      <input class="pin-row" type="number" value="${row}" style="width:36px" placeholder="Row">
      <button class="fp-pin-del" title="Remove">✕</button>
    </div>`;
  }

  _bindPinRowDelete() {
    document.querySelectorAll('.fp-pin-del').forEach(btn => {
      btn.onclick = () => btn.closest('.nfp-pin-row').remove();
    });
  }

  // ── Generic modal ──────────────────────────────────────────
  _showModal(title, bodyHtml, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>${this._esc(title)}</h2>
        <div id="modal-body">${bodyHtml}</div>
        <div class="modal-actions">
          <button id="modal-cancel">Cancel</button>
          <button id="modal-ok" class="primary">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#modal-cancel').addEventListener('click', () =>
      overlay.remove());
    overlay.querySelector('#modal-ok').addEventListener('click', () => {
      const result = onConfirm();
      if (result !== false) overlay.remove();
    });
    overlay.addEventListener('mousedown', e => {
      if (e.target === overlay) overlay.remove();
    });

    // Focus first input
    setTimeout(() => overlay.querySelector('input')?.focus(), 50);
  }

  // ── Helpers ────────────────────────────────────────────────
  _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
}
