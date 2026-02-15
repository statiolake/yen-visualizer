import * as THREE from "three";
import * as CANNON from "cannon-es";

const amountInput = document.querySelector("#amountInput");
const dropButton = document.querySelector("#dropButton");
const visualizeForm = document.querySelector("#visualizeForm");
const viewport = document.querySelector("#viewport");
const selectedTotalOverlay = document.querySelector("#selectedTotalOverlay");
const selectedTotalValue = document.querySelector("#selectedTotalValue");
const payButton = document.querySelector("#payButton");

const IMAGE_DIR = "./money_images";
const NOTE_WIDTH = 1.5;
const NOTE_DEPTH = 0.68;
const NOTE_THICKNESS = 0.013;
const DEFAULT_BILL_ASPECT = NOTE_WIDTH / NOTE_DEPTH;
const DROP_HEIGHT = 4.25;
const DROP_RADIUS = 1.45;
const MAX_VISUAL_ITEMS = 480;
const INTERACTION_BOUNDS_HALF = 2.9;
const DRAG_LIFT_HEIGHT = 0.12;
const DRAG_START_PIXELS = 8;
const TABLE_PAN_START_PIXELS = 6;
const DRAG_FOLLOW_RATE = 26;
const CAMERA_PAN_FOLLOW_RATE = 18;
const DOUBLE_TAP_INTERVAL_MS = 280;
const DOUBLE_TAP_MAX_DISTANCE = 28;
const PAYMENT_SHORTCUT_DROP_HEIGHT = 1.05;
const PAYMENT_SHORTCUT_DROP_JITTER = 0;
const PAYMENT_SHORTCUT_DOWN_VELOCITY = -0.12;
const PAYMENT_TRAY_DETECT_MARGIN = 0.03;
const PAYMENT_TRAY_DETECT_MAX_Y = 1.15;

const PAYMENT_TRAY_CENTER_X = 0;
const PAYMENT_TRAY_WIDTH = 2.35;
const PAYMENT_TRAY_DEPTH = 1.1;
const PAYMENT_TRAY_BASE_THICKNESS = 0.018;
const PAYMENT_TRAY_RIM_THICKNESS = 0.08;
const PAYMENT_TRAY_WALL_HEIGHT = 0.065;
const PAYMENT_TRAY_INNER_PADDING = 0.12;
const PAYMENT_TRAY_PHYSICS_MIN_HALF_THICKNESS = 0.06;
const PAYMENT_TRAY_CENTER_Z =
  -INTERACTION_BOUNDS_HALF + PAYMENT_TRAY_DEPTH * 0.5 + PAYMENT_TRAY_RIM_THICKNESS + 0.14;

const TABLE_RENDER_SIZE = 120;
const CAMERA_BASE_POS = new THREE.Vector3(0, 5.8, 4.9);
const CAMERA_BASE_TARGET = new THREE.Vector3(0, 0.28, 0);
const CAMERA_PAN_LIMIT_X = 1.6;
const CAMERA_PAN_LIMIT_Z = 1.25;

const SPAWN_INTERVAL = 0.04;
const FIXED_TIMESTEP = 1 / 60;
const MAX_SUBSTEPS = 10;
const SETTLE_SPEED_SQ = 0.04;
const SETTLE_ANGULAR_SPEED_SQ = 0.08;

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

const DENOMINATION_BY_VALUE = new Map(DENOMINATIONS.map((d) => [d.value, d]));
const EXCHANGE_TARGET_BY_VALUE = new Map([
  [10000, 5000],
  [5000, 1000],
  [1000, 500],
  [500, 100],
  [100, 50],
  [50, 10],
  [10, 5],
  [5, 1]
]);

const cashObjects = [];
const cashByMeshId = new Map();
const pendingQueue = [];
const dragState = {
  active: false,
  pointerId: null,
  obj: null,
  dragHeight: 0,
  grabOffsetX: 0,
  grabOffsetZ: 0,
  originalMass: 0,
  targetX: 0,
  targetZ: 0,
  hasTarget: false
};
const gestureState = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  picked: null,
  dragStarted: false
};
const panState = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  moved: false
};
const tapState = {
  timerId: null,
  obj: null,
  x: 0,
  y: 0,
  time: 0
};

let spawnAccumulator = 0;
let settleAccumulator = 0;
let running = false;
let assetsReady = false;
let lastOverlayTotal = -1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x5f7f6d);
scene.fog = new THREE.Fog(0x5f7f6d, 7, 20);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

const textureLoader = new THREE.TextureLoader();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const dragPoint = new THREE.Vector3();
const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const tablePoint = new THREE.Vector3();
const cameraOffset = new THREE.Vector3(0, 0, 0);
const cameraOffsetTarget = new THREE.Vector3(0, 0, 0);
const cameraTarget = new THREE.Vector3();
const panStartTablePoint = new THREE.Vector3();
const panStartCameraOffset = new THREE.Vector3();
const panDelta = new THREE.Vector3();
const trayObjectsScratch = [];
const textureCache = new Map();
const billMaterialCache = new Map();
const billGeometryCache = new Map();
const coinMaterialCache = new Map();
const coinGeometryCache = new Map();

function setFixedCamera() {
  camera.position.copy(CAMERA_BASE_POS).add(cameraOffset);
  cameraTarget.copy(CAMERA_BASE_TARGET).add(cameraOffset);
  camera.lookAt(cameraTarget);
}

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x5b6f63, 1.2);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.45);
dirLight.position.set(4.5, 7.8, 4.5);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.left = -6;
dirLight.shadow.camera.right = 6;
dirLight.shadow.camera.top = 6;
dirLight.shadow.camera.bottom = -6;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0xdce8ff, 0.26);
fillLight.position.set(-4.2, 5.2, -3.8);
scene.add(fillLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.34);
scene.add(ambientLight);

const tableTop = new THREE.Mesh(
  new THREE.PlaneGeometry(TABLE_RENDER_SIZE, TABLE_RENDER_SIZE, 1, 1),
  new THREE.MeshStandardMaterial({
    color: 0xa9895d,
    roughness: 0.8,
    metalness: 0.02
  })
);
tableTop.rotation.x = -Math.PI / 2;
tableTop.position.y = 0;
tableTop.receiveShadow = true;
scene.add(tableTop);

function addPaymentTrayVisual() {
  const trayBaseMat = new THREE.MeshStandardMaterial({
    color: 0x3f72bf,
    roughness: 0.43,
    metalness: 0.12
  });
  const trayInnerMat = new THREE.MeshStandardMaterial({
    color: 0x4f86d9,
    roughness: 0.37,
    metalness: 0.08
  });
  const trayRimMat = new THREE.MeshStandardMaterial({
    color: 0x2f5ca6,
    roughness: 0.48,
    metalness: 0.14
  });

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(PAYMENT_TRAY_WIDTH, PAYMENT_TRAY_BASE_THICKNESS, PAYMENT_TRAY_DEPTH),
    trayBaseMat
  );
  base.position.set(
    PAYMENT_TRAY_CENTER_X,
    PAYMENT_TRAY_BASE_THICKNESS * 0.5,
    PAYMENT_TRAY_CENTER_Z
  );
  base.castShadow = true;
  base.receiveShadow = true;
  scene.add(base);

  const innerWidth = PAYMENT_TRAY_WIDTH - PAYMENT_TRAY_RIM_THICKNESS * 2;
  const innerDepth = PAYMENT_TRAY_DEPTH - PAYMENT_TRAY_RIM_THICKNESS * 2;
  const inner = new THREE.Mesh(
    new THREE.BoxGeometry(innerWidth, 0.008, innerDepth),
    trayInnerMat
  );
  inner.position.set(
    PAYMENT_TRAY_CENTER_X,
    PAYMENT_TRAY_BASE_THICKNESS + 0.004,
    PAYMENT_TRAY_CENTER_Z
  );
  inner.receiveShadow = true;
  scene.add(inner);

  const wallY = PAYMENT_TRAY_BASE_THICKNESS + PAYMENT_TRAY_WALL_HEIGHT * 0.5;
  const zOffset = PAYMENT_TRAY_DEPTH * 0.5 - PAYMENT_TRAY_RIM_THICKNESS * 0.5;
  const xOffset = PAYMENT_TRAY_WIDTH * 0.5 - PAYMENT_TRAY_RIM_THICKNESS * 0.5;

  const walls = [
    {
      size: [PAYMENT_TRAY_WIDTH, PAYMENT_TRAY_WALL_HEIGHT, PAYMENT_TRAY_RIM_THICKNESS],
      position: [PAYMENT_TRAY_CENTER_X, wallY, PAYMENT_TRAY_CENTER_Z + zOffset]
    },
    {
      size: [PAYMENT_TRAY_WIDTH, PAYMENT_TRAY_WALL_HEIGHT, PAYMENT_TRAY_RIM_THICKNESS],
      position: [PAYMENT_TRAY_CENTER_X, wallY, PAYMENT_TRAY_CENTER_Z - zOffset]
    },
    {
      size: [PAYMENT_TRAY_RIM_THICKNESS, PAYMENT_TRAY_WALL_HEIGHT, PAYMENT_TRAY_DEPTH],
      position: [PAYMENT_TRAY_CENTER_X + xOffset, wallY, PAYMENT_TRAY_CENTER_Z]
    },
    {
      size: [PAYMENT_TRAY_RIM_THICKNESS, PAYMENT_TRAY_WALL_HEIGHT, PAYMENT_TRAY_DEPTH],
      position: [PAYMENT_TRAY_CENTER_X - xOffset, wallY, PAYMENT_TRAY_CENTER_Z]
    }
  ];

  for (const wall of walls) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...wall.size), trayRimMat);
    mesh.position.set(...wall.position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

const world = new CANNON.World();
world.gravity.set(0, -14, 0);
world.allowSleep = true;
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 18;
world.solver.tolerance = 0.0005;

const cashMaterial = new CANNON.Material("cash");
const tableMaterial = new CANNON.Material("table");

world.addContactMaterial(
  new CANNON.ContactMaterial(cashMaterial, cashMaterial, {
    friction: 0.52,
    restitution: 0.05
  })
);

world.addContactMaterial(
  new CANNON.ContactMaterial(cashMaterial, tableMaterial, {
    friction: 0.66,
    restitution: 0.02
  })
);

const tableBody = new CANNON.Body({
  mass: 0,
  material: tableMaterial
});
tableBody.addShape(new CANNON.Plane());
tableBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
tableBody.position.set(0, 0, 0);
world.addBody(tableBody);

function addPaymentTrayPhysics() {
  const trayTopY = PAYMENT_TRAY_BASE_THICKNESS;
  const trayHalfThickness = Math.max(
    PAYMENT_TRAY_BASE_THICKNESS * 0.5,
    PAYMENT_TRAY_PHYSICS_MIN_HALF_THICKNESS
  );

  const baseBody = new CANNON.Body({
    mass: 0,
    material: tableMaterial
  });
  baseBody.addShape(
    new CANNON.Box(
      new CANNON.Vec3(
        PAYMENT_TRAY_WIDTH * 0.5,
        trayHalfThickness,
        PAYMENT_TRAY_DEPTH * 0.5
      )
    )
  );
  baseBody.position.set(
    PAYMENT_TRAY_CENTER_X,
    trayTopY - trayHalfThickness,
    PAYMENT_TRAY_CENTER_Z
  );
  world.addBody(baseBody);

  const wallY = PAYMENT_TRAY_BASE_THICKNESS + PAYMENT_TRAY_WALL_HEIGHT * 0.5;
  const zOffset = PAYMENT_TRAY_DEPTH * 0.5 - PAYMENT_TRAY_RIM_THICKNESS * 0.5;
  const xOffset = PAYMENT_TRAY_WIDTH * 0.5 - PAYMENT_TRAY_RIM_THICKNESS * 0.5;

  const walls = [
    {
      halfExtents: new CANNON.Vec3(
        PAYMENT_TRAY_WIDTH * 0.5,
        PAYMENT_TRAY_WALL_HEIGHT * 0.5,
        PAYMENT_TRAY_RIM_THICKNESS * 0.5
      ),
      position: new CANNON.Vec3(PAYMENT_TRAY_CENTER_X, wallY, PAYMENT_TRAY_CENTER_Z + zOffset)
    },
    {
      halfExtents: new CANNON.Vec3(
        PAYMENT_TRAY_WIDTH * 0.5,
        PAYMENT_TRAY_WALL_HEIGHT * 0.5,
        PAYMENT_TRAY_RIM_THICKNESS * 0.5
      ),
      position: new CANNON.Vec3(PAYMENT_TRAY_CENTER_X, wallY, PAYMENT_TRAY_CENTER_Z - zOffset)
    },
    {
      halfExtents: new CANNON.Vec3(
        PAYMENT_TRAY_RIM_THICKNESS * 0.5,
        PAYMENT_TRAY_WALL_HEIGHT * 0.5,
        PAYMENT_TRAY_DEPTH * 0.5
      ),
      position: new CANNON.Vec3(PAYMENT_TRAY_CENTER_X + xOffset, wallY, PAYMENT_TRAY_CENTER_Z)
    },
    {
      halfExtents: new CANNON.Vec3(
        PAYMENT_TRAY_RIM_THICKNESS * 0.5,
        PAYMENT_TRAY_WALL_HEIGHT * 0.5,
        PAYMENT_TRAY_DEPTH * 0.5
      ),
      position: new CANNON.Vec3(PAYMENT_TRAY_CENTER_X - xOffset, wallY, PAYMENT_TRAY_CENTER_Z)
    }
  ];

  for (const wall of walls) {
    const wallBody = new CANNON.Body({
      mass: 0,
      material: tableMaterial
    });
    wallBody.addShape(new CANNON.Box(wall.halfExtents));
    wallBody.position.copy(wall.position);
    world.addBody(wallBody);
  }
}

function addInvisibleBoundsWalls() {
  const wallHeight = 3.6;
  const wallThickness = 0.18;
  const h = INTERACTION_BOUNDS_HALF;
  const y = wallHeight * 0.5;

  const walls = [
    {
      halfExtents: new CANNON.Vec3(h + wallThickness * 0.5, wallHeight * 0.5, wallThickness * 0.5),
      position: new CANNON.Vec3(0, y, h + wallThickness * 0.5)
    },
    {
      halfExtents: new CANNON.Vec3(h + wallThickness * 0.5, wallHeight * 0.5, wallThickness * 0.5),
      position: new CANNON.Vec3(0, y, -h - wallThickness * 0.5)
    },
    {
      halfExtents: new CANNON.Vec3(wallThickness * 0.5, wallHeight * 0.5, h + wallThickness * 0.5),
      position: new CANNON.Vec3(h + wallThickness * 0.5, y, 0)
    },
    {
      halfExtents: new CANNON.Vec3(wallThickness * 0.5, wallHeight * 0.5, h + wallThickness * 0.5),
      position: new CANNON.Vec3(-h - wallThickness * 0.5, y, 0)
    }
  ];

  for (const wall of walls) {
    const wallBody = new CANNON.Body({
      mass: 0,
      material: tableMaterial
    });
    wallBody.addShape(new CANNON.Box(wall.halfExtents));
    wallBody.position.copy(wall.position);
    world.addBody(wallBody);
  }
}

addPaymentTrayVisual();
addPaymentTrayPhysics();
addInvisibleBoundsWalls();

function makeBillGeometry(width, depth) {
  const geometry = new THREE.BoxGeometry(width, NOTE_THICKNESS, depth, 8, 1, 4);
  const pos = geometry.attributes.position;
  const bendAmp = 0.003;
  const waveAmp = 0.0016;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const bend = Math.sin((x / width) * Math.PI * 1.6) * bendAmp;
    const wave = Math.sin((z / depth) * Math.PI * 2.2) * waveAmp;
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

function createCashObject(denomination) {
  if (denomination.kind === "bill") {
    const billGeometry = getBillGeometry(denomination);
    const mesh = new THREE.Mesh(billGeometry.geometry, getBillMaterials(denomination));
    const body = new CANNON.Body({
      mass: 0.026,
      material: cashMaterial,
      linearDamping: 0.32,
      angularDamping: 0.45,
      allowSleep: true,
      sleepSpeedLimit: 0.1,
      sleepTimeLimit: 0.65
    });

    body.addShape(
      new CANNON.Box(
        new CANNON.Vec3(
          billGeometry.width * 0.5,
          NOTE_THICKNESS * 0.5,
          billGeometry.depth * 0.5
        )
      )
    );

    return {
      mesh,
      body,
      kind: "bill"
    };
  }

  const mesh = new THREE.Mesh(getCoinGeometry(denomination), getCoinMaterials(denomination));
  const halfSize = denomination.radius * 0.86;

  const body = new CANNON.Body({
    mass: 0.012,
    material: cashMaterial,
    linearDamping: 0.2,
    angularDamping: 0.14,
    allowSleep: true,
    sleepSpeedLimit: 0.12,
    sleepTimeLimit: 0.55
  });

  body.addShape(
    new CANNON.Box(new CANNON.Vec3(halfSize, denomination.thickness * 0.5, halfSize))
  );

  return {
    mesh,
    body,
    kind: "coin"
  };
}

function randomDropTarget() {
  const radius = Math.pow(Math.random(), 1.7) * DROP_RADIUS;
  const theta = Math.random() * Math.PI * 2;
  return {
    x: Math.cos(theta) * radius,
    z: Math.sin(theta) * radius
  };
}

function clampToBounds(x, z, margin = 0.04) {
  const min = -INTERACTION_BOUNDS_HALF + margin;
  const max = INTERACTION_BOUNDS_HALF - margin;
  return {
    x: THREE.MathUtils.clamp(x, min, max),
    z: THREE.MathUtils.clamp(z, min, max)
  };
}

function formatYen(value) {
  return new Intl.NumberFormat("ja-JP").format(Math.max(0, Math.floor(value)));
}

function isInPaymentTrayBounds(x, z, margin = PAYMENT_TRAY_DETECT_MARGIN) {
  const halfW = PAYMENT_TRAY_WIDTH * 0.5 - margin;
  const halfD = PAYMENT_TRAY_DEPTH * 0.5 - margin;
  return (
    x >= PAYMENT_TRAY_CENTER_X - halfW &&
    x <= PAYMENT_TRAY_CENTER_X + halfW &&
    z >= PAYMENT_TRAY_CENTER_Z - halfD &&
    z <= PAYMENT_TRAY_CENTER_Z + halfD
  );
}

function isCashInPaymentTray(obj) {
  if (dragState.active && dragState.obj === obj) {
    return false;
  }
  const p = obj.body.position;
  return isInPaymentTrayBounds(p.x, p.z) && p.y <= PAYMENT_TRAY_DETECT_MAX_Y;
}

function collectTrayObjects(targetList = trayObjectsScratch) {
  targetList.length = 0;
  for (const obj of cashObjects) {
    if (isCashInPaymentTray(obj)) {
      targetList.push(obj);
    }
  }
  return targetList;
}

function getSelectedTotalAmount() {
  const trayObjects = collectTrayObjects();
  let total = 0;
  for (const obj of trayObjects) {
    total += obj.representedValue ?? obj.denomination.value;
  }
  return total;
}

function updateSelectedTotalOverlay() {
  const total = getSelectedTotalAmount();
  if (total === lastOverlayTotal) {
    return;
  }
  lastOverlayTotal = total;

  if (total > 0) {
    selectedTotalValue.textContent = `${formatYen(total)}円`;
    selectedTotalOverlay.classList.add("is-visible");
  } else {
    selectedTotalOverlay.classList.remove("is-visible");
    selectedTotalValue.textContent = "";
  }
}

function randomTrayTarget() {
  return {
    x: PAYMENT_TRAY_CENTER_X,
    z: PAYMENT_TRAY_CENTER_Z
  };
}

function randomPileTarget() {
  const base = randomDropTarget();
  return clampToBounds(base.x * 0.88, base.z + 0.72, 0.22);
}

function dropCashFromAbove(obj, target) {
  const body = obj.body;
  body.type = CANNON.Body.DYNAMIC;
  body.mass = obj.originalMass;
  body.updateMassProperties();
  body.linearDamping = obj.originalLinearDamping;
  body.angularDamping = obj.originalAngularDamping;

  const x = target.x + (Math.random() - 0.5) * PAYMENT_SHORTCUT_DROP_JITTER;
  const z = target.z + (Math.random() - 0.5) * PAYMENT_SHORTCUT_DROP_JITTER;
  const clamped = clampToBounds(x, z, 0.16);
  const y = PAYMENT_SHORTCUT_DROP_HEIGHT + Math.random() * 0.12;
  const quat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler((Math.random() - 0.5) * 0.15, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.12)
  );

  body.position.set(clamped.x, y, clamped.z);
  body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
  body.velocity.set(
    (Math.random() - 0.5) * 0.12,
    PAYMENT_SHORTCUT_DOWN_VELOCITY - Math.random() * 0.08,
    (Math.random() - 0.5) * 0.12
  );
  body.angularVelocity.set(
    (Math.random() - 0.5) * (obj.kind === "bill" ? 0.22 : 0.48),
    (Math.random() - 0.5) * (obj.kind === "bill" ? 0.12 : 0.36),
    (Math.random() - 0.5) * (obj.kind === "bill" ? 0.22 : 0.48)
  );
  body.wakeUp();
}

function toggleShortcutPaymentArea(obj) {
  const toTray = !isCashInPaymentTray(obj);
  const target = toTray ? randomTrayTarget() : randomPileTarget();
  dropCashFromAbove(obj, target);
  updateSelectedTotalOverlay();
}

function spawnCash(entry, options = null) {
  const { denomination } = entry;
  const representedValue = entry.representedValue ?? denomination.value;
  const obj = createCashObject(denomination);
  const { mesh, body, kind } = obj;

  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const target = randomDropTarget();
  const drift = kind === "bill" ? 0.55 : 0.38;
  const unclampedX = options?.position?.x ?? (target.x + (Math.random() - 0.5) * drift);
  const unclampedZ = options?.position?.z ?? (target.z + (Math.random() - 0.5) * drift);
  const clamped = clampToBounds(unclampedX, unclampedZ);
  const startX = clamped.x;
  const startZ = clamped.z;
  const startY = options?.position?.y ?? (DROP_HEIGHT + Math.random() * 1.1);

  const euler = new THREE.Euler(
    (Math.random() - 0.5) * (kind === "bill" ? 0.22 : 0.5),
    Math.random() * Math.PI * 2,
    (Math.random() - 0.5) * (kind === "bill" ? 0.2 : 0.5)
  );
  const quat = new THREE.Quaternion().setFromEuler(euler);

  mesh.position.set(startX, startY, startZ);
  mesh.quaternion.copy(quat);

  body.position.set(startX, startY, startZ);
  body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
  if (options?.velocity) {
    body.velocity.set(options.velocity.x, options.velocity.y, options.velocity.z);
  } else {
    body.velocity.set(
      (Math.random() - 0.5) * (kind === "bill" ? 0.55 : 0.35),
      -(0.2 + Math.random() * 0.3),
      (Math.random() - 0.5) * (kind === "bill" ? 0.55 : 0.35)
    );
  }
  body.angularVelocity.set(
    (Math.random() - 0.5) * (kind === "bill" ? 1.1 : 2.6),
    (Math.random() - 0.5) * (kind === "bill" ? 0.9 : 2.2),
    (Math.random() - 0.5) * (kind === "bill" ? 1.1 : 2.6)
  );

  obj.denomination = denomination;
  obj.representedValue = representedValue;
  obj.originalMass = body.mass;
  obj.originalLinearDamping = body.linearDamping;
  obj.originalAngularDamping = body.angularDamping;
  scene.add(mesh);
  world.addBody(body);
  cashObjects.push(obj);
  cashByMeshId.set(mesh.id, obj);
}

function removeCashObject(target) {
  const idx = cashObjects.indexOf(target);
  if (idx >= 0) {
    cashObjects.splice(idx, 1);
  }
  cashByMeshId.delete(target.mesh.id);
  scene.remove(target.mesh);
  world.removeBody(target.body);
  updateSelectedTotalOverlay();
}

function exchangeCashObject(target) {
  const currentValue = target.denomination.value;
  const nextValue = EXCHANGE_TARGET_BY_VALUE.get(currentValue);
  if (!nextValue) {
    return false;
  }

  const targetDenomination = DENOMINATION_BY_VALUE.get(nextValue);
  if (!targetDenomination) {
    return false;
  }

  const pieceCount = Math.floor(currentValue / nextValue);
  if (pieceCount <= 1) {
    return false;
  }

  const representedValue = target.representedValue ?? currentValue;
  if (representedValue % pieceCount !== 0) {
    return false;
  }
  const perPieceValue = representedValue / pieceCount;

  const origin = target.body.position.clone();
  removeCashObject(target);

  for (let i = 0; i < pieceCount; i += 1) {
    const angle = (i / pieceCount) * Math.PI * 2 + Math.random() * 0.4;
    const radius = 0.08 + Math.random() * 0.06;
    spawnCash(
      {
        denomination: targetDenomination,
        representedValue: perPieceValue
      },
      {
        position: {
          x: origin.x + Math.cos(angle) * radius,
          y: origin.y + 0.08 + i * 0.008,
          z: origin.z + Math.sin(angle) * radius
        },
        velocity: {
          x: Math.cos(angle) * (0.25 + Math.random() * 0.12),
          y: 0.95 + Math.random() * 0.45,
          z: Math.sin(angle) * (0.25 + Math.random() * 0.12)
        }
      }
    );
  }

  return true;
}

function syncMeshesFromPhysics() {
  for (const obj of cashObjects) {
    obj.mesh.position.set(obj.body.position.x, obj.body.position.y, obj.body.position.z);
    obj.mesh.quaternion.set(
      obj.body.quaternion.x,
      obj.body.quaternion.y,
      obj.body.quaternion.z,
      obj.body.quaternion.w
    );
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
  const billQueue = [];
  const coinQueue = [];
  let representedAmount = 0;

  for (const entry of denominationCounts) {
    if (entry.count === 0) {
      continue;
    }
    const visualCount = Math.ceil(entry.count / bundleSize);
    for (let i = 0; i < visualCount; i += 1) {
      const item = {
        denomination: entry.denomination,
        representedValue: entry.denomination.value * bundleSize
      };
      if (entry.denomination.kind === "bill") {
        billQueue.push(item);
      } else {
        coinQueue.push(item);
      }
      representedAmount += entry.denomination.value * bundleSize;
    }
  }

  // Keep natural variation while preserving group order: bills first, coins later.
  for (let i = billQueue.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = billQueue[i];
    billQueue[i] = billQueue[j];
    billQueue[j] = t;
  }
  for (let i = coinQueue.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = coinQueue[i];
    coinQueue[i] = coinQueue[j];
    coinQueue[j] = t;
  }

  const itemQueue = billQueue.concat(coinQueue);

  return {
    original,
    itemQueue,
    bundleSize,
    denominationCounts,
    representedAmount
  };
}

function queueFromAmount(event) {
  if (event) {
    event.preventDefault();
  }
  if (!assetsReady) {
    return;
  }

  const amount = Number(amountInput.value);
  const parsed = parseAmount(amount);

  if (parsed.itemQueue.length <= 0) {
    amountInput.reportValidity();
    return;
  }

  clearAll();

  pendingQueue.length = 0;
  for (const entry of parsed.itemQueue) {
    pendingQueue.push(entry);
  }

  running = true;
  spawnAccumulator = 0;
  settleAccumulator = 0;
}

function clearAll() {
  finishDragging();
  finishPanning();
  resetGesture();
  clearPendingTap();
  cameraOffset.set(0, 0, 0);
  cameraOffsetTarget.set(0, 0, 0);
  setFixedCamera();
  lastOverlayTotal = -1;
  pendingQueue.length = 0;

  for (let i = cashObjects.length - 1; i >= 0; i -= 1) {
    removeCashObject(cashObjects[i]);
  }
  cashByMeshId.clear();

  running = false;
  settleAccumulator = 0;
}

function setPointerFromEvent(event) {
  const rect = viewport.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function pickCashFromEvent(event) {
  if (cashObjects.length === 0) {
    return null;
  }
  setPointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(cashObjects.map((o) => o.mesh), false)[0];
  if (!hit) {
    return null;
  }
  const obj = cashByMeshId.get(hit.object.id);
  if (!obj) {
    return null;
  }
  return { hit, obj };
}

function getDragPlanePoint(event, y) {
  setPointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);
  dragPlane.constant = -y;
  const ok = raycaster.ray.intersectPlane(dragPlane, dragPoint);
  return ok ? dragPoint : null;
}

function getTablePlanePoint(event) {
  setPointerFromEvent(event);
  raycaster.setFromCamera(pointer, camera);
  const ok = raycaster.ray.intersectPlane(tablePlane, tablePoint);
  return ok ? tablePoint : null;
}

function clampCameraOffset(vec) {
  vec.x = THREE.MathUtils.clamp(vec.x, -CAMERA_PAN_LIMIT_X, CAMERA_PAN_LIMIT_X);
  vec.z = THREE.MathUtils.clamp(vec.z, -CAMERA_PAN_LIMIT_Z, CAMERA_PAN_LIMIT_Z);
}

function updateDraggedBodyTarget(event) {
  if (!dragState.active || !dragState.obj) {
    return;
  }
  const p = getDragPlanePoint(event, dragState.dragHeight);
  if (!p) {
    return;
  }

  const desiredX = p.x - dragState.grabOffsetX;
  const desiredZ = p.z - dragState.grabOffsetZ;
  const clamped = clampToBounds(desiredX, desiredZ, 0.12);
  dragState.targetX = clamped.x;
  dragState.targetZ = clamped.z;
  dragState.hasTarget = true;
}

function applyDraggedBodyFollow(delta) {
  if (!dragState.active || !dragState.obj || !dragState.hasTarget) {
    return;
  }

  const body = dragState.obj.body;
  const follow = 1 - Math.exp(-DRAG_FOLLOW_RATE * delta);
  const nextX = THREE.MathUtils.lerp(body.position.x, dragState.targetX, follow);
  const nextZ = THREE.MathUtils.lerp(body.position.z, dragState.targetZ, follow);

  body.velocity.set(
    (nextX - body.position.x) / FIXED_TIMESTEP,
    0,
    (nextZ - body.position.z) / FIXED_TIMESTEP
  );
  body.position.set(nextX, dragState.dragHeight, nextZ);
  body.angularVelocity.set(0, 0, 0);
}

function applyCameraPanFollow(delta) {
  const follow = 1 - Math.exp(-CAMERA_PAN_FOLLOW_RATE * delta);
  const beforeX = cameraOffset.x;
  const beforeZ = cameraOffset.z;
  cameraOffset.lerp(cameraOffsetTarget, follow);
  const moved = Math.abs(cameraOffset.x - beforeX) > 1e-4 || Math.abs(cameraOffset.z - beforeZ) > 1e-4;
  if (moved) {
    setFixedCamera();
  }
}

function finishDragging() {
  if (!dragState.active || !dragState.obj) {
    return;
  }

  const body = dragState.obj.body;
  body.type = CANNON.Body.DYNAMIC;
  body.mass = dragState.originalMass;
  body.updateMassProperties();
  body.velocity.set(0, -0.04, 0);
  body.angularVelocity.set(0, 0, 0);
  body.wakeUp();

  if (dragState.pointerId !== null && viewport.hasPointerCapture(dragState.pointerId)) {
    viewport.releasePointerCapture(dragState.pointerId);
  }

  dragState.active = false;
  dragState.pointerId = null;
  dragState.obj = null;
  dragState.dragHeight = 0;
  dragState.grabOffsetX = 0;
  dragState.grabOffsetZ = 0;
  dragState.originalMass = 0;
  dragState.targetX = 0;
  dragState.targetZ = 0;
  dragState.hasTarget = false;
  viewport.style.cursor = "";
}

function finishPanning() {
  if (!panState.active) {
    return;
  }

  if (panState.pointerId !== null && viewport.hasPointerCapture(panState.pointerId)) {
    viewport.releasePointerCapture(panState.pointerId);
  }

  panState.active = false;
  panState.pointerId = null;
  panState.startX = 0;
  panState.startY = 0;
  panState.moved = false;
}

function startDraggingFromPicked(picked, event) {
  const { hit, obj } = picked;
  const body = obj.body;
  body.wakeUp();

  dragState.active = true;
  dragState.pointerId = event.pointerId;
  dragState.obj = obj;
  dragState.dragHeight = Math.max(body.position.y + DRAG_LIFT_HEIGHT, 0.06);
  dragState.grabOffsetX = hit.point.x - body.position.x;
  dragState.grabOffsetZ = hit.point.z - body.position.z;
  dragState.originalMass = body.mass;

  body.type = CANNON.Body.KINEMATIC;
  body.mass = 0;
  body.updateMassProperties();
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  dragState.targetX = body.position.x;
  dragState.targetZ = body.position.z;
  dragState.hasTarget = true;

  viewport.style.cursor = "grabbing";
  updateDraggedBodyTarget(event);
}

function resetGesture() {
  gestureState.active = false;
  gestureState.pointerId = null;
  gestureState.startX = 0;
  gestureState.startY = 0;
  gestureState.picked = null;
  gestureState.dragStarted = false;
}

function clearPendingTap() {
  if (tapState.timerId !== null) {
    window.clearTimeout(tapState.timerId);
  }
  tapState.timerId = null;
  tapState.obj = null;
  tapState.x = 0;
  tapState.y = 0;
  tapState.time = 0;
}

function flushPendingTapSelection() {
  if (tapState.timerId === null || !tapState.obj) {
    clearPendingTap();
    return;
  }
  const obj = tapState.obj;
  clearPendingTap();
  if (cashObjects.includes(obj)) {
    toggleShortcutPaymentArea(obj);
  }
}

function handleTapAction(event, obj) {
  // Keep desktop behavior snappy. Use tap gesture disambiguation only for touch.
  if (event.pointerType !== "touch") {
    flushPendingTapSelection();
    toggleShortcutPaymentArea(obj);
    return;
  }

  const now = performance.now();
  const hasPending = tapState.timerId !== null && tapState.obj;

  if (hasPending) {
    const dt = now - tapState.time;
    const dx = event.clientX - tapState.x;
    const dy = event.clientY - tapState.y;
    const movedSq = dx * dx + dy * dy;
    const isDoubleTap =
      tapState.obj === obj &&
      dt <= DOUBLE_TAP_INTERVAL_MS &&
      movedSq <= DOUBLE_TAP_MAX_DISTANCE * DOUBLE_TAP_MAX_DISTANCE;

    if (isDoubleTap) {
      clearPendingTap();
      exchangeCashObject(obj);
      return;
    }
  }

  flushPendingTapSelection();
  tapState.obj = obj;
  tapState.x = event.clientX;
  tapState.y = event.clientY;
  tapState.time = now;
  tapState.timerId = window.setTimeout(() => {
    const target = tapState.obj;
    clearPendingTap();
    if (target && cashObjects.includes(target)) {
      toggleShortcutPaymentArea(target);
    }
  }, DOUBLE_TAP_INTERVAL_MS);
}

function onViewportPointerDown(event) {
  if (event.button !== 0 || !assetsReady || dragState.active || panState.active) {
    return;
  }

  const picked = pickCashFromEvent(event);
  if (!picked) {
    const p = getTablePlanePoint(event);
    if (!p) {
      return;
    }
    flushPendingTapSelection();
    event.preventDefault();
    viewport.setPointerCapture(event.pointerId);
    panState.active = true;
    panState.pointerId = event.pointerId;
    panState.startX = event.clientX;
    panState.startY = event.clientY;
    panState.moved = false;
    panStartTablePoint.copy(p);
    panStartCameraOffset.copy(cameraOffsetTarget);
    return;
  }

  event.preventDefault();
  viewport.setPointerCapture(event.pointerId);
  gestureState.active = true;
  gestureState.pointerId = event.pointerId;
  gestureState.startX = event.clientX;
  gestureState.startY = event.clientY;
  gestureState.picked = picked;
  gestureState.dragStarted = false;
}

function onViewportPointerMove(event) {
  if (dragState.active && event.pointerId === dragState.pointerId) {
    event.preventDefault();
    updateDraggedBodyTarget(event);
    return;
  }

  if (panState.active && event.pointerId === panState.pointerId) {
    event.preventDefault();
    const p = getTablePlanePoint(event);
    if (!p) {
      return;
    }

    if (!panState.moved) {
      const dx = event.clientX - panState.startX;
      const dy = event.clientY - panState.startY;
      if (dx * dx + dy * dy < TABLE_PAN_START_PIXELS * TABLE_PAN_START_PIXELS) {
        return;
      }
      panState.moved = true;
    }

    panDelta.copy(panStartTablePoint).sub(p);
    cameraOffsetTarget.copy(panStartCameraOffset).add(panDelta);
    clampCameraOffset(cameraOffsetTarget);
    return;
  }

  if (!gestureState.active || event.pointerId !== gestureState.pointerId) {
    return;
  }

  if (gestureState.dragStarted) {
    return;
  }

  const dx = event.clientX - gestureState.startX;
  const dy = event.clientY - gestureState.startY;
  const moved = dx * dx + dy * dy;
  if (moved >= DRAG_START_PIXELS * DRAG_START_PIXELS) {
    gestureState.dragStarted = true;
    startDraggingFromPicked(gestureState.picked, event);
  }
}

function onViewportPointerUp(event) {
  if (dragState.active && event.pointerId === dragState.pointerId) {
    event.preventDefault();
    finishDragging();
    resetGesture();
    return;
  }

  if (panState.active && event.pointerId === panState.pointerId) {
    event.preventDefault();
    finishPanning();
    return;
  }

  if (!gestureState.active || event.pointerId !== gestureState.pointerId) {
    return;
  }

  event.preventDefault();
  if (!gestureState.dragStarted && gestureState.picked?.obj) {
    handleTapAction(event, gestureState.picked.obj);
  }

  if (viewport.hasPointerCapture(event.pointerId)) {
    viewport.releasePointerCapture(event.pointerId);
  }
  resetGesture();
}

function onViewportPointerCancel(event) {
  if (dragState.active && event.pointerId === dragState.pointerId) {
    finishDragging();
  }

  if (panState.active && event.pointerId === panState.pointerId) {
    finishPanning();
  }

  if (gestureState.active && event.pointerId === gestureState.pointerId) {
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    resetGesture();
  }
}

function onViewportContextMenu(event) {
  event.preventDefault();
  if (!assetsReady || cashObjects.length === 0 || dragState.active) {
    return;
  }

  const picked = pickCashFromEvent(event);
  if (!picked) {
    return;
  }

  exchangeCashObject(picked.obj);
}

function onPayButtonClick() {
  flushPendingTapSelection();

  const targets = collectTrayObjects([]);
  let payAmount = 0;
  for (const obj of targets) {
    payAmount += obj.representedValue ?? obj.denomination.value;
  }
  if (payAmount <= 0) {
    return;
  }

  const current = Number(amountInput.value);
  const base = Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0;
  const next = Math.max(0, base - payAmount);
  amountInput.value = String(next);

  for (const obj of targets) {
    removeCashObject(obj);
  }
}

function isBodySettled(body) {
  if (body.sleepState === CANNON.Body.SLEEPING) {
    return true;
  }

  const v2 = body.velocity.lengthSquared();
  const w2 = body.angularVelocity.lengthSquared();
  return v2 < SETTLE_SPEED_SQ && w2 < SETTLE_ANGULAR_SPEED_SQ;
}

function isPileSettled() {
  if (cashObjects.length === 0) {
    return true;
  }

  for (const obj of cashObjects) {
    if (!isBodySettled(obj.body)) {
      return false;
    }
  }

  return true;
}

function resize() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  camera.aspect = width / height;
  clampCameraOffset(cameraOffsetTarget);
  clampCameraOffset(cameraOffset);
  cameraOffset.copy(cameraOffsetTarget);
  setFixedCamera();
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

visualizeForm.addEventListener("submit", queueFromAmount);
payButton.addEventListener("click", onPayButtonClick);
viewport.addEventListener("pointerdown", onViewportPointerDown);
viewport.addEventListener("pointermove", onViewportPointerMove);
viewport.addEventListener("pointerup", onViewportPointerUp);
viewport.addEventListener("pointercancel", onViewportPointerCancel);
viewport.addEventListener("contextmenu", onViewportContextMenu);
window.addEventListener("resize", resize);
resize();
updateSelectedTotalOverlay();

const clock = new THREE.Clock();

function tick() {
  const delta = Math.min(clock.getDelta(), 0.05);
  spawnAccumulator += delta;

  if (running && pendingQueue.length > 0 && spawnAccumulator >= SPAWN_INTERVAL) {
    spawnAccumulator = 0;
    const next = pendingQueue.shift();
    spawnCash(next);
  }

  applyDraggedBodyFollow(delta);
  applyCameraPanFollow(delta);

  world.step(FIXED_TIMESTEP, delta, MAX_SUBSTEPS);
  syncMeshesFromPhysics();
  updateSelectedTotalOverlay();

  if (running && pendingQueue.length === 0) {
    if (isPileSettled()) {
      settleAccumulator += delta;
    } else {
      settleAccumulator = 0;
    }

    if (settleAccumulator > 0.75) {
      running = false;
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

tick();

async function initAssets() {
  dropButton.disabled = true;

  try {
    await preloadTextures();
    assetsReady = true;
    dropButton.disabled = false;
  } catch (error) {
    console.error(error);
    assetsReady = false;
    dropButton.disabled = true;
  }
}

initAssets();
