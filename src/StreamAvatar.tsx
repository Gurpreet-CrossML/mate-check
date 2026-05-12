import { View } from "react-native";
import { MediaStream, RTCView } from "react-native-webrtc";

type Props = { stream: MediaStream | null };

export function StreamAvatar({ stream }: Props) {
  if (!stream) return null;
  return (
    <View className="h-full w-full overflow-hidden rounded-3xl bg-black">
      <RTCView
        streamURL={stream.toURL()}
        style={{ width: "100%", height: "100%" }}
        objectFit="cover"
        mirror={false}
      />
    </View>
  );
}
