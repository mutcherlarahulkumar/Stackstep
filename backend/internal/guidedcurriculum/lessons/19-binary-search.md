# Binary search: preserve a precise interval invariant

**Estimated effort:** 35 minutes. **Prerequisite:** sorted arrays and loop invariants.

## Problem contract
Implement `searchInsert(nums, target)` for a nondecreasing integer array of length 0–10,000. Return the first index whose value is greater than or equal to target; return `nums.length` if all values are smaller. Duplicates are allowed. Do not mutate the array.

```text
[1,3,5,6], 2 -> 1
[1,2,2,2,4], 2 -> 1
[], 3 -> 0
```

## Core work
1. Start with a half-open search interval `[lo, hi)` using lo=0 and hi=length.
2. Keep the desired first qualifying position inside the interval boundary, shrinking until lo equals hi.
3. When the middle value is smaller than target, discard it and all earlier values. Otherwise retain the middle as a possible answer.
4. Trace the duplicate case and both outside-the-array targets.

## Done checks
The result is the first duplicate position, not any matching index. Empty input and insert-at-end work. Every iteration strictly shrinks the interval. Explain O(log n) time and O(1) auxiliary space.

## Hand-in and feedback: Debug and hand-in
Write lo, hi, mid and the remaining candidate interval at each step. If the loop never ends, look for a boundary update that leaves the interval unchanged. Submit the code, duplicate trace and invariant; ask a reviewer to challenge an endpoint case.

**Retrieval:** how does this invariant differ from the running minimum in stock profit? **Optional stretch:** describe how to find the first value strictly greater than target by changing one comparison.
