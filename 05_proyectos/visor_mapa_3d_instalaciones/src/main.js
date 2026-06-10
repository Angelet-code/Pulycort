import "./styles.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { DEFAULT_STATE } from "./defaultData.js";

const STORAGE_KEY = "pulycort-facility-map-3d-v1";
const IMAGE_PATH = "/assets/plano-google-maps-pulycort.png";

const MACHINE_COLORS = {
  Telar: "#2f6f8f",
  Reforzado: "#7c5f9f",
  "Reforzado tabla": "#6f6aa8",
  "Disco puente": "#b66a3c",
  "Pulido tabla": "#2f8f76",
  "Pulido losa": "#267f68",
  "Corte hilo": "#946c2f",
  "Corte bloque": "#8a5b35",
  "Control numerico": "#4a738c",
  "Acabado canto": "#94733a",
  Recuperacion: "#6f7c36",
  Taller: "#8b4e4e",
};

const PERSON_COLORS = {
  Manana: "#256f78",
  Tarde: "#9a6733",
  Noche: "#5f5f92",
};

const MAP_CALIBRATION_FIELDS = ["version", "x", "z", "width", "depth", "rotation", "opacity"];

const state = loadState();
const ui = {
  activeTab: "machines",
  search: "",
  selected: { kind: "machine", id: state.machines[0]?.id ?? null },
  showMap: true,
  showLabels: true,
  showAreas: true,
  showMachines: true,
  showPeople: true,
  editMode: true,
};

let scene;
let camera;
let renderer;
let labelRenderer;
let controls;
let raycaster;
let pointer;
let worldGroup;
let animationId;
let dragging = null;
let selectables = [];
let objectByKey = new Map();
let groundPlane;

document.querySelector("#app").innerHTML = `
  <div class="app-shell">
    <main class="scene-pane" aria-label="Visor 3D de instalaciones">
      <div id="sceneMount" class="scene-mount"></div>
      <div id="topbar" class="topbar"></div>
      <div id="toast" class="toast" role="status" aria-live="polite"></div>
    </main>
    <aside class="side-panel" aria-label="Panel de edicion">
      <div id="panel"></div>
    </aside>
  </div>
`;

initScene();
renderTopbar();
renderPanel();
buildScene();
animate();
window.__PULYCORT_APP_READY__ = true;

function loadState() {
  const fallback = structuredCloneSafe(DEFAULT_STATE);
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw);
    return migrateStoredState({
      ...fallback,
      ...parsed,
      meta: { ...fallback.meta, ...(parsed.meta ?? {}) },
      areas: Array.isArray(parsed.areas) ? parsed.areas : fallback.areas,
      machines: Array.isArray(parsed.machines) ? parsed.machines : fallback.machines,
      people: Array.isArray(parsed.people) ? parsed.people : fallback.people,
    });
  } catch {
    return fallback;
  }
}

function migrateStoredState(nextState) {
  const defaultMeta = DEFAULT_STATE.meta;
  const defaultMapVersion = defaultMeta.mapCalibration?.version ?? 1;
  const currentMapVersion = nextState.meta?.mapCalibration?.version ?? 1;
  const defaultLayoutVersion = defaultMeta.layoutVersion ?? 1;
  const currentLayoutVersion = nextState.meta?.layoutVersion ?? 1;

  if (currentMapVersion < defaultMapVersion) {
    nextState.meta.mapCalibration = structuredCloneSafe(defaultMeta.mapCalibration);
  }

  if (currentLayoutVersion < defaultLayoutVersion) {
    migrateAreasToDefaultLayout(nextState);
    nextState.meta.layoutVersion = defaultLayoutVersion;
  }

  return nextState;
}

function migrateAreasToDefaultLayout(nextState) {
  const defaultAreasById = new Map(DEFAULT_STATE.areas.map((area) => [area.id, area]));
  const geometryFields = ["x", "z", "width", "depth", "height", "rotation"];

  nextState.areas.forEach((area) => {
    const defaultArea = defaultAreasById.get(area.id);
    if (!defaultArea) return;

    const deltaX = Number(defaultArea.x ?? 0) - Number(area.x ?? 0);
    const deltaZ = Number(defaultArea.z ?? 0) - Number(area.z ?? 0);
    const deltaRotation = Number(defaultArea.rotation ?? 0) - Number(area.rotation ?? 0);

    geometryFields.forEach((fieldName) => {
      area[fieldName] = defaultArea[fieldName];
    });

    [...nextState.machines, ...nextState.people].forEach((item) => {
      if (item.areaId !== area.id) return;
      item.x = round(Number(item.x ?? 0) + deltaX);
      item.z = round(Number(item.z ?? 0) + deltaZ);
      if ("rotation" in item) item.rotation = round(Number(item.rotation ?? 0) + deltaRotation);
    });
  });
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function initScene() {
  const mount = document.querySelector("#sceneMount");

  scene = new THREE.Scene();
  scene.background = new THREE.Color("#d8d9d2");

  camera = new THREE.PerspectiveCamera(46, mount.clientWidth / mount.clientHeight, 0.1, 500);
  camera.position.set(45, 58, 78);

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute("data-testid", "facility-canvas");
  mount.appendChild(renderer.domElement);

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(mount.clientWidth, mount.clientHeight);
  labelRenderer.domElement.className = "label-layer";
  labelRenderer.domElement.style.pointerEvents = "none";
  mount.appendChild(labelRenderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(5, 0, 5);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableRotate = false;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 28;
  controls.maxDistance = 145;

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  const hemi = new THREE.HemisphereLight("#fff7e7", "#5f665d", 2.2);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight("#fff5dc", 2.6);
  sun.position.set(-45, 75, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  scene.add(sun);

  renderer.domElement.addEventListener("pointerdown", configureControlsForPointer, true);
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointerup", resetPointerControlMode, true);
  window.addEventListener("resize", resizeScene);

  const resizeObserver = new ResizeObserver(resizeScene);
  resizeObserver.observe(mount);
}

function resizeScene() {
  const mount = document.querySelector("#sceneMount");
  if (!mount || !renderer || !camera) return;
  const width = mount.clientWidth;
  const height = mount.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  labelRenderer.setSize(width, height);
}

function buildScene() {
  if (worldGroup) {
    scene.remove(worldGroup);
  }

  worldGroup = new THREE.Group();
  worldGroup.name = "facility-world";
  scene.add(worldGroup);
  selectables = [];
  objectByKey = new Map();

  addGround();
  if (ui.showAreas) state.areas.forEach(addArea);
  if (ui.showMachines) state.machines.forEach(addMachine);
  if (ui.showPeople) state.people.forEach(addPerson);
}

function addGround() {
  const mapCalibration = getMapCalibration();
  const baseGeometry = new THREE.PlaneGeometry(
    Math.max(140, mapCalibration.width + 12),
    Math.max(88, mapCalibration.depth + 12),
  );
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: "#c8c2b5",
    roughness: 0.95,
    metalness: 0.02,
  });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.06;
  base.receiveShadow = true;
  worldGroup.add(base);

  const texture = new THREE.TextureLoader().load(IMAGE_PATH);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const mapGeometry = new THREE.PlaneGeometry(mapCalibration.width, mapCalibration.depth);
  const mapMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: ui.showMap ? mapCalibration.opacity : 0.08,
  });
  const mapGroup = new THREE.Group();
  mapGroup.position.set(mapCalibration.x, 0, mapCalibration.z);
  mapGroup.rotation.y = degrees(mapCalibration.rotation);
  mapGroup.name = "satellite-reference-calibration";
  worldGroup.add(mapGroup);

  const map = new THREE.Mesh(mapGeometry, mapMaterial);
  map.rotation.x = -Math.PI / 2;
  map.position.y = -0.025;
  map.name = "satellite-reference";
  mapGroup.add(map);

  const gridSize = Math.max(140, mapCalibration.width + 12, mapCalibration.depth + 12);
  const grid = new THREE.GridHelper(gridSize, 28, "#ffffff", "#858780");
  grid.position.y = 0.02;
  grid.material.opacity = 0.28;
  grid.material.transparent = true;
  worldGroup.add(grid);
}

function addArea(area) {
  const height = area.height ?? 0.16;
  const group = new THREE.Group();
  group.position.set(area.x, 0, area.z);
  group.rotation.y = degrees(area.rotation ?? 0);
  group.userData = { kind: "area", id: area.id };
  worldGroup.add(group);
  objectByKey.set(keyFor("area", area.id), group);

  const material = new THREE.MeshStandardMaterial({
    color: area.color ?? "#acb5b0",
    roughness: 0.82,
    metalness: area.type === "edificio" ? 0.08 : 0.02,
    transparent: true,
    opacity: area.type === "referencia" ? 0.72 : 0.86,
    emissive: isSelected("area", area.id) ? "#203c47" : "#000000",
    emissiveIntensity: isSelected("area", area.id) ? 0.18 : 0,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(area.width, height, area.depth), material);
  mesh.position.y = height / 2;
  mesh.castShadow = area.type === "edificio" || area.type === "servicio";
  mesh.receiveShadow = true;
  mesh.userData = { kind: "area", id: area.id };
  group.add(mesh);
  selectables.push(mesh);

  const edgeMaterial = new THREE.LineBasicMaterial({
    color: isSelected("area", area.id) ? "#102f3a" : "#ffffff",
    transparent: true,
    opacity: isSelected("area", area.id) ? 0.95 : 0.45,
  });
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMaterial);
  edges.position.copy(mesh.position);
  group.add(edges);

  if (area.type === "edificio") {
    addRoofRibs(group, area);
  }
  if (area.id === "area-nave-solar") {
    addSolarPanels(group, area);
  }
  if (area.type === "patio") {
    addStockBlocks(group, area);
  }

  if (ui.showLabels) {
    const label = makeLabel(area.name, "label label-area");
    label.position.set(0, height + 0.7, 0);
    group.add(label);
  }
}

function addRoofRibs(group, area) {
  const count = Math.max(3, Math.round(area.width / 7));
  const step = area.width / (count + 1);
  const ribMaterial = new THREE.MeshStandardMaterial({
    color: "#f0f2ed",
    roughness: 0.7,
    metalness: 0.02,
  });
  for (let index = 1; index <= count; index += 1) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, area.depth + 0.25), ribMaterial);
    rib.position.set(-area.width / 2 + step * index, (area.height ?? 0) + 0.05, 0);
    group.add(rib);
  }
}

function addSolarPanels(group, area) {
  const panelMaterial = new THREE.MeshStandardMaterial({
    color: "#253846",
    roughness: 0.35,
    metalness: 0.35,
  });
  for (let row = -2; row <= 2; row += 1) {
    for (let col = -1; col <= 1; col += 1) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.07, 2.2), panelMaterial);
      panel.position.set(col * 5.6, (area.height ?? 0) + 0.13, row * 4.6);
      group.add(panel);
    }
  }
}

function addStockBlocks(group, area) {
  const blockMaterial = new THREE.MeshStandardMaterial({
    color: "#9a8061",
    roughness: 0.9,
    metalness: 0.01,
  });
  const seed = area.id.length;
  const rows = Math.min(5, Math.max(2, Math.round(area.depth / 7)));
  const cols = Math.min(8, Math.max(3, Math.round(area.width / 8)));
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if ((row + col + seed) % 3 === 0) continue;
      const w = 1.2 + ((row + seed) % 3) * 0.35;
      const d = 2.1 + ((col + seed) % 3) * 0.45;
      const h = 0.45 + ((row + col) % 3) * 0.18;
      const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), blockMaterial);
      block.position.set(
        -area.width / 2 + 3.5 + col * Math.max(4, area.width / (cols + 0.5)),
        h / 2 + 0.16,
        -area.depth / 2 + 3 + row * Math.max(4.5, area.depth / (rows + 0.5)),
      );
      block.castShadow = true;
      block.receiveShadow = true;
      group.add(block);
    }
  }
}

function addMachine(machine) {
  const group = new THREE.Group();
  group.position.set(machine.x, 0.08, machine.z);
  group.rotation.y = degrees(machine.rotation ?? 0);
  group.userData = { kind: "machine", id: machine.id };
  worldGroup.add(group);
  objectByKey.set(keyFor("machine", machine.id), group);

  const selected = isSelected("machine", machine.id);
  const color = MACHINE_COLORS[machine.category] ?? "#59636c";
  const baseMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.18,
    emissive: selected ? "#ffffff" : "#000000",
    emissiveIntensity: selected ? 0.12 : 0,
  });
  const capMaterial = new THREE.MeshStandardMaterial({
    color: selected ? "#f8e7a6" : "#e8e2cc",
    roughness: 0.7,
    metalness: 0.05,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 0.24, 28), capMaterial);
  base.position.y = 0.16;
  base.castShadow = true;
  base.receiveShadow = true;
  base.userData = { kind: "machine", id: machine.id };
  group.add(base);
  selectables.push(base);

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.86, 1.55), baseMaterial);
  body.position.y = 0.78;
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData = { kind: "machine", id: machine.id };
  group.add(body);
  selectables.push(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.42, 1.75), capMaterial);
  head.position.set(0.32, 1.38, 0);
  head.castShadow = true;
  head.userData = { kind: "machine", id: machine.id };
  group.add(head);
  selectables.push(head);

  if (selected) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.05, 0.035, 8, 72),
      new THREE.MeshBasicMaterial({ color: "#ffcf5c" }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08;
    group.add(ring);
  }

  if (ui.showLabels && selected) {
    const label = makeLabel(`${machine.code}. ${machine.name}`, "label label-machine");
    label.position.set(0, 2.05, 0);
    group.add(label);
  }
}

function addPerson(person) {
  const group = new THREE.Group();
  group.position.set(person.x, 0.08, person.z);
  group.userData = { kind: "person", id: person.id };
  worldGroup.add(group);
  objectByKey.set(keyFor("person", person.id), group);

  const selected = isSelected("person", person.id);
  const color = PERSON_COLORS[person.shift] ?? "#5c7a63";
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.05,
    emissive: selected ? "#fff3bc" : "#000000",
    emissiveIntensity: selected ? 0.18 : 0,
  });
  const light = new THREE.MeshStandardMaterial({
    color: "#f4ead8",
    roughness: 0.75,
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.62, 1.35, 22), material);
  body.position.y = 0.82;
  body.castShadow = true;
  body.userData = { kind: "person", id: person.id };
  group.add(body);
  selectables.push(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 16), light);
  head.position.y = 1.7;
  head.castShadow = true;
  head.userData = { kind: "person", id: person.id };
  group.add(head);
  selectables.push(head);

  if (selected) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.08, 0.035, 8, 60),
      new THREE.MeshBasicMaterial({ color: "#ffcf5c" }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08;
    group.add(ring);
  }

  if (ui.showLabels && selected) {
    const label = makeLabel(`${person.name} | ${person.role}`, "label label-person");
    label.position.set(0, 2.25, 0);
    group.add(label);
  }
}

function makeLabel(text, className) {
  const node = document.createElement("div");
  node.className = className;
  node.textContent = text;
  return new CSS2DObject(node);
}

function animate() {
  animationId = requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

function renderTopbar() {
  document.querySelector("#topbar").innerHTML = `
    <div class="view-buttons" aria-label="Vistas">
      <button class="toolbar-button" data-view="general">Vista general</button>
      <button class="toolbar-button" data-view="top">Planta</button>
      <button class="toolbar-button" data-view="production">Produccion</button>
      <button class="toolbar-button" data-view="yards">Patios</button>
    </div>
    <div class="view-buttons" aria-label="Capas">
      <button class="toolbar-button is-action" data-action="align-base">Alinear base</button>
      ${toggleButton("map", "Plano", ui.showMap)}
      ${toggleButton("labels", "Etiquetas", ui.showLabels)}
      ${toggleButton("areas", "Zonas", ui.showAreas)}
      ${toggleButton("machines", "Maquinas", ui.showMachines)}
      ${toggleButton("people", "Personal", ui.showPeople)}
      ${toggleButton("edit", "Editar", ui.editMode)}
    </div>
  `;

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setCameraPreset(button.dataset.view));
  });

  document.querySelectorAll("[data-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.toggle;
      if (key === "map") ui.showMap = !ui.showMap;
      if (key === "labels") ui.showLabels = !ui.showLabels;
      if (key === "areas") ui.showAreas = !ui.showAreas;
      if (key === "machines") ui.showMachines = !ui.showMachines;
      if (key === "people") ui.showPeople = !ui.showPeople;
      if (key === "edit") ui.editMode = !ui.editMode;
      renderTopbar();
      buildScene();
    });
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.action === "align-base") alignBase();
    });
  });
}

function toggleButton(key, label, active) {
  return `<button class="toolbar-button ${active ? "is-active" : ""}" data-toggle="${key}" aria-pressed="${active}">${label}</button>`;
}

function setCameraPreset(preset) {
  const presets = {
    general: { position: [45, 58, 78], target: [5, 0, 5] },
    top: { position: [0, 118, 0.1], target: [0, 0, 0] },
    production: { position: [22, 36, 52], target: [10, 0, 14] },
    yards: { position: [-52, 42, 54], target: [-25, 0, 15] },
  };
  const next = presets[preset] ?? presets.general;
  camera.position.set(...next.position);
  controls.target.set(...next.target);
  controls.update();
}

function renderPanel() {
  const panel = document.querySelector("#panel");
  panel.innerHTML = `
    <header class="panel-header">
      <div>
        <p class="eyebrow">MVP editable</p>
        <h1>Mapa 3D instalaciones</h1>
      </div>
      <div class="status-pill">Local</div>
    </header>

    <section class="stats-row" aria-label="Resumen">
      <div><strong>${state.areas.length}</strong><span>Zonas</span></div>
      <div><strong>${state.machines.length}</strong><span>Maquinas</span></div>
      <div><strong>${state.people.length}</strong><span>Personas</span></div>
    </section>

    <nav class="tabs" aria-label="Tipo de elemento">
      ${tabButton("areas", "Zonas")}
      ${tabButton("machines", "Maquinaria")}
      ${tabButton("people", "Personal")}
    </nav>

    <div class="quick-actions">
      <button class="action-button" data-add="machine">Anadir maquina</button>
      <button class="action-button" data-add="person">Anadir persona</button>
      <button class="action-button secondary" data-add="area">Anadir zona</button>
    </div>

    <label class="search-box">
      <span>Buscar</span>
      <input id="searchInput" type="search" value="${escapeHtml(ui.search)}" placeholder="Nombre, rol, servicio..." />
    </label>

    <details class="map-calibration" open>
      <summary>Calibrar plano satelite</summary>
      <div class="calibration-actions">
        <button class="action-button secondary" id="alignBasePanel">Alinear base</button>
        <button class="action-button secondary" id="restoreMap">Solo plano</button>
      </div>
      <div class="form-grid map-form">
        ${mapCalibrationFields()}
      </div>
    </details>

    <section class="entity-list" aria-label="Elementos">
      ${renderEntityList()}
    </section>

    <section class="editor" aria-label="Editor">
      ${renderEditor()}
    </section>

    <section class="data-actions" aria-label="Datos">
      <button class="action-button secondary" id="exportData">Exportar JSON</button>
      <label class="action-button secondary file-action">
        Importar JSON
        <input id="importData" type="file" accept="application/json" />
      </label>
      <button class="action-button secondary" id="restoreAreas">Restaurar zonas</button>
      <button class="action-button danger" id="resetData">Restaurar demo</button>
    </section>

    <p class="source-note">Fuente inicial: captura de Google Maps y nota curada de maquinas. Ubicaciones aproximadas pendientes de validar en planta.</p>
  `;

  bindPanelEvents();
}

function tabButton(key, label) {
  return `<button class="tab-button ${ui.activeTab === key ? "is-active" : ""}" data-tab="${key}">${label}</button>`;
}

function renderEntityList() {
  const items = getActiveItems();
  if (!items.length) {
    return `<div class="empty-state">No hay resultados con ese filtro.</div>`;
  }

  return items
    .map((item) => {
      const selected = isSelected(kindFromTab(ui.activeTab), item.id);
      const subtitle = subtitleFor(item, ui.activeTab);
      return `
        <button class="entity-item ${selected ? "is-selected" : ""}" data-select-kind="${kindFromTab(ui.activeTab)}" data-select-id="${item.id}">
          <span class="entity-title">${escapeHtml(item.name)}</span>
          <span class="entity-subtitle">${escapeHtml(subtitle)}</span>
        </button>
      `;
    })
    .join("");
}

function getActiveItems() {
  const source = ui.activeTab === "areas" ? state.areas : ui.activeTab === "people" ? state.people : state.machines;
  const query = ui.search.trim().toLowerCase();
  if (!query) return source;
  return source.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
}

function subtitleFor(item, tab) {
  if (tab === "areas") return `${item.use} | ${item.type}`;
  if (tab === "people") return `${item.role} | ${item.shift} | ${areaName(item.areaId)}`;
  return `${item.code} | ${item.category} | ${areaName(item.areaId)}`;
}

function renderEditor() {
  const entity = getSelectedEntity();
  if (!entity) {
    return `<div class="empty-state">Selecciona un elemento o anade uno nuevo.</div>`;
  }

  const { kind, id } = ui.selected;
  const title = kind === "area" ? "Editar zona" : kind === "person" ? "Editar persona" : "Editar maquina";
  const body =
    kind === "area"
      ? areaFields(entity)
      : kind === "person"
        ? personFields(entity)
        : machineFields(entity);

  return `
    <div class="editor-heading">
      <div>
        <p class="eyebrow">${title}</p>
        <h2>${escapeHtml(entity.name)}</h2>
      </div>
      <button class="small-button" data-focus-selected="${kind}:${id}">Centrar</button>
    </div>
    <div class="form-grid">
      ${body}
    </div>
    <div class="editor-actions">
      <button class="action-button secondary" data-duplicate="${kind}:${id}">Duplicar</button>
      <button class="action-button danger" data-delete="${kind}:${id}">Eliminar</button>
    </div>
  `;
}

function machineFields(machine) {
  return [
    field("name", "Nombre", machine.name),
    field("code", "Codigo", machine.code),
    field("category", "Categoria", machine.category),
    field("unit", "Unidad", machine.unit),
    selectField("areaId", "Zona", machine.areaId, state.areas.map((area) => [area.id, area.name])),
    field("status", "Estado", machine.status),
    field("assignedTo", "Persona asignada", machine.assignedTo),
    field("x", "X", machine.x, "number", "0.1"),
    field("z", "Z", machine.z, "number", "0.1"),
    field("rotation", "Rotacion", machine.rotation ?? 0, "number", "1"),
    textareaField("services", "Servicios", machine.services.join("\n")),
    textareaField("notes", "Notas", machine.notes),
  ].join("");
}

function personFields(person) {
  return [
    field("name", "Nombre", person.name),
    field("role", "Rol", person.role),
    selectField("shift", "Turno", person.shift, [
      ["Manana", "Manana"],
      ["Tarde", "Tarde"],
      ["Noche", "Noche"],
    ]),
    selectField("areaId", "Zona", person.areaId, state.areas.map((area) => [area.id, area.name])),
    field("status", "Estado", person.status),
    field("x", "X", person.x, "number", "0.1"),
    field("z", "Z", person.z, "number", "0.1"),
    textareaField("notes", "Notas", person.notes),
  ].join("");
}

function areaFields(area) {
  return [
    field("name", "Nombre", area.name),
    field("use", "Uso", area.use),
    selectField("type", "Tipo", area.type, [
      ["edificio", "Edificio"],
      ["patio", "Patio"],
      ["servicio", "Servicio"],
      ["referencia", "Referencia"],
    ]),
    field("color", "Color", area.color, "color"),
    field("x", "X", area.x, "number", "0.1"),
    field("z", "Z", area.z, "number", "0.1"),
    field("width", "Ancho", area.width, "number", "0.1"),
    field("depth", "Fondo", area.depth, "number", "0.1"),
    field("height", "Altura", area.height, "number", "0.1"),
    field("rotation", "Rotacion", area.rotation ?? 0, "number", "1"),
    textareaField("notes", "Notas", area.notes),
  ].join("");
}

function field(name, label, value, type = "text", step = "") {
  return `
    <label class="field">
      <span>${label}</span>
      <input data-field="${name}" type="${type}" ${step ? `step="${step}"` : ""} value="${escapeHtml(String(value ?? ""))}" />
    </label>
  `;
}

function textareaField(name, label, value) {
  return `
    <label class="field field-wide">
      <span>${label}</span>
      <textarea data-field="${name}" rows="3">${escapeHtml(String(value ?? ""))}</textarea>
    </label>
  `;
}

function selectField(name, label, value, options) {
  return `
    <label class="field">
      <span>${label}</span>
      <select data-field="${name}">
        ${options.map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}
      </select>
    </label>
  `;
}

function bindPanelEvents() {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.activeTab = button.dataset.tab;
      const first = getActiveItems()[0];
      if (first) ui.selected = { kind: kindFromTab(ui.activeTab), id: first.id };
      renderPanel();
      buildScene();
    });
  });

  document.querySelector("#searchInput").addEventListener("input", (event) => {
    ui.search = event.currentTarget.value;
    document.querySelector(".entity-list").innerHTML = renderEntityList();
    bindEntityButtons();
  });

  bindEntityButtons();

  document.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => addEntity(button.dataset.add));
  });

  document.querySelectorAll("[data-field]").forEach((input) => {
    input.addEventListener("input", () => updateSelectedField(input.dataset.field, input.value, input.type));
  });

  document.querySelectorAll("[data-map-field]").forEach((input) => {
    input.addEventListener("input", () => updateMapCalibration(input.dataset.mapField, input.value));
  });

  document.querySelectorAll("[data-focus-selected]").forEach((button) => {
    button.addEventListener("click", () => focusSelection());
  });

  document.querySelectorAll("[data-duplicate]").forEach((button) => {
    button.addEventListener("click", () => duplicateEntity(button.dataset.duplicate));
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteEntity(button.dataset.delete));
  });

  document.querySelector("#exportData").addEventListener("click", exportData);
  document.querySelector("#importData").addEventListener("change", importData);
  document.querySelector("#restoreAreas").addEventListener("click", restoreAreas);
  document.querySelector("#alignBasePanel").addEventListener("click", alignBase);
  document.querySelector("#restoreMap").addEventListener("click", restoreMapCalibration);
  document.querySelector("#resetData").addEventListener("click", resetData);
}

function bindEntityButtons() {
  document.querySelectorAll("[data-select-kind]").forEach((button) => {
    button.addEventListener("click", () => {
      setSelected(button.dataset.selectKind, button.dataset.selectId, true);
    });
  });
}

function updateSelectedField(fieldName, rawValue, type) {
  const entity = getSelectedEntity();
  if (!entity) return;

  if (fieldName === "services") {
    entity.services = rawValue
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  } else if (["x", "z", "rotation", "width", "depth", "height"].includes(fieldName) || type === "number") {
    entity[fieldName] = Number.parseFloat(rawValue) || 0;
  } else {
    entity[fieldName] = rawValue;
  }

  if (fieldName === "areaId") {
    const area = state.areas.find((candidate) => candidate.id === rawValue);
    if (area && ui.selected.kind !== "area") {
      entity.x = area.x;
      entity.z = area.z;
    }
  }

  saveState();
  buildScene();
  updateEntityListOnly();
}

function updateEntityListOnly() {
  const list = document.querySelector(".entity-list");
  if (!list) return;
  list.innerHTML = renderEntityList();
  bindEntityButtons();
}

function addEntity(kind) {
  if (kind === "area") {
    const newArea = {
      id: makeId("area"),
      name: "Nueva zona",
      use: "Pendiente definir",
      type: "patio",
      x: 0,
      z: 0,
      width: 12,
      depth: 8,
      height: 0.16,
      rotation: 0,
      color: "#b8a96f",
      notes: "",
    };
    state.areas.push(newArea);
    ui.activeTab = "areas";
    ui.selected = { kind: "area", id: newArea.id };
  }

  if (kind === "machine") {
    const area = state.areas.find((candidate) => candidate.type !== "referencia") ?? state.areas[0];
    const newMachine = {
      id: makeId("maq"),
      code: String(state.machines.length + 1),
      name: "Nueva maquina",
      category: "Pendiente",
      unit: "M2",
      areaId: area?.id ?? "",
      status: "Pendiente documentar",
      x: (area?.x ?? 0) + 2,
      z: (area?.z ?? 0) + 2,
      rotation: area?.rotation ?? 0,
      services: [],
      assignedTo: "",
      notes: "",
    };
    state.machines.push(newMachine);
    ui.activeTab = "machines";
    ui.selected = { kind: "machine", id: newMachine.id };
  }

  if (kind === "person") {
    const area = state.areas.find((candidate) => candidate.type !== "referencia") ?? state.areas[0];
    const newPerson = {
      id: makeId("per"),
      name: "Nueva persona",
      role: "Pendiente definir",
      shift: "Manana",
      areaId: area?.id ?? "",
      status: "Pendiente validar",
      x: (area?.x ?? 0) - 2,
      z: (area?.z ?? 0) - 2,
      notes: "",
    };
    state.people.push(newPerson);
    ui.activeTab = "people";
    ui.selected = { kind: "person", id: newPerson.id };
  }

  saveState();
  renderTopbar();
  renderPanel();
  buildScene();
  focusSelection();
  toast("Elemento anadido. Puedes arrastrarlo sobre el mapa.");
}

function duplicateEntity(payload) {
  const [kind, id] = payload.split(":");
  const list = listForKind(kind);
  const source = list.find((item) => item.id === id);
  if (!source) return;

  const copy = structuredCloneSafe(source);
  copy.id = makeId(kind === "area" ? "area" : kind === "person" ? "per" : "maq");
  copy.name = `${copy.name} copia`;
  copy.x = Number(copy.x ?? 0) + 3;
  copy.z = Number(copy.z ?? 0) + 3;
  list.push(copy);
  ui.selected = { kind, id: copy.id };
  ui.activeTab = tabFromKind(kind);
  saveState();
  renderPanel();
  buildScene();
  toast("Copia creada.");
}

function deleteEntity(payload) {
  const [kind, id] = payload.split(":");
  const entity = listForKind(kind).find((item) => item.id === id);
  if (!entity) return;
  if (!window.confirm(`Eliminar "${entity.name}"?`)) return;

  if (kind === "area") {
    state.areas = state.areas.filter((item) => item.id !== id);
    state.machines.forEach((machine) => {
      if (machine.areaId === id) machine.areaId = state.areas[0]?.id ?? "";
    });
    state.people.forEach((person) => {
      if (person.areaId === id) person.areaId = state.areas[0]?.id ?? "";
    });
  }
  if (kind === "machine") state.machines = state.machines.filter((item) => item.id !== id);
  if (kind === "person") state.people = state.people.filter((item) => item.id !== id);

  const next = listForKind(kind)[0];
  ui.selected = next ? { kind, id: next.id } : { kind, id: null };
  saveState();
  renderPanel();
  buildScene();
  toast("Elemento eliminado.");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pulycort-mapa-3d-instalaciones.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast("JSON exportado.");
}

function importData(event) {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(String(reader.result));
      if (!Array.isArray(imported.areas) || !Array.isArray(imported.machines) || !Array.isArray(imported.people)) {
        throw new Error("Formato no valido");
      }
      Object.assign(state, imported);
      ui.activeTab = "machines";
      ui.selected = { kind: "machine", id: state.machines[0]?.id ?? null };
      saveState();
      renderPanel();
      buildScene();
      toast("Datos importados.");
    } catch {
      toast("No he podido importar ese JSON.");
    }
  };
  reader.readAsText(file);
  event.currentTarget.value = "";
}

function mapCalibrationFields() {
  const map = getMapCalibration();
  return [
    mapField("x", "Plano X", map.x, "0.1"),
    mapField("z", "Plano Z", map.z, "0.1"),
    mapField("width", "Ancho plano", map.width, "0.1"),
    mapField("depth", "Fondo plano", map.depth, "0.1"),
    mapField("rotation", "Rotacion", map.rotation, "0.5"),
    mapField("opacity", "Opacidad", map.opacity, "0.01", "0", "1"),
  ].join("");
}

function mapField(name, label, value, step, min = "", max = "") {
  return `
    <label class="field">
      <span>${label}</span>
      <input data-map-field="${name}" type="number" step="${step}" ${min ? `min="${min}"` : ""} ${max ? `max="${max}"` : ""} value="${escapeHtml(String(value ?? ""))}" />
    </label>
  `;
}

function updateMapCalibration(fieldName, rawValue) {
  const map = getMapCalibration();
  const next = Number.parseFloat(rawValue);
  if (!Number.isFinite(next)) return;

  map[fieldName] = fieldName === "opacity" ? clamp(next, 0, 1) : next;
  state.meta.mapCalibration = map;
  saveState();
  buildScene();
}

function restoreMapCalibration() {
  state.meta.mapCalibration = structuredCloneSafe(DEFAULT_STATE.meta.mapCalibration);
  saveState();
  renderPanel();
  buildScene();
  toast("Plano satelite alineado con la base.");
}

function alignBase() {
  state.meta.mapCalibration = structuredCloneSafe(DEFAULT_STATE.meta.mapCalibration);
  restoreAreas({ silent: true });
  renderPanel();
  buildScene();
  setCameraPreset("top");
  toast("Base alineada: plano, naves y contenidos asignados.");
}

function restoreAreas(options = {}) {
  const geometryFields = ["x", "z", "width", "depth", "height", "rotation"];
  const currentById = new Map(state.areas.map((area) => [area.id, area]));

  DEFAULT_STATE.areas.forEach((defaultArea) => {
    const current = currentById.get(defaultArea.id);
    if (!current) {
      state.areas.push(structuredCloneSafe(defaultArea));
      return;
    }

    const deltaX = Number(defaultArea.x ?? 0) - Number(current.x ?? 0);
    const deltaZ = Number(defaultArea.z ?? 0) - Number(current.z ?? 0);
    const deltaRotation = Number(defaultArea.rotation ?? 0) - Number(current.rotation ?? 0);

    geometryFields.forEach((fieldName) => {
      current[fieldName] = defaultArea[fieldName];
    });

    [...state.machines, ...state.people].forEach((item) => {
      if (item.areaId !== current.id) return;
      item.x = round(Number(item.x ?? 0) + deltaX);
      item.z = round(Number(item.z ?? 0) + deltaZ);
      if ("rotation" in item) item.rotation = round(Number(item.rotation ?? 0) + deltaRotation);
    });
  });

  saveState();
  if (!options.silent) {
    renderPanel();
    buildScene();
    toast("Zonas restauradas. Maquinaria y personal se desplazan con su zona.");
  }
}

function resetData() {
  if (!window.confirm("Restaurar datos demo y perder cambios locales?")) return;
  const fresh = structuredCloneSafe(DEFAULT_STATE);
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, fresh);
  ui.activeTab = "machines";
  ui.selected = { kind: "machine", id: state.machines[0]?.id ?? null };
  saveState();
  renderPanel();
  buildScene();
  toast("Datos demo restaurados.");
}

function onPointerDown(event) {
  if (isCameraRotateGesture(event)) return;

  const hit = firstHit(event);
  if (!hit) return;

  const data = nearestUserData(hit.object);
  if (!data) return;

  setSelected(data.kind, data.id, false);

  if (ui.editMode && (data.kind === "machine" || data.kind === "person" || data.kind === "area")) {
    dragging = {
      kind: data.kind,
      id: data.id,
      moved: false,
      object: objectByKey.get(keyFor(data.kind, data.id)),
    };
    controls.enabled = false;
    renderer.domElement.setPointerCapture(event.pointerId);
  }
}

function onPointerMove(event) {
  if (!dragging) return;
  const point = groundPoint(event);
  if (!point) return;

  const entity = listForKind(dragging.kind).find((item) => item.id === dragging.id);
  if (!entity) return;

  entity.x = round(point.x);
  entity.z = round(point.z);
  dragging.moved = true;

  const object = dragging.object;
  if (object) {
    object.position.x = entity.x;
    object.position.z = entity.z;
  }

  const xInput = document.querySelector('[data-field="x"]');
  const zInput = document.querySelector('[data-field="z"]');
  if (xInput && isSelected(dragging.kind, dragging.id)) xInput.value = entity.x;
  if (zInput && isSelected(dragging.kind, dragging.id)) zInput.value = entity.z;
}

function onPointerUp(event) {
  if (!dragging) return;
  controls.enabled = true;
  try {
    renderer.domElement.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer may have left the canvas.
  }
  if (dragging.moved) {
    saveState();
    updateEntityListOnly();
    toast("Posicion actualizada.");
  }
  dragging = null;
}

function configureControlsForPointer(event) {
  controls.enableRotate = isCameraRotateGesture(event);
  controls.enablePan = event.button === 2;
}

function resetPointerControlMode() {
  window.setTimeout(() => {
    controls.enableRotate = false;
    controls.enablePan = true;
  }, 0);
}

function isCameraRotateGesture(event) {
  return event.button === 1 || (event.button === 0 && (event.ctrlKey || event.metaKey));
}

function firstHit(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(selectables, true)[0] ?? null;
}

function groundPoint(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(groundPlane, point);
}

function nearestUserData(object) {
  let current = object;
  while (current) {
    if (current.userData?.kind && current.userData?.id) return current.userData;
    current = current.parent;
  }
  return null;
}

function setSelected(kind, id, shouldRenderPanel) {
  ui.selected = { kind, id };
  ui.activeTab = tabFromKind(kind);
  if (shouldRenderPanel) renderPanel();
  buildScene();
  focusSelection();
}

function focusSelection() {
  const entity = getSelectedEntity();
  if (!entity) return;
  controls.target.set(Number(entity.x ?? 0), 0, Number(entity.z ?? 0));
  const distance = ui.selected.kind === "area" ? 42 : 26;
  camera.position.set(Number(entity.x ?? 0) + distance * 0.55, 30, Number(entity.z ?? 0) + distance);
  controls.update();
}

function getSelectedEntity() {
  if (!ui.selected.id) return null;
  return listForKind(ui.selected.kind).find((item) => item.id === ui.selected.id) ?? null;
}

function listForKind(kind) {
  if (kind === "area") return state.areas;
  if (kind === "person") return state.people;
  return state.machines;
}

function kindFromTab(tab) {
  if (tab === "areas") return "area";
  if (tab === "people") return "person";
  return "machine";
}

function tabFromKind(kind) {
  if (kind === "area") return "areas";
  if (kind === "person") return "people";
  return "machines";
}

function areaName(areaId) {
  return state.areas.find((area) => area.id === areaId)?.name ?? "Sin zona";
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function keyFor(kind, id) {
  return `${kind}:${id}`;
}

function isSelected(kind, id) {
  return ui.selected.kind === kind && ui.selected.id === id;
}

function degrees(value) {
  return THREE.MathUtils.degToRad(Number(value) || 0);
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getMapCalibration() {
  const fallback = DEFAULT_STATE.meta.mapCalibration;
  const current = state.meta?.mapCalibration ?? {};
  const merged = { ...fallback, ...current };

  MAP_CALIBRATION_FIELDS.forEach((fieldName) => {
    const value = Number(merged[fieldName]);
    merged[fieldName] = Number.isFinite(value) ? value : fallback[fieldName];
  });
  merged.opacity = clamp(merged.opacity, 0, 1);

  if (!state.meta) state.meta = {};
  state.meta.mapCalibration = merged;
  return merged;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toast(message) {
  const node = document.querySelector("#toast");
  node.textContent = message;
  node.classList.add("is-visible");
  window.clearTimeout(toast.timeout);
  toast.timeout = window.setTimeout(() => node.classList.remove("is-visible"), 2300);
}

window.addEventListener("beforeunload", () => {
  if (animationId) cancelAnimationFrame(animationId);
});
