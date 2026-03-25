/**
 * PCBApp – main application controller.
 *
 * Wires together PCBBoard, PCBRenderer2D, PCBRenderer3D, and PCBUIManager.
 * Handles tool dispatch (select, route, place, erase).
 */
class PCBApp {
  constructor() {
    this.board    = new PCBBoard();
    this.renderer2d = null;  // set in init()
    this.renderer3d = null;
    this.ui       = new PCBUIManager(this);

    // Tool state
    this.activeTool   = 'select'; // select | route | place | erase
    this.activeLayer  = 'top';

    // Place mode
    this._placingFpId = null;

    // Selection
    this._selectedHole  = null;
    this._selectedMod   = null;
    this._selectedTrace = null;
  }

  init() {
    const canvas = document.getElementById('pcb-canvas');
    this.renderer2d = new PCBRenderer2D(canvas, this.board, this);

    const div3d = document.getElementById('canvas-3d');
    this.renderer3d = new PCBRenderer3D(div3d, this.board);

    this._bindToolbar();
    this._bindLayerControls();
    this._bindLeftPanel();
    this._bindTabs();
    this._bindDropZone();
    this._bindKeyboard();

    // Load default board
    this.ui.refreshFootprintList();
    this.ui.switchTab('props');
    this.ui.showNoSelection();
    this._updateToolHighlight();

    // Status bar
    document.getElementById('sb-net').textContent = '—';
    document.getElementById('sb-tool').textContent = this.activeTool;
  }

  // ── Toolbar binding ────────────────────────────────────────
  _bindToolbar() {
    // File ops
    document.getElementById('btn-new')?.addEventListener('click', () => this._newBoard());
    document.getElementById('btn-open')?.addEventListener('click', () => this._openFile());
    document.getElementById('btn-save')?.addEventListener('click', () => this._saveFile());
    document.getElementById('btn-export')?.addEventListener('click', () => this._exportMenu());
    document.getElementById('btn-import-fp')?.addEventListener('click', () => this._importFootprints());

    // Board settings
    document.getElementById('btn-board-cfg')?.addEventListener('click',
      () => this.ui.showBoardSettings());

    // 3D toggle
    document.getElementById('btn-3d')?.addEventListener('click', () => this._toggle3D());

    // Fit
    document.getElementById('btn-fit')?.addEventListener('click',
      () => this.renderer2d.fitBoard());
  }

  _bindLayerControls() {
    document.querySelectorAll('.layer-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.activeLayer = chip.dataset.layer;
        this.renderer2d.activeLayer = this.activeLayer;
        document.querySelectorAll('.layer-chip').forEach(c =>
          c.classList.toggle('active', c.dataset.layer === this.activeLayer));
        document.getElementById('sb-layer').textContent = this.activeLayer.toUpperCase();
      });
    });

    // View buttons
    document.getElementById('vbtn-fit')?.addEventListener('click',
      () => this.renderer2d.fitBoard());
    document.getElementById('vbtn-grid')?.addEventListener('click', () => {
      this.renderer2d.showGrid = !this.renderer2d.showGrid;
      document.getElementById('vbtn-grid')?.classList.toggle(
        'active', this.renderer2d.showGrid);
      this.renderer2d.draw();
    });
    document.getElementById('vbtn-nets')?.addEventListener('click', () => {
      this.renderer2d.showNets = !this.renderer2d.showNets;
      document.getElementById('vbtn-nets')?.classList.toggle(
        'active', this.renderer2d.showNets);
      this.renderer2d.draw();
    });
  }

  _bindLeftPanel() {
    // Tool buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setTool(btn.dataset.tool);
      });
    });

    // Footprint search
    document.getElementById('fp-search')?.addEventListener('input', e => {
      this.ui.refreshFootprintList(e.target.value);
    });

    // Footprint actions
    document.getElementById('fp-new')?.addEventListener('click',
      () => this.ui.showNewFootprint());
    document.getElementById('fp-import')?.addEventListener('click',
      () => this._importFootprints());
    document.getElementById('fp-export')?.addEventListener('click',
      () => this._exportFootprints());
  }

  _bindTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.ui.switchTab(btn.dataset.tab));
    });

    // Net add
    document.getElementById('net-add-btn')?.addEventListener('click', () => {
      const inp = document.getElementById('net-name-inp');
      const name = inp.value.trim();
      if (name) {
        this.board.addNet(name);
        inp.value = '';
        this.ui.refreshNetList();
      }
    });
    document.getElementById('net-name-inp')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('net-add-btn')?.click();
    });
  }

  _bindDropZone() {
    const canvas = document.getElementById('pcb-canvas');

    canvas.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    canvas.addEventListener('drop', e => {
      e.preventDefault();
      const fpId = e.dataTransfer.getData('fpId');
      if (fpId) {
        const r = canvas.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const g = this.renderer2d.screenToGrid(x, y);
        const col = Math.max(0, Math.min(this.board.cols - 2, g.col));
        const row = Math.max(0, Math.min(this.board.rows - 2, g.row));
        const mod = this.board.addModule(fpId, col, row);
        if (mod) {
          this.onSelectionChange({ type: 'module', target: mod });
          this.renderer2d.draw();
          this.ui.refreshConnectionTable();
        }
      }

      // File drop (open project)
      if (e.dataTransfer.files.length > 0) {
        this._handleFileOpen(e.dataTransfer.files[0]);
      }
    });
  }

  _bindKeyboard() {
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case 'Escape':
          this._cancelAction();
          break;
        case 'Delete':
        case 'Backspace':
          this._deleteSelected();
          break;
        case 's': this.setTool('select'); break;
        case 'r': this.setTool('route');  break;
        case 'p': this.setTool('place');  break;
        case 'e': this.setTool('erase');  break;
        case 'f': this.renderer2d.fitBoard(); break;
        case 'g':
          this.renderer2d.showGrid = !this.renderer2d.showGrid;
          this.renderer2d.draw();
          break;
      }
    });
  }

  // ── Tool management ────────────────────────────────────────
  setTool(tool) {
    this.activeTool = tool;
    this._updateToolHighlight();
    document.getElementById('sb-tool').textContent = tool;

    if (tool !== 'place') this._placingFpId = null;
    if (tool !== 'route') this.renderer2d._routeFrom = null;

    this.renderer2d.draw();
  }

  _updateToolHighlight() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === this.activeTool);
    });
  }

  startPlaceMode(fpId) {
    this._placingFpId = fpId;
    this.setTool('place');
    const fp = this.board.footprints.get(fpId);
    document.getElementById('sb-tool').textContent = `place: ${fp ? fp.name : fpId}`;
  }

  // ── Canvas event handlers (called by renderer) ─────────────
  handleCanvasClick(x, y, e) {
    const r2d = this.renderer2d;

    switch (this.activeTool) {
      case 'select': {
        // Prefer module hit over hole
        const mod  = r2d.hitModule(x, y);
        const hole = r2d.hitHole(x, y);

        if (mod) {
          r2d.selectedIds.clear();
          this.onSelectionChange({ type: 'module', target: mod });
          // start drag if selecting
          r2d.startDrag('module', mod.id, x, y);
        } else if (hole) {
          r2d.selectedIds.clear();
          r2d.selectedIds.add(hole.id);
          this.onSelectionChange({ type: 'hole', target: hole });
          r2d.startDrag('hole', hole.id, x, y);
        } else {
          r2d.selectedIds.clear();
          this.onSelectionChange(null);
        }
        r2d.draw();
        break;
      }

      case 'route': {
        const hole = r2d.hitHole(x, y);
        if (!hole) return;

        if (!r2d._routeFrom) {
          // Start routing
          r2d._routeFrom = hole.id;
          r2d.selectedIds.clear();
          r2d.selectedIds.add(hole.id);
        } else {
          // Complete trace
          if (r2d._routeFrom !== hole.id) {
            const netName = this._pickRouteNet(r2d._routeFrom, hole.id);
            const traces = this.board.addTracePath(r2d._routeFrom, hole.id, this.activeLayer, netName);
            if (!traces) {
              this._flashStatus('Route must be horizontal or vertical');
            }
          }
          r2d._routeFrom = null;
          r2d.selectedIds.clear();
        }
        r2d.draw();
        this.ui.refreshConnectionTable();
        this.ui.refreshNetList();
        break;
      }

      case 'place': {
        if (!this._placingFpId) return;
        const g = r2d.screenToGrid(x, y);
        const col = Math.max(0, Math.min(this.board.cols - 2, g.col));
        const row = Math.max(0, Math.min(this.board.rows - 2, g.row));
        const mod = this.board.addModule(this._placingFpId, col, row);
        if (mod) {
          this.onSelectionChange({ type: 'module', target: mod });
          r2d.draw();
          this.ui.refreshConnectionTable();
          this.ui.refreshNetList();
          // Stay in place mode until ESC
        }
        break;
      }

      case 'erase': {
        // Try trace first
        const trace = r2d.hitTrace(x, y);
        if (trace) {
          this.board.removeTrace(trace.id);
          this.onSelectionChange(null);
          r2d.draw();
          return;
        }
        // Then module
        const mod2 = r2d.hitModule(x, y);
        if (mod2) {
          this.board.removeModule(mod2.id);
          this.onSelectionChange(null);
          r2d.draw();
          this.ui.refreshConnectionTable();
          return;
        }
        // Then clear hole net
        const hole2 = r2d.hitHole(x, y);
        if (hole2) {
          this.board.assignHoleNet(hole2.id, null);
          r2d.draw();
        }
        break;
      }
    }
  }

  handleCanvasDrag(x, y, e) {
    // Live drag handled by renderer draw() in mousemove
  }

  handleCanvasDragEnd(x, y, e) {
    const r2d = this.renderer2d;
    if (!r2d._dragging) return;

    if (r2d._dragType === 'module') {
      const g = r2d.screenToGrid(x, y);
      const col = Math.max(0, Math.min(this.board.cols - 1, g.col - r2d._dragOffset.col));
      const row = Math.max(0, Math.min(this.board.rows - 1, g.row - r2d._dragOffset.row));
      this.board.moveModule(r2d._dragTarget, col, row);
      const mod = this.board.modules.get(r2d._dragTarget);
      if (mod) {
        this.ui.showModuleProps(mod);
        this.ui.refreshConnectionTable();
      }
    }

    r2d._dragging   = false;
    r2d._dragType   = null;
    r2d._dragTarget = null;
    r2d.draw();

    // Update 3D
    if (this._3dVisible) this.renderer3d.rebuild();
  }

  handleCanvasDblClick(x, y, e) {
    // Double-click a module → select and show props
    const mod = this.renderer2d.hitModule(x, y);
    if (mod) {
      this.onSelectionChange({ type: 'module', target: mod });
      this.ui.switchTab('props');
    }
  }

  // ── Selection ──────────────────────────────────────────────
  onSelectionChange(sel) {
    this._selectedHole  = null;
    this._selectedMod   = null;
    this._selectedTrace = null;

    if (!sel) {
      this.ui.showNoSelection();
      return;
    }

    if (sel.type === 'hole') {
      this._selectedHole = sel.target;
      this.ui.showHoleProps(sel.target);
    } else if (sel.type === 'module') {
      this._selectedMod = sel.target;
      this.ui.showModuleProps(sel.target);
    } else if (sel.type === 'trace') {
      this._selectedTrace = sel.target;
      this.ui.showTraceProps(sel.target);
    }

    this.ui.switchTab('props');
  }

  // ── Routing helpers ────────────────────────────────────────
  _pickRouteNet(fromId, toId) {
    const h1 = this.board.getHoleById(fromId);
    const h2 = this.board.getHoleById(toId);
    // Use existing net if available
    return h1.net || h2.net || null;
  }

  // ── Misc ───────────────────────────────────────────────────
  _cancelAction() {
    this.renderer2d._routeFrom = null;
    this._placingFpId = null;
    if (this.activeTool === 'place') this.setTool('select');
    this.renderer2d.draw();
  }

  _deleteSelected() {
    const r2d = this.renderer2d;
    if (this._selectedMod) {
      this.board.removeModule(this._selectedMod.id);
      this.onSelectionChange(null);
    } else if (this._selectedTrace) {
      this.board.removeTrace(this._selectedTrace.id);
      this.onSelectionChange(null);
    } else if (this._selectedHole) {
      this.board.assignHoleNet(this._selectedHole.id, null);
      this.onSelectionChange({ type: 'hole', target: this._selectedHole });
    }
    r2d.draw();
    this.ui.refreshConnectionTable();
    this.ui.refreshNetList();
  }

  // ── 3D view ────────────────────────────────────────────────
  _toggle3D() {
    this._3dVisible = !this._3dVisible;
    const canvas2d = document.getElementById('pcb-canvas');
    const div3d    = document.getElementById('canvas-3d');
    const btn3d    = document.getElementById('btn-3d');
    const hint3d   = document.getElementById('hint-3d');

    if (this._3dVisible) {
      canvas2d.style.display = 'none';
      div3d.style.display    = 'block';
      btn3d?.classList.add('active');
      if (hint3d) hint3d.style.display = 'block';
      this.renderer3d.init();
      this.renderer3d.rebuild();
    } else {
      canvas2d.style.display = 'block';
      div3d.style.display    = 'none';
      btn3d?.classList.remove('active');
      if (hint3d) hint3d.style.display = 'none';
      this.renderer3d.stop();
      this.renderer2d.draw();
    }
  }

  // ── File operations ────────────────────────────────────────
  _newBoard() {
    if (!confirm('Start a new board? Unsaved changes will be lost.')) return;
    this.board = new PCBBoard();
    this.renderer2d.setBoard(this.board);
    this.renderer3d.setBoard(this.board);
    this.ui = new PCBUIManager(this);
    this.ui.refreshFootprintList();
    this.ui.switchTab('props');
    this.ui.showNoSelection();
    this._3dVisible = false;
    document.getElementById('pcb-canvas').style.display = 'block';
    document.getElementById('canvas-3d').style.display  = 'none';
    document.getElementById('btn-3d')?.classList.remove('active');
  }

  _saveFile() {
    const data = JSON.stringify(this.board.serialize(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = (this.board.name || 'board').replace(/\s+/g, '_') + '.pcbpanel';
    a.click();
    URL.revokeObjectURL(url);
  }

  _openFile() {
    const inp = document.createElement('input');
    inp.type   = 'file';
    inp.accept = '.pcbpanel,.json';
    inp.onchange = () => {
      if (inp.files[0]) this._handleFileOpen(inp.files[0]);
    };
    inp.click();
  }

  _handleFileOpen(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data  = JSON.parse(e.target.result);
        const board = PCBBoard.deserialize(data);
        this.board  = board;
        this.renderer2d.setBoard(board);
        this.renderer3d.setBoard(board);
        this.ui = new PCBUIManager(this);
        this._bindTabs();
        this.ui.refreshFootprintList();
        this.ui.switchTab('props');
        this.ui.showNoSelection();
        this._flashStatus(`Loaded: ${board.name}`);
      } catch (err) {
        alert('Failed to open file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  _exportMenu() {
    // Show quick menu
    const el = document.getElementById('btn-export');
    const menu = document.createElement('div');
    menu.style.cssText = `
      position:absolute; background:#16213e; border:1px solid #2a4a7f;
      border-radius:4px; z-index:500; padding:4px; min-width:160px;
      box-shadow:0 4px 16px rgba(0,0,0,0.5);
    `;
    const r = el.getBoundingClientRect();
    menu.style.left = r.left + 'px';
    menu.style.top  = (r.bottom + 4) + 'px';

    const items = [
      { label: 'Export .pcbpanel', action: () => this._saveFile() },
      { label: 'Export footprints (.fp)', action: () => this._exportFootprints() },
      { label: 'Export BOM (CSV)', action: () => this._exportBOM() },
      { label: 'Export netlist (CSV)', action: () => this._exportNetlist() }
    ];

    items.forEach(item => {
      const btn = document.createElement('button');
      btn.textContent = item.label;
      btn.style.cssText = `
        display:block; width:100%; background:none; border:none;
        color:#e0e0e0; padding:6px 10px; cursor:pointer; text-align:left;
        font-size:12px; border-radius:3px;
      `;
      btn.onmouseover = () => btn.style.background = '#0f3460';
      btn.onmouseleave = () => btn.style.background = 'none';
      btn.onclick = () => { item.action(); menu.remove(); };
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    const close = e => {
      if (!menu.contains(e.target) && e.target !== el) {
        menu.remove();
        document.removeEventListener('mousedown', close);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
  }

  _exportFootprints() {
    const data = JSON.stringify(this.board.exportFootprints(), null, 2);
    this._downloadText(data, 'custom_footprints.fp', 'application/json');
  }

  _importFootprints() {
    const inp = document.createElement('input');
    inp.type   = 'file';
    inp.accept = '.fp,.json';
    inp.onchange = () => {
      if (!inp.files[0]) return;
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          this.board.importFootprints(data);
          this.ui.refreshFootprintList();
          this._flashStatus(`Imported footprints`);
        } catch (err) {
          alert('Failed to import footprints: ' + err.message);
        }
      };
      reader.readAsText(inp.files[0]);
    };
    inp.click();
  }

  _exportBOM() {
    const lines = ['Qty,Module,Footprint,Pins'];
    for (const mod of this.board.modules.values()) {
      const fp = this.board.footprints.get(mod.footprintId);
      lines.push([1, mod.name, fp ? fp.name : mod.footprintId, mod.pins.length].join(','));
    }
    this._downloadText(lines.join('\n'), 'bom.csv', 'text/csv');
  }

  _exportNetlist() {
    const lines = ['Net,Module,Pin#,PinName,Col,Row'];
    for (const mod of this.board.modules.values()) {
      for (const pin of mod.pins) {
        if (pin.net) {
          lines.push([pin.net, mod.name, pin.num, pin.name, pin.col, pin.row].join(','));
        }
      }
    }
    this._downloadText(lines.join('\n'), 'netlist.csv', 'text/csv');
  }

  _downloadText(text, filename, mime) {
    const blob = new Blob([text], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  _flashStatus(msg) {
    const sb = document.getElementById('sb-msg');
    if (sb) {
      sb.textContent = msg;
      setTimeout(() => { sb.textContent = ''; }, 3000);
    }
  }
}
