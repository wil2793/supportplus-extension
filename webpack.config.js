// @ts-check
const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

/** @type {import("webpack").Configuration} */
const config = {
  // ── Entry points ─────────────────────────────────────────────────────────
  // Only the service worker is compiled from TypeScript.
  // All content scripts remain as the original, battle-tested JS files
  // and are copied verbatim to dist/ (see CopyPlugin below).
  entry: {
    background: "./src/background/index.ts",
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
  },

  // ── Loaders ───────────────────────────────────────────────────────────────
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [{ loader: "ts-loader", options: { transpileOnly: false } }],
        exclude: /node_modules/,
      },
    ],
  },

  // ── Copy static assets & original JS content scripts ─────────────────────
  // Everything under content_scripts in the manifest is copied as-is.
  // The TypeScript src/ modules are for the background service worker only
  // (and for future incremental migration of individual features).
  plugins: [
    new CopyPlugin({
      patterns: [
        // ── Extension metadata & UI ───────────────────────────────────────
        { from: "manifest.json",  to: "manifest.json" },
        { from: "popup.html",     to: "popup.html" },
        { from: "popup.js",       to: "popup.js" },
        { from: "icon.png",       to: "icon.png" },
        { from: "icon16.png",     to: "icon16.png" },
        { from: "icon48.png",     to: "icon48.png" },
        { from: "icon128.png",    to: "icon128.png" },

        // ── Third-party libs (loaded before content scripts) ──────────────
        { from: "xlsx.min.js",       to: "xlsx.min.js" },
        { from: "pdf.min.js",        to: "pdf.min.js" },
        { from: "pdf.worker.min.js", to: "pdf.worker.min.js" },

        // ── Original content scripts (copied verbatim) ────────────────────
        // Root scripts
        { from: "env.js",        to: "env.js" },
        { from: "config.js",     to: "config.js" },
        { from: "styles.js",     to: "styles.js" },
        { from: "components.js", to: "components.js" },
        { from: "content.js",    to: "content.js" },

        // lib/
        { from: "lib/storage.js",      to: "lib/storage.js" },
        { from: "lib/logger.js",       to: "lib/logger.js" },
        { from: "lib/cache.js",        to: "lib/cache.js" },
        { from: "lib/event-bus.js",    to: "lib/event-bus.js" },
        { from: "lib/dom-utils.js",    to: "lib/dom-utils.js" },
        { from: "lib/templates.js",    to: "lib/templates.js" },
        { from: "lib/modal-builder.js",to: "lib/modal-builder.js" },
        { from: "lib/api.js",          to: "lib/api.js" },
        { from: "lib/monday-utils.js", to: "lib/monday-utils.js" },
        { from: "lib/observable.js",   to: "lib/observable.js" },

        // features/
        { from: "features/session.js",        to: "features/session.js" },
        { from: "features/header-buttons.js", to: "features/header-buttons.js" },
        { from: "features/row-colors.js",     to: "features/row-colors.js" },
        { from: "features/manager-view.js",   to: "features/manager-view.js" },
        { from: "features/detail-view.js",    to: "features/detail-view.js" },
        { from: "features/ticket-actions.js", to: "features/ticket-actions.js" },
        { from: "features/reports.js",        to: "features/reports.js" },
        { from: "features/guardias.js",       to: "features/guardias.js" },
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
