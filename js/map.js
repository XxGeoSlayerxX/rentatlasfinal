// js/map.js - Leaflet + quantile 7-class red->green choropleth, shows canopy_fraction in popup
const map = L.map("map").setView([45.5619, -73.6664], 11);

// L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  // maxZoom: 19,
  // attribution: "&copy; OpenStreetMap contributors",
// }).addTo(map);

// 7-class red -> green ramp (low/bad -> high/good)
const colors = ["#a50026","#d73027","#f46d43","#fdae61","#fee08b","#a6d96a","#1a9641"];
const classes = 7;
let breaks = null;
let fsaLayer = null;
let currentProp = "final_score";

function miniBarHTML(label, v, color="#1a9641", width=120, height=8){
  const pct = Math.max(0, Math.min(1, Number(v||0)));
  const filled = (pct*100).toFixed(1) + '%';
  return `<div style="margin:6px 0;font-size:0.85rem">
    <div style="display:flex;justify-content:space-between;margin-bottom:3px"><strong>${label}</strong><small>${filled}</small></div>
    <div style="background:#eee;border-radius:4px;width:${width}px;height:${height}px;overflow:hidden">
      <div style="width:${pct*100}%;height:100%;background:${color};"></div>
    </div>
  </div>`;
}

// scale control
L.control.scale({position:'bottomleft', imperial:false, metric:true}).addTo(map);

// basemaps
const baseLayers = {
  "OSM": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:19, attribution: "&copy; OpenStreetMap contributors"}),
  "CartoDB Positron": L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {maxZoom:19, attribution: '&copy; OpenStreetMap & CARTO'})
};
// add default (CartoDB looks better imo, makes the colors pop more)
baseLayers["CartoDB Positron"].addTo(map);
L.control.layers(baseLayers, null, {collapsed:true, position:'topright'}).addTo(map);

function computeQuantileBreaks(values, k){
  const vals = values.filter(v => v !== null && v !== undefined && !isNaN(Number(v))).map(Number).sort((a,b)=>a-b);
  if(vals.length === 0) return null;
  const out = [];
  for(let i=0;i<k;i++){
    const p = i/(k-1);
    const pos = (vals.length - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    const q = (lo === hi) ? vals[lo] : vals[lo] + (pos - lo) * (vals[hi] - vals[lo]);
    out.push(q);
  }
  return out;
}

function getColorQuantile(d){
  if (d === null || d === undefined || isNaN(d) || !breaks) return "#f0f0f0";
  for (let i = breaks.length - 1; i >= 0; i--) {
    if (d >= breaks[i]) return colors[i];
  }
  return colors[0];
}

function styleFeature(feature){
  const p = feature.properties || {};
  const v = (p[currentProp] === undefined || p[currentProp] === null) ? null : Number(p[currentProp]);
  return {
    fillColor: v === null ? "#f0f0f0" : getColorQuantile(v),
    weight: 1,
    opacity: 1,
    color: "#333",
    fillOpacity: v === null ? 0.12 : 0.85
  };
}

function fmt(x,d=2){ return (x===null||x===undefined||isNaN(Number(x))) ? "n/a" : Number(x).toFixed(d); }

// small inline bar helper (insert after fmt)
function miniBarHTML(label, v, color="#1a9641", width=140, height=8){
  const pct = Math.max(0, Math.min(1, Number(v||0)));
  const filled = (pct*100).toFixed(0) + '%';
  return `<div style="margin:6px 0;font-size:0.86rem">
    <div style="display:flex;justify-content:space-between;margin-bottom:4px"><strong style="font-weight:600">${label}</strong><small style="color:#333">${filled}</small></div>
    <div style="background:#eee;border-radius:4px;width:${width}px;height:${height}px;overflow:hidden">
      <div style="width:${pct*100}%;height:100%;background:${color};"></div>
    </div>
  </div>`;
}

// build popup HTML (use this from onEachFeature and from the applyWeights updater)
function buildPopupHTML(p){
  const id = p.FSA_CODE ?? p.CFSAUID ?? p.FSA ?? "Area";
  const finalScore = p.final_score ?? null;

  const safetyVal = (p.safety_score_new !== undefined && p.safety_score_new !== null)
    ? Number(p.safety_score_new)
    : (p.safety_score !== undefined && p.safety_score !== null)
      ? Number(p.safety_score)
      : (p.crime_score !== undefined && p.crime_score !== null)
        ? (1 - Number(p.crime_score))
        : (p.safety_from_crime !== undefined ? Number(p.safety_from_crime) : 0);

  const parksVal = (p.parks_score_new !== undefined && p.parks_score_new !== null)
    ? Number(p.parks_score_new)
    : (p.parks_score !== undefined && p.parks_score !== null)
      ? Number(p.parks_score)
      : 0;

  const transitVal = (p.transit_score_with_metro !== undefined && p.transit_score_with_metro !== null)
    ? Number(p.transit_score_with_metro)
    : (p.transit_score !== undefined && p.transit_score !== null)
      ? Number(p.transit_score)
      : 0;

  let parkingVal = 0;
  if (p.parking_score !== undefined && p.parking_score !== null) {
    parkingVal = Number(p.parking_score);
  } else if (p.parking_count !== undefined && p.parking_count !== null) {
    parkingVal = Math.min(1, Number(p.parking_count) / 4000);
  }

  return `
    <div style="min-width:200px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <strong style="font-size:1.05rem">${id}</strong>
        <small style="color:#444">Final: ${finalScore !== null ? fmt(finalScore,2) : "n/a"}</small>
      </div>
      <div style="margin-top:6px">
        ${miniBarHTML('Safety', safetyVal, '#d73027')}
        ${miniBarHTML('Parks', parksVal, '#a6d96a')}
        ${miniBarHTML('Transit', transitVal, '#fdae61')}
        ${miniBarHTML('Parking', parkingVal, '#74a9cf')}
      </div>
      <div style="margin-top:6px;font-size:0.84rem;color:#666">
        <div>Population: ${p.population !== undefined ? fmt(p.population,0) : 'n/a'}</div>
      </div>
    </div>
  `;
}

// replace your existing onEachFeature with this version
function onEachFeature(feature, layer){
  const p = feature.properties || {};
  const id = p.FSA_CODE ?? p.CFSAUID ?? p.FSA ?? "Area";

  // final score shown in header (may be runtime-updated by sliders)
  const finalScore = p.final_score ?? null;

  // compute component values with sensible fallbacks / normalization expectations:
  // Safety: prefer safety_score_new (0..1), then safety_score, else invert crime_score (1 - crime)
  const safetyVal = (p.safety_score_new !== undefined && p.safety_score_new !== null)
    ? Number(p.safety_score_new)
    : (p.safety_score !== undefined && p.safety_score !== null)
      ? Number(p.safety_score)
      : (p.crime_score !== undefined && p.crime_score !== null)
        ? (1 - Number(p.crime_score))
        : (p.safety_from_crime !== undefined ? Number(p.safety_from_crime) : 0);

  // Parks: prefer parks_score_new then parks_score
  const parksVal = (p.parks_score_new !== undefined && p.parks_score_new !== null)
    ? Number(p.parks_score_new)
    : (p.parks_score !== undefined && p.parks_score !== null)
      ? Number(p.parks_score)
      : 0;

  // Transit: prefer transit_score_with_metro if present else transit_score
  const transitVal = (p.transit_score_with_metro !== undefined && p.transit_score_with_metro !== null)
    ? Number(p.transit_score_with_metro)
    : (p.transit_score !== undefined && p.transit_score !== null)
      ? Number(p.transit_score)
      : 0;

  // Parking: prefer normalized parking_score, else fall back to scaled parking_count
  let parkingVal = 0;
  if (p.parking_score !== undefined && p.parking_score !== null) {
    parkingVal = Number(p.parking_score);
  } else if (p.parking_count !== undefined && p.parking_count !== null) {
    // scale parking_count into 0..1 for the mini bar display if no normalized field exists
    // you can change the denominator (e.g., 1000) to better scale for your data
    parkingVal = Math.min(1, Number(p.parking_count) / 4000);
  }

  // Build popup HTML using mini bars
  const popupHtml = `
    <div style="min-width:200px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <strong style="font-size:1.05rem">${id}</strong>
        <small style="color:#444">Final: ${finalScore !== null ? fmt(finalScore,2) : "n/a"}</small>
      </div>
      <div style="margin-top:6px">
        ${miniBarHTML('Safety', safetyVal, '#d73027')}
        ${miniBarHTML('Parks', parksVal, '#a6d96a')}
        ${miniBarHTML('Transit', transitVal, '#fdae61')}
        ${miniBarHTML('Parking', parkingVal, '#74a9cf')}
      </div>
      <div style="margin-top:6px;font-size:0.84rem;color:#666">
        <div>Population: ${p.population !== undefined ? fmt(p.population,0) : 'n/a'}</div>
        <div>Crime: ${p.crime_count !== undefined ? fmt(p.crime_count,0) : 'n/a'} — ${p.crime_rate_per_1000 !== undefined ? fmt(p.crime_rate_per_1000,2) : 'n/a'} per 1k</div>
      </div>
    </div>
  `;

  layer.bindPopup(buildPopupHTML(p));

  // quick tooltip for hover
  const ttText = `${id} — ${finalScore !== null ? fmt(finalScore,2) : "n/a"}`;
  layer.bindTooltip(ttText, {sticky:true, direction: 'auto', offset: [0, -10], className: 'fsa-tooltip'});

  // highlight style on hover (stronger than default)
  layer.on("mouseover", () => {
    layer.setStyle({
      weight: 3,
      color: "#222",
      fillOpacity: 0.95
    });
    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) layer.bringToFront();
  });
  layer.on("mouseout", () => {
    // reset to default style from fsaLayer
    if (fsaLayer) fsaLayer.resetStyle(layer);
  });
}

function buildBreaksAndLegend(features){
  const vals = features.map(f => {
    const v = f.properties ? f.properties[currentProp] : null;
    return (v===undefined) ? null : v;
  });
  breaks = computeQuantileBreaks(vals, classes);
  addLegend(); // rebuild legend using breaks/colors
}

function loadMaster(url){
  fetch(url)
    .then(res => { if (!res.ok) throw new Error("GeoJSON not found: " + res.status); return res.json(); })
    .then(geojson => {
      if (fsaLayer) { map.removeLayer(fsaLayer); fsaLayer = null; }
      buildBreaksAndLegend(geojson.features || []);
      fsaLayer = L.geoJSON(geojson, { style: styleFeature, onEachFeature }).addTo(map);
      // if (fsaLayer.getBounds && fsaLayer.getBounds().isValid()) map.fitBounds(fsaLayer.getBounds().pad(0.1));
      // I wanna override this to change the starting location of the map.
      updateTopMatches();
      applyWeightsToMap();
    })
    .catch(err => console.warn("Could not load processed GeoJSON:", err));
}

function updateTopMatches(){
  if(!fsaLayer) return;
  const listEl = document.getElementById("top-list") || document.getElementById("matchList") || document.getElementById("topMatches");
  if(!listEl) return;
  const arr = [];
  fsaLayer.eachLayer(layer => {
    const p = layer.feature.properties || {};
    const id = p.FSA_CODE ?? p.CFSAUID ?? p.FSA ?? "Area";
    const score = Number(p[currentProp] ?? p.final_score ?? -999);
    arr.push({id, score});
  });
  arr.sort((a,b)=>b.score - a.score);
  listEl.innerHTML = "";
  arr.slice(0,10).forEach(item => {
    const li = document.createElement("li");
    li.textContent = `${item.id} — ${item.score===-999 ? "n/a" : item.score.toFixed(2)}`;
    listEl.appendChild(li);
  });
}

let legendControl = null;
// Legend stuff, trying again
function addLegend(){
  if (legendControl) map.removeControl(legendControl);
  legendControl = L.control({position:'bottomright'});
  legendControl.onAdd = function(){
    const div = L.DomUtil.create('div','info legend');
    if(!breaks){
      div.innerHTML = "<strong>No data</strong><br/>No values";
      return div;
    }

    // human-friendly title for known properties
    const niceNames = {
      final_score: "Overall score",
      crime_score: "Safety (crime)",
      parks_score: "Parks score",
      parks_score_new: "Parks (with pools)",
      transit_score: "Transit score",
      parking_score: "Parking score",
      custom_score: "Custom score"
    };
    const title = niceNames[currentProp] || currentProp || "Value";

    let html = `<strong>${title} </strong><br/>`;
    // build labels with ranges; show only classes-1 ranges plus final class
    for(let i=0;i<breaks.length;i++){
      const from = breaks[i];
      const to = (i < breaks.length-1) ? breaks[i+1] : null;
      const fromText = (from !== null && from !== undefined) ? from.toFixed(2) : "n/a";
      const toText = (to !== null && to !== undefined) ? to.toFixed(2) : "max";
      html += `<div style="display:flex;align-items:center;margin:2px 0">
                 <i style="background:${colors[i]};width:18px;height:12px;display:inline-block;margin-right:8px;border:1px solid #888"></i>
                 <small style="color:#222">${fromText} - ${toText}</small>
               </div>`;
    }
    div.innerHTML = html;
    return div;
  };
  legendControl.addTo(map);
}
// ---- Interactive weights UI (reads sliders and updates map on the fly) ----

function readWeights() {
  const wSafety = Number(document.getElementById("w_safety")?.value || 0);
  const wParks = Number(document.getElementById("w_parks")?.value || 0);
  const wTransit = Number(document.getElementById("w_transit")?.value || 0);
  const wParking = Number(document.getElementById("w_parking")?.value || 0);
  const sum = wSafety + wParks + wTransit + wParking || 1;
  return {
    safety: wSafety / sum,
    parks: wParks / sum,
    transit: wTransit / sum,
    parking: wParking / sum
  };
}

function readComponentValue(props) {
  // Determine safety: prefer safety_score_new, then safety_score, then 1 - crime_score
  const crime = Number(props.crime_score ?? props.crime ?? 0);
  let safety = null;
  if (props.safety_score_new !== undefined) safety = Number(props.safety_score_new);
  else if (props.safety_score !== undefined) safety = Number(props.safety_score);
  else if (!isNaN(crime)) safety = 1 - Number(crime);
  else safety = 0;

  // parks: prefer parks_score_new then parks_score
  const parks = props.parks_score_new !== undefined ? Number(props.parks_score_new) : (props.parks_score !== undefined ? Number(props.parks_score) : 0);

  // transit
  const transit = props.transit_score !== undefined ? Number(props.transit_score) : 0;

  // price (may not exist)
  const price = props.price_score !== undefined ? Number(props.price_score) : 0;

  // parking
  const parking = props.parking_score !== undefined ? Number(props.parking_score) : (props.parking_count !== undefined ? Number(props.parking_count) : 0);

  // Ensure numeric & clamp
  return {
    safety: isNaN(safety) ? 0 : safety,
    parks: isNaN(parks) ? 0 : parks,
    transit: isNaN(transit) ? 0 : transit,
    price: isNaN(price) ? 0 : price,
    parking: isNaN(parking) ? 0 : parking
  };
}

function applyWeightsToMap() {
  if (!fsaLayer) return;
  const weights = readWeights();

  // For display: update slider percents
  ["safety","parks","transit","parking"].forEach(k=>{
    const el = document.getElementById("w_" + k);
    const valEl = document.getElementById("w_" + k + "_val");
    if (el && valEl) valEl.textContent = el.value;
  });

  // Compute per-feature combined score and update style & popup
  fsaLayer.eachLayer(layer => {
    const p = layer.feature.properties || {};
    const comp = readComponentValue(p);

    const combined = (
      weights.safety * comp.safety +
      weights.parks * comp.parks +
      weights.transit * comp.transit +
      weights.parking * comp.parking
    );

    // store it as runtime final_score for styling & popup
    p.final_score = combined;

    // update style
    layer.setStyle(styleFeature(layer.feature));

    // update popup content using the same mini-bar template so it always matches current final_score
    const popup = layer.getPopup();
    if (popup) {
      popup.setContent(buildPopupHTML(p));
    }
  });

  // Update legend & top matches (recompute quantiles using the runtime final_score)
  const features = [];
  fsaLayer.eachLayer(l => features.push(l.feature));
  buildBreaksAndLegend(features);
  fsaLayer.setStyle(styleFeature);
  updateTopMatches();
}

// Wire Reset button + live on input for sliders
document.getElementById("resetWeights")?.addEventListener("click", () => {
  // default slider values (match defaults in map.html)
  const defaults = { safety: 35, parks: 30, transit: 25, parking: 10 };
  document.getElementById("w_safety").value = defaults.safety;
  document.getElementById("w_parks").value  = defaults.parks;
  document.getElementById("w_transit").value = defaults.transit;
  document.getElementById("w_parking").value = defaults.parking;
  // update displayed percent spans
  ["safety","parks","transit","parking"].forEach(k=>{
    const valEl = document.getElementById("w_" + k + "_val");
    if (valEl) valEl.textContent = document.getElementById("w_" + k).value;
  });
  // reapply weights to the map
  applyWeightsToMap();
});

// keep live updates while dragging
["w_safety","w_parks","w_transit","w_parking"].forEach(id=>{
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", () => {
    applyWeightsToMap();
  });
});



// Apply initial weights after the layer loads (if layer already present)
if (fsaLayer) applyWeightsToMap();
// UI controls (same wiring as before)
document.querySelectorAll(".control-btn[data-prop]").forEach(btn=>{
  btn.addEventListener("click", () => {
    document.querySelectorAll(".control-btn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const prop = btn.getAttribute("data-prop");
    const mapping = {"overall_score":"final_score","crime_score":"crime_score","parks_score":"parks_score","transit_score":"transit_score","crime_rate":"crime_rate_per_1000","parks_area":"parks_area_per_sqkm","parking_score":"parking_score"};
    currentProp = mapping[prop] || prop || "final_score";
    if (fsaLayer) {
      const features = [];
      fsaLayer.eachLayer(l => features.push(l.feature));
      buildBreaksAndLegend(features);
      fsaLayer.setStyle(styleFeature);
    }
    updateTopMatches();
  });
  
});

// initial load
// loadMaster("data/processed/fsa_master.geojson");
loadMaster("data/processed/fsa_with_parking_score.geojson");