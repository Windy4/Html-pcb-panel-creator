/**
 * PCBRenderer2D – canvas-based 2D renderer for the PCB panel editor.
 *
 * Handles:
 *  - Drawing grid holes, traces, modules, net highlights
 *  - Zoom / pan (mouse wheel + middle-drag)
 *  - Hit-testing for interaction
 */
class PCBRenderer2D {
  constructor(canvas, board, app) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.board   = board;
    this.app     = app; // PCBApp reference

    // View transform
    this.scale   = 16;   // px per grid unit
    this.offsetX = 40;
    this.offsetY = 40;

    // Interaction state
    this.isPanning    = false;
    this.panStart     = null;
    this.panOffsetStart = null;

    // Visual state
    this.selectedIds  = new Set();   // selected hole ids
    this.highlightNet = null;        // net name to highlight
    this.activeLayer  = 'top';       // 'top' | 'bottom'
    this.showGrid     = true;
    this.showNets     = true;

    // Drag state
    this._dragging    = false;
    this._dragType    = null;  // 'hole' | 'module'
    this._dragTarget  = null;
    this._dragStart   = null;
    this._dragOffset  = {x:0, y:0};

    // Erase-drag state
    this._eraseDragging = false;

    // Route state
    this._routeFrom   = null;

    // Tooltip
    this._tooltip     = null;
    this._tooltipEl   = document.getElementById('tooltip');

    this._bindEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ── Resize ─────────────────────────────────────────────────
  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width  = rect.width;
    this.canvas.height = rect.height;
    this.draw();
  }

  // ── Transform helpers ──────────────────────────────────────
  worldToScreen(col, row) {
    return {
      x: col * this.scale + this.offsetX,
      y: row * this.scale + this.offsetY
    };
  }

  screenToWorld(x, y) {
    return {
      col: (x - this.offsetX) / this.scale,
      row: (y - this.offsetY) / this.scale
    };
  }

  screenToGrid(x, y) {
    const w = this.screenToWorld(x, y);
    return {
      col: Math.round(w.col),
      row: Math.round(w.row)
    };
  }

  // ── Main draw ──────────────────────────────────────────────
  draw() {
    const { ctx, canvas, board } = this;
    const W = canvas.width, H = canvas.height;

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    // Board area bg
    const tl = this.worldToScreen(0, 0);
    const br = this.worldToScreen(board.cols - 1, board.rows - 1);
    const pad = this.scale * 0.5;
    ctx.fillStyle = '#0a1a0a';
    ctx.fillRect(tl.x - pad, tl.y - pad,
                 (br.x - tl.x) + pad*2, (br.y - tl.y) + pad*2);

    // Board border
    ctx.strokeStyle = '#1e5c1e';
    ctx.lineWidth = 2;
    ctx.strokeRect(tl.x - pad, tl.y - pad,
                   (br.x - tl.x) + pad*2, (br.y - tl.y) + pad*2);

    // Grid dots
    if (this.showGrid && this.scale > 5) {
      this._drawGrid();
    }

    // Traces – bottom layer first
    this._drawTraces('bottom');
    this._drawTraces('top');

    // Module backgrounds
    this._drawModules();

    // Holes
    this._drawHoles();

    // Route preview
    if (this._routeFrom) this._drawRoutePreview();

    // Drag ghost
    if (this._dragging && this._dragType === 'module') {
      this._drawModuleDragGhost();
    }

    // Rulers / coordinate labels
    if (this.scale > 10) this._drawRuler();

    // Zoom info
    document.getElementById('zoom-info').textContent =
      `${Math.round(this.scale * 100 / 16)}%`;
  }

  _drawGrid() {
    const { ctx, board } = this;
    ctx.fillStyle = '#1e3a5f';
    const r = Math.max(1, this.scale * 0.06);
    for (let row = 0; row < board.rows; row++) {
      for (let col = 0; col < board.cols; col++) {
        const p = this.worldToScreen(col, row);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawTraces(layer) {
    const { ctx, board } = this;
    const lw = Math.max(1.5, this.scale * 0.22);

    for (const t of board.traces) {
      if (t.layer !== layer) continue;
      const h1 = board.getHoleById(t.from);
      const h2 = board.getHoleById(t.to);
      if (!h1 || !h2) continue;

      const p1 = this.worldToScreen(h1.col, h1.row);
      const p2 = this.worldToScreen(h2.col, h2.row);

      const net = board.nets.get(t.net);
      let color = layer === 'top' ? '#cc3333' : '#3366cc';
      if (net) color = net.color;

      // Dim un-highlighted traces
      const alpha = (this.highlightNet && t.net !== this.highlightNet) ? 0.2 : 1.0;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';

      // Offset bottom layer slightly
      const offY = layer === 'bottom' ? 0.5 : 0;

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y + offY);
      ctx.lineTo(p2.x, p2.y + offY);
      ctx.stroke();

      // Layer indicator dash on bottom
      if (layer === 'bottom') {
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y + offY);
        ctx.lineTo(p2.x, p2.y + offY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();
    }
  }

  _drawModules() {
    const { ctx, board } = this;
    for (const mod of board.modules.values()) {
      const fp = board.footprints.get(mod.footprintId);
      if (!fp) continue;

      // Bounding box of all pins
      let minC = Infinity, maxC = -Infinity;
      let minR = Infinity, maxR = -Infinity;
      for (const pin of mod.pins) {
        minC = Math.min(minC, pin.col); maxC = Math.max(maxC, pin.col);
        minR = Math.min(minR, pin.row); maxR = Math.max(maxR, pin.row);
      }

      const tl = this.worldToScreen(minC, minR);
      const br = this.worldToScreen(maxC, maxR);
      const pad = this.scale * 0.6;

      ctx.save();
      ctx.strokeStyle = '#53d8fb';
      ctx.lineWidth = 1.5;
      ctx.fillStyle = 'rgba(83,216,251,0.07)';
      ctx.setLineDash([4, 4]);

      const rx = tl.x - pad, ry = tl.y - pad;
      const rw = (br.x - tl.x) + pad * 2;
      const rh = (br.y - tl.y) + pad * 2;

      ctx.strokeRect(rx, ry, rw, rh);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.setLineDash([]);

      // Module name
      if (this.scale > 8) {
        ctx.fillStyle = '#53d8fb';
        ctx.font = `${Math.max(8, this.scale * 0.5)}px monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(mod.name, rx + 3, ry - 3);
      }
      ctx.restore();
    }
  }

  _drawHoles() {
    const { ctx, board } = this;
    const s = this.scale;
    const padR  = Math.max(2, s * 0.36);
    const drillR = Math.max(1, s * 0.2);

    for (const h of board.holes.values()) {
      const p = this.worldToScreen(h.col, h.row);

      // Net color
      const net = h.net ? board.nets.get(h.net) : null;
      const isSelected  = this.selectedIds.has(h.id);
      const isHighlight  = this.highlightNet && h.net === this.highlightNet;
      const dimmed       = this.highlightNet && !isHighlight;

      ctx.save();
      if (dimmed) ctx.globalAlpha = 0.25;

      // Copper annular ring
      ctx.beginPath();
      ctx.arc(p.x, p.y, padR, 0, Math.PI * 2);
      ctx.fillStyle = net ? net.color : '#c8a53e';
      ctx.fill();

      // Module pin indicator
      if (h.moduleId != null) {
        ctx.strokeStyle = '#53d8fb';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Drill hole
      ctx.beginPath();
      ctx.arc(p.x, p.y, drillR, 0, Math.PI * 2);
      ctx.fillStyle = '#0a1a0a';
      ctx.fill();

      // Selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, padR + 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffe066';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Highlight ring
      if (isHighlight) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, padR + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Pin label
      if (s > 18 && h.moduleId != null) {
        const mod = board.modules.get(h.moduleId);
        if (mod) {
          const pin = mod.pins[h.pinIndex];
          if (pin) {
            ctx.fillStyle = '#fff';
            ctx.font = `${Math.max(7, s * 0.35)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(pin.name.substring(0, 4), p.x, p.y - padR - 4);
          }
        }
      }

      ctx.restore();
    }
  }

  _drawRoutePreview() {
    if (!this._routeFrom || !this._mouseGrid) return;
    const { ctx, board } = this;
    const h1 = board.getHoleById(this._routeFrom);
    if (!h1) return;

    const g2  = this._mouseGrid;
    const sameRow = h1.row === g2.row;
    const sameCol = h1.col === g2.col;
    const valid   = sameRow || sameCol;

    // Snap preview end-point to the valid H/V axis when off-axis
    const snapCol = sameRow ? g2.col : (sameCol ? h1.col : g2.col);
    const snapRow = sameCol ? g2.row : (sameRow ? h1.row : g2.row);

    const p1 = this.worldToScreen(h1.col, h1.row);
    // If diagonal, show two segments: horizontal then vertical (L-shape hint)
    const pMid = this.worldToScreen(g2.col, h1.row); // corner for L-hint
    const p2   = this.worldToScreen(snapCol, snapRow);
    const pEnd = this.worldToScreen(g2.col, g2.row);

    ctx.save();
    ctx.lineWidth = Math.max(2, this.scale * 0.22);
    ctx.lineCap   = 'round';

    if (valid) {
      // Solid-ish preview along valid axis
      ctx.strokeStyle = this.activeLayer === 'top' ? '#ff8888' : '#8888ff';
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Dot at destination
      ctx.setLineDash([]);
      ctx.fillStyle = this.activeLayer === 'top' ? '#ff8888' : '#8888ff';
      ctx.beginPath();
      ctx.arc(p2.x, p2.y, Math.max(3, this.scale * 0.25), 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Diagonal – show L-shape ghost in red to indicate invalid
      ctx.strokeStyle = 'rgba(255,80,80,0.5)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(pMid.x, pMid.y);
      ctx.lineTo(pEnd.x, pEnd.y);
      ctx.stroke();

      // "Invalid" label near cursor
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,80,80,0.85)';
      ctx.font      = `${Math.max(9, this.scale * 0.45)}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText('H/V only', pEnd.x + 6, pEnd.y - 6);
    }

    ctx.restore();
  }

  _drawModuleDragGhost() {
    if (!this._dragTarget || !this._mouseGrid) return;
    const { ctx, board } = this;
    const mod = board.modules.get(this._dragTarget);
    if (!mod) return;
    const fp  = board.footprints.get(mod.footprintId);
    if (!fp) return;

    const dc = this._mouseGrid.col - this._dragOffset.col;
    const dr = this._mouseGrid.row - this._dragOffset.row;

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#ffe066';
    ctx.fillStyle = 'rgba(255,224,102,0.1)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    let minC = Infinity, maxC = -Infinity;
    let minR = Infinity, maxR = -Infinity;
    for (const fpp of fp.pins) {
      const c = dc + fpp.relCol, r = dr + fpp.relRow;
      minC = Math.min(minC, c); maxC = Math.max(maxC, c);
      minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    }

    const tl  = this.worldToScreen(minC, minR);
    const br  = this.worldToScreen(maxC, maxR);
    const pad = this.scale * 0.6;
    ctx.strokeRect(tl.x - pad, tl.y - pad,
                   br.x - tl.x + pad*2, br.y - tl.y + pad*2);
    ctx.fillRect(tl.x - pad, tl.y - pad,
                 br.x - tl.x + pad*2, br.y - tl.y + pad*2);

    // Ghost holes
    for (const fpp of fp.pins) {
      const p = this.worldToScreen(dc + fpp.relCol, dr + fpp.relRow);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, this.scale * 0.35), 0, Math.PI*2);
      ctx.strokeStyle = '#ffe066';
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawRuler() {
    // Simple col/row numbers on edges
    const { ctx, board } = this;
    ctx.save();
    ctx.fillStyle = '#3a5a7f';
    ctx.font = `${Math.max(8, Math.min(11, this.scale * 0.45))}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const step = this.scale < 20 ? 5 : 1;
    for (let c = 0; c < board.cols; c += step) {
      const p = this.worldToScreen(c, -1);
      ctx.fillText(c, p.x, p.y + this.scale * 0.3);
    }
    ctx.textAlign = 'right';
    for (let r = 0; r < board.rows; r += step) {
      const p = this.worldToScreen(-0.7, r);
      ctx.fillText(r, p.x, p.y);
    }
    ctx.restore();
  }

  // ── Hit testing ────────────────────────────────────────────
  hitHole(x, y) {
    const { board } = this;
    const g = this.screenToGrid(x, y);
    const col = Math.max(0, Math.min(board.cols - 1, g.col));
    const row = Math.max(0, Math.min(board.rows - 1, g.row));
    const h = board.getHole(col, row);
    if (!h) return null;
    // Check radius
    const p = this.worldToScreen(col, row);
    const dist = Math.hypot(x - p.x, y - p.y);
    if (dist <= Math.max(4, this.scale * 0.5)) return h;
    return null;
  }

  hitModule(x, y) {
    const { board } = this;
    for (const mod of board.modules.values()) {
      const fp = board.footprints.get(mod.footprintId);
      if (!fp) continue;
      let minC = Infinity, maxC = -Infinity;
      let minR = Infinity, maxR = -Infinity;
      for (const pin of mod.pins) {
        minC = Math.min(minC, pin.col); maxC = Math.max(maxC, pin.col);
        minR = Math.min(minR, pin.row); maxR = Math.max(maxR, pin.row);
      }
      const tl  = this.worldToScreen(minC, minR);
      const br  = this.worldToScreen(maxC, maxR);
      const pad = this.scale * 0.6;
      if (x >= tl.x - pad && x <= br.x + pad &&
          y >= tl.y - pad && y <= br.y + pad) {
        return mod;
      }
    }
    return null;
  }

  hitTrace(x, y) {
    const { board } = this;
    const threshold = Math.max(4, this.scale * 0.18);
    for (const t of board.traces) {
      const h1 = board.getHoleById(t.from);
      const h2 = board.getHoleById(t.to);
      if (!h1 || !h2) continue;
      const p1 = this.worldToScreen(h1.col, h1.row);
      const p2 = this.worldToScreen(h2.col, h2.row);
      if (this._distToSegment(x, y, p1.x, p1.y, p2.x, p2.y) < threshold) {
        return t;
      }
    }
    return null;
  }

  _distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx*dx + dy*dy;
    if (len2 === 0) return Math.hypot(px-x1, py-y1);
    const t = Math.max(0, Math.min(1, ((px-x1)*dx + (py-y1)*dy) / len2));
    return Math.hypot(px - (x1 + t*dx), py - (y1 + t*dy));
  }

  // ── Events ─────────────────────────────────────────────────
  _bindEvents() {
    const c = this.canvas;

    c.addEventListener('mousedown',   e => this._onMouseDown(e));
    c.addEventListener('mousemove',   e => this._onMouseMove(e));
    c.addEventListener('mouseup',     e => this._onMouseUp(e));
    c.addEventListener('wheel',       e => this._onWheel(e), { passive: false });
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('mouseleave',  () => this._onMouseLeave());
    c.addEventListener('dblclick',    e => this._onDblClick(e));
  }

  _clientPos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _onMouseDown(e) {
    const pos = this._clientPos(e);

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle / alt-left = pan
      this.isPanning     = true;
      this.panStart      = pos;
      this.panOffsetStart = { x: this.offsetX, y: this.offsetY };
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    if (e.button === 2) {
      // Right click = deselect / cancel route
      this._routeFrom = null;
      this.selectedIds.clear();
      this.app.onSelectionChange(null);
      this.draw();
      return;
    }

    if (e.button === 0) {
      if (this.app.activeTool === 'erase') {
        // Save snapshot once for the whole erase gesture, then start drag-erase
        this.app._saveSnapshot();
        this._eraseDragging = true;
        this.canvas.style.cursor = 'cell';
        this.app.handleEraseAt(pos.x, pos.y);
      } else {
        this.app.handleCanvasClick(pos.x, pos.y, e);
      }
    }
  }

  _onMouseMove(e) {
    const pos = this._clientPos(e);

    if (this.isPanning) {
      this.offsetX = this.panOffsetStart.x + (pos.x - this.panStart.x);
      this.offsetY = this.panOffsetStart.y + (pos.y - this.panStart.y);
      this.draw();
      return;
    }

    // Update mouse world pos for previews
    const g = this.screenToGrid(pos.x, pos.y);
    g.col = Math.max(0, Math.min(this.board.cols - 1, g.col));
    g.row = Math.max(0, Math.min(this.board.rows - 1, g.row));
    this._mouseGrid = g;

    // Update status bar
    const board = this.board;
    const mmX = (g.col * board.spacing).toFixed(2);
    const mmY = (g.row * board.spacing).toFixed(2);
    document.getElementById('sb-pos').textContent = `(${g.col},${g.row}) ${mmX}×${mmY}mm`;

    if (this._eraseDragging) {
      this.app.handleEraseAt(pos.x, pos.y);
    } else if (this._dragging) {
      this.app.handleCanvasDrag(pos.x, pos.y, e);
    }

    // Tooltip
    this._showTooltip(pos.x, pos.y);

    this.draw();
  }

  _onMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = 'crosshair';
      return;
    }

    if (this._eraseDragging) {
      this._eraseDragging = false;
      this.canvas.style.cursor = 'crosshair';
      this.app.ui.refreshNetList();
      return;
    }

    if (this._dragging) {
      const pos = this._clientPos(e);
      this.app.handleCanvasDragEnd(pos.x, pos.y, e);
      this._dragging   = false;
      this._dragType   = null;
      this._dragTarget = null;
    }
  }

  _onMouseLeave() {
    this.isPanning      = false;
    this._eraseDragging = false;
    this._mouseGrid     = null;
    this._hideTooltip();
    this.canvas.style.cursor = 'crosshair';
    this.draw();
  }

  _onDblClick(e) {
    const pos = this._clientPos(e);
    this.app.handleCanvasDblClick(pos.x, pos.y, e);
  }

  _onWheel(e) {
    e.preventDefault();
    const pos = this._clientPos(e);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;

    // Zoom towards mouse
    this.offsetX = pos.x - (pos.x - this.offsetX) * factor;
    this.offsetY = pos.y - (pos.y - this.offsetY) * factor;
    this.scale   = Math.max(4, Math.min(60, this.scale * factor));

    this.draw();
  }

  // ── Tooltip ────────────────────────────────────────────────
  _showTooltip(x, y) {
    const h = this.hitHole(x, y);
    if (!h) { this._hideTooltip(); return; }

    let text = `Hole (${h.col},${h.row})`;
    if (h.net) text += `  Net: ${h.net}`;
    if (h.moduleId != null) {
      const mod = this.board.modules.get(h.moduleId);
      if (mod) {
        const pin = mod.pins[h.pinIndex];
        text += `  ${mod.name} / Pin${pin.num} ${pin.name}`;
      }
    }

    if (!this._tooltipEl) {
      this._tooltipEl = document.createElement('div');
      this._tooltipEl.id = 'tooltip';
      this._tooltipEl.className = 'tooltip';
      document.body.appendChild(this._tooltipEl);
    }
    const r = this.canvas.getBoundingClientRect();
    this._tooltipEl.textContent = text;
    this._tooltipEl.style.display = 'block';
    this._tooltipEl.style.left = `${r.left + x + 12}px`;
    this._tooltipEl.style.top  = `${r.top  + y - 8}px`;
  }

  _hideTooltip() {
    if (this._tooltipEl) this._tooltipEl.style.display = 'none';
  }

  // ── Utilities ──────────────────────────────────────────────
  fitBoard() {
    const c = this.canvas;
    const b = this.board;
    const padPx = 60;
    const sx = (c.width  - padPx * 2) / (b.cols - 1);
    const sy = (c.height - padPx * 2) / (b.rows - 1);
    this.scale   = Math.max(4, Math.min(40, Math.floor(Math.min(sx, sy))));
    const bw = (b.cols - 1) * this.scale;
    const bh = (b.rows - 1) * this.scale;
    this.offsetX = Math.floor((c.width  - bw) / 2);
    this.offsetY = Math.floor((c.height - bh) / 2);
    this.draw();
  }

  setBoard(board) {
    this.board = board;
    this.selectedIds.clear();
    this._routeFrom = null;
    this.fitBoard();
  }

  /** Replace board without changing zoom/pan — used by undo/redo. */
  updateBoard(board) {
    this.board          = board;
    this.selectedIds.clear();
    this._routeFrom     = null;
    this._eraseDragging = false;
    this.draw();
  }

  startDrag(type, targetId, mouseX, mouseY) {
    this._dragging   = true;
    this._dragType   = type;
    this._dragTarget = targetId;
    this._dragStart  = { x: mouseX, y: mouseY };

    if (type === 'module') {
      const mod = this.board.modules.get(targetId);
      const g   = this.screenToGrid(mouseX, mouseY);
      this._dragOffset = {
        col: g.col - mod.col,
        row: g.row - mod.row
      };
    }
  }
}
