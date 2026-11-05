package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestPreviewDoesNotRequireDatabase(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	var out bytes.Buffer
	if err := run(nil, &out); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "30 days, 45 tasks") || !strings.Contains(out.String(), "no database connection or writes") {
		t.Fatalf("unexpected preview: %s", out.String())
	}
}

func TestJSONManifestAndApplyGuards(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	var out bytes.Buffer
	if err := run([]string{"--json"}, &out); err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		Days  int            `json:"days"`
		Tasks []exportedTask `json:"tasks"`
	}
	if err := json.Unmarshal(out.Bytes(), &manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.Days != 30 || len(manifest.Tasks) != 45 {
		t.Fatal("incomplete manifest")
	}
	if len(manifest.Tasks[0].Content.Documents) == 0 {
		t.Fatal("export lost embedded Markdown")
	}
	for _, args := range [][]string{{"--apply"}, {"--apply", "--admin-login", "alice"}, {"--apply", "--json"}, {"unexpected"}} {
		if err := run(args, &out); err == nil {
			t.Errorf("expected guard for %v", args)
		}
	}
}
