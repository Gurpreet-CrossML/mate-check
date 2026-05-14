module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      // Required by react-native-filament — it uses worklets-core to run
      // its render loop off the JS thread.
      [
        "react-native-worklets-core/plugin",
        { processNestedWorklets: true },
      ],
    ],
  };
};
