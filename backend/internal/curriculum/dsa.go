package curriculum

// The later DSA problems of the day, shared by both programs where they overlap. Every
// expected value is checked against a reference solution by scripts/check-dsa.mjs.

const listHelpers = `// Helpers. The tests pass plain arrays; build a linked list to practise on.
function ListNode(val, next = null) {
  this.val = val;
  this.next = next;
}
function fromArray(values) {
  let head = null;
  for (let i = values.length - 1; i >= 0; i--) head = new ListNode(values[i], head);
  return head;
}
function toArray(head) {
  const out = [];
  for (let n = head; n; n = n.next) out.push(n.val);
  return out;
}

`

const treeHelpers = `// Helpers. Trees are given in level order, with null for a missing child,
// like [3, 9, 20, null, null, 15, 7].
function TreeNode(val, left = null, right = null) {
  this.val = val;
  this.left = left;
  this.right = right;
}
function fromLevelOrder(values) {
  if (!values.length || values[0] === null) return null;
  const root = new TreeNode(values[0]);
  const queue = [root];
  let i = 1;
  while (queue.length && i < values.length) {
    const node = queue.shift();
    if (i < values.length && values[i] !== null) queue.push((node.left = new TreeNode(values[i])));
    i++;
    if (i < values.length && values[i] !== null) queue.push((node.right = new TreeNode(values[i])));
    i++;
  }
  return root;
}
function toLevelOrder(root) {
  const out = [];
  const queue = [root];
  while (queue.length) {
    const node = queue.shift();
    if (node) {
      out.push(node.val);
      queue.push(node.left, node.right);
    } else out.push(null);
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}

`

func dsaMergeIntervals() Item {
	return dsa("dsa-merge-intervals", "Merge overlapping intervals",
		`Interview-style from here on. Read, plan on paper, then code.

### Problem
Given intervals as [start, end] pairs, merge every overlapping pair and return the result sorted by start. Touching intervals like [1, 4] and [4, 5] count as overlapping.

### Examples
`+"```"+`
merge([[1, 3], [2, 6], [8, 10], [15, 18]])  ->  [[1, 6], [8, 10], [15, 18]]
merge([[1, 4], [4, 5]])  ->  [[1, 5]]
`+"```"+`

### Aim for
Sort by start, then one pass. O(n log n).`,
		practice("merge", "function merge(intervals) {\n  \n}\n",
			"[[[1,3],[2,6],[8,10],[15,18]]]", "[[1,6],[8,10],[15,18]]", "[[[1,4],[4,5]]]", "[[1,5]]", "[[[1,4],[0,4]]]", "[[0,4]]", "[[[1,4],[2,3]]]", "[[1,4]]", "[[[5,6]]]", "[[5,6]]"))
}

func dsaLongestSubstring() Item {
	return dsa("dsa-longest-substring", "Longest substring without repeating characters",
		`### Problem
Return the length of the longest substring of `+"`s`"+` with no repeated characters.

### Examples
`+"```"+`
lengthOfLongestSubstring("abcabcbb")  ->  3   ("abc")
lengthOfLongestSubstring("bbbbb")  ->  1
lengthOfLongestSubstring("pwwkew")  ->  3   ("wke")
`+"```"+`

### Aim for
A sliding window with a map from character to its last index. O(n).`,
		practice("lengthOfLongestSubstring", "function lengthOfLongestSubstring(s) {\n  \n}\n",
			`["abcabcbb"]`, "3", `["bbbbb"]`, "1", `["pwwkew"]`, "3", `[""]`, "0", `["dvdf"]`, "3"))
}

func dsaProductExceptSelf() Item {
	return dsa("dsa-product-except-self", "Product of the array except itself",
		`### Problem
Return an array where element i is the product of every number in `+"`nums`"+` except `+"`nums[i]`"+`. Don't use division.

### Examples
`+"```"+`
productExceptSelf([1, 2, 3, 4])  ->  [24, 12, 8, 6]
productExceptSelf([2, 3, 4, 5])  ->  [60, 40, 30, 24]
`+"```"+`

### Aim for
Two passes, prefix products from the left and suffix products from the right. O(n).`,
		practice("productExceptSelf", "function productExceptSelf(nums) {\n  \n}\n",
			"[[1,2,3,4]]", "[24,12,8,6]", "[[2,3,4,5]]", "[60,40,30,24]", "[[1,1,1]]", "[1,1,1]", "[[3,2]]", "[2,3]", "[[5,1,10]]", "[10,50,5]"))
}

func dsaTopKFrequent() Item {
	return dsa("dsa-top-k-frequent", "Top k frequent numbers",
		`### Problem
Return the `+"`k`"+` numbers that appear most often in `+"`nums`"+`, most frequent first. When two numbers appear equally often, the smaller one comes first.

### Examples
`+"```"+`
topKFrequent([1, 1, 1, 2, 2, 3], 2)  ->  [1, 2]
topKFrequent([4, 4, 5, 5, 6], 2)  ->  [4, 5]
`+"```"+`

### Aim for
Count with a `+"`Map`"+`, then sort the entries, O(n log n). For bonus points, look up bucket sort, which makes it O(n).`,
		practice("topKFrequent", "function topKFrequent(nums, k) {\n  \n}\n",
			"[[1,1,1,2,2,3],2]", "[1,2]", "[[1],1]", "[1]", "[[4,4,5,5,6],2]", "[4,5]", "[[3,0,1,0],1]", "[0]", "[[5,3,5,3,1,1,1],3]", "[1,3,5]"))
}

func dsaRotateArray() Item {
	return dsa("dsa-rotate-array", "Rotate an array",
		`### Problem
Rotate `+"`nums`"+` to the right by `+"`k`"+` steps and return it. `+"`k`"+` can be larger than the length.

### Examples
`+"```"+`
rotate([1, 2, 3, 4, 5, 6, 7], 3)  ->  [5, 6, 7, 1, 2, 3, 4]
rotate([1, 2], 3)  ->  [2, 1]
`+"```"+`

### Aim for
O(n) time and O(1) extra space. Hint, reverse the whole array, then reverse each part.`,
		practice("rotate", "function rotate(nums, k) {\n  // Rotate nums in place, then return it.\n  return nums;\n}\n",
			"[[1,2,3,4,5,6,7],3]", "[5,6,7,1,2,3,4]", "[[-1,-100,3,99],2]", "[3,99,-1,-100]", "[[1,2],3]", "[2,1]", "[[1],0]", "[1]", "[[1,2,3],3]", "[1,2,3]"))
}

func dsaRotatedSearch() Item {
	return dsa("dsa-rotated-search", "Search in a rotated sorted array",
		`### Problem
A sorted array of distinct numbers was rotated at an unknown point. Return the index of `+"`target`"+`, or -1.

### Examples
`+"```"+`
searchRotated([4, 5, 6, 7, 0, 1, 2], 0)  ->  4
searchRotated([4, 5, 6, 7, 0, 1, 2], 3)  ->  -1
`+"```"+`

### Aim for
O(log n). At each step one half is sorted. Check whether the target lies in it.`,
		practice("searchRotated", "function searchRotated(nums, target) {\n  \n}\n",
			"[[4,5,6,7,0,1,2],0]", "4", "[[4,5,6,7,0,1,2],3]", "-1", "[[1],0]", "-1", "[[5,1,3],5]", "0", "[[3,1],1]", "1"))
}

func dsaMeetingRooms() Item {
	return dsa("dsa-meeting-rooms", "Minimum meeting rooms",
		`### Problem
Each meeting is [start, end]. Return the fewest rooms needed so no two meetings in the same room overlap. A meeting may start in a room the moment another ends.

### Examples
`+"```"+`
minMeetingRooms([[0, 30], [5, 10], [15, 20]])  ->  2
minMeetingRooms([[7, 10], [2, 4]])  ->  1
`+"```"+`

### Aim for
Sort the start times and the end times separately and walk both with two pointers. O(n log n).`,
		practice("minMeetingRooms", "function minMeetingRooms(intervals) {\n  \n}\n",
			"[[[0,30],[5,10],[15,20]]]", "2", "[[[7,10],[2,4]]]", "1", "[[[1,5],[5,10]]]", "1", "[[[1,10],[2,7],[3,19],[8,12],[10,20],[11,30]]]", "4", "[[]]", "0"))
}

// ---- 60-day only ----

func dsaReverseList() Item {
	return dsa("dsa-reverse-list", "Reverse a linked list",
		`Linked lists week. The starter has helpers to turn arrays into lists and back.

### Problem
Reverse the list and return its values as an array.

### Examples
`+"```"+`
reverseList([1, 2, 3, 4, 5])  ->  [5, 4, 3, 2, 1]
reverseList([])  ->  []
`+"```"+`

### Aim for
Iteratively with three pointers (previous, current, next), O(n) time and O(1) space. Then try it recursively.`,
		practice("reverseList", listHelpers+"function reverseList(values) {\n  const head = fromArray(values);\n  // Reverse by changing next pointers, then return toArray(newHead).\n}\n",
			"[[1,2,3,4,5]]", "[5,4,3,2,1]", "[[1,2]]", "[2,1]", "[[]]", "[]", "[[7]]", "[7]"))
}

func dsaMergeLists() Item {
	return dsa("dsa-merge-lists", "Merge two sorted linked lists",
		`### Problem
`+"`a`"+` and `+"`b`"+` are sorted. Merge them into one sorted list by relinking the nodes, and return its values.

### Examples
`+"```"+`
mergeTwoLists([1, 2, 4], [1, 3, 4])  ->  [1, 1, 2, 3, 4, 4]
mergeTwoLists([], [0])  ->  [0]
`+"```"+`

### Aim for
A dummy head node and one pass. O(n + m).`,
		practice("mergeTwoLists", listHelpers+"function mergeTwoLists(a, b) {\n  let l1 = fromArray(a);\n  let l2 = fromArray(b);\n  \n}\n",
			"[[1,2,4],[1,3,4]]", "[1,1,2,3,4,4]", "[[],[]]", "[]", "[[],[0]]", "[0]", "[[5],[1,2,3]]", "[1,2,3,5]"))
}

func dsaMiddleNode() Item {
	return dsa("dsa-middle-node", "Middle of a linked list",
		`### Problem
Return the values from the middle node to the end. With two middle nodes, start from the second.

### Examples
`+"```"+`
middleNode([1, 2, 3, 4, 5])  ->  [3, 4, 5]
middleNode([1, 2, 3, 4, 5, 6])  ->  [4, 5, 6]
`+"```"+`

### Aim for
Slow and fast pointers in one pass. The same trick finds cycles.`,
		practice("middleNode", listHelpers+"function middleNode(values) {\n  const head = fromArray(values);\n  \n}\n",
			"[[1,2,3,4,5]]", "[3,4,5]", "[[1,2,3,4,5,6]]", "[4,5,6]", "[[1]]", "[1]", "[[1,2]]", "[2]"))
}

func dsaClimbStairs() Item {
	return dsa("dsa-climb-stairs", "Climbing stairs",
		`Recursion week.

### Problem
You climb a staircase of `+"`n`"+` steps, one or two steps at a time. In how many distinct ways can you reach the top?

### Examples
`+"```"+`
climbStairs(2)  ->  2
climbStairs(3)  ->  3
climbStairs(5)  ->  8
`+"```"+`

### Aim for
Write the plain recursion first and see how slow `+"`climbStairs(40)`"+` is. Then add memoisation, then turn it into a loop with two variables.`,
		practice("climbStairs", "function climbStairs(n) {\n  \n}\n",
			"[2]", "2", "[3]", "3", "[5]", "8", "[1]", "1", "[10]", "89", "[40]", "165580141"))
}

func dsaGenerateParens() Item {
	return dsa("dsa-generate-parens", "Generate balanced parentheses",
		`### Problem
Return every string of `+"`n`"+` pairs of balanced parentheses, sorted alphabetically.

### Examples
`+"```"+`
generateParenthesis(2)  ->  ["(())", "()()"]
generateParenthesis(3)  ->  ["((()))", "(()())", "(())()", "()(())", "()()()"]
`+"```"+`

### Aim for
Backtracking. Add "(" while you have some left, add ")" while it wouldn't close more than you opened.`,
		practice("generateParenthesis", "function generateParenthesis(n) {\n  \n}\n",
			"[1]", `["()"]`, "[2]", `["(())","()()"]`, "[3]", `["((()))","(()())","(())()","()(())","()()()"]`))
}

func dsaPermutations() Item {
	return dsa("dsa-permutations", "All permutations",
		`### Problem
`+"`nums`"+` holds distinct numbers in ascending order. Return every ordering of them, in lexicographic order.

### Examples
`+"```"+`
permute([1, 2, 3])  ->  [[1,2,3], [1,3,2], [2,1,3], [2,3,1], [3,1,2], [3,2,1]]
permute([0, 1])  ->  [[0,1], [1,0]]
`+"```"+`

### Aim for
Backtracking with a "used" array. There are n! answers, so O(n · n!) is expected.`,
		practice("permute", "function permute(nums) {\n  \n}\n",
			"[[1,2,3]]", "[[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]]", "[[0,1]]", "[[0,1],[1,0]]", "[[1]]", "[[1]]"))
}

func dsaSubsets() Item {
	return dsa("dsa-subsets", "All subsets",
		`### Problem
`+"`nums`"+` holds distinct numbers in ascending order. Return every subset. Sort the answer so it's easy to check, shorter subsets first and same-length subsets in lexicographic order.

### Examples
`+"```"+`
subsets([1, 2, 3])  ->  [[], [1], [2], [3], [1,2], [1,3], [2,3], [1,2,3]]
`+"```"+`

### Aim for
Backtracking or bitmasks, then sort. There are 2^n subsets.`,
		practice("subsets", "function subsets(nums) {\n  \n}\n",
			"[[1,2,3]]", "[[],[1],[2],[3],[1,2],[1,3],[2,3],[1,2,3]]", "[[0]]", "[[],[0]]", "[[]]", "[[]]"))
}

func dsaMaxDepth() Item {
	return dsa("dsa-max-depth", "Maximum depth of a binary tree",
		`Trees week. The starter turns level-order arrays into trees.

### Problem
Return the number of nodes on the longest path from the root down to a leaf.

### Examples
`+"```"+`
maxDepth([3, 9, 20, null, null, 15, 7])  ->  3
maxDepth([1, null, 2])  ->  2
`+"```"+`

### Aim for
Recursion is one line. Then do it with a queue (breadth first).`,
		practice("maxDepth", treeHelpers+"function maxDepth(values) {\n  const root = fromLevelOrder(values);\n  \n}\n",
			"[[3,9,20,null,null,15,7]]", "3", "[[1,null,2]]", "2", "[[]]", "0", "[[1]]", "1", "[[1,2,3,4,null,null,5,6]]", "4"))
}

func dsaInvertTree() Item {
	return dsa("dsa-invert-tree", "Invert a binary tree",
		`### Problem
Mirror the tree (swap every left and right child) and return it in level order.

### Examples
`+"```"+`
invertTree([4, 2, 7, 1, 3, 6, 9])  ->  [4, 7, 2, 9, 6, 3, 1]
invertTree([2, 1, 3])  ->  [2, 3, 1]
`+"```"+``,
		practice("invertTree", treeHelpers+"function invertTree(values) {\n  const root = fromLevelOrder(values);\n  \n  return toLevelOrder(root);\n}\n",
			"[[4,2,7,1,3,6,9]]", "[4,7,2,9,6,3,1]", "[[2,1,3]]", "[2,3,1]", "[[]]", "[]", "[[1,2]]", "[1,null,2]"))
}

func dsaSymmetric() Item {
	return dsa("dsa-symmetric", "Symmetric tree",
		`### Problem
Return true if the tree is a mirror of itself around its centre.

### Examples
`+"```"+`
isSymmetric([1, 2, 2, 3, 4, 4, 3])  ->  true
isSymmetric([1, 2, 2, null, 3, null, 3])  ->  false
`+"```"+`

### Aim for
A helper that compares two subtrees as mirrors.`,
		practice("isSymmetric", treeHelpers+"function isSymmetric(values) {\n  const root = fromLevelOrder(values);\n  \n}\n",
			"[[1,2,2,3,4,4,3]]", "true", "[[1,2,2,null,3,null,3]]", "false", "[[1]]", "true", "[[]]", "true", "[[1,2,3]]", "false"))
}

func dsaLevelOrder() Item {
	return dsa("dsa-level-order", "Level order traversal",
		`### Problem
Return the values level by level, left to right, as an array of arrays.

### Examples
`+"```"+`
levelOrder([3, 9, 20, null, null, 15, 7])  ->  [[3], [9, 20], [15, 7]]
`+"```"+`

### Aim for
A queue, processing one level's worth of nodes per loop.`,
		practice("levelOrder", treeHelpers+"function levelOrder(values) {\n  const root = fromLevelOrder(values);\n  \n}\n",
			"[[3,9,20,null,null,15,7]]", "[[3],[9,20],[15,7]]", "[[1]]", "[[1]]", "[[]]", "[]", "[[1,2,3,4,5]]", "[[1],[2,3],[4,5]]"))
}

func dsaValidBST() Item {
	return dsa("dsa-valid-bst", "Validate a binary search tree",
		`### Problem
Return true if every node's left subtree holds only smaller values and its right subtree only larger ones.

### Examples
`+"```"+`
isValidBST([2, 1, 3])  ->  true
isValidBST([5, 1, 4, null, null, 3, 6])  ->  false
isValidBST([5, 4, 6, null, null, 3, 7])  ->  false   (3 is in 5's right subtree)
`+"```"+`

### Aim for
Pass down the allowed (min, max) range. Checking only direct children is the classic wrong answer.`,
		practice("isValidBST", treeHelpers+"function isValidBST(values) {\n  const root = fromLevelOrder(values);\n  \n}\n",
			"[[2,1,3]]", "true", "[[5,1,4,null,null,3,6]]", "false", "[[5,4,6,null,null,3,7]]", "false", "[[1]]", "true", "[[2,2,2]]", "false"))
}

func dsaKthSmallest() Item {
	return dsa("dsa-kth-smallest", "Kth smallest value in a BST",
		`### Problem
Return the kth smallest value (1-indexed) in a binary search tree.

### Examples
`+"```"+`
kthSmallest([3, 1, 4, null, 2], 1)  ->  1
kthSmallest([5, 3, 6, 2, 4, null, null, 1], 3)  ->  3
`+"```"+`

### Aim for
An in-order traversal visits values in sorted order. Stop as soon as you reach the kth.`,
		practice("kthSmallest", treeHelpers+"function kthSmallest(values, k) {\n  const root = fromLevelOrder(values);\n  \n}\n",
			"[[3,1,4,null,2],1]", "1", "[[5,3,6,2,4,null,null,1],3]", "3", "[[2,1,3],3]", "3", "[[1],1]", "1"))
}

func dsaKthLargest() Item {
	return dsa("dsa-kth-largest", "Kth largest element",
		`Heaps week.

### Problem
Return the kth largest number in `+"`nums`"+` (in sorted order, not the kth distinct).

### Examples
`+"```"+`
findKthLargest([3, 2, 1, 5, 6, 4], 2)  ->  5
findKthLargest([3, 2, 3, 1, 2, 4, 5, 5, 6], 4)  ->  4
`+"```"+`

### Aim for
Sorting is O(n log n). A min-heap of size k is O(n log k). JavaScript has no built-in heap, so write a small one, it's a good exercise.`,
		practice("findKthLargest", "function findKthLargest(nums, k) {\n  \n}\n",
			"[[3,2,1,5,6,4],2]", "5", "[[3,2,3,1,2,4,5,5,6],4]", "4", "[[1],1]", "1", "[[2,1],2]", "1"))
}

func dsaLastStone() Item {
	return dsa("dsa-last-stone", "Last stone weight",
		`### Problem
Each turn, smash the two heaviest stones. Equal stones both disappear, otherwise the lighter one disappears and the heavier loses that much weight. Return the weight of the last stone, or 0 if none is left.

### Examples
`+"```"+`
lastStoneWeight([2, 7, 4, 1, 8, 1])  ->  1
lastStoneWeight([2, 2])  ->  0
`+"```"+`

### Aim for
A max-heap gives O(n log n).`,
		practice("lastStoneWeight", "function lastStoneWeight(stones) {\n  \n}\n",
			"[[2,7,4,1,8,1]]", "1", "[[1]]", "1", "[[2,2]]", "0", "[[10,4,4]]", "2"))
}

func dsaKClosest() Item {
	return dsa("dsa-k-closest", "K closest points to the origin",
		`### Problem
Return the `+"`k`"+` points closest to (0, 0), nearest first. Break ties by x, then by y.

### Examples
`+"```"+`
kClosest([[1, 3], [-2, 2]], 1)  ->  [[-2, 2]]
kClosest([[3, 3], [5, -1], [-2, 4]], 2)  ->  [[3, 3], [-2, 4]]
`+"```"+`

### Aim for
Compare squared distances, there's no need for a square root.`,
		practice("kClosest", "function kClosest(points, k) {\n  \n}\n",
			"[[[1,3],[-2,2]],1]", "[[-2,2]]", "[[[3,3],[5,-1],[-2,4]],2]", "[[3,3],[-2,4]]", "[[[0,1],[1,0]],2]", "[[0,1],[1,0]]", "[[[2,2],[1,1],[3,3]],3]", "[[1,1],[2,2],[3,3]]"))
}

func dsaMergeKSorted() Item {
	return dsa("dsa-merge-k-sorted", "Merge k sorted arrays",
		`### Problem
Each inner array is sorted. Merge them all into one sorted array.

### Examples
`+"```"+`
mergeKSorted([[1, 4, 5], [1, 3, 4], [2, 6]])  ->  [1, 1, 2, 3, 4, 4, 5, 6]
mergeKSorted([])  ->  []
`+"```"+`

### Aim for
A min-heap of (value, array, index) gives O(N log k). Merging pairs repeatedly also works.`,
		practice("mergeKSorted", "function mergeKSorted(lists) {\n  \n}\n",
			"[[[1,4,5],[1,3,4],[2,6]]]", "[1,1,2,3,4,4,5,6]", "[[]]", "[]", "[[[]]]", "[]", "[[[5],[1,2]]]", "[1,2,5]"))
}

func dsaNumIslands() Item {
	return dsa("dsa-num-islands", "Number of islands",
		`Graphs week. A grid is a graph where each cell links to its neighbours.

### Problem
`+"`grid`"+` holds "1" for land and "0" for water. Count the islands (land connected up, down, left or right).

### Examples
`+"```"+`
numIslands([
  ["1","1","0","0","0"],
  ["1","1","0","0","0"],
  ["0","0","1","0","0"],
  ["0","0","0","1","1"]
])  ->  3
`+"```"+`

### Aim for
For each unvisited land cell, flood it with DFS or BFS and count one island. O(rows · cols).`,
		practice("numIslands", "function numIslands(grid) {\n  \n}\n",
			`[[["1","1","0","0","0"],["1","1","0","0","0"],["0","0","1","0","0"],["0","0","0","1","1"]]]`, "3",
			`[[["1","1","1"],["0","1","0"],["1","1","1"]]]`, "1", `[[["0"]]]`, "0", `[[["1","0","1","0","1"]]]`, "3"))
}

func dsaFloodFill() Item {
	return dsa("dsa-flood-fill", "Flood fill",
		`### Problem
Starting at (sr, sc), change the colour of that pixel and every connected pixel of the same colour to `+"`color`"+`. Return the image.

### Examples
`+"```"+`
floodFill([[1,1,1],[1,1,0],[1,0,1]], 1, 1, 2)  ->  [[2,2,2],[2,2,0],[2,0,1]]
`+"```"+`

### Aim for
DFS or BFS. Watch out for the case where the new colour equals the old one.`,
		practice("floodFill", "function floodFill(image, sr, sc, color) {\n  \n}\n",
			"[[[1,1,1],[1,1,0],[1,0,1]],1,1,2]", "[[2,2,2],[2,2,0],[2,0,1]]", "[[[0,0,0],[0,0,0]],0,0,0]", "[[0,0,0],[0,0,0]]", "[[[0,1],[1,1]],1,1,3]", "[[0,3],[3,3]]"))
}

func dsaShortestPath() Item {
	return dsa("dsa-shortest-path", "Shortest path through a maze",
		`### Problem
In `+"`grid`"+`, 0 is open and 1 is a wall. Moving up, down, left or right, return the fewest moves from the top-left cell to the bottom-right cell, or -1 if you can't get there.

### Examples
`+"```"+`
shortestPath([[0,0,0],[1,1,0],[0,0,0]])  ->  4
shortestPath([[0,1],[1,0]])  ->  -1
`+"```"+`

### Aim for
Breadth-first search finds shortest paths in unweighted graphs. O(rows · cols).`,
		practice("shortestPath", "function shortestPath(grid) {\n  \n}\n",
			"[[[0,0,0],[1,1,0],[0,0,0]]]", "4", "[[[0,1],[1,0]]]", "-1", "[[[0]]]", "0", "[[[0,0,0],[0,1,0],[0,0,0]]]", "4", "[[[1,0],[0,0]]]", "-1"))
}

func dsaCourseSchedule() Item {
	return dsa("dsa-course-schedule", "Course schedule",
		`### Problem
There are `+"`n`"+` courses, 0 to n − 1. Each pair [a, b] in `+"`prerequisites`"+` means you must take b before a. Return true if you can finish every course.

### Examples
`+"```"+`
canFinish(2, [[1, 0]])  ->  true
canFinish(2, [[1, 0], [0, 1]])  ->  false
`+"```"+`

### Aim for
It's possible exactly when the graph has no cycle. Use Kahn's algorithm (count in-degrees, peel off zero-in-degree nodes) or DFS with colours.`,
		practice("canFinish", "function canFinish(n, prerequisites) {\n  \n}\n",
			"[2,[[1,0]]]", "true", "[2,[[1,0],[0,1]]]", "false", "[3,[[1,0],[2,1]]]", "true", "[1,[]]", "true", "[3,[[0,1],[1,2],[2,0]]]", "false"))
}

func dsaComponents() Item {
	return dsa("dsa-components", "Connected components in a graph",
		`### Problem
Return how many connected components an undirected graph with `+"`n`"+` nodes and the given `+"`edges`"+` has.

### Examples
`+"```"+`
countComponents(5, [[0, 1], [1, 2], [3, 4]])  ->  2
countComponents(3, [])  ->  3
`+"```"+`

### Aim for
DFS from every unvisited node, or union-find. Try both.`,
		practice("countComponents", "function countComponents(n, edges) {\n  \n}\n",
			"[5,[[0,1],[1,2],[3,4]]]", "2", "[5,[[0,1],[1,2],[2,3],[3,4]]]", "1", "[3,[]]", "3", "[4,[[0,1],[2,3],[1,0]]]", "2"))
}

func dsaOranges() Item {
	return dsa("dsa-oranges", "Rotting oranges",
		`### Problem
In `+"`grid`"+`, 0 is empty, 1 is a fresh orange and 2 is rotten. Every minute, fresh oranges next to a rotten one (up, down, left or right) rot. Return the minutes until none are fresh, or -1 if some never rot.

### Examples
`+"```"+`
orangesRotting([[2,1,1],[1,1,0],[0,1,1]])  ->  4
orangesRotting([[2,1,1],[0,1,1],[1,0,1]])  ->  -1
`+"```"+`

### Aim for
Multi-source BFS, starting with every rotten orange in the queue.`,
		practice("orangesRotting", "function orangesRotting(grid) {\n  \n}\n",
			"[[[2,1,1],[1,1,0],[0,1,1]]]", "4", "[[[2,1,1],[0,1,1],[1,0,1]]]", "-1", "[[[0,2]]]", "0", "[[[1]]]", "-1"))
}

func dsaRob() Item {
	return dsa("dsa-rob", "House robber",
		`Dynamic programming week. Find the recurrence, then the order to fill it in.

### Problem
Each house has some money. You can't take from two neighbouring houses. Return the most you can take.

### Examples
`+"```"+`
rob([1, 2, 3, 1])  ->  4
rob([2, 7, 9, 3, 1])  ->  12
`+"```"+`

### Aim for
best(i) = max(best(i − 1), best(i − 2) + money[i]). O(n) time, O(1) space.`,
		practice("rob", "function rob(nums) {\n  \n}\n",
			"[[1,2,3,1]]", "4", "[[2,7,9,3,1]]", "12", "[[2,1,1,2]]", "4", "[[5]]", "5", "[[]]", "0"))
}

func dsaCoinChange() Item {
	return dsa("dsa-coin-change", "Coin change",
		`### Problem
Return the fewest coins from `+"`coins`"+` (unlimited of each) that add up to `+"`amount`"+`, or -1 if it can't be done.

### Examples
`+"```"+`
coinChange([1, 2, 5], 11)  ->  3   (5 + 5 + 1)
coinChange([2], 3)  ->  -1
`+"```"+`

### Aim for
dp[x] is the fewest coins for amount x. Fill it from 0 up. O(amount · coins).`,
		practice("coinChange", "function coinChange(coins, amount) {\n  \n}\n",
			"[[1,2,5],11]", "3", "[[2],3]", "-1", "[[1],0]", "0", "[[2,5,10,1],27]", "4", "[[186,419,83,408],6249]", "20"))
}

func dsaLIS() Item {
	return dsa("dsa-lis", "Longest increasing subsequence",
		`### Problem
Return the length of the longest strictly increasing subsequence of `+"`nums`"+`.

### Examples
`+"```"+`
lengthOfLIS([10, 9, 2, 5, 3, 7, 101, 18])  ->  4   (2, 3, 7, 101)
lengthOfLIS([7, 7, 7, 7])  ->  1
`+"```"+`

### Aim for
O(n²) DP first. Then look up the O(n log n) "patience sorting" approach.`,
		practice("lengthOfLIS", "function lengthOfLIS(nums) {\n  \n}\n",
			"[[10,9,2,5,3,7,101,18]]", "4", "[[0,1,0,3,2,3]]", "4", "[[7,7,7,7]]", "1", "[[1]]", "1"))
}

func dsaUniquePaths() Item {
	return dsa("dsa-unique-paths", "Unique paths in a grid",
		`### Problem
A robot starts at the top-left of an m × n grid and can only move right or down. How many different paths reach the bottom-right?

### Examples
`+"```"+`
uniquePaths(3, 7)  ->  28
uniquePaths(3, 2)  ->  3
`+"```"+`

### Aim for
paths(r, c) = paths(r − 1, c) + paths(r, c − 1). One row of DP is enough.`,
		practice("uniquePaths", "function uniquePaths(m, n) {\n  \n}\n",
			"[3,7]", "28", "[3,2]", "3", "[1,1]", "1", "[3,3]", "6", "[10,10]", "48620"))
}

func dsaLCS() Item {
	return dsa("dsa-lcs", "Longest common subsequence",
		`### Problem
Return the length of the longest subsequence the two strings share.

### Examples
`+"```"+`
longestCommonSubsequence("abcde", "ace")  ->  3
longestCommonSubsequence("abc", "def")  ->  0
`+"```"+`

### Aim for
A 2D table where cell (i, j) is the answer for the first i and j characters. O(n · m).`,
		practice("longestCommonSubsequence", "function longestCommonSubsequence(a, b) {\n  \n}\n",
			`["abcde","ace"]`, "3", `["abc","abc"]`, "3", `["abc","def"]`, "0", `["oxcpqrsvwf","shmtulqrypy"]`, "2"))
}

func dsaWordBreak() Item {
	return dsa("dsa-word-break", "Word break",
		`### Problem
Return true if `+"`s`"+` can be split into a sequence of words from `+"`words`"+` (each word can be used any number of times).

### Examples
`+"```"+`
wordBreak("leetcode", ["leet", "code"])  ->  true
wordBreak("catsandog", ["cats", "dog", "sand", "and", "cat"])  ->  false
`+"```"+`

### Aim for
ok[i] means the first i characters can be split. O(n²) with a Set of words.`,
		practice("wordBreak", "function wordBreak(s, words) {\n  \n}\n",
			`["leetcode",["leet","code"]]`, "true", `["applepenapple",["apple","pen"]]`, "true", `["catsandog",["cats","dog","sand","and","cat"]]`, "false", `["a",["b"]]`, "false"))
}

func dsaDecodeWays() Item {
	return dsa("dsa-decode-ways", "Decode ways",
		`### Problem
Letters are encoded as numbers, A is 1, B is 2 and so on up to Z, 26. Given a string of digits, return how many ways it can be decoded.

### Examples
`+"```"+`
numDecodings("12")  ->  2    ("AB" or "L")
numDecodings("226")  ->  3
numDecodings("06")  ->  0
`+"```"+`

### Aim for
Like climbing stairs, but a step is only allowed when its one or two digits make a valid letter.`,
		practice("numDecodings", "function numDecodings(s) {\n  \n}\n",
			`["12"]`, "2", `["226"]`, "3", `["06"]`, "0", `["11106"]`, "2", `["10"]`, "1"))
}
