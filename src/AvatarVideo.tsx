import { useEffect } from "react";
import { View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

type Props = { videoUrl: string | null };

export function AvatarVideo({ videoUrl }: Props) {
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
    p.muted = false;
  });

  useEffect(() => {
    if (videoUrl) player.play();
  }, [videoUrl, player]);

  if (!videoUrl) return null;

  return (
    <View className="h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-surface">
      <VideoView
        player={player}
        style={{ width: "100%", height: "100%" }}
        contentFit="contain"
        nativeControls={false}
      />
    </View>
  );
}
