/* global cytoscape, N3 */
(() => {
  // -------- namespaces --------
  const RDF  = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
  const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
  const OWL  = "http://www.w3.org/2002/07/owl#";
  const XSD  = "http://www.w3.org/2001/XMLSchema#";

  // -------- constants --------
  const RESTRICTION_EDGE_COLOR = "rgba(255,157,122,.85)";

  // -------- state --------
  const ui = {};
  let cy = null;

  let currentOntology = null; // {title, file}
  let currentStats = null;
  let graphIndex = emptyGraphIndex();

  // focusSelection:
  //   null OR { nodeIds:Set<string>, edgeIds:Set<string>, label:string }
  let focusSelection = null;

  let saveScheduled = false;

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

    createDynamicUi();
    initCy();
    wireUi();

    // IMPORTANT: preserve original working dropdown loading logic
    loadCatalog();
  });

  // -------- graph index for context menu navigation --------
  function emptyGraphIndex(){
    return {
      parentsByClass: new Map(),
      childrenByClass: new Map(),
      objectOutByClass: new Map(),
      objectInByClass: new Map(),
      dataPropsByClass: new Map(),
      individualsByClass: new Map(),
      restrictionOutByClass: new Map(),
      restrictionInByClass: new Map()
    };
  }

  // -------- dynamic UI (class filter + context menu container + restrictions toggle + legend) --------
function createDynamicUi(){
  createClassFilterControl();
  createContextMenu();
  createRestrictionsToggleIfMissing();
  ensureRestrictionLegend();
  ensureIndividualLegend();
}

  function createClassFilterControl(){
    if (document.getElementById("classFilterBox")) {
      ui.classFilterBox = document.getElementById("classFilterBox");
      ui.clearClassFilterButton = document.getElementById("clearClassFilterButton");
      return;
    }

    const controls = document.querySelector(".controls");
    if (!controls) return;

    const wrapper = document.createElement("label");
    wrapper.className = "control grow";
    wrapper.innerHTML = `
      <span>Filter visible classes</span>
      <div class="row">
        <input id="classFilterBox" type="text" placeholder="Filter by label, IRI, or comment">
        <button id="clearClassFilterButton" type="button">Clear</button>
      </div>
    `;

    const searchControl = ui.searchBox ? ui.searchBox.closest(".control") : null;
    if (searchControl && searchControl.parentElement === controls) {
      searchControl.insertAdjacentElement("afterend", wrapper);
    } else {
      controls.appendChild(wrapper);
    }

    ui.classFilterBox = document.getElementById("classFilterBox");
    ui.clearClassFilterButton = document.getElementById("clearClassFilterButton");
  }

  function createRestrictionsToggleIfMissing(){
    let cb = document.getElementById("showRestrictions");
    if (!cb) {
      const toggles = document.querySelector(".toggles");
      if (!toggles) return;

      const label = document.createElement("label");
      label.style.whiteSpace = "nowrap";
      label.innerHTML = `<input type="checkbox" id="showRestrictions" checked /> Restrictions`;
      toggles.appendChild(label);
      cb = label.querySelector("#showRestrictions");
    }
    ui.showRestrictions = cb;
  }

  function ensureRestrictionLegend(){
    const legend = document.querySelector(".legend");
    if (!legend) return;
    if (legend.querySelector('[data-legend="restriction"]')) return;

    const row = document.createElement("div");
    row.dataset.legend = "restriction";

    const sw = document.createElement("span");
    sw.className = "swatch restriction";
    sw.style.display = "inline-block";
    sw.style.width = "14px";
    sw.style.height = "14px";
    sw.style.borderRadius = "4px";
    sw.style.marginRight = "8px";
    sw.style.border = "1px solid rgba(0,0,0,.15)";
    sw.style.verticalAlign = "-2px";
    sw.style.background = RESTRICTION_EDGE_COLOR;

    row.appendChild(sw);
    row.appendChild(document.createTextNode(" OWL restriction"));
    legend.appendChild(row);
  }

  function ensureIndividualLegend(){
  const legend = document.querySelector(".legend");
  if (!legend) return;
  if (legend.querySelector('[data-legend="individual"]')) return;

  const row = document.createElement("div");
  row.dataset.legend = "individual";

  const sw = document.createElement("span");
  sw.className = "swatch individual";
  sw.style.display = "inline-block";
  sw.style.width = "14px";
  sw.style.height = "14px";
  sw.style.borderRadius = "4px";
  sw.style.marginRight = "8px";
  sw.style.border = "1px solid rgba(0,0,0,.15)";
  sw.style.verticalAlign = "-2px";
  sw.style.background = "rgba(204,178,255,.7)";

  row.appendChild(sw);
  row.appendChild(document.createTextNode(" Individual"));
  legend.appendChild(row);
}

  // -------- context menu creation & robust event handling --------
  function createContextMenu(){
    if (document.getElementById("cyContextMenu")) {
      ui.contextMenu = document.getElementById("cyContextMenu");
      wireContextMenuEventGuards(ui.contextMenu);
      wireDocumentOutsideCloseHandler();
      return;
    }

    const menu = document.createElement("div");
    menu.id = "cyContextMenu";
    menu.style.position = "fixed";
    menu.style.zIndex = "9999";
    menu.style.display = "none";
    menu.style.minWidth = "280px";
    menu.style.maxWidth = "420px";
    menu.style.maxHeight = "70vh";
    menu.style.overflowY = "auto";
    menu.style.overscrollBehavior = "contain";
    menu.style.pointerEvents = "auto";
    menu.style.padding = "0.5rem";
    menu.style.background = "#ffffff";
    menu.style.color = "#222222";
    menu.style.border = "1px solid #e2e5ea";
    menu.style.borderRadius = "8px";
    menu.style.boxShadow = "0 10px 28px rgba(0,0,0,0.18)";
    menu.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
    menu.style.fontSize = "0.88rem";

    document.body.appendChild(menu);
    ui.contextMenu = menu;

    wireContextMenuEventGuards(menu);
    wireDocumentOutsideCloseHandler();

    window.addEventListener("resize", hideContextMenu);
    window.addEventListener("scroll", handleContextMenuOuterScroll, true);
  }

function eventInsideContextMenu(evt){
  if (!ui.contextMenu) return false;

  if (typeof evt.composedPath === "function") {
    const path = evt.composedPath();
    if (Array.isArray(path) && path.includes(ui.contextMenu)) return true;
  }

  if (ui.contextMenu.contains(evt.target)) return true;

  // Important for native scrollbar interactions.
  // In some browsers, clicking or dragging the scrollbar does not report
  // the menu as the event target, so also check pointer coordinates.
  if (
    typeof evt.clientX === "number" &&
    typeof evt.clientY === "number" &&
    ui.contextMenu.style.display !== "none"
  ) {
    const rect = ui.contextMenu.getBoundingClientRect();

    return (
      evt.clientX >= rect.left &&
      evt.clientX <= rect.right &&
      evt.clientY >= rect.top &&
      evt.clientY <= rect.bottom
    );
  }

  return false;
}

function handleContextMenuOuterScroll(evt){
  if (!ui.contextMenu || ui.contextMenu.style.display === "none") return;

  // If the scroll event comes from the context menu itself, keep it open.
  if (evt.target === ui.contextMenu || ui.contextMenu.contains(evt.target)) {
    return;
  }

  // Otherwise, scrolling the outer page can close the menu.
  hideContextMenu();
}

function wireDocumentOutsideCloseHandler(){
  if (ui._outsideCloseWired) return;
  ui._outsideCloseWired = true;

  // Use pointerdown in capture phase. Do not use click (click can be disrupted by scrollbar).
  document.addEventListener("pointerdown", (evt) => {
    if (!ui.contextMenu || ui.contextMenu.style.display === "none") return;
    if (eventInsideContextMenu(evt)) return;
    hideContextMenu();
  }, true);

  // Prevent browser menu when right-click inside our menu
  document.addEventListener("contextmenu", (evt) => {
    if (ui.contextMenu && ui.contextMenu.style.display !== "none" && eventInsideContextMenu(evt)) {
      evt.preventDefault();
    }
  }, true);
}
  
function wireContextMenuEventGuards(menu){
  if (menu._contextMenuGuardsWired) return;
  menu._contextMenuGuardsWired = true;

  // Do not use capture phase here.
  // Capture-phase stopPropagation can prevent menu button clicks from firing.
  const stopOnly = (evt) => {
    evt.stopPropagation();
  };

  [
    "pointerdown",
    "pointerup",
    "mousedown",
    "mouseup",
    "click",
    "dblclick",
    "touchstart",
    "touchend"
  ].forEach((type) => {
    menu.addEventListener(type, stopOnly);
  });

  // Allow native wheel and trackpad scrolling inside the menu.
  // Stop propagation so Cytoscape and the page do not handle the wheel event.
  // Do not call preventDefault.
  menu.addEventListener("wheel", (evt) => {
    evt.stopPropagation();
  }, { passive: true });

  // Allow the menu itself to scroll without closing.
  menu.addEventListener("scroll", (evt) => {
    evt.stopPropagation();
  });

  // Prevent the browser context menu inside the custom menu.
  menu.addEventListener("contextmenu", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
  });
}
  
  // -------- cytoscape init --------
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
          style: { "shape": "diamond", "text-max-width": 130 }
        },
        {
          selector: "node[type='individual']",
          style: {
            "shape": "round-rectangle",
            "background-color": "rgba(204,178,255,.7)",
            "text-max-width": 140
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
        { selector: ".filterHidden", style: { "display": "none" } },
        { selector: ".focusHidden", style: { "display": "none" } },
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

    cy.on("cxttap", "node[type='class']", (evt) => {
      if (evt.originalEvent) {
        if (evt.originalEvent.preventDefault) evt.originalEvent.preventDefault();
        if (evt.originalEvent.stopPropagation) evt.originalEvent.stopPropagation();
      }
      showClassContextMenu(evt.target, evt.originalEvent);
    });

    cy.on("tap", (evt) => {
      if (evt.target === cy) hideContextMenu();
    });

    cy.on("dragfree", "node", () => scheduleSavePositions());
  }

  // -------- UI wiring --------
  function wireUi(){
    ui.ontologySelect.addEventListener("change", async () => {
      const idx = parseInt(ui.ontologySelect.value, 10);
      const item = ui.ontologySelect._items?.[idx];
      if (!item) return;
      await loadOntology(item);
    });

    ui.searchButton.addEventListener("click", () => performSearch());
    ui.searchBox.addEventListener("keydown", (e) => { if (e.key === "Enter") performSearch(); });

    if (ui.classFilterBox) {
      ui.classFilterBox.addEventListener("input", () => applyVisibility());
      ui.classFilterBox.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          ui.classFilterBox.value = "";
          applyVisibility();
        }
      });
    }

    if (ui.clearClassFilterButton) {
      ui.clearClassFilterButton.addEventListener("click", () => {
        ui.classFilterBox.value = "";
        applyVisibility();
        cy.fit(visibleElements(), 30);
      });
    }

    ui.applyLayoutButton.addEventListener("click", () => runLayout(ui.layoutSelect.value, true));
    ui.fitButton.addEventListener("click", () => cy.fit(visibleElements(), 30));

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
    if (ui.showRestrictions) ui.showRestrictions.addEventListener("change", onToggle);

    window.addEventListener("resize", () => { if (cy) cy.resize(); });
  }

  // -------- catalog --------
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
    currentStats = null;
    graphIndex = emptyGraphIndex();
    focusSelection = null;
    hideContextMenu();

    try{
      updateStatus(`Loading ${item.title || item.file}…`);
      ui.detailsContent.innerHTML = `<div class="muted">Loading ontology…</div>`;

      const ttl = await fetchText(item.file);
      const graph = buildGraphFromTurtle(ttl);
      graphIndex = graph.index || emptyGraphIndex();

      cy.elements().remove();
      cy.add(graph.elements);

      const restored = restorePositions(item.file);
      applyVisibility();

      if (!restored) runLayout(ui.layoutSelect.value, true);
      else cy.fit(visibleElements(), 40);

      currentStats = graph.stats;
      updateStatus(statusLine(graph.stats));
      ui.detailsContent.innerHTML =
        `<div class="muted">Loaded <b>${escapeHtml(item.title || item.file)}</b>.
        Right-click (or long-press) a class node for navigation.</div>`;
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

  // -------- build graph from Turtle --------
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

    const owlRestriction = named(OWL + "Restriction");
    const owlOnProperty = named(OWL + "onProperty");
    const owlSomeValuesFrom = named(OWL + "someValuesFrom");
    const owlAllValuesFrom = named(OWL + "allValuesFrom");
    const owlHasValue = named(OWL + "hasValue");

    const labels = new Map();
    const comments = new Map();

    const classes = new Set();
    const objectProps = new Set();
    const dataProps = new Set();

    const domains = new Map();
    const ranges  = new Map();

    const index = emptyGraphIndex();

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
        addToMapArray(domains, s.value, o);
      }
      if (p.termType === "NamedNode" && p.value === rdfsRange.value){
        addToMapArray(ranges, s.value, o);
      }
    }

    for (const q of quads){
      if (q.predicate.termType === "NamedNode" && q.predicate.value === subClassOf.value){
        if (q.subject.termType === "NamedNode") classes.add(q.subject.value);
        if (q.object.termType === "NamedNode") classes.add(q.object.value);
      }
    }

    // Individuals by class
    const individualsByClass = new Map();
    for (const q of quads){
      if (q.predicate.termType !== "NamedNode" || q.predicate.value !== rdfType.value) continue;
      if (q.subject.termType !== "NamedNode" || q.object.termType !== "NamedNode") continue;

      const individualIri = q.subject.value;
      const classIri = q.object.value;

      if (!classes.has(classIri)) continue;
      if (classes.has(individualIri)) continue;
      if (objectProps.has(individualIri)) continue;
      if (dataProps.has(individualIri)) continue;

      addToMapArray(individualsByClass, classIri, individualIri);
    }

    const elements = [];
    const nodeIds = new Set();
    const edgeIds = new Set();

    // class nodes
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
          color: "rgba(80,88,105,.90)",
          size: 22
        }
      });
    }

    // object properties edges
    let objEdgeCount = 0;
    for (const propIri of objectProps){
      const domainTerms = domains.get(propIri) || [];
      const rangeTerms = ranges.get(propIri) || [];
      const propLabel = labels.get(propIri) || compactIri(propIri);

      for (const d of domainTerms){
        for (const r of rangeTerms){
          if (!d || !r) continue;
          if (d.termType !== "NamedNode" || r.termType !== "NamedNode") continue;

          const dIri = d.value;
          const rIri = r.value;
          if (!classes.has(dIri) || !classes.has(rIri)) continue;

          const eid = `obj:${iriToId(propIri)}:${iriToId(dIri)}->${iriToId(rIri)}`;
          if (edgeIds.has(eid)) continue;
          edgeIds.add(eid);

          elements.push({
            data: {
              id: eid,
              source: iriToId(dIri),
              target: iriToId(rIri),
              iri: propIri,
              type: "objpropEdge",
              label: propLabel,
              comment: comments.get(propIri) || "",
              color: "rgba(255,212,121,.8)"
            },
            classes: "rel-objprop"
          });

          addToMapArray(index.objectOutByClass, dIri, { propIri, label: propLabel, classIri: rIri, classLabel: labels.get(rIri) || compactIri(rIri), edgeId: eid });
          addToMapArray(index.objectInByClass, rIri, { propIri, label: propLabel, classIri: dIri, classLabel: labels.get(dIri) || compactIri(dIri), edgeId: eid });

          objEdgeCount++;
        }
      }
    }

    // data properties: nodes + edges
    let dataNodeCount = 0;
    let dataEdgeCount = 0;

    for (const propIri of dataProps){
      const domainTerms = domains.get(propIri) || [];
      const rangeTerms = ranges.get(propIri) || [];
      const rangeStr = rangeTerms.length ? rangeTerms.map(termToReadable).join(", ") : "";

      const baseLabel = labels.get(propIri) || compactIri(propIri);
      const label = rangeStr ? `${baseLabel}\n: ${rangeStr}` : baseLabel;

      for (const d of domainTerms){
        if (!d || d.termType !== "NamedNode") continue;

        const dIri = d.value;
        if (!classes.has(dIri)) continue;

        const propNodeId = `dp:${iriToId(propIri)}`;

        if (!nodeIds.has(propNodeId)){
          nodeIds.add(propNodeId);
          elements.push({
            data: {
              id: propNodeId,
              iri: propIri,
              type: "dataprop",
              label: label.length > 48 ? baseLabel : label,
              labelFull: label,
              range: rangeStr,
              comment: comments.get(propIri) || "",
              color: "rgba(70,135,65,.90)",
              size: 16
            }
          });
          dataNodeCount++;
        }

        const eid = `dpedge:${iriToId(dIri)}->${propNodeId}`;
        if (edgeIds.has(eid)) continue;
        edgeIds.add(eid);

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

        addToMapArray(index.dataPropsByClass, dIri, { propIri, label: baseLabel, nodeId: propNodeId, range: rangeStr, edgeId: eid });
        dataEdgeCount++;
      }
    }

    // direct subclass edges (named-named)
    let subclassCount = 0;
    for (const q of quads){
      if (q.predicate.termType !== "NamedNode" || q.predicate.value !== subClassOf.value) continue;
      if (q.subject.termType !== "NamedNode" || q.object.termType !== "NamedNode") continue;

      const child = q.subject.value;
      const parent = q.object.value;
      if (!classes.has(child) || !classes.has(parent)) continue;

      const eid = `sc:${iriToId(child)}->${iriToId(parent)}`;
      if (edgeIds.has(eid)) continue;
      edgeIds.add(eid);

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

      addToMapArray(index.parentsByClass, child, { classIri: parent, classLabel: labels.get(parent) || compactIri(parent), edgeId: eid });
      addToMapArray(index.childrenByClass, parent, { classIri: child, classLabel: labels.get(child) || compactIri(child), edgeId: eid });
      subclassCount++;
    }

    // restriction edges
    let restrictionEdgeCount = 0;
    const restrictionCandidates = [];
    for (const q of quads){
      if (q.predicate.termType !== "NamedNode" || q.predicate.value !== subClassOf.value) continue;
      if (q.subject.termType !== "NamedNode") continue;
      if (q.object.termType !== "BlankNode") continue;
      restrictionCandidates.push({ classIri: q.subject.value, bnode: q.object });
    }

    for (const { classIri, bnode } of restrictionCandidates){
      if (!classes.has(classIri)) continue;

      const onProps = store.getObjects(bnode, owlOnProperty, null) || [];
      const onProp = onProps.find(t => t.termType === "NamedNode");
      if (!onProp) continue;

      const some = store.getObjects(bnode, owlSomeValuesFrom, null) || [];
      const all = store.getObjects(bnode, owlAllValuesFrom, null) || [];
      const hv  = store.getObjects(bnode, owlHasValue, null) || [];

      const isTypedRestriction = store.countQuads(bnode, rdfType, owlRestriction, null) > 0;
      const hasPattern = !!(some.length || all.length || hv.length);
      if (!isTypedRestriction && !hasPattern) continue;

      let quantifier = null;
      let filler = null;
      if (some.length) { quantifier = "some"; filler = some[0]; }
      else if (all.length) { quantifier = "only"; filler = all[0]; }
      else if (hv.length) { quantifier = "value"; filler = hv[0]; }
      if (!quantifier || !filler) continue;

      if (filler.termType !== "NamedNode") continue;
      const targetIri = filler.value;
      if (!classes.has(targetIri)) continue;

      const propIri = onProp.value;
      const propLabel = labels.get(propIri) || compactIri(propIri);
      const targetLabel = labels.get(targetIri) || compactIri(targetIri);

      const edgeLabel = `${propLabel} ${quantifier}`;
      const eidBase = `res:${iriToId(classIri)}:${iriToId(propIri)}:${quantifier}:${iriToId(targetIri)}`;
      const eid = dedupeEdgeId(eidBase, edgeIds);

      elements.push({
        data: {
          id: eid,
          source: iriToId(classIri),
          target: iriToId(targetIri),
          iri: propIri,
          type: "restrictionEdge",
          label: edgeLabel,
          quantifier,
          comment: comments.get(propIri) || "",
          color: RESTRICTION_EDGE_COLOR
        },
        classes: "rel-restriction"
      });

      addToMapArray(index.restrictionOutByClass, classIri, { propIri, label: propLabel, quantifier, targetIri, targetLabel, edgeId: eid });
      addToMapArray(index.restrictionInByClass, targetIri, { propIri, label: propLabel, quantifier, sourceIri: classIri, sourceLabel: labels.get(classIri) || compactIri(classIri), edgeId: eid });

      restrictionEdgeCount++;
    }

    // individuals (context only)
    let individualNodeCount = 0;
    let individualEdgeCount = 0;

    for (const [classIri, individualIris] of individualsByClass.entries()){
      for (const individualIri of individualIris){
        const nodeId = `ind:${iriToId(individualIri)}`;
        const edgeId = `inst:${iriToId(classIri)}->${nodeId}`;

        if (!nodeIds.has(nodeId)){
          nodeIds.add(nodeId);
          elements.push({
            data: {
              id: nodeId,
              iri: individualIri,
              type: "individual",
              label: labels.get(individualIri) || compactIri(individualIri),
              comment: comments.get(individualIri) || "",
              color: "rgba(157,95,199,.65)",
              size: 16
            },
            classes: "contextOnly"
          });
          individualNodeCount++;
        }

        if (!edgeIds.has(edgeId)) {
          edgeIds.add(edgeId);
          elements.push({
            data: {
              id: edgeId,
              source: iriToId(classIri),
              target: nodeId,
              iri: rdfType.value,
              type: "individualType",
              label: "type",
              comment: "",
              color: "rgba(157,95,199,.65)"
            },
            classes: "rel-individual contextOnly"
          });
          individualEdgeCount++;
        }

        addToMapArray(index.individualsByClass, classIri, { individualIri, label: labels.get(individualIri) || compactIri(individualIri), nodeId, edgeId });
      }
    }

    // node size heuristic
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
      index,
      stats: {
        classes: classes.size,
        objectProperties: objectProps.size,
        dataProperties: dataProps.size,
        subclassEdges: subclassCount,
        restrictionEdges: restrictionEdgeCount,
        objectPropEdges: objEdgeCount,
        dataPropNodes: dataNodeCount,
        dataPropEdges: dataEdgeCount,
        individuals: individualNodeCount,
        individualEdges: individualEdgeCount
      }
    };
  }

  function dedupeEdgeId(baseId, edgeIdsSet){
    let eid = baseId;
    let i = 2;
    while (edgeIdsSet.has(eid)) {
      eid = `${baseId}#${i}`;
      i++;
    }
    edgeIdsSet.add(eid);
    return eid;
  }

  // -------- visibility --------
  function applyVisibility(){
    if (!cy) return;

    cy.elements().removeClass("hidden filterHidden focusHidden");
    cy.elements(".contextOnly").addClass("hidden");

    cy.edges(".rel-subclass").toggleClass("hidden", !ui.showSubclass.checked);
    cy.edges(".rel-objprop").toggleClass("hidden", !ui.showObjectProperties.checked);
    cy.edges(".rel-restriction").toggleClass("hidden", ui.showRestrictions ? !ui.showRestrictions.checked : false);

    cy.nodes("[type='dataprop']").toggleClass("hidden", !ui.showDataProperties.checked);
    cy.edges(".rel-dataprop").toggleClass("hidden", !ui.showDataProperties.checked);

    applyClassFilter();
    applyFocusSelection();

    updateStatus(statusLine(currentStats));
  }

  function applyClassFilter(){
    if (!cy || !ui.classFilterBox) return;
    const q = (ui.classFilterBox.value || "").trim().toLowerCase();
    if (!q) return;

    const hiddenClassIds = new Set();

    cy.nodes("[type='class']").forEach((node) => {
      const d = node.data();
      const haystack = [d.label, d.labelFull, d.iri, d.comment].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(q)) {
        node.addClass("filterHidden");
        hiddenClassIds.add(node.id());
      }
    });

    cy.edges().forEach((edge) => {
      if (
        hiddenClassIds.has(edge.source().id()) ||
        hiddenClassIds.has(edge.target().id()) ||
        edge.source().hasClass("filterHidden") ||
        edge.target().hasClass("filterHidden")
      ) {
        edge.addClass("filterHidden");
      }
    });

    cy.nodes("[type='dataprop']").forEach((node) => {
      const connectedVisible = node.connectedEdges(".rel-dataprop").filter((edge) => !edge.hasClass("hidden") && !edge.hasClass("filterHidden") && !edge.hasClass("focusHidden"));
      if (!connectedVisible.length) node.addClass("filterHidden");
    });

    cy.nodes("[type='individual']").forEach((node) => {
      const connectedVisible = node.connectedEdges(".rel-individual").filter((edge) => !edge.hasClass("hidden") && !edge.hasClass("filterHidden") && !edge.hasClass("focusHidden"));
      if (!connectedVisible.length) node.addClass("filterHidden");
    });
  }

  function applyFocusSelection(){
    if (!cy || !focusSelection) return;

    const allowedNodeIds = new Set(focusSelection.nodeIds || []);
    const allowedEdgeIds = new Set(focusSelection.edgeIds || []);

    for (const edgeId of allowedEdgeIds){
      const edge = cy.getElementById(edgeId);
      if (edge && edge.length) {
        allowedNodeIds.add(edge.source().id());
        allowedNodeIds.add(edge.target().id());
      }
    }

    cy.nodes().forEach((node) => {
      if (allowedNodeIds.has(node.id())) node.removeClass("hidden filterHidden focusHidden contextOnly");
      else node.addClass("focusHidden");
    });

    cy.edges().forEach((edge) => {
      if (allowedEdgeIds.has(edge.id())) {
        edge.removeClass("hidden filterHidden focusHidden contextOnly");
        edge.source().removeClass("hidden filterHidden focusHidden contextOnly");
        edge.target().removeClass("hidden filterHidden focusHidden contextOnly");
      } else {
        edge.addClass("focusHidden");
      }
    });
  }

  function setFocusSelection(nodeIds, edgeIds, label){
    focusSelection = {
      nodeIds: new Set(nodeIds || []),
      edgeIds: new Set(edgeIds || []),
      label: label || "Focused selection"
    };
    applyVisibility();
    cy.fit(visibleElements(), 35);
  }

  function clearFocusSelection(){
    focusSelection = null;
    applyVisibility();
    cy.fit(visibleElements(), 35);
  }

  function contextNavigate(sourceNodeId, targetNodeId, edgeId, label){
    if (!cy) return;

    const nodeIds = new Set();
    const edgeIds = new Set();

    if (focusSelection) {
      for (const id of focusSelection.nodeIds || []) nodeIds.add(id);
      for (const id of focusSelection.edgeIds || []) edgeIds.add(id);
    } else {
      cy.nodes().not(".hidden").not(".filterHidden").not(".focusHidden").forEach((node) => nodeIds.add(node.id()));
      cy.edges().not(".hidden").not(".filterHidden").not(".focusHidden").forEach((edge) => {
        edgeIds.add(edge.id());
        nodeIds.add(edge.source().id());
        nodeIds.add(edge.target().id());
      });
    }

    if (sourceNodeId) nodeIds.add(sourceNodeId);
    if (targetNodeId) nodeIds.add(targetNodeId);

    if (edgeId) {
      edgeIds.add(edgeId);
      const edge = cy.getElementById(edgeId);
      if (edge && edge.length) {
        nodeIds.add(edge.source().id());
        nodeIds.add(edge.target().id());
      }
    }

    focusSelection = {
      nodeIds,
      edgeIds,
      label: focusSelection ? `${focusSelection.label}; added ${label}` : (label || "Focus")
    };

    applyVisibility();
    if (targetNodeId || sourceNodeId) navigateToNode(targetNodeId || sourceNodeId, edgeId);
    cy.fit(visibleElements(), 35);
  }

  function visibleElements(){
    return cy.elements().not(".hidden").not(".filterHidden").not(".focusHidden");
  }

  // -------- layouts --------
  function runLayout(name, animate){
    if (!cy) return;
    const opts = {
      name,
      animate: !!animate,
      animationDuration: 500,
      fit: true,
      padding: 40,
      eles: visibleElements()
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
    cy.layout(opts).run();
  }

  // -------- class context menu --------
  function showClassContextMenu(node, originalEvent){
    if (!node || node.data("type") !== "class") return;

    if (originalEvent) {
      if (originalEvent.preventDefault) originalEvent.preventDefault();
      if (originalEvent.stopPropagation) originalEvent.stopPropagation();
    }

    const iri = node.data("iri");
    const label = node.data("label") || compactIri(iri);

    hideContextMenu();

    const menu = ui.contextMenu;
    if (!menu) return;

    menu.innerHTML = "";

    const title = document.createElement("div");
    title.style.fontWeight = "700";
    title.style.color = "#1f3b57";
    title.style.padding = "0.35rem 0.4rem";
    title.style.borderBottom = "1px solid #eef0f3";
    title.style.marginBottom = "0.35rem";
    title.textContent = label;
    menu.appendChild(title);

    const focusBar = document.createElement("div");
    focusBar.style.display = "flex";
    focusBar.style.gap = "8px";
    focusBar.style.padding = "0.25rem 0.4rem 0.35rem 0.4rem";
    focusBar.style.borderBottom = "1px solid #eef0f3";
    focusBar.style.marginBottom = "0.35rem";
    focusBar.style.flexWrap = "wrap";

    const showOnlyBtn = makeMenuPillButton("Show only this class", (evt) => {
      evt.stopPropagation();
      hideContextMenu();
      setFocusSelection([node.id()], [], `Only ${label}`);
      cy.elements().removeClass("selected");
      node.addClass("selected");
      showDetails(node);
    });
    focusBar.appendChild(showOnlyBtn);

    if (focusSelection) {
      const clearFocusBtn = makeMenuPillButton("Clear focus filter", (evt) => {
        evt.stopPropagation();
        hideContextMenu();
        clearFocusSelection();
      });
      focusBar.appendChild(clearFocusBtn);
    }

    menu.appendChild(focusBar);

    appendClassMenuGroup(
      menu, "Children", graphIndex.childrenByClass.get(iri) || [],
      (item) => contextNavigate(node.id(), iriToId(item.classIri), item.edgeId, `${label} + child ${item.classLabel}`),
      (item) => item.classLabel
    );

    appendClassMenuGroup(
      menu, "Parents", graphIndex.parentsByClass.get(iri) || [],
      (item) => contextNavigate(node.id(), iriToId(item.classIri), item.edgeId, `${label} + parent ${item.classLabel}`),
      (item) => item.classLabel
    );

    appendClassMenuGroup(
      menu, "Restrictions",
      [
        ...(graphIndex.restrictionOutByClass.get(iri) || []).map((it) => ({ _kind: "out", ...it, menuLabel: `${it.label} ${it.quantifier} ${it.targetLabel}` })),
        ...(graphIndex.restrictionInByClass.get(iri) || []).map((it) => ({ _kind: "in", ...it, menuLabel: `${it.sourceLabel} — ${it.label} ${it.quantifier}` }))
      ],
      (item) => {
        if (item._kind === "out") contextNavigate(node.id(), iriToId(item.targetIri), item.edgeId, `${label} + restriction ${item.label} ${item.quantifier} ${item.targetLabel}`);
        else contextNavigate(node.id(), iriToId(item.sourceIri), item.edgeId, `${label} + incoming restriction ${item.sourceLabel}`);
      },
      (item) => item.menuLabel
    );

    appendClassMenuGroup(
      menu, "Data properties", graphIndex.dataPropsByClass.get(iri) || [],
      (item) => {
        if (ui.showDataProperties && !ui.showDataProperties.checked) {
          ui.showDataProperties.checked = true;
          applyVisibility();
        }
        contextNavigate(node.id(), item.nodeId, item.edgeId, `${label} + data property ${item.label}`);
      },
      (item) => item.range ? `${item.label} : ${item.range}` : item.label
    );

    const objectItems = [
      ...(graphIndex.objectOutByClass.get(iri) || []).map((item) => ({ ...item, menuLabel: `${item.label} → ${item.classLabel}` })),
      ...(graphIndex.objectInByClass.get(iri) || []).map((item) => ({ ...item, menuLabel: `${item.classLabel} → ${item.label}` }))
    ];

    appendClassMenuGroup(
      menu, "Object properties", objectItems,
      (item) => {
        if (ui.showObjectProperties && !ui.showObjectProperties.checked) {
          ui.showObjectProperties.checked = true;
          applyVisibility();
        }
        contextNavigate(node.id(), iriToId(item.classIri), item.edgeId, `${label} + object property ${item.label}`);
      },
      (item) => item.menuLabel
    );

    appendClassMenuGroup(
      menu, "Individuals", graphIndex.individualsByClass.get(iri) || [],
      (item) => {
        revealContextElement(item.nodeId, item.edgeId);
        contextNavigate(node.id(), item.nodeId, item.edgeId, `${label} + individual ${item.label}`);
      },
      (item) => item.label
    );

    const pos = contextMenuPosition(node, originalEvent);
    menu.style.left = `${pos.x}px`;
    menu.style.top = `${pos.y}px`;
    menu.style.display = "block";
    keepMenuInViewport(menu);
  }

  function makeMenuPillButton(text, onClick){
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.style.padding = "0.28rem 0.55rem";
    b.style.borderRadius = "999px";
    b.style.border = "1px solid #d7deea";
    b.style.background = "#f6f9ff";
    b.style.cursor = "pointer";
    b.style.fontSize = "0.82rem";
    b.style.color = "#1f3b57";
    b.addEventListener("click", onClick);
    return b;
  }

  function appendClassMenuGroup(menu, titleText, items, onClick, getLabel){
    const group = document.createElement("div");
    group.style.marginTop = "0.45rem";

    const title = document.createElement("div");
    title.style.fontWeight = "700";
    title.style.color = "#294e73";
    title.style.fontSize = "0.8rem";
    title.style.padding = "0.25rem 0.4rem";
    title.textContent = `${titleText} (${items.length})`;
    group.appendChild(title);

    if (!items.length) {
      const empty = document.createElement("div");
      empty.style.color = "#777";
      empty.style.fontStyle = "italic";
      empty.style.fontSize = "0.8rem";
      empty.style.padding = "0.2rem 0.4rem";
      empty.textContent = "None";
      group.appendChild(empty);
      menu.appendChild(group);
      return;
    }

    for (const item of items){
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = getLabel(item);
      button.style.display = "block";
      button.style.width = "100%";
      button.style.textAlign = "left";
      button.style.padding = "0.35rem 0.45rem";
      button.style.margin = "0";
      button.style.border = "none";
      button.style.borderBottom = "1px solid #eef0f3";
      button.style.background = "transparent";
      button.style.color = "#1f3b57";
      button.style.cursor = "pointer";

      button.addEventListener("mouseenter", () => { button.style.background = "#eef4fb"; });
      button.addEventListener("mouseleave", () => { button.style.background = "transparent"; });

      button.addEventListener("click", (evt) => {
        evt.stopPropagation();
        hideContextMenu();
        onClick(item);
      });

      group.appendChild(button);
    }

    menu.appendChild(group);
  }

  function contextMenuPosition(node, originalEvent){
    if (originalEvent && typeof originalEvent.clientX === "number" && typeof originalEvent.clientY === "number") {
      return { x: originalEvent.clientX + 8, y: originalEvent.clientY + 8 };
    }
    const rect = cy.container().getBoundingClientRect();
    const rendered = node.renderedPosition();
    return { x: rect.left + rendered.x + 8, y: rect.top + rendered.y + 8 };
  }

  function keepMenuInViewport(menu){
    const rect = menu.getBoundingClientRect();
    const margin = 10;

    let left = rect.left;
    let top = rect.top;

    if (rect.right > window.innerWidth - margin) left = window.innerWidth - rect.width - margin;
    if (rect.bottom > window.innerHeight - margin) top = window.innerHeight - rect.height - margin;
    if (left < margin) left = margin;
    if (top < margin) top = margin;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function hideContextMenu(){
    if (ui.contextMenu) ui.contextMenu.style.display = "none";
  }

  function revealContextElement(nodeId, edgeId){
    const node = cy.getElementById(nodeId);
    const edge = cy.getElementById(edgeId);
    if (node && node.length) node.removeClass("contextOnly hidden filterHidden focusHidden");
    if (edge && edge.length) edge.removeClass("contextOnly hidden filterHidden focusHidden");
  }

  // -------- navigation --------
  function navigateToNode(nodeId, edgeId){
    const node = cy.getElementById(nodeId);
    if (!node || !node.length) {
      updateStatus("Target is not available in the graph.");
      return;
    }

    if (node.data("type") === "dataprop" && ui.showDataProperties && !ui.showDataProperties.checked) {
      ui.showDataProperties.checked = true;
    }

    if (edgeId) {
      const edge = cy.getElementById(edgeId);
      if (edge && edge.length) edge.removeClass("contextOnly hidden filterHidden focusHidden");
    }

    node.removeClass("contextOnly hidden filterHidden focusHidden");
    applyVisibility();

    cy.elements().removeClass("selected");
    node.addClass("selected");
    showDetails(node);

    cy.animate({ center: { eles: node }, zoom: Math.max(0.75, Math.min(1.3, cy.zoom())) }, { duration: 350 });
  }

  // -------- details panel --------
  function showDetails(ele){
    if (!ele) return;

    if (ele.isNode && ele.isNode()){
      const d = ele.data();
      const typeLabel =
        d.type === "class" ? "Class" :
        d.type === "dataprop" ? "Data property" :
        d.type === "individual" ? "Individual" :
        "Node";

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
        d.type === "restrictionEdge" ? "OWL restriction" :
        d.type === "datapropEdge" ? "Data property domain link" :
        d.type === "individualType" ? "rdf:type (individual)" :
        "Edge";

      const quantifier = d.type === "restrictionEdge" ? escapeHtml(d.quantifier || "") : "";

      ui.detailsContent.innerHTML = `
        <div><span class="k">Type:</span> ${typeLabel}</div>
        ${label ? `<div><span class="k">Label:</span> ${label}</div>` : ""}
        ${quantifier ? `<div><span class="k">Quantifier:</span> ${quantifier}</div>` : ""}
        <div><span class="k">From:</span> ${source}</div>
        <div><span class="k">To:</span> ${target}</div>
        <div><span class="k">IRI:</span> <span class="iri">${iri}</span></div>
        ${comment ? `<div class="k" style="margin-top:8px">Comment</div><pre>${comment}</pre>` : `<div class="muted" style="margin-top:8px">No rdfs:comment</div>`}
      `;
    }
  }

  // -------- search --------
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
      const comment = (d.comment || "").toLowerCase();
      return label.includes(q) || iri.includes(q) || comment.includes(q);
    });

    hits.addClass("searchHit");

    if (hits.length){
      const first = hits[0];
      first.removeClass("contextOnly hidden filterHidden focusHidden");
      applyVisibility();

      cy.animate({ center: { eles: first }, zoom: Math.min(1.2, cy.zoom()) }, { duration: 350 });
      updateStatus(`${hits.length} match(es) for "${q}".`);
    } else {
      updateStatus(`No matches for "${q}".`);
    }
  }

  // -------- status line --------
  function statusLine(stats){
    if (!stats) return "Ready.";

    const flags = [];
    flags.push(`Classes: ${stats.classes}`);
    flags.push(`SubClassOf: ${stats.subclassEdges}${ui.showSubclass.checked ? "" : " hidden"}`);
    flags.push(`Restrictions: ${stats.restrictionEdges || 0}${ui.showRestrictions && !ui.showRestrictions.checked ? " hidden" : ""}`);
    flags.push(`ObjProp edges: ${stats.objectPropEdges}${ui.showObjectProperties.checked ? "" : " hidden"}`);
    flags.push(`DataProps: ${stats.dataPropNodes}${ui.showDataProperties.checked ? "" : " hidden"}`);

    if (typeof stats.individuals === "number") flags.push(`Individuals: ${stats.individuals}`);
    if (ui.classFilterBox && ui.classFilterBox.value.trim()) {
      const visibleClasses = cy.nodes("[type='class']").filter(n => !n.hasClass("hidden") && !n.hasClass("filterHidden") && !n.hasClass("focusHidden")).length;
      flags.push(`Visible classes: ${visibleClasses}`);
    }
    if (focusSelection) flags.push(`Focus: ${focusSelection.label || "active"}`);

    return flags.join(" • ");
  }

  function updateStatus(text){
    ui.statusText.textContent = text;
  }

  // -------- localStorage positions --------
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
    cy.nodes().forEach(n => { map[n.id()] = n.position(); });
    try{
      localStorage.setItem(storageKey(currentOntology.file), JSON.stringify(map));
    } catch(err){
      console.warn("Failed saving positions", err);
    }
  }

  // -------- utilities --------
  function named(iri){ return { termType: "NamedNode", value: iri }; }

  function iriToId(iri){
    return "iri:" + encodeURIComponent(iri);
  }

  function compactIri(iri){
    try{
      const hash = iri.lastIndexOf("#");
      if (hash >= 0 && hash < iri.length - 1) return iri.slice(hash + 1);
      const slash = iri.lastIndexOf("/");
      if (slash >= 0 && slash < iri.length - 1) return iri.slice(slash + 1);
      return iri;
    } catch{
      return iri;
    }
  }

  function addToMapArray(map, key, value){
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  }

  function termToReadable(term){
    if (!term) return "";
    if (term.termType === "NamedNode") {
      if (term.value.startsWith(XSD)) return "xsd:" + term.value.slice(XSD.length);
      return compactIri(term.value);
    }
    if (term.termType === "Literal") return term.value;
    return String(term.value || "");
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
