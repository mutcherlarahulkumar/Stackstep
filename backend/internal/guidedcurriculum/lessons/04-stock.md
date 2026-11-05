# Best stock profit: the order of events matters

**Estimated effort:** 40 minutes. **Prerequisite:** loop invariants and a running minimum.

## Problem contract
Implement `maxProfit(prices)`. Prices are nonnegative integers, the array length is 0–10,000, and at most one purchase followed by one later sale is allowed. Return the maximum profit, or zero if no profitable trade exists. Do not mutate the array.

```text
[7,1,5,3,6,4] -> 5   (buy at 1, sell later at 6)
[7,6,4,3,1] -> 0
[] -> 0
[4] -> 0
```

## Core work
1. Explain why taking the global maximum minus the global minimum can be wrong: the maximum might occur first.
2. As you scan from left to right, track the cheapest price seen so far and the best valid profit.
3. For each day, calculate the profit for selling today using a valid earlier purchase; update your tracked values in an order you can justify.
4. Run the provided cases and add a constant-price array.

## Done checks
Empty and single-day input return zero. A decreasing sequence returns zero, never a negative profit. Your scan takes O(n) time and O(1) auxiliary space. State the invariant for both tracked values.

## Debug trace
For `[7,1,5,3,6,4]`, draw columns for day, price, minimum so far, profit if sold today, and best profit. If your result buys in the future, identify the exact row where that became possible.

## Hand-in and retrieval
Submit the implementation and trace with the complexity explanation. Compare this running summary to the information stored by Two Sum. Ask a reviewer for a sequence that challenges your update ordering.

**Optional stretch:** explain why allowing multiple transactions is a different problem; do not silently solve that instead.
