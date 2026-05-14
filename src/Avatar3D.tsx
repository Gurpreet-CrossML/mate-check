import { useRef } from "react";
import { View } from "react-native";
import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { Renderer } from "expo-three";
import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";

// Default Ready Player Me avatar. Replace with any URL of the form
// https://models.readyplayer.me/<id>.glb — including ?morphTargets=... for
// the specific visemes you want pre-baked.
const DEFAULT_AVATAR_URL =
  "https://models.readyplayer.me/64bfa15f0e72c63d7c3934a6.glb?morphTargets=ARKit,Oculus%20Visemes";

type Props = {
  /** Override the default Ready Player Me avatar. */
  avatarUrl?: string;
  /**
   * Ref whose `.current` is an amplitude in [0, 1]. Read on every frame
   * to drive the mouth blendshape. Owned by the parent so audio playback
   * and rendering can update independently.
   */
  amplitudeRef: React.MutableRefObject<number>;
  /** Solid color behind the avatar; matches the screen's surface tone. */
  backgroundColor?: number;
};

const VISEMES = ["viseme_aa", "viseme_E", "viseme_O"] as const;
const BLINK_KEYS = ["eyeBlinkLeft", "eyeBlinkRight"] as const;

/**
 * Renders a Ready Player Me avatar with procedural idle motion and
 * audio-driven mouth movement. Runs entirely on the device GPU — no
 * server-side avatar inference.
 */
export function Avatar3D({
  avatarUrl = DEFAULT_AVATAR_URL,
  amplitudeRef,
  backgroundColor = 0x121f18,
}: Props) {
  // Hold mutable scene refs across re-renders without re-triggering effects.
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
    // Framed on the head/shoulders — RPM avatars are y-up, ~1.7m tall.
    camera.position.set(0, 1.55, 1.05);
    camera.lookAt(0, 1.55, 0);

    // Soft three-point-ish lighting. RPM PBR materials look dead without it.
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(1.2, 2, 1.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xfff0d1, 0.35);
    fill.position.set(-1.5, 1.2, 1);
    scene.add(fill);

    // Fetch the GLB ourselves — GLTFLoader.load() relies on URL fetching
    // semantics that aren't reliable in RN; parse() on raw bytes is.
    const loader = new GLTFLoader();
    let avatar: THREE.Object3D | null = null;
    try {
      const res = await fetch(avatarUrl);
      if (!res.ok) throw new Error(`avatar download failed ${res.status}`);
      const buffer = await res.arrayBuffer();
      const gltf = await new Promise<any>((resolve, reject) => {
        loader.parse(buffer, "", resolve, reject);
      });
      avatar = gltf.scene as THREE.Object3D;
    } catch (err) {
      console.warn("[Avatar3D] failed to load avatar:", err);
    }

    let mouthMeshes: THREE.Mesh[] = [];
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

      // Procedural idle: subtle head sway so the avatar never freezes.
      if (headBone) {
        headBone.rotation.y = Math.sin(t * 0.6) * 0.04;
        headBone.rotation.x = Math.sin(t * 0.4) * 0.02;
      }

      // Mouth from amplitude — split across a couple of visemes so the
      // result reads as generic talking instead of a single "ah" shape.
      const amp = clamp01(amplitudeRef.current ?? 0);
      // Random blink scheduler.
      if (t >= stateRef.current.nextBlinkAt) {
        stateRef.current.blinkUntil = t + 0.12;
        stateRef.current.nextBlinkAt = t + 2.5 + Math.random() * 3.5;
      }
      const blink = t < stateRef.current.blinkUntil ? 1 : 0;

      for (const mesh of mouthMeshes) {
        const dict = (mesh as any).morphTargetDictionary as Record<string, number>;
        const influences = (mesh as any).morphTargetInfluences as number[];
        if (!dict || !influences) continue;

        for (let i = 0; i < VISEMES.length; i++) {
          const idx = dict[VISEMES[i]];
          if (idx === undefined) continue;
          // Weight aa heaviest, others lighter, so the mouth opens but
          // doesn't lock into one vowel.
          const weight = i === 0 ? amp : amp * (0.5 - i * 0.15);
          influences[idx] = lerp(influences[idx] ?? 0, weight, Math.min(1, delta * 18));
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
      <GLView
        style={{ flex: 1 }}
        onContextCreate={onContextCreate}
        // RN re-creates the GL context if the view remounts; mark this
        // instance's state as cancelled so the previous animate() loop
        // exits cleanly when that happens.
        key="avatar3d-glview"
      />
    </View>
  );
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
