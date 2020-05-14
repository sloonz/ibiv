# ibiv (In-Browser Image Viewer)

This is an image viewer, similar to `qiv` and `pqiv`, but written in
Typescript/React and running in a browser.

It works by embedding both a server part and a client part in a single
Javascript file. The server provides access to images and thumbnails to
the client, and serves the client to a browser.

## Features

* Customizable with simple Javascript configuration
* Full-keyboard navigation
* Video support
* Thumbnails view
* Ability to bind keyboard shortcut to shell commands

## Dependencies

* NodeJS
* ImageMagick
* FFmpeg (for videos thumbnails)
* Any browser

## Building and installation

`npm ci && npm run build && sudo install --mode=755 dist/bundle.js /usr/local/bin/ibiv`

## Usage

`ibiv images...` will launch a preview of images given to the
argument. Use keyboard arrows to navigate between images, and press
Enter to view the image associated to the selected thumbnail.

Use `--no-defaults` to disable the load of the default configuration, use
`-c` to load your own configuration file (repeatable for more than one).

You can use `--host/--port` to listen on another interface and a specific port.

Use `--no-auto-launch` to only start the server without trying to open
the interface in a new browser tab.

Use `--no-auto-exit` to prevent the server from exiting when the browser
tab is closed.

## Configuration

The content of the status bar and the keybindings are both configurable
by providing a Javascript file with `-c`. You can see the default
configuration (providing the default keybindings and some helpers like
`shellStatus`) in [defaults.js](/src/defaults.js).

## Screenshots

![Thumbnails view](/screenshots/thumbnails.png?raw=true)
![Video view](/screenshots/video.png?raw=true)
