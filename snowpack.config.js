module.exports = {
  mount: {
    src: "/"
  },
  optimize: {
    entrypoints: ["src/index.html"],
    bundle: true,
    minify: true,
    target: "es2018",
  },
};
