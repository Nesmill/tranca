// The stage: a colmado interior, the blue plastic table, and the light that
// makes bone tiles readable against it.
//
// Signs use invented brands. The reference image carries real trademarks and
// publishing those is a legal risk, so every label here is original while
// keeping the same shape, palette and placement.
//
// No external assets: every texture is drawn into a canvas at boot.
//
// Only the back of the shop is ever in shot — the camera is a seated player and
// turns at most about 65 degrees either way — so the dressing is concentrated
// where it can actually be seen and the side walls stay plain. Everything is
// placed inside roughly 1.3 m of centre line, which is the width the portrait
// frame covers at that distance.

import * as THREE from 'three';
import { TABLE, WORLD_LIMITS } from './layout.js';

// --- Tuning constants ---------------------------------------------------
const FLOOR_COLOR = '#8d7a63';
const FLOOR_GROUT = '#6d5c49';
const WALL_COLOR = 0xc2b49b;
const CEILING_COLOR = 0x9a9186;
const SHELF_COLOR = 0x6f5137;
const TUBE_COLOR = 0xfff4de;
const TUBE_ROW_Y = 2.32;
const TUBE_LENGTH = 1.5;
const COOLER_GLOW = 0xbfe4ff;
const SHOP_GLOW = 0xffd9a0;

// Invented storefront brands: [label, panel colour, text colour].
const SIGNS = [
  ['CERVEZA ÁMBAR', 0x1f7a3d, 0xf4f7e8],
  ['RON PALMARES', 0xb3252a, 0xffe9c9],
  ['REFRESCO NARANJA', 0xe8721c, 0x3a1a05],
  ['COLA CRIOLLA', 0xd21f2a, 0xfff4f4],
  ['BODEGA LA ESQUINA', 0xf0e2c0, 0x2f2a22],
];
const STOCK_PALETTE = [0xd94f3d, 0xe8b23c, 0x4f8fd9, 0x5cb85c, 0xe0dccf, 0x8e5cc4];
// -------------------------------------------------------------------------

/** A tiled shop floor: grouted squares with a little wear on them. */
function makeFloorTexture(rng) {
  const size = 256;
  const cells = 4;
  const step = size / cells;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = FLOOR_GROUT;
  g.fillRect(0, 0, size, size);
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      const shade = 0.86 + rng.next() * 0.2;
      g.fillStyle = FLOOR_COLOR;
      g.globalAlpha = shade;
      g.fillRect(x * step + 2, y * step + 2, step - 4, step - 4);
    }
  }
  g.globalAlpha = 0.16;
  for (let i = 0; i < 90; i += 1) {
    g.fillStyle = rng.next() > 0.5 ? '#000000' : '#ffffff';
    g.beginPath();
    g.arc(rng.next() * size, rng.next() * size, 1 + rng.next() * 4, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Draw a shop sign: coloured panel with a bold centred label.
function makeSignTexture(label, bgHex, fgHex) {
  const w = 512;
  const h = 160;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.fillStyle = `#${bgHex.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 10;
  g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = `#${fgHex.toString(16).padStart(6, '0')}`;
  g.font = 'bold 52px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lines = label.split(' ');
  if (lines.length > 1 && g.measureText(label).width > w - 60) {
    g.font = 'bold 46px system-ui, sans-serif';
    g.fillText(lines[0], w / 2, h / 2 - 26);
    g.fillText(lines.slice(1).join(' '), w / 2, h / 2 + 26);
  } else {
    g.fillText(label, w / 2, h / 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Build the colmado stage.
 * @param {THREE.Scene} scene Scene to populate.
 * @param {object} rng Seeded random source from `createRng`.
 * @returns {{table: object, lights: object[], group: THREE.Group, dispose: () => void}}
 *   The table descriptors other modules measure against, the lights, and a
 *   disposer that releases every geometry, material and texture created here.
 */
export function buildWorld(scene, rng) {
  const group = new THREE.Group();
  group.name = 'colmado';
  scene.add(group);

  const disposables = [];
  const track = (obj) => {
    disposables.push(obj);
    return obj;
  };

  const { roomHalfX, roomBackZ, roomFrontZ, ceilingY } = WORLD_LIMITS;

  // --- Shell ------------------------------------------------------------
  const floorTex = track(makeFloorTexture(rng));
  floorTex.repeat.set(5, 6);
  const floorMat = track(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.94 }));
  const floor = new THREE.Mesh(
    track(new THREE.PlaneGeometry(roomHalfX * 2, roomFrontZ - roomBackZ)),
    floorMat,
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = (roomFrontZ + roomBackZ) / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  group.add(floor);

  const wallMat = track(new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.95 }));
  const ceilMat = track(new THREE.MeshStandardMaterial({ color: CEILING_COLOR, roughness: 1 }));

  const backWall = new THREE.Mesh(track(new THREE.PlaneGeometry(roomHalfX * 2, ceilingY)), wallMat);
  backWall.position.set(0, ceilingY / 2, roomBackZ);
  backWall.receiveShadow = true;
  backWall.name = 'backWall';
  group.add(backWall);

  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(
      track(new THREE.PlaneGeometry(roomFrontZ - roomBackZ, ceilingY)),
      wallMat,
    );
    wall.position.set(side * roomHalfX, ceilingY / 2, (roomFrontZ + roomBackZ) / 2);
    wall.rotation.y = (side * -Math.PI) / 2;
    wall.receiveShadow = true;
    group.add(wall);
  }

  const ceiling = new THREE.Mesh(
    track(new THREE.PlaneGeometry(roomHalfX * 2, roomFrontZ - roomBackZ)),
    ceilMat,
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, ceilingY, (roomFrontZ + roomBackZ) / 2);
  group.add(ceiling);

  // --- Shelving and stock ------------------------------------------------
  const shelfMat = track(new THREE.MeshStandardMaterial({ color: SHELF_COLOR, roughness: 0.8 }));
  const shelfGeo = track(new THREE.BoxGeometry(roomHalfX * 2 - 0.5, 0.06, 0.34));
  const stockGeo = track(new THREE.BoxGeometry(0.055, 0.16, 0.055));
  const bottleGeo = track(new THREE.CylinderGeometry(0.028, 0.034, 0.22, 8));
  const stockMats = STOCK_PALETTE.map((c) =>
    track(new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })),
  );

  for (let tier = 0; tier < 3; tier += 1) {
    const y = 1.02 + tier * 0.46;
    const shelf = new THREE.Mesh(shelfGeo, shelfMat);
    shelf.position.set(0, y, roomBackZ + 0.17);
    group.add(shelf);

    const count = 26;
    for (let i = 0; i < count; i += 1) {
      // The top tier is bottles, the rest are boxes: a shop reads as stocked
      // because the silhouettes differ, not because there are many of them.
      const useBottle = tier === 2 && i % 3 === 0;
      const item = new THREE.Mesh(
        useBottle ? bottleGeo : stockGeo,
        stockMats[(i + tier) % stockMats.length],
      );
      item.position.set(
        -roomHalfX + 0.4 + i * ((roomHalfX * 2 - 0.8) / (count - 1)),
        y + (useBottle ? 0.20 : 0.11),
        roomBackZ + 0.17 + (rng.next() - 0.5) * 0.03,
      );
      if (!useBottle) item.rotation.y = (rng.next() - 0.5) * 0.4;
      group.add(item);
    }
  }

  // --- Signs --------------------------------------------------------------
  SIGNS.forEach(([label, bg, fg], i) => {
    const tex = track(makeSignTexture(label, bg, fg));
    const mat = track(
      new THREE.MeshStandardMaterial({
        map: tex,
        emissive: new THREE.Color(bg),
        emissiveIntensity: 0.4,
        emissiveMap: tex,
        roughness: 0.7,
      }),
    );
    const sign = new THREE.Mesh(track(new THREE.PlaneGeometry(0.86, 0.27)), mat);
    sign.position.set(-1.5 + i * 0.78, 1.92 + (i % 2) * 0.3, roomBackZ + 0.06);
    group.add(sign);
  });

  // --- Drinks cooler, left of the back wall ------------------------------
  // Inside the frame: the visible band of the back wall is only about 1.3 m to
  // either side of centre, so anything further out is never seen.
  const caseMat = track(new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.45, metalness: 0.25 }));
  const glassMat = track(
    new THREE.MeshStandardMaterial({
      color: COOLER_GLOW,
      transparent: true,
      opacity: 0.22,
      roughness: 0.1,
      metalness: 0,
      emissive: COOLER_GLOW,
      emissiveIntensity: 0.35,
    }),
  );
  const cooler = new THREE.Group();
  cooler.position.set(-1.15, 0, -2.72);

  // Built as an open shell, not a box: a solid body seals the bottles behind
  // its own front face and the whole thing reads as a blank white slab.
  const CW = 0.92;
  const CH = 1.62;
  const CD = 0.62;
  const CT = 0.05;
  const shell = [
    [CW, CH, CT, 0, CH / 2, -CD / 2 + CT / 2], // back
    [CT, CH, CD, -CW / 2 + CT / 2, CH / 2, 0], // left
    [CT, CH, CD, CW / 2 - CT / 2, CH / 2, 0], // right
    [CW, CT, CD, 0, CH - CT / 2, 0], // top
    [CW, 0.14, CD, 0, 0.07, 0], // base
  ];
  for (const [w, h, d, x, y, z] of shell) {
    const panel = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), caseMat);
    panel.position.set(x, y, z);
    panel.castShadow = true;
    cooler.add(panel);
  }

  const coolerGlass = new THREE.Mesh(track(new THREE.PlaneGeometry(CW - CT * 2, CH - 0.34)), glassMat);
  coolerGlass.position.set(0, 0.95, CD / 2 + 0.002);
  cooler.add(coolerGlass);

  // Bottles racked on shelves inside, so the glow reads as a stocked cooler.
  const crateGeo = track(new THREE.CylinderGeometry(0.03, 0.036, 0.24, 8));
  const crateMats = [
    track(new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.5 })),
    track(new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.5 })),
  ];
  const rackGeo = track(new THREE.BoxGeometry(CW - CT * 2, 0.02, CD - CT * 2));
  for (let row = 0; row < 3; row += 1) {
    const shelfY = 0.36 + row * 0.44;
    const rack = new THREE.Mesh(rackGeo, caseMat);
    rack.position.set(0, shelfY, 0);
    cooler.add(rack);
    for (let col = 0; col < 8; col += 1) {
      const bottle = new THREE.Mesh(crateGeo, crateMats[(row + col) % 2]);
      bottle.position.set(-0.30 + col * 0.086, shelfY + 0.13, -0.02);
      cooler.add(bottle);
    }
  }
  group.add(cooler);

  // --- Counter, right of the back wall -----------------------------------
  const counterMat = track(new THREE.MeshStandardMaterial({ color: 0x7c5a3a, roughness: 0.72 }));
  const counter = new THREE.Mesh(track(new THREE.BoxGeometry(1.1, 0.94, 0.55)), counterMat);
  counter.position.set(1.16, 0.47, -2.6);
  counter.castShadow = true;
  counter.receiveShadow = true;
  group.add(counter);

  const counterTopMat = track(new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.4, metalness: 0.3 }));
  const counterTop = new THREE.Mesh(track(new THREE.BoxGeometry(1.16, 0.05, 0.6)), counterTopMat);
  counterTop.position.set(1.16, 0.965, -2.6);
  counterTop.castShadow = true;
  group.add(counterTop);

  // A radio on the counter: the source of the merengue.
  const radioMat = track(new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.6 }));
  const radio = new THREE.Mesh(track(new THREE.BoxGeometry(0.30, 0.16, 0.12)), radioMat);
  radio.position.set(0.92, 1.07, -2.56);
  radio.rotation.y = -0.4;
  group.add(radio);
  const radioGlow = track(
    new THREE.MeshStandardMaterial({ color: 0xff8a3c, emissive: 0xff8a3c, emissiveIntensity: 1.6 }),
  );
  const dial = new THREE.Mesh(track(new THREE.PlaneGeometry(0.14, 0.03)), radioGlow);
  dial.position.set(0.92, 1.07, -2.498);
  dial.rotation.y = -0.4;
  group.add(dial);

  // --- Hanging snacks -----------------------------------------------------
  const railMat = track(new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.4, metalness: 0.6 }));
  const rail = new THREE.Mesh(track(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 8)), railMat);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, 2.16, -2.15);
  group.add(rail);

  const bagGeo = track(new THREE.BoxGeometry(0.075, 0.11, 0.02));
  for (let i = 0; i < 14; i += 1) {
    const bag = new THREE.Mesh(bagGeo, stockMats[i % stockMats.length]);
    bag.position.set(-0.66 + i * 0.101, 2.08, -2.15);
    bag.rotation.y = (rng.next() - 0.5) * 0.5;
    group.add(bag);
  }

  // --- A couple of people standing around at the back ---------------------
  // Silhouettes only: they are two metres behind the table and out of focus.
  const patronMat = track(new THREE.MeshStandardMaterial({ color: 0x6b5a4a, roughness: 0.9 }));
  for (const [px, pz, h] of [[-1.55, -2.75, 1.66], [1.72, -2.85, 1.74]]) {
    const torso = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.15, 0.52, 4, 10)), patronMat);
    torso.position.set(px, h - 0.62, pz);
    group.add(torso);
    const head = new THREE.Mesh(track(new THREE.SphereGeometry(0.098, 12, 10)), patronMat);
    head.position.set(px, h - 0.16, pz);
    group.add(head);
  }

  // --- The table ----------------------------------------------------------
  // Polished wood with a raised lip and a lighter playfield, like a real domino
  // table. The wood is a generated texture rather than a procedural mottle: a
  // polished surface is mostly its grain, and faking that in code reads as
  // plastic at exactly the distance the player sits.
  const woodTex = track(new THREE.TextureLoader().load('./assets/textures/wood.jpg'));
  woodTex.colorSpace = THREE.SRGBColorSpace;
  woodTex.wrapS = THREE.RepeatWrapping;
  woodTex.wrapT = THREE.RepeatWrapping;
  woodTex.repeat.set(2, 1.6);
  woodTex.anisotropy = 8;

  const woodMat = track(
    new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.24, metalness: 0.03 }),
  );
  const top = new THREE.Mesh(
    track(new THREE.BoxGeometry(TABLE.width, TABLE.thickness, TABLE.depth)),
    woodMat,
  );
  top.position.set(0, TABLE.topY - TABLE.thickness / 2, 0);
  top.castShadow = true;
  top.receiveShadow = true;
  top.name = 'tableTop';
  group.add(top);

  // The playfield: a deep blue inset where the tiles land. The wood frame and
  // the blue field are the original pairing — bone tiles against tan wood were
  // the readability complaint, and blue is the surface the tiles were proven
  // readable against. Matte on purpose: a smooth surface under a spot this
  // close blows out and swallows the tiles.
  const fieldMat = track(
    new THREE.MeshStandardMaterial({ color: 0x1d5280, roughness: 0.88, metalness: 0.0 }),
  );
  const field = new THREE.Mesh(
    track(new THREE.BoxGeometry(
      TABLE.width - TABLE.rimWidth * 2,
      0.006,
      TABLE.depth - TABLE.rimWidth * 2,
    )),
    fieldMat,
  );
  field.position.set(0, TABLE.topY + 0.002, 0);
  field.receiveShadow = true;
  field.name = 'playfield';
  group.add(field);

  // A raised lip around the perimeter. This is what makes the table read as a
  // domino table rather than a flat slab, and it catches the light along the
  // far edge, which is the brightest line in the frame.
  const rimMat = track(new THREE.MeshStandardMaterial({ color: 0x63391f, roughness: 0.3, metalness: 0.02 }));
  const rimLong = track(new THREE.BoxGeometry(TABLE.width, TABLE.rimHeight, TABLE.rimWidth));
  const rimShort = track(new THREE.BoxGeometry(TABLE.rimWidth, TABLE.rimHeight, TABLE.depth));
  for (const [geo, sx, sz] of [
    [rimLong, 0, TABLE.halfD - TABLE.rimWidth / 2],
    [rimLong, 0, -TABLE.halfD + TABLE.rimWidth / 2],
    [rimShort, TABLE.halfW - TABLE.rimWidth / 2, 0],
    [rimShort, -TABLE.halfW + TABLE.rimWidth / 2, 0],
  ]) {
    const rim = new THREE.Mesh(geo, rimMat);
    rim.position.set(sx, TABLE.topY + TABLE.rimHeight / 2, sz);
    rim.castShadow = true;
    rim.receiveShadow = true;
    group.add(rim);
  }

  const legMat = track(new THREE.MeshStandardMaterial({ color: 0x3b3f45, roughness: 0.45, metalness: 0.5 }));
  const legGeo = track(new THREE.CylinderGeometry(0.026, 0.026, TABLE.topY - TABLE.thickness, 10));
  const legInset = 0.12;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(
        sx * (TABLE.halfW - legInset),
        (TABLE.topY - TABLE.thickness) / 2,
        sz * (TABLE.halfD - legInset),
      );
      leg.castShadow = true;
      group.add(leg);
    }
  }

  // --- Lighting -----------------------------------------------------------
  // The hemisphere is the shop's own light and has to carry most of the room:
  // the spot is aimed down at the table and never reaches the shelves, the
  // cooler or the counter. Dropping it low enough to make the table dramatic
  // turns everything behind the players into black masses.
  const fill = new THREE.HemisphereLight(0xffeed6, 0x4a4136, 1.05);
  group.add(fill);

  const key = new THREE.SpotLight(TUBE_COLOR, 2.6, 9.5, 1.4, 0.85, 1.7);
  key.position.set(0, TUBE_ROW_Y, 0.05);
  key.target.position.set(0, TABLE.topY, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.4;
  key.shadow.camera.far = 5.5;
  key.shadow.bias = -0.0018;
  key.shadow.normalBias = 0.012;
  group.add(key, key.target);

  // The tube itself, visible at the top of the frame, plus its housing.
  const tubeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: TUBE_COLOR,
      emissiveIntensity: 2.6,
      roughness: 0.4,
    }),
  );
  const tube = new THREE.Mesh(track(new THREE.BoxGeometry(TUBE_LENGTH, 0.045, 0.075)), tubeMat);
  tube.position.set(0, TUBE_ROW_Y + 0.06, 0.05);
  tube.name = 'tube';
  group.add(tube);
  const housing = new THREE.Mesh(
    track(new THREE.BoxGeometry(TUBE_LENGTH + 0.12, 0.05, 0.14)),
    track(new THREE.MeshStandardMaterial({ color: 0xd6d2c8, roughness: 0.6 })),
  );
  housing.position.set(0, TUBE_ROW_Y + 0.12, 0.05);
  group.add(housing);

  // Warm glow from the shop interior, behind the partner's shoulder.
  const shopGlow = new THREE.PointLight(SHOP_GLOW, 2.2, 7, 2);
  shopGlow.position.set(0.9, 1.7, roomBackZ + 0.6);
  group.add(shopGlow);

  // Cool spill from the open cooler, so the left of the shop is not dead.
  const coolerLight = new THREE.PointLight(COOLER_GLOW, 0.9, 3.2, 2);
  coolerLight.position.set(-1.0, 1.35, -2.2);
  group.add(coolerLight);

  const table = Object.freeze({
    topY: TABLE.topY,
    halfW: TABLE.halfW,
    halfD: TABLE.halfD,
    mesh: top,
    center: new THREE.Vector3(0, TABLE.topY, 0),
  });

  return {
    table,
    lights: [fill, key, shopGlow, coolerLight],
    group,
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose?.();
      disposables.length = 0;
    },
  };
}
