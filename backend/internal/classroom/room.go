// Package classroom runs live classes in memory: who is in the room, the last messages, the
// questions, raised hands, the presenter's drawing and WebRTC signalling between the
// presenter and each viewer. Nothing here is stored; when a room empties and its grace period
// passes, it is gone.
//
// One API process holds a class's room. With more than one instance, route a class's
// sockets to the same instance (sticky sessions) or move rooms to a shared broker.
package classroom

import (
	"encoding/json"
	"errors"
	"sort"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"golang.org/x/time/rate"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// Role is what someone can do in a room.
type Role string

const (
	RoleHost    Role = "host"    // staff: present, draw, allow mics, answer, promote, end
	RoleStudent Role = "student" // watch, chat, ask, vote, raise a hand, speak when allowed
)

// Errors a peer can cause.
var (
	ErrFull       = errors.New("this class is full")
	ErrEnded      = errors.New("this class has ended")
	ErrNotAllowed = errors.New("only hosts can do that")
)

// Peer is one open socket in a room.
type Peer struct {
	ID     string
	UserID uuid.UUID
	Name   string
	Login  string
	Avatar *string
	Role   Role

	send   chan []byte
	closed chan struct{}
	once   sync.Once
	ended  atomic.Bool // closed because the class ended, not because it fell behind

	hand bool
	mic  bool // allowed to speak
	talk *rate.Limiter
	draw *rate.Limiter
}

// NewPeer makes a peer with a buffered outbox.
func NewPeer(user uuid.UUID, name, login string, avatar *string, role Role) *Peer {
	return &Peer{
		ID: uuid.NewString(), UserID: user, Name: name, Login: login, Avatar: avatar, Role: role,
		send: make(chan []byte, 256), closed: make(chan struct{}),
		talk: rate.NewLimiter(rate.Every(2*time.Second), 5), draw: rate.NewLimiter(60, 120),
	}
}

// Outbox is what the socket writer drains.
func (p *Peer) Outbox() <-chan []byte { return p.send }

// Closed fires when the room drops the peer (slow consumer, class ended).
func (p *Peer) Closed() <-chan struct{} { return p.closed }

// Ended reports whether the peer was closed because the class ended. Otherwise it fell
// behind and may reconnect.
func (p *Peer) Ended() bool { return p.ended.Load() }

func (p *Peer) close() { p.once.Do(func() { close(p.closed) }) }

// ChatMsg is one line of room chat.
type ChatMsg struct {
	ID     string    `json:"id"`
	PeerID string    `json:"peer_id"`
	Name   string    `json:"name"`
	Role   Role      `json:"role"`
	Body   string    `json:"body"`
	At     time.Time `json:"at"`
}

// Question is one Q&A entry. Votes counts students who upvoted it.
type Question struct {
	ID       string    `json:"id"`
	PeerID   string    `json:"peer_id"`
	Name     string    `json:"name"`
	Body     string    `json:"body"`
	At       time.Time `json:"at"`
	Votes    int       `json:"votes"`
	Answered bool      `json:"answered"`
	voters   map[uuid.UUID]bool
}

// Stroke is one annotation on the shared screen. Points are 0..1 of the stage, so every
// viewer draws it in the same place whatever their screen size.
type Stroke struct {
	ID     string       `json:"id"`
	Tool   string       `json:"tool"` // pen, highlight, laser
	Color  string       `json:"color"`
	Width  float64      `json:"width"`
	Points [][2]float64 `json:"points"`
}

// PeerInfo is a peer as others see it.
type PeerInfo struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Login  string  `json:"login"`
	Avatar *string `json:"avatar_url"`
	Role   Role    `json:"role"`
	Hand   bool    `json:"hand"`
	Mic    bool    `json:"mic"`
}

func (p *Peer) info() PeerInfo {
	return PeerInfo{ID: p.ID, Name: p.Name, Login: p.Login, Avatar: p.Avatar, Role: p.Role, Hand: p.hand, Mic: p.mic}
}

// Room is one class's live state.
type Room struct {
	mu        sync.Mutex
	ClassID   uuid.UUID
	peers     map[string]*Peer
	chat      []ChatMsg
	questions []*Question
	strokes   []Stroke
	presenter string
	ended     bool
	gone      bool // removed from the hub; joiners must make a new room
	seq       int
	empty     *time.Timer
}

// Out is a frame sent to clients.
type Out struct {
	Type      string     `json:"type"`
	You       *PeerInfo  `json:"you,omitempty"`
	Peers     []PeerInfo `json:"peers,omitempty"`
	Peer      *PeerInfo  `json:"peer,omitempty"`
	PeerID    string     `json:"peer_id,omitempty"`
	Chat      []ChatMsg  `json:"chat,omitempty"`
	Message   *ChatMsg   `json:"message,omitempty"`
	Questions []Question `json:"questions,omitempty"`
	Question  *Question  `json:"question,omitempty"`
	Strokes   []Stroke   `json:"strokes,omitempty"`
	Stroke    *Stroke    `json:"stroke,omitempty"`
	Presenter *string    `json:"presenter,omitempty"`
	From      string     `json:"from,omitempty"`
	Data      any        `json:"data,omitempty"`
	On        *bool      `json:"on,omitempty"`
	Emoji     string     `json:"emoji,omitempty"`
	Name      string     `json:"name,omitempty"`
	Code      string     `json:"code,omitempty"`
	ErrorText string     `json:"error,omitempty"`
}

// In is a frame from a client.
type In struct {
	Type   string          `json:"type"`
	Body   string          `json:"body"`
	ID     string          `json:"id"`
	To     string          `json:"to"`
	Data   json.RawMessage `json:"data"`
	On     bool            `json:"on"`
	Stroke *Stroke         `json:"stroke"`
	Emoji  string          `json:"emoji"`
}

func (r *Room) nextID(prefix string) string {
	r.seq++
	return prefix + strconv.Itoa(r.seq)
}

func encode(o Out) []byte {
	b, _ := json.Marshal(o)
	return b
}

// deliver queues a frame; a peer whose outbox is full is dropped rather than stalling the room.
func (r *Room) deliver(p *Peer, b []byte) {
	select {
	case p.send <- b:
	default:
		r.dropLocked(p)
	}
}

func (r *Room) broadcast(o Out, except string) {
	b := encode(o)
	for id, p := range r.peers {
		if id != except {
			r.deliver(p, b)
		}
	}
}

func (r *Room) peerList() []PeerInfo {
	out := make([]PeerInfo, 0, len(r.peers))
	for _, p := range r.peers {
		out = append(out, p.info())
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Role != out[j].Role {
			return out[i].Role == RoleHost
		}
		return out[i].Name < out[j].Name
	})
	return out
}

func (r *Room) questionList() []Question {
	out := make([]Question, len(r.questions))
	for i, q := range r.questions {
		out[i] = *q
	}
	// Unanswered first, then most votes, then oldest.
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Answered != out[j].Answered {
			return !out[i].Answered
		}
		if out[i].Votes != out[j].Votes {
			return out[i].Votes > out[j].Votes
		}
		return out[i].At.Before(out[j].At)
	})
	return out
}

func (r *Room) presenterPtr() *string {
	p := r.presenter
	return &p
}

func (r *Room) dropLocked(p *Peer) {
	if _, ok := r.peers[p.ID]; !ok {
		return
	}
	delete(r.peers, p.ID)
	p.close()
	if r.presenter == p.ID {
		r.presenter = ""
		r.strokes = nil // clients clear the drawing when nobody presents; keep the room in step
		r.broadcast(Out{Type: "presenter", Presenter: r.presenterPtr()}, "")
	}
	r.broadcast(Out{Type: "peer_left", PeerID: p.ID}, "")
}

// Hub holds every live room.
type Hub struct {
	mu       sync.Mutex
	rooms    map[uuid.UUID]*Room
	MaxPeers int
	// Grace is how long an empty room keeps its chat, so a host who reloads finds it again.
	Grace time.Duration
	now   func() time.Time
}

// NewHub returns an empty hub.
func NewHub(maxPeers int, now func() time.Time) *Hub {
	if maxPeers < 2 {
		maxPeers = 2
	}
	return &Hub{rooms: map[uuid.UUID]*Room{}, MaxPeers: maxPeers, Grace: 10 * time.Minute, now: now}
}

// Join adds a peer and sends them the room as it is now; everyone else hears they arrived.
func (h *Hub) Join(classID uuid.UUID, p *Peer) (*Room, error) {
	var r *Room
	for {
		h.mu.Lock()
		r = h.rooms[classID]
		if r == nil {
			r = &Room{ClassID: classID, peers: map[string]*Peer{}}
			h.rooms[classID] = r
		}
		h.mu.Unlock()
		r.mu.Lock()
		if !r.gone {
			break
		}
		// The grace timer forgot this room between the lookup and the lock; use a fresh one.
		r.mu.Unlock()
	}
	defer r.mu.Unlock()
	if r.ended {
		return nil, ErrEnded
	}
	if len(r.peers) >= h.MaxPeers {
		return nil, ErrFull
	}
	if r.empty != nil {
		r.empty.Stop()
		r.empty = nil
	}
	r.peers[p.ID] = p
	you := p.info()
	r.deliver(p, encode(Out{
		Type: "welcome", You: &you, Peers: r.peerList(), Chat: append([]ChatMsg(nil), r.chat...), Questions: r.questionList(),
		Strokes: append([]Stroke(nil), r.strokes...), Presenter: r.presenterPtr(),
	}))
	r.broadcast(Out{Type: "peer_joined", Peer: &you}, p.ID)
	return r, nil
}

// Leave removes a peer. An empty room is forgotten after the grace period.
func (h *Hub) Leave(r *Room, p *Peer) {
	r.mu.Lock()
	r.dropLocked(p)
	empty := len(r.peers) == 0
	if empty && r.empty == nil {
		grace := h.Grace
		if r.ended {
			grace = 0
		}
		r.empty = time.AfterFunc(grace, func() { h.forget(r) })
	}
	r.mu.Unlock()
}

func (h *Hub) forget(r *Room) {
	// Hub lock first, then the room's: nobody can take this room from the map and join it
	// while we decide, and a joiner that already has it sees gone and starts again.
	h.mu.Lock()
	defer h.mu.Unlock()
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.peers) != 0 {
		return
	}
	r.gone = true
	if h.rooms[r.ClassID] == r {
		delete(h.rooms, r.ClassID)
	}
}

// Live reports whether a class has a room right now and how many are in it.
func (h *Hub) Live(classID uuid.UUID) int {
	h.mu.Lock()
	r := h.rooms[classID]
	h.mu.Unlock()
	if r == nil {
		return 0
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.peers)
}

// End closes a room for good: everyone is told and disconnected.
func (h *Hub) End(classID uuid.UUID) {
	h.mu.Lock()
	r := h.rooms[classID]
	delete(h.rooms, classID)
	h.mu.Unlock()
	if r == nil {
		return
	}
	r.mu.Lock()
	r.ended = true
	r.broadcast(Out{Type: "ended"}, "")
	for _, p := range r.peers {
		p.ended.Store(true)
		p.close()
	}
	r.peers = map[string]*Peer{}
	r.mu.Unlock()
}

// Promotable is room text a host turned into an announcement.
type Promotable struct {
	Body string
	By   string
	Kind string // chat or question
}

// TextOf finds a chat line or question by ID, for promoting it.
func (r *Room) TextOf(id string) (Promotable, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, m := range r.chat {
		if m.ID == id {
			return Promotable{Body: m.Body, By: m.Name, Kind: "chat"}, true
		}
	}
	for _, q := range r.questions {
		if q.ID == id {
			return Promotable{Body: q.Body, By: q.Name, Kind: "question"}, true
		}
	}
	return Promotable{}, false
}

func (r *Room) fail(p *Peer, code, msg string) {
	r.deliver(p, encode(Out{Type: "error", Code: code, ErrorText: msg}))
}

// Handle applies one client frame. It returns true when a host asked to end the class.
func (r *Room) Handle(p *Peer, in In, now time.Time) (end bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.peers[p.ID]; !ok || r.ended {
		return false
	}
	host := p.Role == RoleHost
	switch in.Type {
	case "chat":
		if !p.talk.Allow() {
			r.fail(p, "rate_limited", "Slow down a little.")
			return false
		}
		body, msg := domain.ValidateRoomText(in.Body, 1, domain.ClassChatMax)
		if msg != "" {
			r.fail(p, "validation_failed", msg)
			return false
		}
		m := ChatMsg{ID: r.nextID("c"), PeerID: p.ID, Name: p.Name, Role: p.Role, Body: body, At: now.UTC()}
		r.chat = append(r.chat, m)
		if len(r.chat) > domain.ClassChatKept {
			r.chat = r.chat[len(r.chat)-domain.ClassChatKept:]
		}
		r.broadcast(Out{Type: "chat", Message: &m}, "")
	case "ask":
		if !p.talk.Allow() {
			r.fail(p, "rate_limited", "Slow down a little.")
			return false
		}
		body, msg := domain.ValidateRoomText(in.Body, domain.ClassQuestionMin, domain.ClassQuestionMax)
		if msg != "" {
			r.fail(p, "validation_failed", msg)
			return false
		}
		if len(r.questions) >= domain.ClassQuestionsKept {
			r.fail(p, "validation_failed", "This class has a lot of questions already. Upvote one instead.")
			return false
		}
		q := &Question{ID: r.nextID("q"), PeerID: p.ID, Name: p.Name, Body: body, At: now.UTC(), voters: map[uuid.UUID]bool{}}
		r.questions = append(r.questions, q)
		qc := *q
		r.broadcast(Out{Type: "question", Question: &qc}, "")
	case "vote":
		for _, q := range r.questions {
			if q.ID == in.ID && !q.Answered {
				if in.On {
					q.voters[p.UserID] = true
				} else {
					delete(q.voters, p.UserID)
				}
				q.Votes = len(q.voters)
				qc := *q
				r.broadcast(Out{Type: "question", Question: &qc}, "")
			}
		}
	case "answer":
		if !host {
			r.fail(p, "forbidden", ErrNotAllowed.Error())
			return false
		}
		for _, q := range r.questions {
			if q.ID == in.ID {
				q.Answered = in.On
				qc := *q
				r.broadcast(Out{Type: "question", Question: &qc}, "")
			}
		}
	case "hand":
		if host {
			return false
		}
		p.hand = in.On
		info := p.info()
		r.broadcast(Out{Type: "peer", Peer: &info}, "")
	case "allow_mic":
		if !host {
			r.fail(p, "forbidden", ErrNotAllowed.Error())
			return false
		}
		if t := r.peers[in.To]; t != nil && t.Role == RoleStudent {
			t.mic, t.hand = in.On, false
			info := t.info()
			r.broadcast(Out{Type: "peer", Peer: &info}, "")
		}
	case "present":
		if !host {
			r.fail(p, "forbidden", ErrNotAllowed.Error())
			return false
		}
		if in.On {
			r.presenter = p.ID
		} else if r.presenter == p.ID {
			r.presenter = ""
			r.strokes = nil
		}
		r.broadcast(Out{Type: "presenter", Presenter: r.presenterPtr()}, "")
	case "signal":
		// Media flows presenter ⇄ viewer only; anything else is dropped.
		t := r.peers[in.To]
		if t == nil || len(in.Data) == 0 || len(in.Data) > 64<<10 || (p.ID != r.presenter && t.ID != r.presenter) {
			return false
		}
		r.deliver(t, encode(Out{Type: "signal", From: p.ID, Data: in.Data}))
	case "draw":
		if !host || in.Stroke == nil || !p.draw.Allow() {
			return false
		}
		s := *in.Stroke
		if !validStroke(&s) {
			return false
		}
		// The laser pointer fades on screen, so latecomers don't need it.
		if s.Tool != "laser" {
			r.strokes = append(r.strokes, s)
			if len(r.strokes) > domain.ClassStrokesKept {
				r.strokes = r.strokes[len(r.strokes)-domain.ClassStrokesKept:]
			}
		}
		r.broadcast(Out{Type: "draw", Stroke: &s}, p.ID)
	case "clear":
		if !host {
			return false
		}
		r.strokes = nil
		r.broadcast(Out{Type: "clear"}, "")
	case "react":
		if !p.talk.Allow() || !domain.ReactionEmoji(in.Emoji).Valid() {
			return false
		}
		r.broadcast(Out{Type: "react", Emoji: in.Emoji, Name: p.Name}, "")
	case "end":
		if !host {
			r.fail(p, "forbidden", ErrNotAllowed.Error())
			return false
		}
		return true
	}
	return false
}

func validStroke(s *Stroke) bool {
	switch s.Tool {
	case "pen", "highlight", "laser":
	default:
		return false
	}
	if len(s.ID) == 0 || len(s.ID) > 64 || len(s.Color) > 16 || len(s.Points) == 0 || len(s.Points) > domain.ClassStrokePointMax {
		return false
	}
	if s.Width <= 0 || s.Width > 0.05 {
		s.Width = 0.004
	}
	for _, pt := range s.Points {
		if pt[0] < 0 || pt[0] > 1 || pt[1] < 0 || pt[1] > 1 {
			return false
		}
	}
	return true
}

// Send queues a frame for one peer (used for replies the HTTP layer builds).
func (r *Room) Send(p *Peer, b []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.peers[p.ID]; ok {
		r.deliver(p, b)
	}
}
