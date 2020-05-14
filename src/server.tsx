import express from "express";
import FileType from "file-type";
import bodyParser from "body-parser";
import basicAuth from "express-basic-auth";
import cookieParser from "cookie-parser";
import execa from "execa";
import yargs from "yargs";
import pick from "lodash/pick";
import max from "lodash/max";

import { promisify } from "util";
import fs from "fs";
import child_process from "child_process";
import process from "process";
import crypto from "crypto";
import path from "path";

const wrap = (f: (req: express.Request, res: express.Response) => Promise<any>, noEnd?: boolean) => (req: express.Request, res: express.Response) =>
  f(req, res).catch((err) => { console.error({ err }); res.end(); });

export default function(defaultConfig: string) {
  const argv = yargs.
    option("defaults", { type: "boolean", default: true }).
    option("config", { alias: "c", type: "string" }).
    option("auth", { choices: ["basic", "token", "none"], default: "token" }).
    option("user", { type: "string", default: "ibiv" }).
    option("password", { type: "string" }).
    option("token", { type: "string" }).
    option("host", { type: "string", default: "localhost" }).
    option("port", { type: "number", default: 0 }).
    option("auto-launch", { type: "boolean", default: true }).
    option("auto-exit", { type: "boolean", default: true }).
    argv;

  const files = Promise.all(argv._.map(async f => ({
    filename: f,
    type: (await FileType.fromFile(f))?.mime,
  })));

  let auth: express.Handler = (req, res, next) => next();
  let authInfo: any = { type: argv.auth };
  if(argv.auth == "basic") {
    authInfo.user = argv.user;
    authInfo.password = argv.passsword ?? crypto.randomBytes(16).toString('hex');
    auth = basicAuth({ users: {[authInfo.user]: authInfo.password }, challenge: true });
  } else if(argv.auth == "token") {
    authInfo.token = argv.token ?? crypto.randomBytes(16).toString('hex');
    auth = (req, res, next) => {
      if(req.cookies?.token && req.cookies.token == authInfo.token) {
        next();
      } else {
        res.status(403);
        res.end();
      }
    };
  }

  const setup = (app: express.Application) => {
    app.use(cookieParser());

    app.get('/images', auth, wrap(async (req, res) => {
      res.json(await files);
    }));

    app.get('/images/:id/*', auth, wrap(async (req, res) => {
      const file = (await files)[parseInt(req.params.id)];
      if(file.type)
        res.type(file.type);
      res.sendFile(path.resolve(process.cwd(), file.filename));
    }, true));

    app.get('/thumbnails/:id/*', auth, wrap(async (req, res) => {
      const file = (await files)[parseInt(req.params.id)];
      res.type('image/jpeg');

      let magickInputFile = file.filename;
      let magickInputStream: NodeJS.ReadableStream | "ignore" = "ignore";
      if(file.type && file.type.match(/^video\//)) {
        const { stdout } = await execa("ffprobe", ["-loglevel", "error", "-skip_frame", "nokey", "-select_streams", "v:0", "-show_entries", "packet=pts,flags", "-of", "csv=p=0", file.filename]);
        const pts = stdout.split("\n").filter(p => p.match(/^\d+,K/)).map(p => parseInt(p.split(",")[0]));
        const targetPts = Math.max(0, Math.floor(max(pts)!/10));
        const ffmpegCp = child_process.spawn('ffmpeg',
          ["-loglevel", "error", "-skip_frame", "nokey", "-i", file.filename, "-an", "-vsync", "0", "-vf", `select=gte(pts\\,${targetPts})`, "-frames", "1", "-f", "image2pipe", "-vcodec", "png", "-"],
          { stdio: ["ignore", "pipe", "inherit"] });
        magickInputFile = "-";
        magickInputStream = ffmpegCp.stdout;
      }

      const cp = child_process.spawn('magick',
        ['(', magickInputFile, '-resize', '128x128', ')', '(', '-size', '512x512', 'tile:pattern:checkerboard', '-level', '0%,75%', '-resize', '128x128', ')', '-compose', 'dstover', '-composite', 'jpeg:-'],
        { stdio: [magickInputStream, "pipe", "inherit"] });
      cp.stdout.pipe(res);
    }));

    app.get('/configs', auth, wrap(async (req, res) => {
      const readFile = promisify(fs.readFile);
      const configFiles: string[] = (Array.isArray(argv.config) ? argv.config : [argv.config]).filter(f => !!f);
      const configs = await Promise.all(configFiles.map(f => readFile(f, { encoding: 'utf-8' })));
      res.json([argv.defaults && defaultConfig, ...configs].filter(c => !!c));
    }));

    app.post('/exec', auth, bodyParser.json(), (req, res) => {
      const { cmd } = req.body;
      const subprocess = Array.isArray(cmd) ? execa(cmd[0], cmd.slice(1)) : execa(cmd, [], { shell: true });
      const p = (r: any) => pick(r, ["command", "exitCode", "stdout", "stderr", "failed", "timedOut", "killed", "signal", "signalDescription"]);
      subprocess.catch(err => res.json(p(err))).then(result => res.json(p(result))).catch(err => console.error({ err, cmd }));
    });
  };

  setup.argv = argv;
  setup.authInfo = authInfo;

  return setup;
}

