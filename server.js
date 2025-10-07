// Seixal • Gasolina 95 proxy (DGEG HTML scraper) — v3 FINAL
// Corrige parsing do HTML para o layout atual do site da DGEG.
// Extrai Gasolina 95 Simples e Especial de forma robusta.

import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const PORT = process.env.PORT || 3000;
const DISCOUNT_GALP = 0.19;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

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

// helper simples
function parseNumberEu(s) {
  if (!s) return NaN;
  const clean = s.replace(/\s|€/g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isFinite(n) ? n : NaN;
}

// novo parser de gasolina 95 (resiliente ao HTML)
function extractGasolina(html) {
  const out = [];
  const lower = html.toLowerCase();

  // combinações típicas de Gasolina 95
  const rx = /(gasolina\s*95[^\d€]{0,40}€?\s*([0-9],[0-9]{3}))/gi;
  let match;
  while ((match = rx.exec(lower)) !== null) {
    const val = parseNumberEu(match[2]);
    if (isFinite(val)) {
      const bloco = match[1];
      const tipo = bloco.includes("especial") || bloco.includes("aditiv") || bloco.includes("+")
        ? "especial"
        : "simples";
      out.push({ type: tipo, value: val });
    }
  }

  // fallback: procurar tabela
  if (out.length === 0) {
    const rx2 = /gasolina\s*95[^<]*<\/[^>]*>\s*<\/[^>]*>\s*<td[^>]*>\s*€?\s*([0-9],[0-9]{3})/gi;
    while ((match = rx2.exec(lower)) !== null) {
      const val = parseNumberEu(match[1]);
      if (isFinite(val)) out.push({ type: "simples", value: val });
    }
  }

  return out;
}

async function fetchStationHTML(id) {
  const url = `https://precoscombustiveis.dgeg.gov.pt/Posto/${id}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8"
      },
      timeout: 20000
    });
    if (!res.ok) throw new Error(res.statusText);
    return await res.text();
  } catch (e) {
    console.error("Erro fetch HTML:", id, e.message);
    return "";
  }
}

async function fetchStationPrices(id) {
  const html = await fetchStationHTML(id);
  if (!html) return [];
  return extractGasolina(html);
}

function pickCheapestByBrand(stations, priceMap) {
  const byBrand = {};
  for (const s of stations) {
    const prices = (priceMap[s.id] || []).slice().sort((a,b)=>a.value-b.value);
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
  // desconto galp
  if (byBrand.galp && isFinite(byBrand.galp.priceRaw))
    byBrand.galp.priceAdj = Math.max(byBrand.galp.priceRaw - DISCOUNT_GALP, 0);
  for (const k of Object.keys(byBrand))
    if (k !== "galp") byBrand[k].priceAdj = byBrand[k].priceRaw;
  return byBrand;
}

async function computePayload() {
  const priceMap = {};
  for (const s of STATIONS) {
    priceMap[s.id] = await fetchStationPrices(s.id);
    await new Promise(r => setTimeout(r, 200));
  }
  const byBrand = pickCheapestByBrand(STATIONS, priceMap);
  const ranked = Object.values(byBrand)
    .filter(r => isFinite(r.priceAdj))
    .sort((a, b) => a.priceAdj - b.priceAdj);
  return { at: new Date().toISOString(), stations: STATIONS, byBrand, ranked };
}

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

app.get("/", (_req, res) => res.json({ ok: true, endpoints: ["/seixal"] }));

app.listen(PORT, () => console.log("Seixal G95 proxy SCRAPER ativo na porta", PORT));
