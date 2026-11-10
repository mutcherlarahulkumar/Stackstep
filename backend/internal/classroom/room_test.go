package classroom

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"golang.org/x/time/rate"
)

var t0 = time.Date(2026, 11, 5, 12, 0, 0, 0, time.UTC)

// frames drains what a peer has been sent so far.
func frames(p *Peer) []Out {
	var out []Out
	for {
		select {
		case b := <-p.send:
			var o Out
			_ = json.Unmarshal(b, &o)
			out = append(out, o)
		default:
			return out
		}
	}
}

func last(p *Peer, typ string) *Out {
	fs := frames(p)
	for i := len(fs) - 1; i >= 0; i-- {
		if fs[i].Type == typ {
			return &fs[i]
		}
	}
	return nil
}

func room(t *testing.T, max int) (*Hub, uuid.UUID) {
	t.Helper()
	return NewHub(max, func() time.Time { return t0 }), uuid.New()
}

// LC1, LC5: joining sends the room as it is; chat keeps the last 100 lines only.
func TestJoinAndChat(t *testing.T) {
	h, id := room(t, 10)
	host := NewPeer(uuid.New(), "Priya", "priya", nil, RoleHost)
	r, err := h.Join(id, host)
	if err != nil {
		t.Fatal(err)
	}
	if w := last(host, "welcome"); w == nil || w.You.Role != RoleHost {
		t.Fatalf("welcome = %+v", w)
	}
	host.talk = rate.NewLimiter(rate.Inf, 0)
	for i := 0; i < 105; i++ {
		r.Handle(host, In{Type: "chat", Body: "line " + strings.Repeat("x", i%3)}, t0)
	}
	stu := NewPeer(uuid.New(), "Asha", "asha", nil, RoleStudent)
	if _, err := h.Join(id, stu); err != nil {
		t.Fatal(err)
	}
	w := last(stu, "welcome")
	if w == nil || len(w.Chat) != 100 || len(w.Peers) != 2 || w.Peers[0].Role != RoleHost {
		t.Fatalf("late welcome: chat %d peers %+v", len(w.Chat), w.Peers)
	}
	if j := last(host, "peer_joined"); j == nil || j.Peer.Name != "Asha" {
		t.Fatalf("host not told: %+v", j)
	}
	// Bad input and flooding are refused.
	r.Handle(stu, In{Type: "chat", Body: "   "}, t0)
	if e := last(stu, "error"); e == nil || e.Code != "validation_failed" {
		t.Fatalf("blank chat = %+v", e)
	}
	for i := 0; i < 10; i++ {
		r.Handle(stu, In{Type: "chat", Body: "hi"}, t0)
	}
	if e := last(stu, "error"); e == nil || e.Code != "rate_limited" {
		t.Fatalf("flood = %+v", e)
	}
}

// LC2–LC4: questions sort by votes, one vote per person; hosts answer; students can't host.
func TestQuestionsHandsAndHostOnly(t *testing.T) {
	h, id := room(t, 10)
	host := NewPeer(uuid.New(), "Priya", "priya", nil, RoleHost)
	a := NewPeer(uuid.New(), "Asha", "asha", nil, RoleStudent)
	b := NewPeer(uuid.New(), "Ravi", "ravi", nil, RoleStudent)
	r, _ := h.Join(id, host)
	_, _ = h.Join(id, a)
	_, _ = h.Join(id, b)
	r.Handle(a, In{Type: "ask", Body: "What is a heap?"}, t0)
	r.Handle(b, In{Type: "ask", Body: "Why use useMemo?"}, t0.Add(time.Second))
	q2 := last(host, "question").Question.ID
	r.Handle(a, In{Type: "vote", ID: q2, On: true}, t0)
	r.Handle(a, In{Type: "vote", ID: q2, On: true}, t0)
	if q := last(host, "question"); q.Question.Votes != 1 {
		t.Fatalf("votes = %d", q.Question.Votes)
	}
	if qs := r.questionList(); qs[0].ID != q2 {
		t.Fatalf("order = %+v", qs)
	}
	r.Handle(a, In{Type: "answer", ID: q2, On: true}, t0)
	if e := last(a, "error"); e == nil || e.Code != "forbidden" {
		t.Fatalf("student answered: %+v", e)
	}
	r.Handle(host, In{Type: "answer", ID: q2, On: true}, t0)
	if qs := r.questionList(); qs[len(qs)-1].ID != q2 || !qs[len(qs)-1].Answered {
		t.Fatalf("answered order = %+v", qs)
	}
	// Hands and mics: a raised hand is cleared when the host lets them speak.
	r.Handle(a, In{Type: "hand", On: true}, t0)
	if p := last(host, "peer"); !p.Peer.Hand {
		t.Fatal("hand not shown")
	}
	r.Handle(b, In{Type: "allow_mic", To: a.ID, On: true}, t0)
	r.Handle(host, In{Type: "allow_mic", To: a.ID, On: true}, t0)
	if p := last(a, "peer"); !p.Peer.Mic || p.Peer.Hand {
		t.Fatalf("mic = %+v", p.Peer)
	}
	if r.Handle(a, In{Type: "end"}, t0) || !r.Handle(host, In{Type: "end"}, t0) {
		t.Fatal("end permissions")
	}
}

// LC6–LC7: signals only travel presenter ⇄ viewer; drawing is host-only, bounded and replayed
// to latecomers (except the laser).
func TestSignalsAndDrawing(t *testing.T) {
	h, id := room(t, 10)
	host := NewPeer(uuid.New(), "Priya", "priya", nil, RoleHost)
	a := NewPeer(uuid.New(), "Asha", "asha", nil, RoleStudent)
	b := NewPeer(uuid.New(), "Ravi", "ravi", nil, RoleStudent)
	r, _ := h.Join(id, host)
	_, _ = h.Join(id, a)
	_, _ = h.Join(id, b)
	frames(a)
	frames(b)
	r.Handle(a, In{Type: "signal", To: b.ID, Data: json.RawMessage(`{"sdp":"x"}`)}, t0)
	if s := last(b, "signal"); s != nil {
		t.Fatal("student to student signal relayed")
	}
	r.Handle(host, In{Type: "present", On: true}, t0)
	if p := last(a, "presenter"); p == nil || *p.Presenter != host.ID {
		t.Fatalf("presenter = %+v", p)
	}
	r.Handle(a, In{Type: "signal", To: host.ID, Data: json.RawMessage(`{"sdp":"answer"}`)}, t0)
	if s := last(host, "signal"); s == nil || s.From != a.ID {
		t.Fatalf("viewer to presenter = %+v", s)
	}
	r.Handle(a, In{Type: "draw", Stroke: &Stroke{ID: "s1", Tool: "pen", Points: [][2]float64{{0.1, 0.1}}}}, t0)
	r.Handle(host, In{Type: "draw", Stroke: &Stroke{ID: "s2", Tool: "pen", Color: "#f00", Width: 9, Points: [][2]float64{{0.1, 0.1}, {0.5, 0.5}}}}, t0)
	r.Handle(host, In{Type: "draw", Stroke: &Stroke{ID: "s3", Tool: "laser", Points: [][2]float64{{0.2, 0.2}}}}, t0)
	r.Handle(host, In{Type: "draw", Stroke: &Stroke{ID: "s4", Tool: "pen", Points: [][2]float64{{2, 0.2}}}}, t0)
	late := NewPeer(uuid.New(), "Meera", "meera", nil, RoleStudent)
	_, _ = h.Join(id, late)
	if w := last(late, "welcome"); len(w.Strokes) != 1 || w.Strokes[0].ID != "s2" || w.Strokes[0].Width > 0.05 {
		t.Fatalf("replayed strokes = %+v", w.Strokes)
	}
	// The presenter leaving clears the stage for everyone.
	h.Leave(r, host)
	if p := last(a, "presenter"); p == nil || *p.Presenter != "" {
		t.Fatalf("after presenter left = %+v", p)
	}
}

// LC8: capacity, ending, and forgetting an empty room.
func TestCapacityAndEnd(t *testing.T) {
	h, id := room(t, 2)
	h.Grace = 0
	a := NewPeer(uuid.New(), "A", "a", nil, RoleHost)
	b := NewPeer(uuid.New(), "B", "b", nil, RoleStudent)
	r, _ := h.Join(id, a)
	_, _ = h.Join(id, b)
	if _, err := h.Join(id, NewPeer(uuid.New(), "C", "c", nil, RoleStudent)); !errors.Is(err, ErrFull) {
		t.Fatalf("full = %v", err)
	}
	if h.Live(id) != 2 {
		t.Fatal("live count")
	}
	h.End(id)
	select {
	case <-b.Closed():
	default:
		t.Fatal("peer not closed on end")
	}
	if e := last(b, "ended"); e == nil {
		t.Fatal("ended not sent")
	}
	if h.Live(id) != 0 {
		t.Fatal("room kept after end")
	}
	_ = r
	// A room that empties is forgotten (grace 0 here).
	id2 := uuid.New()
	c := NewPeer(uuid.New(), "C", "c", nil, RoleStudent)
	r2, _ := h.Join(id2, c)
	h.Leave(r2, c)
	time.Sleep(20 * time.Millisecond)
	if h.Live(id2) != 0 {
		t.Fatal("empty room kept")
	}
	if _, ok := r.TextOf("nope"); ok {
		t.Fatal("found missing text")
	}
}

// LC9: a viewer dropped for falling behind may reconnect; one closed by the end may not.
func TestDropIsRetryableEndIsNot(t *testing.T) {
	h, id := room(t, 10)
	host := NewPeer(uuid.New(), "Priya", "priya", nil, RoleHost)
	slow := NewPeer(uuid.New(), "Asha", "asha", nil, RoleStudent)
	r, _ := h.Join(id, host)
	_, _ = h.Join(id, slow)
	host.talk = rate.NewLimiter(rate.Inf, 0)
	for i := 0; i < 400; i++ { // never drained, so its outbox fills
		r.Handle(host, In{Type: "chat", Body: "hi"}, t0)
	}
	select {
	case <-slow.Closed():
	default:
		t.Fatal("slow viewer kept")
	}
	if slow.Ended() {
		t.Fatal("a dropped viewer must be told to reconnect, not that the class ended")
	}
	a := NewPeer(uuid.New(), "Ravi", "ravi", nil, RoleStudent)
	_, _ = h.Join(id, a)
	h.End(id)
	if !a.Ended() {
		t.Fatal("class end not marked")
	}
}

// LC10: stopping the share clears the drawing for people who join later, as it does on screen.
func TestStopPresentingClearsStrokes(t *testing.T) {
	h, id := room(t, 10)
	host := NewPeer(uuid.New(), "Priya", "priya", nil, RoleHost)
	r, _ := h.Join(id, host)
	r.Handle(host, In{Type: "present", On: true}, t0)
	r.Handle(host, In{Type: "draw", Stroke: &Stroke{ID: "s1", Tool: "pen", Points: [][2]float64{{0.1, 0.1}}}}, t0)
	r.Handle(host, In{Type: "present", On: false}, t0)
	late := NewPeer(uuid.New(), "Meera", "meera", nil, RoleStudent)
	_, _ = h.Join(id, late)
	if w := last(late, "welcome"); len(w.Strokes) != 0 {
		t.Fatalf("old strokes replayed: %+v", w.Strokes)
	}
}

// LC11: a room forgotten by its grace timer is never joined; the next joiner gets a fresh one.
func TestForgottenRoomIsNotReused(t *testing.T) {
	h, id := room(t, 10)
	a := NewPeer(uuid.New(), "A", "a", nil, RoleHost)
	r, _ := h.Join(id, a)
	r.mu.Lock()
	delete(r.peers, a.ID) // empty, as after the last leave
	r.mu.Unlock()
	h.forget(r)
	b := NewPeer(uuid.New(), "B", "b", nil, RoleStudent)
	r2, err := h.Join(id, b)
	if err != nil || r2 == r || h.Live(id) != 1 {
		t.Fatalf("joined the forgotten room: same=%v err=%v live=%d", r2 == r, err, h.Live(id))
	}
}
