package ghpr

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestParse(t *testing.T) {
	cases := []struct {
		in   string
		want Ref
		ok   bool
	}{
		{"https://github.com/asha/todo/pull/12", Ref{"asha", "todo", 12}, true},
		{"https://github.com/asha/todo/pull/12/files", Ref{"asha", "todo", 12}, true},
		{"  https://GitHub.com/asha/todo/pull/3  ", Ref{"asha", "todo", 3}, true},
		{"http://github.com/asha/todo/pull/12", Ref{}, false},
		{"https://gitlab.com/asha/todo/pull/12", Ref{}, false},
		{"https://github.com/asha/todo/issues/12", Ref{}, false},
		{"https://github.com/asha/todo/pull/0", Ref{}, false},
		{"https://github.com/asha/todo/pull/x", Ref{}, false},
		{"https://github.com/asha/todo", Ref{}, false},
		{"not a url", Ref{}, false},
	}
	for _, tc := range cases {
		got, ok := Parse(tc.in)
		if ok != tc.ok || got != tc.want {
			t.Errorf("Parse(%q) = %+v, %v; want %+v, %v", tc.in, got, ok, tc.want, tc.ok)
		}
	}
}

func TestGet(t *testing.T) {
	big := strings.Repeat("+x\n", MaxDiffBytes)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" {
			t.Errorf("token not sent")
		}
		switch {
		case r.URL.Path == "/repos/a/b/pulls/1" && r.Header.Get("Accept") == "application/vnd.github.diff":
			_, _ = w.Write([]byte("diff --git a/x b/x\n+hi\n"))
		case r.URL.Path == "/repos/a/b/pulls/1":
			_, _ = w.Write([]byte(`{"title":"Add filter","body":"Closes #2","state":"open","additions":3,"deletions":1,"changed_files":1}`))
		case r.URL.Path == "/repos/a/b/pulls/2" && r.Header.Get("Accept") == "application/vnd.github.diff":
			_, _ = w.Write([]byte(big))
		case r.URL.Path == "/repos/a/b/pulls/2":
			_, _ = w.Write([]byte(`{"title":"Big"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()
	c := &Client{BaseURL: srv.URL, Token: "tok", HTTP: srv.Client()}

	pr, err := c.Get(context.Background(), Ref{"a", "b", 1})
	if err != nil {
		t.Fatal(err)
	}
	if pr.Title != "Add filter" || pr.Additions != 3 || !strings.Contains(pr.Diff, "+hi") || pr.Truncated {
		t.Fatalf("got %+v", pr)
	}
	pr, err = c.Get(context.Background(), Ref{"a", "b", 2})
	if err != nil {
		t.Fatal(err)
	}
	if !pr.Truncated || len(pr.Diff) != MaxDiffBytes {
		t.Fatalf("diff not cut: truncated=%v len=%d", pr.Truncated, len(pr.Diff))
	}
	if _, err := c.Get(context.Background(), Ref{"a", "b", 9}); !errors.Is(err, ErrNotReadable) {
		t.Fatalf("missing PR: %v", err)
	}
}
