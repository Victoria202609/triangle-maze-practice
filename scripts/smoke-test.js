const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawn } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const chromePath = findChromeExecutable();

test("UI smoke test", async () => {
  const server = await startStaticServer(root);
  const chrome = await startChrome();
  let page = null;

  try {
    page = await openPage(chrome.port, `${server.origin}/index.html`);

    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await delay(1200);

    let apiReady = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      apiReady = await evaluateValue(page, "typeof TriangleMazePractice === 'object'");
      if (apiReady) {
        break;
      }
      await delay(100);
    }
    assert.equal(apiReady, true);

    const snapshot = () => evaluateValue(page, "TriangleMazePractice.getSnapshot()");
    const domClick = selector => evaluateValue(page, `document.querySelector(${JSON.stringify(selector)}).click()`);
    assert.equal(await evaluateValue(page, 'document.querySelectorAll("#rowsSelect option").length'), 21);
    assert.equal(await evaluateValue(page, 'document.getElementById("timerValue").textContent'), "05:00");

    // Play 5-row questions through all five levels, including a real mouse path.
    await setSelect(page, "#rowsSelect", "5");
    await click(page, "#startBtn");
    let state = await snapshot();
    assert.equal(state.questionCount, 25);
    assert.deepEqual(state.uniqueOptimalCounts, Array(25).fill(1));
    assert.equal(await evaluateValue(page, 'document.querySelectorAll(".maze-node").length'), 15);
    for (let step = 0; step < 4; step++) { await click(page, ".maze-node.is-available .node-core"); }
    assert.equal((await snapshot()).playerPathLength, 5);
    await click(page, "#undoBtn");
    assert.equal((await snapshot()).playerPathLength, 4);
    await click(page, ".maze-node.is-available .node-core");
    await click(page, "#submitBtn");
    assert.equal((await snapshot()).phase, "feedback");
    assert.equal(await evaluateValue(page, 'document.querySelectorAll(".optimal-edge, .overlap-edge").length'), 4);
    for (let level = 0; level < 5; level++) {
      for (let question = level === 0 ? 1 : 0; question < 5; question++) {
        if (question > 0) { await domClick("#nextBtn"); }
        await domClick("#skipBtn");
      }
      state = await snapshot();
      assert.equal(state.phase, "levelComplete");
      assert.equal(state.endedLevels, level + 1);
      const remaining = state.remainingMs;
      await delay(260);
      assert.equal((await snapshot()).remainingMs, remaining, "level break must pause clock");
      await domClick("#nextBtn");
      if (level < 4) {
        state = await snapshot();
        assert.equal(state.levelIndex, level + 1);
        assert.equal(state.roundIndex, (level + 1) * 5);
        assert.ok(state.remainingMs > 299000, "next level starts with five minutes");
      }
    }
    assert.equal((await snapshot()).phase, "finished");
    assert.equal((await snapshot()).resultCount, 25);
    assert.equal(await evaluateValue(page, 'document.querySelectorAll(".summary-round").length'), 25);
    await click(page, "#closeSummaryBtn");
    assert.equal((await snapshot()).phase, "intro");

    // Upper size and 10 questions: exercise every row with actual hit testing.
    await setSelect(page, "#rowsSelect", "25");
    await setSelect(page, "#countSelect", "10");
    await click(page, "#startBtn");
    state = await snapshot();
    assert.equal(state.questionCount, 50);
    assert.deepEqual(state.uniqueOptimalCounts, Array(50).fill(1));
    assert.equal(await evaluateValue(page, 'document.querySelectorAll(".maze-node").length'), 325);
    for (let step = 0; step < 24; step++) { await click(page, ".maze-node.is-available .node-core"); }
    assert.equal((await snapshot()).playerPathLength, 25);
    await click(page, "#submitBtn");
    for (let question = 1; question < 10; question++) {
      await domClick("#nextBtn");
      await domClick("#skipBtn");
    }
    assert.equal((await snapshot()).phase, "levelComplete");
    assert.equal((await snapshot()).resultCount, 10);
    await domClick("#nextBtn");
    assert.equal((await snapshot()).roundIndex, 10);

    // Expiry completes only this level, counts the current question once, and resets next level.
    await evaluateValue(page, 'window.originalNow = performance.now.bind(performance); performance.now = () => originalNow() + 300001');
    await delay(300);
    state = await snapshot();
    assert.equal(state.phase, "levelComplete");
    assert.equal(state.resultCount, 11);
    assert.equal(state.remainingMs, 0);
    await delay(260);
    assert.equal((await snapshot()).resultCount, 11);
    await evaluateValue(page, 'performance.now = window.originalNow');
    await domClick("#nextBtn");
    assert.equal((await snapshot()).roundIndex, 20);
    assert.ok((await snapshot()).remainingMs > 299000);
    await domClick("#skipBtn");
    await domClick("#exitBtn");
    state = await snapshot();
    assert.equal(state.phase, "finished");
    assert.equal(state.resultCount, 12);
    const stopped = state.remainingMs;
    await delay(260);
    assert.equal((await snapshot()).remainingMs, stopped);
    assert.equal(await evaluateValue(page, 'document.querySelectorAll(".summary-round").length'), 50);
    await domClick("#restartBtn");
    assert.equal((await snapshot()).resultCount, 0);
    assert.equal((await snapshot()).rows, 25);
    await domClick("#exitBtn");
    assert.equal(await evaluateValue(page, 'document.querySelector("#summaryRateValue").textContent'), "—");
    await domClick("#closeSummaryBtn");

    // Every supported row count must generate exclusively unique optimal paths.
    for (let rows = 5; rows <= 25; rows++) {
      await setSelect(page, "#rowsSelect", String(rows));
      await setSelect(page, "#countSelect", "5");
      await domClick("#startBtn");
      state = await snapshot();
      assert.equal(state.rows, rows);
      assert.deepEqual(state.uniqueOptimalCounts, Array(25).fill(1));
      assert.equal(await evaluateValue(page, 'document.querySelectorAll(".maze-node").length'), rows * (rows + 1) / 2);
      await domClick("#exitBtn");
      await domClick("#closeSummaryBtn");
    }

    // Small viewport keeps the page within the screen; the large maze scrolls internally.
    await page.send("Emulation.setDeviceMetricsOverride", {width: 390, height: 844, deviceScaleFactor: 1, mobile: false});
    await setSelect(page, "#rowsSelect", "25");
    await domClick("#startBtn");
    assert.equal(await evaluateValue(page, 'document.documentElement.scrollWidth <= window.innerWidth'), true);
    assert.equal(await evaluateValue(page, 'document.querySelector(".maze-wrap").scrollWidth > document.querySelector(".maze-wrap").clientWidth'), true);
    for (let step = 0; step < 24; step++) { await click(page, ".maze-node.is-available .node-core"); }
    assert.equal((await snapshot()).playerPathLength, 25);
    await domClick("#submitBtn");
    // A timeout during review must not record the same question twice.
    await evaluateValue(page, 'performance.now = () => originalNow() + 300001');
    await delay(300);
    assert.equal((await snapshot()).resultCount, 1);
    assert.equal((await snapshot()).phase, "levelComplete");
    await domClick("#exitBtn");
    assert.equal((await snapshot()).phase, "finished");
    console.log("Verified 5–25 rows, 5/10 questions, all 5 levels, unique solutions, pause/reset timers, timeouts, exit/restart, and mobile hit targets.");

  } finally {
    if (page) {
      page.ws.close();
    }
    await chrome.close();
    await server.close();
  }
});

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("Chrome executable not found. Set CHROME_PATH if needed.");
}

function startStaticServer(baseDir) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    let relativePath = decodeURIComponent(url.pathname);

    if (relativePath === "/") {
      relativePath = "/index.html";
    }

    const filePath = path.join(baseDir, relativePath);

    if (!filePath.startsWith(baseDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.statusCode = 404;
      response.end("Not Found");
      return;
    }

    response.setHeader("Content-Type", getContentType(filePath));
    fs.createReadStream(filePath).pipe(response);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done, fail) => server.close((error) => error ? fail(error) : done()))
      });
    });
  });
}

function startChrome() {
  const port = 9222 + Math.floor(Math.random() * 400);
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "triangle-maze-test-"));
  const child = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--window-size=1440,1180",
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${port}`,
    "about:blank"
  ], {
    windowsHide: true,
    stdio: "ignore"
  });

  return waitForChrome(port)
    .then(() => ({
      port,
      close: async () => {
        child.kill("SIGTERM");
        await delay(500);
        try {
          fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
        } catch (error) {
          // A lingering browser subprocess can briefly retain the disposable profile on Windows.
        }
      }
    }))
    .catch((error) => {
      child.kill("SIGTERM");
      try {
        fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      } catch (cleanupError) {
        // Ignore cleanup failure for the disposable browser profile.
      }
      throw error;
    });
}

async function waitForChrome(port) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);

      if (response.ok) {
        return;
      }
    } catch (error) {
      // Retry.
    }

    await delay(150);
  }

  throw new Error("Chrome remote debugging endpoint did not start.");
}

async function openPage(port, url) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT"
  });

  if (!response.ok) {
    throw new Error(`Failed to open page: ${response.status}`);
  }

  const target = await response.json();
  return attachToTarget(target.webSocketDebuggerUrl);
}

async function attachToTarget(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let id = 0;

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (!message.id) {
      return;
    }

    const handler = pending.get(message.id);

    if (!handler) {
      return;
    }

    pending.delete(message.id);

    if (message.error) {
      handler.reject(new Error(message.error.message));
      return;
    }

    handler.resolve(message.result || {});
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  return {
    ws,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const messageId = ++id;
        pending.set(messageId, { resolve, reject });
        ws.send(JSON.stringify({ id: messageId, method, params }));
      });
    }
  };
}

function evaluateValue(page, expression) {
  return page.send("Runtime.evaluate", {
    expression,
    returnByValue: true
  }).then((result) => {
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception
        && result.exceptionDetails.exception.description;
      throw new Error(description || result.exceptionDetails.text || "Browser evaluation failed.");
    }
    return result.result.value;
  });
}

function click(page, selector) {
  return page.send("Runtime.evaluate", {
    expression: `
      (() => {
        const node = document.querySelector(${JSON.stringify(selector)});
        if (!node) {
          throw new Error("Missing selector: ${selector}");
        }
        node.scrollIntoView({ block: "center", inline: "center" });
        const rect = node.getBoundingClientRect();
        return [rect.left + rect.width / 2, rect.top + rect.height / 2];
      })()
    `,
    returnByValue: true
  }).then(({ result }) => {
    const point = result.value;
    if (!Array.isArray(point) || point.length !== 2) {
      throw new Error(`Unable to resolve selector click point: ${selector}`);
    }
    return page.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: point[0],
      y: point[1],
      button: "left",
      clickCount: 1
    }).then(() => page.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: point[0],
      y: point[1],
      button: "left",
      clickCount: 1
    }));
  });
}

function clickSvgNode(page, nodeKey) {
  return page.send("Runtime.evaluate", {
    expression: `
      (() => {
        const circle = document.querySelector(${JSON.stringify(`[data-node-key="${nodeKey}"] .node-core`)});
        const svg = document.getElementById("mazeSvg");
        if (!circle || !svg) {
          throw new Error("Missing SVG node: ${nodeKey}");
        }
        const rect = svg.getBoundingClientRect();
        const viewBox = svg.viewBox.baseVal;
        const cx = Number(circle.getAttribute("cx"));
        const cy = Number(circle.getAttribute("cy"));
        return [
          rect.left + (cx / viewBox.width) * rect.width,
          rect.top + (cy / viewBox.height) * rect.height
        ];
      })()
    `,
    returnByValue: true
  }).then(({ result }) => {
    const point = result.value;
    if (!Array.isArray(point) || point.length !== 2) {
      throw new Error(`Unable to resolve SVG node click point: ${nodeKey}`);
    }
    return page.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: point[0],
      y: point[1],
      button: "left",
      clickCount: 1
    }).then(() => page.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: point[0],
      y: point[1],
      button: "left",
      clickCount: 1
    }));
  });
}

function setValue(page, selector, value) {
  return page.send("Runtime.evaluate", {
    expression: `
      (() => {
        const input = document.querySelector(${JSON.stringify(selector)});
        if (!input) {
          throw new Error("Missing selector: ${selector}");
        }
        input.value = ${JSON.stringify(value)};
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      })()
    `
  });
}

function setSelect(page, selector, value) {
  return page.send("Runtime.evaluate", {
    expression: `
      (() => {
        const select = document.querySelector(${JSON.stringify(selector)});
        if (!select) {
          throw new Error("Missing selector: ${selector}");
        }
        select.value = ${JSON.stringify(value)};
        select.dispatchEvent(new Event("change", { bubbles: true }));
      })()
    `
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getContentType(filePath) {
  const ext = path.extname(filePath);
  const map = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml"
  };

  return map[ext] || "application/octet-stream";
}
