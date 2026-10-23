package domain

import "testing"

func TestHandInChecks(t *testing.T) {
	cases := []struct {
		url, login string
		flag       bool
	}{
		{"https://github.com/asha-dev/todo/pull/3", "asha-dev", false},
		{"https://github.com/Asha-Dev/todo/pull/3", "asha-dev", false},
		{"https://www.github.com/someone/todo/pull/3", "asha-dev", true},
		{"https://github.com/", "asha-dev", false},
		{"https://gitlab.com/someone/x", "asha-dev", false},
		{"https://asha.dev/post", "asha-dev", false},
		{"::not a url", "asha-dev", false},
	}
	for _, c := range cases {
		if got := CheckGitHubOwner(c.url, c.login); (got != nil) != c.flag {
			t.Errorf("CheckGitHubOwner(%q) = %+v, want flag %v", c.url, got, c.flag)
		}
	}
	if ReusedLinkCheck(0) != nil {
		t.Fatal("no reuse should be silent")
	}
	if c := ReusedLinkCheck(2); c == nil || c.Code != CheckReusedLink || c.Message != "The same link was handed in for 2 other tasks." {
		t.Fatalf("reuse = %+v", c)
	}
}
