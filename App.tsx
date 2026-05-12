import "./global.css";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ChatScreen } from "./src/ChatScreen";

export default function App() {
  return (
    <SafeAreaProvider>
      <ChatScreen />
    </SafeAreaProvider>
  );
}
