/* global cytoscape, N3 */
(() => {
  const RDF  = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
  const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
  const OWL  = "http://www.w3.org/2002/07/owl#";
  const XSD  = "http://www.w3.org/2001/XMLSchema#";

  const ui = {};
  let cy = null;

  let currentOntology = null;
  let currentStats = null;

  let graphIndex = emptyGraphIndex();
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
    loadCatalog();
  });

  function emptyGraphIndex(){
    return {
      parentsByClass: new Map(),
      childrenByClass: new Map(),
      objectOutByClass: new Map(),
      objectInByClass: new Map(),
      dataPropsByClass: new Map(),
      individualsByClass: new Map(),
      individualClassEdgeByPair: new Map()
    };
  }

  function createDynamicUi(){
    createClassFilterControl();
    createContextMenu();
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
        <input id="classFilterBox" type="text" placeholder="Filter classes by label, IRI, or comment">
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

  function createContextMenu(){
    if (document.getElementById("cyContextMenu")) {
      ui.contextMenu = document.getElementById("cyContextMenu");
      return;
    }

    const menu = document.createElement("div");
    menu.id = "cyContextMenu";
    menu.style.position = "fixed";
    menu.style.zIndex = "9999";
    menu.style.display = "none";
    menu.style.minWidth = "260px";
    menu.style.maxWidth = "360px";
    menu.style.maxHeight = "70vh";
    menu.style.overflowY = "auto";
    menu.style.padding = "0.5rem";
    menu.style.background = "#ffffff";
    menu.style.color = "#222222";
    menu.style.border = "1px solid #e2e5ea";
    menu.style.borderRadius = "6px";
    menu.style.boxShadow = "0 8px 24px rgba(0,0,0,0.18)";
    menu.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
    menu.style.fontSize = "0.88rem";

    document.body.appendChild(menu);
    ui.contextMenu = menu;

    document.addEventListener("click", (evt) => {
      if (!ui.contextMenu.contains(evt.target)) hideContextMenu();
    });

    window.addEventListener("resize", hideContextMenu);
    window.addEventListener("scroll", hideContextMenu, true);
  }

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
            "color": "#222222",
            "background-color": "data(color)",
            "border-width": 1,
            "border-color": "rgba(31,59,87,.35)",
            "width": "mapData(size, 12, 28, 28, 52)",
            "height": "mapData(size, 12, 28, 28, 52)"
          }
        },
        {
          selector: "node[type='class']",
          style: {
            "shape": "ellipse"
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
          selector: "node[type='individual']",
          style: {
            "shape": "round-rectangle",
            "text-max-width": 130,
            "background-color": "rgba(204,178,255,.7)"
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
            "color": "#294e73",
            "text-background-opacity": 1,
            "text-background-color": "rgba(255,255,255,.85)",
            "text-background-padding": "2px"
          }
        },
        {
          selector: ".hidden",
          style: {
            "display": "none"
          }
        },
        {
          selector: ".filterHidden",
          style: {
            "display": "none"
          }
        },
        {
          selector: ".searchHit",
          style: {
            "border-width": 3,
            "border-color": "#1a5fb4"
          }
        },
        {
          selector: ".selected",
          style: {
            "border-width": 4,
            "border-color": "#1f3b57"
          }
        }
      ],
      wheelSensitivity: 0.2
    });

    cy.on("tap", "node, edge", (evt) => {
      cy.elements().removeClass("selected");
      evt.target.addClass("selected");
      showDetails(evt.target);
    });

    cy.on("tap", "node[type='class']", (evt) => {
      showClassContextMenu(evt.target, evt.originalEvent);
    });

    cy.on("cxttap", "node[type='class']", (evt) => {
      showClassContextMenu(evt.target, evt.originalEvent);
    });

    cy.on("tap", (evt) => {
      if (evt.target === cy) hideContextMenu();
    });

    cy.on("dragfree", "node", () => {
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

    if (ui.classFilterBox) {
      ui.classFilterBox.addEventListener("input", () => {
        applyVisibility();
      });

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
        cy.fit(cy.elements(":visible"), 30);
      });
    }

    ui.applyLayoutButton.addEventListener("click", () => runLayout(ui.layoutSelect.value, true));
    ui.fitButton.addEventListener("click", () => cy.fit(cy.elements(":visible"), 30));

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
    graphIndex = emptyGraphIndex();

    try{
      updateStatus(`Loading ${item.title || item.file}…`);
      ui.detailsContent.innerHTML = `<div class="muted">Loading ontology…</div>`;
      hideContextMenu();

      if (ui.classFilterBox) ui.classFilterBox.value = "";

      const ttl = await fetchText(item.file);
      const graph = buildGraphFromTurtle(ttl);

      graphIndex = graph.index;

      cy.elements().remove();
      cy.add(graph.elements);

      const restored = restorePositions(item.file);

      applyVisibility();

      if (!restored) runLayout(ui.layoutSelect.value, true);
      else cy.fit(cy.elements(":visible"), 40);

      currentStats = graph.stats;
      updateStatus(statusLine(graph.stats));
      ui.detailsContent.innerHTML = `<div class="muted">Loaded <b>${escapeHtml(item.title || item.file)}</b>. Click a class to open the navigation menu.</div>`;
    } catch(err){
      console.error(err);
      updateStatus("Error loading ontology. See console.");
      ui.detailsContent.innerHTML = `<div class="muted">Failed to load or parse ontology.</div>
