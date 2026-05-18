export const AVATAR_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #ffffff; overflow: hidden; }
  canvas { display: block; width: 100%; height: 100%; }
</style>
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
  }
}
</script>
</head>
<body>
<canvas id="canvas"></canvas>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_BASE64 = '__MODEL_BASE64__';
const MOUTH_NAMES = ['jawOpen', 'mouthOpen', 'viseme_aa', 'viseme_O', 'viseme_E'];

const post = (p) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(p));
const postLog = (m) => post({ type: 'log', message: String(m) });
const postReady = () => post({ type: 'ready' });
const postError = (m) => post({ type: 'error', message: String(m) });

function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// ===== Renderer / scene =====
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0.1, 3.2);

scene.add(new THREE.AmbientLight(0xffffff, 0.65));

const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
keyLight.position.set(1.8, 4.5, 3.0);
keyLight.castShadow = true;
keyLight.shadow.mapSize.width = 1024;
keyLight.shadow.mapSize.height = 1024;
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 12;
keyLight.shadow.camera.left = -2;
keyLight.shadow.camera.right = 2;
keyLight.shadow.camera.top = 2.5;
keyLight.shadow.camera.bottom = -2;
keyLight.shadow.bias = -0.0005;
keyLight.shadow.radius = 4;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffe0c8, 0.35);
fillLight.position.set(-3, 1.5, 2);
scene.add(fillLight);

// Ground plane that catches the avatar's shadow on a white backdrop.
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(10, 10),
  new THREE.ShadowMaterial({ opacity: 0.32 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.0;
ground.receiveShadow = true;
scene.add(ground);

// ===== Animation system =====
const clock = new THREE.Clock();
const wx = new THREE.Vector3(1, 0, 0);
const wy = new THREE.Vector3(0, 1, 0);
const wz = new THREE.Vector3(0, 0, 1);

const BONES = {
  head: null, neck: null, spine: null, hips: null,
  upperArms: { L: null, R: null },
  foreArms: { L: null, R: null },
  hands: { L: null, R: null },
};
const FINGERS = {
  L: { thumb: [], index: [], middle: [], ring: [], pinky: [] },
  R: { thumb: [], index: [], middle: [], ring: [], pinky: [] },
};
const BASE_QUATS = new Map();
const mouthTargets = [];

let amplitude = 0;
let talkGain = 0;
let action = null; // { name, startTime }

window.setAmplitude = function (v) {
  const n = +v;
  if (isFinite(n)) amplitude = Math.max(0, Math.min(1, n));
};

window.playAction = function (name) {
  if (ACTIONS[name]) {
    action = { name, startTime: clock.getElapsedTime() };
  }
};

// Parent-aware world-space bone rotation. three.js's built-in
// rotateOnWorldAxis assumes no rotated parent which is false for skeletons.
function applyWorldRot(bone, axis, angle) {
  if (!bone || !angle) return;
  bone.updateMatrixWorld(true);
  const oldWorld = bone.getWorldQuaternion(new THREE.Quaternion());
  const rot = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  const newWorld = rot.multiply(oldWorld);
  const parentWorld = new THREE.Quaternion();
  if (bone.parent) bone.parent.getWorldQuaternion(parentWorld);
  bone.quaternion.copy(parentWorld.invert()).multiply(newWorld);
}

function pointBoneAlong(bone, targetWorldDir) {
  const child = bone.children.find((c) => c.isBone);
  if (!child) return false;
  bone.updateMatrixWorld(true);
  const head = new THREE.Vector3();
  bone.getWorldPosition(head);
  const tail = new THREE.Vector3();
  child.getWorldPosition(tail);
  const currentDir = tail.sub(head);
  if (currentDir.lengthSq() < 1e-8) return false;
  currentDir.normalize();
  const rotInWorld = new THREE.Quaternion().setFromUnitVectors(currentDir, targetWorldDir);
  const oldWorld = bone.getWorldQuaternion(new THREE.Quaternion());
  const newWorld = rotInWorld.multiply(oldWorld);
  const parentWorld = new THREE.Quaternion();
  if (bone.parent) bone.parent.getWorldQuaternion(parentWorld);
  bone.quaternion.copy(parentWorld.invert()).multiply(newWorld);
  bone.updateMatrixWorld(true);
  return true;
}

const isFingerName = (n) => /(thumb|index|middle|ring|pinky|finger)/.test(n);

function classifyArmBone(name) {
  const lower = name.toLowerCase();
  if (isFingerName(lower)) return { side: null, kind: null };
  const isLeft = lower.includes('left') || lower.endsWith('_l') || lower.includes('_l_') || lower.startsWith('l_');
  const isRight = lower.includes('right') || lower.endsWith('_r') || lower.includes('_r_') || lower.startsWith('r_');
  const side = isLeft ? 'L' : isRight ? 'R' : null;

  const isHand = lower.includes('hand');
  const isForearm = lower.includes('forearm') || lower.includes('lowerarm');
  const isUpperArm = !isHand && !isForearm && (lower.includes('upperarm') ||
    (lower.includes('arm') && !lower.includes('shoulder')));

  if (isUpperArm) return { side, kind: 'upper' };
  if (isForearm) return { side, kind: 'fore' };
  if (isHand) return { side, kind: 'hand' };
  return { side: null, kind: null };
}

function findBones(root) {
  root.traverse((o) => {
    if (!o.isBone) return;
    const lower = o.name.toLowerCase();
    if (!BONES.head && lower.includes('head') && !lower.includes('end') && !lower.includes('top') && !lower.includes('forehead')) BONES.head = o;
    if (!BONES.neck && lower.includes('neck') && !lower.includes('end')) BONES.neck = o;
    if (!BONES.spine && lower.includes('spine') && !lower.includes('end')) BONES.spine = o;
    if (!BONES.hips && (/^(hips?|pelvis|root)$/.test(lower) || lower.endsWith('hips'))) BONES.hips = o;

    const c = classifyArmBone(o.name);
    if (c.side && c.kind === 'upper' && !BONES.upperArms[c.side]) BONES.upperArms[c.side] = o;
    else if (c.side && c.kind === 'fore' && !BONES.foreArms[c.side]) BONES.foreArms[c.side] = o;
    else if (c.side && c.kind === 'hand' && !BONES.hands[c.side]) BONES.hands[c.side] = o;

    // Fingers — collected per side+finger so thumbs-up can curl all
    // non-thumb fingers and leave the thumb extended.
    const isLeft = lower.includes('left') || lower.endsWith('_l') || lower.includes('_l_') || lower.startsWith('l_');
    const isRight = lower.includes('right') || lower.endsWith('_r') || lower.includes('_r_') || lower.startsWith('r_');
    const side = isLeft ? 'L' : isRight ? 'R' : null;
    if (side) {
      let finger = null;
      if (lower.includes('thumb')) finger = 'thumb';
      else if (lower.includes('index')) finger = 'index';
      else if (lower.includes('middle')) finger = 'middle';
      else if (lower.includes('ring')) finger = 'ring';
      else if (lower.includes('pinky') || lower.includes('little')) finger = 'pinky';
      if (finger) FINGERS[side][finger].push(o);
    }
  });
}

function poseAvatar(root) {
  findBones(root);
  postLog('bones — head:' + (BONES.head && BONES.head.name) +
    ' spine:' + (BONES.spine && BONES.spine.name) +
    ' hips:' + (BONES.hips && BONES.hips.name) +
    ' uL:' + (BONES.upperArms.L && BONES.upperArms.L.name) +
    ' uR:' + (BONES.upperArms.R && BONES.upperArms.R.name) +
    ' hL:' + (BONES.hands.L && BONES.hands.L.name));

  // Relaxed stance: arms hang almost straight down with a tiny forward
  // inclination (talk gestures stay in front of the body) and a small
  // outward angle per side so the upper arms don't fuse to the torso.
  const armTargets = {
    L: new THREE.Vector3(0.12, -1, 0.15).normalize(),
    R: new THREE.Vector3(-0.12, -1, 0.15).normalize(),
  };
  for (const side of ['L', 'R']) {
    if (BONES.upperArms[side]) pointBoneAlong(BONES.upperArms[side], armTargets[side]);
    if (BONES.foreArms[side]) pointBoneAlong(BONES.foreArms[side], armTargets[side]);
  }

  // Snapshot base pose. Every frame we reset to these, then layer in
  // idle / talk / action rotations on top.
  const all = [
    BONES.head, BONES.neck, BONES.spine, BONES.hips,
    BONES.upperArms.L, BONES.upperArms.R,
    BONES.foreArms.L, BONES.foreArms.R,
    BONES.hands.L, BONES.hands.R,
  ];
  for (const b of all) if (b) BASE_QUATS.set(b, b.quaternion.clone());

  // Save base quats for finger bones too — actions will reset to these.
  for (const side of ['L', 'R']) {
    for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
      for (const b of FINGERS[side][f]) BASE_QUATS.set(b, b.quaternion.clone());
    }
  }
}

// ===== Animation layers =====

function applyIdle(t) {
  // Subtle breathing + micro head sway, always on.
  if (BONES.spine) applyWorldRot(BONES.spine, wx, Math.sin(t * 0.6) * 0.012);
  if (BONES.head) {
    applyWorldRot(BONES.head, wy, Math.sin(t * 0.5 + 0.7) * 0.022);
    applyWorldRot(BONES.head, wx, Math.sin(t * 0.7) * 0.010);
  }
}

function applyTalk(t) {
  const target = amplitude > 0.04 ? 1 : 0;
  talkGain += (target - talkGain) * 0.06;
  if (talkGain < 0.005) return;

  // Head movement during speech — small bobs and tilts.
  if (BONES.head) {
    applyWorldRot(BONES.head, wx, Math.sin(t * 2.4) * 0.035 * talkGain);
    applyWorldRot(BONES.head, wy, Math.sin(t * 1.8 + 0.5) * 0.045 * talkGain);
    applyWorldRot(BONES.head, wz, Math.sin(t * 1.5 + 1.2) * 0.022 * talkGain);
  }

  // Subtle spine sway.
  if (BONES.spine) applyWorldRot(BONES.spine, wy, Math.sin(t * 1.1) * 0.025 * talkGain);

  // Arm gestures: upper arms swing slightly, forearms emphasise the beat,
  // hands wobble at the wrist. Left and right are phased apart so it
  // never looks symmetric.
  for (const side of ['L', 'R']) {
    const phase = side === 'L' ? 0 : 1.4;
    if (BONES.upperArms[side]) {
      applyWorldRot(BONES.upperArms[side], wx, Math.sin(t * 1.4 + phase) * 0.06 * talkGain);
      applyWorldRot(BONES.upperArms[side], wz, Math.sin(t * 1.0 + phase) * 0.03 * talkGain);
    }
    if (BONES.foreArms[side]) {
      applyWorldRot(BONES.foreArms[side], wx, Math.sin(t * 2.0 + phase + 0.5) * 0.15 * talkGain);
      applyWorldRot(BONES.foreArms[side], wy, Math.sin(t * 1.7 + phase) * 0.07 * talkGain);
    }
    if (BONES.hands[side]) {
      applyWorldRot(BONES.hands[side], wz, Math.sin(t * 2.3 + phase) * 0.10 * talkGain);
      applyWorldRot(BONES.hands[side], wx, Math.sin(t * 1.9 + phase + 0.3) * 0.08 * talkGain);
    }
  }
}

// ===== One-shot actions =====

const ACTIONS = {
  wave: {
    duration: 3.2,
    apply: (elapsed, t, blend) => {
      // Right arm raises up to model's right (viewer's left). Once the
      // arm is up, "forward" needs +wx (the rotation direction flips
      // for a Y-positive vector vs a Y-negative one).
      if (BONES.upperArms.R) {
        applyWorldRot(BONES.upperArms.R, wz, -(Math.PI * 2 / 3) * blend);
        applyWorldRot(BONES.upperArms.R, wx, 0.25 * blend);
      }
      // Forearm: continue rotation around +Z to bring it pointing up,
      // then a small +wx to tilt it forward toward the camera.
      if (BONES.foreArms.R) {
        applyWorldRot(BONES.foreArms.R, wz, -(Math.PI / 3) * blend);
        applyWorldRot(BONES.foreArms.R, wx, 0.4 * blend);
      }
      if (BONES.hands.R && BONES.foreArms.R) {
        // Compute the forearm's actual world axis (elbow → wrist) so
        // the twist is *exactly* axial. Rotating around any other axis
        // — world Y, bone-local Y — produces a perpendicular rotation
        // component that bends the wrist and visually detaches the
        // hand from the arm. With the runtime axis, the 180° flip is
        // a pure spin: palm faces the camera, no wrist bend.
        const elbow = new THREE.Vector3();
        const wrist = new THREE.Vector3();
        BONES.foreArms.R.getWorldPosition(elbow);
        BONES.hands.R.getWorldPosition(wrist);
        const armAxis = new THREE.Vector3().subVectors(wrist, elbow);
        if (armAxis.lengthSq() > 1e-8) {
          armAxis.normalize();
          applyWorldRot(BONES.hands.R, armAxis, Math.PI * blend);
        }
        // Side-to-side wave at the wrist. World Z (forward) is roughly
        // perpendicular to the raised forearm, so rotating around it
        // tilts the hand left and right relative to the camera.
        applyWorldRot(BONES.hands.R, wz, Math.sin(t * 9) * 0.4 * blend);
      }
      if (BONES.head) {
        applyWorldRot(BONES.head, wy, -0.15 * blend);
      }
    },
  },

  thumbsUp: {
    duration: 2.8,
    apply: (elapsed, t, blend) => {
      // Right upper arm: hugs the side with a forward tilt so the elbow
      // sits in front of the rib cage rather than against it.
      if (BONES.upperArms.R) {
        applyWorldRot(BONES.upperArms.R, wx, -0.55 * blend);
        applyWorldRot(BONES.upperArms.R, wz, -0.15 * blend);
      }
      // Forearm: ~90° elbow bend bringing the hand up to chest height.
      // wy +0.25 nudges it inward toward the body midline (hand sits
      // in front of the sternum, not out at the shoulder line).
      if (BONES.foreArms.R) {
        applyWorldRot(BONES.foreArms.R, wx, -1.55 * blend);
        applyWorldRot(BONES.foreArms.R, wy, 0.25 * blend);
      }
      // Twist the hand around the forearm axis so the palm faces the
      // body's left (which puts the thumb up for a right-hand pose).
      if (BONES.hands.R) {
        applyWorldRot(BONES.hands.R, wz, 1.4 * blend);
      }

      // Curl every non-thumb finger into a fist; leave thumb extended.
      const curl = 1.3 * blend;
      for (const f of ['index', 'middle', 'ring', 'pinky']) {
        for (const bone of FINGERS.R[f]) bone.rotateZ(curl);
      }
      for (const bone of FINGERS.R.thumb) bone.rotateZ(-0.15 * blend);

      if (BONES.head) {
        const nod = Math.sin(elapsed * 6) * Math.min(1, elapsed * 3) * Math.min(1, (2.8 - elapsed) * 3);
        applyWorldRot(BONES.head, wx, nod * 0.08 * blend);
      }
    },
  },

  dance: {
    duration: 7.0,
    apply: (elapsed, t, blend) => {
      const beat = Math.sin(t * 4);
      const offBeat = Math.sin(t * 4 + Math.PI / 2);
      const armBeat = Math.sin(t * 4 + 0.6);

      // Hip sway opposite the shoulders — classic dance silhouette.
      if (BONES.hips) {
        applyWorldRot(BONES.hips, wy, beat * 0.18 * blend);
        applyWorldRot(BONES.hips, wz, offBeat * 0.08 * blend);
      }
      if (BONES.spine) applyWorldRot(BONES.spine, wy, -beat * 0.12 * blend);

      if (BONES.head) {
        applyWorldRot(BONES.head, wx, offBeat * 0.10 * blend);
        applyWorldRot(BONES.head, wz, beat * 0.06 * blend);
      }

      // Each arm out to its own side (left arm +X, right arm -X) and
      // rocking forward-back with the beat.
      if (BONES.upperArms.L) {
        applyWorldRot(BONES.upperArms.L, wz, 0.45 * blend);
        applyWorldRot(BONES.upperArms.L, wx, -0.4 * blend);
        applyWorldRot(BONES.upperArms.L, wx, armBeat * 0.35 * blend);
      }
      if (BONES.upperArms.R) {
        applyWorldRot(BONES.upperArms.R, wz, -0.45 * blend);
        applyWorldRot(BONES.upperArms.R, wx, -0.4 * blend);
        applyWorldRot(BONES.upperArms.R, wx, -armBeat * 0.35 * blend);
      }
      if (BONES.foreArms.L) applyWorldRot(BONES.foreArms.L, wx, -0.6 * blend);
      if (BONES.foreArms.R) applyWorldRot(BONES.foreArms.R, wx, -0.6 * blend);
    },
  },
};

function applyAction(t) {
  if (!action) return;
  const a = ACTIONS[action.name];
  if (!a) { action = null; return; }
  const elapsed = t - action.startTime;
  if (elapsed >= a.duration) { action = null; return; }
  // Trapezoidal blend: ease in over 0.35s, hold, ease out over 0.35s.
  const blendIn = Math.min(1, elapsed / 0.35);
  const blendOut = Math.min(1, (a.duration - elapsed) / 0.35);
  const blend = blendIn * blendOut;
  a.apply(elapsed, t, blend);
}

function collectMouthTargets(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const dict = o.morphTargetDictionary;
    if (!dict) return;
    for (const n of MOUTH_NAMES) {
      const idx = dict[n];
      if (typeof idx === 'number') mouthTargets.push({ mesh: o, index: idx });
    }
  });
}

// ===== Load model =====
try {
  const loader = new GLTFLoader();
  const ab = base64ToArrayBuffer(MODEL_BASE64);
  loader.parse(
    ab,
    '',
    (gltf) => {
      try {
        const model = gltf.scene;
        model.updateMatrixWorld(true);

        poseAvatar(model);

        const raw = new THREE.Box3().setFromObject(model);
        const rsize = raw.getSize(new THREE.Vector3());
        const maxDim = Math.max(rsize.x, rsize.y, rsize.z);
        const scale = 1.6 / maxDim;
        model.scale.setScalar(scale);

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.y -= center.y + size.y * 0.05;
        model.position.z -= center.z;

        // Shadows: cast on every mesh, receive on the floor.
        model.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });

        collectMouthTargets(model);

        scene.add(model);
        model.updateMatrixWorld(true);
        const finalBox = new THREE.Box3().setFromObject(model);
        ground.position.y = finalBox.min.y;

        postReady();
      } catch (e) {
        postError('after-parse: ' + (e && e.message ? e.message : e));
      }
    },
    (err) => postError('parse: ' + (err && err.message ? err.message : err))
  );
} catch (e) {
  postError('load: ' + (e && e.message ? e.message : e));
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  // Reset bones to base, then layer animations on top.
  for (const [b, q] of BASE_QUATS) b.quaternion.copy(q);
  applyIdle(t);
  applyTalk(t);
  applyAction(t);

  for (const { mesh, index } of mouthTargets) {
    if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = amplitude;
  }

  renderer.render(scene, camera);
}
animate();
</script>
</body>
</html>`;
