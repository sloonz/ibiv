# ibiv (In-Browser Image Viewer)

This is an image viewer, similar to `qiv` and `pqiv`, but written in
Typescript/React and running in a browser.

It works by embedding both a server part and a client part in a single
executable. The server provides access to images and thumbnails to the
client, and serves the client to a browser.

## Features

* Customizable with simple Javascript configuration
* Full-keyboard navigation
* Video support
* Thumbnails view
* Ability to bind keyboard shortcut to shell commands

## Dependencies

* Go 1.16 (for compilation)
* NodeJS
* ImageMagick
* FFmpeg (for videos thumbnails)
* Any browser

## Building and installation

`npm ci && npm run build && go build && sudo install --mode=755 dist/bundle.js /usr/local/bin/ibiv`

## Usage

`ibiv images...` will launch a preview of images given to the
argument. Use keyboard arrows to navigate between images, and press
Enter to view the image associated to the selected thumbnail.

Use `--defaults=0` to disable the load of the default configuration, use
`-c` to load your own configuration file (repeatable for more than one).

You can use `--listen` to listen on another interface and/or a specific port.

Use `--auto-launch=0` to only start the server without trying to open
the interface in a new browser tab.

Use `--auto-exit=0` to prevent the server from exiting when the browser
tab is closed.

## Configuration

The content of the status bar and the keybindings are both configurable
by providing a Javascript file with `-c`. You can see the default
configuration (providing the default keybindings and some helpers like
`shellStatus`) in [defaults.js](/src/defaults.js).

## Screenshots

![Thumbnails view](/screenshots/thumbnails.png?raw=true)
![Video view](/screenshots/video.png?raw=true)
