// script.js
// Word Pair game logic: pick a valid set, split into pairs (2 letters each),
// render 9 draggable tiles; drag them into 3x 4-letter boxes (front/back)
// and 1x 6-letter box (front/center/back). Validate solution (4-letter words may be in any order).

const state = {
  set: null,            // chosen puzzle set: { words: [...] }
  tiles: [],            // [{id, text}] 9 total; each text is like "ST"
  placement: new Map(), // slotEl -> tileId
  origin: new Map(),    // tileId -> parentEl (rack or slot) for revert
};

const rackEl = document.getElementById("rack");
const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const newBtn = document.getElementById("newPuzzleBtn");
const winDialog = document.getElementById("winDialog");
const solutionText = document.getElementById("solutionText");

// --- Utilities ---
function shuffle(arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function pairsOf(word){
  const up = word.toUpperCase();
  const out = [];
  for (let i = 0; i < up.length; i += 2){
    out.push(up.slice(i, i + 2));
  }
  return out;
}
function isValidSet(words){
  if (!Array.isArray(words) || words.length !== 4) return false;
  const lens = words.map(w => (w||"").toString().trim().toUpperCase().length);
  const count4 = lens.filter(l => l === 4).length;
  const count6 = lens.filter(l => l === 6).length;
  // Also ensure strictly letters A-Z
  const allLetters = words.every(w => /^[A-Za-z]+$/.test((w||"").toString().trim()));
  return count4 === 3 && count6 === 1 && allLetters;
}
function chooseValidSet(pools, maxTries = 200){
  for (let i = 0; i < maxTries; i++){
    const pick = pools[Math.floor(Math.random() * pools.length)];
    if (pick && isValidSet(pick.words)) return { words: pick.words.map(w => w.toUpperCase()) };
  }
  throw new Error("No valid puzzle set found. Check words.js formatting.");
}
function announce(msg){ statusEl.textContent = msg; }

// --- Drag & Drop ---
// We use native HTML5 DnD with dataTransfer carrying the tile id.
function onDragStart(e){
  const tile = e.currentTarget;
  tile.classList.add("dragging");
  e.dataTransfer.setData("text/plain", tile.dataset.id);
  e.dataTransfer.effectAllowed = "move";
}
function onDragEnd(e){
  e.currentTarget.classList.remove("dragging");
}
function onDragOverSlot(e){
  e.preventDefault(); // allow drop
  e.currentTarget.classList.add("dragover");
}
function onDragLeaveSlot(e){
  e.currentTarget.classList.remove("dragover");
}
function onDropToSlot(e){
  e.preventDefault();
  const slot = e.currentTarget;
  slot.classList.remove("dragover");

  // Enforce: slot may contain at most 1 tile
  if (slot.firstElementChild){ return; }

  const id = e.dataTransfer.getData("text/plain");
  const tile = document.querySelector(`.tile[data-id="${CSS.escape(id)}"]`);
  if (!tile) return;

  // Remove from previous parent (rack or slot)
  const prevParent = tile.parentElement;
  if (prevParent && prevParent.classList.contains("slot")){
    prevParent.classList.remove("filled");
    state.placement.delete(prevParent);
  }

  slot.appendChild(tile);
  slot.classList.add("filled");
  state.placement.set(slot, id);
  state.origin.set(id, slot);

  checkSolved();
}
function onDragOverRack(e){
  e.preventDefault();
}
function onDropToRack(e){
  e.preventDefault();
  const id = e.dataTransfer.getData("text/plain");
  const tile = document.querySelector(`.tile[data-id="${CSS.escape(id)}"]`);
  if (!tile) return;

  const prevParent = tile.parentElement;
  if (prevParent && prevParent.classList.contains("slot")){
    prevParent.classList.remove("filled");
    state.placement.delete(prevParent);
  }
  rackEl.appendChild(tile);
  state.origin.set(id, rackEl);
  checkSolved(); // not solved, but keeps UI status tidy
}

// --- Rendering ---
function clearBoard(){
  rackEl.innerHTML = "";
  document.querySelectorAll(".slot").forEach(s => {
    s.innerHTML = "";
    s.classList.remove("filled","dragover");
  });
  state.placement.clear();
  state.origin.clear();
}

function renderTiles(tiles){
  // Create tile elements and place them in the rack
  rackEl.innerHTML = "";
  tiles.forEach(t => {
    const el = document.createElement("div");
    el.className = "tile";
    el.draggable = true;
    el.textContent = t.text;
    el.dataset.id = t.id;
    el.addEventListener("dragstart", onDragStart);
    el.addEventListener("dragend", onDragEnd);
    rackEl.appendChild(el);
    state.origin.set(t.id, rackEl);
  });
}

function wireDropZones(){
  // Rack accepts any tile (many children)
  rackEl.addEventListener("dragover", onDragOverRack);
  rackEl.addEventListener("drop", onDropToRack);

  // Each slot accepts at most one tile
  document.querySelectorAll(".slot").forEach(slot => {
    slot.addEventListener("dragover", onDragOverSlot);
    slot.addEventListener("dragleave", onDragLeaveSlot);
    slot.addEventListener("drop", onDropToSlot);
  });
}

// --- Game setup ---
function buildTilesFromSet(setWords){
  const words4 = setWords.filter(w => w.length === 4);
  const word6  = setWords.find(w => w.length === 6);

  // Split into 2-letter chunks
  const tiles = [
    ...pairsOf(words4[0]),
    ...pairsOf(words4[1]),
    ...pairsOf(words4[2]),
    ...pairsOf(word6),
  ].map((text, i) => ({ id: String(i+1), text })); // 9 total

  return shuffle(tiles);
}

function currentArrangement(){
  // Read each word box's slots left-to-right
  const boxes = [...document.querySelectorAll(".word-box")];
  const assembled = boxes.map(box => {
    const slots = [...box.querySelectorAll(".slot")];
    const word = slots.map(s => s.firstElementChild ? s.firstElementChild.textContent : "").join("");
    return word; // may be "" if incomplete
  });
  return assembled;
}

function arraysEqualAsMultiset(a, b){
  if (a.length !== b.length) return false;
  const counts = new Map();
  for (const v of a){ counts.set(v, (counts.get(v)||0)+1); }
  for (const v of b){
    const n = counts.get(v) || 0;
    if (n === 0) return false;
    counts.set(v, n-1);
  }
  return true;
}

function checkSolved(){
  const setWords = state.set.words;
  const target4 = setWords.filter(w => w.length === 4).sort();
  const target6 = setWords.find(w => w.length === 6);

  const assembled = currentArrangement();
  const [w4a, w4b, w4c, w6] = [
    assembled[0], assembled[1], assembled[2], assembled[3]
  ];

  // If any slot empty, not solved yet
  if (w4a.length !== 4 || w4b.length !== 4 || w4c.length !== 4 || w6.length !== 6){
    announce("Drag pairs into the boxes. 4-letter words can be in any order.");
    return false;
  }

  const built4Sorted = [w4a, w4b, w4c].sort();
  const fourOK = arraysEqualAsMultiset(built4Sorted, target4);
  const sixOK  = (w6 === target6);

  if (fourOK && sixOK){
    announce("Great job! Puzzle solved.");
    solutionText.textContent = `Solution: ${target4.join(", ")} + ${target6}`;
    try { winDialog.showModal(); } catch { alert(`Solved! ${target4.join(", ")} + ${target6}`); }
    return true;
  } else {
    announce("Not quite yet—keep adjusting the tiles.");
    return false;
  }
}

function newPuzzle(){
  clearBoard();

  // Choose and validate a set
  state.set = chooseValidSet(PUZZLES);
  const tiles = buildTilesFromSet(state.set.words);
  state.tiles = tiles;

  renderTiles(tiles);
  wireDropZones();

  // Accessibility/status
  announce("New puzzle ready. Fill three 4-letter words (any order) and one 6-letter word.");
}

// --- Boot ---
newBtn.addEventListener("click", newPuzzle);
window.addEventListener("DOMContentLoaded", newPuzzle);
