package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/realtime"
	"github.com/mutcherlarahulkumar/stackstep/backend/internal/seed"
)

func dialWS(t *testing.T, base string, protocols ...string) (*websocket.Conn, error) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(base, "http")+"/v1/ws", &websocket.DialOptions{Subprotocols: protocols})
	return c, err
}

func readFrame(t *testing.T, c *websocket.Conn) frame {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, b, err := c.Read(ctx)
	if err != nil {
		t.Fatalf("read frame: %v", err)
	}
	var f frame
	if err := json.Unmarshal(b, &f); err != nil {
		t.Fatalf("decode frame %s: %v", b, err)
	}
	return f
}

func TestWebSocketRejectsBadToken(t *testing.T) {
	e := newEnv(t)
	ts := httptest.NewServer(e.h)
	defer ts.Close()

	c, err := dialWS(t, ts.URL, wsProtocol, "bearer.not-a-token")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, _, err = c.Read(ctx)
	var ce websocket.CloseError
	if !errors.As(err, &ce) || ce.Code != wsCloseAuth {
		t.Fatalf("want close 4401, got %v", err)
	}

	if _, err := dialWS(t, ts.URL, "bearer."+e.login(seed.StudentLogin)); err == nil {
		t.Fatal("dial without stackstep.v1 subprotocol succeeded")
	}

	c, err = dialWS(t, ts.URL, wsProtocol, "bearer."+e.login(seed.NoEnrollLogin))
	if err != nil {
		t.Fatal(err)
	}
	_, _, err = c.Read(ctx)
	if !errors.As(err, &ce) || ce.Code != wsCloseNoEnroll {
		t.Fatalf("want close 4409, got %v", err)
	}
}

func TestWebSocketDeliversMessagesAndTasks(t *testing.T) {
	e := newEnv(t)
	ts := httptest.NewServer(e.h)
	defer ts.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go realtime.Listen(ctx, e.store.Pool, e.srv.hub, e.srv.EncodeEvent, e.srv.log)
	go realtime.Deliver(ctx, e.store, e.clock, 50*time.Millisecond, e.srv.log)

	stu := e.login(seed.StudentLogin)
	c, err := dialWS(t, ts.URL, wsProtocol, "bearer."+stu)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = c.CloseNow() }()
	if f := readFrame(t, c); f.Type != frameReady {
		t.Fatalf("first frame = %+v", f)
	}
	time.Sleep(100 * time.Millisecond) // let LISTEN register

	e.expect(send(e, stu, uuid.New(), "hello"), 201)
	f := readFrame(t, c)
	if f.Type != frameMessage || f.Message.Author != "student" || f.Message.Body != "hello" {
		t.Fatalf("student frame = %+v", f)
	}

	e.clock.Advance(31 * time.Second) // lead reply becomes due; the deliverer pushes it
	f = readFrame(t, c)
	if f.Type != frameMessage || f.Message.Author != "lead" {
		t.Fatalf("lead frame = %+v", f)
	}

	adm := e.login(seed.AdminLogin)
	e.mustCreateTask(adm, e.enrollmentOf(seed.StudentLogin))
	got := map[frameType]bool{}
	for range 2 { // announcement message + task, in either order
		got[readFrame(t, c).Type] = true
	}
	if !got[frameTask] || !got[frameMessage] {
		t.Fatalf("frames after assign = %v", got)
	}
}
