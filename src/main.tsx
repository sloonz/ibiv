import React from "react";
import ReactDOM from "react-dom";

import type express from "express";
import type net from "net";

import UI from "./ui";

let isNode = false;
try {
  if(require('process').version) {
    isNode = true;
  }
} catch(e) {
}

declare const BUNDLED: boolean;
let isBundled = false;
try {
  isBundled = !!BUNDLED;
} catch(e) {
}

if(isNode) {
  const defaultConfig = isBundled ? require('raw-loader!./defaults.js').default :
    require('fs').readFileSync(require('path').resolve(__dirname, "defaults.js")).toString("utf-8");
  const setup = require('./server').default(defaultConfig);

  let listen: (port: number, host: string, cb: (err?: Error) => void) => net.Server;
  if(!isBundled) {
    const webpack = require('webpack');
    const Server = require('webpack-dev-server');
    const log = require('webpack-log')({ name: 'dev-server' });
    const config = require('../webpack.config');
    for(const m of ["url", "events", "punycode", "querystring"]) {
      // webpack-dev-server HMR needs those node polyfiils to work correctly
      delete config.externals[m];
    }
    const compiler = webpack({ ...config, mode: 'development' });

    let argv: any;
    const server = new Server(compiler, {
      publicPath: '/',
      filename: 'bundle.js',
      before: (app: express.Application) => setup(app),
      hot: true,
      overlay: true,
      historyApiFallback: {
        index: '/src/index.html',
      },
    }, log);
    listen = server.listen.bind(server);
  } else {
    const app: express.Application = require('express')();
    setup(app);
    if(setup.argv.autoExit)
      app.post('/exit', (req, res) => process.exit(0));
    app.get('/bundle.js', (req, res) => {
      res.type('.js');
      res.sendFile(__filename);
    });
    app.get('/*', (req, res) => {
      res.type('.html');
      res.send(require('./index.html').default);
    });
    listen = app.listen.bind(app);
  }
  const listener = listen(setup.argv.port, setup.argv.host, (err) => {
    if (err) {
      throw err;
    }
    const url = `http://${(listener.address() as any).address}:${(listener.address() as any).port}/` +
      (setup.authInfo.type == "token" ? `#token=${encodeURIComponent(setup.authInfo.token)}` : '');
    console.log(`Serving application on ${url}`);
    if(setup.authInfo.type == "basic") {
      console.log("Credentials:");
      console.log(`  Username: ${setup.authInfo.user}`);
      console.log(`  Password: ${setup.authInfo.password}`);
    }
    if(setup.argv.autoLaunch) {
      require('open')(url);
    }
  });
} else {
  document.addEventListener("DOMContentLoaded", () => ReactDOM.render(<UI/>, document.querySelector("#app")));
}
