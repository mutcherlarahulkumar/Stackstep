# Build a second project from a contract

**Estimated effort:** 90 minutes. **Prerequisite:** portfolio state, async loading and behaviour tests. **Artifact:** the first small slice of a product explorer.

## Core contract
Use a checked-in fixture so learning does not depend on an external service or key. A Product has a stable string id, nonempty title, nonnegative integer price in cents, and category. Currency formatting belongs at the display boundary.

```json
[{"id":"notebook","title":"Notebook","priceCents":450,"category":"stationery"}]
```

## Core work
1. Create a second repository or a `product-explorer/` sibling folder using the same Vite React TypeScript recipe as day 8. Run `npm install` and `npm run dev`, and repeat day 12's test setup. Commit the generated manifest and lockfile.
2. Create a short README defining the user task: find an item in a small catalog.
3. Specify valid, empty and malformed responses and the visible result for each.
4. Implement one vertical slice: load fixture data, display cards and filter one category.
5. Add one automated behaviour test and a simple manual failure-state check.
6. Keep the data adapter separate from the UI so later tasks can simulate delay/failure.

## Done checks
The project runs from documented commands. Prices do not use floating-point dollars as the source of truth. Stable ids drive list identity. The empty response differs from a rejected or invalid response. No outside API is necessary for the core journey.

## Debug and hand-in
If the shape changes, reject or adapt it at one boundary rather than sprinkling optional fields across the UI. Submit the PR, contract and one tested journey. Ask the reviewer to give you a malformed response to handle.

**Retrieval:** which state is essential, and which value can be derived? **Optional stretch:** type the adapter's output using the project's existing TypeScript setup.
