package domain

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"unicode/utf8"
)

// Practice is an in-browser self-check for a DSA task: the student writes a JavaScript
// function and runs it against example tests on their own device. Tests are data (JSON),
// never code, and the server never runs student code.
type Practice struct {
	FunctionName string         `json:"function_name"`
	Starter      string         `json:"starter"`
	Tests        []PracticeTest `json:"tests"`
}

// PracticeTest calls the function with Args (a JSON array) and expects Expected (any JSON).
type PracticeTest struct {
	Args     json.RawMessage `json:"args"`
	Expected json.RawMessage `json:"expected"`
}

// Bounds for practice content (mirrored in clients).
const (
	MaxPracticeTests   = 10
	PracticeStarterMax = 4000
	PracticeJSONMax    = 2000
)

var jsIdent = regexp.MustCompile(`^[A-Za-z_$][A-Za-z0-9_$]{0,39}$`)

// jsReserved are names a function can't take.
var jsReserved = map[string]bool{
	"break": true, "case": true, "catch": true, "class": true, "const": true, "continue": true, "debugger": true, "default": true,
	"delete": true, "do": true, "else": true, "export": true, "extends": true, "finally": true, "for": true, "function": true,
	"if": true, "import": true, "in": true, "instanceof": true, "new": true, "return": true, "super": true, "switch": true,
	"this": true, "throw": true, "try": true, "typeof": true, "var": true, "void": true, "while": true, "with": true, "yield": true,
	"let": true, "static": true, "enum": true, "await": true, "null": true, "true": true, "false": true,
}

func validatePractice(p Practice, key string) (Practice, map[string]string) {
	errs := map[string]string{}
	out := Practice{FunctionName: p.FunctionName, Starter: p.Starter, Tests: []PracticeTest{}}
	if !jsIdent.MatchString(p.FunctionName) || jsReserved[p.FunctionName] {
		errs[key+".function_name"] = "Use a JavaScript function name like twoSum."
	}
	switch {
	case utf8.RuneCountInString(p.Starter) > PracticeStarterMax:
		errs[key+".starter"] = fmt.Sprintf("Starter code can be at most %d characters.", PracticeStarterMax)
	case hasBadControl(p.Starter, true):
		errs[key+".starter"] = "Starter code contains characters that can't be displayed."
	}
	switch {
	case len(p.Tests) == 0:
		errs[key+".tests"] = "Add at least one example test."
	case len(p.Tests) > MaxPracticeTests:
		errs[key+".tests"] = fmt.Sprintf("Add at most %d example tests.", MaxPracticeTests)
	}
	for i, t := range p.Tests {
		if i >= MaxPracticeTests {
			break
		}
		tk := fmt.Sprintf("%s.tests[%d]", key, i)
		args, ok := compactJSON(t.Args)
		if !ok || len(args) == 0 || args[0] != '[' {
			errs[tk+".args"] = "Arguments must be a JSON array, like [[2,7,11,15], 9]."
		} else if len(args) > PracticeJSONMax {
			errs[tk+".args"] = fmt.Sprintf("Keep arguments under %d characters.", PracticeJSONMax)
		}
		exp, ok := compactJSON(t.Expected)
		if !ok {
			errs[tk+".expected"] = "Expected result must be JSON, like [0,1] or true."
		} else if len(exp) > PracticeJSONMax {
			errs[tk+".expected"] = fmt.Sprintf("Keep the expected result under %d characters.", PracticeJSONMax)
		}
		out.Tests = append(out.Tests, PracticeTest{Args: args, Expected: exp})
	}
	return out, errs
}

func compactJSON(raw json.RawMessage) (json.RawMessage, bool) {
	if len(raw) == 0 || !json.Valid(raw) {
		return nil, false
	}
	var b bytes.Buffer
	if err := json.Compact(&b, raw); err != nil {
		return nil, false
	}
	return b.Bytes(), true
}
