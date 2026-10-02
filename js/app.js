/* global cytoscape, N3 */
(() => {
  const RDF  = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
  const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
  const OWL  = "http://www.w3.org/2002/07/owl#";
  const XSD  = "http://www.w3.org/2001/XMLSchema#";

  const ui = {};
  let cy = null;

  let currentOntology = null; // {title, file}
  let currentStats = null;

  document.addEventListener("DOMContentLoaded", () => {
    ui.ontologySelect = document.getElementById("ontologySelect");
    ui.searchBox = document.getElementById("searchBox");
    ui.searchButton = document.getElementById("searchButton");
    ui.layoutSelect = document.getElementById("layoutSelect");
    ui.applyLayoutButton = document.getElementById("applyLayoutButton");
    ui.fitButton = document.getElementById("fitButton");
    ui.resetPositionsButton = document.getElementById("resetPositionsButton");

    ui.showSubclass = document.getElementById("showSubclass");
    ui.showObjectProperties = document.getElementById("showObjectProperties");
    ui.showDataProperties = document.getElementById("showDataProperties");

    ui.detailsContent = document.getElementById("detailsContent");
    ui.statusText = document.getElementById("statusText");

    initCy();
    wireUi();
    loadCatalog();
  });

  function initCy(){
    cy = cytoscape({
      container: document.getElementById("cy"),
      elements: [],
      style: [
        {
          selector: "node",
          style: {
            "label": "data(label)",
            "font-size": 10,
            "text-wrap": "wrap",
            "text-max-width": 110,
            "text-valign": "center",
            "text-halign": "center",
            "color": "#e7ecff",
            "background-color": "data(color)",
            "border-width": 1,
            "border-color": "rgba(255,255,255,.25)",
            "width": "mapData(size, 12, 28, 28, 52)",
            "height": "mapData(size, 12, 28, 28, 52)"
          }
        },
        {
          selector: "node[type='dataprop']",
          style: {
            "shape": "diamond",
            "text-max-width": 130
          }
        },
        {
          selector: "edge",
          style: {
            "width": 2,
            "curve-style": "bezier",
            "line-color": "data(color)",
            "target-arrow-color": "data(color)",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.9,
            "label": "data(label)",
            "font-size": 9,
            "text-rotation": "autorotate",
            "color": "rgba(231,236,255,.85)",
            "text-background-opacity": 1,
            "text-background-color": "rgba(0,0,0,.35)",
            "text-background-padding": "2px",
          }
        },
        { selector: ".hidden", style: { "display": "none" } },
        { selector: ".searchHit", style: { "border-width": 3, "border-color": "#67b7ff" } },
        { selector: ".selected", style: { "border-width": 4, "border-color": "#ffffff" } },
      ],
      wheelSensitivity: 0.2
    });

    cy.on("tap", "node, edge", (evt) => {
      cy.elements().removeClass("selected");
      evt.target.addClass("selected");
      showDetails(evt.target);
    });

    cy.on("dragfree", "node", () => {
      // save after each drag end (throttled by rAF)
      scheduleSavePositions();
    });
  }

  function wireUi(){
    ui.ontologySelect.addEventListener("change", async () => {
      const idx = parseInt(ui.ontologySelect.value, 10);
      const item = ui.ontologySelect._items?.[idx];
      if (!item) return;
      await loadOntology(item);
    });

    ui.searchButton.addEventListener("click", () => performSearch());
    ui.searchBox.addEventListener("keydown", (e) => {
      if (e.key === "Enter") performSearch();
    });

    ui.applyLayoutButton.addEventListener("click", () => runLayout(ui.layoutSelect.value, true));
    ui.fitButton.addEventListener("click", () => cy.fit(undefined, 30));

    ui.resetPositionsButton.addEventListener("click", () => {
      if (!currentOntology) return;
      localStorage.removeItem(storageKey(currentOntology.file));
      runLayout(ui.layoutSelect.value, true);
      updateStatus("Saved positions cleared. Reapplied layout.");
    });

    const onToggle = () => applyVisibility();
    ui.showSubclass.addEventListener("change", onToggle);
    ui.showObjectProperties.addEventListener("change", onToggle);
    ui.showDataProperties.addEventListener("change", onToggle);

    window.addEventListener("resize", () => {
      if (cy) cy.resize();
    });
  }

  async function loadCatalog(){
    try{
      updateStatus("Loading catalog.json…");
      const res = await fetch("catalog.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load catalog.json (${res.status})`);
      const items = await res.json();

      ui.ontologySelect.innerHTML = "";
      ui.ontologySelect._items = items;

      items.forEach((it, i) => {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = it.title || it.file;
        ui.ontologySelect.appendChild(opt);
      });

      if (items.length){
        ui.ontologySelect.value = "0";
        await loadOntology(items[0]);
      } else {
        updateStatus("catalog.json is empty.");
      }
    } catch(err){
      console.error(err);
      updateStatus("Error loading catalog.json. See console.");
      ui.detailsContent.innerHTML = `<div class="muted">Could not load catalog.json</div>
        <pre>${escapeHtml(String(err))}</pre>`;
    }
  }

  async function loadOntology(item){
    currentOntology = item;
    try{
      updateStatus(`Loading ${item.title || item.file}…`);
      ui.detailsContent.innerHTML = `<div class="muted">Loading ontology…</div>`;

      const ttl = await fetchText(item.file);
      const graph = buildGraphFromTurtle(ttl);

      cy.elements().remove();
      cy.add(graph.elements);

      // restore positions if present, otherwise apply layout
      const restored = restorePositions(item.file);
      applyVisibility();

      if (!restored) runLayout(ui.layoutSelect.value, true);
      else cy.fit(undefined, 40);

      currentStats = graph.stats;
      updateStatus(statusLine(graph.stats));
      ui.detailsContent.innerHTML = `<div class="muted">Loaded <b>${escapeHtml(item.title || item.file)}</b>. Click a node or edge.</div>`;
    } catch(err){
      console.error(err);
      updateStatus("Error loading ontology. See console.");
      ui.detailsContent.innerHTML = `<div class="muted">Failed to load or parse ontology.</div>
        <pre>${escapeHtml(String(err))}</pre>`;
    }
  }

  async function fetchText(path){
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed: ${path} (${res.status})`);
    return await res.text();
  }

  function buildGraphFromTurtle(ttlText){
    const parser = new N3.Parser({ format: "text/turtle" });
    const store = new N3.Store();
    const quads = parser.parse(ttlText);
    store.addQuads(quads);

    const rdfType = named(RDF + "type");
    const rdfsClass = named(RDFS + "Class");
    const owlClass = named(OWL + "Class");
    const rdfsLabel = named(RDFS + "label");
    const rdfsComment = named(RDFS + "comment");
    const subClassOf = named(RDFS + "subClassOf");
    const owlObjectProperty = named(OWL + "ObjectProperty");
    const owlDatatypeProperty = named(OWL + "DatatypeProperty");
    const rdfsDomain = named(RDFS + "domain");
    const rdfsRange = named(RDFS + "range");

    // Collect labels/comments (last one wins)
    const labels = new Map();   // iri -> string
    const comments = new Map(); // iri -> string

    // Types
    const classes = new Set();       // iri
    const objectProps = new Set();   // iri
    const dataProps = new Set();     // iri

    // We'll also record domain/range for properties
    const domains = new Map(); // propIri -> term (named node)
    const ranges = new Map();  // propIri -> term (named node or literal)

    for (const q of quads){
      const s = q.subject, p = q.predicate, o = q.object;

      if (p.termType === "NamedNode" && p.value === rdfsLabel.value && o.termType === "Literal"){
        labels.set(s.value, o.value);
      }
      if (p.termType === "NamedNode" && p.value === rdfsComment.value && o.termType === "Literal"){
        comments.set(s.value, o.value);
      }

      if (p.termType === "NamedNode" && p.value === rdfType.value && o.termType === "NamedNode"){
        if (o.value === owlClass.value || o.value === rdfsClass.value) classes.add(s.value);
        if (o.value === owlObjectProperty.value) objectProps.add(s.value);
        if (o.value === owlDatatypeProperty.value) dataProps.add(s.value);
      }

      if (p.termType === "NamedNode" && p.value === rdfsDomain.value && o.termType === "NamedNode"){
        domains.set(s.value, o);
      }
      if (p.termType === "NamedNode" && p.value === rdfsRange.value){
        ranges.set(s.value, o);
      }
    }

    // Some ontologies may not assert owl:Class but use rdfs:subClassOf; include those subjects/objects.
    for (const q of quads){
      if (q.predicate.termType === "NamedNode" && q.predicate.value === subClassOf.value){
        if (q.subject.termType === "NamedNode") classes.add(q.subject.value);
        if (q.object.termType === "NamedNode") classes.add(q.object.value);
      }
    }

    const elements = [];
    const nodeIds = new Set();

    // Class nodes
    for (const iri of classes){
      const id = iriToId(iri);
      nodeIds.add(id);
      elements.push({
        data: {
          id,
          iri,
          type: "class",
          label: labels.get(iri) || compactIri(iri),
          comment: comments.get(iri) || "",
          color: "rgba(132,210,255,.55)",
          size: 22
        }
      });
    }

    // Object property edges (domain -> range) only when both named and both are classes
    let objEdgeCount = 0;
    for (const propIri of objectProps){
      const d = domains.get(propIri);
      const r = ranges.get(propIri);
      if (!d || !r) continue;
      if (d.termType !== "NamedNode" || r.termType !== "NamedNode") continue;

      const dIri = d.value;
      const rIri = r.value;
      if (!classes.has(dIri) || !classes.has(rIri)) continue;

      const eid = `obj:${iriToId(propIri)}:${iriToId(dIri)}->${iriToId(rIri)}`;

      elements.push({
        data: {
          id: eid,
          source: iriToId(dIri),
          target: iriToId(rIri),
          iri: propIri,
          type: "objpropEdge",
          label: labels.get(propIri) || compactIri(propIri),
          comment: comments.get(propIri) || "",
          color: "rgba(255,212,121,.8)"
        },
        classes: "rel-objprop"
      });
      objEdgeCount++;
    }

    // Data property nodes + edges from domain class -> property node (if domain is a named class)
    let dataNodeCount = 0;
    let dataEdgeCount = 0;

    for (const propIri of dataProps){
      const d = domains.get(propIri);
      if (!d || d.termType !== "NamedNode") continue;
      const dIri = d.value;
      if (!classes.has(dIri)) continue;

      const rangeTerm = ranges.get(propIri);
      const rangeStr = rangeTerm
        ? (rangeTerm.termType === "NamedNode" ? compactIri(rangeTerm.value) : rangeTerm.value)
        : "";

      const propId = iriToId(propIri);
      const propNodeId = `dp:${propId}`;
      if (!nodeIds.has(propNodeId)){
        nodeIds.add(propNodeId);
        const baseLabel = labels.get(propIri) || compactIri(propIri);
        const label = rangeStr ? `${baseLabel}\n: ${rangeStr}` : baseLabel;

        elements.push({
          data: {
            id: propNodeId,
            iri: propIri,
            type: "dataprop",
            label: label.length > 48 ? baseLabel : label,
            labelFull: label,
            range: rangeStr,
            comment: comments.get(propIri) || "",
            color: "rgba(184,255,177,.55)",
            size: 16
          }
        });
        dataNodeCount++;
      }

      const eid = `dpedge:${iriToId(dIri)}->${propNodeId}`;
      elements.push({
        data: {
          id: eid,
          source: iriToId(dIri),
          target: propNodeId,
          iri: propIri,
          type: "datapropEdge",
          label: "",
          comment: "",
          color: "rgba(184,255,177,.75)"
        },
        classes: "rel-dataprop"
      });
      dataEdgeCount++;
    }

    // Subclass edges (direct asserted)
    let subclassCount = 0;
    for (const q of quads){
      if (q.predicate.termType !== "NamedNode" || q.predicate.value !== subClassOf.value) continue;
      if (q.subject.termType !== "NamedNode" || q.object.termType !== "NamedNode") continue;

      const child = q.subject.value;
      const parent = q.object.value;
      if (!classes.has(child) || !classes.has(parent)) continue;

      const eid = `sc:${iriToId(child)}->${iriToId(parent)}`;
      elements.push({
        data: {
          id: eid,
          source: iriToId(child),
          target: iriToId(parent),
          iri: subClassOf.value,
          type: "subclass",
          label: "",
          comment: "",
          color: "rgba(138,162,255,.7)"
        },
        classes: "rel-subclass"
      });
      subclassCount++;
    }

    // Node size heuristic: degree (classes only)
    // We'll compute after adding edges
    const degreeMap = new Map();
    for (const el of elements){
      if (el.data && el.data.source && el.data.target){
        degreeMap.set(el.data.source, (degreeMap.get(el.data.source)||0) + 1);
        degreeMap.set(el.data.target, (degreeMap.get(el.data.target)||0) + 1);
      }
    }
    for (const el of elements){
      if (el.data?.type === "class"){
        const deg = degreeMap.get(el.data.id) || 0;
        el.data.size = Math.max(18, Math.min(28, 18 + deg));
      }
    }

    return {
      elements,
      stats: {
        classes: classes.size,
        objectProperties: objectProps.size,
        dataProperties: dataProps.size,
        subclassEdges: subclassCount,
        objectPropEdges: objEdgeCount,
        dataPropNodes: dataNodeCount,
        dataPropEdges: dataEdgeCount
      }
    };
  }

  function applyVisibility(){
    if (!cy) return;
    const showSubclass = ui.showSubclass.checked;
    const showObj = ui.showObjectProperties.checked;
    const showData = ui.showDataProperties.checked;

    cy.edges().forEach(e => e.removeClass("hidden"));

    cy.edges(".rel-subclass").toggleClass("hidden", !showSubclass);
    cy.edges(".rel-objprop").toggleClass("hidden", !showObj);
    cy.nodes("[type='dataprop']").toggleClass("hidden", !showData);
    cy.edges(".rel-dataprop").toggleClass("hidden", !showData);

    updateStatus(statusLine(currentStats));
  }

  function runLayout(name, animate){
    if (!cy) return;
    const opts = {
      name,
      animate: !!animate,
      animationDuration: 500,
      fit: true,
      padding: 40
    };

    if (name === "breadthfirst"){
      opts.directed = true;
      opts.spacingFactor = 1.2;
      opts.circle = false;
    }
    if (name === "cose"){
      opts.randomize = true;
      opts.nodeRepulsion = 9000;
      opts.idealEdgeLength = 90;
    }
    const layout = cy.layout(opts);
    layout.run();
  }

  function showDetails(ele){
    if (!ele) return;
    if (ele.isNode && ele.isNode()){
      const d = ele.data();
      const typeLabel = d.type === "class" ? "Class" : (d.type === "dataprop" ? "Data property" : "Node");
      const label = escapeHtml(d.labelFull || d.label || "");
      const iri = escapeHtml(d.iri || "");
      const comment = escapeHtml(d.comment || "");
      const range = escapeHtml(d.range || "");

      ui.detailsContent.innerHTML = `
        <div><span class="k">Type:</span> ${typeLabel}</div>
        <div><span class="k">Label:</span> ${label}</div>
        <div><span class="k">IRI:</span> <span class="iri">${iri}</span></div>
        ${range ? `<div><span class="k">Range:</span> ${range}</div>` : ""}
        ${comment ? `<div class="k" style="margin-top:8px">Comment</div><pre>${comment}</pre>` : `<div class="muted" style="margin-top:8px">No rdfs:comment</div>`}
      `;
      return;
    }

    if (ele.isEdge && ele.isEdge()){
      const d = ele.data();
      const label = escapeHtml(d.label || "");
      const iri = escapeHtml(d.iri || "");
      const comment = escapeHtml(d.comment || "");
      const source = escapeHtml(ele.source().data("label") || ele.source().id());
      const target = escapeHtml(ele.target().data("label") || ele.target().id());
      const typeLabel =
        d.type === "subclass" ? "rdfs:subClassOf" :
        d.type === "objpropEdge" ? "Object property" :
        d.type === "datapropEdge" ? "Data property (domain link)" : "Edge";

      ui.detailsContent.innerHTML = `
        <div><span class="k">Type:</span> ${typeLabel}</div>
        ${label ? `<div><span class="k">Label:</span> ${label}</div>` : ""}
        <div><span class="k">From:</span> ${source}</div>
        <div><span class="k">To:</span> ${target}</div>
        <div><span class="k">IRI:</span> <span class="iri">${iri}</span></div>
        ${comment ? `<div class="k" style="margin-top:8px">Comment</div><pre>${comment}</pre>` : `<div class="muted" style="margin-top:8px">No rdfs:comment</div>`}
      `;
    }
  }

  function performSearch(){
    const q = (ui.searchBox.value || "").trim().toLowerCase();
    cy.elements().removeClass("searchHit");
    if (!q){
      updateStatus(statusLine(currentStats));
      return;
    }

    const hits = cy.nodes().filter(n => {
      const d = n.data();
      const label = (d.labelFull || d.label || "").toLowerCase();
      const iri = (d.iri || "").toLowerCase();
      return label.includes(q) || iri.includes(q);
    });

    hits.addClass("searchHit");

    if (hits.length){
      const first = hits[0];
      cy.animate({ center: { eles: first }, zoom: Math.min(1.2, cy.zoom()) }, { duration: 350 });
      updateStatus(`${hits.length} match(es) for "${q}".`);
    } else {
      updateStatus(`No matches for "${q}".`);
    }
  }

  function statusLine(stats){
    if (!stats) return "Ready.";
    const flags = [];
    flags.push(`Classes: ${stats.classes}`);
    flags.push(`SubClassOf: ${stats.subclassEdges}${ui.showSubclass.checked ? "" : " (hidden)"}`);
    flags.push(`ObjProp edges: ${stats.objectPropEdges}${ui.showObjectProperties.checked ? "" : " (hidden)"}`);
    flags.push(`DataProps: ${stats.dataPropNodes}${ui.showDataProperties.checked ? "" : " (hidden)"}`);
    return flags.join(" • ");
  }

  function updateStatus(text){
    ui.statusText.textContent = text;
  }

  // -------- localStorage positions (per ontology) --------

  function storageKey(ontologyFile){
    return `ontologyViewer.positions::${ontologyFile}`;
  }

  function restorePositions(ontologyFile){
    const raw = localStorage.getItem(storageKey(ontologyFile));
    if (!raw) return false;
    try{
      const map = JSON.parse(raw);
      let applied = 0;

      cy.nodes().forEach(n => {
        const pos = map[n.id()];
        if (pos && typeof pos.x === "number" && typeof pos.y === "number"){
          n.position({ x: pos.x, y: pos.y });
          applied++;
        }
      });

      return applied > 0;
    } catch{
      return false;
    }
  }

  let saveScheduled = false;
  function scheduleSavePositions(){
    if (saveScheduled) return;
    saveScheduled = true;
    requestAnimationFrame(() => {
      saveScheduled = false;
      savePositions();
    });
  }

  function savePositions(){
    if (!currentOntology) return;
    const map = {};
    cy.nodes().forEach(n => {
      map[n.id()] = n.position();
    });
    try{
      localStorage.setItem(storageKey(currentOntology.file), JSON.stringify(map));
      // no status spam while dragging
    } catch(err){
      console.warn("Failed saving positions", err);
    }
  }

  // -------- utilities --------

  function named(iri){ return { termType: "NamedNode", value: iri }; }

  function iriToId(iri){
    // Cytoscape ids cannot contain certain characters reliably; encode.
    return "iri:" + encodeURIComponent(iri);
  }

  function compactIri(iri){
    try{
      // Prefer fragment after #, else last path segment
      const hash = iri.lastIndexOf("#");
      if (hash >= 0 && hash < iri.length - 1) return iri.slice(hash + 1);
      const slash = iri.lastIndexOf("/");
      if (slash >= 0 && slash < iri.length - 1) return iri.slice(slash + 1);
      return iri;
    } catch{
      return iri;
    }
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
