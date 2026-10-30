(function bootTrianglePractice() {
  "use strict";

  const solver = globalThis.TriangleMazeSolver;

  if (!solver) {
    throw new Error("TriangleMazeSolver is required before app.js");
  }

  const generator = globalThis.TriangleMazeGenerator;
  const CONFIG = {
    totalLevels: 5,
    totalMs: 5 * 60 * 1000,
    bestRateKey: "triangle-maze-practice-best-rate"
  };

  const state = {
    phase: "intro",
    roundIndex: -1,
    rows: 14,
    perLevel: 5,
    levelIndex: 0,
    endedLevels: 0,
    remainingMs: CONFIG.totalMs,
    deadline: 0,
    timerId: null,
    questions: [],
    playerPath: [],
    results: []
  };

  const elements = {
    rowsSelect: document.getElementById("rowsSelect"),
    countSelect: document.getElementById("countSelect"),
    settingsSummary: document.getElementById("settingsSummary"),
    exitBtn: document.getElementById("exitBtn"),
    settingsBtn: document.getElementById("settingsBtn"),
    questionValue: document.getElementById("questionValue"),
    roundTrack: document.getElementById("roundTrack"),
    timerCard: document.getElementById("timerCard"),
    timerValue: document.getElementById("timerValue"),
    sessionScoreValue: document.getElementById("sessionScoreValue"),
    bestRateValue: document.getElementById("bestRateValue"),
    roundLabel: document.getElementById("roundLabel"),
    boardTitle: document.getElementById("boardTitle"),
    difficultyBadge: document.getElementById("difficultyBadge"),
    boardInstruction: document.getElementById("boardInstruction"),
    introPanel: document.getElementById("introPanel"),
    mazeWrap: document.getElementById("mazeWrap"),
    mazeSvg: document.getElementById("mazeSvg"),
    startBtn: document.getElementById("startBtn"),
    captureValue: document.getElementById("captureValue"),
    pathProgressValue: document.getElementById("pathProgressValue"),
    submitBtn: document.getElementById("submitBtn"),
    undoBtn: document.getElementById("undoBtn"),
    resetRoundBtn: document.getElementById("resetRoundBtn"),
    skipBtn: document.getElementById("skipBtn"),
    statusBox: document.getElementById("statusBox"),
    feedbackCard: document.getElementById("feedbackCard"),
    feedbackTitle: document.getElementById("feedbackTitle"),
    feedbackText: document.getElementById("feedbackText"),
    feedbackScoreValue: document.getElementById("feedbackScoreValue"),
    feedbackScoreLabel: document.getElementById("feedbackScoreLabel"),
    nextBtn: document.getElementById("nextBtn"),
    summaryModal: document.getElementById("summaryModal"),
    summaryRateValue: document.getElementById("summaryRateValue"),
    summaryMessage: document.getElementById("summaryMessage"),
    completedValue: document.getElementById("completedValue"),
    summaryCaptureValue: document.getElementById("summaryCaptureValue"),
    remainingValue: document.getElementById("remainingValue"),
    summaryRounds: document.getElementById("summaryRounds"),
    restartBtn: document.getElementById("restartBtn"),
    closeSummaryBtn: document.getElementById("closeSummaryBtn")
  };

  init();

  function init() {
    elements.rowsSelect.innerHTML = Array.from({ length: 21 }, (_, index) => {
      const rows = index + 5;
      return '<option value="' + rows + '"' + (rows === 14 ? ' selected' : '') + '>' + rows + ' 行</option>';
    }).join("");
    bindEvents();
    updateSettings();
    renderRoundTrack();
    renderTimer();
    renderBestRate();
    exposeTestApi();

    const query = new URLSearchParams(window.location.search);
    if (query.get("autostart") === "1") {
      startSession();
    }
  }

  function bindEvents() {
    elements.rowsSelect.addEventListener("change", updateSettings);
    elements.countSelect.addEventListener("change", updateSettings);
    elements.exitBtn.addEventListener("click", exitSession);
    elements.settingsBtn.addEventListener("click", returnToSettings);
    elements.startBtn.addEventListener("click", startSession);
    elements.submitBtn.addEventListener("click", submitRound);
    elements.undoBtn.addEventListener("click", undoStep);
    elements.resetRoundBtn.addEventListener("click", resetRoundPath);
    elements.skipBtn.addEventListener("click", skipRound);
    elements.nextBtn.addEventListener("click", goToNextRound);
    elements.restartBtn.addEventListener("click", startSession);
    elements.closeSummaryBtn.addEventListener("click", returnToSettings);

    elements.mazeSvg.addEventListener("click", function handleMazeClick(event) {
      const node = event.target.closest(".maze-node");
      if (!node) {
        return;
      }
      selectNode(Number(node.dataset.row), Number(node.dataset.col));
    });

    elements.mazeSvg.addEventListener("keydown", function handleMazeKeydown(event) {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      const node = event.target.closest(".maze-node");
      if (!node) {
        return;
      }
      event.preventDefault();
      selectNode(Number(node.dataset.row), Number(node.dataset.col));
    });
  }

  function updateSettings() {
    const rows = Number(elements.rowsSelect.value);
    state.rows = Number.isInteger(rows) && rows >= 5 && rows <= 25 ? rows : 14;
    state.perLevel = Number(elements.countSelect.value) === 10 ? 10 : 5;
    elements.settingsSummary.textContent = "共 5 关 · 每关 " + state.perLevel + " 题 · 总计 " + totalRounds() + " 题";
    renderBestRate();
  }

  function totalRounds() { return CONFIG.totalLevels * state.perLevel; }
  function levelEndIndex() { return (state.levelIndex + 1) * state.perLevel - 1; }
  function progressLabel(index) {
    return "第 " + (Math.floor(index / state.perLevel) + 1) + " 关 · 第 " + (index % state.perLevel + 1) + " / " + state.perLevel + " 题";
  }

  function startLevelTimer() {
    stopTimer();
    state.remainingMs = CONFIG.totalMs;
    state.deadline = performance.now() + CONFIG.totalMs;
    renderTimer();
    state.timerId = window.setInterval(updateTimer, 200);
  }

  function startSession() {
    stopTimer();
    updateSettings();
    state.phase = "playing";
    state.roundIndex = 0;
    state.levelIndex = 0;
    state.endedLevels = 0;
    state.remainingMs = CONFIG.totalMs;
    state.questions = generator.generateSession(state.rows, state.perLevel, globalThis.TriangleMazeQuestionBank);
    state.playerPath = [];
    state.results = [];
    state.deadline = performance.now() + CONFIG.totalMs;

    elements.summaryModal.hidden = true;
    elements.introPanel.hidden = true;
    elements.mazeWrap.hidden = false;
    elements.feedbackCard.hidden = true;
    document.body.classList.remove("modal-open");

    startRound();
    startLevelTimer();
  }

  function startRound() {
    const question = currentQuestion();
    state.phase = "playing";
    state.playerPath = [{ row: 1, col: 1 }];
    elements.feedbackCard.hidden = true;

    elements.roundLabel.textContent = progressLabel(state.roundIndex) + "（共 5 关）";
    elements.boardTitle.textContent = question.rows + " 行三角迷阵";
    elements.difficultyBadge.textContent = question.difficulty;
    elements.boardInstruction.textContent = "从顶点出发，每一层选择左下或右下节点。本题只有一条最优路线。";

    setStatus("顶点已选中。观察全局，再点击第二层的可选节点。", "info");
    renderAll();
  }

  function selectNode(row, col) {
    if (state.phase !== "playing") {
      return;
    }

    const available = getAvailableNodes();
    const isAvailable = available.some(function matchNode(node) {
      return node.row === row && node.col === col;
    });

    if (!isAvailable) {
      return;
    }

    state.playerPath.push({ row: row, col: col });
    renderAll();

    if (state.playerPath.length === currentQuestion().rows) {
      setStatus("路线已到达最底行，可以提交本题；也可以撤销后重选。", "success");
    } else {
      setStatus("继续选择下一层。蓝色虚线圈标出了当前可走的两个节点。", "info");
      focusFirstAvailableNode();
    }
  }

  function undoStep() {
    if (state.phase !== "playing" || state.playerPath.length <= 1) {
      return;
    }
    state.playerPath.pop();
    renderAll();
    setStatus("已撤销一步。", "info");
    focusFirstAvailableNode();
  }

  function resetRoundPath() {
    if (state.phase !== "playing") {
      return;
    }
    state.playerPath = [{ row: 1, col: 1 }];
    renderAll();
    setStatus("本题路径已重置。", "info");
    focusFirstAvailableNode();
  }

  function submitRound() {
    updateTimer();
    if (state.phase !== "playing") {
      return;
    }
    if (state.playerPath.length !== currentQuestion().rows) {
      setStatus("请先让路径到达最底行。", "warning");
      return;
    }
    recordAndReviewRound(false, false);
  }

  function skipRound() {
    updateTimer();
    if (state.phase !== "playing") {
      return;
    }
    recordAndReviewRound(true, false);
  }

  function recordAndReviewRound(skipped, timedOut) {
    const question = currentQuestion();
    const completePath = state.playerPath.length === question.rows;
    const captured = !skipped && completePath ? scorePath(question.grid, state.playerPath) : 0;
    const result = {
      roundIndex: state.roundIndex,
      captured: captured,
      optimal: question.solution.score,
      completed: !skipped && completePath,
      skipped: skipped,
      timedOut: timedOut,
      playerPath: state.playerPath.slice()
    };

    if (resultForRound(state.roundIndex)) { return; }
    state.results.push(result);

    if (timedOut) {
      return result;
    }

    state.phase = "feedback";
    elements.feedbackCard.hidden = false;
    elements.feedbackScoreLabel.textContent = "本题捕获";
    elements.feedbackScoreValue.textContent = captured + " / " + question.solution.score;

    if (skipped) {
      elements.feedbackTitle.textContent = "本题已跳过";
      elements.feedbackText.textContent = "绿色虚线是本题唯一的最优路线。快速观察它经过的发光点分布。";
    } else if (captured === question.solution.score) {
      elements.feedbackTitle.textContent = "最优路径！";
      elements.feedbackText.textContent = "你拿到了本题全部可获得分数。重合部分以金色显示。";
    } else {
      const gap = question.solution.score - captured;
      elements.feedbackTitle.textContent = "还差 " + gap + " 个发光点";
      elements.feedbackText.textContent = "蓝线是你的路线，绿色虚线是唯一最优路线。重点比较第一次分叉的位置。";
    }

    elements.nextBtn.textContent = "下一题";
    setStatus("复盘后进入下一题，本关倒计时仍在继续。", "info");
    if (state.roundIndex === levelEndIndex()) {
      completeLevel(false);
    } else {
      renderAll();
    }
  }

  function completeLevel(timedOut) {
    if (!["playing", "feedback"].includes(state.phase)) { return; }
    if (timedOut && state.phase === "playing") { recordAndReviewRound(false, true); }
    state.remainingMs = timedOut ? 0 : Math.max(0, state.deadline - performance.now());
    stopTimer();
    state.endedLevels = state.levelIndex + 1;
    state.phase = "levelComplete";
    const results = state.results.filter(result => Math.floor(result.roundIndex / state.perLevel) === state.levelIndex);
    const completed = results.filter(result => result.completed).length;
    const captured = results.reduce((sum, result) => sum + result.captured, 0);
    const optimal = results.reduce((sum, result) => sum + result.optimal, 0);
    elements.feedbackCard.hidden = false;
    elements.feedbackScoreLabel.textContent = "本关已作答捕获";
    elements.feedbackTitle.textContent = "第 " + (state.levelIndex + 1) + " 关" + (timedOut ? "时间到" : "结束");
    elements.feedbackText.textContent = "完成 " + completed + " / " + state.perLevel + " 题。计时已暂停，可以休息或退出；下一关重新计时 5 分钟。";
    elements.feedbackScoreValue.textContent = captured + " / " + optimal;
    elements.nextBtn.textContent = state.levelIndex === CONFIG.totalLevels - 1 ? "查看总成绩" : "开始第 " + (state.levelIndex + 2) + " 关";
    if (state.levelIndex === CONFIG.totalLevels - 1) {
      elements.feedbackText.textContent = "5 关练习结束。可查看本题路线及总成绩。";
    }
    setStatus("本关已结束，计时已暂停。", "success");
    renderAll();
  }

  function goToNextRound() {
    if (state.phase === "levelComplete") {
      if (state.levelIndex === CONFIG.totalLevels - 1) { finishSession("complete"); return; }
      state.levelIndex += 1;
      state.roundIndex = state.levelIndex * state.perLevel;
      startRound();
      startLevelTimer();
      return;
    }
    if (state.phase !== "feedback") { return; }
    updateTimer();
    if (state.phase !== "feedback") { return; }
    state.roundIndex += 1;
    startRound();
  }

  function updateTimer() {
    if (!["playing", "feedback"].includes(state.phase)) { return; }
    state.remainingMs = Math.max(0, state.deadline - performance.now());
    renderTimer();
    if (state.remainingMs <= 0) { completeLevel(true); }
  }

  function exitSession() {
    if (!["playing", "feedback", "levelComplete"].includes(state.phase)) { return; }
    finishSession("exit");
  }

  function finishSession(reason) {
    if (state.phase === "finished") { return; }
    if (["playing", "feedback"].includes(state.phase)) {
      state.remainingMs = Math.max(0, state.deadline - performance.now());
    }
    stopTimer();
    state.phase = "finished";
    elements.feedbackCard.hidden = true;
    setStatus("本次练习已结束，可返回设置开始新的练习。", "info");
    renderAll();
    showSummary(reason);
  }

  function showSummary(reason) {
    const captured = totalCaptured();
    const optimal = totalOptimal();
    const rate = optimal ? captured / optimal : 0;
    const completed = state.results.filter(result => result.completed).length;
    if (completed === totalRounds()) { saveBestRate(rate); }
    renderBestRate();
    elements.summaryRateValue.textContent = optimal ? formatPercent(rate) : "—";
    elements.completedValue.textContent = completed + " / " + totalRounds();
    elements.summaryCaptureValue.textContent = captured + " / " + optimal;
    elements.remainingValue.textContent = formatTime(state.remainingMs);
    elements.summaryMessage.textContent = (reason === "exit" ? "已中途退出。" : "5 关练习结束。")
      + " 已结束 " + state.endedLevels + " / 5 关，已作答 " + state.results.length + " 题。捕获率仅统计已提交、跳过或超时结算的题目；未提交的当前题不计分。";
    elements.summaryRounds.innerHTML = buildSummaryRounds();
    elements.summaryModal.hidden = false;
    document.body.classList.add("modal-open");
    elements.restartBtn.focus();
  }

  function returnToSettings() {
    stopTimer();
    closeSummary();
    state.phase = "intro";
    state.roundIndex = -1;
    state.levelIndex = 0;
    state.endedLevels = 0;
    state.remainingMs = CONFIG.totalMs;
    state.questions = [];
    state.playerPath = [];
    state.results = [];
    elements.introPanel.hidden = false;
    elements.mazeWrap.hidden = true;
    elements.feedbackCard.hidden = true;
    elements.roundLabel.textContent = "练习设置";
    elements.boardTitle.textContent = "规划一条得分最高的路径";
    elements.difficultyBadge.textContent = "规则";
    elements.boardInstruction.textContent = "选择行数和每关题量，每题只有一条最优路径。";
    setStatus("设置完成后开始练习，每关限时 5 分钟。", "info");
    renderAll();
    elements.rowsSelect.focus();
  }

  function closeSummary() {
    elements.summaryModal.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function renderAll() {
    elements.exitBtn.hidden = !["playing", "feedback", "levelComplete"].includes(state.phase);
    elements.settingsBtn.hidden = state.phase !== "finished";
    renderHeader();
    renderRoundTrack();
    renderTimer();
    renderRoundControls();
    renderMaze();
  }

  function renderHeader() {
    if (state.phase === "intro") {
      elements.questionValue.textContent = "准备开始";
      elements.sessionScoreValue.textContent = "0 / —";
      return;
    }

    elements.questionValue.textContent = progressLabel(state.roundIndex);
    elements.sessionScoreValue.textContent = totalCaptured() + " / " + totalOptimal();
  }

  function renderRoundTrack() {
    const markup = [];

    for (let index = 0; index < CONFIG.totalLevels; index += 1) {
      const classes = ["round-pip"];
      if (state.phase !== "intro" && state.phase !== "finished" && index === state.levelIndex) { classes.push("is-current"); }
      if (index < state.endedLevels) { classes.push("is-done"); }
      markup.push('<span class="' + classes.join(" ") + '" title="第 ' + (index + 1) + ' 关">' + (index + 1) + '</span>');
    }
    elements.roundTrack.innerHTML = markup.join("");
  }

  function renderTimer() {
    elements.timerValue.textContent = formatTime(state.remainingMs);
    elements.timerCard.classList.toggle("is-warning", state.remainingMs <= 60 * 1000 && ["playing", "feedback"].includes(state.phase));
  }

  function renderRoundControls() {
    if (state.phase === "intro") {
      elements.captureValue.textContent = "0";
      elements.pathProgressValue.textContent = "0 / 0";
      setControlAvailability(false);
      return;
    }

    const question = currentQuestion();
    const pathScore = scorePath(question.grid, state.playerPath);
    const isPlaying = state.phase === "playing";
    const isComplete = state.playerPath.length === question.rows;

    elements.captureValue.textContent = String(pathScore);
    elements.pathProgressValue.textContent = state.playerPath.length + " / " + question.rows;
    elements.submitBtn.disabled = !isPlaying || !isComplete;
    elements.undoBtn.disabled = !isPlaying || state.playerPath.length <= 1;
    elements.resetRoundBtn.disabled = !isPlaying || state.playerPath.length <= 1;
    elements.skipBtn.disabled = !isPlaying;
  }

  function setControlAvailability(enabled) {
    elements.submitBtn.disabled = !enabled;
    elements.undoBtn.disabled = !enabled;
    elements.resetRoundBtn.disabled = !enabled;
    elements.skipBtn.disabled = !enabled;
  }

  function renderMaze() {
    if (state.phase === "intro" || !state.questions.length) {
      return;
    }

    const question = currentQuestion();
    const layout = computeLayout(question.rows);
    const playerNodes = new Set(state.playerPath.map(nodeKey));
    const playerEdges = buildEdgeSet(state.playerPath);
    const showOptimal = state.phase === "feedback" || state.phase === "levelComplete" || state.phase === "finished";
    const optimalPath = showOptimal ? question.solution.path : [];
    const optimalNodes = new Set(optimalPath.map(nodeKey));
    const optimalEdges = buildEdgeSet(optimalPath);
    const availableNodes = new Set(getAvailableNodes().map(nodeKey));
    const edges = [];
    const nodes = [];

    question.grid.forEach(function renderRow(rowNodes, rowIndex) {
      rowNodes.forEach(function renderNode(node) {
        const point = layout.coordinates[rowIndex][node.col - 1];

        if (rowIndex < question.rows - 1) {
          const leftChild = question.grid[rowIndex + 1][node.col - 1];
          const rightChild = question.grid[rowIndex + 1][node.col];
          edges.push(edgeMarkup(node, leftChild, point, layout.coordinates[rowIndex + 1][node.col - 1], playerEdges, optimalEdges));
          edges.push(edgeMarkup(node, rightChild, point, layout.coordinates[rowIndex + 1][node.col], playerEdges, optimalEdges));
        }

        nodes.push(nodeMarkup(node, point, layout.radius, playerNodes, optimalNodes, availableNodes));
      });
    });

    elements.mazeSvg.style.minWidth = layout.width + "px";
    elements.mazeSvg.setAttribute("viewBox", "0 0 " + layout.width + " " + layout.height);
    elements.mazeSvg.setAttribute("aria-label", question.rows + " 行三角迷阵，第 " + (state.roundIndex + 1) + " 题");
    elements.mazeSvg.innerHTML = "<g class=\"maze-edges\">" + edges.join("") + "</g><g class=\"maze-nodes\">" + nodes.join("") + "</g>";
  }

  function computeLayout(rows) {
    const width = Math.max(520, (rows - 1) * 48 + 120);
    const height = Math.max(400, (rows - 1) * 36 + 120);
    const centerX = width / 2;
    const spacingX = (width - 120) / Math.max(1, rows - 1);
    const spacingY = (height - 120) / Math.max(1, rows - 1);
    const radius = rows >= 12 ? 11.5 : rows >= 8 ? 16 : 18;
    const coordinates = [];

    for (let row = 1; row <= rows; row += 1) {
      const rowPoints = [];
      for (let col = 1; col <= row; col += 1) {
        rowPoints.push({
          x: centerX + (col - (row + 1) / 2) * spacingX,
          y: 60 + (row - 1) * spacingY
        });
      }
      coordinates.push(rowPoints);
    }

    return { width: width, height: height, radius: radius, coordinates: coordinates };
  }

  function edgeMarkup(fromNode, toNode, fromPoint, toPoint, playerEdges, optimalEdges) {
    const key = edgeKey(fromNode, toNode);
    const isPlayer = playerEdges.has(key);
    const isOptimal = optimalEdges.has(key);
    const classes = ["maze-edge"];

    if (isPlayer && isOptimal) {
      classes.push("overlap-edge");
    } else if (isOptimal) {
      classes.push("optimal-edge");
    } else if (isPlayer) {
      classes.push("player-edge");
    }

    return "<line class=\"" + classes.join(" ") + "\" x1=\"" + fromPoint.x + "\" y1=\"" + fromPoint.y + "\" x2=\"" + toPoint.x + "\" y2=\"" + toPoint.y + "\"></line>";
  }

  function nodeMarkup(node, point, radius, playerNodes, optimalNodes, availableNodes) {
    const key = nodeKey(node);
    const isPlayer = playerNodes.has(key);
    const isOptimal = optimalNodes.has(key);
    const isAvailable = availableNodes.has(key);
    const classes = ["maze-node"];

    if (node.glowing) { classes.push("is-glow"); }
    if (isPlayer) { classes.push("is-player"); }
    if (isOptimal) { classes.push("is-optimal"); }
    if (isAvailable) { classes.push("is-available"); }

    const label = "第 " + node.row + " 行第 " + node.col + " 个节点，" + (node.glowing ? "发光点" : "普通点") + (isAvailable ? "，可选择" : "");
    const role = isAvailable ? "button" : "img";
    const tabIndex = isAvailable ? "0" : "-1";
    const scoreText = node.glowing ? "1" : "";

    return "<g class=\"" + classes.join(" ") + "\" data-row=\"" + node.row + "\" data-col=\"" + node.col + "\" role=\"" + role + "\" tabindex=\"" + tabIndex + "\" aria-label=\"" + label + "\">"
      + "<title>" + label + "</title>"
      + "<circle class=\"node-halo\" cx=\"" + point.x + "\" cy=\"" + point.y + "\" r=\"" + (radius + 12) + "\"></circle>"
      + "<circle class=\"node-target\" cx=\"" + point.x + "\" cy=\"" + point.y + "\" r=\"" + (radius + 9) + "\"></circle>"
      + "<circle class=\"node-core\" cx=\"" + point.x + "\" cy=\"" + point.y + "\" r=\"" + radius + "\"></circle>"
      + "<text class=\"node-score\" x=\"" + point.x + "\" y=\"" + point.y + "\">" + scoreText + "</text>"
      + "<circle class=\"node-hit\" cx=\"" + point.x + "\" cy=\"" + point.y + "\" r=\"" + (radius + 13) + "\"></circle>"
      + "</g>";
  }

  function getAvailableNodes() {
    if (state.phase !== "playing" || !state.playerPath.length) {
      return [];
    }

    const question = currentQuestion();
    if (state.playerPath.length >= question.rows) {
      return [];
    }

    const last = state.playerPath[state.playerPath.length - 1];
    return [
      { row: last.row + 1, col: last.col },
      { row: last.row + 1, col: last.col + 1 }
    ];
  }

  function focusFirstAvailableNode() {
    window.requestAnimationFrame(function focusNode() {
      const target = elements.mazeSvg.querySelector(".maze-node.is-available");
      if (target) {
        target.focus({ preventScroll: true });
      }
    });
  }

  function scorePath(grid, path) {
    return path.reduce(function addNode(total, node) {
      const gridNode = grid[node.row - 1] && grid[node.row - 1][node.col - 1];
      return total + (gridNode && gridNode.glowing ? 1 : 0);
    }, 0);
  }

  function buildEdgeSet(path) {
    const set = new Set();
    for (let index = 1; index < path.length; index += 1) {
      set.add(edgeKey(path[index - 1], path[index]));
    }
    return set;
  }

  function nodeKey(node) {
    return node.row + "-" + node.col;
  }

  function edgeKey(fromNode, toNode) {
    return nodeKey(fromNode) + "|" + nodeKey(toNode);
  }

  function currentQuestion() {
    return state.questions[state.roundIndex];
  }

  function resultForRound(index) {
    return state.results.find(function findResult(result) {
      return result.roundIndex === index;
    });
  }

  function totalCaptured() {
    return state.results.reduce(function addCaptured(total, result) {
      return total + result.captured;
    }, 0);
  }

  function totalOptimal() {
    return state.results.reduce(function addOptimal(total, question) {
      return total + question.optimal;
    }, 0);
  }

  function setStatus(message, type) {
    elements.statusBox.textContent = message;
    elements.statusBox.dataset.state = type || "info";
  }

  function formatTime(milliseconds) {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
  }

  function formatPercent(rate) {
    return Math.round(rate * 100) + "%";
  }

  function buildSummaryRounds() {
    const markup = [];

    for (let index = 0; index < totalRounds(); index += 1) {
      const result = resultForRound(index);
      const classes = ["summary-round"];
      let score = "未作答";

      if (result) {
        score = (result.skipped ? "跳过 " : result.timedOut ? "超时 " : "") + result.captured + "/" + result.optimal;
        if (result.completed && result.captured === result.optimal) {
          classes.push("is-perfect");
        }
      }

      markup.push("<div class=\"" + classes.join(" ") + "\">" + (Math.floor(index / state.perLevel) + 1) + "关 · " + (index % state.perLevel + 1) + "题<strong>" + score + "</strong></div>");
    }

    return markup.join("");
  }

  function renderBestRate() {
    const bestRate = readBestRate();
    elements.bestRateValue.textContent = bestRate === null ? "同设置完整练习最佳：—" : "同设置完整练习最佳：" + formatPercent(bestRate);
  }

  function bestRateKey() { return CONFIG.bestRateKey + "-v3-" + state.rows + "-" + state.perLevel; }

  function readBestRate() {
    try {
      const raw = window.localStorage.getItem(bestRateKey());
      if (raw === null) {
        return null;
      }
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    } catch (error) {
      return null;
    }
  }

  function saveBestRate(rate) {
    try {
      const current = readBestRate();
      if (current === null || rate > current) {
        window.localStorage.setItem(bestRateKey(), String(rate));
      }
    } catch (error) {
      // The game remains fully usable when browser storage is unavailable.
    }
  }

  function stopTimer() {
    if (state.timerId !== null) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function exposeTestApi() {
    globalThis.TriangleMazePractice = {
      startSession: startSession,
      getSnapshot: function getSnapshot() {
        return {
          phase: state.phase,
          rows: state.rows,
          perLevel: state.perLevel,
          levelIndex: state.levelIndex,
          endedLevels: state.endedLevels,
          resultCount: state.results.length,
          roundIndex: state.roundIndex,
          questionCount: state.questions.length,
          playerPathLength: state.playerPath.length,
          remainingMs: state.remainingMs,
          totalOptimal: totalOptimal(),
          difficultyScores: state.questions.map(question => question.metrics.difficultyScore),
          uniqueOptimalCounts: state.questions.map(function getCount(question) {
            return question.optimalPathCount;
          })
        };
      }
    };
  }
}());
