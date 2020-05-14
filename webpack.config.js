const path = require('path');
const webpack = require('webpack');
const externals = ["webpack", "webpack-log", "webpack-dev-server"].concat(require('module').builtinModules);

module.exports = {
  // We would like "node" here, but we can't customize node target externals
  // Instead try to emulate node target from web target configuration and configure node external ourself
  // (node, globalThis and resolve.aliasFields are the main differences we need to take care of)
  target: "web",

  mode: "production",
  devtool: "source-map",
  entry: "./main",
  context: path.resolve(__dirname, 'src'),
  node: false,
  output: {
    filename: "bundle.js",
    globalObject: "globalThis",
  },
  externals: Object.fromEntries(externals.map(m => [m, `commonjs ${m}`])),
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    aliasFields: [],
  },
  module: {
    rules: [
      { test: /\.tsx?$/, loader: "ts-loader" },
      { test: /\.html$/, loader: "raw-loader" },
    ]
  },
  plugins: [
    new webpack.DefinePlugin({ BUNDLED: 'true' }),
    new webpack.BannerPlugin({ banner: "#!/usr/bin/env node", raw: true }),
  ],
};
