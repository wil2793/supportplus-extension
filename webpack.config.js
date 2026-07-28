// @ts-check
const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

/** @type {import("webpack").Configuration} */
const config = {
  // ── Entry points ─────────────────────────────────────────────────────────
  // Each entry compiles to a single bundle consumed by the extension.
  entry: {
    // Service worker (background)
    background: "./src/background/index.ts",
    // Content script (injected into the SP page)
    content: "./src/content.ts",
    // Popup
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
    extensions: [".ts", ".js"],
    alias: {
      "@types": path.resolve(__dirname, "src/types"),
      "@lib": path.resolve(__dirname, "src/lib"),
      "@features": path.resolve(__dirname, "src/features"),
      "@background": path.resolve(__dirname, "src/background"),
    },
  },

  // ── Loaders ───────────────────────────────────────────────────────────────
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: "ts-loader",
            options: {
              // Faster builds: skip type-checking (run `npm run type-check` separately)
              transpileOnly: false,
            },
          },
        ],
        exclude: /node_modules/,
      },
    ],
  },

  // ── Copy static assets ────────────────────────────────────────────────────
  // Third-party minified files, icons, HTML, and the updated manifest are
  // copied as-is to dist/ so the extension folder is self-contained.
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "manifest.json", to: "manifest.json" },
        { from: "popup.html", to: "popup.html" },
        { from: "icon.png", to: "icon.png" },
        { from: "icon16.png", to: "icon16.png" },
        { from: "icon48.png", to: "icon48.png" },
        { from: "icon128.png", to: "icon128.png" },
        // Third-party libs bundled as-is (too large to webpack)
        { from: "xlsx.min.js", to: "xlsx.min.js" },
        { from: "pdf.min.js", to: "pdf.min.js" },
        { from: "pdf.worker.min.js", to: "pdf.worker.min.js" },
      ],
    }),
  ],

  // ── Optimization ─────────────────────────────────────────────────────────
  optimization: {
    // Keep each entry as a single file — Chrome extensions can't use
    // async chunk loading in content scripts or service workers.
    splitChunks: false,
  },

  // ── Dev tools ─────────────────────────────────────────────────────────────
  // Use inline source maps in dev; none in prod (keeps bundle small & avoids
  // Chrome extension store warnings about eval).
  devtool: false,
};

module.exports = (env, argv) => {
  if (argv.mode === "development") {
    config.devtool = "inline-source-map";
  }
  return config;
};
