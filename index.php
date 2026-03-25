<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PCB Panel Creator</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>

<!-- ═══════════════════════════════════════════════════════════
     TOOLBAR
════════════════════════════════════════════════════════════ -->
<header id="toolbar">
  <span class="logo">⬡ PCB Panel</span>

  <div class="tb-group">
    <button class="tb-btn" id="btn-new"       title="New board (clears all)">
      <span>📄</span> New
    </button>
    <button class="tb-btn" id="btn-open"      title="Open .pcbpanel file">
      <span>📂</span> Open
    </button>
    <button class="tb-btn" id="btn-save"      title="Save .pcbpanel file">
      <span>💾</span> Save
    </button>
    <button class="tb-btn" id="btn-export"    title="Export options">
      <span>📤</span> Export ▾
    </button>
    <button class="tb-btn" id="btn-import-fp" title="Import footprint .fp file">
      <span>📥</span> Import FP
    </button>
  </div>

  <div class="tb-sep"></div>

  <div class="tb-group">
    <button class="tb-btn" id="btn-board-cfg" title="Board dimensions & settings">
      <span>⚙</span> Board
    </button>
    <button class="tb-btn" id="btn-fit"       title="Fit board in view (F)">
      <span>⊡</span> Fit
    </button>
    <button class="tb-btn" id="btn-3d"        title="Toggle 3D view">
      <span>🎲</span> 3D
    </button>
  </div>

  <div class="tb-sep"></div>

  <span class="tb-label">Layer:</span>
  <div class="tb-group">
    <button class="tb-btn active" id="layer-top-btn" title="Select top copper layer"
            onclick="app.activeLayer='top'; app.renderer2d.activeLayer='top';
                     document.querySelectorAll('.layer-chip').forEach(c=>c.classList.toggle('active',c.dataset.layer==='top'));
                     document.getElementById('sb-layer').textContent='TOP';
                     this.classList.add('active');
                     document.getElementById('layer-bot-btn').classList.remove('active');"
            style="color:#cc3333;border-color:#cc3333;">
      ■ TOP
    </button>
    <button class="tb-btn" id="layer-bot-btn" title="Select bottom copper layer"
            onclick="app.activeLayer='bottom'; app.renderer2d.activeLayer='bottom';
                     document.querySelectorAll('.layer-chip').forEach(c=>c.classList.toggle('active',c.dataset.layer==='bottom'));
                     document.getElementById('sb-layer').textContent='BOTTOM';
                     this.classList.add('active');
                     document.getElementById('layer-top-btn').classList.remove('active');"
            style="color:#3366cc;border-color:#3366cc;">
      ■ BOT
    </button>
  </div>
</header>

<!-- ═══════════════════════════════════════════════════════════
     MAIN LAYOUT
════════════════════════════════════════════════════════════ -->
<div id="main">

  <!-- ── LEFT PANEL ──────────────────────────────────────── -->
  <aside id="left-panel">
    <div class="panel-title">Tools</div>
    <div id="tool-list">
      <button class="tool-btn active" data-tool="select" title="Select / move (S)">
        <span class="tool-icon">↖</span> Select / Move
      </button>
      <button class="tool-btn" data-tool="route" title="Route trace (R)">
        <span class="tool-icon">⟶</span> Route Trace
      </button>
      <button class="tool-btn" data-tool="place" title="Place footprint (P)">
        <span class="tool-icon">+</span> Place Module
      </button>
      <button class="tool-btn" data-tool="erase" title="Erase (E)">
        <span class="tool-icon">✕</span> Erase
      </button>
    </div>

    <div class="panel-title" style="margin-top:6px">Footprints</div>
    <input id="fp-search" placeholder="🔍 Search…" type="search" autocomplete="off">
    <div id="fp-list"><!-- populated by JS --></div>
    <div id="fp-actions">
      <button id="fp-new"    title="Create new footprint">+ New</button>
      <button id="fp-import" title="Import .fp file">Import</button>
      <button id="fp-export" title="Export custom footprints">Export</button>
    </div>
  </aside>

  <!-- ── CANVAS ─────────────────────────────────────────── -->
  <main id="canvas-container">

    <!-- 2D canvas -->
    <canvas id="pcb-canvas"></canvas>

    <!-- 3D container (Three.js) -->
    <div id="canvas-3d"></div>

    <!-- Overlay: view buttons -->
    <div id="view-controls">
      <button class="view-btn active" id="vbtn-grid"  title="Toggle grid (G)">⋯</button>
      <button class="view-btn"        id="vbtn-nets"  title="Toggle net colours">N</button>
      <button class="view-btn"        id="vbtn-fit"   title="Fit view (F)">⊡</button>
    </div>

    <!-- Layer chips -->
    <div id="layer-indicator">
      <div class="layer-chip top active" data-layer="top">TOP</div>
      <div class="layer-chip bot"        data-layer="bottom">BOT</div>
    </div>

    <!-- Zoom level -->
    <div id="zoom-info">100%</div>

    <!-- 3D hint -->
    <div class="view3d-hint" id="hint-3d" style="display:none">
      Left drag: orbit &nbsp;|&nbsp; Right drag: pan &nbsp;|&nbsp; Scroll: zoom
    </div>

  </main>

  <!-- ── RIGHT PANEL ────────────────────────────────────── -->
  <aside id="right-panel">

    <div class="tab-bar">
      <button class="tab-btn active" data-tab="props">Props</button>
      <button class="tab-btn"        data-tab="nets" >Nets</button>
      <button class="tab-btn"        data-tab="conn" >Connections</button>
    </div>

    <!-- Props tab -->
    <div class="tab-content active" id="tab-props">
      <div id="prop-content">
        <div class="empty-state">Nothing selected.<br>Click a hole, trace, or module.</div>
      </div>
    </div>

    <!-- Nets tab -->
    <div class="tab-content" id="tab-nets">
      <div id="net-list"></div>
      <div id="net-add-row">
        <input id="net-name-inp" placeholder="Net name (VCC, GND, …)" autocomplete="off">
        <button id="net-add-btn">Add</button>
      </div>
    </div>

    <!-- Connection table tab -->
    <div class="tab-content" id="tab-conn">
      <div style="font-size:11px;color:#888;margin-bottom:4px">
        Pin-to-pin connections by net across all modules.
      </div>
      <div id="conn-table-wrap">
        <div class="empty-state">No modules placed yet.</div>
      </div>
    </div>

  </aside>
</div>

<!-- ═══════════════════════════════════════════════════════════
     STATUS BAR
════════════════════════════════════════════════════════════ -->
<footer id="status-bar">
  <span>Tool: <span class="val" id="sb-tool">select</span></span>
  <span>Layer: <span class="val" id="sb-layer">TOP</span></span>
  <span>Pos: <span class="val" id="sb-pos">—</span></span>
  <span>Net: <span class="val" id="sb-net">—</span></span>
  <span class="val" id="sb-msg" style="color:#53d8fb;margin-left:auto"></span>
</footer>

<!-- Tooltip (managed by renderer) -->
<div class="tooltip" id="tooltip" style="display:none"></div>

<!-- ═══════════════════════════════════════════════════════════
     SCRIPTS
     Load order: footprints → board model → renderers → ui → app
════════════════════════════════════════════════════════════ -->

<!-- Three.js from CDN for 3D view -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
        crossorigin="anonymous"
        onerror="console.warn('Three.js CDN failed – 3D view disabled')"></script>

<script src="js/pcb-footprints.js"></script>
<script src="js/pcb-board.js"></script>
<script src="js/pcb-renderer2d.js"></script>
<script src="js/pcb-renderer3d.js"></script>
<script src="js/pcb-ui.js"></script>
<script src="js/pcb-app.js"></script>

<script>
// ── Bootstrap ──────────────────────────────────────────────
const app = new PCBApp();
document.addEventListener('DOMContentLoaded', () => {
  app.init();

  // Layer chip clicks also update toolbar layer buttons
  document.querySelectorAll('.layer-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const lay = chip.dataset.layer;
      app.activeLayer = lay;
      app.renderer2d.activeLayer = lay;
      document.getElementById('sb-layer').textContent = lay.toUpperCase();

      // Sync toolbar buttons
      document.getElementById('layer-top-btn').classList.toggle('active', lay === 'top');
      document.getElementById('layer-bot-btn').classList.toggle('active', lay === 'bottom');
    });
  });
});

// ── Quick keyboard help overlay (?) ───────────────────────
document.addEventListener('keydown', e => {
  if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
    const existing = document.getElementById('help-overlay');
    if (existing) { existing.remove(); return; }

    const help = document.createElement('div');
    help.id = 'help-overlay';
    help.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;
      align-items:center;justify-content:center;z-index:2000;backdrop-filter:blur(4px);
    `;
    help.innerHTML = `
      <div style="background:#16213e;border:1px solid #2a4a7f;border-radius:8px;
                  padding:24px;max-width:420px;width:90%;color:#e0e0e0;">
        <h2 style="color:#53d8fb;margin-bottom:16px;font-size:16px">⌨ Keyboard Shortcuts</h2>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          ${[
            ['S','Select / Move tool'],
            ['R','Route trace tool'],
            ['P','Place module tool'],
            ['E','Erase tool'],
            ['F','Fit board in view'],
            ['G','Toggle grid'],
            ['Esc','Cancel / deselect'],
            ['Del / Backspace','Delete selected'],
            ['Mouse wheel','Zoom in / out'],
            ['Middle drag / Alt+drag','Pan view'],
            ['Right click','Deselect / cancel'],
            ['?','This help'],
          ].map(([k,d]) => `
            <tr>
              <td style="padding:4px 12px 4px 0;color:#53d8fb;font-weight:600;white-space:nowrap">${k}</td>
              <td style="padding:4px 0;color:#ccc">${d}</td>
            </tr>
          `).join('')}
        </table>
        <p style="margin-top:16px;color:#888;font-size:11px">Click anywhere or press ? to close.</p>
      </div>
    `;
    help.addEventListener('click', () => help.remove());
    document.body.appendChild(help);
  }
});
</script>
</body>
</html>
