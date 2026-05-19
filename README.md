# Acoustics Channel Simulator

A browser-based prototype for exploring two navigation questions:

- Are we being jammed or spoofed?
- Do acoustic position fixes help solve or validate vessel position?

The app simulates a vessel moving through a dangerous channel with hazards, a GPS track, acoustic beacons, and live decision-support readouts.

## Run Locally

Open `index.html` in a browser, or use a local preview server from this folder:

```sh
python3 -m http.server 4173
```

Then open:

```txt
http://localhost:4173/
```

## Use the Simulator

- Adjust vessel speed with the slider.
- Turn on GPS jamming to degrade GPS confidence.
- Turn on GPS spoofing to offset the GPS track from the vessel.
- Turn acoustic positioning on or off to compare acoustic fixes against GPS.
- Upload a map image to use as the chart background.
- Turn on Mark threats and click the map to identify hazards.
- Switch between TOA and TDOA acoustic measurement modes.
- Adjust the speed of sound in water.
- Turn sensor clock synchronization and Kalman-style fusion on or off.
- Drag acoustic beacons on the map or enter their X/Y positions manually.
- Set each beacon accuracy in meters to change the acoustic confidence and map accuracy rings.
- Monitor bearing, DOP, covariance, and fused position error.
- Watch the risk, confidence, position difference, and decision-support messages update in real time.

## Maths Behind the Simulation

This app currently uses simplified simulation maths. It is designed to show the concept clearly: GPS can be wrong, acoustics can provide an independent position fix, and the difference between GPS and acoustics can indicate uncertainty, jamming, or spoofing.

### Coordinate System

The map uses normalized coordinates from `0` to `1`.

```txt
x = 0.0  left side of map
x = 1.0  right side of map
y = 0.0  top of map
y = 1.0  bottom of map
```

So a beacon at `x = 0.18`, `y = 0.20` is 18% across the map and 20% down the map.

The app converts normalized map coordinates into canvas pixels:

```txt
screenX = x * canvasWidth
screenY = y * canvasHeight
```

### Vessel Movement

The vessel follows a curved route through the channel. Progress through the route is represented by `t`, where `0` is the start and `1` is the end.

```txt
x = 0.5 + sin(t * PI * 2.2) * 0.14 + sin(t * PI * 6) * 0.025
y = 0.08 + t * 0.84
```

The vessel heading is calculated by looking slightly ahead on the route:

```txt
heading = atan2(nextY - currentY, nextX - currentX)
```

### GPS Position

Normal GPS is simulated as the vessel's true position plus small noise.

```txt
gps = vessel + noise
```

The noise uses sine and cosine waves:

```txt
xNoise = sin(progress * 30 + offset) * scale
yNoise = cos(progress * 25 + offset) * scale
```

Normal GPS uses a small scale:

```txt
scale = 0.009
```

GPS jamming uses a larger scale:

```txt
scale = 0.055
```

So jamming makes the GPS position wander more.

GPS spoofing is simulated by offsetting the GPS position from the real vessel position:

```txt
gpsX = vesselX + 0.075 + small variation
gpsY = vesselY - 0.045 + small variation
```

This means spoofing looks stable, but the GPS position is displaced from the vessel and acoustic fix.

### Acoustic Solver

The app now simulates an acoustic measurement pipeline. It first generates time or range measurements from the vessel to each beacon, then estimates the acoustic position using least-squares multilateration.

The speed of sound is user-adjustable:

```txt
soundSpeed = 1450 to 1550 m/s
```

For time of arrival (TOA), the app simulates a measured range to each beacon:

```txt
trueRange = distance(vessel, beacon) * 1852
measuredRange = trueRange + measurementNoise + clockBias
toa = measuredRange / soundSpeed
```

When sensor clock synchronization is enabled:

```txt
clockBias = 0
```

When clock synchronization is disabled, the app adds a shared clock-bias error:

```txt
clockBias = sin(progress * 8.5) * 34 m
```

For time difference of arrival (TDOA), the app compares each beacon against the first beacon:

```txt
tdoa = toaBeacon - toaReference
```

This reduces the impact of shared clock bias because it uses time differences instead of absolute arrival times.

### Least-Squares Multilateration

The acoustic position is solved iteratively. The app starts from the previous acoustic fix, or from the route centerline if there is no previous fix.

For TOA, each residual is:

```txt
residual = predictedRange - measuredRange
```

For TDOA, each residual is:

```txt
residual = predictedRangeDifference - measuredRangeDifference
```

The app builds a small linear system from the measurement gradients and solves it repeatedly:

```txt
normalMatrix * positionStep = residualVector
estimate = estimate - positionStep
```

This is a simplified Gauss-Newton least-squares solver.

### Acoustic Measurement Noise

Measurement noise depends on beacon accuracy and a simulated acoustic shadow zone.

First, the app calculates average beacon accuracy:

```txt
averageAccuracy = sum(beaconAccuracy) / numberOfBeacons
```

Each beacon gets a deterministic measurement noise term:

```txt
measurementNoise = wave * beaconAccuracy * 0.32 * shadowScale
```

The shadow zone increases uncertainty near the middle of the route:

```txt
if progress is near 0.58:
  shadowScale = 1.75
else:
  shadowScale = 1.0
```

### Bearing Estimation

The bearing readout is calculated from the nearest acoustic beacon toward the acoustic position estimate.

```txt
bearing = atan2(deltaX, deltaY)
```

It is displayed in degrees from `000` to `359`.

### DOP and Geometry Quality

The app estimates DOP, or dilution of precision, from the beacon geometry around the acoustic fix.

For each beacon, the app calculates a unit direction vector from the beacon to the estimated position. For TDOA, it uses the difference between each beacon direction and the reference beacon direction.

Those geometry vectors are used to build a geometry matrix:

```txt
G = geometry matrix
Q = inverse(transpose(G) * G)
DOP = sqrt(Qxx + Qyy)
```

The app labels geometry quality as:

```txt
DOP < 1.8   Strong
DOP < 3.0   Fair
otherwise   Weak
```

### Uncertainty Covariance

The covariance readout estimates uncertainty in the X and Y directions from the geometry matrix and average beacon accuracy.

```txt
sigmaX = sqrt(Qxx) * averageBeaconAccuracy
sigmaY = sqrt(Qyy) * averageBeaconAccuracy
covarianceXY = Qxy * averageBeaconAccuracy^2
```

The app displays `sigmaX / sigmaY` in meters.

### Kalman-Style Sensor Fusion

When Kalman-style fusion is enabled, the app blends GPS and acoustic fixes using uncertainty-weighted averaging.

```txt
gpsWeight = 1 / gpsVariance
acousticWeight = 1 / acousticVariance

measurement =
  (gps * gpsWeight + acoustic * acousticWeight)
  / (gpsWeight + acousticWeight)
```

Then it smooths the fused position using a simple gain:

```txt
fusedPosition = previousFusedPosition
  + (measurement - previousFusedPosition) * kalmanGain
```

This is not a full production Kalman filter yet, but it demonstrates the core sensor-fusion idea: trust the measurement source with lower estimated uncertainty more.

### Map Unit Conversion

The app treats one normalized map unit as approximately one nautical mile:

```txt
1 nautical mile = 1852 meters
```

### Distance Calculations

Distances use Euclidean distance:

```txt
distance = sqrt((x2 - x1)^2 + (y2 - y1)^2)
```

Then map units are converted to meters:

```txt
meters = distance * 1852
```

This is used for GPS error, acoustic error, GPS-acoustic difference, and closest hazard distance.

### GPS-Acoustic Difference Graph

The graph shows the distance between the GPS fix and the acoustic fix:

```txt
difference = distance(gpsPosition, acousticPosition) * 1852
```

The app stores the latest values and displays the last 150 samples.

Current graph thresholds:

```txt
70 m   warning line
130 m  danger line
```

A large GPS-acoustic difference is treated as a possible sign of spoofing or degraded positioning.

### Confidence Scores

Normal GPS confidence is simulated as:

```txt
gpsConfidence = max(62, 98 - gpsError * 0.9)
```

When jamming is enabled:

```txt
gpsConfidence = 38%
```

When spoofing is enabled:

```txt
gpsConfidence = 42%
```

Acoustic confidence is simulated as:

```txt
acousticConfidence = max(28, 96 - acousticError * 0.55 - averageBeaconAccuracy * 0.32)
```

So acoustic confidence gets worse when the acoustic fix is far from the vessel or when beacon accuracy values are poor.

### Risk Level

Risk is based on closest hazard distance and GPS-acoustic disagreement.

```txt
if closestHazard < 60 m OR difference > 130 m:
  risk = High

else if closestHazard < 120 m OR difference > 70 m:
  risk = Medium

else:
  risk = Low
```

### Jamming and Spoofing Logic

The current detection logic is intentionally simple:

```txt
if GPS jamming toggle is on:
  show "GPS jamming suspected"

else if GPS spoofing toggle is on OR GPS-acoustic difference > 130 m:
  show "GPS spoofing suspected"

else:
  show "GPS normal"
```

### Current Limitation

This prototype now includes simulated TOA, TDOA, speed of sound, clock synchronization, least-squares multilateration, bearing, DOP, covariance, and Kalman-style fusion.

A real navigation-grade system would still need real sensor measurements and stronger modelling, including:

- measured acoustic travel times or ranges
- water temperature, salinity, and depth effects on sound speed
- clock discipline and timestamp quality
- outlier rejection
- multipath and acoustic shadow modelling
- full Kalman, extended Kalman, or particle filtering
- validation against real survey or vessel-track data

The next maths upgrade would be to let the user enter real measured ranges or arrival times instead of using simulated measurements.

## Host on GitHub Pages

Because this is a static browser app, it can be hosted directly with GitHub Pages from the `main` branch and `/root` folder.
