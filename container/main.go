// DockCheck's standalone server serves the prebuilt operator interface.
package main

import (
	"flag"
	"log"
	"net/http"
	"time"
)

func main() {
	address := flag.String("listen", ":8080", "HTTP listen address")
	root := flag.String("root", "/www", "directory containing the compiled receiving desk")
	flag.Parse()
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
	log.Fatal(srv.ListenAndServe())
}
