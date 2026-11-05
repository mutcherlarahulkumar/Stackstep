/**
 * Light software-industry lines shown while something loads, so waiting feels like part of
 * the internship instead of a blank screen. Short enough for a phone, never mocking the user.
 */
export const QUIPS = [
  "Compiling your coffee…",
  "Rubber-ducking the server…",
  "git pull --rebase on today's tickets…",
  "Asking the team lead for an ETA…",
  "Warming up the CI runners…",
  "Resolving merge conflicts in the space-time continuum…",
  "Writing tests first. Promise.",
  "Turning it off and on again…",
  "It works on my machine. Checking yours…",
  "Reticulating flexbox splines…",
  "Naming things (the hard part)…",
  "Clearing the cache. And the other cache.",
  "Bumping the version to 0.0.1-beta-final-final…",
  "Reading the docs so you don't have to…",
  "Shipping small, shipping often…",
  "Code review in progress, looks good to me…",
  "Spinning up a fresh branch…",
  "Linting the vibes…",
  "Off-by-one? Counting again…",
  "Waiting for npm install to finish…",
  "Pairing with the database…",
  "Squashing bugs, one console.log at a time…",
  "Deploying to production on a Friday? Never.",
  "Grepping for the meaning of life…",
  "Converting caffeine into commits…",
  "Opening a pull request for your day…",
  "Async/awaiting greatness…",
  "Refactoring the loading screen…",
] as const;

/** A stable starting quip per caller, so server and client render the same first line. */
export function quipAt(index: number): string {
  const n = QUIPS.length;
  return QUIPS[((index % n) + n) % n] ?? QUIPS[0];
}
