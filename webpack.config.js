// @ts-check
const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

/** @type {import("webpack").Configuration} */
const config = {
  // ── Entry points ─────────────────────────────────────────────────────────
  entry: {
    background: "./src/background/index.ts",
    content: "./src/content.ts",
    popup: "./src/popup.ts",
  },

  // ── Output ────────────────────────────────────────────────────────────────
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: true,
  },

  // ── Module resolution ─────────────────────────────────────────────────────
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
  },

  // ── Loaders ───────────────────────────────────────────────────────────────
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: [{ loader: "ts-loader", options: { transpileOnly: false } }],
        exclude: /node_modules/,
      },
    ],
  },

  // ── Copy static assets ────────────────────────────────────────────────────
  // Only third-party libs and static assets are copied.
  // All source files are now compiled from TypeScript.
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "manifest.json",     to: "manifest.json" },
        { from: "popup.html",        to: "popup.html" },
        { from: "icon.png",          to: "icon.png" },
        { from: "icon16.png",        to: "icon16.png" },
        { from: "icon48.png",        to: "icon48.png" },
        { from: "icon128.png",       to: "icon128.png" },
        // Third-party libs (not compiled by webpack)
        { from: "xlsx.min.js",       to: "xlsx.min.js" },
        { from: "pdf.min.js",        to: "pdf.min.js" },
        { from: "pdf.worker.min.js", to: "pdf.worker.min.js" },
      ],
    }),
  ],

  // ── Optimization ─────────────────────────────────────────────────────────
  optimization: {
    splitChunks: false,
  },

  devtool: false,
};

module.exports = (env, argv) => {
  if (argv && argv.mode === "development") {
    config.devtool = "inline-source-map";
  }
  return config;
};
