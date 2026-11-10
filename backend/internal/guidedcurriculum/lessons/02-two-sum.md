# Two Sum: use information you have already seen

**Estimated effort:** 45 minutes. **Prerequisite:** arrays, loops, and the idea of a key/value map. If maps are unfamiliar, first solve a four-element example on paper.

## Problem contract
Implement `twoSum(nums, target)` and return `[i, j]` with **i < j** and `nums[i] + nums[j] === target`. Inputs are integers, length 2–10,000, and exactly one index pair exists. Values and target are integers between -1,000,000 and 1,000,000, so JavaScript addition stays exact. Values may be negative or repeat. Do not use the same index twice and do not mutate `nums`. The practice checker compares the returned index order exactly.

```text
nums = [3, 3], target = 6  -> [0, 1]
nums = [-3, 4, 3, 90], target = 0 -> [0, 2]
```

## Core work
1. Trace a nested-loop solution and state its cost.
2. For each value, calculate the complement you still need.
3. Look for the complement among **earlier** values before recording the current value. This ordering prevents using an element twice.
4. Return indices, not the values. A `Map` can associate a seen value with its earlier index.
5. Run every practice example and add a duplicate-value case to your notes.

## Done checks
The returned indices are distinct, in increasing order, and point to the required values. Your explanation identifies the loop invariant: before processing index j, the map contains information from indices smaller than j. Explain expected O(n) time with a hash map and O(n) auxiliary space.

## Hand-in and feedback: Debug and hand-in
When a test fails, write columns for index, value, complement, and map contents. Submit your code in the hand-in note or a repository link, the trace for `[3,3]`, and your complexity explanation. Ask the reviewer to challenge the lookup ordering.

**Optional stretch:** describe how the contract would change if no pair or multiple pairs were allowed. You do not need to implement that different problem.
