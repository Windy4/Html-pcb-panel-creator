/**
 * PCBRenderer3D – Three.js powered 3D view of the PCB panel.
 *
 * Shows:
 *  - PCB board body (FR4 green)
 *  - Copper pads (gold spheres/cylinders)
 *  - Traces on top (red) and bottom (blue) surfaces
 *  - Module representations (colored boxes)
 *
 * Controls:
 *  - Left drag = orbit
 *  - Right drag / two-finger = pan
 *  - Scroll = zoom
 */
class PCBRenderer3D {
  constructor(container, board) {
    this.container = container;
    this.board     = board;
    this._built    = false;
    this._animId   = null;
  }

  init() {
    if (this._built) return;
    if (typeof THREE === 'undefined') {
      this.container.innerHTML =
        '<div style="color:#888;padding:20px;text-align:center">Three.js not loaded – 3D view unavailable.</div>';
      return;
    }

    const W = this.container.clientWidth;
    const H = this.container.clientHeight;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1117);
    this.scene.fog = new THREE.Fog(0x0d1117, 50, 200);

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 500);
    this.camera.position.set(0, 30, 50);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(W, H);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x6699ff, 0.3);
    fillLight.position.set(-20, 10, -20);
    this.scene.add(fillLight);

    // Controls (simple orbit via mouse events)
    this._initOrbit();

    // Build scene geometry
    this.rebuild();

    // Start render loop
    this._loop();
    this._built = true;

    // Handle resize
    window.addEventListener('resize', () => this._onResize());
  }

  _loop() {
    this._animId = requestAnimationFrame(() => this._loop());
    this.renderer.render(this.scene, this.camera);
  }

  stop() {
    if (this._animId) {
      cancelAnimationFrame(this._animId);
      this._animId = null;
    }
  }

  // ── Build scene geometry ────────────────────────────────────
  rebuild() {
    if (!this.scene) return;

    // Clear existing objects (except lights)
    const toRemove = [];
    this.scene.traverse(obj => {
      if (obj.isMesh || obj.isLineSegments) toRemove.push(obj);
    });
    toRemove.forEach(obj => this.scene.remove(obj));

    const b = this.board;
    const sp = b.spacing;
    // World size
    const W = (b.cols - 1) * sp;
    const D = (b.rows - 1) * sp;
    const cx = W / 2, cz = D / 2;
    const boardThick = 1.6;

    // ── PCB Board body ──────────────────────────────────────
    const boardGeo = new THREE.BoxGeometry(W + sp, boardThick, D + sp);
    const boardMat = new THREE.MeshLambertMaterial({ color: 0x1a5c1a, side: THREE.DoubleSide });
    const boardMesh = new THREE.Mesh(boardGeo, boardMat);
    boardMesh.receiveShadow = true;
    boardMesh.position.set(0, -boardThick / 2, 0);
    this.scene.add(boardMesh);

    // Board edge (fiberglass visible on sides)
    const edgeGeo = new THREE.BoxGeometry(W + sp + 0.2, boardThick + 0.1, D + sp + 0.2);
    const edgeMat = new THREE.MeshLambertMaterial({
      color: 0x2a8c2a, wireframe: false, side: THREE.FrontSide
    });
    const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
    edgeMesh.position.set(0, -boardThick / 2, 0);
    // Just show edge lines
    const edgeLines = new THREE.LineSegments(
      new THREE.EdgesGeometry(edgeGeo),
      new THREE.LineBasicMaterial({ color: 0x66cc66, linewidth: 1 })
    );
    edgeLines.position.copy(edgeMesh.position);
    this.scene.add(edgeLines);

    // ── Copper pads (all holes) ─────────────────────────────
    const padGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 8);
    const padMat = new THREE.MeshLambertMaterial({ color: 0xc8a53e });
    const drillGeo = new THREE.CylinderGeometry(0.2, 0.2, boardThick + 0.2, 8);
    const drillMat = new THREE.MeshLambertMaterial({ color: 0x050a05 });

    for (const h of b.holes.values()) {
      const x = h.col * sp - cx;
      const z = h.row * sp - cz;

      const net = h.net ? b.nets.get(h.net) : null;
      let padColor = 0xc8a53e;
      if (net) padColor = parseInt(net.color.replace('#', ''), 16);

      // Top pad
      const topPad = new THREE.Mesh(padGeo,
        new THREE.MeshLambertMaterial({ color: padColor }));
      topPad.position.set(x, 0.05, z);
      topPad.castShadow = true;
      this.scene.add(topPad);

      // Bottom pad
      const botPad = new THREE.Mesh(padGeo,
        new THREE.MeshLambertMaterial({ color: padColor }));
      botPad.position.set(x, -boardThick - 0.05, z);
      botPad.rotation.x = Math.PI;
      this.scene.add(botPad);

      // Drill
      const drill = new THREE.Mesh(drillGeo, drillMat);
      drill.position.set(x, -boardThick / 2, z);
      this.scene.add(drill);
    }

    // ── Traces ──────────────────────────────────────────────
    for (const t of b.traces) {
      const h1 = b.getHoleById(t.from);
      const h2 = b.getHoleById(t.to);
      if (!h1 || !h2) continue;

      const x1 = h1.col * sp - cx, z1 = h1.row * sp - cz;
      const x2 = h2.col * sp - cx, z2 = h2.row * sp - cz;
      const y  = t.layer === 'top' ? 0.08 : -boardThick - 0.08;

      const net = t.net ? b.nets.get(t.net) : null;
      let color = t.layer === 'top' ? 0xcc3333 : 0x3366cc;
      if (net) color = parseInt(net.color.replace('#', ''), 16);

      const dx = x2 - x1, dz = z2 - z1;
      const length = Math.sqrt(dx*dx + dz*dz);
      const traceW = 0.3;

      const traceGeo = new THREE.BoxGeometry(length, 0.05, traceW);
      const traceMat = new THREE.MeshLambertMaterial({ color });
      const traceMesh = new THREE.Mesh(traceGeo, traceMat);

      traceMesh.position.set((x1+x2)/2, y, (z1+z2)/2);
      traceMesh.rotation.y = -Math.atan2(dz, dx);
      this.scene.add(traceMesh);
    }

    // ── Module boxes ────────────────────────────────────────
    const modColors = [
      0x2266aa, 0x22aa66, 0xaa6622, 0x6622aa,
      0xaa2266, 0x22aaaa, 0xaaaa22
    ];
    let modIdx = 0;
    for (const mod of b.modules.values()) {
      const fp = b.footprints.get(mod.footprintId);
      if (!fp) continue;

      let minC = Infinity, maxC = -Infinity;
      let minR = Infinity, maxR = -Infinity;
      for (const pin of mod.pins) {
        minC = Math.min(minC, pin.col); maxC = Math.max(maxC, pin.col);
        minR = Math.min(minR, pin.row); maxR = Math.max(maxR, pin.row);
      }

      const x1 = minC * sp - cx, x2 = maxC * sp - cx;
      const z1 = minR * sp - cz, z2 = maxR * sp - cz;
      const mw = Math.max(sp, x2 - x1 + sp);
      const md = Math.max(sp, z2 - z1 + sp);
      const mh = 2.0;

      const color = modColors[modIdx % modColors.length];
      modIdx++;

      const mGeo = new THREE.BoxGeometry(mw, mh, md);
      const mMat = new THREE.MeshLambertMaterial({
        color, transparent: true, opacity: 0.85
      });
      const mMesh = new THREE.Mesh(mGeo, mMat);
      mMesh.position.set((x1+x2)/2, mh/2 + 0.05, (z1+z2)/2);
      mMesh.castShadow = true;
      this.scene.add(mMesh);

      // Label (using sprite)
      if (this._makeTextSprite) {
        const sprite = this._makeTextSprite(mod.name, color);
        sprite.position.set((x1+x2)/2, mh + 1, (z1+z2)/2);
        this.scene.add(sprite);
      }
    }

    // ── Grid helper on board ─────────────────────────────────
    const gridHelper = new THREE.GridHelper(
      Math.max(W, D) + sp * 2, Math.max(b.cols, b.rows),
      0x1e3a5f, 0x1e3a5f
    );
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);

    // Fit camera
    const maxDim = Math.max(W, D);
    this.camera.position.set(maxDim * 0.5, maxDim * 0.6, maxDim * 0.9);
    this.camera.lookAt(0, 0, 0);
  }

  // ── Simple orbit control ────────────────────────────────────
  _initOrbit() {
    const el = this.container;
    let isDragging = false;
    let isRightDrag = false;
    let lastX = 0, lastY = 0;
    let theta = 0.5, phi = 0.9, radius = 60;
    let panX = 0, panZ = 0;

    const updateCamera = () => {
      const x = radius * Math.sin(phi) * Math.sin(theta) + panX;
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.cos(theta) + panZ;
      this.camera.position.set(x, y, z);
      this.camera.lookAt(panX, 0, panZ);
    };
    updateCamera();

    el.addEventListener('mousedown', e => {
      isDragging   = true;
      isRightDrag  = e.button === 2;
      lastX = e.clientX;
      lastY = e.clientY;
      e.preventDefault();
    });

    el.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;

      if (isRightDrag) {
        panX -= dx * 0.05;
        panZ -= dy * 0.05;
      } else {
        theta -= dx * 0.01;
        phi    = Math.max(0.1, Math.min(Math.PI - 0.1, phi - dy * 0.01));
      }
      updateCamera();
    });

    el.addEventListener('mouseup',    () => { isDragging = false; });
    el.addEventListener('mouseleave', () => { isDragging = false; });
    el.addEventListener('contextmenu', e => e.preventDefault());

    el.addEventListener('wheel', e => {
      radius = Math.max(10, Math.min(200, radius + e.deltaY * 0.1));
      updateCamera();
      e.preventDefault();
    }, { passive: false });
  }

  _onResize() {
    if (!this.renderer) return;
    const W = this.container.clientWidth;
    const H = this.container.clientHeight;
    this.renderer.setSize(W, H);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
  }

  setBoard(board) {
    this.board = board;
    this.rebuild();
  }
}
