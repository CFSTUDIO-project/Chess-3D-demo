import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const THEMES = {
  walnut: { light: '#c9a77a', dark: '#513a2b', edge: '#30251c', roughness: .48 },
  obsidian: { light: '#74736c', dark: '#292a28', edge: '#171816', roughness: .28 },
  marble: { light: '#d0cbbb', dark: '#666a6a', edge: '#363a3a', roughness: .3 },
  ivory: { light: '#dfd5bd', dark: '#4d463e', edge: '#292621', roughness: .38 },
  tournament: { light: '#d7d0b8', dark: '#61775e', edge: '#273529', roughness: .42 }
};

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

function woodTexture(base) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 1) {
    const wave = Math.sin(x * .071) * 2.5 + Math.sin(x * .019) * 3.2;
    ctx.fillStyle = x % 5 === 0 ? 'rgba(30,18,10,.08)' : 'rgba(255,226,180,.025)';
    ctx.fillRect(x + wave, 0, 1 + (x % 4 === 0 ? 1 : 0), 256);
  }
  for (let y = 0; y < 256; y += 32) {
    ctx.strokeStyle = 'rgba(20,12,8,.025)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + Math.sin(y) * 2);
    ctx.bezierCurveTo(70, y + 5, 170, y - 5, 256, y + 1);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function lathe(profile, segments = 36) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

function pieceBase() {
  const profile = [[0,.035],[.22,.035],[.255,.065],[.26,.095],[.23,.12],[.18,.15],[.145,.18],[.13,.2]];
  return lathe(profile, 40);
}

function makePiece(type, color, materials) {
  const group = new THREE.Group();
  const main = color === 'w' ? materials.ivory : materials.ebony;
  const trim = color === 'w' ? materials.ivoryTrim : materials.ebonyTrim;
  const add = (geometry, material, position = [0,0,0], rotation = [0,0,0]) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  add(pieceBase(), trim, [0,0,0]);
  add(new THREE.TorusGeometry(.22,.025,8,40), trim, [0,.12,0], [Math.PI/2,0,0]);

  if (type === 'p') {
    add(lathe([[.13,.17],[.16,.2],[.12,.26],[.085,.36],[.09,.42],[.12,.45]], 36), main);
    add(new THREE.SphereGeometry(.13,24,18), main, [0,.54,0]);
    add(new THREE.TorusGeometry(.105,.013,7,28), trim, [0,.43,0], [Math.PI/2,0,0]);
  }
  if (type === 'r') {
    add(lathe([[.13,.16],[.17,.2],[.18,.26],[.19,.47],[.24,.49],[.25,.56]], 40), main);
    add(new THREE.CylinderGeometry(.25,.25,.08,40), trim, [0,.55,0]);
    const crenel = new THREE.BoxGeometry(.105,.11,.105);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      add(crenel, main, [Math.cos(a)*.19,.64,Math.sin(a)*.19]);
    }
    add(new THREE.CylinderGeometry(.15,.15,.045,32), main, [0,.62,0]);
  }
  if (type === 'b') {
    add(lathe([[.13,.16],[.18,.2],[.16,.26],[.105,.39],[.085,.54],[.13,.61],[.105,.65]], 40), main);
    add(new THREE.SphereGeometry(.11,24,16), main, [0,.67,0]);
    const slash = new THREE.Mesh(new THREE.BoxGeometry(.025,.19,.24), trim);
    slash.position.set(0,.66,0);
    slash.rotation.z = -.45;
    slash.castShadow = true;
    group.add(slash);
  }
  if (type === 'q') {
    add(lathe([[.13,.16],[.18,.21],[.17,.28],[.12,.43],[.13,.55],[.2,.61],[.18,.66]], 44), main);
    add(new THREE.TorusGeometry(.19,.025,8,40), trim, [0,.61,0], [Math.PI/2,0,0]);
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7;
      add(new THREE.SphereGeometry(.045,14,10), trim, [Math.cos(a)*.17,.73,Math.sin(a)*.17]);
    }
    add(new THREE.SphereGeometry(.09,20,14), main, [0,.72,0]);
  }
  if (type === 'k') {
    add(lathe([[.13,.16],[.18,.21],[.17,.28],[.12,.45],[.14,.59],[.18,.65],[.13,.69]], 44), main);
    add(new THREE.TorusGeometry(.16,.022,8,36), trim, [0,.63,0], [Math.PI/2,0,0]);
    add(new THREE.BoxGeometry(.075,.26,.075), trim, [0,.83,0]);
    add(new THREE.BoxGeometry(.22,.065,.075), trim, [0,.83,0]);
    add(new THREE.SphereGeometry(.035,14,10), main, [0,.97,0]);
  }
  if (type === 'n') {
    add(lathe([[.13,.16],[.18,.21],[.17,.29],[.13,.37],[.18,.43],[.18,.47]], 40), main);
    const shape = new THREE.Shape();
    shape.moveTo(-.19,.12); shape.lineTo(-.17,.29); shape.lineTo(-.1,.43);
    shape.lineTo(-.16,.58); shape.lineTo(-.07,.68); shape.lineTo(.015,.57);
    shape.lineTo(.14,.54); shape.lineTo(.2,.44); shape.lineTo(.15,.32);
    shape.lineTo(.23,.19); shape.lineTo(.18,.12); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth:.11, bevelEnabled:true, bevelSegments:2, steps:1, bevelSize:.025, bevelThickness:.025, curveSegments:8 });
    geometry.center();
    add(geometry, main, [0,.32,.015], [0,0,0]);
    add(new THREE.SphereGeometry(.025,12,10), trim, [.085,.71,.09]);
    add(new THREE.ConeGeometry(.055,.11,5), main, [-.1,.69,.015], [0,0,-.28]);
  }

  group.userData.pieceType = type;
  group.userData.color = color;
  return group;
}

export class ChessScene {
  constructor(container, { interactive = true, onSquare = () => {}, quality = 'high', coordinates = true } = {}) {
    this.container = container;
    this.interactive = interactive;
    this.onSquare = onSquare;
    this.pieceMap = new Map();
    this.squareMeshes = new Map();
    this.highlightMeshes = [];
    this.selection = null;
    this.legalTargets = [];
    this.lastMove = null;
    this.orientation = 'w';
    this.themeName = 'walnut';
    this.quality = quality;
    this.showCoordinates = coordinates;
    this.pointerState = null;
    this.clock = new THREE.Clock();
    this.tweens = [];
    this.disposed = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#171613');
    this.camera = new THREE.PerspectiveCamera(35, 1, .1, 100);
    this.camera.position.set(0, 9.5, 12.5);
    this.renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : quality === 'medium' ? 1.35 : 1.65));
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, .15, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .075;
    this.controls.enablePan = false;
    this.controls.minDistance = 7.8;
    this.controls.maxDistance = 17;
    this.controls.minPolarAngle = .35;
    this.controls.maxPolarAngle = 1.36;
    this.controls.rotateSpeed = .62;
    this.controls.zoomSpeed = .72;
    this.controls.enabled = true;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0,1,0), -.75);
    this.dragPoint = new THREE.Vector3();

    this.materials = {
      ivory: new THREE.MeshPhysicalMaterial({ color:'#eee4d0', roughness:.22, metalness:.1, clearcoat:.55, clearcoatRoughness:.18 }),
      ivoryTrim: new THREE.MeshStandardMaterial({ color:'#b59a6f', roughness:.28, metalness:.55 }),
      ebony: new THREE.MeshPhysicalMaterial({ color:'#272a2a', roughness:.23, metalness:.38, clearcoat:.5, clearcoatRoughness:.2 }),
      ebonyTrim: new THREE.MeshStandardMaterial({ color:'#818176', roughness:.3, metalness:.7 })
    };
    this.geometryCache = new Map();
    this.buildEnvironment();
    this.buildBoard();
    this.applyTheme(this.themeName);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.bindPointerEvents();
    this.animate();
    this.onVisibilityChange = () => { this.clock.getDelta(); };
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  buildEnvironment() {
    this.scene.add(new THREE.HemisphereLight('#eee2c9', '#171410', 1.15));
    const key = new THREE.DirectionalLight('#fff0d7', 3.1);
    key.position.set(-4, 9, 6);
    key.castShadow = this.renderer.shadowMap.enabled;
    key.shadow.mapSize.set(this.quality === 'low' ? 512 : 1024, this.quality === 'low' ? 512 : 1024);
    key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 7; key.shadow.camera.bottom = -7;
    key.shadow.bias = -.0004;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight('#a9b3bd', .85);
    fill.position.set(5, 5, -5);
    this.scene.add(fill);
    const rim = new THREE.PointLight('#c29c65', 27, 14, 2);
    rim.position.set(-1.5, 4.2, 2.5);
    this.scene.add(rim);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200,200), new THREE.MeshStandardMaterial({ color:'#171613', roughness:.92, metalness:.05 }));
    ground.rotation.x = -Math.PI/2;
    ground.position.y = -.22;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  buildBoard() {
    const baseMaterial = new THREE.MeshStandardMaterial({ color:'#30271e', roughness:.42, metalness:.18 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(8.55,.38,8.55), baseMaterial);
    base.position.y = -.005;
    base.castShadow = true; base.receiveShadow = true;
    this.scene.add(base);
    const bevel = new THREE.Mesh(new THREE.BoxGeometry(8.62,.12,8.62), new THREE.MeshStandardMaterial({ color:'#a17e4f', roughness:.34, metalness:.48 }));
    bevel.position.y = -.16;
    this.scene.add(bevel);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(8.72,.13,8.72), new THREE.MeshStandardMaterial({ color:'#211b15', roughness:.4, metalness:.25 }));
    lower.position.y = -.265;
    lower.castShadow = true;
    this.scene.add(lower);

    for (let row = 0; row < 8; row++) {
      for (let file = 0; file < 8; file++) {
        const square = `${'abcdefgh'[file]}${8-row}`;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(.995,.085,.995), new THREE.MeshStandardMaterial({ roughness:.46, metalness:.03 }));
        mesh.position.set(file - 3.5, .225, row - 3.5);
        mesh.receiveShadow = true;
        mesh.userData.square = square;
        mesh.userData.kind = 'square';
        this.scene.add(mesh);
        this.squareMeshes.set(square, mesh);
      }
    }
    this.coordinateGroup = new THREE.Group();
    this.scene.add(this.coordinateGroup);
    this.createCoordinates();
  }

  createCoordinates() {
    for (const child of [...this.coordinateGroup.children]) {
      child.material?.map?.dispose?.();
      child.material?.dispose?.();
    }
    this.coordinateGroup.clear();
    if (!this.showCoordinates) return;
    const makeLabel = (text, x, z, rotation = 0) => {
      const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0,0,128,64); ctx.fillStyle = 'rgba(226,211,184,.72)';
      ctx.font = '500 27px "DM Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text,64,32);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.SpriteMaterial({ map:texture, transparent:true, depthWrite:false });
      const sprite = new THREE.Sprite(material); sprite.position.set(x,.25,z); sprite.scale.set(.28,.14,1); sprite.material.rotation = rotation;
      this.coordinateGroup.add(sprite);
    };
    for (let f = 0; f < 8; f++) {
      const file = 'abcdefgh'[f];
      makeLabel(file, f-3.5, 4.08);
      makeLabel(file, f-3.5, -4.08);
    }
    for (let r = 0; r < 8; r++) {
      const rank = String(8-r);
      makeLabel(rank, -4.08, r-3.5, Math.PI/2);
      makeLabel(rank, 4.08, r-3.5, Math.PI/2);
    }
  }

  applyTheme(name) {
    const theme = THEMES[name] || THEMES.walnut;
    this.themeName = name in THEMES ? name : 'walnut';
    const lightTexture = name === 'walnut' ? woodTexture(theme.light) : null;
    const darkTexture = name === 'walnut' ? woodTexture(theme.dark) : null;
    for (const [square, mesh] of this.squareMeshes) {
      const file = 'abcdefgh'.indexOf(square[0]);
      const row = 8 - Number(square[1]);
      const isLight = (row + file) % 2 === 0;
      const color = isLight ? theme.light : theme.dark;
      mesh.material.map?.dispose?.();
      mesh.material.dispose();
      mesh.material = new THREE.MeshStandardMaterial({
        color: lightTexture || darkTexture ? '#ffffff' : color,
        map: name === 'walnut' ? (isLight ? lightTexture : darkTexture) : null,
        roughness: theme.roughness,
        metalness: name === 'obsidian' ? .18 : .035,
        envMapIntensity: .45
      });
      mesh.userData.baseColor = color;
    }
    const base = this.scene.children.find(o => o.geometry?.type === 'BoxGeometry' && Math.abs(o.geometry.parameters?.width - 8.55) < .01);
    if (base?.material) base.material.color.set(theme.edge);
  }

  positionFor(square) {
    const file = 'abcdefgh'.indexOf(square[0]);
    const row = 8 - Number(square[1]);
    return new THREE.Vector3(file - 3.5, .27, row - 3.5);
  }

  addPiece(square, piece) {
    const group = makePiece(piece.type, piece.color, this.materials);
    group.position.copy(this.positionFor(square));
    group.userData.square = square;
    group.traverse(obj => {
      if (obj.isMesh) {
        obj.userData.square = square;
        obj.userData.pieceGroup = group;
      }
    });
    this.scene.add(group);
    this.pieceMap.set(square, group);
    return group;
  }

  setPosition(board, move = null, animateMove = true) {
    const next = new Map();
    for (let row = 0; row < 8; row++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[row][file];
        if (piece) next.set(`${'abcdefgh'[file]}${8-row}`, piece);
      }
    }

    let movingGroup = null;
    if (move && animateMove) {
      movingGroup = this.pieceMap.get(move.from) || null;
      if (movingGroup) this.pieceMap.delete(move.from);
      const captureSquare = move.flags?.includes('e') ? `${move.to[0]}${move.from[1]}` : move.to;
      const captured = this.pieceMap.get(captureSquare);
      if (captured && captured !== movingGroup) {
        this.scene.remove(captured);
        this.disposeGroup(captured);
        this.pieceMap.delete(captureSquare);
      }
      if (move.promotion && movingGroup) {
        this.scene.remove(movingGroup);
        this.disposeGroup(movingGroup);
        movingGroup = null;
      }
      if (movingGroup) {
        this.pieceMap.set(move.to, movingGroup);
        movingGroup.userData.square = move.to;
        this.animateGroupTo(movingGroup, this.positionFor(move.to), true);
      }
      if (move.san === 'O-O' || move.san === 'O-O-O') {
        const rank = move.color === 'w' ? '1' : '8';
        const rookFrom = move.san === 'O-O' ? `h${rank}` : `a${rank}`;
        const rookTo = move.san === 'O-O' ? `f${rank}` : `d${rank}`;
        const rook = this.pieceMap.get(rookFrom);
        if (rook) {
          this.pieceMap.delete(rookFrom); this.pieceMap.set(rookTo, rook);
          rook.userData.square = rookTo;
          this.animateGroupTo(rook, this.positionFor(rookTo), true);
        }
      }
    }

    for (const [square, group] of [...this.pieceMap]) {
      if (!next.has(square)) {
        this.scene.remove(group); this.disposeGroup(group); this.pieceMap.delete(square);
      }
    }
    for (const [square, piece] of next) {
      const existing = this.pieceMap.get(square);
      if (existing && existing.userData.pieceType === piece.type && existing.userData.color === piece.color) continue;
      if (existing) { this.scene.remove(existing); this.disposeGroup(existing); this.pieceMap.delete(square); }
      this.addPiece(square, piece);
    }
    this.clearHighlights();
    if (move) this.setLastMove(move.from, move.to);
  }

  disposeGroup(group) {
    group.traverse(obj => {
      if (obj.isMesh) {
        // Geometries are small, but every rebuilt piece is explicitly released.
        obj.geometry?.dispose?.();
      }
    });
  }

  animateGroupTo(group, target, lift = false) {
    const from = group.position.clone();
    const started = performance.now();
    this.tweens.push({ group, from, target, started, duration: 260, lift });
  }

  setHighlights({ selected = null, targets = [], lastMove = null, checkSquare = null } = {}) {
    this.clearHighlights();
    this.selection = selected;
    this.legalTargets = targets;
    this.lastMove = lastMove;
    const addOverlay = (square, color, opacity = .24, ring = false) => {
      const pos = this.positionFor(square);
      if (ring) {
        const mesh = new THREE.Mesh(new THREE.TorusGeometry(.25,.035,8,32), new THREE.MeshBasicMaterial({ color, transparent:true, opacity, depthWrite:false }));
        mesh.rotation.x = Math.PI/2; mesh.position.set(pos.x,.282,pos.z);
        this.scene.add(mesh); this.highlightMeshes.push(mesh);
      } else {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.92,.92), new THREE.MeshBasicMaterial({ color, transparent:true, opacity, depthWrite:false, side:THREE.DoubleSide }));
        mesh.rotation.x = -Math.PI/2; mesh.position.set(pos.x,.271,pos.z);
        this.scene.add(mesh); this.highlightMeshes.push(mesh);
      }
    };
    if (lastMove) { addOverlay(lastMove.from, '#d7bd7e', .18); addOverlay(lastMove.to, '#d7bd7e', .26); }
    if (checkSquare) addOverlay(checkSquare, '#c15d50', .34);
    if (selected) addOverlay(selected, '#e3c77e', .38);
    for (const square of targets) {
      if (this.pieceMap.has(square)) addOverlay(square, '#c9a96d', .85, true);
      else {
        const pos = this.positionFor(square);
        const mesh = new THREE.Mesh(new THREE.CircleGeometry(.105,24), new THREE.MeshBasicMaterial({ color:'#243c31', transparent:true, opacity:.83, depthWrite:false }));
        mesh.rotation.x = -Math.PI/2; mesh.position.set(pos.x,.276,pos.z);
        this.scene.add(mesh); this.highlightMeshes.push(mesh);
      }
    }
  }

  setLastMove(from, to) {
    this.lastMove = { from, to };
    this.setHighlights({ lastMove: this.lastMove });
  }

  clearHighlights() {
    for (const mesh of this.highlightMeshes) {
      this.scene.remove(mesh); mesh.geometry?.dispose?.(); mesh.material?.dispose?.();
    }
    this.highlightMeshes.length = 0;
  }

  bindPointerEvents() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerCancel);
    canvas.addEventListener('contextmenu', this.preventContextMenu);
  }

  preventContextMenu = (event) => event.preventDefault();

  getIntersections(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects([...this.pieceMap.values(), ...this.squareMeshes.values()], true);
  }

  findSquare(intersections) {
    for (const hit of intersections) {
      let object = hit.object;
      while (object && !object.userData.square) object = object.parent;
      if (object?.userData.square) return { square: object.userData.square, group: object.userData.pieceGroup || (object.userData.pieceType ? object : null) };
    }
    return null;
  }

  handlePointerDown = (event) => {
    if (!this.interactive || event.button > 0) return;
    const found = this.findSquare(this.getIntersections(event));
    if (!found) return;
    this.pointerState = { id:event.pointerId, x:event.clientX, y:event.clientY, square:found.square, group:found.group, dragging:false };
    if (found.group) {
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture?.(event.pointerId);
    }
  };

  handlePointerMove = (event) => {
    const state = this.pointerState;
    if (!state || state.id !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - state.x, event.clientY - state.y);
    if (distance > 6) state.dragging = true;
    if (!state.group || !state.dragging) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPoint)) {
      state.group.position.x = THREE.MathUtils.clamp(this.dragPoint.x, -3.5, 3.5);
      state.group.position.z = THREE.MathUtils.clamp(this.dragPoint.z, -3.5, 3.5);
      state.group.position.y = .72;
    }
  };

  getSquareAtPointer(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const point = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0), -.27), new THREE.Vector3());
    if (!point || point.x < -4 || point.x >= 4 || point.z < -4 || point.z >= 4) return null;
    const file = Math.floor(point.x + 4);
    const row = Math.floor(point.z + 4);
    return `${'abcdefgh'[file]}${8-row}`;
  }

  handlePointerUp = (event) => {
    const state = this.pointerState;
    if (!state || state.id !== event.pointerId) return;
    const targetSquare = state.dragging && state.group ? this.getSquareAtPointer(event) : this.findSquare(this.getIntersections(event))?.square;
    this.pointerState = null;
    this.controls.enabled = true;
    if (state.dragging && !state.group) return;
    if (state.dragging && state.group) {
      state.group.position.copy(this.positionFor(state.square));
      this.onSquare(targetSquare || state.square, { dragFrom:state.square });
    } else {
      this.onSquare(targetSquare || state.square, { dragFrom:null });
    }
  };

  handlePointerCancel = () => {
    if (this.pointerState?.group) this.pointerState.group.position.copy(this.positionFor(this.pointerState.square));
    this.pointerState = null;
    this.controls.enabled = this.interactive;
  };

  setOrientation(color) {
    this.orientation = color === 'b' ? 'b' : 'w';
    const distance = this.camera.position.distanceTo(this.controls.target);
    const polar = this.orientation === 'w' ? .68 : .68;
    const azimuth = this.orientation === 'w' ? 0 : Math.PI;
    const spherical = new THREE.Spherical(distance, polar, azimuth);
    const targetPosition = new THREE.Vector3().setFromSpherical(spherical).add(this.controls.target);
    this.animateCamera(targetPosition);
  }

  flipBoard() { this.setOrientation(this.orientation === 'w' ? 'b' : 'w'); }

  animateCamera(targetPosition) {
    const from = this.camera.position.clone();
    const start = performance.now();
    this.cameraTween = { from, to:targetPosition.clone(), start, duration:440 };
  }

  resetCamera() {
    const target = new THREE.Vector3(0, 9.5, this.orientation === 'w' ? 12.5 : -12.5);
    this.animateCamera(target);
  }

  setQuality(quality) {
    this.quality = quality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : quality === 'medium' ? 1.35 : 1.65));
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.needsUpdate = true;
    this.resize();
  }

  setCoordinates(enabled) {
    this.showCoordinates = Boolean(enabled);
    this.createCoordinates();
  }

  resize() {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  animate = () => {
    if (this.disposed) return;
    requestAnimationFrame(this.animate);
    if (document.hidden) return;
    const now = performance.now();
    this.controls.update();
    if (this.cameraTween) {
      const t = Math.min(1, (now - this.cameraTween.start) / this.cameraTween.duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(this.cameraTween.from, this.cameraTween.to, eased);
      if (t >= 1) this.cameraTween = null;
    }
    if (this.tweens.length) {
      this.tweens = this.tweens.filter(tween => {
        const t = Math.min(1, (now - tween.started) / tween.duration);
        const eased = t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
        tween.group.position.x = THREE.MathUtils.lerp(tween.from.x, tween.target.x, eased);
        tween.group.position.z = THREE.MathUtils.lerp(tween.from.z, tween.target.z, eased);
        const arc = tween.lift ? Math.sin(Math.PI*t) * .3 : 0;
        tween.group.position.y = tween.from.y + (tween.target.y - tween.from.y) * eased + arc;
        return t < 1;
      });
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    this.resizeObserver?.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    canvas.removeEventListener('pointermove', this.handlePointerMove);
    canvas.removeEventListener('pointerup', this.handlePointerUp);
    canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    canvas.removeEventListener('contextmenu', this.preventContextMenu);
    this.controls.dispose();
    this.clearHighlights();
    for (const group of this.pieceMap.values()) this.disposeGroup(group);
    this.pieceMap.clear();
    this.renderer.dispose();
    this.container.removeChild(canvas);
    this.scene.traverse(object => {
      if (object.isMesh || object.isSprite) {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach(m => m.dispose?.());
        else object.material?.dispose?.();
      }
    });
  }
}

export { PIECE_VALUES, PIECE_NAMES, THEMES };
