// DockCheck's standalone server serves the prebuilt operator interface.
package main

import (
	"flag"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

func main() {
	address := flag.String("listen", ":8080", "HTTP listen address")
	root := flag.String("root", "/www", "directory containing the compiled receiving desk")
	openBrowser := flag.Bool("open", false, "open the Windows browser after binding the loopback address")
	flag.Parse()
	if _, err := os.Stat(filepath.Join(*root, "index.html")); err != nil {
		log.Fatal("Cannot find dist/index.html. Extract the complete release first.")
	}
	listener, err := net.Listen("tcp", *address)
	if err != nil {
		log.Fatal(err)
	}
	defer listener.Close()
	if *openBrowser && runtime.GOOS == "windows" && listener.Addr().(*net.TCPAddr).IP.IsLoopback() {
		url := "http://" + listener.Addr().String() + "/"
		if err := exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", url).Start(); err != nil {
			log.Printf("Open %s in your browser", url)
		}
	}
	files := http.FileServer(http.Dir(*root))
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		files.ServeHTTP(w, r)
	})
	srv := &http.Server{Addr: *address, Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 60 * time.Second, IdleTimeout: 60 * time.Second}
	log.Printf("DockCheck desk listening on %s", *address)
	log.Fatal(srv.Serve(listener))
}
