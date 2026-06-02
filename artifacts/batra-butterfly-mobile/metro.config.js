const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Ignore pnpm temp directories that cause ENOENT watcher crashes
config.resolver.blockList = [
  /node_modules\/.*_tmp_.*/,
  /node_modules\/\.pnpm\/.*_tmp_.*/,
];

if (config.watchFolders) {
  config.watchFolders = config.watchFolders.filter(
    f => !f.includes("_tmp_")
  );
}

module.exports = config;
