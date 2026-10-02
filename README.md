# Cytoscape.js OWL Ontology Viewer (GitHub Pages)

A static, browser-only OWL/RDF Turtle ontology viewer:

- Ontology selection populated from `catalog.json`
- Turtle parsing in the browser using **N3.js**
- OWL/RDFS classes as **nodes**
- Direct `rdfs:subClassOf` relationships
- `owl:ObjectProperty` edges when named `rdfs:domain` and `rdfs:range` are present
- `owl:DatatypeProperty` (data properties) shown as nodes connected to their domain classes
- Uses `rdfs:label` for readable names and `rdfs:comment` in the details panel
- Search, multiple layouts, drag nodes, save positions per ontology in `localStorage`
- Show/hide subclass, object-property, and data-property relationships
- Responsive layout

---

## 1) Where to put these files in your repository

Recommended: use the **/docs** folder so GitHub Pages can publish without Actions.

In your repo `schaaar2/my-clinops-ontology-core`, create:

```
docs/
  index.html
  catalog.json
  css/styles.css
  js/app.js
  ontologies/
    (your .ttl files here)
```

Copy the contents of this project archive into `docs/` (not into a nested folder unless you want a subpath).

---

## 2) Add your ontology files

Put your Turtle files under:

```
docs/ontologies/
```

Ensure filenames match `catalog.json`, e.g.

- `docs/ontologies/clinops-core.ttl`
- `docs/ontologies/USDM.ttl`
- `docs/ontologies/vendor_site_readiness_ontology_v1.0.0.ttl`

---

## 3) Edit `catalog.json`

`catalog.json` must be at `docs/catalog.json` and look like:

```json
[
  { "title": "ClinOps Core", "file": "ontologies/clinops-core.ttl" },
  { "title": "USDM v4", "file": "ontologies/USDM.ttl" },
  { "title": "Vendor Site Readiness (AI created)", "file": "ontologies/vendor_site_readiness_ontology_v1.0.0.ttl" }
]
```

Paths are **relative to `docs/index.html`**.

---

## 4) Enable GitHub Pages

1. Commit and push the `docs/` folder to `main`.
2. In GitHub: **Settings → Pages**
3. Under **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/docs**
4. Click **Save**.
5. Wait for deployment; your site will appear at:

`https://schaaar2.github.io/my-clinops-ontology-core/`

---

## 5) Local testing (recommended)

Because the app uses `fetch()`, opening `index.html` via `file://` will not work.

From inside `docs/` run:

```bash
python -m http.server 8000
```

Open:

`http://localhost:8000`

---

## Notes / Behavior

- **Positions**: dragging nodes saves positions in `localStorage` under a key that includes the ontology path, so each ontology remembers its own layout.
- **Object properties**: only drawn when `rdfs:domain` and `rdfs:range` are both **named nodes** and refer to classes that exist in the graph.
- **Data properties**: shown as diamond nodes. If `rdfs:range` exists, it is shown in the details panel (and on the node label if short enough).
- **SubClassOf**: only direct asserted `rdfs:subClassOf` edges are rendered (no reasoning/inference).

