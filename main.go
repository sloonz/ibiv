package main

import (
	"bytes"
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	flag "github.com/spf13/pflag"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strconv"
	"strings"
)

//go:embed defaults.js
var defaultConfig string

//go:embed build
var assetsFS embed.FS

type Image struct {
	Filename string `json:"filename"`
	Type     string `json:"type"`
}

type fsFunc func(name string) (fs.File, error)

func (f fsFunc) Open(name string) (fs.File, error) {
	return f(name)
}

func writeError(w http.ResponseWriter, err error) bool {
	if err != nil {
		log.Print(err)
		w.WriteHeader(500)
		return true
	} else {
		return false
	}
}

func writeJson(w http.ResponseWriter, result interface{}) {
	data, err := json.Marshal(result)
	if writeError(w, err) {
		return
	}

	w.Header().Add("Content-Type", "application/json")
	w.WriteHeader(200)
	_, err = w.Write(data)
	if err != nil {
		log.Print(err)
	}
}

func checkToken(token string, h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		clientToken, err := req.Cookie("token")
		if err != nil || clientToken.Value != token {
			w.WriteHeader(403)
		} else {
			h.ServeHTTP(w, req)
		}
	})
}

func main() {
	useDefaultsP := flag.Bool("defaults", true, "use default configuration")
	configFilesP := flag.StringArrayP("config", "c", nil, "configuration files")
	autoLaunchP := flag.Bool("auto-launch", true, "start browser automatically")
	autoExitP := flag.Bool("auto-exit", true, "exit when browser tab is closed")
	tokenP := flag.String("token", "", "authentication token")
	listenAddrP := flag.StringP("listen", "l", "127.0.0.1:0", "listen addws")
	flag.Parse()

	useDefaults := *useDefaultsP
	configFiles := *configFilesP
	autoLaunch := *autoLaunchP
	autoExit := *autoExitP
	token := *tokenP
	listenAddr := *listenAddrP

	images := make([]Image, 0, len(flag.Args()))
	for _, filename := range flag.Args() {
		f, err := os.Open(filename)
		if err != nil {
			log.Fatalf("cannot open %s: %v", filename, err)
		}
		defer f.Close()

		hdr := make([]byte, 512)
		n, err := io.ReadAtLeast(f, hdr, len(hdr))
		if err != nil && err != io.ErrUnexpectedEOF {
			log.Fatalf("cannot read %s header: %v", filename, err)
		}

		typ := http.DetectContentType(hdr[:n])
		if typ == "application/octet-stream" && bytes.Compare(hdr[4:8], []byte("ftyp")) == 0 {
			// Most likely video/mp4 but unfortunately the spec (exactly implemented by DetectContentType)
			// is more strict in what it considers video/mp4 than what most browsers do, and there’s a decent
			// chunk of mp4 videos detected by the browsers but not by DetectContentType out there.
			//
			// The standard says that video/mp4 is only allowed if the brand is "mp4", but Firefox accepts way more brands:
			// https://github.com/mozilla/gecko-dev/blob/master/toolkit/components/mediasniffer/nsMediaSniffer.cpp
			//
			// For Chrome, any MPEG-4 ISO Base Media file is video/mp4 and ignores the brand altogether:
			// https://github.com/chromium/chromium/blob/master/net/base/mime_sniffer.cc
			typ = "video/mp4"
		}

		images = append(images, Image{
			Filename: filename,
			Type:     typ,
		})
	}

	if token == "" {
		bToken := make([]byte, 16)
		_, err := rand.Read(bToken)
		if err != nil {
			log.Fatalf("cannot generate token: %v", err)
		}
		token = hex.EncodeToString(bToken)
	}

	configs := make([]string, len(configFiles)+1)
	for i, configFile := range configFiles {
		config, err := os.ReadFile(configFile)
		if err != nil {
			log.Fatalf("cannot read %s: %v", configFile, err)
		}
		configs[i+1] = string(config)
	}

	if useDefaults {
		configs[0] = defaultConfig
	} else {
		configs = configs[1:]
	}

	mux := http.NewServeMux()
	srv := http.Server{Handler: mux}

	mux.Handle("/configs", checkToken(token, http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		writeJson(w, configs)
	})))

	mux.Handle("/exit", checkToken(token, http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(200)
		if autoExit {
			os.Exit(0)
		}
	})))

	mux.Handle("/images", checkToken(token, http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		writeJson(w, images)
	})))

	mux.Handle("/images/", checkToken(token, http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		idx, err := strconv.Atoi(strings.Split(req.URL.Path, "/")[2])
		if writeError(w, err) {
			return
		}

		if idx >= len(images) {
			w.WriteHeader(404)
			return
		}

		imagePath, err := filepath.Abs(images[idx].Filename)
		if writeError(w, err) {
			return
		}

		http.ServeFile(w, req, imagePath)
	})))

	mux.Handle("/thumbnails/", checkToken(token, http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		idx, err := strconv.Atoi(strings.Split(req.URL.Path, "/")[2])
		if writeError(w, err) {
			return
		}

		if idx >= len(images) {
			w.WriteHeader(404)
			return
		}

		imagePath, err := filepath.Abs(images[idx].Filename)
		if writeError(w, err) {
			return
		}

		var magickInput io.Reader
		magickInputFile := "-"
		if strings.HasPrefix(images[idx].Type, "video/") || images[idx].Type == "image/gif" {
			probeCmd := exec.Command("ffprobe", "-loglevel", "error", "-select_streams", "v:0", "-of", "csv=p=0", "-show_entries", "format=duration", imagePath)
			probeCmd.Stderr = os.Stderr
			out, err := probeCmd.Output()
			if writeError(w, err) {
				return
			}

			duration, err := strconv.ParseFloat(strings.TrimSpace(string(out)), 32)
			if writeError(w, err) {
				return
			}

			ffmpegCmd := exec.Command("ffmpeg", "-loglevel", "error", "-ss", fmt.Sprintf("%.03f", duration/5), "-i", imagePath, "-an", "-vf", "thumbnail", "-vframes", "1", "-f", "image2pipe", "-vcodec", "png", "-")
			ffmpegCmd.Stderr = os.Stderr

			pipe, err := ffmpegCmd.StdoutPipe()
			if writeError(w, err) {
				return
			}
			defer pipe.Close()

			err = ffmpegCmd.Start()
			if writeError(w, err) {
				return
			}
			defer ffmpegCmd.Wait()

			magickInput = pipe
		} else {
			magickInputFile = imagePath
		}

		w.Header().Add("Content-Type", "image/jpeg")

		magickCmd := exec.Command("magick", "(", magickInputFile, "-resize", "128x128", ")", "(", "-size", "512x512", "tile:pattern:checkerboard", "-level", "0%,75%", "-resize", "128x128", ")", "-compose", "dstover", "-composite", "jpeg:-")
		magickCmd.Stdin = magickInput
		magickCmd.Stdout = w
		magickCmd.Stderr = os.Stderr
		err = magickCmd.Run()
		if err != nil {
			log.Print(err)
		}
	})))

	mux.Handle("/exec", checkToken(token, http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		type ExecReq struct {
			Cmd []string `json:"cmd"`
		}

		type ExecRes struct {
			ExitCode int    `json:"exitCode"`
			Stdout   string `json:"stdout"`
			Stderr   string `json:"stderr"`
			Failed   bool   `json:"failed"`
		}

		body, err := io.ReadAll(req.Body)
		if writeError(w, err) {
			return
		}

		args := ExecReq{}
		err = json.Unmarshal(body, &args)
		if writeError(w, err) {
			return
		}

		cmd := exec.Command(args.Cmd[0], args.Cmd[1:]...)
		stdout := bytes.NewBuffer(nil)
		stderr := bytes.NewBuffer(nil)
		cmd.Stdout = stdout
		cmd.Stderr = stderr
		err = cmd.Run()

		stderrData := stderr.String()
		if err != nil && stderrData == "" {
			stderrData = err.Error()
		}

		res := ExecRes{
			ExitCode: cmd.ProcessState.ExitCode(),
			Stdout:   stdout.String(),
			Stderr:   stderrData,
			Failed:   err != nil,
		}

		writeJson(w, res)
	})))

	mux.Handle("/", http.FileServer(http.FS(fsFunc(func(name string) (fs.File, error) {
		return assetsFS.Open(path.Join("build", name))
	}))))

	l, err := net.Listen("tcp", listenAddr)
	if err != nil {
		log.Fatal(err)
	}

	addr := fmt.Sprintf("http://%s/#token=%s", l.Addr(), token)
	fmt.Printf("Serving application on %v\n", addr)
	if autoLaunch {
		cmdBrowser := exec.Command("xdg-open", addr)
		cmdBrowser.Start()
		defer cmdBrowser.Wait()
	}
	err = srv.Serve(l)
	if err != nil {
		log.Fatal(err)
	}
}
