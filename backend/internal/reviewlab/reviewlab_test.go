package reviewlab

import "testing"

func TestLibraryParses(t *testing.T) {
	if len(All()) < 5 {
		t.Fatalf("expected at least 5 exercises, got %d", len(All()))
	}
	seen := map[string]bool{}
	for _, ex := range All() {
		if seen[ex.Key] {
			t.Fatalf("duplicate key %s", ex.Key)
		}
		seen[ex.Key] = true
		if len(ex.Issues) == 0 || len(ex.Files) == 0 {
			t.Fatalf("%s has no issues or files", ex.Key)
		}
		for _, is := range ex.Issues {
			for n := is.From; n <= is.To; n++ {
				if !ex.HasLine(is.Path, is.From, "new") {
					t.Fatalf("%s/%s points at a line not in the diff", ex.Key, is.ID)
				}
			}
		}
	}
}

func TestHunkHeaders(t *testing.T) {
	ex, _ := Get("users-pagination")
	f := ex.Files[0]
	if f.Lines[0].Kind != LineHunk || f.Lines[0].Text != "@@ -1,11 +1,20 @@" {
		t.Fatalf("header %q", f.Lines[0].Text)
	}
	if f.Additions != 13 || f.Deletions != 4 {
		t.Fatalf("+%d -%d", f.Additions, f.Deletions)
	}
	if ex.Files[1].Status != "added" || ex.Files[1].Lines[0].Text != "@@ -0,0 +1,8 @@" {
		t.Fatalf("new file %+v", ex.Files[1].Lines[0])
	}
}

func issue(ex Exercise, id string) Issue {
	for _, is := range ex.Issues {
		if is.ID == id {
			return is
		}
	}
	panic(id)
}

func TestGrade(t *testing.T) {
	ex, _ := Get("users-pagination")
	at := func(id string, delta int) Comment {
		is := issue(ex, id)
		return Comment{Path: is.Path, Line: is.From + delta, Side: "new", Body: "here"}
	}
	all := []Comment{at("sql-injection", 0), at("off-by-one", 1), at("no-cap", -1), at("missing-await", 0)}
	if r := Grade(ex, VerdictRequestChanges, all, 0); r.Score != 100 || !r.Passed || r.Found != 4 || r.Noise != 0 {
		t.Fatalf("all found: %+v", r)
	}
	if r := Grade(ex, VerdictApprove, all, 0); r.Score != 90 || r.ApprovePenalty != 10 {
		t.Fatalf("approve penalty: %+v", r)
	}
	half := []Comment{at("sql-injection", 0), at("off-by-one", 0)}
	if r := Grade(ex, VerdictComment, half, 0); r.Score != 50 || r.Passed {
		t.Fatalf("half: %+v", r)
	}
	noisy := append(append([]Comment{}, all...),
		Comment{Path: "test/users.test.js", Line: 1, Side: "new", Body: "x"},
		Comment{Path: "test/users.test.js", Line: 2, Side: "new", Body: "x"},
		Comment{Path: "test/users.test.js", Line: 3, Side: "new", Body: "x"},
		Comment{Path: "test/users.test.js", Line: 4, Side: "new", Body: "x"})
	if r := Grade(ex, VerdictRequestChanges, noisy, 0); r.Noise != 4 || r.NoisePenalty != 10 || r.Score != 90 {
		t.Fatalf("noise: %+v", r)
	}
	far := []Comment{at("off-by-one", 3)}
	if r := Grade(ex, VerdictComment, far, 0); r.Found > 1 {
		t.Fatalf("far comment: %+v", r)
	}
}

func TestValidateReview(t *testing.T) {
	ex, _ := Get("modal-a11y")
	_, errs := ValidateReview(ex, "maybe", "", nil)
	if errs["verdict"] == "" || errs["comments"] == "" {
		t.Fatalf("%v", errs)
	}
	_, errs = ValidateReview(ex, VerdictComment, "", []Comment{{Path: "src/components/Modal.jsx", Line: 999, Side: "new", Body: "x"}, {Path: "nope", Line: 1, Side: "new", Body: " "}, {Path: "src/components/Modal.jsx", Line: 1, Side: "left", Body: "x"}})
	if errs["comments[0].line"] == "" || errs["comments[1].body"] == "" || errs["comments[2].side"] == "" {
		t.Fatalf("%v", errs)
	}
}
