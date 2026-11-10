package guidedcurriculum

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/mutcherlarahulkumar/stackstep/backend/internal/domain"
)

// These deliberately simple oracles check the lesson data, rather than the complexity
// of a student's implementation. A valid solution must not fail a mistyped example key.
func TestPracticeExamplesHaveCorrectExpectedResults(t *testing.T) {
	entries, err := Entries(Personas{
		Lead:        domain.DefaultPersonaID,
		Engineering: uuid.MustParse("00000000-0000-4000-8000-0000000000a1"),
		Delivery:    uuid.MustParse("00000000-0000-4000-8000-0000000000a2"),
		Content:     uuid.MustParse("00000000-0000-4000-8000-0000000000a3"),
	})
	if err != nil {
		t.Fatal(err)
	}
	problems, examples := 0, 0
	for _, entry := range entries {
		practice := entry.Spec.Content.Practice
		if practice == nil {
			continue
		}
		problems++
		for i, example := range practice.Tests {
			examples++
			t.Run(fmt.Sprintf("%s/example_%d", practice.FunctionName, i+1), func(t *testing.T) {
				var args []json.RawMessage
				if err := json.Unmarshal(example.Args, &args); err != nil {
					t.Fatal(err)
				}
				actual := practiceExampleOracle(t, practice.FunctionName, args)
				encoded, err := json.Marshal(actual)
				if err != nil {
					t.Fatal(err)
				}
				var expected any
				if err := json.Unmarshal(example.Expected, &expected); err != nil {
					t.Fatal(err)
				}
				canonical, err := json.Marshal(expected)
				if err != nil {
					t.Fatal(err)
				}
				if string(encoded) != string(canonical) {
					t.Fatalf("%s(%s): lesson expects %s; independent result is %s", practice.FunctionName, example.Args, canonical, encoded)
				}
			})
		}
	}
	if problems < 7 || examples < 30 {
		t.Fatalf("practice coverage unexpectedly shrank: %d problems, %d examples", problems, examples)
	}
}

func exampleArgument[T any](t *testing.T, args []json.RawMessage, index int) T {
	t.Helper()
	var value T
	if index >= len(args) {
		t.Fatalf("missing argument %d", index)
	}
	if err := json.Unmarshal(args[index], &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func practiceExampleOracle(t *testing.T, name string, args []json.RawMessage) any {
	t.Helper()
	switch name {
	case "twoSum":
		nums, target := exampleArgument[[]int](t, args, 0), exampleArgument[int](t, args, 1)
		for i, first := range nums {
			for j := i + 1; j < len(nums); j++ {
				if first+nums[j] == target {
					return []int{i, j}
				}
			}
		}
		t.Fatal("Two Sum example violates its exactly-one-pair input contract")
	case "isAnagram":
		first := strings.Split(exampleArgument[string](t, args, 0), "")
		second := strings.Split(exampleArgument[string](t, args, 1), "")
		sort.Strings(first)
		sort.Strings(second)
		return strings.Join(first, "") == strings.Join(second, "")
	case "maxProfit":
		prices := exampleArgument[[]int](t, args, 0)
		best := 0
		for buy, price := range prices {
			for sell := buy + 1; sell < len(prices); sell++ {
				best = max(best, prices[sell]-price)
			}
		}
		return best
	case "containsDuplicate":
		nums := exampleArgument[[]int](t, args, 0)
		for i, value := range nums {
			for j := i + 1; j < len(nums); j++ {
				if value == nums[j] {
					return true
				}
			}
		}
		return false
	case "isBalanced":
		text := exampleArgument[string](t, args, 0)
		for {
			reduced := strings.NewReplacer("()", "", "[]", "", "{}", "").Replace(text)
			if reduced == text {
				return text == ""
			}
			text = reduced
		}
	case "searchInsert":
		nums, target := exampleArgument[[]int](t, args, 0), exampleArgument[int](t, args, 1)
		for i, value := range nums {
			if value >= target {
				return i
			}
		}
		return len(nums)
	case "mergeIntervals":
		intervals := exampleArgument[[][]int](t, args, 0)
		sort.Slice(intervals, func(i, j int) bool { return intervals[i][0] < intervals[j][0] })
		merged := make([][]int, 0, len(intervals))
		for _, interval := range intervals {
			if len(interval) != 2 || interval[0] > interval[1] {
				t.Fatal("interval example violates its closed interval input contract")
			}
			if len(merged) == 0 || interval[0] > merged[len(merged)-1][1] {
				merged = append(merged, []int{interval[0], interval[1]})
			} else {
				last := merged[len(merged)-1]
				last[1] = max(last[1], interval[1])
			}
		}
		return merged
	default:
		t.Fatalf("add an independent example oracle for new problem %q", name)
	}
	return nil
}
