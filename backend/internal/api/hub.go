package api

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
)

// CheckOrigin validates whether the incoming WebSocket request Origin is allowed.
// This prevents Cross-Site WebSocket Hijacking (CSWSH).
func CheckOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		// Non-browser clients (such as curl, tests, or backend tools) might not set the Origin header.
		return true
	}

	u, err := url.Parse(origin)
	if err != nil {
		log.Printf("[WS CHECK-ORIGIN] Rejected invalid origin URL %q: %v", origin, err)
		return false
	}

	// 1. Same-origin host check (e.g. "example.com:8080" == "example.com:8080" or "example.com" == "example.com")
	if strings.EqualFold(u.Host, r.Host) {
		return true
	}

	// 2. Same host name ignoring port (e.g. reverse proxy or Vite dev server port differences)
	uHost := u.Hostname()
	rHost := r.Host
	if h, _, err := net.SplitHostPort(rHost); err == nil {
		rHost = h
	}
	if strings.EqualFold(uHost, rHost) {
		return true
	}

	// 3. Localhost and loopback IPs are allowed for local development
	if uHost == "localhost" || uHost == "127.0.0.1" || uHost == "::1" {
		return true
	}

	// 4. ALLOWED_ORIGINS environment variable (comma-separated list of allowed origins or hosts)
	if allowedOrigins := os.Getenv("ALLOWED_ORIGINS"); allowedOrigins != "" {
		for _, allowed := range strings.Split(allowedOrigins, ",") {
			allowed = strings.TrimSpace(allowed)
			if allowed == "" {
				continue
			}
			if strings.EqualFold(origin, allowed) || strings.EqualFold(u.Host, allowed) || strings.EqualFold(uHost, allowed) {
				return true
			}
		}
	}

	// 5. DOMAIN_NAME environment variable
	if domainName := os.Getenv("DOMAIN_NAME"); domainName != "" {
		if strings.EqualFold(uHost, domainName) || strings.EqualFold(u.Host, domainName) {
			return true
		}
	}

	log.Printf("[WS CHECK-ORIGIN] Rejected unauthorized origin %q for host %q", origin, r.Host)
	return false
}

var upgrader = websocket.Upgrader{
	CheckOrigin: CheckOrigin,
}

type WSMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

type Hub struct {
	clients    map[*websocket.Conn]bool
	broadcast  chan []byte
	register   chan *websocket.Conn
	unregister chan *websocket.Conn
	mu         sync.Mutex
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*websocket.Conn]bool),
		broadcast:  make(chan []byte),
		register:   make(chan *websocket.Conn),
		unregister: make(chan *websocket.Conn),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				client.Close()
			}
			h.mu.Unlock()
		case message := <-h.broadcast:
			h.mu.Lock()
			for client := range h.clients {
				err := client.WriteMessage(websocket.TextMessage, message)
				if err != nil {
					log.Printf("error: %v", err)
					client.Close()
					delete(h.clients, client)
				}
			}
			h.mu.Unlock()
		}
	}
}

func (h *Hub) Broadcast(message interface{}) {
	data, _ := json.Marshal(message)
	h.broadcast <- data
}

// ServeHTTP is the websocket handler
func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade error: %v", err)
		return
	}
	h.register <- conn
	defer func() {
		h.unregister <- conn
	}()

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}
