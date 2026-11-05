# Valid Anagram: make the input assumptions explicit

**Estimated effort:** 45 minutes. **Prerequisite:** loops and key/value counts. **Artifact:** implementation, tests and a short complexity explanation.

## Problem contract
Implement `isAnagram(s, t)`. Inputs contain only lowercase English letters `a`–`z`, may be empty, and are at most 10,000 characters each. Return a boolean. Every occurrence matters: `"aab"` and `"abb"` are not anagrams. This problem does not require case folding, removing spaces, or Unicode normalization.

```text
isAnagram("anagram", "nagaram") -> true
isAnagram("a", "ab") -> false
isAnagram("", "") -> true
```

## Core work
1. State why unequal lengths can return false immediately.
2. Count each letter of the first string. Decrement counts while reading the second.
3. Explain what an absent or exhausted count means.
4. Run the practice examples; add two strings with the same distinct letters but different frequencies.
5. Compare your method to sorting copies of the strings. Explain the trade-off rather than claiming one is universally best.

## Done checks
Empty strings work; repeated letters are counted; the function returns only a boolean. For total length n+m, a frequency-count solution takes O(n+m) time. With a fixed 26-letter alphabet, the count storage is O(1); with an unbounded alphabet, it would grow with the number of distinct symbols.

## Debug and feedback
Trace counts after every character for `"aab"`/`"abb"`. If using an object, understand inherited keys; a `Map` or fixed count array avoids that issue. Submit code, the failed-case trace, and the input assumptions. Ask the reviewer which assumption would change for general text.

**Retrieval:** how is this map different from the map in Two Sum? **Optional stretch:** describe a Unicode-aware contract without implementing it.

## Hand-in and feedback

Submit the required artifact or note with the checks you ran and one decision you can explain. Ask your reviewer one focused question; incorporate the answer before adding optional scope.
