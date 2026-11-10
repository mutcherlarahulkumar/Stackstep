# Contains Duplicate: a useful baseline first

**Estimated effort:** 35 minutes. **Prerequisite:** Two Sum's map reasoning. **Contract:** `containsDuplicate(nums)` returns a boolean for an integer array of length 0–10,000. Negative and repeated values are allowed; do not mutate the input.

```text
[1,2,3,1] -> true
[1,2,3,4] -> false
[] -> false
[-1,-1] -> true
```

## Core work
1. Describe a nested-loop baseline and its O(n²) worst-case time.
2. Scan left to right with a Set of values already seen.
3. Return true when the current value is already in the Set; otherwise add it.
4. Return false after the entire scan and test the empty array.

## Done checks
The result is a boolean, empty and single-value arrays return false, and duplicate negatives work. Explain expected O(n) time and O(n) auxiliary space with a hash-based Set. State what information the Set contains before each iteration.

## Hand-in and feedback: Debug and hand-in
Trace the Set for `[1,2,3,1]`. If your code always returns true, check whether you inserted the current value before testing for it. Submit your implementation, one trace and the comparison with the baseline. Ask a reviewer when sorting a copy might be an acceptable alternative.

**Retrieval:** what information did Two Sum need that this problem does not? **Optional stretch:** discuss how memory limits would change your choice; do not secretly sort or mutate the caller's array.
