package domain

import (
	"strings"
	"testing"
)

func TestTaskDocumentValidation(t *testing.T) {
	valid := TaskDocument{Title: "Guide", Body: "# Start\n\nTry the example."}
	cases := map[string]struct {
		documents []TaskDocument
		field     string
	}{
		"too many":         {[]TaskDocument{valid, valid, valid, valid, valid, valid}, "documents"},
		"empty title":      {[]TaskDocument{{Title: " \t\n", Body: "Text"}}, "documents[0].title"},
		"long title":       {[]TaskDocument{{Title: strings.Repeat("文", DocumentTitleMax+1), Body: "Text"}}, "documents[0].title"},
		"title control":    {[]TaskDocument{{Title: "a\x00b", Body: "Text"}}, "documents[0].title"},
		"title encoding":   {[]TaskDocument{{Title: "a\xffb", Body: "Text"}}, "documents[0].title"},
		"title separator":  {[]TaskDocument{{Title: "a\u2028b", Body: "Text"}}, "documents[0].title"},
		"title C1 control": {[]TaskDocument{{Title: "a\u0085b", Body: "Text"}}, "documents[0].title"},
		"empty body":       {[]TaskDocument{{Title: "Guide", Body: ""}}, "documents[0].body"},
		"blank body":       {[]TaskDocument{{Title: "Guide", Body: " \r\n\t"}}, "documents[0].body"},
		"long body":        {[]TaskDocument{{Title: "Guide", Body: strings.Repeat("文", DocumentBodyMax+1)}}, "documents[0].body"},
		"body control":     {[]TaskDocument{{Title: "Guide", Body: "a\x1bb"}}, "documents[0].body"},
		"body encoding":    {[]TaskDocument{{Title: "Guide", Body: "a\xffb"}}, "documents[0].body"},
		"body separator":   {[]TaskDocument{{Title: "Guide", Body: "a\u2028b"}}, "documents[0].body"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			_, fields := ValidateContent(TaskContent{Documents: tc.documents}, TaskFeature, ReviewManual, "items[2].")
			if fields["items[2]."+tc.field] == "" {
				t.Fatalf("missing %s error: %v", tc.field, fields)
			}
		})
	}
}

func TestTaskDocumentsKeepMarkdown(t *testing.T) {
	body := "\n# A lesson\r\n\n\tconst x = 1;  \n\n[Unsafe example](javascript:alert(1))\n<script>example</script>\n"
	for _, typ := range AllTaskTypes {
		t.Run(string(typ), func(t *testing.T) {
			content := TaskContent{Documents: []TaskDocument{{Title: "  Read   this \n guide  ", Body: body}}}
			review := ReviewManual
			if typ == TaskQuiz {
				review = ReviewSelf
				content.Quiz = quiz(q("Pick one?", 0, "Right", "Wrong"))
			}
			out, fields := ValidateContent(content, typ, review, "")
			if len(fields) != 0 || len(out.Documents) != 1 || out.Documents[0].Title != "Read this guide" || out.Documents[0].Body != body {
				t.Fatalf("Markdown changed or refused: %+v %v", out.Documents, fields)
			}
		})
	}
	boundary := TaskDocument{Title: strings.Repeat("文", DocumentTitleMax), Body: strings.Repeat("文", DocumentBodyMax)}
	// Bounds count Unicode characters; duplicate titles are allowed and order is retained.
	out, fields := ValidateContent(TaskContent{Documents: []TaskDocument{boundary, boundary}}, TaskDocReading, ReviewSelf, "")
	if len(fields) != 0 || len(out.Documents) != 2 || out.Documents[0] != boundary || out.Documents[1] != boundary {
		t.Fatalf("valid Unicode bounds: %+v %v", out.Documents, fields)
	}
	out, fields = ValidateContent(TaskContent{}, TaskFeature, ReviewManual, "")
	if len(fields) != 0 || out.Documents == nil || len(out.Documents) != 0 {
		t.Fatalf("legacy content must default to an empty array: %+v %v", out, fields)
	}
}
