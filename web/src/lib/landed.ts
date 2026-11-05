import { NetworkError } from "./api/errors";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs a write. When the connection drops or times out, the server may still have done it
 * (a slow or waking API answers after the browser gave up), so before reporting a failure we
 * look again: `check` returns the result if the write landed, or null if it didn't.
 */
export async function landed<T>(write: () => Promise<T>, check: () => Promise<T | null>, waits: readonly number[] = [1500, 5000]): Promise<T> {
  try {
    return await write();
  } catch (e) {
    if (!(e instanceof NetworkError)) throw e;
    for (const ms of waits) {
      await sleep(ms);
      try {
        const found = await check();
        if (found !== null) return found;
      } catch {
        // Still unreachable; try again or give up below.
      }
    }
    throw e;
  }
}
