# Three different failures at a data boundary

**Estimated effort:** 25 minutes. **Prerequisite:** the product explorer's declared Product shape.

## Read the distinction
A request can fail before a usable response arrives. A response can arrive but contain invalid JSON. Valid JSON can still violate the product contract. These are different causes even if the UI offers a similar retry action.

```json
{"id":"broken","title":"","priceCents":-50,"category":"stationery"}
```

The value above is syntactically valid JSON but not a valid Product under your contract.

## Core work
1. Create one example for a rejected transport, invalid JSON text and valid-but-invalid domain data.
2. At the adapter boundary, check that the response is an array; each id/title/category is a nonempty string; each price is a nonnegative integer.
3. Decide whether to reject the complete response or deliberately report partial data. Document the choice; silently pretending corrupted data is complete is not acceptable.
4. Explain which messages are useful to users and which details belong only in safe diagnostics.

## Done checks
Your notes classify all three failures and contain checks that reject the malformed Product. You do not use TypeScript assertions as a substitute for runtime validation. No raw error contains credentials or private response data.

## Hand-in and reflection
Save the examples and boundary-check plan in your task note. Ask a reviewer to change one field's type and explain which check catches it.

**Optional stretch:** add the malformed-data case to your automated adapter tests.
