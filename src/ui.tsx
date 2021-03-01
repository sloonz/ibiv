import React from "react";
import ReactDOM from "react-dom";
import range from "lodash/range";

interface ExecResult {
  exitCode: number;
  failed: boolean;
  stdout: string;
  stderr: string;
}

interface Item {
  filename: string;
  type: string;
}

interface TileProps {
  items: Item[];
  cols: number;
  rows: number;
  onSelectItem?: (index: number) => void;
}

interface TileState {
  firstItem: number;
  activeCol: number;
  activeRow: number;
}

function cls(classes: {[name: string]: boolean}): string {
  return Object.entries(classes).filter(([n,e]) => e).map(([n,e]) => n).join(" ");
}

class Tile extends React.Component<TileProps, TileState> {
  preloadedImages: {[idx: number]: HTMLImageElement};

  constructor(props: TileProps) {
    super(props);
    this.preloadedImages = {};
    this.state = {
      firstItem: 0,
      activeCol: 0,
      activeRow: 0,
    };
  }

  render() {
    const { cols, rows, items } = this.props;
    const { firstItem, activeCol, activeRow } = this.state;
    const thumbUrl = (idx: number) => `/thumbnails/${idx}/${encodeURIComponent(items[idx].filename)}`;
    const makeRow = (row: number) => {
      const id = `r-${firstItem+row*cols}-to-${firstItem+(row+1)*cols-1}`;
      return <div key={id} id={id} className="row">{range(cols).map(col => makeItem(row, col))}</div>;
    };
    const makeItem = (row: number, col: number) => {
      const idx = firstItem + row*cols + col;
      if(idx >= items.length) {
        return <div key={idx} className="item" />;
      }
      else {
        const im = this.preloadedImages[idx] ?? <img src={thumbUrl(idx)} />;
        return <div key={idx} id={`t-${idx}`} className={cls({"item":true, "active": (activeRow == row && activeCol == col)})}>{im}</div>;
      }
    };
    this.preloadedImages = {};
    for(let idx = firstItem + cols*rows; idx < Math.min(items.length, firstItem + cols*(rows + 1)); idx++) {
      const im = new Image();
      im.src = thumbUrl(idx);
      this.preloadedImages[idx] = im;
    }
    return <>{range(rows).map(row => makeRow(row))}</>
  }

  activeItem(): number {
    return this.state.firstItem + this.state.activeRow * this.props.cols + this.state.activeCol;
  }

  setActiveItem(item: number): void;
  setActiveItem(state: TileState): void;
  setActiveItem(arg: any): void {
    const { activeRow, activeCol, firstItem } = this.state;
    const { rows, cols } = this.props;

    let state: TileState;
    if(typeof arg === "number") {
      const item = Math.max(0, Math.min(this.props.items.length - 1, arg));

      if(item >= firstItem && item < firstItem + rows*cols) {
        // Item in current view range: just update activeCol/activeRow
        state = {
          firstItem,
          activeCol: (item - firstItem) % cols,
          activeRow: Math.floor((item - firstItem) / cols),
        };
      }
      else if(item < firstItem) {
        // Item outside of current view range and lower than current one: put new item in first row
        state = {
          firstItem: item - (item % cols),
          activeCol: item % cols,
          activeRow: 0,
        };
      }
      else {
        // Item outside of current view range and higher than current one: put new item in last row
        const newFirstItem = Math.max(0, item - cols*(rows - 1) - (item % cols));
        state = {
          firstItem: newFirstItem,
          activeCol: item % cols,
          activeRow: Math.floor((item - newFirstItem) / cols),
        };
      }
    } else {
      state = arg;
    }

    if(state.firstItem !== firstItem || state.activeRow !== activeRow || state.activeCol !== activeCol) {
      this.setState(state, () => {
        this.props.onSelectItem && this.props.onSelectItem(this.activeItem());
      });
    }
  }
}

class Controller {
  private _ui: UI;
  private _tile: Tile;

  constructor(ui: UI, tile: Tile) {
    this._ui = ui;
    this._tile = tile;
  }

  get cols(): number {
    return this._tile.props.cols;
  }

  get rows(): number {
    return this._tile.props.rows;
  }

  get activeRow(): number {
    return this._tile.state.activeRow;
  }

  get activeCol(): number {
    return this._tile.state.activeCol;
  }

  get firstItem(): number {
    return this._tile.state.firstItem;
  }

  get items(): Item[] {
    return this._ui.state.items;
  }

  get activeIndex(): number {
    return this._tile.activeItem();
  }

  get activeItem(): Item {
    return this._ui.state.items[this.activeIndex];
  }

  get isFullscreen(): boolean {
    return document.fullscreenElement !== null;
  }

  tileView() {
    this._ui.setState({ imageView: false });
  }

  imageView() {
    this._ui.setState({ imageView: true });
  }

  setStatus(status: string) {
    this._ui.setState({ status });
  }

  setActiveItem(item: number): void;
  setActiveItem(item: TileState): void;
  setActiveItem(item: any) {
    this._tile.setActiveItem(item);
  }

  fullscreen(enabled: boolean) {
    if(enabled) {
      document.body.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  async shellExec(cmd: string | string[]): Promise<ExecResult> {
    const res = await fetch("/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cmd: Array.isArray(cmd) ? cmd : ["/bin/sh", "-c", cmd] }),
    });
    return res.json();
  }
}

interface UIState {
  items: Item[];
  width: number;
  height: number;
  selectedItem: number;
  imageView: boolean;
  status: string;
}

export default class UI extends React.Component<{}, UIState> {
  tileRef: React.RefObject<Tile>;

  ready: boolean;
  handlers: {[event: string]: ((v: Controller) => any)[]};
  tileBindings: {[key: string]: (v: Controller) => any};
  imageBindings: {[key: string]: (v: Controller) => any};

  constructor(props: {}) {
    super(props);

    this.tileRef = React.createRef();
    this.ready = false;
    this.handlers = {};
    this.tileBindings = {};
    this.imageBindings = {};
    this.state = {
      items: [],
      width: window.innerWidth,
      height: window.innerHeight,
      selectedItem: 0,
      imageView: false,
      status: "loading...",
    };

    window.addEventListener("resize", () => this.setState({ width: window.innerWidth, height: window.innerHeight }));
    window.addEventListener("unload", () => {
      navigator.sendBeacon("/exit", "");
    });
    window.addEventListener("keydown", e => {
      const bindings = this.state.imageView ? this.imageBindings : this.tileBindings;
      const controller = this.createController();
      if(bindings[e.key] && this.ready && controller) {
        this.ready = false;
        Promise.resolve(bindings[e.key](controller)).
          catch(err => {
            console.error({ err });
            this.setState({ status: err.toString() });
          }).
          then(() => { this.ready = true; });
      }
    });
  }

  doSelectItem(item: number) {
    this.setState({ selectedItem: item }, () => this.runHandlers("select-item"));
  }

  createController(): Controller | null {
    if(this.tileRef == null || this.tileRef.current == null) {
      console.error("tile not ready, cannot process events");
      return null;
    } else {
      return new Controller(this, this.tileRef.current);
    }
  }

  runHandlers(event: string): Promise<any> {
    const controller = this.createController();
    if(this.handlers[event] && controller) {
      this.ready = false;
      return Promise.all(this.handlers[event].map(h => Promise.resolve(h(controller)))).
        catch(err => {
          console.error({ err });
          this.setState({ status: err.toString() });
        }).
        then(() => { this.ready = true; });
    } else {
      return Promise.resolve();
    }
  }

  loadConfig(config: string) {
    try {
      const f = new Function("on", "bind", "bindTileView", "bindImageView", "createElement", config);
      const on = (event: string, cb: (c: Controller) => any) => {
        this.handlers[event] = [...(this.handlers[event] || []), cb];
      };
      const bindTileView = (keys: string | string[], cb: (c: Controller) => any) => {
        for(let k of Array.isArray(keys) ? keys : [keys]) {
          this.tileBindings[k] = cb;
        }
      };
      const bindImageView = (keys: string | string[], cb: (c: Controller) => any) => {
        for(let k of Array.isArray(keys) ? keys : [keys]) {
          this.imageBindings[k] = cb;
        }
      };
      const bind = (keys: string | string[], cb: (c: Controller) => any) => {
        bindTileView(keys, cb);
        bindImageView(keys, cb);
      }
      f(on, bind, bindTileView, bindImageView, React.createElement, config);
    } catch(e) {
      console.error({ configError: e, config });
      this.setState({ status: `Error while loading config: ${e}`});
    }
  }

  componentDidMount() {
    if(document.location.hash.slice(1)) {
      for(const elem of document.location.hash.slice(1).split("&")) {
        const idx = elem.indexOf("=");
        if(idx !== -1 && elem.slice(0, idx) == "token") {
          const token = elem.slice(idx + 1);
          document.cookie = `token=${token}`;
        }
      }
    }

    Promise.all([
      fetch('/images').then(r => r.json()),
      fetch('/configs').then(r => r.json())
    ]).then(([items, configs]) => {
      this.setState({ items }, () => {
        for(let config of configs) {
          this.loadConfig(config);
        }
        this.runHandlers("load").then(() => this.runHandlers("select-item"));
      });
    }).catch(e => {
      console.error({ loadingError: e });
      this.setState({ status: `Loading error: ${e}` });
    });
  }

  render() {
    const { items, selectedItem } = this.state;
    const itemType = items[selectedItem]?.type;
    const itemUrl = `/images/${selectedItem}/${encodeURIComponent(items[selectedItem]?.filename)}`;
    const isVideo = itemType && !!itemType.match(/^video\//);
    return <div style={{height: "100%"}}>
      <div style={{height: this.state.height-20}} id="main-view">
        {this.state.items && <div>
          <Tile ref={this.tileRef}
            items={this.state.items}
            cols={Math.floor(this.state.width / 138)}
            rows={Math.floor((this.state.height-20)/138)}
            onSelectItem={this.doSelectItem.bind(this)} />
        </div>}
        {this.state.imageView && items && <div id="image-view">
          { isVideo ? <video loop controls autoPlay key={selectedItem}><source src={itemUrl} type={itemType} /></video> : <img key={selectedItem} src={itemUrl} /> }
        </div>}
        </div>
      <div id="statusbar">{this.state.status}</div>
    </div>;
  }
}

document.addEventListener("DOMContentLoaded", () => ReactDOM.render(<UI/>, document.querySelector("#app")));
