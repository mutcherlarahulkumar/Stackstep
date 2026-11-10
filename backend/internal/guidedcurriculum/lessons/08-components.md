# Components are boundaries, not just shorter files

**Estimated effort:** 90 minutes. **Prerequisite:** a working portfolio with filters. **Artifact:** a React port that preserves its existing behaviour.

## Core work
1. Use Node 24 LTS and npm. In your existing repository run `npm create vite@latest react-portfolio -- --template react-ts`, then `cd react-portfolio`, `npm install`, and `npm run dev`. Open the local address printed by the tool. Keep the generated dependency lockfile; place the React port in this subfolder so the working static version remains available.
2. Record the current hero and filter acceptance checks before refactoring.
3. Identify `Hero`, `ProjectCard`, and `ProjectFilters` as candidate components. State each responsibility in one sentence.
4. Put the typed project array in `src/data/projects.ts` and import it where needed; port the static HTML into `src/App.tsx` and the existing CSS into the scaffold's styles. Pass project data through explicit props. Keep one source dataset and use stable project ids as list keys.
5. Keep the initial port small: preserve behaviour before adding state or new visual effects.
6. Re-run narrow-screen, keyboard and filter checks after each extraction.

```tsx
type Project = {
  id: string; title: string; description: string;
  tags: string[]; url: string;
};
function ProjectCard({ project }: { project: Project }) {
  return <article>
    <h2>{project.title}</h2>
    <p>{project.description}</p>
    <a href={project.url}>View {project.title}</a>
  </article>;
}
// projects.map(project => <ProjectCard key={project.id} project={project} />)
```

## Done checks
Each component has a clear input and responsibility. Props are treated as read-only. List items keep their identity when sorted. The app still handles a long title, an empty result and keyboard navigation.

## Debugging prompt
If the interface changes unexpectedly, compare one extracted component with the original markup and styles. Avoid changing data shape, layout and framework all in the same commit. A component needs a reason to exist beyond reaching a particular line count.

## Hand-in and reflection
Submit a focused PR with the preserved acceptance checks and a small component diagram. Ask the reviewer to identify a component with too many responsibilities.

**Retrieval:** why is an array index a risky key for a list that can be reordered? **Optional stretch:** model a genuinely optional project field with a clear empty state, keeping the props type explicit.
