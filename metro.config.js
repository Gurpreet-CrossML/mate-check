const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Bundle 3D models alongside images. Without this Metro treats .glb / .gltf
// as source code and the require() call returns undefined.
config.resolver.assetExts.push("glb", "gltf");

module.exports = withNativeWind(config, { input: "./global.css" });
