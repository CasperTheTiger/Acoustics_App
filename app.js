const canvas = document.querySelector("#channelCanvas");
const ctx = canvas.getContext("2d");

const playButton = document.querySelector("#playButton");
const resetButton = document.querySelector("#resetButton");
const speedSlider = document.querySelector("#speedSlider");
const speedValue = document.querySelector("#speedValue");
const jamToggle = document.querySelector("#jamToggle");
const spoofToggle = document.querySelector("#spoofToggle");
const acousticToggle = document.querySelector("#acousticToggle");
const mapUpload = document.querySelector("#mapUpload");
const markThreatButton = document.querySelector("#markThreatButton");
const clearThreatsButton = document.querySelector("#clearThreatsButton");
const mapHint = document.querySelector("#mapHint");
const resetBeaconsButton = document.querySelector("#resetBeaconsButton");
const toggleBeaconsButton = document.querySelector("#toggleBeaconsButton");
const beaconControls = document.querySelector("#beaconControls");
const acousticPanel = document.querySelector(".acoustic-panel");
const differenceCanvas = document.querySelector("#differenceCanvas");
const differenceCtx = differenceCanvas.getContext("2d");

const integrityStatus = document.querySelector("#integrityStatus");
const acousticStatus = document.querySelector("#acousticStatus");
const positionReadout = document.querySelector("#positionReadout");
const riskReadout = document.querySelector("#riskReadout");
const gpsConfidence = document.querySelector("#gpsConfidence");
const acousticConfidence = document.querySelector("#acousticConfidence");
const positionDelta = document.querySelector("#positionDelta");
const hazardDistance = document.querySelector("#hazardDistance");
const decisionText = document.querySelector("#decisionText");
const graphPeak = document.querySelector("#graphPeak");

const defaultHazards = [
  { x: 0.38, y: 0.28, r: 0.035, label: "Rock shelf" },
  { x: 0.62, y: 0.48, r: 0.04, label: "Wreck" },
  { x: 0.43, y: 0.72, r: 0.045, label: "Shoal" }
];

const defaultBeacons = [
  { x: 0.18, y: 0.2, accuracy: 28, label: "A1" },
  { x: 0.83, y: 0.32, accuracy: 42, label: "A2" },
  { x: 0.22, y: 0.82, accuracy: 35, label: "A3" },
  { x: 0.78, y: 0.78, accuracy: 24, label: "A4" }
];

let hazards = defaultHazards.map((hazard) => ({ ...hazard }));
let beacons = defaultBeacons.map((beacon) => ({ ...beacon }));
let progress = 0;
let isPlaying = true;
let lastFrame = performance.now();
let gpsTrail = [];
let acousticTrail = [];
let differenceHistory = [];
let draggedBeacon = null;
let mapImage = null;
let isMarkingThreats = false;

function centerline(t) {
  return {
    x: 0.5 + Math.sin(t * Math.PI * 2.2) * 0.14 + Math.sin(t * Math.PI * 6) * 0.025,
    y: 0.08 + t * 0.84
  };
}

function channelWidth(t) {
  return 0.17 - Math.sin(t * Math.PI) * 0.045 + Math.sin(t * Math.PI * 5) * 0.012;
}

function vesselState(t) {
  const ahead = centerline(Math.min(1, t + 0.01));
  const current = centerline(t);
  return {
    ...current,
    heading: Math.atan2(ahead.y - current.y, ahead.x - current.x)
  };
}

function noisyFix(point, scale, timeOffset = 0) {
  return {
    x: point.x + Math.sin(progress * 30 + timeOffset) * scale,
    y: point.y + Math.cos(progress * 25 + timeOffset) * scale
  };
}

function gpsFix(vessel) {
  if (jamToggle.checked) {
    return noisyFix(vessel, 0.055, 2.3);
  }

  if (spoofToggle.checked) {
    return {
      x: vessel.x + 0.075 + Math.sin(progress * 6) * 0.018,
      y: vessel.y - 0.045 + Math.cos(progress * 4) * 0.012
    };
  }

  return noisyFix(vessel, 0.009, 1.1);
}

function acousticFix(vessel) {
  if (!acousticToggle.checked) return null;
  const shadowZone = Math.abs(progress - 0.58) < 0.08;
  const averageAccuracy = beacons.reduce((sum, beacon) => sum + beacon.accuracy, 0) / beacons.length;
  const geometryPenalty = beaconGeometryPenalty(vessel);
  const noiseMeters = averageAccuracy * geometryPenalty * (shadowZone ? 1.8 : 1);
  return noisyFix(vessel, noiseMeters / 1852, 4.7);
}

function toCanvas(point) {
  return {
    x: point.x * canvas.width,
    y: point.y * canvas.height
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function beaconGeometryPenalty(vessel) {
  const nearest = Math.min(...beacons.map((beacon) => distance(vessel, beacon)));
  const farthest = Math.max(...beacons.map((beacon) => distance(vessel, beacon)));
  const spread = Math.max(0.08, farthest - nearest);
  return clamp(1.35 - spread, 0.85, 1.45);
}

function beaconQuality(beacon) {
  if (beacon.accuracy <= 30) return "High";
  if (beacon.accuracy <= 60) return "Medium";
  return "Low";
}

function drawChannel() {
  if (mapImage) {
    drawUploadedMap();
    drawRouteOverlay();
    return;
  }

  ctx.fillStyle = "#8fc7d0";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#8b8f6a";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let i = 0; i <= 160; i += 1) {
    const t = i / 160;
    const c = centerline(t);
    const w = channelWidth(t);
    ctx.lineTo((c.x - w - 0.18) * canvas.width, c.y * canvas.height);
  }
  ctx.lineTo(0, canvas.height);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(canvas.width, 0);
  for (let i = 0; i <= 160; i += 1) {
    const t = i / 160;
    const c = centerline(t);
    const w = channelWidth(t);
    ctx.lineTo((c.x + w + 0.18) * canvas.width, c.y * canvas.height);
  }
  ctx.lineTo(canvas.width, canvas.height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.68)";
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 12]);
  ctx.beginPath();
  for (let i = 0; i <= 120; i += 1) {
    const point = toCanvas(centerline(i / 120));
    if (i === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = 0; i <= 7; i += 1) {
    const t = i / 7;
    const c = centerline(t);
    const w = channelWidth(t);
    drawBuoy({ x: c.x - w, y: c.y }, "#d53f48");
    drawBuoy({ x: c.x + w, y: c.y }, "#1f8a65");
  }
}

function drawUploadedMap() {
  ctx.fillStyle = "#102f38";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const scale = Math.max(canvas.width / mapImage.width, canvas.height / mapImage.height);
  const drawWidth = mapImage.width * scale;
  const drawHeight = mapImage.height * scale;
  const x = (canvas.width - drawWidth) / 2;
  const y = (canvas.height - drawHeight) / 2;

  ctx.drawImage(mapImage, x, y, drawWidth, drawHeight);
  ctx.fillStyle = "rgba(9, 26, 31, 0.16)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawRouteOverlay() {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.78)";
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 12]);
  ctx.beginPath();
  for (let i = 0; i <= 120; i += 1) {
    const point = toCanvas(centerline(i / 120));
    if (i === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBuoy(point, color) {
  const p = toCanvas(point);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawHazards() {
  hazards.forEach((hazard, index) => {
    const p = toCanvas(hazard);
    const radius = hazard.r * canvas.width;
    ctx.fillStyle = "rgba(199, 77, 82, 0.82)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(82, 23, 28, 0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 13px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(hazard.label || `Threat ${index + 1}`, p.x, p.y + radius + 18);
  });
}

function drawBeacons() {
  beacons.forEach((beacon) => {
    const p = toCanvas(beacon);
    const ringRadius = (beacon.accuracy / 1852) * canvas.width;
    ctx.fillStyle = "rgba(115, 87, 200, 0.08)";
    ctx.strokeStyle = "rgba(115, 87, 200, 0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, ringRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#7357c8";
    ctx.beginPath();
    ctx.arc(p.x, p.y, draggedBeacon === beacon ? 11 : 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#162026";
    ctx.font = "800 12px system-ui";
    ctx.fillText(beacon.label, p.x, p.y - 14);
    ctx.fillStyle = "#3b2a76";
    ctx.font = "800 11px system-ui";
    ctx.fillText(`${beacon.accuracy} m`, p.x, p.y + ringRadius + 14);
  });
}

function drawTrail(points, color) {
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((point, index) => {
    const p = toCanvas(point);
    if (index === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
}

function drawFix(point, color, radius) {
  if (!point) return;
  const p = toCanvas(point);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p.x - radius - 6, p.y);
  ctx.lineTo(p.x + radius + 6, p.y);
  ctx.moveTo(p.x, p.y - radius - 6);
  ctx.lineTo(p.x, p.y + radius + 6);
  ctx.stroke();
}

function drawDifferenceGraph() {
  const width = differenceCanvas.width;
  const height = differenceCanvas.height;
  const maxMeters = 300;
  const dangerLine = 130;
  const warningLine = 70;

  differenceCtx.clearRect(0, 0, width, height);
  differenceCtx.fillStyle = "#ffffff";
  differenceCtx.fillRect(0, 0, width, height);

  differenceCtx.strokeStyle = "#dfe7ea";
  differenceCtx.lineWidth = 1;
  for (let i = 0; i <= 3; i += 1) {
    const y = height - (i / 3) * height;
    differenceCtx.beginPath();
    differenceCtx.moveTo(0, y);
    differenceCtx.lineTo(width, y);
    differenceCtx.stroke();
  }

  drawThresholdLine(warningLine, "#d59b2d", maxMeters);
  drawThresholdLine(dangerLine, "#c74d52", maxMeters);

  if (differenceHistory.length > 1) {
    differenceCtx.strokeStyle = "#7357c8";
    differenceCtx.lineWidth = 4;
    differenceCtx.lineJoin = "round";
    differenceCtx.beginPath();
    differenceHistory.forEach((value, index) => {
      const x = (index / Math.max(1, differenceHistory.length - 1)) * width;
      const y = height - (clamp(value, 0, maxMeters) / maxMeters) * height;
      if (index === 0) differenceCtx.moveTo(x, y);
      else differenceCtx.lineTo(x, y);
    });
    differenceCtx.stroke();
  }

  differenceCtx.fillStyle = "#60717b";
  differenceCtx.font = "800 16px system-ui";
  differenceCtx.fillText("130 m", 10, height - (dangerLine / maxMeters) * height - 7);
  differenceCtx.fillText("70 m", 10, height - (warningLine / maxMeters) * height - 7);
}

function drawThresholdLine(value, color, maxMeters) {
  const y = differenceCanvas.height - (value / maxMeters) * differenceCanvas.height;
  differenceCtx.strokeStyle = color;
  differenceCtx.lineWidth = 2;
  differenceCtx.setLineDash([8, 8]);
  differenceCtx.beginPath();
  differenceCtx.moveTo(0, y);
  differenceCtx.lineTo(differenceCanvas.width, y);
  differenceCtx.stroke();
  differenceCtx.setLineDash([]);
}

function drawVessel(vessel) {
  const p = toCanvas(vessel);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(vessel.heading + Math.PI / 2);
  ctx.fillStyle = "#162026";
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(13, 16);
  ctx.lineTo(0, 24);
  ctx.lineTo(-13, 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-5, -3, 10, 18);
  ctx.restore();
}

function updateReadouts(vessel, gps, acoustic) {
  const gpsError = distance(vessel, gps) * 1852;
  const acousticError = acoustic ? distance(vessel, acoustic) * 1852 : null;
  const delta = acoustic ? distance(gps, acoustic) * 1852 : gpsError;
  const closestHazard = hazards.length
    ? Math.min(...hazards.map((hazard) => (distance(vessel, hazard) - hazard.r) * 1852))
    : Infinity;

  const gpsScore = spoofToggle.checked ? 42 : jamToggle.checked ? 38 : Math.max(62, 98 - gpsError * 0.9);
  const averageBeaconAccuracy = beacons.reduce((sum, beacon) => sum + beacon.accuracy, 0) / beacons.length;
  const acousticScore = acoustic ? Math.max(28, 96 - acousticError * 0.55 - averageBeaconAccuracy * 0.32) : 0;
  const risk = closestHazard < 60 || delta > 130 ? "High" : closestHazard < 120 || delta > 70 ? "Medium" : "Low";
  const peakDelta = differenceHistory.length ? Math.max(...differenceHistory) : 0;

  positionReadout.textContent = `${(progress * 4.8).toFixed(1)} nm`;
  riskReadout.textContent = risk;
  riskReadout.className = risk === "High" ? "is-danger" : risk === "Medium" ? "is-warning" : "is-good";
  gpsConfidence.textContent = `${Math.round(gpsScore)}%`;
  acousticConfidence.textContent = acoustic ? `${Math.round(acousticScore)}%` : "Off";
  positionDelta.textContent = `${Math.round(delta)} m`;
  graphPeak.textContent = `Peak ${Math.round(peakDelta)} m`;
  hazardDistance.textContent = Number.isFinite(closestHazard)
    ? closestHazard < 0 ? "Inside danger" : `${Math.round(closestHazard)} m`
    : "Clear";

  if (jamToggle.checked) {
    integrityStatus.textContent = "GPS jamming suspected";
    integrityStatus.className = "is-warning";
  } else if (spoofToggle.checked || delta > 130) {
    integrityStatus.textContent = "GPS spoofing suspected";
    integrityStatus.className = "is-danger";
  } else {
    integrityStatus.textContent = "GPS normal";
    integrityStatus.className = "is-good";
  }

  acousticStatus.textContent = acoustic ? "Acoustic fix active" : "Acoustic fix off";
  acousticStatus.className = acoustic ? "is-good" : "is-warning";

  if (closestHazard < 60) {
    decisionText.textContent = "Hazard margin is tight. Slow down and favor the acoustic-supported track through the channel.";
  } else if (spoofToggle.checked || delta > 130) {
    decisionText.textContent = "GPS and acoustics disagree. Treat GPS as unreliable and use acoustics as a cross-check.";
  } else if (jamToggle.checked) {
    decisionText.textContent = "GPS signal quality is degraded. Acoustic positioning is preserving a usable relative fix.";
  } else if (!acoustic) {
    decisionText.textContent = "Acoustic support is disabled. GPS is the only active position source.";
  } else {
    decisionText.textContent = "Transit is stable. GPS and acoustics agree.";
  }
}

function drawFrame() {
  const vessel = vesselState(progress);
  const gps = gpsFix(vessel);
  const acoustic = acousticFix(vessel);

  gpsTrail.push(gps);
  if (acoustic) acousticTrail.push(acoustic);
  if (acoustic) differenceHistory.push(distance(gps, acoustic) * 1852);
  gpsTrail = gpsTrail.slice(-90);
  acousticTrail = acousticTrail.slice(-90);
  differenceHistory = differenceHistory.slice(-150);

  drawChannel();
  drawHazards();
  drawBeacons();
  drawTrail(gpsTrail, "rgba(36, 95, 211, 0.78)");
  drawTrail(acousticTrail, "rgba(115, 87, 200, 0.7)");
  drawFix(gps, "#245fd3", jamToggle.checked || spoofToggle.checked ? 24 : 14);
  drawFix(acoustic, "#7357c8", 17);
  drawVessel(vessel);
  drawDifferenceGraph();
  updateReadouts(vessel, gps, acoustic);
}

function renderBeaconControls() {
  beaconControls.innerHTML = "";

  beacons.forEach((beacon, index) => {
    const card = document.createElement("article");
    card.className = "beacon-card";
    card.innerHTML = `
      <header>
        <span class="beacon-swatch">${beacon.label}</span>
        <div>
          <h3>Beacon ${beacon.label}</h3>
          <p>${beaconQuality(beacon)} accuracy</p>
        </div>
      </header>
      <div class="beacon-fields">
        <label>
          X %
          <input type="number" min="3" max="97" step="1" value="${Math.round(beacon.x * 100)}" data-field="x" data-index="${index}">
        </label>
        <label>
          Y %
          <input type="number" min="3" max="97" step="1" value="${Math.round(beacon.y * 100)}" data-field="y" data-index="${index}">
        </label>
        <label>
          Accuracy m
          <input type="number" min="10" max="120" step="1" value="${beacon.accuracy}" data-field="accuracy" data-index="${index}">
        </label>
      </div>
    `;
    beaconControls.append(card);
  });
}

function updateBeaconFromInput(input, shouldRender = true) {
  const beacon = beacons[Number(input.dataset.index)];
  const field = input.dataset.field;
  const value = Number(input.value);

  if (field === "x") beacon.x = clamp(value / 100, 0.03, 0.97);
  if (field === "y") beacon.y = clamp(value / 100, 0.03, 0.97);
  if (field === "accuracy") beacon.accuracy = Math.round(clamp(value, 10, 120));

  acousticTrail = [];
  differenceHistory = [];
  if (shouldRender) renderBeaconControls();
}

function pointerToChart(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0.03, 0.97),
    y: clamp((event.clientY - rect.top) / rect.height, 0.03, 0.97)
  };
}

function addThreat(point) {
  hazards.push({
    x: point.x,
    y: point.y,
    r: 0.035,
    label: `Threat ${hazards.length + 1}`
  });
  updateMapHint();
}

function updateMapHint() {
  const mapText = mapImage ? "Uploaded map active" : "Simulated channel active";
  const modeText = isMarkingThreats ? "Click the map to add threats." : "Turn on Mark threats to identify hazards.";
  mapHint.textContent = `${mapText}. ${hazards.length} threats marked. ${modeText}`;
}

function nearestBeacon(point) {
  return beacons.reduce(
    (nearest, beacon) => {
      const gap = distance(point, beacon);
      return gap < nearest.gap ? { beacon, gap } : nearest;
    },
    { beacon: null, gap: Infinity }
  );
}

function animate(now) {
  const elapsed = Math.min(80, now - lastFrame);
  lastFrame = now;

  if (isPlaying) {
    progress += (Number(speedSlider.value) / 8) * elapsed * 0.000035;
    if (progress > 1) progress = 0;
  }

  drawFrame();
  requestAnimationFrame(animate);
}

playButton.addEventListener("click", () => {
  isPlaying = !isPlaying;
  playButton.textContent = isPlaying ? "Pause" : "Play";
});

resetButton.addEventListener("click", () => {
  progress = 0;
  gpsTrail = [];
  acousticTrail = [];
  differenceHistory = [];
});

mapUpload.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const image = new Image();
    image.addEventListener("load", () => {
      mapImage = image;
      hazards = [];
      gpsTrail = [];
      acousticTrail = [];
      differenceHistory = [];
      updateMapHint();
    });
    image.src = reader.result;
  });
  reader.readAsDataURL(file);
});

markThreatButton.addEventListener("click", () => {
  isMarkingThreats = !isMarkingThreats;
  markThreatButton.setAttribute("aria-pressed", String(isMarkingThreats));
  markThreatButton.textContent = isMarkingThreats ? "Marking on" : "Mark threats";
  updateMapHint();
});

clearThreatsButton.addEventListener("click", () => {
  hazards = [];
  updateMapHint();
});

speedSlider.addEventListener("input", () => {
  speedValue.textContent = `${speedSlider.value} kn`;
});

beaconControls.addEventListener("change", (event) => {
  if (event.target.matches("input")) updateBeaconFromInput(event.target);
});

beaconControls.addEventListener("input", (event) => {
  if (event.target.matches("input")) updateBeaconFromInput(event.target, false);
});

resetBeaconsButton.addEventListener("click", () => {
  beacons = defaultBeacons.map((beacon) => ({ ...beacon }));
  acousticTrail = [];
  differenceHistory = [];
  renderBeaconControls();
});

toggleBeaconsButton.addEventListener("click", () => {
  const isCollapsed = acousticPanel.classList.toggle("is-collapsed");
  toggleBeaconsButton.textContent = isCollapsed ? "Expand" : "Collapse";
  toggleBeaconsButton.setAttribute("aria-expanded", String(!isCollapsed));
});

canvas.addEventListener("pointerdown", (event) => {
  const point = pointerToChart(event);
  if (isMarkingThreats) {
    addThreat(point);
    return;
  }

  const nearest = nearestBeacon(point);
  if (nearest.gap > 0.055) return;
  draggedBeacon = nearest.beacon;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!draggedBeacon) return;
  const point = pointerToChart(event);
  draggedBeacon.x = point.x;
  draggedBeacon.y = point.y;
  acousticTrail = [];
  differenceHistory = [];
  renderBeaconControls();
});

canvas.addEventListener("pointerup", () => {
  draggedBeacon = null;
});

canvas.addEventListener("pointercancel", () => {
  draggedBeacon = null;
});

[jamToggle, spoofToggle, acousticToggle].forEach((control) => {
  control.addEventListener("change", () => {
    if (control === jamToggle && control.checked) spoofToggle.checked = false;
    if (control === spoofToggle && control.checked) jamToggle.checked = false;
    gpsTrail = [];
    acousticTrail = [];
    differenceHistory = [];
  });
});

renderBeaconControls();
updateMapHint();
drawFrame();
requestAnimationFrame(animate);
