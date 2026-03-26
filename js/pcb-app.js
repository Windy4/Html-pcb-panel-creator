/**
 * PCBApp – main application controller.
 */
class PCBApp {
  constructor() {
    this.board      = new PCBBoard();
    this.renderer2d = null;
    this.renderer3d = null;
    this.ui         = new PCBUIManager(this);

    // Tool state
    this.activeTool  = 'select';
    this.activeLayer = 'top';
    this._placingFpId = null;

    // Selection
    this._selectedHole  = null;
    this._selectedMod   = null;
    this._selectedTrace = null;

    // Undo / Redo stacks (JSON snapshots)
    this._undoStack = [];
    this._redoStack = [];
    this._MAX_HISTORY = 60;
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

    this.ui.refreshFootprintList();
    this.ui.switchTab('props');
    this.ui.showNoSelection();
    this._updateToolHighlight();
    this._updateUndoButtons();

    document.getElementById('sb-net').textContent  = '—';
    document.getElementById('sb-tool').textContent = this.activeTool;
  }

  // ── Toolbar ────────────────────────────────────────────────
  _bindToolbar() {
    document.getElementById('btn-new')?.addEventListener('click', () => this._newBoard());
    document.getElementById('btn-open')?.addEventListener('click', () => this._openFile());
    document.getElementById('btn-save')?.addEventListener('click', () => this._saveFile());
    document.getElementById('btn-export')?.addEventListener('click', () => this._exportMenu());
    document.getElementById('btn-import-fp')?.addEventListener('click', () => this._importFootprints());
    document.getElementById('btn-board-cfg')?.addEventListener('click', () => this.ui.showBoardSettings());
    document.getElementById('btn-3d')?.addEventListener('click', () => this._toggle3D());
    document.getElementById('btn-fit')?.addEventListener('click', () => this.renderer2d.fitBoard());

    document.getElementById('btn-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => this.redo());
  }

  _bindLayerControls() {
    document.querySelectorAll('.layer-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.activeLayer = chip.dataset.layer;
        this.renderer2d.activeLayer = this.activeLayer;
        document.querySelectorAll('.layer-chip').forEach(c =>
          c.classList.toggle('active', c.dataset.layer === this.activeLayer));
        document.getElementById('sb-layer').textContent = this.activeLayer.toUpperCase();
        document.getElementById('layer-top-btn').classList.toggle('active', this.activeLayer === 'top');
        document.getElementById('layer-bot-btn').classList.toggle('active', this.activeLayer === 'bottom');
      });
    });

    document.getElementById('vbtn-fit')?.addEventListener('click', () => this.renderer2d.fitBoard());
    document.getElementById('vbtn-grid')?.addEventListener('click', () => {
      this.renderer2d.showGrid = !this.renderer2d.showGrid;
      document.getElementById('vbtn-grid')?.classList.toggle('active', this.renderer2d.showGrid);
      this.renderer2d.draw();
    });
    document.getElementById('vbtn-nets')?.addEventListener('click', () => {
      this.renderer2d.showNets = !this.renderer2d.showNets;
      document.getElementById('vbtn-nets')?.classList.toggle('active', this.renderer2d.showNets);
      this.renderer2d.draw();
    });
  }

  _bindLeftPanel() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setTool(btn.dataset.tool));
    });
    document.getElementById('fp-search')?.addEventListener('input', e => {
      this.ui.refreshFootprintList(e.target.value);
    });
    document.getElementById('fp-new')?.addEventListener('click', () => this.ui.showNewFootprint());
    document.getElementById('fp-import')?.addEventListener('click', () => this._importFootprints());
    document.getElementById('fp-export')?.addEventListener('click', () => this._exportFootprints());
  }

  _bindTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.ui.switchTab(btn.dataset.tab));
    });
    document.getElementById('net-add-btn')?.addEventListener('click', () => {
      const inp  = document.getElementById('net-name-inp');
      const name = inp.value.trim();
      if (name) {
        this._saveSnapshot();
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
    canvas.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    canvas.addEventListener('drop', e => {
      e.preventDefault();
      const fpId = e.dataTransfer.getData('fpId');
      if (fpId) {
        const r   = canvas.getBoundingClientRect();
        const g   = this.renderer2d.screenToGrid(e.clientX - r.left, e.clientY - r.top);
        const col = Math.max(0, Math.min(this.board.cols - 2, g.col));
        const row = Math.max(0, Math.min(this.board.rows - 2, g.row));
        this._saveSnapshot();
        const mod = this.board.addModule(fpId, col, row);
        if (mod) {
          this.onSelectionChange({ type: 'module', target: mod }, true);
          this.renderer2d.draw();
          this.ui.refreshConnectionTable();
          this.ui.refreshNetList();
        }
      }
      if (e.dataTransfer.files.length > 0) this._handleFileOpen(e.dataTransfer.files[0]);
    });
  }

  _bindKeyboard() {
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
        e.preventDefault(); this.redo(); return;
      }

      switch (e.key) {
        case 'Escape':   this._cancelAction(); break;
        case 'Delete':
        case 'Backspace': this._deleteSelected(); break;
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

  // ── Undo / Redo ────────────────────────────────────────────
  _saveSnapshot() {
    this._undoStack.push(JSON.stringify(this.board.serialize()));
    if (this._undoStack.length > this._MAX_HISTORY)
      this._undoStack.shift();
    this._redoStack = [];
    this._updateUndoButtons();
  }

  undo() {
    if (this._undoStack.length === 0) return;
    this._redoStack.push(JSON.stringify(this.board.serialize()));
    this._restoreSnapshot(this._undoStack.pop());
    this._updateUndoButtons();
    this._flashStatus('Undo');
  }

  redo() {
    if (this._redoStack.length === 0) return;
    this._undoStack.push(JSON.stringify(this.board.serialize()));
    this._restoreSnapshot(this._redoStack.pop());
    this._updateUndoButtons();
    this._flashStatus('Redo');
  }

  _restoreSnapshot(json) {
    try {
      const board = PCBBoard.deserialize(JSON.parse(json));
      this.board  = board;
      this.renderer2d.updateBoard(board);  // no fit — keep current view
      this.renderer3d.setBoard(board);
      if (this._3dVisible) this.renderer3d.rebuild();
      this.onSelectionChange(null);        // clear selection, don't switch tab
      this.ui.refreshNetList();
      this.ui.refreshConnectionTable();
    } catch(err) {
      console.error('Restore snapshot failed:', err);
    }
  }

  _updateUndoButtons() {
    const ubtn = document.getElementById('btn-undo');
    const rbtn = document.getElementById('btn-redo');
    if (ubtn) ubtn.disabled = this._undoStack.length === 0;
    if (rbtn) rbtn.disabled = this._redoStack.length === 0;
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
    document.querySelectorAll('.tool-btn').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.tool === this.activeTool));
  }

  startPlaceMode(fpId) {
    this._placingFpId = fpId;
    this.setTool('place');
    const fp = this.board.footprints.get(fpId);
    document.getElementById('sb-tool').textContent = `place: ${fp ? fp.name : fpId}`;
  }

  // ── Canvas events ──────────────────────────────────────────
  handleCanvasClick(x, y, e) {
    const r2d = this.renderer2d;

    switch (this.activeTool) {
      case 'select': {
        const mod  = r2d.hitModule(x, y);
        const hole = r2d.hitHole(x, y);
        if (mod) {
          r2d.selectedIds.clear();
          this.onSelectionChange({ type: 'module', target: mod }, true);
          r2d.startDrag('module', mod.id, x, y);
        } else if (hole) {
          r2d.selectedIds.clear();
          r2d.selectedIds.add(hole.id);
          this.onSelectionChange({ type: 'hole', target: hole }, true);
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
          r2d._routeFrom = hole.id;
          r2d.selectedIds.clear();
          r2d.selectedIds.add(hole.id);
        } else {
          if (r2d._routeFrom !== hole.id) {
            this._saveSnapshot();
            const netName = this._pickRouteNet(r2d._routeFrom, hole.id);
            const traces  = this.board.addTracePath(r2d._routeFrom, hole.id, this.activeLayer, netName);
            if (!traces) this._flashStatus('Route must be horizontal or vertical');
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
        const g   = r2d.screenToGrid(x, y);
        const col = Math.max(0, Math.min(this.board.cols - 2, g.col));
        const row = Math.max(0, Math.min(this.board.rows - 2, g.row));
        this._saveSnapshot();
        const mod = this.board.addModule(this._placingFpId, col, row);
        if (mod) {
          this.onSelectionChange({ type: 'module', target: mod }, true);
          r2d.draw();
          this.ui.refreshConnectionTable();
          this.ui.refreshNetList();
        }
        break;
      }

      // Erase single-click is handled by the renderer's mousedown + handleEraseAt
    }
  }

  /** Called by renderer during erase-drag (and on first mousedown). No snapshot here —
   *  caller saves snapshot once before the drag starts. */
  handleEraseAt(x, y) {
    const r2d = this.renderer2d;
    // Traces first (most common erase target)
    const trace = r2d.hitTrace(x, y);
    if (trace) {
      this.board.removeTrace(trace.id);
      r2d.draw();
      this.ui.refreshConnectionTable();
      return;
    }
    // Hole net (clear colour / assignment, not the hole itself)
    const hole = r2d.hitHole(x, y);
    if (hole && (hole.net || hole.moduleId == null)) {
      if (hole.moduleId != null) return; // don't strip module pins via drag
      if (hole.net) {
        this.board.assignHoleNet(hole.id, null);
        r2d.draw();
      }
    }
  }

  /** Called by renderer after a module drag finishes. */
  handleCanvasDragEnd(x, y) {
    const r2d = this.renderer2d;
    if (!r2d._dragging) return;

    if (r2d._dragType === 'module') {
      const g   = r2d.screenToGrid(x, y);
      const col = Math.max(0, Math.min(this.board.cols - 1, g.col - r2d._dragOffset.col));
      const row = Math.max(0, Math.min(this.board.rows - 1, g.row - r2d._dragOffset.row));
      this._saveSnapshot();
      this.board.moveModule(r2d._dragTarget, col, row);
      const mod = this.board.modules.get(r2d._dragTarget);
      if (mod) {
        this.ui.showModuleProps(mod);
        this.ui.refreshConnectionTable();
        this.ui.refreshNetList();
      }
    }

    r2d._dragging   = false;
    r2d._dragType   = null;
    r2d._dragTarget = null;
    r2d.draw();
    if (this._3dVisible) this.renderer3d.rebuild();
  }

  handleCanvasDblClick(x, y) {
    const mod = this.renderer2d.hitModule(x, y);
    if (mod) {
      this.onSelectionChange({ type: 'module', target: mod }, true);
    }
  }

  // ── Selection ──────────────────────────────────────────────
  /**
   * @param {object|null} sel  - { type: 'hole'|'module'|'trace', target }
   * @param {boolean} switchToProps - whether to force-switch the right panel to Props tab
   */
  onSelectionChange(sel, switchToProps = false) {
    this._selectedHole  = null;
    this._selectedMod   = null;
    this._selectedTrace = null;

    if (!sel) {
      this.ui.showNoSelection();
    } else if (sel.type === 'hole') {
      this._selectedHole = sel.target;
      this.ui.showHoleProps(sel.target);
    } else if (sel.type === 'module') {
      this._selectedMod = sel.target;
      this.ui.showModuleProps(sel.target);
    } else if (sel.type === 'trace') {
      this._selectedTrace = sel.target;
      this.ui.showTraceProps(sel.target);
    }

    if (switchToProps) this.ui.switchTab('props');
  }

  // ── Routing helpers ────────────────────────────────────────
  _pickRouteNet(fromId, toId) {
    const h1 = this.board.getHoleById(fromId);
    const h2 = this.board.getHoleById(toId);
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
    this._saveSnapshot();
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
    document.getElementById('pcb-canvas').style.display  = this._3dVisible ? 'none'  : 'block';
    document.getElementById('canvas-3d').style.display   = this._3dVisible ? 'block' : 'none';
    document.getElementById('btn-3d')?.classList.toggle('active', this._3dVisible);
    const hint = document.getElementById('hint-3d');
    if (hint) hint.style.display = this._3dVisible ? 'block' : 'none';

    if (this._3dVisible) {
      this.renderer3d.init();
      this.renderer3d.rebuild();
    } else {
      this.renderer3d.stop();
      this.renderer2d.draw();
    }
  }

  // ── File operations ────────────────────────────────────────
  _newBoard() {
    if (!confirm('Start a new board? Unsaved changes will be lost.')) return;
    this._undoStack = [];
    this._redoStack = [];
    this.board = new PCBBoard();
    this.renderer2d.setBoard(this.board);
    this.renderer3d.setBoard(this.board);
    this.ui.refreshFootprintList();
    this.ui.switchTab('props');
    this.ui.showNoSelection();
    this._updateUndoButtons();
    this._3dVisible = false;
    document.getElementById('pcb-canvas').style.display = 'block';
    document.getElementById('canvas-3d').style.display  = 'none';
    document.getElementById('btn-3d')?.classList.remove('active');
  }

  _saveFile() {
    const data = JSON.stringify(this.board.serialize(), null, 2);
    this._downloadText(data, (this.board.name || 'board').replace(/\s+/g,'_') + '.pcbpanel', 'application/json');
  }

  _openFile() {
    const inp    = document.createElement('input');
    inp.type     = 'file';
    inp.accept   = '.pcbpanel,.json';
    inp.onchange = () => { if (inp.files[0]) this._handleFileOpen(inp.files[0]); };
    inp.click();
  }

  _handleFileOpen(file) {
    const reader  = new FileReader();
    reader.onload = e => {
      try {
        const board = PCBBoard.deserialize(JSON.parse(e.target.result));
        this._undoStack = [];
        this._redoStack = [];
        this.board      = board;
        this.renderer2d.setBoard(board);
        this.renderer3d.setBoard(board);
        // Do NOT re-call _bindTabs() — handlers reference `this` dynamically
        this.ui.refreshFootprintList();
        this.ui.switchTab('props');
        this.ui.showNoSelection();
        this._updateUndoButtons();
        this._flashStatus(`Loaded: ${board.name}`);
      } catch(err) { alert('Failed to open file: ' + err.message); }
    };
    reader.readAsText(file);
  }

  _exportMenu() {
    const el   = document.getElementById('btn-export');
    const menu = document.createElement('div');
    menu.style.cssText = `position:absolute;background:#16213e;border:1px solid #2a4a7f;
      border-radius:4px;z-index:500;padding:4px;min-width:160px;
      box-shadow:0 4px 16px rgba(0,0,0,0.5);`;
    const r = el.getBoundingClientRect();
    menu.style.left = r.left + 'px';
    menu.style.top  = (r.bottom + 4) + 'px';

    const items = [
      { label: 'Export .pcbpanel',         action: () => this._saveFile() },
      { label: 'Export footprints (.fp)',   action: () => this._exportFootprints() },
      { label: 'Export BOM (CSV)',          action: () => this._exportBOM() },
      { label: 'Export netlist (CSV)',      action: () => this._exportNetlist() }
    ];
    items.forEach(item => {
      const btn = document.createElement('button');
      btn.textContent  = item.label;
      btn.style.cssText = `display:block;width:100%;background:none;border:none;
        color:#e0e0e0;padding:6px 10px;cursor:pointer;text-align:left;
        font-size:12px;border-radius:3px;`;
      btn.onmouseover  = () => btn.style.background = '#0f3460';
      btn.onmouseleave = () => btn.style.background = 'none';
      btn.onclick      = () => { item.action(); menu.remove(); };
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    const close = e => {
      if (!menu.contains(e.target) && e.target !== el) {
        menu.remove(); document.removeEventListener('mousedown', close);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', close), 0);
  }

  _exportFootprints() {
    this._downloadText(JSON.stringify(this.board.exportFootprints(), null, 2),
      'custom_footprints.fp', 'application/json');
  }

  _importFootprints() {
    const inp    = document.createElement('input');
    inp.type     = 'file';
    inp.accept   = '.fp,.json';
    inp.onchange = () => {
      if (!inp.files[0]) return;
      const reader  = new FileReader();
      reader.onload = e => {
        try {
          this.board.importFootprints(JSON.parse(e.target.result));
          this.ui.refreshFootprintList();
          this._flashStatus('Imported footprints');
        } catch(err) { alert('Failed to import footprints: ' + err.message); }
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
    for (const mod of this.board.modules.values())
      for (const pin of mod.pins)
        if (pin.net) lines.push([pin.net, mod.name, pin.num, pin.name, pin.col, pin.row].join(','));
    this._downloadText(lines.join('\n'), 'netlist.csv', 'text/csv');
  }

  _downloadText(text, filename, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  }

  _flashStatus(msg) {
    const sb = document.getElementById('sb-msg');
    if (sb) { sb.textContent = msg; setTimeout(() => { sb.textContent = ''; }, 3000); }
  }
}
