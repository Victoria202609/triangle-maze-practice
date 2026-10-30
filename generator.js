(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./solver.js"));
  else root.TriangleMazeGenerator = factory(root.TriangleMazeSolver);
}(globalThis, function (solver) {
  "use strict";
  const labels = ["观察比较", "识别诱饵", "多步判断", "深层比较", "综合挑战"];

  // Evaluate the actual decisions on the unique optimum, not just light density.
  function analyze(bits) {
    const n = bits.length, best = [], counts = [], greedy = [], distributions = [];
    for (let r = n - 1; r >= 0; r--) {
      best[r] = []; counts[r] = []; greedy[r] = [];
      for (let c = 0; c <= r; c++) {
        const v = bits[r][c];
        if (r === n - 1) { best[r][c] = v; counts[r][c] = 1; greedy[r][c] = v; continue; }
        const a = best[r + 1][c], b = best[r + 1][c + 1];
        best[r][c] = v + Math.max(a, b);
        counts[r][c] = a === b ? Math.min(2, counts[r + 1][c] + counts[r + 1][c + 1]) : counts[r + 1][c + (b > a)];
        const va = bits[r + 1][c], vb = bits[r + 1][c + 1];
        // Give a greedy player the BEST possible tie break. A positive gap proves
        // that even lucky tie breaks cannot solve this board by chasing lights.
        greedy[r][c] = v + (va === vb ? Math.max(greedy[r + 1][c], greedy[r + 1][c + 1]) : greedy[r + 1][c + (vb > va)]);
      }
    }
    if (counts[0][0] !== 1) return null;
    let c = 0, run = 0, maxRun = 0, traps = 0, ambiguous = 0, competitive = 0;
    const path = [];
    for (let r = 0; r < n; r++) {
      path.push(c); run = bits[r][c] ? run + 1 : 0; maxRun = Math.max(maxRun, run);
      if (r < n - 1) {
        const next = c + (best[r + 1][c + 1] > best[r + 1][c]), other = 2 * c + 1 - next;
        if (bits[r + 1][next] < bits[r + 1][other]) traps++;
        if (bits[r + 1][next] === bits[r + 1][other]) ambiguous++;
        if (best[r + 1][next] - best[r + 1][other] === 1) competitive++;
        c = next;
      }
    }
    const score = best[0][0], greedyGap = score - greedy[0][0];
    const decoys = bits.flat().reduce((sum, value) => sum + value, 0) - score;
    if (maxRun > 3 || traps < 1 || greedyGap < 1 || n - score < Math.max(2, Math.ceil(n * .25)) || decoys < 3) return null;

    // At each fork, measure how far one must look before the correct branch
    // stays strictly better at every longer horizon (ties also require thought).
    const horizons = [null, bits.map(row => row.slice())];
    for (let depth = 2; depth <= n; depth++) {
      horizons[depth] = bits.map((row, r) => row.map((value, col) =>
        r === n - 1 ? value : value + Math.max(horizons[depth - 1][r + 1][col], horizons[depth - 1][r + 1][col + 1])));
    }
    let lookahead = 0, deepest = 1;
    for (let r = 0; r < n - 1; r++) {
      const next = path[r + 1], other = 2 * path[r] + 1 - next;
      let needed = 1;
      for (let depth = 1; depth <= n - r - 1; depth++) {
        if (horizons[depth][r + 1][next] <= horizons[depth][r + 1][other]) needed = depth + 1;
      }
      lookahead += needed - 1; deepest = Math.max(deepest, needed);
    }
    // Count routes just one point below optimum: these are real competing answers.
    for (let r = n - 1; r >= 0; r--) {
      distributions[r] = [];
      for (let col = 0; col <= r; col++) {
        const result = Array(n + 1).fill(0), value = bits[r][col];
        if (r === n - 1) result[value] = 1;
        else for (let k = 0; k < n; k++) result[k + value] += distributions[r + 1][col][k] + distributions[r + 1][col + 1][k];
        distributions[r][col] = result;
      }
    }
    const nearPaths = distributions[0][0][score - 1];
    const difficultyScore = lookahead * 4 + traps * 5 + ambiguous * 2 + competitive + Math.log2(1 + nearPaths);
    return { score, maxRun, traps, ambiguous, competitive, greedyGap, decoys, lookahead, deepest, nearPaths, difficultyScore, path };
  }

  function encode(bits) { return bits.map(row => row.join("")).join(""); }
  function decode(text, rows) {
    let offset = 0;
    return Array.from({ length: rows }, (_, r) => {
      const row = Array.from(text.slice(offset, offset + r + 1), Number); offset += r + 1; return row;
    });
  }
  function canonical(bits) {
    const normal = encode(bits), mirror = encode(bits.map(row => row.slice().reverse()));
    return normal < mirror ? normal : mirror;
  }
  function shuffle(items, random) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function generateSession(rows, perLevel, bank, random = Math.random) {
    if (!Number.isInteger(rows) || rows < 5 || rows > 25 || ![5, 10].includes(perLevel)) throw new RangeError("Unsupported practice settings");
    const entries = bank[rows].map(text => {
      const bits = decode(text, rows), metrics = analyze(bits);
      if (!metrics) throw new Error("Question bank failed quality validation");
      return { bits, metrics };
    }).sort((a, b) => a.metrics.difficultyScore - b.metrics.difficultyScore);
    const selected = [], seen = new Set();
    const identity = rows === 5 ? encode : canonical;
    for (let level = 0; level < 5; level++) {
      const band = entries.slice(Math.floor(level * entries.length / 5), Math.floor((level + 1) * entries.length / 5));
      if (band.length < perLevel) throw new Error("Insufficient validated questions");
      const low = band[0].metrics.difficultyScore, high = band[band.length - 1].metrics.difficultyScore;
      for (const original of shuffle(band, random).slice(0, perLevel)) {
        let bits = original.bits.map(row => row.slice()), metrics = original.metrics;
        // Mutations only survive when all quality checks AND the difficulty band hold.
        for (let attempt = 0; attempt < 12; attempt++) {
          const trial = bits.map(row => row.slice());
          const r = 1 + Math.floor(random() * (rows - 1)), c = Math.floor(random() * (r + 1));
          trial[r][c] ^= 1;
          const candidate = analyze(trial), key = identity(trial);
          if (candidate && candidate.difficultyScore >= low && candidate.difficultyScore <= high && !seen.has(key)) {
            bits = trial; metrics = candidate;
          }
        }
        if (seen.has(identity(bits))) { bits = original.bits.map(row => row.slice()); metrics = original.metrics; }
        // On a rare mutation collision, use an unused original from this band.
        if (seen.has(identity(bits))) {
          const unused = band.find(entry => !seen.has(identity(entry.bits)));
          if (!unused) throw new Error("No distinct question available");
          bits = unused.bits.map(row => row.slice()); metrics = unused.metrics;
        }
        seen.add(identity(bits));
        if (rows > 5 && random() < .5) bits = bits.map(row => row.slice().reverse());
        const grid = solver.createGrid(rows);
        grid.forEach((row, r) => row.forEach((node, c) => { node.glowing = Boolean(bits[r][c]); }));
        const solution = solver.solveOptimalPath(grid);
        selected.push({ rows, grid, solution, optimalPathCount: solver.countOptimalPaths(grid).count,
          difficulty: "第 " + (level + 1) + " 关 · " + labels[level], metrics });
      }
    }
    // Difficulty never decreases, including within a level. Ties are intentional
    // on small boards where five distinct human difficulty tiers are impossible.
    return selected.sort((a, b) => a.metrics.difficultyScore - b.metrics.difficultyScore);
  }
  return { analyze, encode, decode, canonical, generateSession };
}));
