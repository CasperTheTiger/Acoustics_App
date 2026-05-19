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
- Drag acoustic beacons on the map or enter their X/Y positions manually.
- Set each beacon accuracy in meters to change the acoustic confidence and map accuracy rings.
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

### Acoustic Position

The acoustic fix is also simulated as the vessel position plus noise:

```txt
acoustic = vessel + acousticNoise
```

The acoustic noise depends on beacon accuracy and beacon geometry.

First, the app calculates average beacon accuracy:

```txt
averageAccuracy = sum(beaconAccuracy) / numberOfBeacons
```

Then it estimates a simple geometry penalty:

```txt
nearestBeaconDistance = distance from vessel to nearest beacon
farthestBeaconDistance = distance from vessel to farthest beacon
spread = farthestBeaconDistance - nearestBeaconDistance

geometryPenalty = clamp(1.35 - spread, 0.85, 1.45)
```

This is a simplified stand-in for real acoustic geometry quality. If the beacon layout is weaker, acoustic uncertainty gets worse.

The acoustic noise is then:

```txt
noiseMeters = averageAccuracy * geometryPenalty
```

There is also a simulated acoustic shadow zone around the middle of the channel:

```txt
if progress is near 0.58:
  noiseMeters = noiseMeters * 1.8
```

The app converts meters into map units using:

```txt
1 nautical mile = 1852 meters
noiseMapUnits = noiseMeters / 1852
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

This prototype does not yet perform real acoustic positioning from measured sound travel times.

A real acoustic positioning system would use measurements and methods such as:

- Time of arrival
- Time difference of arrival
- Speed of sound in water
- Sensor clock synchronization
- Least-squares multilateration
- Bearing estimation
- Uncertainty covariance
- Dilution of precision
- Kalman filtering or other sensor fusion methods

The next maths upgrade would be to replace the simulated acoustic fix with real multilateration from beacon positions and measured ranges or time differences.

## Host on GitHub Pages

Because this is a static browser app, it can be hosted directly with GitHub Pages from the `main` branch and `/root` folder.
