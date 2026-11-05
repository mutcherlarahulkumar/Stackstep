# Flexbox: predict the layout before running it

**Estimated effort:** 35 minutes. **Prerequisite:** the hero's HTML/CSS. This guide contains the core lesson; the MDN link is optional deeper reference.

## The useful model
Flexbox lays out a container's direct children along a **main axis** and a perpendicular **cross axis**. `flex-direction: row` uses the inline direction as the main axis; `column` changes the axes. `justify-content` distributes spare space along the main axis. `align-items` aligns children across it.

```css
.project-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: space-between;
  align-items: center;
}
.project-links > * { min-width: 0; }
```

## Core experiments
1. Write your prediction for three links with `justify-content: flex-start`, then `space-between`. Check the result.
2. Change `flex-direction` to `column`; explain which axis each alignment property now controls.
3. Add a very long link label. Compare wrapping with `flex-wrap: nowrap` and `wrap` at 360px.
4. Adjust the hero's link group using only properties you can explain.

## Done checks
Your notes include three before/after predictions, one wrong prediction and its correction. The narrow layout has no clipped text. You can explain why `gap` differs from putting a margin on every child.

## If the result surprises you
Verify which element owns `display: flex`; grandchildren are not its direct flex items. Check whether there is spare space to distribute. A container tightly wrapping its content cannot visibly demonstrate every `justify-content` value.

## Hand-in and retrieval
Save the experiments and three properties you will use in your project in the task note. Tomorrow, redraw the axes from memory. Ask a reviewer to give you a column-layout example to predict.

**Optional stretch:** compare when Grid is a clearer choice for two-dimensional card layouts.
