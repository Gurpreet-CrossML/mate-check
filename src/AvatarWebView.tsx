import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";

const DEFAULT_AVATAR: number = require("../assets/model.glb");

type Props = {
  avatarSource?: number | string;
  amplitudeRef: React.MutableRefObject<number>;
  backgroundColor?: string;
};

/**
 * 3D avatar renderer that does its actual rendering inside a WebView.
 *
 * Why this works on iOS Simulator where expo-gl / native 3D libraries
 * fail: WKWebView is a first-party Apple framework and renders WebKit
 * content reliably in the Simulator. Three.js running inside the
 * WebView has the full browser DOM, so `Blob`, `Image`, fetch streams,
 * and GLTFLoader all behave like they would on the web — meaning the
 * .glb loads with textures, morph targets, the lot.
 *
 * The WebView is pre-bundled in Expo Go, so we don't need a custom
 * dev client or any pod-install dance.
 *
 * Lifecycle:
 *  - Mount → resolve `model.glb` via expo-asset → read as base64.
 *  - Inject the base64 into an HTML page that uses three.js from a
 *    CDN to load the model and start a render loop.
 *  - 30 fps timer pushes `amplitudeRef.current` into the page so the
 *    mouth blendshape tracks audio amplitude.
 */
export function AvatarWebView({
  avatarSource = DEFAULT_AVATAR,
  amplitudeRef,
  backgroundColor = "#0E1A14",
}: Props) {
  const webRef = useRef<WebView | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const asset = Asset.fromModule(avatarSource as any);
        await asset.downloadAsync();
        const uri = asset.localUri || asset.uri;
        if (!uri) throw new Error("avatar asset has no uri after download");
        console.log("[AvatarWebView] reading", uri);
        const b64 = await FileSystem.readAsStringAsync(uri, {
          encoding: "base64",
        });
        console.log("[AvatarWebView] base64 length =", b64.length);
        if (!cancelled) setHtml(buildHtml(b64, backgroundColor));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[AvatarWebView] asset load failed:", msg);
        if (!cancelled) setError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [avatarSource, backgroundColor]);

  // Push amplitude into the WebView on a fixed cadence. The page smooths
  // it internally, so 30 fps is plenty.
  useEffect(() => {
    const id = setInterval(() => {
      const amp = amplitudeRef.current ?? 0;
      webRef.current?.injectJavaScript(
        `window.__onAmplitude && window.__onAmplitude(${amp}); true;`
      );
    }, 33);
    return () => clearInterval(id);
  }, [amplitudeRef]);

  const containerStyle = { flex: 1, backgroundColor };

  if (error || !html) {
    return <View style={containerStyle} />;
  }

  return (
    <WebView
      ref={webRef}
      style={containerStyle}
      originWhitelist={["*"]}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      androidLayerType="hardware"
      source={{ html, baseUrl: "https://localhost/" }}
      onMessage={(ev) => {
        try {
          const data = JSON.parse(ev.nativeEvent.data);
          if (data.type === "log") {
            console.log("[AvatarWebView/page]", ...(data.args || []));
          } else {
            console.log("[AvatarWebView]", data);
          }
        } catch {
          console.log("[AvatarWebView] msg:", ev.nativeEvent.data);
        }
      }}
    />
  );
}

function buildHtml(glbBase64: string, bg: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<style>
  html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:${bg}; }
  canvas { display:block; width:100%; height:100%; touch-action:none; }
</style>
</head>
<body>
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/"
  }
}
</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const log = (...args) => {
  if (window.ReactNativeWebView) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', args: args.map(String) })); } catch (_) {}
  }
};

window.addEventListener('error', (e) => log('error', e.message, e.filename, e.lineno));

let amplitude = 0;
window.__onAmplitude = (v) => { amplitude = typeof v === 'number' ? v : 0; };

const scene = new THREE.Scene();
scene.background = new THREE.Color('${bg}');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.01, 1000);
camera.position.set(0, 1.55, 1.2);
camera.lookAt(0, 1.55, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.95));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
keyLight.position.set(1.2, 2, 1.5);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xfff0d1, 0.4);
fillLight.position.set(-1.5, 1.2, 1);
scene.add(fillLight);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const GLB_BASE64 = "${glbBase64}";

function base64ToArrayBuffer(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

const mouthMeshes = [];
let headBone = null;
let blinkUntil = 0;
let nextBlinkAt = 2 + Math.random() * 3;

try {
  const buffer = base64ToArrayBuffer(GLB_BASE64);
  log('parsing GLB', buffer.byteLength);
  const loader = new GLTFLoader();
  loader.parse(buffer, '', (gltf) => {
    const avatar = gltf.scene;
    scene.add(avatar);
    const box = new THREE.Box3().setFromObject(avatar);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const targetY = box.max.y - size.y * 0.12;
    const dist = Math.max(size.y * 0.9, 1.0);
    camera.position.set(center.x, targetY, center.z + dist);
    camera.lookAt(center.x, targetY, center.z);
    avatar.traverse((obj) => {
      if (obj.isMesh && obj.morphTargetDictionary) mouthMeshes.push(obj);
      if (!headBone) {
        const n = (obj.name || '').toLowerCase();
        if (n === 'head' || n === 'avatarhead' || n === 'mixamorig:head') headBone = obj;
      }
    });
    log('avatar ready meshes=' + mouthMeshes.length + ' head=' + (!!headBone));
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
  }, (err) => {
    log('GLTF parse error', err && err.message ? err.message : String(err));
  });
} catch (err) {
  log('init exception', err && err.message ? err.message : String(err));
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const dt = Math.min(clock.getDelta(), 0.1);

  if (headBone) {
    headBone.rotation.y = Math.sin(t * 0.6) * 0.04;
    headBone.rotation.x = Math.sin(t * 0.4) * 0.02;
  }

  if (t >= nextBlinkAt) {
    blinkUntil = t + 0.12;
    nextBlinkAt = t + 2.5 + Math.random() * 3.5;
  }
  const blink = t < blinkUntil ? 1 : 0;
  const amp = Math.max(0, Math.min(1, amplitude));
  const smooth = Math.min(1, dt * 18);

  for (const mesh of mouthMeshes) {
    const dict = mesh.morphTargetDictionary;
    const inf = mesh.morphTargetInfluences;
    if (!dict || !inf) continue;
    const set = (name, goal) => {
      const i = dict[name];
      if (i === undefined) return;
      inf[i] = inf[i] * (1 - smooth) + goal * smooth;
    };
    set('jawOpen', amp * 0.9);
    set('mouthFunnel', amp * 0.25);
    const setRaw = (name, v) => {
      const i = dict[name];
      if (i !== undefined) inf[i] = v;
    };
    setRaw('eyeBlinkLeft', blink);
    setRaw('eyeBlinkRight', blink);
  }

  renderer.render(scene, camera);
}
animate();
</script>
</body>
</html>`;
}
