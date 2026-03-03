
const CONTAINER_HEADER = 38;
const CONTAINER_PADDING = 14;
const MIN_NODE_WIDTH = 180;
const MAX_NODE_WIDTH = 460;
const MIN_NODE_HEIGHT = 96;
const MAX_NODE_HEIGHT = 320;
const BODY_TEXT_PAD_X = 20;
const BODY_TEXT_PAD_Y = 18;
const BODY_TEXT_LINE_HEIGHT = 18;
const HEADER_ESTIMATE = 42;
const COLLAPSED_ROW_ESTIMATE = 34;
const measureCanvas = document.createElement("canvas");
const measureCtx = measureCanvas.getContext("2d");

let graph ={
  "nodes": [
    {
      "id": "0001",
      "label": "Target_name",
      "emoji": "◈",
      "x": 39,
      "y": 178,
      "width": 180,
      "height": 96,
      "note": "The only functional Brain Cell",
      "parentId": null,
      "collapsed": false,
      "manualSize": false
    },
    {
      "id": "node_1772218365943",
      "label": "Pre-engagement Interactions",
      "emoji": "◈",
      "x": 388,
      "y": 71,
      "width": 286,
      "height": 96,
      "note": "",
      "parentId": null,
      "collapsed": false,
      "manualSize": true
    },
    {
      "id": "node_1772218475150",
      "label": "Information & Intelligence Gathering",
      "emoji": "🧐",
      "x": 384,
      "y": 234,
      "width": 342,
      "height": 100,
      "note": "",
      "parentId": null,
      "collapsed": false,
      "manualSize": true
    },
    {
      "id": "node_1772218515680",
      "label": "Search Engine Reconnaissance",
      "emoji": "🌐",
      "x": 809,
      "y": 102,
      "width": 350,
      "height": 217,
      "note": "",
      "parentId": null,
      "collapsed": false,
      "manualSize": true
    },
    {
      "id": "node_1772218544574",
      "label": "Googel Dorking",
      "emoji": "◈",
      "x": 1217,
      "y": 108,
      "width": 180,
      "height": 96,
      "note": "",
      "parentId": null,
      "collapsed": true,
      "manualSize": false
    },
    {
      "id": "node_1772218624735",
      "label": "SHODAN Recon",
      "emoji": "🔍︎",
      "x": 1274,
      "y": 241,
      "width": 180,
      "height": 96,
      "note": "",
      "parentId": null,
      "collapsed": true,
      "manualSize": false
    },
    {
      "id": "node_1772218643052",
      "label": "Archive & Wayback Machine",
      "emoji": "🔍︎",
      "x": 1234,
      "y": 368,
      "width": 200,
      "height": 96,
      "note": "",
      "parentId": null,
      "collapsed": true,
      "manualSize": false
    },
    {
      "id": "node_1772218693179",
      "label": "Fingerprint Web Server",
      "emoji": "◈",
      "x": 842,
      "y": 371,
      "width": 180,
      "height": 96,
      "note": "",
      "parentId": null,
      "collapsed": false,
      "manualSize": false
    }
  ],
  "edges": [
    {
      "from": "0001",
      "to": "node_1772218365943",
      "label": "flow"
    },
    {
      "from": "0001",
      "to": "node_1772218475150",
      "label": "flow"
    },
    {
      "from": "node_1772218475150",
      "to": "node_1772218515680",
      "label": "flow"
    },
    {
      "from": "node_1772218515680",
      "to": "node_1772218544574",
      "label": "flow"
    },
    {
      "from": "node_1772218515680",
      "to": "node_1772218624735",
      "label": "flow"
    },
    {
      "from": "node_1772218515680",
      "to": "node_1772218643052",
      "label": "flow"
    },
    {
      "from": "node_1772218475150",
      "to": "node_1772218693179",
      "label": "flow"
    }
  ]
};

let selectedNodeId = null;
let dragging = null;
let resizing = null;
let panning = null;
const view = { x: 0, y: 0, scale: 1 };
const LEVEL_COLORS = ["#7e73e3", "#56a9f2", "#4acaa8", "#f4bf63", "#ea8f8f", "#8ea2cb"];
const STORAGE_GRAPH_KEY = "graph";
const STORAGE_THEME_KEY = "theme";
const AUTO_SAVE_MS = 800;
let lastSavedGraphSnapshot = "";


function nodeById(id) {
  return graph.nodes.find(n => n.id === id);
}

function childrenOf(id) {
  return graph.nodes.filter(n => n.parentId === id);
}

function descendantsOf(id) {
  const result = [];
  const stack = [id];
  while (stack.length) {
    const next = stack.pop();
    const kids = childrenOf(next);
    kids.forEach(k => {
      result.push(k.id);
      stack.push(k.id);
    });
  }
  return result;
}

function connectionParentId(node) {
  if (node.parentId) {
    return node.parentId;
  }
  const incoming = graph.edges.find(e => e.to === node.id && e.from !== node.id);
  return incoming ? incoming.from : null;
}

function isNodeVisible(node) {
  if (node.collapsed) {
    return false;
  }
  if (hasCollapsedUpstream(node.id)) {
    return false;
  }
  return true;
}

function incomingNodeIds(nodeId) {
  const ids = [];
  const node = nodeById(nodeId);
  if (!node) {
    return ids;
  }

  if (node.parentId) {
    ids.push(node.parentId);
  }

  graph.edges.forEach(edge => {
    if (edge.to === nodeId && edge.from !== nodeId) {
      ids.push(edge.from);
    }
  });

  return ids;
}

function hasCollapsedUpstream(nodeId, visited = new Set()) {
  if (visited.has(nodeId)) {
    return false;
  }
  visited.add(nodeId);

  const parents = incomingNodeIds(nodeId);
  for (let i = 0; i < parents.length; i += 1) {
    const parent = nodeById(parents[i]);
    if (!parent) {
      continue;
    }
    if (parent.collapsed) {
      return true;
    }
    if (hasCollapsedUpstream(parent.id, visited)) {
      return true;
    }
  }

  return false;
}

function isParentChainExpanded(node) {
  let current = node;
  while (current && current.parentId) {
    const parent = nodeById(current.parentId);
    if (!parent) {
      return true;
    }
    if (parent.collapsed) {
      return false;
    }
    current = parent;
  }
  return true;
}

function collapsedNodesForHost(hostId) {
  return graph.nodes.filter(n => n.collapsed && connectionParentId(n) === hostId);
}

function visibleNodes() {
  return graph.nodes.filter(n => isNodeVisible(n));
}

function hierarchyLevel(nodeId, visited = new Set()) {
  if (visited.has(nodeId)) {
    return 0;
  }
  visited.add(nodeId);

  const node = nodeById(nodeId);
  if (!node) {
    return 0;
  }

  const parentId = connectionParentId(node);
  if (!parentId) {
    return 0;
  }

  return 1 + hierarchyLevel(parentId, visited);
}

function levelColor(level) {
  return LEVEL_COLORS[level % LEVEL_COLORS.length];
}

function absolutePosition(node) {
  if (!node.parentId) {
    return { x: node.x, y: node.y };
  }
  const parent = nodeById(node.parentId);
  if (!parent) {
    return { x: node.x, y: node.y };
  }
  const p = absolutePosition(parent);
  return {
    x: p.x + CONTAINER_PADDING + node.x,
    y: p.y + CONTAINER_HEADER + CONTAINER_PADDING + node.y
  };
}

function absoluteRect(node) {
  const pos = absolutePosition(node);
  return { x: pos.x, y: pos.y, width: node.width, height: node.height };
}

function render() {
  graph.nodes.forEach(node => {
    if (!node.manualSize) {
      autoSizeNodeFromLabel(node);
    }
  });
  const root = document.getElementById("nodes");
  root.innerHTML = "";
  renderRootCollapsedTray();

  const roots = graph.nodes.filter(n => !n.parentId && isNodeVisible(n));
  roots.forEach(n => root.appendChild(createNodeEl(n)));

  renderEdges();
  updateStatus();
}

function renderRootCollapsedTray() {
  const tray = document.getElementById("collapsedRootTray");
  tray.innerHTML = "";
  const roots = graph.nodes.filter(n => n.collapsed && !connectionParentId(n));
  roots.forEach(node => tray.appendChild(createCollapsedPill(node)));
}

function createCollapsedPill(node) {
  const pill = document.createElement("div");
  pill.className = "collapsed-pill";

  const expandBtn = document.createElement("button");
  expandBtn.type = "button";
  expandBtn.title = "Expand node";
  expandBtn.textContent = "+";
  expandBtn.onclick = () => toggleCollapse(node.id);

  const text = document.createElement("span");
  text.textContent = node.label;

  pill.append(expandBtn, text);
  return pill;
}

function createNodeEl(node) {
  const el = document.createElement("div");
  el.className = "node";
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  el.style.width = `${node.width}px`;
  el.style.height = `${node.height}px`;
  el.style.setProperty("--level-color", levelColor(hierarchyLevel(node.id)));

  const header = document.createElement("div");
  header.className = "node-header";

  const symbol = document.createElement("div");
  symbol.className = "node-symbol";
  symbol.textContent = node.emoji || "◈";
  symbol.title = "Double-click to edit emoji";
  symbol.addEventListener("dblclick", e => {
    e.preventDefault();
    e.stopPropagation();
    startInlineTextEdit(symbol, node.emoji || "◈", value => {
      node.emoji = value || "◈";
      render();
    }, { fallbackValue: "◈", selectAll: true });
  });

  const actions = document.createElement("div");
  actions.className = "node-actions";

  const collapseBtn = iconBtn("➖", "Collapse node", () => toggleCollapse(node.id));
  const noteBtn = iconBtn("📃", "Notes", () => openNotes(node.id));
  const addBtn = iconBtn("➕", "Add Child", () => addChild(node.id));
  const delBtn = iconBtn("❌", "Delete", () => deleteNode(node.id), true);

  if (node.id === "agent") {
    actions.append(collapseBtn, noteBtn, addBtn);
  } else {
    actions.append(collapseBtn, noteBtn, addBtn, delBtn);
  }
  applyNodeSizing(el, node, actions.childElementCount);

  header.append(symbol, actions);

  const body = document.createElement("div");
  body.className = "node-body";

  const chip = document.createElement("div");
  chip.className = "node-chip";
  chip.textContent = node.label;
  chip.title = "Double-click to edit label";
  chip.addEventListener("dblclick", e => {
    e.preventDefault();
    e.stopPropagation();
    startInlineTextEdit(chip, node.label || "Untitled", value => {
      node.label = value || "Untitled";
      if (!node.manualSize) {
        autoSizeNodeFromLabel(node);
      }
      render();
    }, { fallbackValue: "Untitled", selectAll: true });
  });
  body.appendChild(chip);

  const collapsedChildren = collapsedNodesForHost(node.id).filter(isParentChainExpanded);
  if (collapsedChildren.length) {
    const collapsedList = document.createElement("div");
    collapsedList.className = "collapsed-list";
    collapsedChildren.forEach(child => collapsedList.appendChild(createCollapsedPill(child)));
    body.appendChild(collapsedList);
  }

  el.append(header, body);

  const resizeHandle = document.createElement("div");
  resizeHandle.className = "resize-handle";
  resizeHandle.title = "Resize node";
  resizeHandle.addEventListener("pointerdown", e => {
    e.preventDefault();
    e.stopPropagation();
    startResize(e, node.id);
  });
  el.appendChild(resizeHandle);

  header.addEventListener("pointerdown", e => {
    if (e.target.classList.contains("icon") || e.target.classList.contains("node-symbol")) {
      return;
    }
    e.preventDefault();
    startDrag(e, node.id);
  });

  const kids = childrenOf(node.id).filter(isNodeVisible);
  kids.forEach(child => body.appendChild(createNodeEl(child)));

  return el;
}
function applyNodeSizing(el, node, actionCount) {
  const w = Math.max(80, Number(node.width) || 0);
  const h = Math.max(48, Number(node.height) || 0);
  const compact = Math.min(w, h);

  const count = Math.max(1, Number(actionCount) || 1);
  const headerPad = clamp(Math.round(compact * 0.045), 6, 12);
  const actionGap = clamp(Math.round(compact * 0.03), 2, 8);
  const headerGap = clamp(Math.round(compact * 0.035), 4, 10);

  const iconByHeight = clamp(Math.round(h * 0.24), 12, 34);
  const symbolReserve = clamp(Math.round(compact * 0.3), 14, 22);
  const iconByWidth = Math.floor((w - (headerPad * 2) - symbolReserve - ((count - 1) * actionGap)) / count);
  const iconSize = clamp(Math.min(iconByHeight, iconByWidth), 12, 34);

  const iconFont = clamp(Math.round(iconSize * 0.52), 8, 15);
  const headerH = clamp(Math.round(iconSize + Math.max(8, iconSize * 0.45)), 24, 52);
  const symbolSize = clamp(Math.round(iconSize * 0.6), 10, 18);
  const bodyLabelSize = clamp(Math.round(Math.min(w * 0.07, h * 0.22)), 9, 18);
  const iconRadius = clamp(Math.round(iconSize * 0.28), 5, 11);

  el.style.setProperty("--symbol-size", `${symbolSize}px`);
  el.style.setProperty("--icon-size", `${iconSize}px`);
  el.style.setProperty("--icon-font", `${iconFont}px`);
  el.style.setProperty("--header-h", `${headerH}px`);
  el.style.setProperty("--body-label-size", `${bodyLabelSize}px`);
  el.style.setProperty("--icon-radius", `${iconRadius}px`);
  el.style.setProperty("--action-gap", `${actionGap}px`);
  el.style.setProperty("--header-gap", `${headerGap}px`);
  el.style.setProperty("--header-pad-x", `${headerPad}px`);
}

function autoSizeNodeFromLabel(node) {
  const text = String(node.label || "Untitled");
  if (!measureCtx) {
    node.width = clamp(Number(node.width) || 220, MIN_NODE_WIDTH, MAX_NODE_WIDTH);
    node.height = clamp(Number(node.height) || 110, MIN_NODE_HEIGHT, MAX_NODE_HEIGHT);
    return;
  }

  measureCtx.font = '600 14px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const words = text.split(/\s+/).filter(Boolean);
  const longestWord = words.reduce((max, w) => Math.max(max, measureCtx.measureText(w).width), 0);
  const rawLine = measureCtx.measureText(text).width;

  let width = Math.max(longestWord + BODY_TEXT_PAD_X, rawLine + BODY_TEXT_PAD_X);
  width = clamp(Math.ceil(width), MIN_NODE_WIDTH, MAX_NODE_WIDTH);

  const textMax = Math.max(20, width - BODY_TEXT_PAD_X);
  const lines = wrapLineCount(text, textMax, measureCtx);
  const collapsedChildren = collapsedNodesForHost(node.id).length;
  const collapsedRow = collapsedChildren > 0 ? COLLAPSED_ROW_ESTIMATE : 0;

  let height = HEADER_ESTIMATE + BODY_TEXT_PAD_Y + (lines * BODY_TEXT_LINE_HEIGHT) + collapsedRow;
  height = clamp(Math.ceil(height), MIN_NODE_HEIGHT, MAX_NODE_HEIGHT);

  node.width = width;
  node.height = height;
}

function wrapLineCount(text, maxWidth, ctx) {
  const chunks = String(text).split(/\n/);
  let count = 0;
  chunks.forEach(chunk => {
    const words = chunk.split(/\s+/).filter(Boolean);
    if (!words.length) {
      count += 1;
      return;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i += 1) {
      const candidate = `${line} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        count += 1;
        line = words[i];
      }
    }
    count += 1;
  });
  return Math.max(1, count);
}

function iconBtn(text, title, fn, danger = false) {
  const btn = document.createElement("button");
  btn.className = "icon" + (danger ? " danger" : "");
  btn.type = "button";
  btn.title = title;
  btn.textContent = text;
  btn.onclick = fn;
  return btn;
}

function startInlineTextEdit(containerEl, initialValue, onCommit, options = {}) {
  if (!containerEl || containerEl.dataset.editing === "1") {
    return;
  }

  const fallbackValue = options.fallbackValue || "";
  const selectAll = options.selectAll !== false;
  const currentText = String(initialValue || "");
  containerEl.dataset.editing = "1";
  const originalText = containerEl.textContent;
  containerEl.textContent = "";

  const input = document.createElement("input");
  input.type = "text";
  input.value = currentText;
  input.spellcheck = false;
  input.style.width = "100%";
  input.style.boxSizing = "border-box";
  input.style.font = "inherit";
  input.style.color = "inherit";
  input.style.background = "rgba(255,255,255,0.92)";
  input.style.border = "1px solid rgba(88,108,158,0.35)";
  input.style.borderRadius = "8px";
  input.style.padding = "2px 6px";
  input.style.outline = "none";
  input.style.minHeight = "24px";
  input.style.lineHeight = "1.2";

  containerEl.appendChild(input);
  input.focus();
  if (selectAll) {
    input.select();
  }

  let done = false;
  const finish = save => {
    if (done) {
      return;
    }
    done = true;
    const next = (input.value || "").trim() || fallbackValue;
    containerEl.dataset.editing = "0";
    if (save) {
      onCommit(next);
      return;
    }
    containerEl.textContent = originalText || fallbackValue;
  };

  input.addEventListener("pointerdown", e => e.stopPropagation());
  input.addEventListener("dblclick", e => e.stopPropagation());
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
}

function startFloatingEdgeLabelEditor(edgeIndex, clientX, clientY) {
  const edge = graph.edges[edgeIndex];
  if (!edge) {
    return;
  }

  const existing = document.getElementById("edgeLabelEditor");
  if (existing) {
    existing.remove();
  }

  const input = document.createElement("input");
  input.id = "edgeLabelEditor";
  input.type = "text";
  input.value = edge.label || "";
  input.spellcheck = false;
  input.style.position = "fixed";
  input.style.left = `${Math.max(8, clientX - 80)}px`;
  input.style.top = `${Math.max(8, clientY - 14)}px`;
  input.style.width = "180px";
  input.style.zIndex = "9999";
  input.style.font = '12px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  input.style.padding = "4px 8px";
  input.style.border = "1px solid rgba(88,108,158,0.45)";
  input.style.borderRadius = "8px";
  input.style.background = "#fff";
  input.style.color = "#1d2a44";
  input.style.boxShadow = "0 10px 20px rgba(21,34,62,0.2)";
  input.style.outline = "none";
  document.body.appendChild(input);
  input.focus();
  input.select();

  let done = false;
  const finish = save => {
    if (done) {
      return;
    }
    done = true;
    if (save) {
      edge.label = (input.value || "").trim();
      renderEdges();
    }
    input.remove();
  };

  input.addEventListener("pointerdown", e => e.stopPropagation());
  input.addEventListener("dblclick", e => e.stopPropagation());
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
}

function drawEdgesOnly() {
  renderEdges();
  updateStatus();
}

function renderEdges() {
  const svg = document.getElementById("edges");
  const marker = `
    <defs>
      <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
        <path d="M0,0 L0,6 L9,3 z" fill="#5e6f93"></path>
      </marker>
    </defs>
  `;

  const pieces = [marker];

  graph.edges.forEach((edge, i) => {
    const from = nodeById(edge.from);
    const to = nodeById(edge.to);
    if (!from || !to || !isNodeVisible(from) || !isNodeVisible(to)) {
      return;
    }

    const fr = absoluteRect(from);
    const tr = absoluteRect(to);

    const fromOnRight = tr.x >= fr.x;
    const sx = fromOnRight ? fr.x + fr.width : fr.x;
    const sy = fr.y + fr.height / 2;
    const tx = fromOnRight ? tr.x : tr.x + tr.width;
    const ty = tr.y + tr.height / 2;

    const dir = tx >= sx ? 1 : -1;
    const c = Math.max(60, Math.abs(tx - sx) * 0.45);
    const c1x = sx + dir * c;
    const c2x = tx - dir * c;

    const midX = (sx + tx) / 2;
    const midY = (sy + ty) / 2;

    pieces.push(`<path data-edge-index="${i}" d="M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${tx} ${ty}" stroke="#7a86a7" stroke-width="2" fill="none" marker-end="url(#arrow)"></path>`);
    if (edge.label) {
      pieces.push(`<text data-edge-index="${i}" x="${midX}" y="${midY - 8}" fill="#556384" font-size="11" text-anchor="middle">${escapeXml(edge.label)}</text>`);
    }
  });

  svg.innerHTML = pieces.join("\n");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function startDrag(e, nodeId) {
  const node = nodeById(nodeId);
  if (!node) {
    return;
  }

  dragging = {
    nodeId,
    sx: e.clientX,
    sy: e.clientY,
    ox: node.x,
    oy: node.y
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", stopPointerOps);
}

function startResize(e, nodeId) {
  const node = nodeById(nodeId);
  if (!node) {
    return;
  }

  resizing = {
    nodeId,
    sx: e.clientX,
    sy: e.clientY,
    ow: Number(node.width) || MIN_NODE_WIDTH,
    oh: Number(node.height) || MIN_NODE_HEIGHT
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", stopPointerOps);
}

function startPan(e) {
  panning = {
    sx: e.clientX,
    sy: e.clientY,
    ox: view.x,
    oy: view.y
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", stopPointerOps);
}

function onPointerMove(e) {
  if (resizing) {
    const node = nodeById(resizing.nodeId);
    if (!node) {
      return;
    }

    const dw = (e.clientX - resizing.sx) / view.scale;
    const dh = (e.clientY - resizing.sy) / view.scale;

    node.width = clamp(Math.round(resizing.ow + dw), MIN_NODE_WIDTH, MAX_NODE_WIDTH);
    node.height = clamp(Math.round(resizing.oh + dh), MIN_NODE_HEIGHT, MAX_NODE_HEIGHT);
    node.manualSize = true;
    render();
    return;
  }

  if (dragging) {
    const node = nodeById(dragging.nodeId);
    if (!node) {
      return;
    }

    const dx = (e.clientX - dragging.sx) / view.scale;
    const dy = (e.clientY - dragging.sy) / view.scale;

    node.x = Math.round(dragging.ox + dx);
    node.y = Math.round(dragging.oy + dy);

    if (node.parentId) {
      const p = nodeById(node.parentId);
      if (p) {
        const maxX = Math.max(0, p.width - CONTAINER_PADDING * 2 - node.width);
        const maxY = Math.max(0, p.height - CONTAINER_HEADER - CONTAINER_PADDING * 2 - node.height);
        node.x = clamp(node.x, 0, maxX);
        node.y = clamp(node.y, 0, maxY);
      }
    }

    render();
    return;
  }

  if (panning) {
    view.x = panning.ox + (e.clientX - panning.sx);
    view.y = panning.oy + (e.clientY - panning.sy);
    applyView();
  }
}

function stopPointerOps() {
  dragging = null;
  resizing = null;
  panning = null;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", stopPointerOps);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function applyView() {
  const world = document.getElementById("world");
  world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  updateStatus();
}

function zoomBy(delta) {
  const viewport = document.getElementById("viewport");
  const rect = viewport.getBoundingClientRect();
  zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, delta);
}

function zoomAt(clientX, clientY, delta) {
  const viewport = document.getElementById("viewport");
  const rect = viewport.getBoundingClientRect();

  const localX = clientX - rect.left;
  const localY = clientY - rect.top;

  const worldX = (localX - view.x) / view.scale;
  const worldY = (localY - view.y) / view.scale;

  const next = clamp(view.scale + delta, 0.35, 2.8);

  view.x = localX - worldX * next;
  view.y = localY - worldY * next;
  view.scale = Number(next.toFixed(3));

  applyView();
}

function fitView() {
  const nodes = visibleNodes();
  if (!nodes.length) {
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach(node => {
    const r = absoluteRect(node);
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  });

  const viewport = document.getElementById("viewport");
  const vb = viewport.getBoundingClientRect();
  const pad = 80;

  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);

  const sx = (vb.width - pad) / w;
  const sy = (vb.height - pad) / h;
  view.scale = clamp(Math.min(sx, sy), 0.35, 2.8);
  view.x = (vb.width - w * view.scale) / 2 - minX * view.scale;
  view.y = (vb.height - h * view.scale) / 2 - minY * view.scale;

  applyView();
}

function resetView() {
  view.x = 0;
  view.y = 0;
  view.scale = 1;
  applyView();
}

function updateStatus() {
  const status = document.getElementById("status");
  const zoom = Math.round(view.scale * 100);
  const collapsedCount = graph.nodes.filter(n => n.collapsed).length;
  status.textContent = `Nodes: ${visibleNodes().length}/${graph.nodes.length} | Collapsed: ${collapsedCount} | Edges: ${graph.edges.length} | Zoom: ${zoom}%`;
}

function toggleCollapse(id) {
  const node = nodeById(id);
  if (!node) {
    return;
  }
  node.collapsed = !node.collapsed;
  render();
}

function addChild(parentId) {
  createNodeFromPrompt(parentId, true);
}

function addNodePrompt() {
  createNodeFromPrompt(null, false);
}

function createNodeFromPrompt(defaultParentId, lockParent) {
  const label = prompt("Node label?");
  if (!label) {
    return;
  }
  const emojiInput = prompt("Emoji for header (optional)", "â—ˆ");
  const emoji = (emojiInput || "").trim() || "â—ˆ";

  let parentId = null;
  let edgeFromNodeId = null;
  if (lockParent) {
    edgeFromNodeId = defaultParentId || null;
    parentId = null;
  } else {
    parentId = defaultParentId || null;
    edgeFromNodeId = parentId;
  }

  const parent = edgeFromNodeId ? nodeById(edgeFromNodeId) : null;
  if (edgeFromNodeId && !parent) {
    alert("Parent ID not found");
    return;
  }

  const xDefault = parent ? (Number(parent.x) + Number(parent.width || 0) + 60) : 120;
  const yDefault = parent ? Number(parent.y) : 120;
  const wDefault = 220;
  const hDefault = 110;
  const rootCount = graph.nodes.filter(n => !n.parentId).length;
  const x = lockParent ? xDefault : xDefault + (rootCount * 24);
  const y = lockParent ? yDefault : yDefault + (rootCount * 20);

  const id = `node_${Date.now()}`;
  graph.nodes.push({
    id,
    label,
    emoji,
    x: Number.isFinite(x) ? x : xDefault,
    y: Number.isFinite(y) ? y : yDefault,
    width: wDefault,
    height: hDefault,
    note: "",
    parentId: lockParent ? null : (parent ? parent.id : null),
    collapsed: false,
    manualSize: false
  });

  if (edgeFromNodeId) {
    graph.edges.push({ from: edgeFromNodeId, to: id, label: "flow" });
  }

  render();
}

function addEdgePrompt() {
  const from = prompt("From node ID:");
  const to = prompt("To node ID:");
  if (!from || !to || !nodeById(from) || !nodeById(to)) {
    alert("Invalid node IDs");
    return;
  }
  const label = prompt("Edge label:", "flow") || "flow";
  graph.edges.push({ from, to, label });
  renderEdges();
}

function deleteNode(id) {
  if (!confirm("Delete this node and all nested children?")) {
    return;
  }

  const all = [id, ...descendantsOf(id)];
  graph.nodes = graph.nodes.filter(n => !all.includes(n.id));
  graph.edges = graph.edges.filter(e => !all.includes(e.from) && !all.includes(e.to));

  if (selectedNodeId && all.includes(selectedNodeId)) {
    closeNotes();
  }

  render();
}

function openNotes(id) {
  const node = nodeById(id);
  if (!node) {
    return;
  }

  selectedNodeId = id;
  const sidebar = document.getElementById("sidebar");
  sidebar.style.display = "flex";
  document.getElementById("noteTitle").textContent = `Notes: ${node.label} (${node.id})`;
  document.getElementById("noteArea").value = node.note || "";
}

function saveNote() {
  const node = nodeById(selectedNodeId);
  if (!node) {
    return;
  }
  node.note = document.getElementById("noteArea").value;
  alert("Note saved");
}

function closeNotes() {
  selectedNodeId = null;
  document.getElementById("sidebar").style.display = "none";
}

function importData(rawText) {
  let text = rawText;

  if (text.includes("const mindMapData")) {
    text = text.replace(/^[\s\S]*?=\s*/, "").trim();
  }

  const parsed = JSON.parse(text);

  if (parsed && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
    graph = parsed;
    normalizeGraph();
    render();
    resetView();
    return;
  }

  if (parsed && parsed.id && Array.isArray(parsed.children)) {
    graph = convertTreeToGraph(parsed);
    normalizeGraph();
    render();
    resetView();
    return;
  }

  throw new Error("Unsupported format");
}

function convertTreeToGraph(tree) {
  const nodes = [];
  const edges = [];
  const xGap = 260;
  const yGap = 120;
  const yIndexByDepth = new Map();

  function walk(node, depth, parentId) {
    const yIndex = yIndexByDepth.get(depth) || 0;
    yIndexByDepth.set(depth, yIndex + 1);

    const id = String(node.id || `node_${Date.now()}_${Math.random()}`);
    const isRoot = !parentId;

    nodes.push({
      id,
      label: node.title || node.label || "Node",
      x: isRoot ? 120 : depth * xGap,
      y: isRoot ? 100 : 100 + yIndex * yGap,
      width: isRoot ? 380 : 200,
      height: isRoot ? 240 : 90,
      note: node.note || "",
      parentId: null,
      collapsed: false
    });

    if (parentId) {
      edges.push({ from: parentId, to: id, label: "flow" });
    }

    (node.children || []).forEach(child => walk(child, depth + 1, id));
  }

  walk(tree, 0, null);

  return { nodes, edges };
}

function normalizeGraph() {
  graph.nodes = graph.nodes.map(n => ({
    id: String(n.id || `node_${Date.now()}`),
    label: String(n.label || n.title || "Untitled"),
    emoji: String(n.emoji || "â—ˆ"),
    x: Number(n.x) || 0,
    y: Number(n.y) || 0,
    width: clamp(Number(n.width) || 220, MIN_NODE_WIDTH, MAX_NODE_WIDTH),
    height: clamp(Number(n.height) || 110, MIN_NODE_HEIGHT, MAX_NODE_HEIGHT),
    note: String(n.note || ""),
    parentId: n.parentId ? String(n.parentId) : null,
    collapsed: Boolean(n.collapsed),
    manualSize: Boolean(n.manualSize)
  }));
}

function toggleTheme() {
  const isDark = document.body.getAttribute("data-theme") === "dark";
  const next = isDark ? "light" : "dark";
  if (next === "dark") {
    document.body.setAttribute("data-theme", "dark");
  } else {
    document.body.removeAttribute("data-theme");
  }
  chrome.storage.local.set({ [STORAGE_THEME_KEY]: next });
  updateThemeButton();
}

function updateThemeButton() {
  const btn = document.getElementById("themeToggle");
  if (!btn) {
    return;
  }
  const isDark = document.body.getAttribute("data-theme") === "dark";
  btn.textContent = isDark ? "Light Theme" : "Dark Theme";
}

function openJsonFileInput() {
  const input = document.getElementById("fileInput");
  if (!input) {
    return;
  }
  input.value = "";
  input.click();
}

function exportGraphJson() {
  // Manual backup export: downloads the current in-memory graph as JSON.
  const json = JSON.stringify(graph, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mind-palace-backup.json";
  a.click();
  URL.revokeObjectURL(url);
}

async function saveGraphToStorage(showToast) {
  // Extension-native persistence replaces file system writable streams.
  await chrome.storage.local.set({ [STORAGE_GRAPH_KEY]: graph });
  lastSavedGraphSnapshot = JSON.stringify(graph, null, 2);
  if (showToast) {
    alert("Saved");
  }
}

async function saveGraphNow() {
  try {
    await saveGraphToStorage(true);
  } catch (err) {
    console.warn("Manual save failed:", err);
    alert("Save failed.");
  }
}

async function importGraphFile(file) {
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    importData(text);
    closeNotes();
    await saveGraphToStorage(false);
  } catch (err) {
    alert(`Invalid file format: ${err.message}`);
  }
}

async function loadDefaultGraph() {
  // Default seed graph is bundled with the extension package.
  const url = chrome.runtime.getURL("default.json");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load default.json (${response.status})`);
  }
  const parsed = await response.json();
  if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error("default.json has unsupported format");
  }
  graph = parsed;
  normalizeGraph();
}

async function hydrateGraph() {
  // Startup order: storage graph first, fallback to bundled default graph.
  const result = await chrome.storage.local.get(STORAGE_GRAPH_KEY);
  const savedGraph = result && result[STORAGE_GRAPH_KEY];
  if (savedGraph && Array.isArray(savedGraph.nodes) && Array.isArray(savedGraph.edges)) {
    graph = savedGraph;
    normalizeGraph();
    return;
  }

  await loadDefaultGraph();
  await chrome.storage.local.set({ [STORAGE_GRAPH_KEY]: graph });
}

function setupUiEvents() {
  document.getElementById("importJsonBtn").addEventListener("click", openJsonFileInput);
  document.getElementById("exportJsonBtn").addEventListener("click", exportGraphJson);
  document.getElementById("saveNowBtn").addEventListener("click", saveGraphNow);
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  document.getElementById("fitViewBtn").addEventListener("click", fitView);
  document.getElementById("saveNoteBtn").addEventListener("click", saveNote);
  document.getElementById("closeNotesBtn").addEventListener("click", closeNotes);
  document.getElementById("fileInput").addEventListener("change", e => {
    const file = e.target.files && e.target.files[0];
    importGraphFile(file);
  });
}

function startAutoSaveLoop() {
  // Lightweight autosave loop to persist edits without explicit save prompts.
  setInterval(() => {
    const current = JSON.stringify(graph, null, 2);
    if (current === lastSavedGraphSnapshot) {
      return;
    }
    saveGraphToStorage(false).catch(err => {
      console.warn("Auto-save failed:", err);
    });
  }, AUTO_SAVE_MS);
}

const viewport = document.getElementById("viewport");
const edgesSvg = document.getElementById("edges");
edgesSvg.addEventListener("dblclick", e => {
  const target = e.target;
  if (!target || typeof target.getAttribute !== "function") {
    return;
  }

  const idxText = target.getAttribute("data-edge-index");
  if (idxText === null) {
    return;
  }

  const idx = Number(idxText);
  if (!Number.isFinite(idx)) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();
  startFloatingEdgeLabelEditor(idx, e.clientX, e.clientY);
});
viewport.addEventListener("pointerdown", e => {
  if (e.target.id === "viewport" || e.target.id === "world" || e.target.id === "nodes" || e.target.id === "edges") {
    startPan(e);
  }
});

viewport.addEventListener("wheel", e => {
  e.preventDefault();
  const step = e.deltaY > 0 ? -0.08 : 0.08;
  zoomAt(e.clientX, e.clientY, step);
}, { passive: false });

async function initializeAppState() {
  setupUiEvents();

  const themeResult = await chrome.storage.local.get(STORAGE_THEME_KEY);
  if (themeResult && themeResult[STORAGE_THEME_KEY] === "dark") {
    document.body.setAttribute("data-theme", "dark");
  }
  updateThemeButton();

  await hydrateGraph();
  render();
  resetView();
  lastSavedGraphSnapshot = JSON.stringify(graph, null, 2);
  startAutoSaveLoop();
}

initializeAppState().catch(err => {
  console.error("Initialization failed:", err);
  alert(`Failed to initialize app: ${err.message}`);
});

