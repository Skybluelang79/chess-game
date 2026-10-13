(function () {
  "use strict";

  const PIECES = {
    wp: "\u2659", wn: "\u2658", wb: "\u2657", wr: "\u2656", wq: "\u2655", wk: "\u2654",
    bp: "\u265F", bn: "\u265E", bb: "\u265D", br: "\u265C", bq: "\u265B", bk: "\u265A"
  };

  const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const boardEl = document.getElementById("board");
  const turnEl = document.getElementById("turn");
  const turnTextEl = document.getElementById("turnText");
  const statusEl = document.getElementById("status");
  const historyEl = document.getElementById("history");
  const restartBtn = document.getElementById("restart");
  const promoModal = document.getElementById("promoModal");
  const promoChoices = document.getElementById("promoChoices");

  let game = new Chess();
  let selected = null;
  let legalTargets = [];
  let lastMove = null;
  let squareEls = {};
  let pendingPromotion = null;

  function squareColor(fileIndex, rankIndex) {
    return (fileIndex + rankIndex) % 2 === 0 ? "light" : "dark";
  }

  function buildBoard() {
    boardEl.innerHTML = "";
    squareEls = {};
    for (let rankIndex = 0; rankIndex < 8; rankIndex++) {
      for (let fileIndex = 0; fileIndex < 8; fileIndex++) {
        const square = FILES[fileIndex] + (8 - rankIndex);
        const el = document.createElement("div");
        el.className = "square " + squareColor(fileIndex, rankIndex);
        el.dataset.square = square;
        el.addEventListener("click", function () { onSquareClick(square); });

        if (rankIndex === 7) {
          const f = document.createElement("span");
          f.className = "coord file";
          f.textContent = FILES[fileIndex];
          el.appendChild(f);
        }
        if (fileIndex === 0) {
          const r = document.createElement("span");
          r.className = "coord rank";
          r.textContent = String(8 - rankIndex);
          el.appendChild(r);
        }

        squareEls[square] = el;
        boardEl.appendChild(el);
      }
    }
  }

  function render() {
    for (const square in squareEls) {
      const el = squareEls[square];
      el.classList.remove("selected", "last", "in-check");
      el.querySelectorAll(".piece, .dot, .ring").forEach(function (n) { n.remove(); });
    }

    const board = game.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = board[r][c];
        if (!cell) continue;
        const square = FILES[c] + (8 - r);
        const el = squareEls[square];
        const span = document.createElement("span");
        span.className = "piece " + cell.color;
        span.textContent = PIECES[cell.color + cell.type];
        el.appendChild(span);
      }
    }

    if (lastMove) {
      [lastMove.from, lastMove.to].forEach(function (sq) {
        if (squareEls[sq]) squareEls[sq].classList.add("last");
      });
    }

    if (selected && squareEls[selected]) {
      squareEls[selected].classList.add("selected");
      legalTargets.forEach(function (target) {
        const el = squareEls[target.to];
        if (!el) return;
        if (target.captured || target.flags.indexOf("e") !== -1) {
          const ring = document.createElement("span");
          ring.className = "ring";
          el.appendChild(ring);
        } else {
          const dot = document.createElement("span");
          dot.className = "dot";
          el.appendChild(dot);
        }
      });
    }

    if (game.in_check()) {
      const kingColor = game.turn();
      for (const square in squareEls) {
        const cell = game.get(square);
        if (cell && cell.type === "k" && cell.color === kingColor) {
          squareEls[square].classList.add("in-check");
        }
      }
    }
  }

  function updateTurn() {
    const white = game.turn() === "w";
    turnEl.className = "turn " + (white ? "white" : "black");
    turnTextEl.textContent = white ? "White to move" : "Black to move";
  }

  function updateStatus() {
    statusEl.classList.remove("win");
    if (game.in_checkmate()) {
      const winner = game.turn() === "w" ? "Black" : "White";
      statusEl.textContent = "Checkmate! " + winner + " wins.";
      statusEl.classList.add("win");
    } else if (game.in_stalemate()) {
      statusEl.textContent = "Stalemate. It's a draw.";
    } else if (game.in_threefold_repetition()) {
      statusEl.textContent = "Draw by threefold repetition.";
    } else if (game.insufficient_material()) {
      statusEl.textContent = "Draw by insufficient material.";
    } else if (game.in_draw()) {
      statusEl.textContent = "Draw.";
    } else if (game.in_check()) {
      statusEl.textContent = (game.turn() === "w" ? "White" : "Black") + " is in check!";
    } else {
      statusEl.textContent = "Select a piece to move.";
    }
  }

  function updateHistory() {
    const verbose = game.history({ verbose: true });
    historyEl.innerHTML = "";
    if (verbose.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "No moves yet.";
      historyEl.appendChild(li);
      return;
    }
    for (let i = 0; i < verbose.length; i += 2) {
      const li = document.createElement("li");
      const num = document.createElement("span");
      num.className = "num";
      num.textContent = (i / 2 + 1) + ".";
      const w = document.createElement("span");
      w.textContent = verbose[i].san;
      const b = document.createElement("span");
      b.textContent = verbose[i + 1] ? verbose[i + 1].san : "";
      li.appendChild(num);
      li.appendChild(w);
      li.appendChild(b);
      historyEl.appendChild(li);
    }
    historyEl.scrollTop = historyEl.scrollHeight;
  }

  function refresh() {
    render();
    updateTurn();
    updateStatus();
    updateHistory();
  }

  function onSquareClick(square) {
    if (game.game_over()) return;

    const piece = game.get(square);

    if (selected) {
      const target = legalTargets.find(function (m) { return m.to === square; });
      if (target) {
        attemptMove(selected, square);
        return;
      }
    }

    if (piece && piece.color === game.turn()) {
      selected = square;
      legalTargets = game.moves({ square: square, verbose: true });
    } else {
      selected = null;
      legalTargets = [];
    }
    render();
  }

  function attemptMove(from, to) {
    const moves = game.moves({ square: from, verbose: true });
    const candidates = moves.filter(function (m) { return m.to === to; });

    if (candidates.length === 0) return;

    const needsPromotion = candidates.some(function (m) {
      return m.flags.indexOf("p") !== -1;
    });

    if (needsPromotion) {
      pendingPromotion = { from: from, to: to };
      openPromotion();
      return;
    }

    commitMove(from, to, null);
  }

  function commitMove(from, to, promotion) {
    const move = game.move({ from: from, to: to, promotion: promotion || "q" });
    if (!move) return;
    selected = null;
    legalTargets = [];
    lastMove = { from: move.from, to: move.to };
    refresh();
  }

  function openPromotion() {
    promoChoices.innerHTML = "";
    const color = game.turn();
    ["q", "r", "b", "n"].forEach(function (type) {
      const btn = document.createElement("button");
      btn.textContent = PIECES[color + type];
      btn.addEventListener("click", function () {
        promoModal.classList.remove("open");
        const p = pendingPromotion;
        pendingPromotion = null;
        commitMove(p.from, p.to, type);
      });
      promoChoices.appendChild(btn);
    });
    promoModal.classList.add("open");
  }

  function restart() {
    game = new Chess();
    selected = null;
    legalTargets = [];
    lastMove = null;
    pendingPromotion = null;
    promoModal.classList.remove("open");
    refresh();
  }

  restartBtn.addEventListener("click", restart);
  promoModal.addEventListener("click", function (e) {
    if (e.target === promoModal) {
      promoModal.classList.remove("open");
      pendingPromotion = null;
    }
  });

  buildBoard();
  refresh();
})();
