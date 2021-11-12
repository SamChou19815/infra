type SimplifiedCommitNode = { readonly hash: string; readonly parents: readonly string[] };

type CommitChain<C extends SimplifiedCommitNode> = {
  readonly value: C;
  readonly parent: CommitChain<C>;
  readonly size: number;
} | null;

type ChainRange = { readonly start: number; readonly end: number };

function rangeNoOverlap(r1: ChainRange, r2: ChainRange): boolean {
  return r2.end < r1.start || r1.end < r2.start;
}

/** Assign each commit a column to put the graph node */
export default function gitGraphSlotAssignment<C extends SimplifiedCommitNode>(
  gitCommits: readonly C[]
): readonly (C & { readonly columnId: number })[] {
  const hashToCommitMap = Object.fromEntries(gitCommits.map((it) => [it.hash, it]));
  const hashToOrderMap = Object.fromEntries(gitCommits.map((it, index) => [it.hash, index]));
  const memoized = new Map<string, CommitChain<C>>();
  const visited = new Set<string>();

  function formChainMemoized(commit: C): CommitChain<C> {
    const existing = memoized.get(commit.hash);
    if (existing != null) return existing;
    const chain = formChain(commit);
    memoized.set(commit.hash, chain);
    return chain;
  }

  // Greedy: connect to the node that has the longest chain so far.
  function formChain(commit: C): CommitChain<C> {
    const chainCandidates: CommitChain<C>[] = [];
    commit.parents.forEach((parentHash) => {
      if (visited.has(parentHash)) return;
      const commitOfHash = hashToCommitMap[parentHash];
      if (commitOfHash == null) return;
      chainCandidates.push(formChainMemoized(commitOfHash));
    });
    let bestChain: CommitChain<C> = null;
    for (const chain of chainCandidates) {
      if ((chain?.size ?? 0) > (bestChain?.size ?? 0)) {
        bestChain = chain;
      }
    }
    return { value: commit, parent: bestChain, size: (bestChain?.size ?? 0) + 1 };
  }

  type ChainWithRange = { readonly chain: readonly C[]; readonly range: ChainRange };
  const chainsWithRange: ChainWithRange[] = [];
  gitCommits.forEach((commit) => {
    if (visited.has(commit.hash)) return;
    let chain = formChainMemoized(commit);
    const linearizedChain: C[] = [];
    let start = Number.MAX_SAFE_INTEGER;
    let end = Number.MIN_SAFE_INTEGER;
    while (chain != null) {
      const node = chain.value;
      const hash = node.hash;
      const order = hashToOrderMap[hash];
      start = Math.min(start, order);
      end = Math.max(end, order);
      linearizedChain.push(node);
      visited.add(hash);
      chain = chain.parent;
    }
    chainsWithRange.push({ chain: linearizedChain, range: { start, end } });
    memoized.clear();
  });

  // Greedy: find the first fitting column without range overlap
  /** ranges[i] stores all ranges that can be stored in i-th column without overlap */
  const ranges: ChainRange[][] = [];
  const chainsWithColumnAssignment: (C & { readonly columnId: number })[][] = [];
  chainsWithRange.forEach(({ chain, range }) => {
    for (let i = 0; i < ranges.length; i += 1) {
      const candidateRangesSlot = ranges[i];
      if (candidateRangesSlot.every((r) => rangeNoOverlap(range, r))) {
        candidateRangesSlot.push(range);
        chainsWithColumnAssignment.push(chain.map((it) => ({ ...it, columnId: i })));
        return;
      }
    }
    // No current fitting column, create a new column
    chainsWithColumnAssignment.push(chain.map((it) => ({ ...it, columnId: ranges.length })));
    ranges.push([range]);
  });

  return chainsWithColumnAssignment
    .flat()
    .sort((a, b) => hashToOrderMap[a.hash] - hashToOrderMap[b.hash]);
}
