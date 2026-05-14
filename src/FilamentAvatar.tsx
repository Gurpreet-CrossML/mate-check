import { useEffect, useRef } from "react";
import { View } from "react-native";
import {
  Camera,
  DefaultLight,
  FilamentScene,
  FilamentView,
  useFilamentContext,
  useModel,
  type FilamentModel,
} from "react-native-filament";

/**
 * 3D avatar rendered with react-native-filament.
 *
 * Why this works where expo-gl didn't: Filament uses Metal on iOS (and
 * Vulkan/OpenGL ES 3.x on Android), all of which composite correctly
 * in the iOS Simulator. expo-gl was the broken layer; the .glb model
 * and morph-target logic are unchanged.
 *
 * Pipeline:
 *  - useModel(require("../assets/model.glb")) loads the avatar and
 *    auto-adds it to the scene.
 *  - When the model state flips to "loaded" we walk asset entities to
 *    find the one with ARKit blendshape morphs (jawOpen, etc.), and
 *    cache the morph-target indices we care about.
 *  - A requestAnimationFrame loop reads `amplitudeRef.current` and
 *    pushes weights into renderableManager.setMorphWeights every
 *    frame. Same pattern as our sprite renderer, just real 3D.
 */

const MODEL = require("../assets/model.glb");

type Props = {
  amplitudeRef: React.MutableRefObject<number>;
};

export function FilamentAvatar({ amplitudeRef }: Props) {
  return (
    <View style={{ flex: 1 }}>
      <FilamentScene>
        <FilamentView style={{ flex: 1 }}>
          <DefaultLight />
          <Camera />
          <AvatarModel amplitudeRef={amplitudeRef} />
        </FilamentView>
      </FilamentScene>
    </View>
  );
}

// `useModel` and `useFilamentContext` must live inside <FilamentScene>,
// hence the inner component.
function AvatarModel({ amplitudeRef }: Props) {
  const model: FilamentModel = useModel(MODEL);
  const { renderableManager } = useFilamentContext();

  // All mutable per-frame state lives in a single ref so the render
  // loop can read it cheaply without re-render side effects.
  const stateRef = useRef({
    entity: null as null | unknown, // Filament Entity is opaque; treat as opaque handle
    jawOpen: -1,
    mouthFunnel: -1,
    eyeBlinkLeft: -1,
    eyeBlinkRight: -1,
    blinkUntilMs: 0,
    nextBlinkAtMs: 0,
  });

  // Locate the face mesh + its morph indices once the asset is loaded.
  useEffect(() => {
    if (model.state !== "loaded") return;
    const asset = model.asset;
    const entities = asset.getEntities();
    for (const e of entities) {
      const count = renderableManager.getMorphTargetCount(e);
      if (count <= 0) continue;
      let jaw = -1;
      let funnel = -1;
      let blinkL = -1;
      let blinkR = -1;
      for (let i = 0; i < count; i++) {
        const name = renderableManager.getMorphTargetNameAt(e, i);
        if (name === "jawOpen") jaw = i;
        else if (name === "mouthFunnel") funnel = i;
        else if (name === "eyeBlinkLeft") blinkL = i;
        else if (name === "eyeBlinkRight") blinkR = i;
      }
      // Pick the entity that has jawOpen — that's the face mesh on
      // an Avatar SDK / Ready Player Me rig. Skip the teeth/jaw-only
      // sub-meshes that only carry jawOpen + jawLeft/Right.
      if (jaw >= 0 && (funnel >= 0 || blinkL >= 0)) {
        stateRef.current.entity = e;
        stateRef.current.jawOpen = jaw;
        stateRef.current.mouthFunnel = funnel;
        stateRef.current.eyeBlinkLeft = blinkL;
        stateRef.current.eyeBlinkRight = blinkR;
        stateRef.current.nextBlinkAtMs =
          Date.now() + 2500 + Math.random() * 3500;
        console.log(
          "[FilamentAvatar] morphs ready jawOpen=",
          jaw,
          "blinkL=",
          blinkL
        );
        return;
      }
    }
    console.warn(
      "[FilamentAvatar] no entity with face morphs found — lip-sync disabled"
    );
  }, [model, renderableManager]);

  // Per-frame: drive mouth + blinks from amplitudeRef.
  useEffect(() => {
    if (model.state !== "loaded") return;

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const s = stateRef.current;
      if (!s.entity || s.jawOpen < 0) return;
      const entity = s.entity as Parameters<
        typeof renderableManager.setMorphWeights
      >[0];

      const now = Date.now();
      const amp = clamp01(amplitudeRef.current ?? 0);

      if (now >= s.nextBlinkAtMs) {
        s.blinkUntilMs = now + 120;
        s.nextBlinkAtMs = now + 2500 + Math.random() * 3500;
      }
      const blink = now < s.blinkUntilMs ? 1 : 0;

      try {
        // setMorphWeights writes `weights.length` morphs starting at
        // `offset` — we use single-element arrays so each call targets
        // exactly one morph index.
        renderableManager.setMorphWeights(entity, [amp * 0.9], s.jawOpen);
        if (s.mouthFunnel >= 0) {
          renderableManager.setMorphWeights(
            entity,
            [amp * 0.25],
            s.mouthFunnel
          );
        }
        if (s.eyeBlinkLeft >= 0) {
          renderableManager.setMorphWeights(entity, [blink], s.eyeBlinkLeft);
        }
        if (s.eyeBlinkRight >= 0) {
          renderableManager.setMorphWeights(entity, [blink], s.eyeBlinkRight);
        }
      } catch (err) {
        console.warn("[FilamentAvatar] setMorphWeights threw:", err);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [model.state, renderableManager, amplitudeRef]);

  return null;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
