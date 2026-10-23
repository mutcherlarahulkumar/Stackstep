package realtime

import (
	"testing"

	"github.com/google/uuid"
)

func TestHubCapacityAndSlowSubscribers(t *testing.T) {
	h := NewHub()
	id := uuid.New()
	var subs []*Subscriber
	for range MaxSubscribersPerEnrollment {
		s, ok := h.Subscribe(id)
		if !ok {
			t.Fatal("subscribe under capacity failed")
		}
		subs = append(subs, s)
	}
	if _, ok := h.Subscribe(id); ok {
		t.Fatal("subscribe over capacity succeeded")
	}
	// Fill one subscriber's buffer; the next publish drops it and keeps the rest.
	for range cap(subs[0].ch) {
		subs[0].ch <- []byte("x")
	}
	h.Publish(id, []byte("frame"))
	select {
	case <-subs[0].Closed():
	default:
		t.Fatal("slow subscriber was not dropped")
	}
	if got := <-subs[1].Frames(); string(got) != "frame" {
		t.Fatalf("got %q", got)
	}
	for _, s := range subs {
		h.Unsubscribe(id, s)
	}
	if h.Has(id) {
		t.Fatal("hub still has subscribers")
	}
}
