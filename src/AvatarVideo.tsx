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
    <View className="h-full w-full overflow-hidden rounded-2xl bg-black">
      <VideoView
        player={player}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
        allowsFullscreen
        nativeControls={false}
      />
    </View>
  );
}
