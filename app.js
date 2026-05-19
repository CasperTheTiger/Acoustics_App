const canvas = document.querySelector("#channelCanvas");
const ctx = canvas.getContext("2d");

const playButton = document.querySelector("#playButton");
const resetButton = document.querySelector("#resetButton");
const speedSlider = document.querySelector("#speedSlider");
const speedValue = document.querySelector("#speedValue");
const jamToggle = document.querySelector("#jamToggle");
const spoofToggle = document.querySelector("#spoofToggle");
const acousticToggle = document.querySelector("#acousticToggle");

const integrityStatus = document.querySelector("#integrityStatus");
const acousticStatus = document.querySelector("#acousticStatus");
const positionReadout = document.querySelector("#positionReadout");
const riskReadout = document.querySelector("#riskReadout");
const gpsConfidence = document.querySelector("#gpsConfidence");
const acousticConfidence = document.querySelector("#acousticConfidence");
const positionDelta = document.querySelector("#positionDelta");
const hazardDistance = document.querySelector("#hazardDistance");
const decisionText = document.querySelector("#decisionText");

const hazards = [
  { x: 0.38, y: 0.28, r: 0.035, label: "Rock shelf" },
  { x: 0.62, y: 0.48, r: 0.04, label: "Wreck" },
  { x: 0.43, y: 0.72, r: 0.045, label: "Shoal" }
];

const beacons = [
  { x: 0.18, y: 0.2, label: "A1" },
  { x: 0.83, y: 0.32, label: "A2" },
  { x: 0.22, y: 0.82, label: "A3" },
  { x: 0.78, y: 0.78, label: "A4" }
];

let progress = 0;
let isPlaying = true;
let lastFrame = performance.now();
let gpsTrail = [];
let acousticTrail = [];

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
  const noise = shadowZone ? 0.035 : 0.017;
  return noisyFix(vessel, noise, 4.7);
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

function drawChannel() {
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

function drawBuoy(point, color) {
  const p = toCanvas(point);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawHazards() {
  hazards.forEach((hazard) => {
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
    ctx.fillText(hazard.label, p.x, p.y + radius + 18);
  });
}

function drawBeacons() {
  beacons.forEach((beacon) => {
    const p = toCanvas(beacon);
    ctx.fillStyle = "#7357c8";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#162026";
    ctx.font = "800 12px system-ui";
    ctx.fillText(beacon.label, p.x, p.y - 14);
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
  const closestHazard = Math.min(
    ...hazards.map((hazard) => (distance(vessel, hazard) - hazard.r) * 1852)
  );

  const gpsScore = spoofToggle.checked ? 42 : jamToggle.checked ? 38 : Math.max(62, 98 - gpsError * 0.9);
  const acousticScore = acoustic ? Math.max(44, 92 - acousticError * 0.75) : 0;
  const risk = closestHazard < 60 || delta > 130 ? "High" : closestHazard < 120 || delta > 70 ? "Medium" : "Low";

  positionReadout.textContent = `${(progress * 4.8).toFixed(1)} nm`;
  riskReadout.textContent = risk;
  riskReadout.className = risk === "High" ? "is-danger" : risk === "Medium" ? "is-warning" : "is-good";
  gpsConfidence.textContent = `${Math.round(gpsScore)}%`;
  acousticConfidence.textContent = acoustic ? `${Math.round(acousticScore)}%` : "Off";
  positionDelta.textContent = `${Math.round(delta)} m`;
  hazardDistance.textContent = closestHazard < 0 ? "Inside danger" : `${Math.round(closestHazard)} m`;

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
  gpsTrail = gpsTrail.slice(-90);
  acousticTrail = acousticTrail.slice(-90);

  drawChannel();
  drawHazards();
  drawBeacons();
  drawTrail(gpsTrail, "rgba(36, 95, 211, 0.78)");
  drawTrail(acousticTrail, "rgba(115, 87, 200, 0.7)");
  drawFix(gps, "#245fd3", jamToggle.checked || spoofToggle.checked ? 24 : 14);
  drawFix(acoustic, "#7357c8", 17);
  drawVessel(vessel);
  updateReadouts(vessel, gps, acoustic);
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
});

speedSlider.addEventListener("input", () => {
  speedValue.textContent = `${speedSlider.value} kn`;
});

[jamToggle, spoofToggle, acousticToggle].forEach((control) => {
  control.addEventListener("change", () => {
    if (control === jamToggle && control.checked) spoofToggle.checked = false;
    if (control === spoofToggle && control.checked) jamToggle.checked = false;
    gpsTrail = [];
    acousticTrail = [];
  });
});

drawFrame();
requestAnimationFrame(animate);
