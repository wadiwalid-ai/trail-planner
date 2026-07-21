const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Exclude the optional wasm tooling subtree from Metro's file map and file
// watcher. These packages (@tybys/wasm-util, @napi-rs/wasm-runtime, @emnapi/*)
// are Node-side build/tooling dependencies that are never imported by the app
// bundle. Their nested directories make Metro's FallbackWatcher crash with
// ENOENT whenever a post-merge `npm install` churns node_modules mid-walk.
// Metro feeds resolver.blockList into metro-file-map's ignorePattern, which is
// used for both crawling AND watching, so ignoring them here stops the crashes
// without affecting the bundle. (Safe: the app never imports these packages.)
const ignoreWasmTooling =
  /[\\/]node_modules[\\/](@tybys[\\/]wasm-util|@napi-rs[\\/]wasm-runtime|@emnapi[\\/][^\\/]+)[\\/]/;

const existingBlockList = config.resolver.blockList;
config.resolver.blockList = Array.isArray(existingBlockList)
  ? [...existingBlockList, ignoreWasmTooling]
  : [existingBlockList, ignoreWasmTooling].filter(Boolean);

module.exports = config;
