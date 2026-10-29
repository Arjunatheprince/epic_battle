import * as THREE from 'three';
import type { ArticulatedRigParts, UnitConfig } from '../types/game';

// Shared geometry cache (prevents memory leaks & reduces GPU allocations)
const GEOS = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(0.5, 12, 10),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  taperCyl: new THREE.CylinderGeometry(0.35, 0.55, 1, 10),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
  octa: new THREE.OctahedronGeometry(0.5, 1),
  dodeca: new THREE.DodecahedronGeometry(0.55, 0),
  torus: new THREE.TorusGeometry(0.65, 0.06, 8, 24),
  plane: new THREE.PlaneGeometry(1, 1),
};

const MAT_CACHE = new Map<string, THREE.Material>();

export function getStandardMat(
  color: number,
  roughness = 0.72,
  metalness = 0.18,
  emissive = 0x000000,
  emissiveIntensity = 0
): THREE.MeshStandardMaterial {
  const key = `std_${color}_${roughness}_${metalness}_${emissive}_${emissiveIntensity}`;
  let mat = MAT_CACHE.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive,
      emissiveIntensity,
      flatShading: true,
    });
    MAT_CACHE.set(key, mat);
  }
  return mat;
}

export function getBasicMat(color: number, opacity = 1): THREE.MeshBasicMaterial {
  const key = `bas_${color}_${opacity}`;
  let mat = MAT_CACHE.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      side: THREE.DoubleSide,
    });
    MAT_CACHE.set(key, mat);
  }
  return mat;
}

export const HIT_FLASH_MAT_K = getStandardMat(0xffffff, 0.2, 0.1, 0x93c5fd, 0.9);
export const HIT_FLASH_MAT_M = getStandardMat(0xffffff, 0.2, 0.1, 0xfca5a5, 0.9);

const NAME_TAG_MAT_CACHE = new Map<string, THREE.SpriteMaterial>();

export function getOrCreateNameTagMaterial(name: string, team: 'K' | 'M'): THREE.SpriteMaterial {
  const key = `${team}:${name}`;
  let mat = NAME_TAG_MAT_CACHE.get(key);
  if (!mat) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 256, 64);
      // Dark Fantasy Gold Pill Background
      ctx.fillStyle = team === 'K' ? 'rgba(15, 28, 63, 0.88)' : 'rgba(58, 14, 28, 0.88)';
      ctx.strokeStyle = team === 'K' ? '#60a5fa' : '#f87171';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(6, 8, 244, 48, 12);
      ctx.fill();
      ctx.stroke();

      // Gold inner accent line
      ctx.strokeStyle = '#d9b25f';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(10, 12, 236, 40, 9);
      ctx.stroke();

      // Viewer / Gifter Name Text
      ctx.font = 'bold 24px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fef08a';
      const label = name.length > 16 ? name.slice(0, 15) + '…' : name;
      ctx.fillText(label, 128, 33);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
    });
    NAME_TAG_MAT_CACHE.set(key, mat);
  }
  return mat;
}

function addPart(
  parent: THREE.Object3D,
  geoKey: keyof typeof GEOS,
  mat: THREE.Material,
  scale: [number, number, number],
  pos: [number, number, number],
  rot?: [number, number, number],
  castShadow = true,
  flashCollector?: { meshes: THREE.Mesh[]; mats: THREE.Material[] }
): THREE.Mesh {
  const mesh = new THREE.Mesh(GEOS[geoKey], mat);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.position.set(pos[0], pos[1], pos[2]);
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  if (flashCollector) {
    flashCollector.meshes.push(mesh);
    flashCollector.mats.push(mat);
  }
  return mesh;
}

export function buildProceduralCharacter(cfg: UnitConfig): ArticulatedRigParts {
  const m = cfg.modelConfig;
  const a = cfg.animationConfig;
  const isGob = !!m.isGoblinoid;
  const isSkel = !!m.isSkeleton;
  const isGolem = !!m.isStoneGolem;
  const isTroll = a.archetype === 'troll';
  const isOrc = a.archetype === 'orc_warrior';
  const isKnight = a.archetype === 'heavy_knight' && cfg.faction === 'K';
  const isDragon = a.archetype === 'dragon';
  const isPhoenix = a.archetype === 'phoenix';
  const isTitan = a.archetype === 'titan';
  const isEmperor = a.archetype === 'emperor';
  const isLizard = cfg.id === 'm_lizard_spearman';
  const isK = cfg.faction === 'K';

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const flashCollector: { meshes: THREE.Mesh[]; mats: THREE.Material[] } = {
    meshes: [],
    mats: [],
  };

  const primaryMat = getStandardMat(m.primaryColor, isGolem ? 0.9 : 0.62, isK && !isGolem ? 0.38 : 0.18);
  const secondaryMat = getStandardMat(m.secondaryColor, 0.48, 0.48);
  const skinMat = getStandardMat(m.skinColor, 0.85, 0.05);
  const darkMetalMat = getStandardMat(0x27272a, 0.48, 0.65);
  const steelMat = getStandardMat(0xe2e8f0, 0.32, 0.78);
  const woodMat = getStandardMat(0x5c3a21, 0.9, 0.05);
  const boneMat = getStandardMat(0xe7e5e4, 0.75, 0.08);
  const helmetMat = getStandardMat(m.helmetColor ?? m.secondaryColor, 0.42, 0.58);
  const glowMat = m.glowColor
    ? getStandardMat(m.glowColor, 0.25, 0.1, m.glowColor, 0.9)
    : getStandardMat(m.secondaryColor, 0.3, 0.2, m.secondaryColor, 0.5);

  // =========================================================================
  // MOUNT (Warhorse for Royal Cavalry, Giant Warg Wolf for Warg Rider)
  // =========================================================================
  let mount: THREE.Group | undefined;
  let mountLegs: THREE.Group[] | undefined;
  let riderYOffset = 0;
  if (a.hasMount) {
    mount = new THREE.Group();
    body.add(mount);
    mountLegs = [];
    riderYOffset = 0.75;
    const mountColor = isK ? 0xf1f5f9 : 0x292524;
    const mountMat = getStandardMat(mountColor, 0.8, 0.1);
    addPart(mount, 'box', mountMat, [0.75, 0.62, 1.68], [0, 0.82, 0], undefined, true, flashCollector);
    addPart(mount, 'box', primaryMat, [0.82, 0.52, 0.75], [0, 0.88, 0.52]);
    // Saddle & Tail
    addPart(mount, 'box', secondaryMat, [0.8, 0.18, 0.55], [0, 1.15, -0.05]);
    addPart(mount, 'cone', mountMat, [0.24, 0.75, 0.24], [0, 0.78, -0.95], [-0.85, 0, 0]);

    const neck = new THREE.Group();
    neck.position.set(0, 1.1, 0.75);
    neck.rotation.x = 0.45;
    mount.add(neck);
    addPart(neck, 'box', mountMat, [0.42, 0.65, 0.45], [0, 0.25, 0]);
    addPart(neck, 'box', mountMat, [0.38, 0.36, 0.68], [0, 0.52, 0.26]);
    if (!isK) {
      // Wolf ears, fangs & glowing eyes
      addPart(neck, 'cone', mountMat, [0.14, 0.32, 0.14], [-0.15, 0.75, 0.05]);
      addPart(neck, 'cone', mountMat, [0.14, 0.32, 0.14], [0.15, 0.75, 0.05]);
      addPart(neck, 'cone', boneMat, [0.07, 0.18, 0.07], [-0.12, 0.36, 0.48], [Math.PI, 0, 0]);
      addPart(neck, 'cone', boneMat, [0.07, 0.18, 0.07], [0.12, 0.36, 0.48], [Math.PI, 0, 0]);
      addPart(neck, 'sphere', getBasicMat(0xef4444), [0.1, 0.1, 0.1], [-0.14, 0.6, 0.35], undefined, false);
      addPart(neck, 'sphere', getBasicMat(0xef4444), [0.1, 0.1, 0.1], [0.14, 0.6, 0.35], undefined, false);
    } else {
      addPart(neck, 'box', secondaryMat, [0.4, 0.12, 0.62], [0, 0.66, 0.24]);
    }
    const legCoords: [number, number][] = [
      [-0.26, 0.58],
      [0.26, 0.58],
      [-0.26, -0.58],
      [0.26, -0.58],
    ];
    legCoords.forEach(([lx, lz]) => {
      const mLeg = new THREE.Group();
      mLeg.position.set(lx, 0.78, lz);
      mount!.add(mLeg);
      addPart(mLeg, 'taperCyl', mountMat, [0.22, 0.78, 0.22], [0, -0.39, 0]);
      mountLegs!.push(mLeg);
    });
  }

  // Pelvis & Torso Hierarchy
  const pelvis = new THREE.Group();
  pelvis.position.set(0, (isGob ? 0.72 : 0.9) + riderYOffset, 0);
  body.add(pelvis);

  addPart(
    pelvis,
    isGolem ? 'dodeca' : 'box',
    isSkel ? boneMat : darkMetalMat,
    isGob ? [0.56, 0.22, 0.36] : isOrc || isTroll || isTitan ? [0.92, 0.32, 0.56] : [0.74, 0.26, 0.44],
    [0, 0, 0]
  );

  const torso = new THREE.Group();
  torso.position.set(0, 0.12, 0);
  pelvis.add(torso);

  const chestW = isGob ? 0.64 : isSkel ? 0.66 : isGolem || isTroll || isTitan ? 1.15 : isOrc ? 1.02 : 0.88;
  const chestH = isGob ? 0.68 : isGolem || isTroll || isTitan ? 1.08 : 0.92;
  const chestD = isGob ? 0.4 : isGolem || isTroll || isTitan ? 0.68 : isOrc ? 0.58 : 0.5;

  if (isGolem || (isTitan && !isK)) {
    // Stone Golem / Ancient Behemoth: Craggy boulder/lava torso + glowing core
    addPart(torso, 'dodeca', primaryMat, [chestW, chestH, chestD], [0, chestH * 0.52, 0], undefined, true, flashCollector);
    addPart(torso, 'octa', skinMat, [chestW * 0.75, chestH * 0.6, chestD * 1.05], [0, chestH * 0.55, 0], undefined, true, flashCollector);
    addPart(torso, 'octa', glowMat, [0.38, 0.38, 0.24], [0, chestH * 0.58, chestD * 0.48], undefined, false);
    addPart(torso, 'box', glowMat, [0.68, 0.08, 0.08], [0, chestH * 0.76, chestD * 0.46], undefined, false);
    addPart(torso, 'box', glowMat, [0.5, 0.08, 0.08], [0, chestH * 0.36, chestD * 0.46], undefined, false);
  } else if (isDragon || isPhoenix) {
    // Dragon / Phoenix Sculpted Aerodynamic Chest
    addPart(torso, 'dodeca', primaryMat, [chestW * 1.05, chestH * 0.95, chestD * 1.25], [0, chestH * 0.5, 0.08], undefined, true, flashCollector);
    addPart(torso, 'box', secondaryMat, [chestW * 0.55, chestH * 0.85, chestD * 1.3], [0, chestH * 0.48, 0.1]);
  } else if (isSkel) {
    addPart(torso, 'cyl', boneMat, [0.22, chestH, 0.22], [0, chestH * 0.5, -0.06], undefined, true, flashCollector);
    addPart(torso, 'box', primaryMat, [chestW * 0.85, chestH * 0.75, chestD * 0.7], [0, chestH * 0.52, 0], undefined, true, flashCollector);
    for (let r = 0; r < 3; r++) {
      addPart(torso, 'box', boneMat, [chestW * 0.96, 0.09, chestD * 0.88], [0, 0.24 + r * 0.22, 0.03]);
    }
  } else {
    addPart(
      torso,
      'box',
      isTroll || isOrc || isLizard ? skinMat : primaryMat,
      [chestW, chestH, chestD],
      [0, chestH * 0.5, 0],
      undefined,
      true,
      flashCollector
    );

    if (isK) {
      addPart(torso, 'box', secondaryMat, [chestW * 0.38, chestH * 0.86, chestD + 0.04], [0, chestH * 0.48, 0]);
      addPart(torso, 'box', secondaryMat, [chestW * 0.74, 0.14, chestD + 0.05], [0, chestH * 0.64, 0]);
      if (isKnight || isTitan || isEmperor) {
        addPart(torso, 'box', steelMat, [chestW * 0.92, chestH * 0.52, chestD + 0.06], [0, chestH * 0.62, 0]);
      }
    } else if (isOrc || isTroll) {
      addPart(torso, 'box', primaryMat, [chestW * 0.92, 0.24, chestD + 0.04], [0, chestH * 0.26, 0]);
      addPart(torso, 'box', secondaryMat, [chestW * 0.86, 0.16, chestD + 0.05], [0, chestH * 0.58, 0], [0, 0, 0.42]);
      addPart(torso, 'box', secondaryMat, [chestW * 0.86, 0.16, chestD + 0.05], [0, chestH * 0.58, 0], [0, 0, -0.42]);
    } else {
      addPart(torso, 'box', secondaryMat, [chestW * 0.82, 0.18, chestD + 0.04], [0, chestH * 0.55, 0], [0, 0, 0.35]);
    }
  }

  // Lizard Spearman & Dragon Dorsal Spine Spikes
  if (isLizard || isDragon) {
    for (let s = 0; s < 3; s++) {
      addPart(
        torso,
        'cone',
        secondaryMat,
        [0.14, 0.32, 0.14],
        [0, 0.28 + s * 0.26, -chestD * 0.58],
        [-Math.PI * 0.45, 0, 0]
      );
    }
  }

  // Pauldrons (Shoulder armor plates / Titan Spires)
  if (!isGob && !isPhoenix) {
    if (isGolem || isTitan) {
      addPart(torso, 'dodeca', primaryMat, [0.58, 0.52, 0.58], [-chestW * 0.62, chestH * 0.88, 0]);
      addPart(torso, 'dodeca', primaryMat, [0.58, 0.52, 0.58], [chestW * 0.62, chestH * 0.88, 0]);
      if (isTitan) {
        addPart(torso, 'octa', glowMat, [0.28, 0.55, 0.28], [-chestW * 0.68, chestH * 1.18, 0], [0, 0, 0.3], false);
        addPart(torso, 'octa', glowMat, [0.28, 0.55, 0.28], [chestW * 0.68, chestH * 1.18, 0], [0, 0, -0.3], false);
      }
    } else if (isOrc) {
      addPart(torso, 'sphere', darkMetalMat, [0.5, 0.38, 0.5], [-chestW * 0.62, chestH * 0.86, 0]);
      addPart(torso, 'cone', steelMat, [0.16, 0.38, 0.16], [-chestW * 0.72, chestH * 1.1, 0], [0, 0, 0.45]);
      addPart(torso, 'sphere', darkMetalMat, [0.5, 0.38, 0.5], [chestW * 0.62, chestH * 0.86, 0]);
      addPart(torso, 'cone', steelMat, [0.16, 0.38, 0.16], [chestW * 0.72, chestH * 1.1, 0], [0, 0, -0.45]);
    } else {
      addPart(torso, 'sphere', secondaryMat, [0.44, 0.35, 0.44], [-chestW * 0.6, chestH * 0.86, 0]);
      addPart(torso, 'sphere', secondaryMat, [0.44, 0.35, 0.44], [chestW * 0.6, chestH * 0.86, 0]);
    }
  }

  // Floating Halo / Sovereign Ring behind Torso/Head for Angel, Paladin, Thunder God, Storm Demon, Emperors
  let haloMesh: THREE.Object3D | undefined;
  if (
    cfg.id === 'k_angel_guardian' ||
    cfg.id === 'k_paladin' ||
    cfg.id === 'k_thunder_god' ||
    cfg.id === 'm_storm_demon' ||
    isEmperor
  ) {
    const hGroup = new THREE.Group();
    hGroup.position.set(0, chestH * 0.95, -chestD * 0.55);
    torso.add(hGroup);
    const hMat = getBasicMat(m.glowColor ?? m.secondaryColor, 0.9);
    const ringMesh = new THREE.Mesh(GEOS.torus, hMat);
    ringMesh.scale.setScalar(isEmperor ? 1.15 : 0.75);
    hGroup.add(ringMesh);
    haloMesh = hGroup;
  }

  // Quiver on Back for Archer & Skeleton Archer
  let quiverMesh: THREE.Object3D | undefined;
  if (m.hasQuiver) {
    const qGroup = new THREE.Group();
    qGroup.position.set(0.16, chestH * 0.55, -chestD * 0.62);
    qGroup.rotation.z = -0.32;
    torso.add(qGroup);
    addPart(qGroup, 'taperCyl', woodMat, [0.22, 0.68, 0.22], [0, 0, 0]);
    const featherMat = getBasicMat(isK ? 0xfef08a : 0xc084fc);
    [-0.05, 0, 0.05].forEach((ax, idx) => {
      addPart(qGroup, 'cyl', woodMat, [0.03, 0.38, 0.03], [ax, 0.38, (idx - 1) * 0.03]);
      addPart(qGroup, 'box', featherMat, [0.07, 0.1, 0.02], [ax, 0.52, (idx - 1) * 0.03], undefined, false);
    });
    quiverMesh = qGroup;
  }

  // Cape if configured
  if (m.hasCape) {
    addPart(
      torso,
      'box',
      isK ? secondaryMat : primaryMat,
      [chestW * 0.92, chestH * 1.35, 0.06],
      [0, chestH * 0.32, -chestD * 0.55],
      [0.14, 0, 0]
    );
  }

  // Wings if Flying / Winged (Angel, Demon Lord, Dragons, Phoenixes, Emperors)
  let wingL: THREE.Group | undefined;
  let wingR: THREE.Group | undefined;
  if (a.hasWings) {
    wingL = new THREE.Group();
    wingL.position.set(-0.25, chestH * 0.78, -chestD * 0.45);
    torso.add(wingL);

    wingR = new THREE.Group();
    wingR.position.set(0.25, chestH * 0.78, -chestD * 0.45);
    torso.add(wingR);

    const wingMat = isPhoenix || isEmperor ? glowMat : secondaryMat;
    const span = isDragon || isPhoenix ? 1.85 : 1.55;
    addPart(wingL, 'box', wingMat, [span, 0.75, 0.08], [-span * 0.48, 0.25, -0.1], [0, 0.2, 0.35]);
    addPart(wingL, 'cone', primaryMat, [0.58, 1.45, 0.12], [-span * 0.85, 0.08, -0.15], [0, 0, 1.1]);

    addPart(wingR, 'box', wingMat, [span, 0.75, 0.08], [span * 0.48, 0.25, -0.1], [0, -0.2, -0.35]);
    addPart(wingR, 'cone', primaryMat, [0.58, 1.45, 0.12], [span * 0.85, 0.08, -0.15], [0, 0, -1.1]);

    if (isEmperor || isPhoenix) {
      // Lower Seraphic / Flame Secondary Wing Pair
      addPart(wingL, 'cone', glowMat, [0.42, 1.25, 0.08], [-0.95, -0.28, -0.12], [0, 0, 1.35], false);
      addPart(wingR, 'cone', glowMat, [0.42, 1.25, 0.08], [0.95, -0.28, -0.12], [0, 0, -1.35], false);
    }
  }

  // Tail if Reptilian / Dragon / Phoenix
  let tail: THREE.Group | undefined;
  if (a.hasTail) {
    tail = new THREE.Group();
    tail.position.set(0, 0.05, -chestD * 0.5);
    pelvis.add(tail);
    if (isPhoenix) {
      // Three flowing flame tail plumes
      [-0.25, 0, 0.25].forEach((tx) => {
        addPart(tail!, 'cone', glowMat, [0.24, 1.45, 0.1], [tx, -0.2, -0.65], [-1.35, tx * 0.5, 0], false);
      });
    } else {
      addPart(tail, 'cone', skinMat, [0.36, 1.45, 0.36], [0, -0.15, -0.62], [-1.25, 0, 0]);
      if (isDragon) {
        addPart(tail, 'octa', secondaryMat, [0.35, 0.35, 0.55], [0, -0.32, -1.32]);
      }
    }
  }

  // Head Hierarchy
  const head = new THREE.Group();
  head.position.set(0, chestH + (isDragon ? 0.22 : 0.08), isGob || isTroll || isDragon ? 0.14 : 0);
  torso.add(head);

  const headSize = isGob ? 0.58 : isGolem ? 0.62 : isTroll ? 0.6 : 0.52;

  if (isDragon) {
    // Elongated Dragon Neck, Snout & Jaw
    addPart(head, 'taperCyl', skinMat, [0.38, 0.45, 0.38], [0, 0.12, 0.05], [0.35, 0, 0], true, flashCollector);
    addPart(head, 'box', primaryMat, [0.48, 0.36, 0.78], [0, 0.38, 0.28], undefined, true, flashCollector);
  } else if (isPhoenix) {
    // Avian Firebird Head, Golden Beak, & Flame Crest
    addPart(head, 'sphere', primaryMat, [0.48, 0.46, 0.54], [0, 0.25, 0.06], undefined, true, flashCollector);
    addPart(head, 'cone', glowMat, [0.22, 0.48, 0.22], [0, 0.22, 0.45], [Math.PI * 0.5, 0, 0], false);
    addPart(head, 'cone', glowMat, [0.16, 0.55, 0.16], [0, 0.58, -0.12], [-0.55, 0, 0], false);
  } else {
    addPart(
      head,
      isGolem ? 'dodeca' : 'sphere',
      skinMat,
      [headSize, headSize, headSize],
      [0, headSize * 0.48, 0],
      undefined,
      true,
      flashCollector
    );
    if (isLizard) {
      // Reptilian Snout
      addPart(head, 'box', skinMat, [0.32, 0.24, 0.45], [0, headSize * 0.38, 0.26]);
    }
  }

  // Articulated Jaw & Lower Tusks
  let jawMesh: THREE.Object3D | undefined;
  if (m.hasTusks || isSkel || isDragon) {
    const jawGroup = new THREE.Group();
    jawGroup.position.set(0, headSize * 0.25, headSize * 0.18);
    head.add(jawGroup);
    addPart(
      jawGroup,
      'box',
      skinMat,
      isDragon ? [0.42, 0.14, 0.65] : [headSize * 0.66, 0.16, headSize * 0.55],
      [0, 0, isDragon ? 0.22 : 0.08]
    );
    if (m.hasTusks) {
      addPart(jawGroup, 'cone', boneMat, [0.1, 0.28, 0.1], [-0.15, 0.14, 0.22], [0.25, 0, -0.15]);
      addPart(jawGroup, 'cone', boneMat, [0.1, 0.28, 0.1], [0.15, 0.14, 0.22], [0.25, 0, 0.15]);
    }
    jawMesh = jawGroup;
  }

  // Goblin / Troll long ears
  if (isGob || isTroll) {
    addPart(head, 'cone', skinMat, [0.18, 0.62, 0.18], [-0.38, 0.32, 0], [0, 0, 1.35]);
    addPart(head, 'cone', skinMat, [0.18, 0.62, 0.18], [0.38, 0.32, 0], [0, 0, -1.35]);
    addPart(head, 'cone', skinMat, [0.14, 0.28, 0.14], [0, 0.24, 0.32], [Math.PI * 0.5, 0, 0]);
  }

  // Helmet / Visor / Crown
  if (m.helmetColor && !isGolem && !isDragon && !isPhoenix) {
    addPart(head, 'taperCyl', helmetMat, [headSize * 1.15, 0.34, headSize * 1.15], [0, headSize * 0.78, 0]);
    if (isKnight || isEmperor) {
      addPart(head, 'box', steelMat, [headSize * 0.95, 0.28, 0.18], [0, headSize * 0.45, headSize * 0.45]);
      addPart(head, 'box', secondaryMat, [0.14, 0.38, 0.58], [0, headSize * 1.08, -0.04]);
    } else if (isK && cfg.tier >= 3) {
      addPart(head, 'box', secondaryMat, [0.12, 0.32, 0.52], [0, headSize * 1.05, 0]);
    }
  }

  // Horns
  if (m.hasHorns) {
    addPart(
      head,
      'cone',
      isDragon && isK ? secondaryMat : darkMetalMat,
      [0.16, 0.62, 0.16],
      [-0.26, headSize * 0.9, isDragon ? 0.1 : 0.05],
      [isDragon ? -0.45 : 0.25, 0, 0.55]
    );
    addPart(
      head,
      'cone',
      isDragon && isK ? secondaryMat : darkMetalMat,
      [0.16, 0.62, 0.16],
      [0.26, headSize * 0.9, isDragon ? 0.1 : 0.05],
      [isDragon ? -0.45 : 0.25, 0, -0.55]
    );
  }

  // Eyes
  const eyeColor = m.eyeColor ?? (isK ? 0x1e293b : 0xef4444);
  const eyeMat = m.eyeColor || !isK ? getBasicMat(eyeColor) : darkMetalMat;
  const eyeZ = isDragon ? 0.52 : headSize * 0.45;
  addPart(head, 'sphere', eyeMat, [0.09, 0.09, 0.09], [-0.13, headSize * 0.52, eyeZ], undefined, false);
  addPart(head, 'sphere', eyeMat, [0.09, 0.09, 0.09], [0.13, headSize * 0.52, eyeZ], undefined, false);

  // Arms Hierarchy
  const shoulderY = chestH * 0.84;
  const shoulderX = chestW * 0.62;
  const armThick = isGolem || isTroll || isTitan ? 0.34 : isOrc ? 0.28 : 0.22;

  const shoulderL = new THREE.Group();
  shoulderL.position.set(-shoulderX, shoulderY, 0);
  torso.add(shoulderL);

  const armL = new THREE.Group();
  shoulderL.add(armL);
  if (!isPhoenix) {
    addPart(armL, 'taperCyl', skinMat, [armThick, 0.44, armThick], [0, -0.2, 0], undefined, true, flashCollector);
  }

  const forearmL = new THREE.Group();
  forearmL.position.set(0, -0.4, 0);
  armL.add(forearmL);
  if (!isPhoenix) {
    addPart(
      forearmL,
      isGolem ? 'dodeca' : 'taperCyl',
      primaryMat,
      [armThick * 0.95, 0.42, armThick * 0.95],
      [0, -0.18, 0],
      undefined,
      true,
      flashCollector
    );
  }

  const shoulderR = new THREE.Group();
  shoulderR.position.set(shoulderX, shoulderY, 0);
  torso.add(shoulderR);

  const armR = new THREE.Group();
  shoulderR.add(armR);
  if (!isPhoenix) {
    addPart(armR, 'taperCyl', skinMat, [armThick, 0.44, armThick], [0, -0.2, 0], undefined, true, flashCollector);
  }

  const forearmR = new THREE.Group();
  forearmR.position.set(0, -0.4, 0);
  armR.add(forearmR);
  if (!isPhoenix) {
    addPart(
      forearmR,
      isGolem ? 'dodeca' : 'taperCyl',
      primaryMat,
      [armThick * 0.95, 0.42, armThick * 0.95],
      [0, -0.18, 0],
      undefined,
      true,
      flashCollector
    );
  }

  // Shield or Bow + Nocked Arrow on Left Forearm
  let shieldMesh: THREE.Object3D | undefined;
  let nockedArrowMesh: THREE.Object3D | undefined;

  if (m.hasShield) {
    const shGroup = new THREE.Group();
    shGroup.position.set(-0.16, -0.2, 0.14);
    forearmL.add(shGroup);
    if (isK) {
      addPart(shGroup, 'box', secondaryMat, [0.1, 0.9, 0.68], [0, 0, 0]);
      addPart(shGroup, 'box', primaryMat, [0.12, 0.76, 0.56], [-0.01, 0, 0]);
      addPart(shGroup, 'box', secondaryMat, [0.14, 0.6, 0.1], [-0.02, 0, 0]);
      addPart(shGroup, 'box', secondaryMat, [0.14, 0.1, 0.42], [-0.02, 0.08, 0]);
    } else {
      addPart(shGroup, 'cyl', secondaryMat, [0.74, 0.1, 0.74], [0, 0, 0], [0, 0, Math.PI * 0.5]);
      addPart(shGroup, 'cone', steelMat, [0.18, 0.25, 0.18], [-0.12, 0, 0], [0, 0, Math.PI * 0.5]);
    }
    shieldMesh = shGroup;
  } else if (m.weapon === 'bow') {
    const bowGroup = new THREE.Group();
    bowGroup.position.set(0, -0.32, 0.18);
    forearmL.add(bowGroup);
    const bowMat = isSkel ? darkMetalMat : woodMat;
    addPart(bowGroup, 'box', secondaryMat, [0.09, 0.34, 0.14], [0, 0, 0.1]);
    addPart(bowGroup, 'box', bowMat, [0.07, 0.62, 0.11], [0, 0.42, 0.04], [-0.22, 0, 0]);
    addPart(bowGroup, 'box', bowMat, [0.07, 0.62, 0.11], [0, -0.42, 0.04], [0.22, 0, 0]);
    addPart(bowGroup, 'cyl', steelMat, [0.02, 1.38, 0.02], [0, 0, -0.08]);

    const arrowGroup = new THREE.Group();
    arrowGroup.position.set(0, 0, 0.1);
    bowGroup.add(arrowGroup);
    addPart(arrowGroup, 'cyl', woodMat, [0.035, 0.95, 0.035], [0, 0, 0.35], [Math.PI * 0.5, 0, 0]);
    addPart(
      arrowGroup,
      'cone',
      getBasicMat(isK ? 0x60a5fa : 0xc084fc),
      [0.11, 0.24, 0.11],
      [0, 0, 0.88],
      [Math.PI * 0.5, 0, 0],
      false
    );
    nockedArrowMesh = arrowGroup;
  }

  // Right Hand Weapon
  const wGroup = new THREE.Group();
  wGroup.position.set(0, -0.36, 0.08);
  forearmR.add(wGroup);

  switch (m.weapon) {
    case 'sword':
    case 'greatsword': {
      const len = m.weapon === 'greatsword' ? 1.62 : 1.18;
      const w = m.weapon === 'greatsword' ? 0.17 : 0.11;
      addPart(wGroup, 'cyl', woodMat, [0.08, 0.34, 0.08], [0, 0, 0], [Math.PI * 0.5, 0, 0]);
      addPart(wGroup, 'sphere', secondaryMat, [0.16, 0.16, 0.16], [0, 0, -0.18]);
      addPart(wGroup, 'box', secondaryMat, [0.46, 0.1, 0.12], [0, 0, 0.16]);
      addPart(
        wGroup,
        'box',
        cfg.isLegendary || cfg.isBoss ? glowMat : steelMat,
        [w * 0.65, w, len],
        [0, 0, 0.18 + len * 0.5]
      );
      break;
    }
    case 'dagger': {
      addPart(wGroup, 'cyl', woodMat, [0.07, 0.24, 0.07], [0, 0, 0], [Math.PI * 0.5, 0, 0]);
      addPart(wGroup, 'cone', steelMat, [0.13, 0.72, 0.08], [0, 0, 0.45], [Math.PI * 0.5, 0, 0]);
      break;
    }
    case 'spear':
    case 'lance': {
      const len = m.weapon === 'lance' ? 2.3 : 1.95;
      addPart(wGroup, 'cyl', woodMat, [0.07, len, 0.07], [0, 0, len * 0.35], [Math.PI * 0.5, 0, 0]);
      addPart(wGroup, 'cone', steelMat, [0.16, 0.48, 0.12], [0, 0, len * 0.85 + 0.15], [Math.PI * 0.5, 0, 0]);
      break;
    }
    case 'axe': {
      addPart(wGroup, 'cyl', woodMat, [0.1, 1.45, 0.1], [0, 0, 0.52], [Math.PI * 0.5, 0, 0]);
      addPart(wGroup, 'box', cfg.isLegendary ? glowMat : steelMat, [0.1, 0.76, 0.46], [0, 0, 1.06]);
      addPart(wGroup, 'cone', secondaryMat, [0.14, 0.32, 0.14], [0, 0, 1.38], [Math.PI * 0.5, 0, 0]);
      break;
    }
    case 'hammer':
    case 'mace': {
      const isHeavy = m.weapon === 'hammer';
      addPart(wGroup, 'cyl', woodMat, [0.1, isHeavy ? 1.45 : 1.0, 0.1], [0, 0, 0.48], [Math.PI * 0.5, 0, 0]);
      addPart(
        wGroup,
        'box',
        cfg.isLegendary ? glowMat : secondaryMat,
        isHeavy ? [0.52, 0.58, 0.38] : [0.34, 0.34, 0.34],
        [0, 0, isHeavy ? 1.12 : 0.88]
      );
      break;
    }
    case 'club': {
      addPart(wGroup, 'taperCyl', woodMat, [0.28, 1.5, 0.28], [0, 0, 0.6], [Math.PI * 0.5, 0, 0]);
      addPart(wGroup, 'dodeca', woodMat, [0.64, 0.64, 0.64], [0, 0, 1.28]);
      addPart(wGroup, 'cone', steelMat, [0.14, 0.35, 0.14], [0, 0.36, 1.28]);
      addPart(wGroup, 'cone', steelMat, [0.14, 0.35, 0.14], [0, -0.36, 1.28], [Math.PI, 0, 0]);
      addPart(wGroup, 'cone', steelMat, [0.14, 0.35, 0.14], [0.36, 0, 1.28], [0, 0, -Math.PI * 0.5]);
      break;
    }
    case 'staff': {
      addPart(wGroup, 'cyl', woodMat, [0.08, 1.65, 0.08], [0, 0, 0.55], [Math.PI * 0.5, 0, 0]);
      addPart(wGroup, 'octa', glowMat, [0.38, 0.38, 0.38], [0, 0, 1.45], undefined, false);
      break;
    }
    case 'fist': {
      addPart(wGroup, 'dodeca', primaryMat, [0.62, 0.62, 0.62], [0, 0, 0.16], undefined, true, flashCollector);
      if (isGolem || isTitan) {
        addPart(wGroup, 'box', glowMat, [0.28, 0.12, 0.28], [0, 0.28, 0.16], undefined, false);
        addPart(forearmL, 'dodeca', primaryMat, [0.58, 0.58, 0.58], [0, -0.42, 0.06], undefined, true, flashCollector);
        addPart(forearmL, 'box', glowMat, [0.26, 0.1, 0.26], [0, -0.42, 0.32], undefined, false);
      }
      break;
    }
    default:
      break;
  }

  // Legs Hierarchy
  const hipX = isGob ? 0.18 : isGolem || isTroll || isTitan ? 0.3 : 0.23;
  const legThick = isGolem || isTroll || isTitan ? 0.34 : 0.25;

  const hipL = new THREE.Group();
  hipL.position.set(-hipX, -0.06, 0);
  pelvis.add(hipL);

  const thighL = new THREE.Group();
  hipL.add(thighL);
  addPart(thighL, 'taperCyl', darkMetalMat, [legThick, 0.42, legThick], [0, -0.2, 0], undefined, true, flashCollector);

  const calfL = new THREE.Group();
  calfL.position.set(0, -0.4, 0);
  thighL.add(calfL);
  addPart(
    calfL,
    isGolem ? 'dodeca' : 'taperCyl',
    primaryMat,
    [legThick * 0.92, 0.42, legThick * 0.92],
    [0, -0.2, 0],
    undefined,
    true,
    flashCollector
  );

  const hipR = new THREE.Group();
  hipR.position.set(hipX, -0.06, 0);
  pelvis.add(hipR);

  const thighR = new THREE.Group();
  hipR.add(thighR);
  addPart(thighR, 'taperCyl', darkMetalMat, [legThick, 0.42, legThick], [0, -0.2, 0], undefined, true, flashCollector);

  const calfR = new THREE.Group();
  calfR.position.set(0, -0.4, 0);
  thighR.add(calfR);
  addPart(
    calfR,
    isGolem ? 'dodeca' : 'taperCyl',
    primaryMat,
    [legThick * 0.92, 0.42, legThick * 0.92],
    [0, -0.2, 0],
    undefined,
    true,
    flashCollector
  );

  // Ground Aura Ring for Boss / Paladin / Legendary units
  let auraMesh: THREE.Mesh | undefined;
  if (cfg.vfxConfig.auraColor || cfg.isBoss) {
    const auraCol = cfg.vfxConfig.auraColor ?? (isK ? 0xfde047 : 0xef4444);
    auraMesh = new THREE.Mesh(GEOS.torus, getBasicMat(auraCol, 0.65));
    auraMesh.rotation.x = Math.PI * 0.5;
    auraMesh.position.set(0, 0.08, 0);
    auraMesh.scale.setScalar(cfg.collisionRadius * 1.15);
    root.add(auraMesh);
  }

  // Overhead Unit HP Bar
  const hpBarBg = new THREE.Mesh(GEOS.plane, getBasicMat(0x09070e, 0.75));
  const barWidth = cfg.isBoss ? 1.8 : 1.05;
  const barHeight = cfg.isBoss ? 0.16 : 0.11;
  const barY = (isGob ? 2.15 : 2.55) + riderYOffset;
  hpBarBg.scale.set(barWidth, barHeight, 1);
  hpBarBg.position.set(0, barY, 0);
  hpBarBg.visible = !!cfg.isBoss;
  root.add(hpBarBg);

  const hpBarFill = new THREE.Mesh(
    GEOS.plane,
    getBasicMat(isK ? 0x3b82f6 : 0xef4444, 0.95)
  );
  hpBarFill.scale.set(barWidth - 0.04, barHeight - 0.03, 1);
  hpBarFill.position.set(0, barY, 0.01);
  hpBarFill.visible = !!cfg.isBoss;
  root.add(hpBarFill);

  // Overhead Gifter / Summoner Name Tag Sprite
  const nameTagSprite = new THREE.Sprite(getOrCreateNameTagMaterial('VIP', cfg.faction));
  const tagScale = cfg.isBoss ? 2.2 : 1.65;
  nameTagSprite.scale.set(tagScale, tagScale * 0.25, 1);
  nameTagSprite.position.set(0, barY + (cfg.isBoss ? 0.52 : 0.38), 0);
  nameTagSprite.renderOrder = 10;
  nameTagSprite.visible = false;
  root.add(nameTagSprite);

  root.scale.setScalar(m.scale);

  return {
    root,
    body,
    pelvis,
    torso,
    head,
    jawMesh,
    haloMesh,
    shoulderL,
    armL,
    forearmL,
    shoulderR,
    armR,
    forearmR,
    hipL,
    thighL,
    calfL,
    hipR,
    thighR,
    calfR,
    wingL,
    wingR,
    tail,
    mount,
    mountLegs,
    weaponMesh: wGroup,
    shieldMesh,
    quiverMesh,
    nockedArrowMesh,
    auraMesh,
    hpBarBg,
    hpBarFill,
    nameTagSprite,
    hitFlashMeshes: flashCollector.meshes,
    origMaterials: flashCollector.mats,
  };
}
