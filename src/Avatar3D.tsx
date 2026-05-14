import { useRef } from "react";
import { View } from "react-native";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { Renderer } from "expo-three";
import { Asset } from "expo-asset";
import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";

import { stripGlbTextures } from "./glbStrip";

// `require()` returns Metro's numeric asset id; expo-asset turns it into
// a real local file path at runtime. Drop a replacement model.glb in
// place and rebuild — no other code change needed.
const DEFAULT_AVATAR: number = require("../assets/model.glb");

type Props = {
  /**
   * Either a Metro asset id (the result of `require("./avatar.glb")`)
   * or a remote URL. Defaults to the bundled `assets/model.glb`.
   */
  avatarSource?: number | string;
  /**
   * Ref whose `.current` is an amplitude in [0, 1]. Read on every frame
   * to drive the mouth blendshape. Owned by the parent so audio playback
   * and rendering can update independently.
   */
  amplitudeRef: React.MutableRefObject<number>;
  backgroundColor?: number;
};

// Mouth-open blendshapes from Apple's ARKit face-tracking set. jawOpen
// is the primary driver; mouthFunnel adds a subtle lip-rounding at
// higher amplitudes so the result doesn't look like a single
// jaw-drop loop.
const MOUTH_TARGETS: { name: string; weight: number }[] = [
  { name: "jawOpen", weight: 0.9 },
  { name: "mouthFunnel", weight: 0.25 },
];
const BLINK_KEYS = ["eyeBlinkLeft", "eyeBlinkRight"] as const;

/**
 * Renders a GLB avatar with procedural idle motion (head sway + blinks)
 * and audio-driven mouth movement. Everything runs on the device GPU —
 * no server-side avatar inference.
 */
export function Avatar3D({
  avatarSource = DEFAULT_AVATAR,
  amplitudeRef,
  backgroundColor = 0x121f18,
}: Props) {
  const stateRef = useRef<{
    cancelled: boolean;
    blinkUntil: number;
    nextBlinkAt: number;
  }>({
    cancelled: false,
    blinkUntil: 0,
    nextBlinkAt: 0,
  });

  async function onContextCreate(gl: ExpoWebGLRenderingContext) {
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;

    const renderer = new Renderer({ gl });
    renderer.setSize(width, height);
    renderer.setClearColor(backgroundColor, 1);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(backgroundColor);

    const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 100);
    // Framed on the head/shoulders — most full-body avatars are y-up,
    // ~1.7m tall. Adjust if your model is differently scaled.
    camera.position.set(0, 1.55, 1.05);
    camera.lookAt(0, 1.55, 0);

    // Soft three-point-ish lighting. PBR materials look dead without it.
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(1.2, 2, 1.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xfff0d1, 0.35);
    fill.position.set(-1.5, 1.2, 1);
    scene.add(fill);

    const loader = new GLTFLoader();
    let avatar: THREE.Object3D | null = null;
    try {
      const rawBuffer = await loadAvatarBuffer(avatarSource);
      // RN's Blob constructor doesn't accept ArrayBuffer parts, so
      // GLTFLoader's embedded-texture path fails (and spams the console).
      // Strip the texture refs before parsing — materials fall back to
      // their baseColorFactor, the avatar still renders cleanly.
      const buffer = stripGlbTextures(rawBuffer);
      console.log(
        "[Avatar3D] loaded",
        rawBuffer.byteLength,
        "bytes (",
        buffer.byteLength,
        "after texture strip); parsing"
      );
      const gltf = await new Promise<any>((resolve, reject) => {
        loader.parse(buffer, "", resolve, (err: any) => {
          reject(new Error(`GLTF parse failed: ${err?.message ?? String(err)}`));
        });
      });
      avatar = gltf.scene as THREE.Object3D;
      // After stripping textures, most materials default to pure white
      // (the glTF spec default when no baseColorFactor is present).
      // Tint them by material name so head, teeth, clothes, etc. read
      // as distinct surfaces instead of a uniform white blob.
      avatar.traverse((obj) => {
        const m = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (!m || !("color" in m)) return;
        const c = m.color;
        const wasWhite = c.r > 0.95 && c.g > 0.95 && c.b > 0.95;
        if (!wasWhite) return; // respect explicit baseColorFactor (e.g. eyelashes)
        c.setHex(pickFallbackColor(m.name));
      });
      console.log("[Avatar3D] avatar ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[Avatar3D] failed to load avatar:", msg);
    }

    const mouthMeshes: THREE.Mesh[] = [];
    let headBone: THREE.Object3D | null = null;
    if (avatar) {
      scene.add(avatar);
      avatar.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh && (mesh as any).morphTargetDictionary) {
          mouthMeshes.push(mesh);
        }
        if (obj.name === "Head") headBone = obj;
      });
    }

    const clock = new THREE.Clock();
    stateRef.current.nextBlinkAt = clock.getElapsedTime() + 2.5 + Math.random() * 2;

    const animate = () => {
      if (stateRef.current.cancelled) return;
      const t = clock.getElapsedTime();
      const delta = clock.getDelta();

      // Subtle head sway so the avatar never freezes.
      if (headBone) {
        headBone.rotation.y = Math.sin(t * 0.6) * 0.04;
        headBone.rotation.x = Math.sin(t * 0.4) * 0.02;
      }

      const amp = clamp01(amplitudeRef.current ?? 0);
      if (t >= stateRef.current.nextBlinkAt) {
        stateRef.current.blinkUntil = t + 0.12;
        stateRef.current.nextBlinkAt = t + 2.5 + Math.random() * 3.5;
      }
      const blink = t < stateRef.current.blinkUntil ? 1 : 0;

      // Smoothing factor — clamped so we don't overshoot when frame
      // rates dip.
      const smooth = Math.min(1, delta * 18);

      for (const mesh of mouthMeshes) {
        const dict = (mesh as any).morphTargetDictionary as Record<string, number>;
        const influences = (mesh as any).morphTargetInfluences as number[];
        if (!dict || !influences) continue;

        for (const target of MOUTH_TARGETS) {
          const idx = dict[target.name];
          if (idx === undefined) continue;
          const goal = amp * target.weight;
          influences[idx] = lerp(influences[idx] ?? 0, goal, smooth);
        }
        for (const key of BLINK_KEYS) {
          const idx = dict[key];
          if (idx === undefined) continue;
          influences[idx] = blink;
        }
      }

      renderer.render(scene, camera);
      gl.endFrameEXP();
      requestAnimationFrame(animate);
    };
    animate();
  }

  return (
    <View className="h-full w-full overflow-hidden rounded-3xl">
      <GLView style={{ flex: 1 }} onContextCreate={onContextCreate} key="avatar3d-glview" />
    </View>
  );
}

async function loadAvatarBuffer(source: number | string): Promise<ArrayBuffer> {
  if (typeof source === "string") {
    console.log("[Avatar3D] fetching", source);
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`download ${res.status} ${res.statusText} from ${source}`);
    }
    const buf = await res.arrayBuffer();
    sanityCheckGlb(buf, source);
    return buf;
  }

  // Bundled asset path. expo-asset materializes it to disk on first use.
  const asset = Asset.fromModule(source);
  await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  if (!uri) throw new Error("bundled asset has no uri after downloadAsync");
  console.log("[Avatar3D] loading bundled asset from", uri);
  const res = await fetch(uri);
  const buf = await res.arrayBuffer();
  sanityCheckGlb(buf, uri);
  return buf;
}

function sanityCheckGlb(buffer: ArrayBuffer, where: string): void {
  const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  if (head[0] === 0x3c /* '<' */) {
    throw new Error(`Got HTML instead of a GLB — wrong URL? (${where})`);
  }
  if (head[0] !== 0x67 /* 'g' for "glTF" magic */) {
    throw new Error(`Not a GLB (first bytes: ${Array.from(head).join(",")}, src=${where})`);
  }
}

// Map material name → fallback RGB. Loose substring matches so the
// same rules work across Avatar SDK / RPM / Meshy naming conventions.
function pickFallbackColor(name: string): number {
  const n = (name || "").toLowerCase();
  if (n.includes("teeth")) return 0xf4ece0;
  if (n.includes("eyeball") || n.includes("sclera")) return 0xfafafa;
  if (n.includes("cornea")) return 0xffffff;
  if (n.includes("eyelash") || n.includes("brow")) return 0x1a1a1a;
  if (n.includes("hair") || n.includes("beard")) return 0x3a2b22;
  if (n.includes("lip") || n.includes("mouth")) return 0xb56b6b;
  if (n.includes("head") || n.includes("face") || n.includes("skin") || n.includes("body"))
    return 0xcfa37a;
  if (n.includes("hat") || n.includes("cap")) return 0x4a4a4a;
  if (n.includes("outfit") || n.includes("shirt") || n.includes("cloth")) return 0x3a5a8a;
  if (n.includes("shoe") || n.includes("boot")) return 0x2a2a2a;
  if (n.includes("pants") || n.includes("trouser")) return 0x2c3a4a;
  return 0xb5b5b5; // neutral light gray fallback
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
