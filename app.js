const canvas = document.querySelector("#channelCanvas");
const ctx = canvas.getContext("2d");

const playButton = document.querySelector("#playButton");
const resetButton = document.querySelector("#resetButton");
const speedSlider = document.querySelector("#speedSlider");
const speedValue = document.querySelector("#speedValue");
const jamToggle = document.querySelector("#jamToggle");
const spoofToggle = document.querySelector("#spoofToggle");
const acousticToggle = document.querySelector("#acousticToggle");
const soundSpeedSlider = document.querySelector("#soundSpeedSlider");
const soundSpeedValue = document.querySelector("#soundSpeedValue");
const clockSyncToggle = document.querySelector("#clockSyncToggle");
const fusionToggle = document.querySelector("#fusionToggle");
const solverModeInputs = document.querySelectorAll("input[name='solverMode']");
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
const toaReadout = document.querySelector("#toaReadout");
const tdoaReadout = document.querySelector("#tdoaReadout");
const bearingReadout = document.querySelector("#bearingReadout");
const dopReadout = document.querySelector("#dopReadout");
const covarianceReadout = document.querySelector("#covarianceReadout");
const fusionReadout = document.querySelector("#fusionReadout");

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
let fusedTrail = [];
let differenceHistory = [];
let draggedBeacon = null;
let mapImage = null;
let isMarkingThreats = false;
let fusedPosition = null;

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

function currentSolverMode() {
  return document.querySelector("input[name='solverMode']:checked")?.value || "toa";
}

function averageBeaconAccuracy() {
  return beacons.reduce((sum, beacon) => sum + beacon.accuracy, 0) / beacons.length;
}

function simulatedMeasurementNoise(beacon, index) {
  const shadowZone = Math.abs(progress - 0.58) < 0.08;
  const shadowScale = shadowZone ? 1.75 : 1;
  const wave = Math.sin(progress * 24 + index * 1.9) * 0.55 + Math.cos(progress * 17 + index) * 0.25;
  return wave * beacon.accuracy * 0.32 * shadowScale;
}

function acousticMeasurements(vessel) {
  const soundSpeed = Number(soundSpeedSlider.value);
  const clockBiasMeters = clockSyncToggle.checked ? 0 : Math.sin(progress * 8.5) * 34;

  return beacons.map((beacon, index) => {
    const trueRangeMeters = distance(vessel, beacon) * 1852;
    const measuredRangeMeters = trueRangeMeters + simulatedMeasurementNoise(beacon, index) + clockBiasMeters;
    return {
      beacon,
      measuredRangeMeters,
      timeSeconds: measuredRangeMeters / soundSpeed,
      weight: 1 / Math.max(1, beacon.accuracy * beacon.accuracy)
    };
  });
}

function leastSquaresMultilateration(measurements, mode) {
  let estimate = acousticTrail.length ? { ...acousticTrail[acousticTrail.length - 1] } : centerline(progress);
  const reference = measurements[0];
  const damping = 0.000001;

  for (let iteration = 0; iteration < 8; iteration += 1) {
    let a = damping;
    let b = 0;
    let d = damping;
    let e = 0;
    let f = 0;

    measurements.forEach((measurement, index) => {
      if (mode === "tdoa" && index === 0) return;

      const range = Math.max(distance(estimate, measurement.beacon), 0.0001);
      const unitX = (estimate.x - measurement.beacon.x) / range;
      const unitY = (estimate.y - measurement.beacon.y) / range;
      let residual;
      let hX;
      let hY;

      if (mode === "tdoa") {
        const referenceRange = Math.max(distance(estimate, reference.beacon), 0.0001);
        const refUnitX = (estimate.x - reference.beacon.x) / referenceRange;
        const refUnitY = (estimate.y - reference.beacon.y) / referenceRange;
        const predictedDiff = (range - referenceRange) * 1852;
        const measuredDiff = measurement.measuredRangeMeters - reference.measuredRangeMeters;
        residual = predictedDiff - measuredDiff;
        hX = (unitX - refUnitX) * 1852;
        hY = (unitY - refUnitY) * 1852;
      } else {
        residual = range * 1852 - measurement.measuredRangeMeters;
        hX = unitX * 1852;
        hY = unitY * 1852;
      }

      const weight = measurement.weight;
      a += weight * hX * hX;
      b += weight * hX * hY;
      d += weight * hY * hY;
      e += weight * hX * residual;
      f += weight * hY * residual;
    });

    const det = a * d - b * b;
    if (Math.abs(det) < 0.0000001) break;

    const stepX = (d * e - b * f) / det;
    const stepY = (-b * e + a * f) / det;
    estimate.x = clamp(estimate.x - stepX, 0.03, 0.97);
    estimate.y = clamp(estimate.y - stepY, 0.03, 0.97);

    if (Math.hypot(stepX, stepY) < 0.00001) break;
  }

  return estimate;
}

function geometryStats(position, mode) {
  const reference = beacons[0];
  const averageAccuracy = averageBeaconAccuracy();
  let a = 0.000001;
  let b = 0;
  let d = 0.000001;

  beacons.forEach((beacon, index) => {
    if (mode === "tdoa" && index === 0) return;

    const range = Math.max(distance(position, beacon), 0.0001);
    let hX = (position.x - beacon.x) / range;
    let hY = (position.y - beacon.y) / range;

    if (mode === "tdoa") {
      const refRange = Math.max(distance(position, reference), 0.0001);
      hX -= (position.x - reference.x) / refRange;
      hY -= (position.y - reference.y) / refRange;
    }

    a += hX * hX;
    b += hX * hY;
    d += hY * hY;
  });

  const det = a * d - b * b;
  const invA = d / det;
  const invB = -b / det;
  const invD = a / det;
  const dop = Math.sqrt(Math.max(0, invA + invD));
  const sigmaX = Math.sqrt(Math.abs(invA)) * averageAccuracy;
  const sigmaY = Math.sqrt(Math.abs(invD)) * averageAccuracy;
  const covarianceXY = invB * averageAccuracy * averageAccuracy;
  const quality = dop < 1.8 ? "Strong" : dop < 3 ? "Fair" : "Weak";

  return { dop, sigmaX, sigmaY, covarianceXY, quality };
}

function bearingFromNearestBeacon(position) {
  const nearest = beacons.reduce((best, beacon) => {
    const gap = distance(position, beacon);
    return gap < best.gap ? { beacon, gap } : best;
  }, { beacon: beacons[0], gap: Infinity }).beacon;
  const dx = position.x - nearest.x;
  const dy = nearest.y - position.y;
  return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
}

function fusePositions(gps, acoustic, stats) {
  if (!fusionToggle.checked || !acoustic) {
    fusedPosition = null;
    return null;
  }

  const gpsVariance = (jamToggle.checked ? 120 : spoofToggle.checked ? 180 : 28) ** 2;
  const acousticVariance = Math.max(12, (stats.sigmaX + stats.sigmaY) / 2) ** 2;
  const gpsWeight = 1 / gpsVariance;
  const acousticWeight = 1 / acousticVariance;
  const measurement = {
    x: (gps.x * gpsWeight + acoustic.x * acousticWeight) / (gpsWeight + acousticWeight),
    y: (gps.y * gpsWeight + acoustic.y * acousticWeight) / (gpsWeight + acousticWeight)
  };

  if (!fusedPosition) {
    fusedPosition = measurement;
  } else {
    const kalmanGain = acousticVariance < gpsVariance ? 0.42 : 0.26;
    fusedPosition = {
      x: fusedPosition.x + (measurement.x - fusedPosition.x) * kalmanGain,
      y: fusedPosition.y + (measurement.y - fusedPosition.y) * kalmanGain
    };
  }

  return fusedPosition;
}

function acousticSolution(vessel, gps) {
  if (!acousticToggle.checked) return null;

  const mode = currentSolverMode();
  const measurements = acousticMeasurements(vessel);
  const fix = leastSquaresMultilateration(measurements, mode);
  const stats = geometryStats(fix, mode);
  const bearing = bearingFromNearestBeacon(fix);
  const toaAverage = measurements.reduce((sum, measurement) => sum + measurement.timeSeconds, 0) / measurements.length;
  const tdoaSpread = Math.max(...measurements.map((measurement) => measurement.timeSeconds)) - Math.min(...measurements.map((measurement) => measurement.timeSeconds));
  const fused = fusePositions(gps, fix, stats);

  return { fix, measurements, stats, bearing, toaAverage, tdoaSpread, fused, mode };
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

function updateReadouts(vessel, gps, acoustic, solution) {
  const gpsError = distance(vessel, gps) * 1852;
  const acousticError = acoustic ? distance(vessel, acoustic) * 1852 : null;
  const delta = acoustic ? distance(gps, acoustic) * 1852 : gpsError;
  const closestHazard = hazards.length
    ? Math.min(...hazards.map((hazard) => (distance(vessel, hazard) - hazard.r) * 1852))
    : Infinity;

  const gpsScore = spoofToggle.checked ? 42 : jamToggle.checked ? 38 : Math.max(62, 98 - gpsError * 0.9);
  const averageBeaconAccuracy = beacons.reduce((sum, beacon) => sum + beacon.accuracy, 0) / beacons.length;
  const acousticScore = acoustic ? Math.max(28, 96 - acousticError * 0.55 - averageBeaconAccuracy * 0.32) : 0;
  const fusedError = solution?.fused ? distance(vessel, solution.fused) * 1852 : null;
  const risk = closestHazard < 60 || delta > 130 ? "High" : closestHazard < 120 || delta > 70 ? "Medium" : "Low";
  const peakDelta = differenceHistory.length ? Math.max(...differenceHistory) : 0;

  positionReadout.textContent = `${(progress * 4.8).toFixed(1)} nm`;
  riskReadout.textContent = risk;
  riskReadout.className = risk === "High" ? "is-danger" : risk === "Medium" ? "is-warning" : "is-good";
  gpsConfidence.textContent = `${Math.round(gpsScore)}%`;
  acousticConfidence.textContent = acoustic ? `${Math.round(acousticScore)}%` : "Off";
  positionDelta.textContent = `${Math.round(delta)} m`;
  graphPeak.textContent = `Peak ${Math.round(peakDelta)} m`;
  toaReadout.textContent = solution ? `${solution.toaAverage.toFixed(3)} s` : "Off";
  tdoaReadout.textContent = solution ? `${solution.tdoaSpread.toFixed(3)} s` : "Off";
  bearingReadout.textContent = solution ? `${Math.round(solution.bearing).toString().padStart(3, "0")} deg` : "Off";
  dopReadout.textContent = solution ? `${solution.stats.dop.toFixed(1)} ${solution.stats.quality}` : "Off";
  covarianceReadout.textContent = solution ? `${Math.round(solution.stats.sigmaX)} / ${Math.round(solution.stats.sigmaY)} m` : "Off";
  fusionReadout.textContent = fusedError === null ? "Off" : `${Math.round(fusedError)} m`;
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
  const solution = acousticSolution(vessel, gps);
  const acoustic = solution?.fix || null;
  const fused = solution?.fused || null;

  gpsTrail.push(gps);
  if (acoustic) acousticTrail.push(acoustic);
  if (fused) fusedTrail.push(fused);
  if (acoustic) differenceHistory.push(distance(gps, acoustic) * 1852);
  gpsTrail = gpsTrail.slice(-90);
  acousticTrail = acousticTrail.slice(-90);
  fusedTrail = fusedTrail.slice(-90);
  differenceHistory = differenceHistory.slice(-150);

  drawChannel();
  drawHazards();
  drawBeacons();
  drawTrail(gpsTrail, "rgba(36, 95, 211, 0.78)");
  drawTrail(acousticTrail, "rgba(115, 87, 200, 0.7)");
  drawTrail(fusedTrail, "rgba(22, 118, 95, 0.72)");
  drawFix(gps, "#245fd3", jamToggle.checked || spoofToggle.checked ? 24 : 14);
  drawFix(acoustic, "#7357c8", 17);
  drawFix(fused, "#16765f", 13);
  drawVessel(vessel);
  drawDifferenceGraph();
  updateReadouts(vessel, gps, acoustic, solution);
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
  fusedTrail = [];
  fusedPosition = null;
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
  fusedTrail = [];
  fusedPosition = null;
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
      fusedTrail = [];
      fusedPosition = null;
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

soundSpeedSlider.addEventListener("input", () => {
  soundSpeedValue.textContent = `${soundSpeedSlider.value} m/s`;
  acousticTrail = [];
  fusedTrail = [];
  fusedPosition = null;
  differenceHistory = [];
});

solverModeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    acousticTrail = [];
    fusedTrail = [];
    fusedPosition = null;
    differenceHistory = [];
  });
});

[clockSyncToggle, fusionToggle].forEach((control) => {
  control.addEventListener("change", () => {
    acousticTrail = [];
    fusedTrail = [];
    fusedPosition = null;
    differenceHistory = [];
  });
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
  fusedTrail = [];
  fusedPosition = null;
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
  fusedTrail = [];
  fusedPosition = null;
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
    fusedTrail = [];
    fusedPosition = null;
    differenceHistory = [];
  });
});

renderBeaconControls();
updateMapHint();
drawFrame();
requestAnimationFrame(animate);
