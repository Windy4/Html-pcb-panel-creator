/**
 * PCBBoard – data model for the panel PCB editor.
 *
 * Concepts:
 *  - Board: a grid of evenly-spaced through-holes (like perfboard / proto-board)
 *  - Hole:  individual pad/drill at a grid position (col, row)
 *  - Net:   named electrical net; holes on the same net are connected
 *  - Trace: copper path between two ADJACENT holes on the same layer
 *  - Module: a placed footprint instance with named pins
 *  - Footprint: template defining pin layout (relative col/row offsets)
 */
class PCBBoard {
  constructor(cfg = {}) {
    this.name    = cfg.name    || 'Untitled Board';
    this.cols    = cfg.cols    || 30;
    this.rows    = cfg.rows    || 20;
    this.spacing = cfg.spacing || 2.54;   // mm (0.1" standard)
    this.drillDia = cfg.drillDia || 1.0;  // mm
    this.padDia   = cfg.padDia  || 1.8;   // mm

    this.holes      = new Map(); // id → Hole
    this.modules    = new Map(); // id → Module
    this.footprints = new Map(); // id → Footprint
    this.nets       = new Map(); // name → Net
    this.traces     = [];        // [Trace]

    this._nextId = 1;

    // Init grid
    this._initGrid();
    // Load built-in footprints
    if (typeof BUILTIN_FOOTPRINTS !== 'undefined') {
      BUILTIN_FOOTPRINTS.forEach(fp => this.footprints.set(fp.id, fp));
    }
  }

  // ── helpers ────────────────────────────────────────────────
  _genId(prefix) { return `${prefix}${this._nextId++}`; }

  _initGrid() {
    this.holes.clear();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const h = this._makeHole(c, r);
        this.holes.set(h.id, h);
      }
    }
  }

  _makeHole(col, row) {
    return {
      id: `h_${col}_${row}`,
      col, row,
      net: null,
      moduleId: null,
      pinIndex: null  // index into module.pins[]
    };
  }

  holeId(col, row) { return `h_${col}_${row}`; }
  getHole(col, row) { return this.holes.get(this.holeId(col, row)); }
  getHoleById(id)   { return this.holes.get(id); }

  isAdjacent(h1, h2) {
    return Math.abs(h1.col - h2.col) + Math.abs(h1.row - h2.row) === 1;
  }

  adjacentHoles(col, row) {
    return [[-1,0],[1,0],[0,-1],[0,1]]
      .map(([dc,dr]) => this.getHole(col+dc, row+dr))
      .filter(Boolean);
  }

  // ── Board resize ───────────────────────────────────────────
  resize(cols, rows) {
    const oldCols = this.cols;
    const oldRows = this.rows;
    this.cols = cols;
    this.rows = rows;

    // Remove out-of-bounds holes
    for (const [id, h] of this.holes) {
      if (h.col >= cols || h.row >= rows) this.holes.delete(id);
    }

    // Add new holes
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = this.holeId(c, r);
        if (!this.holes.has(id)) {
          this.holes.set(id, this._makeHole(c, r));
        }
      }
    }

    // Remove out-of-bounds traces
    this.traces = this.traces.filter(t =>
      this.holes.has(t.from) && this.holes.has(t.to)
    );
  }

  // ── Net management ─────────────────────────────────────────
  addNet(name, color) {
    if (this.nets.has(name)) return this.nets.get(name);
    const net = { name, color: color || this._randomNetColor() };
    this.nets.set(name, net);
    return net;
  }

  removeNet(name) {
    // Clear holes using this net
    for (const h of this.holes.values()) {
      if (h.net === name) h.net = null;
    }
    // Clear module pins
    for (const m of this.modules.values()) {
      for (const p of m.pins) {
        if (p.net === name) p.net = null;
      }
    }
    // Remove traces on this net
    this.traces = this.traces.filter(t => t.net !== name);
    this.nets.delete(name);
  }

  renameNet(oldName, newName) {
    if (oldName === newName) return;
    if (this.nets.has(newName)) return false;
    const net = this.nets.get(oldName);
    if (!net) return false;
    net.name = newName;
    this.nets.set(newName, net);
    this.nets.delete(oldName);
    for (const h of this.holes.values()) { if (h.net === oldName) h.net = newName; }
    for (const m of this.modules.values()) {
      for (const p of m.pins) { if (p.net === oldName) p.net = newName; }
    }
    for (const t of this.traces) { if (t.net === oldName) t.net = newName; }
    return true;
  }

  assignHoleNet(holeId, netName) {
    const h = this.holes.get(holeId);
    if (!h) return;
    h.net = netName || null;
    // If hole belongs to a module pin, sync pin net too
    if (h.moduleId != null) {
      const mod = this.modules.get(h.moduleId);
      if (mod) {
        const pin = mod.pins[h.pinIndex];
        if (pin) pin.net = h.net;
      }
    }
  }

  _randomNetColor() {
    const palette = [
      '#e94560','#53d8fb','#ffe066','#66ff99','#ff9966',
      '#cc66ff','#66ccff','#ff6699','#99ff66','#ffcc33'
    ];
    return palette[this.nets.size % palette.length];
  }

  // ── Trace management ───────────────────────────────────────
  /**
   * Route a multi-step path between two holes that share the same row OR column.
   * Automatically inserts a trace segment between every consecutive pair of holes
   * along the straight line. Returns the array of created traces, or null if the
   * holes are not H/V aligned.
   */
  addTracePath(fromId, toId, layer, netName) {
    const h1 = this.holes.get(fromId);
    const h2 = this.holes.get(toId);
    if (!h1 || !h2 || fromId === toId) return null;

    const sameRow = h1.row === h2.row;
    const sameCol = h1.col === h2.col;
    if (!sameRow && !sameCol) return null; // must be strictly H or V

    const created = [];
    let curId = fromId;
    const dc = sameRow ? Math.sign(h2.col - h1.col) : 0;
    const dr = sameCol ? Math.sign(h2.row - h1.row) : 0;

    while (curId !== toId) {
      const cur = this.holes.get(curId);
      const nextId = this.holeId(cur.col + dc, cur.row + dr);
      const t = this.addTrace(curId, nextId, layer, netName);
      if (t) created.push(t);
      curId = nextId;
    }
    return created;
  }

  addTrace(fromId, toId, layer, netName) {
    const h1 = this.holes.get(fromId);
    const h2 = this.holes.get(toId);
    if (!h1 || !h2) return null;
    if (!this.isAdjacent(h1, h2)) return null; // single-step adjacency guard
    if (fromId === toId) return null;

    // Check for duplicate
    const dup = this.traces.find(t =>
      (t.from === fromId && t.to === toId && t.layer === layer) ||
      (t.from === toId   && t.to === fromId && t.layer === layer)
    );
    if (dup) return dup;

    const trace = {
      id: this._genId('t'),
      from: fromId,
      to: toId,
      layer,
      net: netName || null
    };
    this.traces.push(trace);

    // Propagate net to both holes (also ensures net is registered)
    if (netName) {
      this.addNet(netName);
      this.assignHoleNet(fromId, netName);
      this.assignHoleNet(toId, netName);
    }

    return trace;
  }

  removeTrace(traceId) {
    const idx = this.traces.findIndex(t => t.id === traceId);
    if (idx >= 0) this.traces.splice(idx, 1);
  }

  getTraceAt(fromId, toId, layer) {
    return this.traces.find(t =>
      t.layer === layer &&
      ((t.from === fromId && t.to === toId) ||
       (t.from === toId   && t.to === fromId))
    );
  }

  // ── Module management ──────────────────────────────────────
  addModule(footprintId, col, row, name) {
    const fp = this.footprints.get(footprintId);
    if (!fp) return null;

    const modId = this._genId('m');
    const mod = {
      id:          modId,
      name:        name || `${fp.name} #${this._nextId - 1}`,
      footprintId,
      col, row,
      pins: fp.pins.map(fpp => ({
        num:    fpp.num,
        name:   fpp.name,
        relCol: fpp.relCol,
        relRow: fpp.relRow,
        col:    col + fpp.relCol,
        row:    row + fpp.relRow,
        net:    null
      }))
    };

    this.modules.set(modId, mod);
    this._assignModuleHoles(mod, true);
    return mod;
  }

  _assignModuleHoles(mod, set) {
    mod.pins.forEach((pin, idx) => {
      const h = this.getHole(pin.col, pin.row);
      if (!h) return;
      if (set) {
        h.moduleId  = mod.id;
        h.pinIndex  = idx;
        if (pin.net) h.net = pin.net;
      } else {
        if (h.moduleId === mod.id) {
          h.moduleId = null;
          h.pinIndex = null;
        }
      }
    });
  }

  moveModule(modId, newCol, newRow) {
    const mod = this.modules.get(modId);
    if (!mod) return false;

    // Clear old holes
    this._assignModuleHoles(mod, false);

    // Update positions
    mod.col = newCol;
    mod.row = newRow;
    mod.pins.forEach(pin => {
      pin.col = newCol + pin.relCol;
      pin.row = newRow + pin.relRow;
    });

    // Assign new holes
    this._assignModuleHoles(mod, true);
    return true;
  }

  removeModule(modId) {
    const mod = this.modules.get(modId);
    if (!mod) return;
    this._assignModuleHoles(mod, false);
    this.modules.delete(modId);
  }

  renameModule(modId, newName) {
    const mod = this.modules.get(modId);
    if (mod) mod.name = newName;
  }

  setModulePinNet(modId, pinIdx, netName) {
    const mod = this.modules.get(modId);
    if (!mod) return;
    const pin = mod.pins[pinIdx];
    if (!pin) return;
    if (netName) this.addNet(netName);
    pin.net = netName;
    const h = this.getHole(pin.col, pin.row);
    if (h) h.net = netName;
  }

  // ── Footprint management ───────────────────────────────────
  addFootprint(fp) {
    this.footprints.set(fp.id, fp);
    return fp;
  }

  removeFootprint(id) {
    this.footprints.delete(id);
  }

  // ── Connection table data ──────────────────────────────────
  /**
   * Returns data suitable for rendering the connection table.
   * Result: { modules: [Module], rows: [{net, cells: [pinLabel|null]}] }
   */
  connectionTable() {
    const modules = Array.from(this.modules.values());
    const rows = [];

    for (const [netName] of this.nets) {
      const cells = modules.map(mod => {
        // Find pins on this net
        const pins = mod.pins.filter(p => p.net === netName);
        if (pins.length === 0) return null;
        return pins.map(p => `Pin ${p.num} (${p.name})`).join(', ');
      });
      // Only include row if at least 2 modules have a pin on this net
      const filled = cells.filter(Boolean).length;
      if (filled >= 1) {
        rows.push({ net: netName, cells });
      }
    }

    // Also include holes with nets not tied to modules
    const standaloneNets = new Set();
    for (const h of this.holes.values()) {
      if (h.net && !h.moduleId) standaloneNets.add(h.net);
    }
    for (const netName of standaloneNets) {
      if (!rows.find(r => r.net === netName)) {
        rows.push({ net: netName, cells: modules.map(() => null) });
      }
    }

    return { modules, rows };
  }

  // ── Serialization ──────────────────────────────────────────
  serialize() {
    // Only persist holes that have useful data
    const holeData = [];
    for (const h of this.holes.values()) {
      if (h.net || h.moduleId != null) {
        holeData.push({ id: h.id, col: h.col, row: h.row,
                        net: h.net, moduleId: h.moduleId, pinIndex: h.pinIndex });
      }
    }

    return {
      format:  'pcbpanel',
      version: '1.1',
      board: {
        name:     this.name,
        cols:     this.cols,
        rows:     this.rows,
        spacing:  this.spacing,
        drillDia: this.drillDia,
        padDia:   this.padDia
      },
      holes:      holeData,
      modules:    Array.from(this.modules.values()),
      footprints: Array.from(this.footprints.values())
                      .filter(fp => !BUILTIN_FOOTPRINTS.find(b => b.id === fp.id)),
      nets:       Array.from(this.nets.values()),
      traces:     this.traces,
      _nextId:    this._nextId
    };
  }

  static deserialize(data) {
    if (!data || data.format !== 'pcbpanel') throw new Error('Invalid file format');

    const b = data.board;
    const board = new PCBBoard({
      name: b.name, cols: b.cols, rows: b.rows,
      spacing: b.spacing, drillDia: b.drillDia, padDia: b.padDia
    });

    if (data._nextId) board._nextId = data._nextId;

    // Custom footprints (not built-ins)
    (data.footprints || []).forEach(fp => board.footprints.set(fp.id, fp));

    // Nets
    (data.nets || []).forEach(n => board.nets.set(n.name, n));

    // Holes (overlay on existing grid)
    (data.holes || []).forEach(hd => {
      const h = board.holes.get(hd.id);
      if (h) {
        h.net      = hd.net;
        h.moduleId = hd.moduleId;
        h.pinIndex = hd.pinIndex;
      }
    });

    // Modules
    (data.modules || []).forEach(m => board.modules.set(m.id, m));

    // Traces
    board.traces = data.traces || [];

    return board;
  }

  /** Export just footprint definitions as a .fp file */
  exportFootprints(ids) {
    const fps = ids
      ? ids.map(id => this.footprints.get(id)).filter(Boolean)
      : Array.from(this.footprints.values())
             .filter(fp => !BUILTIN_FOOTPRINTS.find(b => b.id === fp.id));
    return {
      format: 'pcbpanel-footprints',
      version: '1.0',
      footprints: fps
    };
  }

  /** Import footprint definitions from a .fp file data object */
  importFootprints(data) {
    if (!data || data.format !== 'pcbpanel-footprints')
      throw new Error('Invalid footprint file');
    (data.footprints || []).forEach(fp => this.footprints.set(fp.id, fp));
  }
}
