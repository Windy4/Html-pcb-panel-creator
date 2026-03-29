# Html-pcb-panel-creator

> ⚠️ **No longer in development** — This project is in early development. Expect breaking changes.

A browser-based tool for designing and generating PCB panel layouts that I vibe coded cause I was bored.

---

## Features

- **Visual panel editor** — drag-and-drop board placement on a configurable panel canvas
- **Custom footprint support** - create custom placeable footprints
- **Export** — outputs Gerber-ready panel files for fabrication
- **Local PHP server** — runs fully offline, no cloud dependencies

---

## Usage

### 1. Start the local server

Serve the project from any PHP-capable environment:

```sh
cd /path/to/Html-pcb-panel-creator
php -S localhost:8080
```

Then open `http://localhost:8080` in your browser.


### 2. Configure the panel

- Set panel dimensions (width × height in mm)
- Choose grid spacing and the number of board copies (rows × columns)


### 3. Export

- Click **Export Panel** to generate the panelised `.kicad_pcb`
- Open the output in KiCad for final DRC and Gerber export

---


## Contributing

This is a personal project under active development. Issues and PRs are welcome but may not be reviewed promptly as I am no longer working on it.

---
