# Choose a layout by predicting how it should behave

You can complete this lesson inside Stackstep. The external resources are optional further
reading. Start with an HTML file and a stylesheet in your portfolio repository; open the
page in your browser and use its responsive viewport controls.

## Flexbox: arrange a row or a column

Flexbox places items along one main axis. `flex-direction: row` makes the main axis
horizontal; `column` makes it vertical. `justify-content` distributes free space along
that main axis. `align-items` aligns items across it. These names describe axes, not
permanent horizontal or vertical directions.

```html
<nav class="navigation" aria-label="Portfolio">
  <a href="#projects">Projects</a>
  <a href="#about">About</a>
  <a href="#contact">Contact</a>
</nav>
```

```css
.navigation {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  align-items: center;
}
```

Predict what happens when the viewport narrows. Then change the direction to `column`
and predict which alignment moves the links sideways. Verify each prediction separately.
When centering appears broken, check whether the container has any free space to distribute.

## Grid: align rows and columns together

Grid describes two-dimensional tracks. It is useful when project cards should line up
in columns as well as rows. Keep the actual reading order in the HTML meaningful.

```css
.projects {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: 1rem;
}
```

Use three articles inside `.projects`. At a narrow width, each card should fit the container;
as space grows, additional columns can appear. `min(100%, 16rem)` prevents the minimum track
from forcing horizontal page overflow on a screen narrower than 16rem.

## Try, check, explain

- Build a navigation row with Flexbox and a project-card layout with Grid.
- Test 320px, 360px, and a desktop width, plus one unusually long card title.
- Use only a keyboard to follow the links. Keep focus visible and avoid changing the visual
  order in a way that disagrees with the reading order.
- In your task note, name the main axis for both Flexbox directions and explain one case
  where Grid's two-dimensional alignment helps. Include your prediction and observed result.

If a layout overflows, inspect the actual element and track widths before adding
`overflow: hidden`. Hiding content is not proof that the layout fits.
