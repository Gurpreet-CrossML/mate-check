import { useEffect, useState } from "react";
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
 * Picks one of 4 mouth-state PNGs based on the current value of
 * `amplitudeRef.current` (sampled per animation frame). A blink frame
 * temporarily overrides the mouth frame every few seconds, and a
 * gentle Reanimated bob/sway keeps the figure visibly alive at idle.
 *
 * No expo-gl, no WebView, no native dependencies beyond Image —
 * works first try on iOS Simulator.
 */

// Placeholder: all five mouth states use the mascot until you render
// real frames via scripts/render-frames.html. To enable real lip-sync,
// drop the generated PNGs into assets/ and swap the right-hand side of
// these lines for `require("../assets/avatar_mouth_0.png")` etc.
const MASCOT = require("../assets/mascot.png");
const FRAME_CLOSED = MASCOT;
const FRAME_SLIGHT = MASCOT;
const FRAME_HALF = MASCOT;
const FRAME_WIDE = MASCOT;
const FRAME_BLINK = MASCOT;

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

// Amplitude buckets — quiet → closed, louder → wider open.
const THRESH_SLIGHT = 0.08;
const THRESH_HALF = 0.3;
const THRESH_WIDE = 0.6;

export function AvatarSprite({ amplitudeRef, frames = {} }: Props) {
  const f: Record<0 | 1 | 2 | 3, FrameSource> = {
    0: frames.closed ?? FRAME_CLOSED,
    1: frames.slightOpen ?? FRAME_SLIGHT,
    2: frames.halfOpen ?? FRAME_HALF,
    3: frames.wideOpen ?? FRAME_WIDE,
  };
  const blinkFrame = frames.blink ?? FRAME_BLINK;

  const [mouthBucket, setMouthBucket] = useState<0 | 1 | 2 | 3>(0);
  const [isBlinking, setIsBlinking] = useState(false);

  const bobY = useSharedValue(0);
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
        setIsBlinking(true);
        blinkTimer = setTimeout(() => {
          setIsBlinking(false);
          scheduleBlink();
        }, 140);
      }, delay);
    };
    scheduleBlink();

    // Poll amplitude on rAF. setState bails out if the bucket hasn't
    // changed, so we only re-render at speech transitions.
    let raf = requestAnimationFrame(function tick() {
      raf = requestAnimationFrame(tick);
      const a = amplitudeRef.current ?? 0;
      let bucket: 0 | 1 | 2 | 3 = 0;
      if (a > THRESH_WIDE) bucket = 3;
      else if (a > THRESH_HALF) bucket = 2;
      else if (a > THRESH_SLIGHT) bucket = 1;
      setMouthBucket((prev) => (prev === bucket ? prev : bucket));
    });

    return () => {
      cancelAnimationFrame(raf);
      if (blinkTimer) clearTimeout(blinkTimer);
      cancelAnimation(bobY);
      cancelAnimation(swayX);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bobY.value }, { translateX: swayX.value }],
  }));

  const source = isBlinking ? blinkFrame : f[mouthBucket];

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.layer, bobStyle]}>
        <Image source={source} style={styles.img} resizeMode="contain" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: "hidden" },
  layer: { ...StyleSheet.absoluteFillObject },
  img: { width: "100%", height: "100%" },
});
