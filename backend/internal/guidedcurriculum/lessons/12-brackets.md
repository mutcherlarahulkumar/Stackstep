# Balanced brackets: order is information

**Estimated effort:** 40 minutes. **Prerequisite:** arrays as a stack and the idea of a loop invariant.

## Problem contract
Implement `isBalanced(text)` for a string containing only `()[]{}`. Length is 0–10,000. Return a boolean; an empty string is balanced. Brackets must match both kind and nesting order.

```text
"([{}])" -> true
"([)]" -> false
"(]" -> false
"" -> true
```

## Core work
1. Show why counting opening and closing brackets cannot reject `([)]`.
2. Push opening brackets onto a stack.
3. For a closing bracket, require a matching opening bracket at the top. Handle an empty stack before removing anything.
4. After scanning, require the stack to be empty.
5. Add tests for one leading close and one leftover open.

## Done checks
Nested, crossed, missing and unexpected brackets are handled. Explain the invariant: the stack contains the unmatched opening brackets in encounter order. Time is O(n); the stack can require O(n) space in the worst case.

## Hand-in and feedback: Debug and hand-in
Trace the stack after each character of `([)]`. Submit the code, trace and a sentence about why a count loses necessary ordering information. Ask the reviewer to give you a failure case that passes a naive count check.

**Retrieval:** compare the summary held by a stack with the Set in Contains Duplicate. **Optional stretch:** discuss what the contract should do with ordinary text; do not change the brackets-only requirement silently.
