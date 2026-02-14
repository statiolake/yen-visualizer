import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const amountInput = document.querySelector("#amountInput");
const dropButton = document.querySelector("#dropButton");
const clearButton = document.querySelector("#clearButton");
const statusLine = document.querySelector("#statusLine");
const hintLine = document.querySelector("#hintLine");
const viewport = document.querySelector("#viewport");

const IMAGE_DIR = "./money_images";
const NOTE_WIDTH = 1.5;
const NOTE_DEPTH = 0.68;
const NOTE_THICKNESS = 0.032;
const DEFAULT_BILL_ASPECT = NOTE_WIDTH / NOTE_DEPTH;
const DROP_HEIGHT = 4.2;
const MAX_VISUAL_ITEMS = 850;

const PILE_RADIUS = 1.75;
const GRID_CELL_SIZE = 0.16;
const GRID_CELLS = Math.ceil((PILE_RADIUS * 2) / GRID_CELL_SIZE);
const GRID_HALF = Math.floor(GRID_CELLS / 2);

const DENOMINATIONS = [
  {
    value: 10000,
    label: "1万円札",
    kind: "bill",
    front: "money_10000_shibusawa.png",
    back: "money_10000_shibusawa.png",
    edgeColor: 0x9cb78f,
    aspect: DEFAULT_BILL_ASPECT
  },
  {
    value: 5000,
    label: "5千円札",
    kind: "bill",
    front: "money_5000_tsuda.png",
    back: "money_5000_tsuda.png",
    edgeColor: 0x95b182,
    aspect: DEFAULT_BILL_ASPECT
  },
  {
    value: 1000,
    label: "千円札",
    kind: "bill",
    front: "money_1000_kitazato.png",
    back: "money_1000_kitazato.png",
    edgeColor: 0x94b08f,
    aspect: DEFAULT_BILL_ASPECT
  },
  {
    value: 500,
    label: "500円硬貨",
    kind: "coin",
    front: "money_coin_blank_500_new.png",
    back: "money_coin_blank_500.png",
    radius: 0.165,
    thickness: 0.026,
    rimColor: 0xbab07f
  },
  {
    value: 100,
    label: "100円硬貨",
    kind: "coin",
    front: "money_coin_blank_100.png",
    back: "money_coin_blank_100.png",
    radius: 0.145,
    thickness: 0.022,
    rimColor: 0xbfc0c4
  },
  {
    value: 50,
    label: "50円硬貨",
    kind: "coin",
    front: "money_coin_blank_50.png",
    back: "money_coin_blank_50.png",
    radius: 0.136,
    thickness: 0.02,
    rimColor: 0xc0c2c5
  },
  {
    value: 10,
    label: "10円硬貨",
    kind: "coin",
    front: "money_coin_blank_10.png",
    back: "money_coin_blank_10.png",
    radius: 0.125,
    thickness: 0.02,
    rimColor: 0x9f6d43
  },
  {
    value: 5,
    label: "5円硬貨",
    kind: "coin",
    front: "money_coin_blank_5.png",
    back: "money_coin_blank_5.png",
    radius: 0.132,
    thickness: 0.019,
    rimColor: 0xb79f57
  },
  {
    value: 1,
    label: "1円硬貨",
    kind: "coin",
    front: "money_coin_blank_1.png",
    back: "money_coin_blank_1.png",
    radius: 0.118,
    thickness: 0.016,
    rimColor: 0xc6c6c6
  }
];

const placedCash = [];
const activeCash = [];
const pendingQueue = [];
const pileHeightGrid = new Float32Array(GRID_CELLS * GRID_CELLS);

let spawnAccumulator = 0;
let running = false;
let lastQueueMeta = null;
let assetsReady = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2b21);
scene.fog = new THREE.Fog(0x1b2b21, 3.8, 13);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
camera.position.set(0, 4.8, 6.3);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map();
const billMaterialCache = new Map();
const billGeometryCache = new Map();
const coinMaterialCache = new Map();
const coinGeometryCache = new Map();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.7, 0);
controls.minDistance = 2.8;
controls.maxDistance = 10.5;
controls.maxPolarAngle = Math.PI * 0.48;

const hemiLight = new THREE.HemisphereLight(0xf7f8e5, 0x1a221d, 0.95);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(4.5, 7.8, 4.5);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.left = -6;
dirLight.shadow.camera.right = 6;
dirLight.shadow.camera.top = 6;
dirLight.shadow.camera.bottom = -6;
scene.add(dirLight);

const table = new THREE.Mesh(
  new THREE.BoxGeometry(8.8, 0.5, 8.8),
  new THREE.MeshStandardMaterial({
    color: 0x4b3a2d,
    roughness: 0.85,
    metalness: 0.04
  })
);
table.position.y = -0.38;
table.receiveShadow = true;
scene.add(table);

const tableTop = new THREE.Mesh(
  new THREE.PlaneGeometry(8.8, 8.8, 1, 1),
  new THREE.MeshStandardMaterial({
    color: 0x4f422f,
    roughness: 0.88,
    metalness: 0.02
  })
);
tableTop.rotation.x = -Math.PI / 2;
tableTop.receiveShadow = true;
scene.add(tableTop);

function makeBillGeometry(width, depth) {
  const geometry = new THREE.BoxGeometry(width, NOTE_THICKNESS, depth, 8, 1, 4);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const bend = Math.sin((x / width) * Math.PI * 1.6) * 0.012;
    const wave = Math.sin((z / depth) * Math.PI * 2.2) * 0.006;
    pos.setY(i, y + bend + wave);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function analyzeOpaqueBounds(texture) {
  const image = texture.image;
  if (!image || !image.width || !image.height) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return null;
  }

  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, image.width, image.height).data;

  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = data[(y * image.width + x) * 4 + 3];
      if (alpha > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: image.width - 1,
      maxY: image.height - 1,
      width: image.width,
      height: image.height,
      aspect: image.width / image.height
    };
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    aspect: width / height
  };
}

function applyTextureCrop(texture, bounds) {
  const image = texture.image;
  const uMin = bounds.minX / image.width;
  const uMax = (bounds.maxX + 1) / image.width;
  const vTop = bounds.minY / image.height;
  const vBottom = (bounds.maxY + 1) / image.height;

  texture.repeat.set(uMax - uMin, vBottom - vTop);
  texture.offset.set(uMin, 1 - vBottom);
}

function configureTexture(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  const bounds = analyzeOpaqueBounds(texture);
  if (bounds) {
    applyTextureCrop(texture, bounds);
  }
  texture.needsUpdate = true;
  return bounds;
}

async function preloadTextures() {
  const files = [...new Set(DENOMINATIONS.flatMap((d) => [d.front, d.back]))];
  const loads = files.map(async (fileName) => {
    const filePath = `${IMAGE_DIR}/${fileName}`;
    const texture = await textureLoader.loadAsync(filePath);
    const bounds = configureTexture(texture);
    textureCache.set(filePath, { texture, bounds });
  });
  await Promise.all(loads);

  for (const denomination of DENOMINATIONS) {
    if (denomination.kind !== "bill") {
      continue;
    }
    const info = textureCache.get(`${IMAGE_DIR}/${denomination.front}`);
    if (info?.bounds?.aspect) {
      denomination.aspect = info.bounds.aspect;
    }
  }
}

function loadTexture(fileName) {
  const filePath = `${IMAGE_DIR}/${fileName}`;
  const info = textureCache.get(filePath);
  if (!info) {
    throw new Error(`Texture not preloaded: ${fileName}`);
  }
  return info.texture;
}

function getBillGeometry(denomination) {
  const aspect = Math.max(1.2, denomination.aspect || DEFAULT_BILL_ASPECT);
  const depth = NOTE_WIDTH / aspect;
  const key = `${denomination.value}:${depth.toFixed(4)}`;
  if (billGeometryCache.has(key)) {
    return billGeometryCache.get(key);
  }
  const item = {
    geometry: makeBillGeometry(NOTE_WIDTH, depth),
    width: NOTE_WIDTH,
    depth
  };
  billGeometryCache.set(key, item);
  return item;
}

function getBillMaterials(denomination) {
  if (billMaterialCache.has(denomination.value)) {
    return billMaterialCache.get(denomination.value);
  }

  const frontTexture = loadTexture(denomination.front);
  const backTexture = loadTexture(denomination.back);

  const materials = [
    new THREE.MeshStandardMaterial({
      color: denomination.edgeColor,
      roughness: 0.9,
      metalness: 0.02
    }),
    new THREE.MeshStandardMaterial({
      color: denomination.edgeColor,
      roughness: 0.9,
      metalness: 0.02
    }),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.01,
      map: frontTexture,
      transparent: true,
      alphaTest: 0.03
    }),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.01,
      map: backTexture,
      transparent: true,
      alphaTest: 0.03
    }),
    new THREE.MeshStandardMaterial({
      color: denomination.edgeColor,
      roughness: 0.88,
      metalness: 0.02
    }),
    new THREE.MeshStandardMaterial({
      color: denomination.edgeColor,
      roughness: 0.88,
      metalness: 0.02
    })
  ];

  billMaterialCache.set(denomination.value, materials);
  return materials;
}

function getCoinGeometry(denomination) {
  if (coinGeometryCache.has(denomination.value)) {
    return coinGeometryCache.get(denomination.value);
  }
  const geometry = new THREE.CylinderGeometry(
    denomination.radius,
    denomination.radius,
    denomination.thickness,
    36,
    1
  );
  coinGeometryCache.set(denomination.value, geometry);
  return geometry;
}

function getCoinMaterials(denomination) {
  if (coinMaterialCache.has(denomination.value)) {
    return coinMaterialCache.get(denomination.value);
  }

  const frontTexture = loadTexture(denomination.front);
  const backTexture = loadTexture(denomination.back);

  const materials = [
    new THREE.MeshStandardMaterial({
      color: denomination.rimColor,
      roughness: 0.45,
      metalness: 0.65
    }),
    new THREE.MeshStandardMaterial({
      color: 0xf3f3f3,
      roughness: 0.4,
      metalness: 0.55,
      map: frontTexture,
      transparent: true,
      alphaTest: 0.03
    }),
    new THREE.MeshStandardMaterial({
      color: 0xf3f3f3,
      roughness: 0.4,
      metalness: 0.55,
      map: backTexture,
      transparent: true,
      alphaTest: 0.03
    })
  ];

  coinMaterialCache.set(denomination.value, materials);
  return materials;
}

function createCashMesh(denomination) {
  if (denomination.kind === "bill") {
    const billGeometry = getBillGeometry(denomination);
    return {
      mesh: new THREE.Mesh(billGeometry.geometry, getBillMaterials(denomination)),
      footprintW: billGeometry.width,
      footprintD: billGeometry.depth,
      thickness: NOTE_THICKNESS
    };
  }

  return {
    mesh: new THREE.Mesh(getCoinGeometry(denomination), getCoinMaterials(denomination)),
    footprintW: denomination.radius * 2,
    footprintD: denomination.radius * 2,
    thickness: denomination.thickness
  };
}

function resize() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function gridIndex(ix, iz) {
  return (iz + GRID_HALF) * GRID_CELLS + (ix + GRID_HALF);
}

function clampGrid(value) {
  return Math.max(-GRID_HALF, Math.min(GRID_HALF, value));
}

function getFootprintBounds(x, z, footprintW, footprintD) {
  const halfW = footprintW * 0.5;
  const halfD = footprintD * 0.5;
  const minX = clampGrid(Math.floor((x - halfW) / GRID_CELL_SIZE));
  const maxX = clampGrid(Math.ceil((x + halfW) / GRID_CELL_SIZE));
  const minZ = clampGrid(Math.floor((z - halfD) / GRID_CELL_SIZE));
  const maxZ = clampGrid(Math.ceil((z + halfD) / GRID_CELL_SIZE));
  return { minX, maxX, minZ, maxZ };
}

function reservePileSpot(x, z, footprintW, footprintD, thickness) {
  const { minX, maxX, minZ, maxZ } = getFootprintBounds(x, z, footprintW, footprintD);
  let top = 0;
  for (let iz = minZ; iz <= maxZ; iz += 1) {
    for (let ix = minX; ix <= maxX; ix += 1) {
      top = Math.max(top, pileHeightGrid[gridIndex(ix, iz)]);
    }
  }

  const centerY = top + thickness * 0.5 + (Math.random() * 0.012 - 0.006);
  const newTop = centerY + thickness * 0.5;

  for (let iz = minZ; iz <= maxZ; iz += 1) {
    for (let ix = minX; ix <= maxX; ix += 1) {
      const idx = gridIndex(ix, iz);
      pileHeightGrid[idx] = Math.max(pileHeightGrid[idx], newTop);
    }
  }
  return centerY;
}

function randomDropTarget() {
  const radius = Math.pow(Math.random(), 1.7) * PILE_RADIUS;
  const theta = Math.random() * Math.PI * 2;
  const x = Math.cos(theta) * radius;
  const z = Math.sin(theta) * radius;
  return { x, z };
}

function makeCash(entry) {
  const denomination = entry.denomination;
  const { mesh, footprintW, footprintD, thickness } = createCashMesh(denomination);
  const target = randomDropTarget();
  const targetY = reservePileSpot(target.x, target.z, footprintW, footprintD, thickness);

  mesh.castShadow = true;
  mesh.receiveShadow = true;

  if (denomination.kind === "bill") {
    mesh.rotation.set(
      (Math.random() - 0.5) * 0.7,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.6
    );
  } else {
    mesh.rotation.set(
      (Math.random() - 0.5) * 0.42,
      Math.random() * Math.PI * 2,
      (Math.random() - 0.5) * 0.42
    );
  }

  const drift = denomination.kind === "bill" ? 0.62 : 0.45;
  mesh.position.set(
    target.x + (Math.random() - 0.5) * drift,
    DROP_HEIGHT + Math.random() * 1.4,
    target.z + (Math.random() - 0.5) * drift
  );

  scene.add(mesh);

  activeCash.push({
    mesh,
    denomination,
    targetX: target.x,
    targetY,
    targetZ: target.z,
    vx: (Math.random() - 0.5) * (denomination.kind === "bill" ? 1.45 : 1.05),
    vy: -(1.5 + Math.random() * 1.1),
    vz: (Math.random() - 0.5) * (denomination.kind === "bill" ? 1.45 : 1.05),
    spin: (Math.random() - 0.5) * (denomination.kind === "bill" ? 0.4 : 1.2),
    settleCount: 0
  });
}

function animateCash(delta) {
  for (let i = activeCash.length - 1; i >= 0; i -= 1) {
    const item = activeCash[i];
    const { mesh } = item;
    const isCoin = item.denomination.kind === "coin";
    const attraction = isCoin ? 2.45 : 1.9;
    const lateralDamp = isCoin ? 0.989 : 0.992;

    item.vx += (item.targetX - mesh.position.x) * attraction * delta;
    item.vz += (item.targetZ - mesh.position.z) * attraction * delta;
    item.vy -= 25.5 * delta;

    item.vx *= lateralDamp;
    item.vz *= lateralDamp;

    mesh.position.x += item.vx * delta;
    mesh.position.y += item.vy * delta;
    mesh.position.z += item.vz * delta;

    mesh.rotation.x += item.vz * delta * (isCoin ? 0.42 : 0.18);
    mesh.rotation.z -= item.vx * delta * (isCoin ? 0.42 : 0.18);
    mesh.rotation.y += item.spin * delta + (item.vx + item.vz) * delta * 0.1;

    if (mesh.position.y <= item.targetY) {
      mesh.position.y = item.targetY;

      if (Math.abs(item.vy) > 1.5 && item.settleCount < 2) {
        const bounce = isCoin ? 0.12 : 0.16;
        item.vy = -item.vy * (bounce - item.settleCount * 0.04);
        item.vx *= 0.5;
        item.vz *= 0.5;
        item.settleCount += 1;
      } else {
        mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, item.targetX, 0.45);
        mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, item.targetZ, 0.45);
        item.vx = 0;
        item.vy = 0;
        item.vz = 0;
        activeCash.splice(i, 1);
        placedCash.push(mesh);
      }
    }
  }
}

function parseAmount(raw) {
  if (!Number.isFinite(raw) || raw <= 0) {
    return {
      original: 0,
      itemQueue: [],
      bundleSize: 1,
      denominationCounts: [],
      representedAmount: 0
    };
  }

  const original = Math.floor(raw);
  let remaining = original;
  const denominationCounts = [];
  let totalItems = 0;

  for (const denomination of DENOMINATIONS) {
    const count = Math.floor(remaining / denomination.value);
    remaining -= count * denomination.value;
    denominationCounts.push({ denomination, count });
    totalItems += count;
  }

  const bundleSize = Math.max(1, Math.ceil(totalItems / MAX_VISUAL_ITEMS));
  const itemQueue = [];
  let representedAmount = 0;

  for (const entry of denominationCounts) {
    if (entry.count === 0) {
      continue;
    }
    const visualCount = Math.ceil(entry.count / bundleSize);
    for (let i = 0; i < visualCount; i += 1) {
      itemQueue.push({
        denomination: entry.denomination,
        representedValue: entry.denomination.value * bundleSize
      });
      representedAmount += entry.denomination.value * bundleSize;
    }
  }

  // Shuffle so bills/coins are mixed while falling.
  for (let i = itemQueue.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = itemQueue[i];
    itemQueue[i] = itemQueue[j];
    itemQueue[j] = t;
  }

  return {
    original,
    itemQueue,
    bundleSize,
    denominationCounts,
    representedAmount
  };
}

function updateStatus(text) {
  statusLine.textContent = text;
}

function queueFromAmount() {
  if (!assetsReady) {
    updateStatus("画像を読み込み中です。しばらく待ってください。");
    return;
  }

  const amount = Number(amountInput.value);
  const parsed = parseAmount(amount);

  if (parsed.itemQueue.length <= 0) {
    updateStatus("1円以上の金額を入力してください。");
    hintLine.textContent = "";
    return;
  }

  pendingQueue.length = 0;
  for (const entry of parsed.itemQueue) {
    pendingQueue.push(entry);
  }
  lastQueueMeta = parsed;

  running = true;
  dropButton.disabled = true;

  const amountText = new Intl.NumberFormat("ja-JP").format(parsed.original);
  const itemCountText = new Intl.NumberFormat("ja-JP").format(parsed.itemQueue.length);
  updateStatus(`${amountText}円を投入: ${itemCountText}個を落下中`);

  const hints = [];
  if (parsed.bundleSize > 1) {
    const bundleText = new Intl.NumberFormat("ja-JP").format(parsed.bundleSize);
    hints.push(`描画負荷対策として1オブジェクトを約${bundleText}枚分として圧縮表示しています。`);
  }
  const details = parsed.denominationCounts
    .filter((x) => x.count > 0)
    .slice(0, 4)
    .map((x) => `${x.denomination.label}×${x.count}`)
    .join(" / ");
  if (details) {
    hints.push(`内訳: ${details}${parsed.denominationCounts.filter((x) => x.count > 0).length > 4 ? " ..." : ""}`);
  }
  hintLine.textContent = hints.join(" ");
}

function clearAll() {
  pendingQueue.length = 0;
  activeCash.forEach((n) => scene.remove(n.mesh));
  placedCash.forEach((mesh) => scene.remove(mesh));
  activeCash.length = 0;
  placedCash.length = 0;
  pileHeightGrid.fill(0);
  running = false;
  lastQueueMeta = null;
  dropButton.disabled = !assetsReady;
  updateStatus("リセットしました。");
  hintLine.textContent = "";
}

dropButton.addEventListener("click", queueFromAmount);
clearButton.addEventListener("click", clearAll);

window.addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();

function tick() {
  const delta = Math.min(clock.getDelta(), 0.033);
  spawnAccumulator += delta;

  if (pendingQueue.length > 0 && spawnAccumulator > 0.042) {
    spawnAccumulator = 0;
    const next = pendingQueue.pop();
    makeCash(next);
  }

  animateCash(delta);

  if (running && pendingQueue.length === 0 && activeCash.length === 0) {
    running = false;
    dropButton.disabled = !assetsReady;
    const placedText = new Intl.NumberFormat("ja-JP").format(placedCash.length);
    const representedText = lastQueueMeta
      ? new Intl.NumberFormat("ja-JP").format(lastQueueMeta.representedAmount)
      : null;
    updateStatus(
      representedText
        ? `着地完了: ${placedText}個で約${representedText}円を表示`
        : `着地完了: ${placedText}個を表示`
    );
  }

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

tick();

async function initAssets() {
  dropButton.disabled = true;
  updateStatus("画像を読み込み中...");
  hintLine.textContent = "";
  try {
    await preloadTextures();
    assetsReady = true;
    dropButton.disabled = false;
    updateStatus("待機中");
  } catch (error) {
    console.error(error);
    assetsReady = false;
    dropButton.disabled = true;
    updateStatus("画像読み込みに失敗しました。ファイル名を確認してください。");
  }
}

initAssets();
