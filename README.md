# Parçala

Multi-color 3D printing without an AMS: Parçala splits an STL/3MF model into separate single-color parts
and adds connectors (plug + socket, tab + slot, pins) so they snap back together after printing.
The outer shape and dimensions of the model stay exactly the same.

## Install

1. Download the latest `Parcala-Kurulum-x.y.z.exe` from **Releases**.
2. Double-click to install. If Windows SmartScreen shows "unknown publisher": **More info → Run anyway**
   (the installer is not code-signed).
3. Launch **Parçala** from the desktop or Start menu. You can also right-click any `.stl` / `.3mf` file → **Open with → Parçala**.

## Usage

1. **Open a model** or drag the file onto the window.
2. Add cuts:
   - **Flat cut** for parts that separate along a straight line (nose cone, base). Click the model to set the height.
     A pin (separate dowel or built-in peg) is placed at the center of the cross-section automatically.
   - **Plug** for parts embedded in the body (windows, logos, badges, fins). Click the center of the colored area and
     adjust shape, size and depth with the sliders. The part gets a plug that sits in a matching socket, with an
     optional key so it can only go in one way.
   The model is painted live with each part's color, so you can see what goes where before cutting.
3. **Split** → the parts are shown in their colors; use the slider to explode the view.
4. **Download** → one zip with an STL per part (filament color in the file name), separate pins,
   and an assembled check file (`birlesik_kontrol.3mf`).
   In Bambu Studio, select each part and press **F** (lay on face) to orient it for printing.

Clearances (side, bottom, pin) are adjustable if parts come out too tight or too loose.
Everything runs locally; models are never uploaded anywhere.

## Development

- App source: `kaynak/ui.html` (interface) and `kaynak/motor.js` (cutting engine, no dependencies).
- `python kaynak/derle.py` builds the single-file `index.html`.
- `npm install && npm start` runs the desktop app locally; `npm run dist` builds the Windows installer.
- Every push to `main` makes GitHub Actions rebuild the Windows installer and publish it to Releases.
  Bump `version` in `package.json` for a new release.

The user interface is in Turkish.
