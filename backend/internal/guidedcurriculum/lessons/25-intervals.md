# Merge closed intervals without changing the input

**Estimated effort:** 40 minutes. **Prerequisite:** arrays, numeric sorting and one-pass reasoning. Use Stackstep's practice pad for examples, or your existing JavaScript test setup. **Artifact:** a solution, edge-case checks and a short correctness explanation.

**Problem:** several reserved time ranges overlap. Return their combined coverage as a sorted list of non-overlapping ranges.

## Exact contract · 5 minutes

Implement `mergeIntervals(intervals)`. Input is an array of pairs `[start, end]` of finite integers, with `start <= end`. It may be empty, unordered or contain repeated/nested pairs. Input validation is outside this exercise. Endpoints are **closed**: `[1,4]` and `[4,5]` overlap at 4 and merge. `[1,2]` and `[3,4]` remain separate; do not merge adjacent integers merely because there is no integer between them.

Return pairs sorted by ascending start, merging every overlap. Do not reorder the caller's array, change its inner pairs or reuse an inner pair and mutate it. Zero-length ranges such as `[2,2]` are valid.

The practice pad's **Args** field is the JSON array of function arguments, so it has one extra outer array:

| Args JSON | Expected JSON |
|---|---|
| `[[[1,3],[2,6],[8,10],[15,18]]]` | `[[1,6],[8,10],[15,18]]` |
| `[[[1,4],[4,5]]]` | `[[1,5]]` |
| `[[]]` | `[]` |
| `[[[5,7],[1,2]]]` | `[[1,2],[5,7]]` |
| `[[[1,10],[2,3],[10,12]]]` | `[[1,12]]` |
| `[[[1,2],[3,4]]]` | `[[1,2],[3,4]]` |

## Core work: Reason before coding · 10 minutes

Sort a copy by numeric start: `(a, b) => a[0] - b[0]`. JavaScript's default sort compares strings, which is wrong for values such as 2 and 10. A shallow copy protects array order, but not its inner pairs; copy pairs too, or create fresh output pairs before extending them.

Trace `[[5,7],[1,4],[3,6]]`. After sorting, maintain this invariant: all completed output ranges are disjoint, and the last range covers the current overlapping group. Compare the next start with the last output end. Which comparison includes touching endpoints? Which value is the end of a merged range when the next interval is nested?

## Implement and challenge it · 15 minutes

Implement your own loop, then run the table above. Add a single pair, duplicate pairs, negative endpoints and `[2,2]`. Verify nonmutation separately; output equality alone does not prove it:

```js
const input = [[5, 7], [1, 4], [4, 6]];
const before = JSON.stringify(input);
const result = mergeIntervals(input);
console.assert(JSON.stringify(result) === "[[1,7]]");
console.assert(JSON.stringify(input) === before, "input was mutated");
```

**Debug:** wrong output order suggests sorting; an end that shrinks suggests forgetting the maximum; touching intervals left separate suggests the overlap comparison. State `O(n log n)` sorting time and up to `O(n)` copying/output space; JavaScript sort's internal workspace depends on the engine.

## Hand-in and feedback: Hand in and explain · 10 minutes

Submit your solution and approach as a review note, or commit code/tests to your own repo and submit a PR link. Include the nonmutation check and one traced merge. Ask the reviewer to supply a nested range that challenges your invariant. **Retrieval:** why does copying only the outer array fail if you then extend a shared inner pair?

## Done checks

Verify the required artifact against this task’s visible reviewer criteria and the examples above. Record the result of each check you actually ran.

**Optional stretch:** Explain how touching endpoints would differ for half-open intervals, without changing this task’s closed-interval contract. Skip this when the core timebox is used.
