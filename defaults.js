// Provided top-level:
//  (bind|bindTileView|bindImageView)(event | events, callback)
//  on("load", callback)
//  on("select-item", callback)
//
// Provided by the argument to the callbacks:
//  rows, cols: shape of the tile view
//  firstItem: index of the first item in the tile view
//  activeRow, activeCol: active tile in the tile view (firstItem is 0,0 even if firstItem > 0)
//  isFullscreen: true if window is in full screen mode
//  items: list of all images
//  activeIndex: index of active image
//  activeItem: infos of active image (right now, only filename)
//  quit(): quit the program
//  tileView(): enter tile view
//  imageView(): enter image view
//  setStatus(status): set status bar. You can pass a string, or React.createElement(...) for more complicated markup
//  setActiveItem(index | { activeRow, activeCol, firstItem })
//  fullscreen(enabled): true to enable full-screen, false to disable it
//  shellExec(cmd, [options]): cmd is string (and then executed by /bin/sh -c) or array. options is the same as node's spawn
//    defaults stdio is ['ignore','pipe','inherit']. This is a promise that resolve with [rc, stdout, stderr]
//
//  This file also defines a global `ibiv` object to share code between configuration files.
//  It initially provides the `pageUp`, `pageDown` and `shellStatus` functions.

globalThis.ibiv = {};

ibiv.pageUp = v => {
  const firstItem = v.firstItem - v.rows * v.cols;
  if(firstItem < 0) {
    v.setActiveItem(0);
  } else {
    v.setActiveItem({ firstItem, activeRow: v.activeRow, activeCol: v.activeCol });
  }
}

ibiv.pageDown = v => {
  const firstItem = v.firstItem + v.rows * v.cols;
  const maxIdx = v.items.length - 1;
  const maxFirstItem = maxIdx - (maxIdx % v.cols) - (v.rows - 1) * v.cols;
  if(firstItem > maxFirstItem || firstItem + v.activeRow*v.cols + v.activeCol >= v.items.length) {
    v.setActiveItem(maxIdx);
  } else {
    v.setActiveItem({ firstItem, activeRow: v.activeRow, activeCol: v.activeCol });
  }
}

ibiv.shellStatus = async (v, cmd, opts) => {
  const basename = v.activeItem.name;
  const cmdString = Array.isArray(cmd) ? cmd.join(" ") : cmd;
  v.setStatus(`[${v.activeIndex+1}/${v.items.length} ⏳] ${basename}: executing ${cmdString}`);
  const { failed, stdout, stderr } = await v.shellExec(cmd, opts);
  const output = stderr ? stderr : stdout;
  if(failed) {
    v.setStatus(`[${v.activeIndex+1}/${v.items.length} ❌] ${basename}: ${cmdString}: error: ${output}`);
  } else if(output) {
    v.setStatus(`[${v.activeIndex+1}/${v.items.length} ✅] ${basename}: ${cmdString}: success: ${output}`);
  } else {
    v.setStatus(`[${v.activeIndex+1}/${v.items.length} ✅] ${basename}: ${cmdString}: success`);
  }
}

on("load", v => v.items.length > 1 ? v.tileView() : v.imageView());
on("select-item", v => v.setStatus(`[${v.activeIndex+1}/${v.items.length}] ${v.activeItem.name}`));
on("click-item", (v, idx) => idx === v.activeIndex ? v.imageView() : v.setActiveItem(idx));
on("click-image", v => v.tileView());

bindTileView("ArrowUp", v => v.setActiveItem(v.activeIndex - v.cols));
bindTileView("ArrowDown", v => v.setActiveItem(v.activeIndex + v.cols));
bindTileView("ArrowLeft", v => v.setActiveItem(v.activeIndex - 1));
bindTileView("ArrowRight", v => v.setActiveItem(v.activeIndex + 1));
bindTileView("Home", v => v.setActiveItem(0));
bindTileView("End", v => v.setActiveItem(v.items.length - 1));
bindTileView("Enter", v => v.imageView());
bindTileView("PageUp", ibiv.pageUp);
bindTileView("PageDown", ibiv.pageDown);

bindImageView(["Backspace", "ArrowLeft"], v => v.setActiveItem(v.activeIndex - 1));
bindImageView([" ", "ArrowRight"], v => v.setActiveItem(v.activeIndex + 1));
bindImageView(["q", "m", "Enter"], v => v.tileView());

bind("f", v => v.fullscreen(!v.isFullscreen));

// Example:
//   bind("1", v => ibiv.shellStatus(v, ["add-tag", v.activeItem.location, "not-edited"]))
//   bind("2", v => ibiv.shellStatus(v, ["rm", "-f", v.activeItem.location]))
