#!/usr/bin/env node
// Checks every DSA problem in the curriculum: the starter code must parse, and a reference
// solution must pass every example the practice pad will show students. Run with
//   (cd backend && go run ./cmd/dbadmin curriculum -dump) > /tmp/curriculum.json
//   node scripts/check-dsa.mjs /tmp/curriculum.json
// The reference runs after the starter, so the starter's helpers (lists, trees) are tested too.
import { readFileSync } from "node:fs";

const ref = {
  runningSum: (n) => n.reduce((a, x) => (a.push((a.at(-1) ?? 0) + x), a), []),
  missingNumber: (n) => (n.length * (n.length + 1)) / 2 - n.reduce((a, b) => a + b, 0),
  maxProfit: (p) => {
    let lo = Infinity, best = 0;
    for (const x of p) { lo = Math.min(lo, x); best = Math.max(best, x - lo); }
    return best;
  },
  moveZeroes: (n) => [...n.filter((x) => x !== 0), ...n.filter((x) => x === 0)],
  isPalindrome: (s) => { const t = s.toLowerCase().replace(/[^a-z0-9]/g, ""); return t === [...t].reverse().join(""); },
  containsDuplicate: (n) => new Set(n).size !== n.length,
  isAnagram: (s, t) => [...s].sort().join("") === [...t].sort().join(""),
  twoSum: (n, t) => { const m = new Map(); for (let i = 0; i < n.length; i++) { if (m.has(t - n[i])) return [m.get(t - n[i]), i]; m.set(n[i], i); } },
  sortedSquares: (n) => n.map((x) => x * x).sort((a, b) => a - b),
  isSubsequence: (s, t) => { let i = 0; for (const c of t) if (c === s[i]) i++; return i === s.length; },
  groupAnagrams: (strs) => {
    const m = new Map();
    for (const w of strs) { const k = [...w].sort().join(""); m.set(k, [...(m.get(k) ?? []), w]); }
    return [...m.values()].map((g) => g.sort()).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  },
  isValid: (s) => {
    const st = [], pair = { ")": "(", "]": "[", "}": "{" };
    for (const c of s) { if ("([{".includes(c)) st.push(c); else if (st.pop() !== pair[c]) return false; }
    return st.length === 0;
  },
  dailyTemperatures: (t) => t.map((x, i) => { for (let j = i + 1; j < t.length; j++) if (t[j] > x) return j - i; return 0; }),
  search: (n, t) => n.indexOf(t),
  searchInsert: (n, t) => { const i = n.findIndex((x) => x >= t); return i === -1 ? n.length : i; },
  findMin: (n) => Math.min(...n),
  maxSumK: (n, k) => { let best = -Infinity; for (let i = 0; i + k <= n.length; i++) best = Math.max(best, n.slice(i, i + k).reduce((a, b) => a + b, 0)); return best; },
  merge: (iv) => {
    const s = [...iv].sort((a, b) => a[0] - b[0]), out = [];
    for (const [a, b] of s) { const last = out.at(-1); if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]); }
    return out;
  },
  lengthOfLongestSubstring: (s) => { let best = 0; for (let i = 0; i < s.length; i++) { const seen = new Set(); for (let j = i; j < s.length && !seen.has(s[j]); j++) { seen.add(s[j]); best = Math.max(best, j - i + 1); } } return best; },
  productExceptSelf: (n) => n.map((_, i) => n.reduce((a, x, j) => (i === j ? a : a * x), 1)),
  topKFrequent: (n, k) => {
    const c = new Map(); for (const x of n) c.set(x, (c.get(x) ?? 0) + 1);
    return [...c].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, k).map(([x]) => x);
  },
  rotate: (n, k) => { const r = k % n.length; return r ? [...n.slice(-r), ...n.slice(0, -r)] : [...n]; },
  searchRotated: (n, t) => n.indexOf(t),
  minMeetingRooms: (iv) => {
    const ev = iv.flatMap(([s, e]) => [[s, 1], [e, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let cur = 0, best = 0; for (const [, d] of ev) { cur += d; best = Math.max(best, cur); } return best;
  },
  climbStairs: (n) => { let a = 1, b = 1; for (let i = 2; i <= n; i++) [a, b] = [b, a + b]; return b; },
  generateParenthesis: (n) => {
    const out = []; const go = (s, o, c) => { if (s.length === 2 * n) return out.push(s); if (o < n) go(s + "(", o + 1, c); if (c < o) go(s + ")", o, c + 1); };
    go("", 0, 0); return out.sort();
  },
  permute: (n) => { if (n.length <= 1) return [n]; return n.flatMap((x, i) => ref.permute([...n.slice(0, i), ...n.slice(i + 1)]).map((p) => [x, ...p])); },
  subsets: (n) => {
    const out = []; for (let m = 0; m < 1 << n.length; m++) out.push(n.filter((_, i) => m & (1 << i)));
    return out.sort((a, b) => a.length - b.length || JSON.stringify(a).localeCompare(JSON.stringify(b)));
  },
  numIslands: (g) => {
    const G = g.map((r) => [...r]); let n = 0;
    const sink = (i, j) => { if (G[i]?.[j] !== "1") return; G[i][j] = "0"; sink(i + 1, j); sink(i - 1, j); sink(i, j + 1); sink(i, j - 1); };
    for (let i = 0; i < G.length; i++) for (let j = 0; j < G[i].length; j++) if (G[i][j] === "1") { n++; sink(i, j); }
    return n;
  },
  floodFill: (img, sr, sc, color) => {
    const I = img.map((r) => [...r]), from = I[sr][sc]; if (from === color) return I;
    const fill = (i, j) => { if (I[i]?.[j] !== from) return; I[i][j] = color; fill(i + 1, j); fill(i - 1, j); fill(i, j + 1); fill(i, j - 1); };
    fill(sr, sc); return I;
  },
  shortestPath: (g) => {
    const R = g.length, C = g[0].length; if (g[0][0] || g[R - 1][C - 1]) return -1;
    const dist = g.map((r) => r.map(() => -1)); dist[0][0] = 0; const q = [[0, 0]];
    while (q.length) { const [i, j] = q.shift(); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < R && b < C && !g[a][b] && dist[a][b] < 0) { dist[a][b] = dist[i][j] + 1; q.push([a, b]); } } }
    return dist[R - 1][C - 1];
  },
  canFinish: (n, pre) => {
    const indeg = Array(n).fill(0), adj = [...Array(n)].map(() => []);
    for (const [a, b] of pre) { adj[b].push(a); indeg[a]++; }
    const q = indeg.flatMap((d, i) => (d ? [] : [i])); let seen = 0;
    while (q.length) { const x = q.shift(); seen++; for (const y of adj[x]) if (--indeg[y] === 0) q.push(y); }
    return seen === n;
  },
  countComponents: (n, edges) => {
    const p = [...Array(n).keys()]; const f = (x) => (p[x] === x ? x : (p[x] = f(p[x])));
    for (const [a, b] of edges) p[f(a)] = f(b); return new Set(p.map(f)).size;
  },
  orangesRotting: (g) => {
    const G = g.map((r) => [...r]); let q = []; let fresh = 0;
    G.forEach((r, i) => r.forEach((v, j) => { if (v === 2) q.push([i, j]); if (v === 1) fresh++; }));
    let t = 0;
    while (q.length && fresh) { const next = []; for (const [i, j] of q) for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) if (G[a]?.[b] === 1) { G[a][b] = 2; fresh--; next.push([a, b]); } q = next; t++; }
    return fresh ? -1 : t;
  },
  rob: (n) => { let a = 0, b = 0; for (const x of n) [a, b] = [b, Math.max(b, a + x)]; return b; },
  coinChange: (coins, amount) => {
    const dp = Array(amount + 1).fill(Infinity); dp[0] = 0;
    for (let x = 1; x <= amount; x++) for (const c of coins) if (c <= x) dp[x] = Math.min(dp[x], dp[x - c] + 1);
    return dp[amount] === Infinity ? -1 : dp[amount];
  },
  lengthOfLIS: (n) => { const d = n.map(() => 1); for (let i = 0; i < n.length; i++) for (let j = 0; j < i; j++) if (n[j] < n[i]) d[i] = Math.max(d[i], d[j] + 1); return Math.max(...d); },
  uniquePaths: (m, n) => { const r = Array(n).fill(1); for (let i = 1; i < m; i++) for (let j = 1; j < n; j++) r[j] += r[j - 1]; return r[n - 1]; },
  longestCommonSubsequence: (a, b) => {
    const d = [...Array(a.length + 1)].map(() => Array(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]);
    return d[a.length][b.length];
  },
  wordBreak: (s, words) => { const w = new Set(words), ok = [true]; for (let i = 1; i <= s.length; i++) ok[i] = [...Array(i).keys()].some((j) => ok[j] && w.has(s.slice(j, i))); return !!ok[s.length]; },
  numDecodings: (s) => {
    const d = [1, s[0] === "0" ? 0 : 1];
    for (let i = 2; i <= s.length; i++) { const one = +s[i - 1], two = +s.slice(i - 2, i); d[i] = (one ? d[i - 1] : 0) + (two >= 10 && two <= 26 ? d[i - 2] : 0); }
    return s.length ? d[s.length] : 0;
  },
  findKthLargest: (n, k) => [...n].sort((a, b) => b - a)[k - 1],
  lastStoneWeight: (s) => { const a = [...s]; while (a.length > 1) { a.sort((x, y) => y - x); const [x, y] = a.splice(0, 2); if (x !== y) a.push(x - y); } return a[0] ?? 0; },
  kClosest: (pts, k) => [...pts].sort((p, q) => p[0] ** 2 + p[1] ** 2 - (q[0] ** 2 + q[1] ** 2) || p[0] - q[0] || p[1] - q[1]).slice(0, k),
  mergeKSorted: (lists) => lists.flat().sort((a, b) => a - b),
};

// Reference bodies that use the starter's helpers (lists and trees), written as source.
const withHelpers = {
  reverseList: `function reverseList(values) { let prev = null, cur = fromArray(values); while (cur) { const n = cur.next; cur.next = prev; prev = cur; cur = n; } return toArray(prev); }`,
  mergeTwoLists: `function mergeTwoLists(a, b) { let l1 = fromArray(a), l2 = fromArray(b); const d = new ListNode(0); let t = d; while (l1 && l2) { if (l1.val <= l2.val) { t.next = l1; l1 = l1.next; } else { t.next = l2; l2 = l2.next; } t = t.next; } t.next = l1 || l2; return toArray(d.next); }`,
  middleNode: `function middleNode(values) { let s = fromArray(values), f = s; while (f && f.next) { s = s.next; f = f.next.next; } return toArray(s); }`,
  maxDepth: `function maxDepth(values) { const d = (n) => (n ? 1 + Math.max(d(n.left), d(n.right)) : 0); return d(fromLevelOrder(values)); }`,
  invertTree: `function invertTree(values) { const inv = (n) => { if (n) { [n.left, n.right] = [inv(n.right), inv(n.left)]; } return n; }; return toLevelOrder(inv(fromLevelOrder(values))); }`,
  isSymmetric: `function isSymmetric(values) { const m = (a, b) => (!a && !b) || (!!a && !!b && a.val === b.val && m(a.left, b.right) && m(a.right, b.left)); const r = fromLevelOrder(values); return !r || m(r.left, r.right); }`,
  levelOrder: `function levelOrder(values) { const r = fromLevelOrder(values), out = []; let lvl = r ? [r] : []; while (lvl.length) { out.push(lvl.map((n) => n.val)); lvl = lvl.flatMap((n) => [n.left, n.right].filter(Boolean)); } return out; }`,
  isValidBST: `function isValidBST(values) { const ok = (n, lo, hi) => !n || (n.val > lo && n.val < hi && ok(n.left, lo, n.val) && ok(n.right, n.val, hi)); return ok(fromLevelOrder(values), -Infinity, Infinity); }`,
  kthSmallest: `function kthSmallest(values, k) { const out = []; const walk = (n) => { if (n) { walk(n.left); out.push(n.val); walk(n.right); } }; walk(fromLevelOrder(values)); return out[k - 1]; }`,
};

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/check-dsa.mjs curriculum.json");
  process.exit(2);
}
const { tasks } = JSON.parse(readFileSync(file, "utf8"));
let problems = 0, cases = 0, failures = 0;
const fail = (msg) => { failures++; console.error("✗ " + msg); };

for (const t of tasks) {
  const p = t.Practice;
  if (!p) continue;
  problems++;
  const name = p.function_name;
  let fn;
  try {
    // The starter must at least parse and define the function.
    new Function(`${p.starter}\nreturn typeof ${name};`)();
    fn = withHelpers[name]
      ? new Function(`${p.starter}\n${withHelpers[name]}\nreturn ${name};`)()
      : ref[name];
  } catch (e) {
    fail(`${t.Key}: starter doesn't parse (${e.message})`);
    continue;
  }
  if (typeof fn !== "function") {
    fail(`${t.Key}: no reference solution for ${name}`);
    continue;
  }
  for (const tc of p.tests) {
    cases++;
    const args = tc.args;
    const want = JSON.stringify(tc.expected);
    let got;
    try {
      got = JSON.stringify(fn(...structuredClone(args)));
    } catch (e) {
      got = "threw " + e.message;
    }
    if (got !== want) fail(`${t.Key}: ${name}(${JSON.stringify(args).slice(1, -1)}) should be ${got}, the task says ${want}`);
  }
}
console.log(`${problems} DSA problems, ${cases} examples checked, ${failures} wrong`);
process.exit(failures ? 1 : 0);
