// Seixal • Gasolina 95 proxy (DGEG) — Express
// Puxa dados oficiais da DGEG, só Gasolina 95, aplica -€0.19 na Galp e expõe JSON limpo.
// CORS ON. Cache em memória para evitar rate-limit.

import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const PORT = process.env.PORT || 3000;
const DISCOUNT_GALP = 0.19;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

// IDs DGEG (fixos) para o concelho do Seixal
const STATIONS = [
  { id: 66099, brand: "galp",  name: "Galp Arrentela",     location: "Seixal" },
  { id: 65949, brand: "galp",  name: "Galp Petrolinos",    location: "Fogueteiro" },
  { id: 65948, brand: "prio",  name: "PRIO Amora",         location: "Amora" },
  { id: 65947, brand: "prio",  name: "Prio Corroios",      location: "Corroios" },
  { id: 65946, brand: "prio",  name: "PRIO Fernão Ferro",  location: "Fernão Ferro" },
  { id: 65945, brand: "cepsa", name: "Cepsa Fogueteiro",   location: "Seixal" }
];

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1";

const app = express();
app.use(cors());

let cache = { at: 0, payload: null };

function parseNumberEu(s) {
  if (s == null) return NaN;
  const v = String(s).replace("€", "").replace("€/litro", "").trim().replace(",", ".");
  const n = parseFloat(v);
  return isFinite(n) ? n : NaN;
}

async function fetchStationG95(id) {
  const url =
    `https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb/GetDadosPostoMapa?id=${encodeURIComponent(id)}&f=json`;
  const res = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": UA, "Referer": "https://precoscombustiveis.dgeg.gov.pt/" },
    timeout: 20000
  });
  const json = await res.json().catch(() => null);
  const r = json && json.resultado ? json.resultado : null;
  if (!r || !Array.isArray(r.Combustiveis)) return [];

  const out = [];
  for (const c of r.Combustiveis) {
    const label = String(c.Combustivel || c.Nome || "").toLowerCase();
    if (label.includes("gasolina") && label.includes("95")) {
      const val = parseNumberEu(c.Preco);
      if (isFinite(val)) {
        const tipo = (label.includes("especial") || label.includes("+") || label.includes("aditiv")) ? "especial" : "simples";
        out.push({ type: tipo, value: val });
      }
    }
  }
  return out;
}

function pickCheapestByBrand(stations, priceMap) {
  const byBrand = {};
  for (const s of stations) {
    const prices = (priceMap[s.id] || []).slice().sort((a, b) => a.value - b.value);
    if (!prices.length) continue;
    const p = prices[0];
    const current = byBrand[s.brand];
    if (!current || p.value < current.priceRaw) {
      byBrand[s.brand] = {
        brand: s.brand,
        stationName: s.name,
        location: s.location,
        priceRaw: p.value,
        priceType: p.type
      };
    }
  }
  // aplica desconto Galp
  if (byBrand.galp && isFinite(byBrand.galp.priceRaw)) {
    byBrand.galp.priceAdj = Math.max(byBrand.galp.priceRaw - DISCOUNT_GALP, 0);
  }
  for (const k of Object.keys(byBrand)) {
    if (k !== "galp") byBrand[k].priceAdj = byBrand[k].priceRaw;
  }
  return byBrand;
}

async function computePayload() {
  const priceMap = {};
  for (const s of STATIONS) {
    try {
      priceMap[s.id] = await fetchStationG95(s.id);
      await new Promise(r => setTimeout(r, 120)); // cordial
    } catch {
      priceMap[s.id] = [];
    }
  }
  const byBrand = pickCheapestByBrand(STATIONS, priceMap);
  const ranked = Object.values(byBrand).filter(r => isFinite(r.priceAdj)).sort((a, b) => a.priceAdj - b.priceAdj);
  return { at: new Date().toISOString(), stations: STATIONS, byBrand, ranked };
}

// endpoint principal
app.get("/seixal", async (_req, res) => {
  try {
    const now = Date.now();
    if (!cache.payload || now - cache.at > CACHE_TTL_MS) {
      const payload = await computePayload();
      cache = { at: now, payload };
    }
    res.json(cache.payload);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// estado simples
app.get("/", (_req, res) => res.json({ ok: true, endpoints: ["/seixal"] }));

app.listen(PORT, () => console.log("Seixal G95 proxy up on", PORT));
