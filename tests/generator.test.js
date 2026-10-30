const test = require("node:test");
const assert = require("node:assert/strict");
const {performance} = require("node:perf_hooks");
const generator = require("../generator.js");
const solver = require("../solver.js");
const bank = require("../question-bank.js");

function rng(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function validateQuestion(question) {
  const {grid, rows, solution} = question;
  const counted = solver.countOptimalPaths(grid);
  assert.equal(counted.count, 1);
  assert.equal(counted.score, solution.score);
  let run = 0, longest = 0, blanks = 0;
  for (const node of solution.path) {
    const light = grid[node.row - 1][node.col - 1].glowing;
    run = light ? run + 1 : 0;
    if (!light) blanks++;
    longest = Math.max(longest, run);
  }
  assert.ok(longest <= 3, "no long glowing answer chain");
  assert.ok(blanks >= Math.max(2, Math.ceil(rows * .25)), "optimum contains substantial unlit steps");
  assert.ok(question.metrics.greedyGap >= 1);
  assert.ok(question.metrics.traps >= 1);
  assert.ok(question.metrics.decoys >= 3);
}

test("every stored board passes hard quality gates and has a unique optimum", () => {
  let total = 0;
  for (let rows = 5; rows <= 25; rows++) {
    assert.ok(bank[rows].length >= 50);
    assert.equal(new Set(bank[rows]).size, bank[rows].length);
    for (const encoded of bank[rows]) {
      assert.equal(encoded.length, rows * (rows + 1) / 2);
      assert.match(encoded, /^[01]+$/);
      const bits = generator.decode(encoded, rows), metrics = generator.analyze(bits);
      assert.ok(metrics, `invalid ${rows}-row question`);
      const grid = solver.createGrid(rows);
      grid.forEach((row, r) => row.forEach((node,c) => node.glowing = Boolean(bits[r][c])));
      validateQuestion({rows, grid, metrics, solution:solver.solveOptimalPath(grid)});
      total++;
    }
  }
  console.log(`Validated ${total} stored questions.`);
});

test("brute force independently proves that chasing lights cannot win, even with optimal tie breaks", () => {
  for (const rows of [5, 6, 8, 10]) {
    for (const text of bank[rows].filter((_,i)=>i%7===0)) {
      const bits = generator.decode(text, rows), metrics = generator.analyze(bits);
      let best = -1, bestCount = 0, greedyBest = -1;
      for (let mask = 0; mask < 2 ** (rows-1); mask++) {
        let col = 0, score = bits[0][0], greedy = true;
        for (let row = 1; row < rows; row++) {
          const dir = (mask >>> (row - 1)) & 1;
          if (bits[row][col + dir] < bits[row][col + 1 - dir]) greedy = false;
          col += dir; score += bits[row][col];
        }
        if (score > best) {best = score;bestCount = 1;} else if (score === best) bestCount++;
        if (greedy) greedyBest = Math.max(greedyBest, score);
      }
      assert.equal(bestCount, 1);
      assert.equal(best, metrics.score);
      assert.ok(greedyBest < best);
      assert.equal(best - greedyBest, metrics.greedyGap);
    }
  }
});

test("randomized sessions preserve constraints, distinct boards, and nondecreasing difficulty across all settings", () => {
  let total = 0, maxGenerationMs = 0;
  for (let rows = 5; rows <= 25; rows++) for (const perLevel of [5,10]) for (const seed of [7,123456]) {
    const start = performance.now();
    const questions = generator.generateSession(rows, perLevel, bank, rng(seed));
    maxGenerationMs = Math.max(maxGenerationMs, performance.now()-start);
    assert.equal(questions.length, perLevel*5);
    const keys = new Set();
    questions.forEach((question,index) => {
      validateQuestion(question);
      const bits = question.grid.map(row=>row.map(node=>+node.glowing));
      const metrics = generator.analyze(bits);
      assert.equal(metrics.difficultyScore, question.metrics.difficultyScore);
      const key = rows === 5 ? generator.encode(bits) : generator.canonical(bits);
      assert.ok(!keys.has(key), "no repeated board in a session");keys.add(key);
      assert.ok(question.difficulty.startsWith(`第 ${Math.floor(index/perLevel)+1} 关`));
      if (index) assert.ok(question.metrics.difficultyScore >= questions[index-1].metrics.difficultyScore);
    });
    assert.ok(questions.at(-1).metrics.difficultyScore > questions[0].metrics.difficultyScore);
    total += questions.length;
  }
  console.log(`Validated ${total} randomized questions; slowest session generation ${maxGenerationMs.toFixed(0)} ms.`);
});

test("the previous all-lit-path fallback is rejected", () => {
  const bits = Array.from({length:25},(_,r)=>Array.from({length:r+1},(_,c)=>+(c===0)));
  assert.equal(generator.analyze(bits), null);
});
