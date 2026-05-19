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
- Drag acoustic beacons on the map or enter their X/Y positions manually.
- Set each beacon accuracy in meters to change the acoustic confidence and map accuracy rings.
- Watch the risk, confidence, position difference, and decision-support messages update in real time.

## Host on GitHub Pages

Because this is a static browser app, it can be hosted directly with GitHub Pages from the `main` branch and `/root` folder.
