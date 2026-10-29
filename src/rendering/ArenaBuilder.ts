import * as THREE from 'three';
import { getBasicMat, getStandardMat } from './ProceduralCharacterBuilder';

export interface ArenaElements {
  scene: THREE.Scene;
  sunLight: THREE.DirectionalLight;
  kingdomCastle: THREE.Group;
  monsterCastle: THREE.Group;
  kingdomPortalRing: THREE.Mesh;
  monsterPortalRing: THREE.Mesh;
  cameraObstacles: THREE.Object3D[];
  dispose: () => void;
}

export const CASTLE_POS_X = {
  K: -44,
  M: 44,
} as const;

export function buildArenaScene(): ArenaElements {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1f1629);
  scene.fog = new THREE.FogExp2(0x281c33, 0.0068);

  // Dramatic Twilight / Sunset Lighting
  const hemiLight = new THREE.HemisphereLight(0xd5e5ff, 0x30233f, 1.2);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xffd2a1, 1.6);
  sunLight.position.set(-32, 56, 32);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.bias = -0.0005;
  const sc = sunLight.shadow.camera;
  sc.left = -65;
  sc.right = 65;
  sc.top = 38;
  sc.bottom = -38;
  sc.near = 10;
  sc.far = 145;
  scene.add(sunLight);

  // Portal Point Lights for Kingdom (Blue/Gold) and Monsters (Red/Purple)
  const kLight = new THREE.PointLight(0x3b82f6, 2.2, 26);
  kLight.position.set(CASTLE_POS_X.K + 9, 5, 0);
  scene.add(kLight);

  const mLight = new THREE.PointLight(0xdc2626, 2.2, 26);
  mLight.position.set(CASTLE_POS_X.M - 9, 5, 0);
  scene.add(mLight);

  // Terrain Geometries
  const planeGeo = new THREE.PlaneGeometry(185, 105);
  const groundMat = getStandardMat(0x3f5730, 0.92, 0.04);
  const ground = new THREE.Mesh(planeGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Scorched Monster Territory Ground (East side)
  const eastGroundGeo = new THREE.PlaneGeometry(80, 105);
  const eastGround = new THREE.Mesh(eastGroundGeo, getStandardMat(0x2d232e, 0.95, 0.05));
  eastGround.rotation.x = -Math.PI / 2;
  eastGround.position.set(48, 0.01, 0);
  eastGround.receiveShadow = true;
  scene.add(eastGround);

  // Central Royal Battle Road
  const roadGeo = new THREE.PlaneGeometry(110, 11);
  const road = new THREE.Mesh(roadGeo, getStandardMat(0x786852, 0.9, 0.05));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.03, 0);
  road.receiveShadow = true;
  scene.add(road);

  // Flanking River / Chasm with wide stone bridge in center (does not block pathfinding)
  const riverGeo = new THREE.PlaneGeometry(6.5, 100);
  const river = new THREE.Mesh(riverGeo, getStandardMat(0x1e3a5f, 0.25, 0.4, 0x0ea5e9, 0.15));
  river.rotation.x = -Math.PI / 2;
  river.position.set(0, 0.02, 0);
  scene.add(river);

  const bridgeGeo = new THREE.BoxGeometry(9.5, 0.45, 36);
  const bridge = new THREE.Mesh(bridgeGeo, getStandardMat(0x64748b, 0.8, 0.15));
  bridge.position.set(0, 0.12, 0);
  bridge.receiveShadow = true;
  scene.add(bridge);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  const coneGeo = new THREE.ConeGeometry(0.5, 1, 8);
  const sphGeo = new THREE.SphereGeometry(0.5, 8, 7);
  const torusGeo = new THREE.TorusGeometry(2.6, 0.16, 10, 28);

  const addMesh = (
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    scale: [number, number, number],
    pos: [number, number, number],
    rot?: [number, number, number]
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(scale[0], scale[1], scale[2]);
    m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // Bridge Low Parapet Pillars (outside the main 32-unit combat lane)
  [-17.5, 17.5].forEach((zPos) => {
    addMesh(scene, boxGeo, getStandardMat(0x94a3b8, 0.75, 0.2), [9.8, 1.4, 0.9], [0, 0.7, zPos]);
  });

  // =========================================================================
  // KINGDOM CASTLE (West, Blue / Gold / White Stone)
  // =========================================================================
  const kingdomCastle = new THREE.Group();
  const kWallMat = getStandardMat(0xdbeafe, 0.75, 0.15);
  const kGoldMat = getStandardMat(0xf59e0b, 0.4, 0.65);
  const kRoofMat = getStandardMat(0x1d4ed8, 0.55, 0.3);
  const kGateMat = getStandardMat(0x1e1b4b, 0.8, 0.2);

  // Main Keep & Gate
  addMesh(kingdomCastle, boxGeo, kWallMat, [13, 10.5, 18], [0, 5.25, 0]);
  addMesh(kingdomCastle, boxGeo, kGoldMat, [13.5, 0.9, 18.5], [0, 10.6, 0]);
  addMesh(kingdomCastle, boxGeo, kGateMat, [1.2, 6, 4.8], [6.2, 3.0, 0]);

  // 4 Corner Towers
  [
    [-6.2, -8.8],
    [-6.2, 8.8],
    [6.2, -8.8],
    [6.2, 8.8],
  ].forEach(([tx, tz]) => {
    addMesh(kingdomCastle, cylGeo, kWallMat, [3.5, 14, 3.5], [tx, 7, tz]);
    addMesh(kingdomCastle, coneGeo, kRoofMat, [4.6, 5.5, 4.6], [tx, 16.5, tz]);
    addMesh(kingdomCastle, cylGeo, kGoldMat, [3.8, 0.6, 3.8], [tx, 13.8, tz]);
  });

  // Central Citadel Spire & Banner
  addMesh(kingdomCastle, cylGeo, kWallMat, [4.5, 16, 4.5], [-2, 8, 0]);
  addMesh(kingdomCastle, coneGeo, kGoldMat, [5.4, 6, 5.4], [-2, 19, 0]);
  addMesh(kingdomCastle, boxGeo, kRoofMat, [0.2, 4.5, 1.8], [6.6, 7.5, -5.2]);
  addMesh(kingdomCastle, boxGeo, kRoofMat, [0.2, 4.5, 1.8], [6.6, 7.5, 5.2]);

  // Kingdom Spawn Portal Ring
  const kingdomPortalRing = new THREE.Mesh(
    torusGeo,
    getBasicMat(0x60a5fa, 0.85)
  );
  kingdomPortalRing.position.set(8.5, 3.2, 0);
  kingdomPortalRing.rotation.y = Math.PI / 2;
  kingdomCastle.add(kingdomPortalRing);

  kingdomCastle.position.set(CASTLE_POS_X.K, 0, 0);
  scene.add(kingdomCastle);

  // =========================================================================
  // MONSTERS FORTRESS (East, Black Obsidian / Red Lava / Bone Spikes)
  // =========================================================================
  const monsterCastle = new THREE.Group();
  const mWallMat = getStandardMat(0x27202c, 0.85, 0.2);
  const mRedMat = getStandardMat(0x991b1b, 0.5, 0.4, 0xdc2626, 0.35);
  const mPurpleMat = getStandardMat(0x581c87, 0.55, 0.35, 0x9333ea, 0.3);
  const boneMat = getStandardMat(0xe7e5e4, 0.75, 0.1);

  // Main Obsidian Bastion & Maw Gate
  addMesh(monsterCastle, boxGeo, mWallMat, [13, 10.5, 18], [0, 5.25, 0]);
  addMesh(monsterCastle, boxGeo, mRedMat, [13.5, 0.9, 18.5], [0, 10.6, 0]);
  addMesh(monsterCastle, boxGeo, getBasicMat(0x450a0a), [1.2, 6, 4.8], [-6.2, 3.0, 0]);

  // 4 Dark Bastion Towers
  [
    [-6.2, -8.8],
    [-6.2, 8.8],
    [6.2, -8.8],
    [6.2, 8.8],
  ].forEach(([tx, tz]) => {
    addMesh(monsterCastle, cylGeo, mWallMat, [3.6, 13.5, 3.6], [tx, 6.75, tz]);
    addMesh(monsterCastle, coneGeo, mPurpleMat, [4.5, 5.5, 4.5], [tx, 16.2, tz]);
  });

  // Giant Curved Bone Tusks & Spikes
  [
    [-6.5, -5.5, 0.35],
    [-6.5, 5.5, -0.35],
    [-4.0, -8.2, 0.25],
    [-4.0, 8.2, -0.25],
    [2.0, -7.5, 0.2],
    [2.0, 7.5, -0.2],
  ].forEach(([bx, bz, tilt]) => {
    addMesh(
      monsterCastle,
      coneGeo,
      boneMat,
      [1.1, 4.5, 1.1],
      [bx, 12.2, bz],
      [tilt, 0, 0.3]
    );
  });

  // Monster Spawn Portal Ring
  const monsterPortalRing = new THREE.Mesh(
    torusGeo,
    getBasicMat(0xc084fc, 0.85)
  );
  monsterPortalRing.position.set(-8.5, 3.2, 0);
  monsterPortalRing.rotation.y = Math.PI / 2;
  monsterCastle.add(monsterPortalRing);

  monsterCastle.position.set(CASTLE_POS_X.M, 0, 0);
  scene.add(monsterCastle);

  // =========================================================================
  // SCENERY DECORATIONS (InstancedMesh Trees, Rocks, Ruins — 4 Draw Calls total)
  // =========================================================================
  const trunkMat = getStandardMat(0x4a321f, 0.9, 0.05);
  const leafKingdomMat = getStandardMat(0x2d5a34, 0.85, 0.05);
  const leafMonsterMat = getStandardMat(0x4a2538, 0.85, 0.05);
  const rockMat = getStandardMat(0x64605a, 0.88, 0.1);

  // Deterministic pseudo-random placement so arena is consistent & balanced
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  const trunkMatrices: THREE.Matrix4[] = [];
  const kLeafMatrices: THREE.Matrix4[] = [];
  const mLeafMatrices: THREE.Matrix4[] = [];
  const rockMatrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();

  for (let i = 0; i < 42; i++) {
    const x = (rand() - 0.5) * 130;
    const zSign = i % 2 === 0 ? 1 : -1;
    const z = zSign * (19.5 + rand() * 23);

    if (i % 3 !== 0) {
      const hScale = 0.85 + rand() * 0.55;
      dummy.position.set(x, 1.1 * hScale, z);
      dummy.rotation.set(0, rand() * Math.PI, 0);
      dummy.scale.set(0.65 * hScale, 2.2 * hScale, 0.65 * hScale);
      dummy.updateMatrix();
      trunkMatrices.push(dummy.matrix.clone());

      dummy.position.set(x, 4.1 * hScale, z);
      dummy.scale.set(3.1 * hScale, 4.8 * hScale, 3.1 * hScale);
      dummy.updateMatrix();
      if (x < 0) {
        kLeafMatrices.push(dummy.matrix.clone());
      } else {
        mLeafMatrices.push(dummy.matrix.clone());
      }
    } else {
      const rScale = 1.6 + rand() * 1.8;
      dummy.position.set(x, rScale * 0.35, z);
      dummy.rotation.set(rand() * 0.3, rand() * Math.PI, 0);
      dummy.scale.set(rScale * 1.3, rScale * 0.85, rScale);
      dummy.updateMatrix();
      rockMatrices.push(dummy.matrix.clone());
    }
  }

  const buildInstanced = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    matrices: THREE.Matrix4[]
  ) => {
    const inst = new THREE.InstancedMesh(geo, mat, matrices.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    for (let i = 0; i < matrices.length; i++) {
      inst.setMatrixAt(i, matrices[i]);
    }
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
    return inst;
  };

  const trunkInst = buildInstanced(cylGeo, trunkMat, trunkMatrices);
  const kLeafInst = buildInstanced(coneGeo, leafKingdomMat, kLeafMatrices);
  const mLeafInst = buildInstanced(coneGeo, leafMonsterMat, mLeafMatrices);
  const rockInst = buildInstanced(sphGeo, rockMat, rockMatrices);

  const dispose = () => {
    trunkInst.dispose();
    kLeafInst.dispose();
    mLeafInst.dispose();
    rockInst.dispose();
    planeGeo.dispose();
    eastGroundGeo.dispose();
    roadGeo.dispose();
    riverGeo.dispose();
    bridgeGeo.dispose();
    boxGeo.dispose();
    cylGeo.dispose();
    coneGeo.dispose();
    sphGeo.dispose();
    torusGeo.dispose();
  };

  return {
    scene,
    sunLight,
    kingdomCastle,
    monsterCastle,
    kingdomPortalRing,
    monsterPortalRing,
    cameraObstacles: [kingdomCastle, monsterCastle, trunkInst, kLeafInst, mLeafInst, rockInst],
    dispose,
  };
}
