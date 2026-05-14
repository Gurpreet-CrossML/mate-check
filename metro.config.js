const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// react-native-filament loads .glb meshes via require(); Metro otherwise
// treats unknown extensions as source files.
config.resolver.assetExts.push("glb", "gltf");

module.exports = withNativeWind(config, { input: "./global.css" });
