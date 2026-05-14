import { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

/**
 * 2D talking-avatar renderer driven by audio amplitude.
 *
 * Why sprite-based: iOS Simulator can't reliably back expo-gl or
 * react-native-webview, but `<Image>` is bulletproof. We pre-render
 * the 3D Avatar SDK model to ~4 mouth-open snapshots once, then swap
 * between them at runtime based on the amplitude envelope coming
 * from the TTS pipeline. Visually this lands in the same place as
 * amplitude-driven 3D lip-sync, with none of the native-module pain.
 *
 * Idle "alive" effect comes from a subtle Y-translate sine bob and a
 * randomly-timed blink overlay.
 *
 * Frames default to `mascot.png` so the app renders something out
 * of the box; pass real frames via the `frames` prop once you've
 * generated them.
 */

// Per-state avatar frame sources. Initially these are just copies of
// mascot.png (the thumbs-up placeholder); replace them with real
// renders generated from scripts/render-frames.html for actual
// talking-avatar visuals.
const FRAME_CLOSED = require("../assets/avatar_mouth_0.png");
const FRAME_SLIGHT = require("../assets/avatar_mouth_25.png");
const FRAME_HALF = require("../assets/avatar_mouth_50.png");
const FRAME_WIDE = require("../assets/avatar_mouth_75.png");
const FRAME_BLINK = require("../assets/avatar_blink.png");

type FrameSource = number; // result of require("./*.png")

type Props = {
  amplitudeRef: React.MutableRefObject<number>;
  /**
   * Override the per-state frame sources. Anything you leave out
   * uses the default avatar_*.png shipped in assets/.
   */
  frames?: {
    closed?: FrameSource;
    slightOpen?: FrameSource;
    halfOpen?: FrameSource;
    wideOpen?: FrameSource;
    blink?: FrameSource;
  };
};

// Amplitude thresholds for stepping between frames. Tuned so quiet
// moments still drop to "closed", and shouted syllables hit "wide".
const THRESH_SLIGHT = 0.08;
const THRESH_HALF = 0.3;
const THRESH_WIDE = 0.6;

export function AvatarSprite({ amplitudeRef, frames = {} }: Props) {
  const f = {
    closed: frames.closed ?? FRAME_CLOSED,
    slightOpen: frames.slightOpen ?? FRAME_SLIGHT,
    halfOpen: frames.halfOpen ?? FRAME_HALF,
    wideOpen: frames.wideOpen ?? FRAME_WIDE,
    blink: frames.blink ?? FRAME_BLINK,
  };

  // Opacity per mouth state — exactly one is 1 at any time, the rest 0.
  // Using opacity rather than mounting/unmounting keeps the textures
  // hot in memory so swaps are zero-latency.
  const opClosed = useSharedValue(1);
  const opSlight = useSharedValue(0);
  const opHalf = useSharedValue(0);
  const opWide = useSharedValue(0);
  const opBlink = useSharedValue(0);

  // Subtle idle bob so the avatar never looks frozen.
  const bobY = useSharedValue(0);
  // Faint left/right sway, out of phase with the bob.
  const swayX = useSharedValue(0);

  useEffect(() => {
    bobY.value = withRepeat(
      withSequence(
        withTiming(-2, { duration: 1700, easing: Easing.inOut(Easing.sin) }),
        withTiming(2, { duration: 1700, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
    swayX.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: 2300, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1.5, { duration: 2300, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );

    let blinkTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleBlink = () => {
      const delay = 2500 + Math.random() * 3500;
      blinkTimer = setTimeout(() => {
        opBlink.value = withSequence(
          withTiming(1, { duration: 60 }),
          withTiming(0, { duration: 130 })
        );
        scheduleBlink();
      }, delay);
    };
    scheduleBlink();

    // Drive the mouth opacities from the amplitude ref on every frame.
    // We snap to the nearest bucket and rely on a quick withTiming
    // (~70ms) to mask the cut between sprites.
    let raf = 0;
    let lastBucket = -1;
    const fade = (target: 0 | 1 | 2 | 3) => {
      const dur = 70;
      opClosed.value = withTiming(target === 0 ? 1 : 0, { duration: dur });
      opSlight.value = withTiming(target === 1 ? 1 : 0, { duration: dur });
      opHalf.value = withTiming(target === 2 ? 1 : 0, { duration: dur });
      opWide.value = withTiming(target === 3 ? 1 : 0, { duration: dur });
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const a = amplitudeRef.current ?? 0;
      let bucket: 0 | 1 | 2 | 3 = 0;
      if (a > THRESH_WIDE) bucket = 3;
      else if (a > THRESH_HALF) bucket = 2;
      else if (a > THRESH_SLIGHT) bucket = 1;
      if (bucket !== lastBucket) {
        lastBucket = bucket;
        fade(bucket);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      if (blinkTimer) clearTimeout(blinkTimer);
      cancelAnimation(bobY);
      cancelAnimation(swayX);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bobY.value }, { translateX: swayX.value }],
  }));
  const sClosed = useAnimatedStyle(() => ({ opacity: opClosed.value }));
  const sSlight = useAnimatedStyle(() => ({ opacity: opSlight.value }));
  const sHalf = useAnimatedStyle(() => ({ opacity: opHalf.value }));
  const sWide = useAnimatedStyle(() => ({ opacity: opWide.value }));
  const sBlink = useAnimatedStyle(() => ({ opacity: opBlink.value }));

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.layer, containerStyle]}>
        <Animated.View style={[styles.layer, sClosed]}>
          <Image source={f.closed} style={styles.img} resizeMode="contain" />
        </Animated.View>
        <Animated.View style={[styles.layer, sSlight]}>
          <Image source={f.slightOpen} style={styles.img} resizeMode="contain" />
        </Animated.View>
        <Animated.View style={[styles.layer, sHalf]}>
          <Image source={f.halfOpen} style={styles.img} resizeMode="contain" />
        </Animated.View>
        <Animated.View style={[styles.layer, sWide]}>
          <Image source={f.wideOpen} style={styles.img} resizeMode="contain" />
        </Animated.View>
        <Animated.View style={[styles.layer, sBlink]} pointerEvents="none">
          <Image source={f.blink} style={styles.img} resizeMode="contain" />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" },
  layer: { ...StyleSheet.absoluteFillObject },
  img: { width: "100%", height: "100%" },
});
