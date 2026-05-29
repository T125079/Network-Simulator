const workspace = document.getElementById("workspace");

let deleteMode = false;

let selectedPort = null;
let editingNode = null;
let editingPort = null;

let connections = [];
let vlans = [1];

const portConfig = {
  router: ["G0/0", "G0/1"],
  switch: ["F0/1", "F0/2", "F0/3", "F0/4"],
  pc: ["eth0"]
};

let routerCount = 1;
let switchCount = 1;
let pcCount = 0;

const pcAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const svgMap = {
  router: "assets/router.svg",
  switch: "assets/switch.svg",
  pc: "assets/pc.svg"
};

const modal = document.getElementById("modal");
const modalName = document.getElementById("modalName");
const modalIP = document.getElementById("modalIP");
const modalMask = document.getElementById("modalMask");
const modalGateway = document.getElementById("modalGateway");
const modalPortSelect = document.getElementById("modalPortSelect");
const modalPortMode = document.getElementById("modalPortMode");
const modalPortVlan = document.getElementById("modalPortVlan");
const modalPortIP = document.getElementById("modalPortIP");

const rowName = document.getElementById("rowName");
const rowIP = document.getElementById("rowIP");
const rowMask = document.getElementById("rowMask");
const rowGateway = document.getElementById("rowGateway");
const rowPortSelect = document.getElementById("rowPortSelect");
const rowPortMode = document.getElementById("rowPortMode");
const rowPortVlan = document.getElementById("rowPortVlan");
const rowPortIP = document.getElementById("rowPortIP");

const deleteModeBtn = document.getElementById("deleteModeBtn");
const vlanInput = document.getElementById("vlanInput");
const addVlanBtn = document.getElementById("addVlanBtn");
const vlanList = document.getElementById("vlanList");

const status = document.getElementById("status");
const pingFrom = document.getElementById("pingFrom");
const pingTo = document.getElementById("pingTo");
const pingBtn = document.getElementById("pingBtn");

// 削除モード
deleteModeBtn.addEventListener("click", () => {
  deleteMode = !deleteMode;
  deleteModeBtn.textContent = deleteMode ? "削除モード: ON" : "削除モード: OFF";
  deleteModeBtn.style.background = deleteMode ? "#f39c12" : "#e74c3c";
  
  if (deleteMode) {
    workspace.classList.add("delete-active");
  } else {
    workspace.classList.remove("delete-active");
  }
});

// VLAN生成
addVlanBtn.onclick = () => {
  const id = parseInt(vlanInput.value);
  if (!id || id < 1 || id > 4094) {
    alert("1〜4094の範囲でVLAN IDを入力してください。");
    return;
  }
  if (vlans.includes(id)) return;
  vlans.push(id);
  vlans.sort((a, b) => a - b);
  renderVLANs();
  vlanInput.value = "";
};

function renderVLANs() {
  vlanList.innerHTML = "";
  vlans.forEach(v => {
    const div = document.createElement("div");
    div.className = "vlan-item";
    div.textContent = "VLAN " + v;
    vlanList.appendChild(div);
  });
}
renderVLANs();

document.querySelectorAll(".device").forEach(d => {
  d.addEventListener("dragstart", e => {
    e.dataTransfer.setData("type", d.dataset.type);
  });
});

workspace.ondragover = e => e.preventDefault();

workspace.ondrop = e => {
  const type = e.dataTransfer.getData("type");
  if (!type) return;
  const pt = getPoint(e);
  const node = createNode(type, pt.x, pt.y);
  workspace.appendChild(node);
  refreshPingSelects();
};

function deleteConnectionByPort(port) {
  const target = connections.filter(c => c.a.port === port || c.b.port === port);
  target.forEach(conn => {
    if (conn.group) conn.group.remove();
    connections = connections.filter(c => c !== conn);
  });
  port.setAttribute("fill", "#3498db");
}

function deleteConnectionDirectly(conn) {
  if (conn.group) conn.group.remove();
  
  if (conn.a && conn.a.port) conn.a.port.setAttribute("fill", "#3498db");
  if (conn.b && conn.b.port) conn.b.port.setAttribute("fill", "#3498db");
  
  connections = connections.filter(c => c !== conn);
  setStatus("ok", "CONNECTION DELETED");
}

function isPortAlreadyConnected(port) {
  return connections.some(conn => conn.a.port === port || conn.b.port === port);
}

function deleteNode(g) {
  connections = connections.filter(conn => {
    const isConnected = conn.a.node === g || conn.b.node === g;
    if (isConnected) conn.group.remove();
    return !isConnected;
  });
  g.remove();
  selectedPort = null;
  refreshPingSelects();
}

function createNode(type, x, y) {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  const nodeHud = document.createElementNS("http://www.w3.org/2000/svg", "text");

  let name = "";
  if (type === "router") name = "R" + routerCount++;
  if (type === "switch") name = "SW" + switchCount++;
  if (type === "pc") name = "PC-" + pcAlphabet[pcCount++];

  g.dataset.id = crypto.randomUUID();
  g.dataset.type = type;
  g.dataset.name = name;
  g.dataset.ip = "";
  g.dataset.mask = "255.255.255.0";
  g.dataset.gateway = "";

  rect.setAttribute("x", -30);
  rect.setAttribute("y", -30);
  rect.setAttribute("width", 60);
  rect.setAttribute("height", 60);
  rect.setAttribute("fill", "none");

  img.setAttributeNS(null, "href", svgMap[type]);
  img.setAttribute("x", -25);
  img.setAttribute("y", -25);
  img.setAttribute("width", 50);
  img.setAttribute("height", 50);
  img.style.cursor = "grab";

  text.setAttribute("x", 0);
  text.setAttribute("y", -35);
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("font-weight", "bold");
  text.textContent = name;

  nodeHud.setAttribute("text-anchor", "middle");
  nodeHud.setAttribute("font-size", "10");

  g.rect = rect;
  g.image = img;
  g.text = text;
  g.nodeHud = nodeHud;

  g.appendChild(rect);
  g.appendChild(img);
  g.appendChild(text);
  g.appendChild(nodeHud);

  g.ports = [];
  createPorts(g, type);

  g.setAttribute("transform", `translate(${x}, ${y})`);
  
  attachNodeEvents(g);
  updateCombinedHUD(g);

  return g;
}

function createPorts(g, type) {
  const list = portConfig[type] || [];
  g.ports = [];

  list.forEach((portName, i) => {
    const angle = (Math.PI * 2 / list.length) * i;
    const px = Math.cos(angle) * 40;
    const py = Math.sin(angle) * 40;

    const portGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    portGroup.setAttribute("transform", `translate(${px}, ${py})`);

    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", 0);
    c.setAttribute("cy", 0);
    c.setAttribute("r", 6);
    c.setAttribute("fill", "#3498db");

    c.dataset.portName = portName;
    c.dataset.mode = "access";
    c.dataset.vlan = "1";
    c.dataset.ip = "";
    c._node = g;

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.className = "port-label";
    label.setAttribute("x", 10);
    label.setAttribute("y", 3);
    label.textContent = portName;

    c.addEventListener("click", e => {
      e.stopPropagation();
      if (deleteMode) {
        deleteConnectionByPort(c);
        return;
      }
      handlePortClick(g, c);
    });

    c.addEventListener("dblclick", e => {
      e.stopPropagation();
      editingNode = g;
      editingPort = c;
      openModalWithPort(g, c);
    });

    portGroup.appendChild(c);
    portGroup.appendChild(label);
    g.appendChild(portGroup);

    g.ports.push({ circle: c, label, group: portGroup });
  });
}

function updateCombinedHUD(g) {
  if (!g || !g.nodeHud) return;

  const x = 0;
  const y = 45;

  g.nodeHud.setAttribute("x", x);
  g.nodeHud.setAttribute("y", y);
  g.nodeHud.innerHTML = "";

  let currentLineOffset = 0;

  if (g.dataset.type === "pc") {
    const mainInfo = `IP:${g.dataset.ip || "-"} MASK:${g.dataset.mask || "-"} GW:${g.dataset.gateway || "-"}`;
    const firstLine = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    firstLine.setAttribute("x", x);
    firstLine.setAttribute("dy", "0");
    firstLine.textContent = mainInfo;
    g.nodeHud.appendChild(firstLine);
    currentLineOffset = 12;
  }

  g.ports.forEach((p) => {
    const c = p.circle;
    const portLine = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    
    let info = "";
    if (g.dataset.type === "router") {
      info += `IP:${c.dataset.ip || "-"}`;
    } else if (g.dataset.type === "switch") {
      info += `${c.dataset.mode} VLAN${c.dataset.vlan}`;
    } else {
      info += `${c.dataset.mode}`;
    }

    portLine.setAttribute("x", x);
    portLine.setAttribute("dy", currentLineOffset.toString());
    portLine.textContent = `${c.dataset.portName}: ${info}`;
    g.nodeHud.appendChild(portLine);
    currentLineOffset = 12;
  });
}
function attachNodeEvents(g) {
  let drag = false;
  let offset = { x: 0, y: 0 };

  g.addEventListener("mousedown", e => {
    if (deleteMode) {
      deleteNode(g);
      return;
    }
    if (e.target.tagName === "circle") return; 
    drag = true;
    g.image.style.cursor = "grabbing";
    
    const transform = g.getAttribute("transform");
    let cx = 0, cy = 0;
    if (transform) {
      const match = transform.match(/translate\(([^,)]+)[, ]([^)]+)\)/);
      if (match) {
        cx = parseFloat(match[1]);
        cy = parseFloat(match[2]);
      }
    }
    const pt = getPoint(e);
    offset.x = pt.x - cx;
    offset.y = pt.y - cy;
  });

  window.addEventListener("mousemove", e => {
    if (!drag) return;
    const pt = getPoint(e);
    const nx = pt.x - offset.x;
    const ny = pt.y - offset.y;
    
    g.setAttribute("transform", `translate(${nx}, ${ny})`);
    connections.forEach(c => updateLine(c.group, c.a, c.b));
  });

  window.addEventListener("mouseup", () => { 
    if(drag) {
      drag = false; 
      g.image.style.cursor = "grab";
    }
  });

  g.addEventListener("dblclick", e => {
    if (e.target.tagName === "circle") return;
    e.stopPropagation();
    editingNode = g;
    editingPort = null;

    modalName.value = g.dataset.name;
    modalIP.value = g.dataset.ip;
    modalMask.value = g.dataset.mask;
    modalGateway.value = g.dataset.gateway;

    openModalWithNode(g);
  });
}
function openModalWithNode(g) {
  rowPortSelect.style.display = "none";
  rowPortMode.style.display = "none";
  rowPortVlan.style.display = "none";
  rowPortIP.style.display = "none";

  rowName.style.display = "block";

  if (g.dataset.type === "pc") {
    rowIP.style.display = "block";
    rowMask.style.display = "block";
    rowGateway.style.display = "block";
  } else {
    rowIP.style.display = "none";
    rowMask.style.display = "none";
    rowGateway.style.display = "none";
  }
  modal.classList.add("show");
}

function openModalWithPort(g, c) {
  rowName.style.display = "none";
  rowIP.style.display = "none";
  rowMask.style.display = "none";
  rowGateway.style.display = "none";

  modalPortSelect.innerHTML = "";
  g.ports.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.circle.dataset.portName;
    opt.textContent = p.circle.dataset.portName;
    if (p.circle.dataset.portName === c.dataset.portName) opt.selected = true;
    modalPortSelect.appendChild(opt);
  });
  rowPortSelect.style.display = "block";

  if (g.dataset.type === "router") {
    rowPortMode.style.display = "none";
    rowPortVlan.style.display = "none";
    rowPortIP.style.display = "block";
    modalPortIP.value = c.dataset.ip || "";
  } else if (g.dataset.type === "switch") {
    rowPortMode.style.display = "block";
    rowPortIP.style.display = "none";

    modalPortVlan.innerHTML = "";
    vlans.forEach(vlanId => {
      const opt = document.createElement("option");
      opt.value = vlanId;
      opt.textContent = `VLAN ${vlanId}`;
      if ((c.dataset.vlan || "1") == vlanId.toString()) {
        opt.selected = true;
      }
      modalPortVlan.appendChild(opt);
    });

    rowPortVlan.style.display = "block";
    modalPortMode.value = c.dataset.mode || "access";
  } else if (g.dataset.type === "pc") {
    rowPortMode.style.display = "none";
    rowPortVlan.style.display = "none";
    rowPortIP.style.display = "none";
  }
  modal.classList.add("show");
}
document.getElementById("saveModal").onclick = () => {
  if (editingPort) {
    const type = editingPort._node.dataset.type;
    if (type === "router") {
      editingPort.dataset.ip = modalPortIP.value;
    } else if (type === "switch") {
      editingPort.dataset.mode = modalPortMode.value;
      editingPort.dataset.vlan = modalPortVlan.value;
    }
    updateCombinedHUD(editingPort._node);
    editingPort = null;
    editingNode = null;
  } else if (editingNode) {
    const newName = modalName.value.trim();
    
    if (newName === "") {
      alert("エラー: デバイス名に空文字を指定することはできません。");
      return;
    }

    const isDuplicate = getAllNodes().some(n => n !== editingNode && n.dataset.name === newName);
    if (isDuplicate) {
      alert("エラー: そのデバイス名は既に使用されています。別の名前を指定してください。");
      return;
    }

    editingNode.dataset.name = newName;
    editingNode.text.textContent = newName;
    if (editingNode.dataset.type === "pc") {
      editingNode.dataset.ip = modalIP.value;
      editingNode.dataset.mask = modalMask.value;
      editingNode.dataset.gateway = modalGateway.value;
    }
    updateCombinedHUD(editingNode);
    editingNode = null;
  }

  refreshPingSelects();
  closeModal();
};

function closeModal() {
  modal.classList.remove("show");
}
document.getElementById("closeModal").onclick = closeModal;

function handlePortClick(node, port) {
  if (!selectedPort) {
    selectedPort = { node, port };
    port.setAttribute("fill", "#e74c3c");
    return;
  }
  if (selectedPort.port === port) {
    port.setAttribute("fill", "#3498db");
    selectedPort = null;
    return;
  }
  if (isPortAlreadyConnected(port)) {
    setStatus("warn", "PORT ALREADY CONNECTED");
    selectedPort.port.setAttribute("fill", "#3498db");
    selectedPort = null;
    return;
  }

  const exists = connections.some(c =>
    (c.a.port === selectedPort.port && c.b.port === port) ||
    (c.b.port === selectedPort.port && c.a.port === port)
  );
  if (exists) {
    setStatus("warn", "ALREADY CONNECTED");
    selectedPort.port.setAttribute("fill", "#3498db");
    selectedPort = null;
    return;
  }

  const connGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  connGroup.setAttribute("class", "conn-clickable");

  const bgLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  bgLine.setAttribute("stroke", "transparent");
  bgLine.setAttribute("stroke-width", "12");

  const visibleLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  visibleLine.setAttribute("class", "visible-line");
  visibleLine.setAttribute("stroke", "#2c3e50");
  visibleLine.setAttribute("stroke-width", "2");

  connGroup.appendChild(bgLine);
  connGroup.appendChild(visibleLine);
  workspace.insertBefore(connGroup, workspace.firstChild);

  const conn = {
    a: { node: selectedPort.node, port: selectedPort.port },
    b: { node: node, port: port },
    group: connGroup
  };

  connGroup.addEventListener("click", e => {
    if (deleteMode) {
      e.stopPropagation();
      deleteConnectionDirectly(conn);
    }
  });

  connections.push(conn);
  updateLine(connGroup, conn.a, conn.b);

  selectedPort.port.setAttribute("fill", "#3498db");
  selectedPort = null;
}

function updateLine(group, a, b) {
  const p1 = getPortPos(a.port);
  const p2 = getPortPos(b.port);
  
  const lines = group.querySelectorAll("line");
  lines.forEach(line => {
    line.setAttribute("x1", p1.x);
    line.setAttribute("y1", p1.y);
    line.setAttribute("x2", p2.x);
    line.setAttribute("y2", p2.y);
  });
}

function getPoint(e) {
  const pt = workspace.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  return pt.matrixTransform(workspace.getScreenCTM().inverse());
}

function getAllNodes() {
  return Array.from(workspace.querySelectorAll("g")).filter(g =>
    g instanceof SVGGElement && g.dataset && g.dataset.type && g.dataset.id
  );
}

function findNodeById(id) {
  return getAllNodes().find(g => g.dataset.id === id);
}

// PingPC選択
function refreshPingSelects() {
  pingFrom.innerHTML = "";
  pingTo.innerHTML = "";
  const nodes = getAllNodes();
  if (!nodes || nodes.length === 0) return;

  nodes.forEach(g => {
    if (g.dataset.type !== "pc") return;
    const id = g.dataset.id;
    if (!id) return;
    const name = g.dataset.name || g.dataset.type;
    const ip = g.dataset.ip || "-";
    if (!g.dataset.ip) return; 

    const label = `${name} (${ip})`;

    const opt1 = document.createElement("option");
    opt1.value = id; opt1.textContent = label;
    const opt2 = document.createElement("option");
    opt2.value = id; opt2.textContent = label;

    pingFrom.appendChild(opt1);
    pingTo.appendChild(opt2);
  });
}

// 2つのノード間に接続されている配線オブジェクトを探して返す
function findConnection(nodeA, nodeB) {
  return connections.find(c =>
    (c.a.node === nodeA && c.b.node === nodeB) ||
    (c.a.node === nodeB && c.b.node === nodeA)
  );
}

// リンクの両端に位置するスイッチポートのVLAN設定を検証、双方がアクセスで同一VLANか、あるいはトランクであるかをチェック
function sameVlanByPort(conn) {
  const a = conn.a.port;
  const b = conn.b.port;
  
  const modeA = a.dataset.mode || "access";
  const modeB = b.dataset.mode || "access";
  const vlanA = a.dataset.vlan || "1";
  const vlanB = b.dataset.vlan || "1";

  console.log(
    `[CHECK] ${a.dataset.portName}(${modeA}, VLAN${vlanA}) ↔ ${b.dataset.portName}(${modeB}, VLAN${vlanB})`
  );

  if (modeA === "trunk" || modeB === "trunk") {
    console.log("→ trunk通過 OK");
    return true;
  }

  return vlanA === vlanB;
}

// 幅優先探索を用いて、開始ノードから目的ノードまでのL2転送経路を接続情報を元に検索・算出する
function findL2Path(startNode, goalNode, targetSubnetIp = null) {
  const queue = [[startNode]];
  const visited = new Set();

  while (queue.length > 0) {
    const path = queue.shift();
    const last = path[path.length - 1];

    if (last === goalNode) return path;
    if (visited.has(last)) continue;
    visited.add(last);

    const localConns = connections.filter(c => c.a.node === last || c.b.node === last);

    for (const c of localConns) {
      const neighbor = (c.a.node === last ? c.b.node : c.a.node);
      if (path.length >= 2 && neighbor === path[path.length - 2]) {
        continue;
      }
      const currentPort = (c.a.node === last ? c.a.port : c.b.port);

      if (last.dataset.type === "router" && targetSubnetIp) {
        if (neighbor.dataset.type === "router") {
        } else {
          if (!isSameSubnet(currentPort.dataset.ip, targetSubnetIp)) {
            continue;
          }
        }
      }

      queue.push([...path, neighbor]);
    }
  }
  return null;
}

// パケット通信の視覚効果に使用する封筒型SVG図形生成
function createPDU(x, y, pduColor = "#9b59b6") {
  if (!workspace) return null;
  const pduGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("width", "16"); rect.setAttribute("height", "11");
  rect.setAttribute("x", "-8"); rect.setAttribute("y", "-5.5");
  rect.setAttribute("fill", pduColor); rect.setAttribute("stroke", "#ffffff");
  rect.setAttribute("stroke-width", "1"); rect.setAttribute("rx", "1");

  const line1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line1.setAttribute("x1", "-8"); line1.setAttribute("y1", "-5.5");
  line1.setAttribute("x2", "0"); line1.setAttribute("y2", "1");
  line1.setAttribute("stroke", "#ffffff"); line1.setAttribute("stroke-width", "1");

  const line2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line2.setAttribute("x1", "8"); line2.setAttribute("y1", "-5.5");
  line2.setAttribute("x2", "0"); line2.setAttribute("y2", "1");
  line2.setAttribute("stroke", "#ffffff"); line2.setAttribute("stroke-width", "1");

  pduGroup.appendChild(rect); pduGroup.appendChild(line1); pduGroup.appendChild(line2);
  pduGroup.setAttribute("transform", `translate(${x}, ${y})`);
  pduGroup.style.pointerEvents = "none";
  workspace.appendChild(pduGroup);
  return pduGroup;
}
function lerp(a, b, t) { return a + (b - a) * t; }

// アニメーション実行
function animatePacketTracer(from, to, duration = 1200, pduColor = "#9b59b6", isDrop = false) {
  return new Promise(resolve => {
    const p1 = getPortPos(from);
    const p2 = getPortPos(to);
    const pdu = createPDU(p1.x, p1.y, pduColor);
    if (!pdu) { resolve(); return; }

    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      const x = lerp(p1.x, p2.x, t);
      const y = lerp(p1.y, p2.y, t);
      pdu.setAttribute("transform", `translate(${x}, ${y})`);

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        if (isDrop) {
          let fadeStart = performance.now();
          function fadeStep(fNow) {
            let fT = Math.min((fNow - fadeStart) / 400, 1);
            pdu.setAttribute("transform", `translate(${p2.x}, ${p2.y}) scale(${1 + fT * 0.5})`);
            pdu.setAttribute("opacity", 1 - fT);
            if (fT < 1) requestAnimationFrame(fadeStep); else { pdu.remove(); resolve(); }
          }
          requestAnimationFrame(fadeStep);
        } else {
          pdu.remove(); resolve();
        }
      }
    }
    requestAnimationFrame(step);
  });
}

// 2つのIPアドレスの第3オクテットまで比較し、同一のサブネットに所属しているかを判定
function isSameSubnet(ip1, ip2, mask = "255.255.255.0") {
  if (!ip1 || !ip2 || ip1 === "-" || ip2 === "-") return false;
  const net1 = ip1.split(".").slice(0, 3).join(".");
  const net2 = ip2.split(".").slice(0, 3).join(".");
  return net1 === net2;
}

// 全ルータのインターフェース情報を検索し、指定されたGWに一致するポートを持つルータオブジェクトを抽出
function findRouterPortByIp(ip) {
  const nodes = getAllNodes();
  for (const node of nodes) {
    if (node.dataset.type === "router") {
      for (const p of node.ports) {
        if (p.circle.dataset.ip === ip) return { routerNode: node, routerPort: p.circle };
      }
    }
  }
  return null;
}

// 算出された経路に沿ってノード間をアニメーション
async function travelSegmentPT(pathNodes, isReply = false) {
  const pduColor = isReply ? "#2ecc71" : "#9b59b6";
  for (let i = 0; i < pathNodes.length - 1; i++) {
    const a = pathNodes[i];
    const b = pathNodes[i + 1];
    const conn = findConnection(a, b);
    if (!conn) return false;

    let fromPort, toPort;
    if (conn.a.node === a && conn.b.node === b) { fromPort = conn.a.port; toPort = conn.b.port; }
    else { fromPort = conn.b.port; toPort = conn.a.port; }

    if (!sameVlanByPort(conn)) {
      await animatePacketTracer(fromPort, toPort, 1000, "#e74c3c", true);
      return false;
    }

    await animatePacketTracer(fromPort, toPort, 1200, pduColor, false);
    await new Promise(r => setTimeout(r, 400));
  }
  return true;
}

// 同一サブネットまたはデフォルトゲートウェイ経由のL2/L3経路探索を行い、パケットの巡回シミュレート
async function ping(fromId, toId) {
  const fromNode = findNodeById(fromId);
  const toNode = findNodeById(toId);
  if (!fromNode || !toNode) { setStatus("error", "PING: host not found"); return false; }
  if (fromNode === toNode) { setStatus("warn", "PING: same node"); return true; }

  const fromIp = fromNode.dataset.ip;
  const toIp = toNode.dataset.ip;
  if (!fromIp || !toIp) { setStatus("error", "PING FAILED: IP NOT CONFIGURED"); return false; }

  setStatus("ok", "PING FLOW START (Simulation Mode)");
  const sameSubnet = isSameSubnet(fromIp, toIp);

  if (sameSubnet) {
    const requestPath = findL2Path(fromNode, toNode);
    if (!requestPath) { setStatus("error", "PING FAILED: NO L2 PATH"); return false; }

    const reqOk = await travelSegmentPT(requestPath, false);
    if (!reqOk) { setStatus("error", "PING FAILED: DROP ON PATH"); return false; }

    await new Promise(r => setTimeout(r, 500));
    const replyPath = [...requestPath].reverse();
    await travelSegmentPT(replyPath, true);

    setStatus("ok", "PING SUCCESS (Reply Received)");
    return true;
  } else {
    const gwIp = fromNode.dataset.gateway;
    if (!gwIp) { setStatus("error", "PING FAILED: NO GATEWAY"); return false; }

    const routerTarget = findRouterPortByIp(gwIp);
    if (!routerTarget) { setStatus("error", "PING FAILED: GATEWAY UNREACHABLE"); return false; }

    const { routerNode } = routerTarget;
    
    const pathSrcToRouter = findL2Path(fromNode, routerNode);
    if (!pathSrcToRouter) { setStatus("error", "PING FAILED: CANNOT REACH GATEWAY"); return false; }

    let pathRouterToDst = findL2Path(routerNode, toNode, toIp);

    if (!pathRouterToDst) {
      const otherRouter = findConnectedRouter(routerNode);
      if (otherRouter) {
        const pathToOther = findL2Path(routerNode, otherRouter);
        const pathFromOther = findL2Path(otherRouter, toNode, toIp);

        if (pathToOther && pathFromOther) {
          pathRouterToDst = [...pathToOther, ...pathFromOther.slice(1)];
        }
      }
    }
    if (!pathRouterToDst) {
      setStatus("error", "ROUTE NOT FOUND");
      return false;
    }
    if (!routerCanReach(toIp, routerNode)) { setStatus("error", "PING FAILED: DESTINATION UNREACHABLE FROM ROUTER"); return false; }

    const req1Ok = await travelSegmentPT(pathSrcToRouter, false);
    if (!req1Ok) return false;
    const req2Ok = await travelSegmentPT(pathRouterToDst, false);
    if (!req2Ok) return false;

    await new Promise(r => setTimeout(r, 500));

    const dstGwIp = toNode.dataset.gateway;
    if (!dstGwIp) { setStatus("error", "PING FAILED: DESTINATION HAS NO GW FOR REPLY"); return false; }

    let hasValidGwPort = routerNode.ports.some(p =>
      p.circle.dataset.ip === dstGwIp
    );

    if (!hasValidGwPort) {
      const otherRouter = findConnectedRouter(routerNode);
      if (otherRouter) {
        hasValidGwPort = otherRouter.ports.some(p =>
          p.circle.dataset.ip === dstGwIp
        );
      }
    }

    if (!hasValidGwPort) {
      setStatus("error", "PING FAILED: DESTINATION GW INVALID FOR REPLY");
      return false;
    }

    const replyPathDstToRouter = [...pathRouterToDst].reverse();
    const replyPathRouterToSrc = [...pathSrcToRouter].reverse();

    const rep1Ok = await travelSegmentPT(replyPathDstToRouter, true);
    if (!rep1Ok) return false;
    const rep2Ok = await travelSegmentPT(replyPathRouterToSrc, true);
    if (!rep2Ok) return false;

    setStatus("ok", "PING SUCCESS (Layer 3 Routed)");
    return true;
  }
}

// 結果やエラーに応じた色のテキストメッセージを表示・書き換え
function setStatus(type, message) {
  if (!status) return;
  status.textContent = message;
  status.style.color = type === "ok" ? "#2ecc71" : type === "error" ? "#e74c3c" : "#f39c12";
}

function getPortPos(port) {
  const pt = workspace.createSVGPoint();
  pt.x = parseFloat(port.getAttribute("cx") || 0);
  pt.y = parseFloat(port.getAttribute("cy") || 0);
  const matrix = port.getTransformToElement ? port.getTransformToElement(workspace) : port.ownerSVGElement.getScreenCTM().inverse().multiply(port.getScreenCTM());
  return pt.matrixTransform(matrix);
}

// Ping実行
pingBtn.addEventListener("click", async () => {
  try {
    const from = pingFrom.value;
    const to = pingTo.value;
    await ping(from, to);
  } catch (e) {
    console.error("PING ERROR:", e);
  }
});

// ルータに直接接続されているルータが存在するかを検索、存在する場合はそのルータを返す
function findConnectedRouter(router) {
  const conn = connections.find(c =>
    (c.a.node === router && c.b.node.dataset.type === "router") ||
    (c.b.node === router && c.a.node.dataset.type === "router")
  );

  if (!conn) return null;

  return (conn.a.node === router) ? conn.b.node : conn.a.node;
}

// ルータ自身のインターフェース、隣接ルータの持つインターフェースに対象IPのサブネットルートが存在するか検証
function routerCanReach(targetIp, router) {
  for (const p of router.ports) {
    if (isSameSubnet(p.circle.dataset.ip, targetIp)) {
      return true;
    }
  }

  const otherRouter = findConnectedRouter(router);
  if (!otherRouter) return false;

  for (const p of otherRouter.ports) {
    if (isSameSubnet(p.circle.dataset.ip, targetIp)) {
      return true;
    }
  }

  return false;
}