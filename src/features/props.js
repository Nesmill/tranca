// The generated colmado props (Tripo text-to-3D, web-optimized): a stocked
// shelf, a radio on a soda crate, a hanging lamp, a ceiling fan and a shop
// stool. They dress the room world.js's stage builds — a failed load just
// leaves that corner bare, the table never waits on the network.
//
// Every export is normalised to 1.0 units (see assets/props/props.json);
// placements below derive from layout.js's WORLD_LIMITS (back wall z=-1.80,
// ceiling ~2.45) and were tuned against screenshots.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// [name, scale, position, rotation, spin] — spin is rad/s about the model's
// own X (the fan's blade axis once its wrapper hangs it stem-up).
const PLACEMENTS = [
  ['shelf', 1.15, new THREE.Vector3(-0.62, 0, -1.50), new THREE.Euler(0, 0.05, 0), 0],
  ['crate', 0.50, new THREE.Vector3(0.82, 0, -1.25), new THREE.Euler(0, 0.35, 0), 0],
  ['radio', 0.30, new THREE.Vector3(0.82, 0.52, -1.28), new THREE.Euler(0, -0.3, 0), 0],
  ['stool', 0.55, new THREE.Vector3(0.52, 0, -1.52), new THREE.Euler(0, -0.55, 0), 0],
  ['lamp', 0.70, new THREE.Vector3(0, 2.02, -0.25), new THREE.Euler(0, 0, 0), 0],
  ['fan', 0.55, new THREE.Vector3(0, 2.36, -0.70), new THREE.Euler(0, 0, -Math.PI / 2), 1.4],
];

export default {
  name: 'props',
  init(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'props';
    this.spinners = [];
    this.models = [];

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    for (const [name, scale, pos, rot, spin] of PLACEMENTS) {
      loader.load(
        `assets/props/${name}-web.glb`,
        (gltf) => {
          // A wrapper carries the placement (hang, face the room); the model
          // inside keeps its own local spin axis.
          const wrap = new THREE.Group();
          wrap.position.copy(pos);
          wrap.rotation.copy(rot);
          const model = gltf.scene;
          model.scale.setScalar(scale);
          model.traverse((o) => {
            if (o.isMesh) o.castShadow = true;
          });
          wrap.add(model);
          this.group.add(wrap);
          this.models.push(model);
          if (spin) this.spinners.push({ model, spin });
          ctx.log(`props: ${name} placed`);
        },
        undefined,
        (err) => ctx.log(`props: ${name} failed (${err?.message ?? err})`),
      );
    }

    ctx.scene.add(this.group);
    ctx.log('props: dressing the colmado');
  },

  update(dt) {
    for (const s of this.spinners) s.model.rotation.x += s.spin * dt;
  },

  dispose() {
    this.group?.parent?.remove(this.group);
    for (const model of this.models ?? []) {
      model.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const mat of mats) {
            mat?.map?.dispose();
            mat?.dispose();
          }
        }
      });
    }
    this.models = [];
    this.spinners = [];
    this.group = null;
    this.ctx = null;
  },
};
