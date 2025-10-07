// Seixal • Gasolina 95 proxy (DGEG HTML scraper) — v4
// Corrige TLS: usa https.Agent({ rejectUnauthorized:false }) só para DGEG.
// Extrai Gasolina 95 (Simples/Especial) do HTML. Aplica -€0.19 na Galp. Cache 15m.

import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import https from "node:https";

const PORT = process.env.PORT || 3000;
const DISCOUNT_GALP = 0.19;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

// IDs DGEG fixos (Seixal)
const STATIONS = [
  { id: 66099, brand: "galp",  name: "Galp Arrentela",     location: "Seixal" },
  { id: 65949, brand: "galp",  name: "Galp Petrolinos",    location: "Fogueteiro" },
  { id: 65948, brand: "prio",  name: "PRIO Amora",         location: "Amora" },
  { id: 65947, brand: "prio",  name: "Prio Corroios",      location: "Corroios" },
  { id: 65946, brand: "prio",  name: "PRIO Fernão Ferro",  location: "Fernão Ferro" },
  { id: 65945, brand: "cepsa", name: "Cepsa Fogueteiro",   location: "Seixal" }
];

// UA de browser móvel
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1";

const app = express();
app.use(cors());

let cache = { at: 0, payload: null };

// Agent só para o host da DGEG (desativa verificação de cadeia TLS nesse host)
const dgegAgent = new https.Agent({ rejectUnauthorized: false });

// Helpers
function parseNumberEu(s) {
  if (!s) return NaN;
  const n = parseFloat(String(s).replace(/\s|€/g, "").replace(",", "."));
  return isFinite(n) ? n : NaN;
}

// Parser robusto para Gasolina 95 no HTML (Simples/Especial)
function extractGasolina(html) {
  const out = [];
  const lower = html.toLowerCase();

  // 1) Combinações típicas “Gasolina 95 … €x,xxx”
  // pega também casos com "Simples 95" / "Especial 95" junto da palavra gasolina
  const rx = /(gasolina[^<]{0,30}95[^€]{0,60}€\s*([0-9],[0-9]{3}))/gi;
  let m;
  while ((m = rx.exec(lower)) !== null) {
    const val = parseNumberEu(m[2]);
    if (isFinite(val)) {
      const bloco = m[0];
      const tipo = (bloco.includes("especial") || bloco.includes("aditiv") || bloco.includes("+")) ? "especial" : "simples";
      out.push({ type: tipo, value: val });
    }
  }

  // 2) Fallback: linhas de tabela (…Gasolina…95…)(…€ x,xxx…)
  if (out.length === 0) {
    const rx2 = /gasolina[^<]{0,30}95[\s\S]{0,120}?€\s*([0-9],[0-9]{3})/gi;
    while ((m = rx2.exec(lower)) !== null) {
      const val = parseNumberEu(m[1]);
      if (isFinite(val)) out.push({ type: "simples", value: val });
    }
  }

  // Deduplicar (caso se apanhe 2x o mesmo)
  const uniq = [];
  for (const p of out) {
    if (!uniq.some(u => u.type === p.type && Math.abs(u.value - p.value) < 1e-6)) uniq.push(p);
  }
  return uniq;
}

async function fetchStationHTML(id) {
  const url = `https://precoscombustiveis.dgeg.gov.pt/Posto/${id}`;
  try {
    const res = await fetch(url, {
      // agent só para este pedido (TLS relaxado só aqui)
      agent: dgegAgent,
      headers: {
        "User-Agent": UA,
        "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      timeout: 30000
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    console.error("Erro fetch HTML:", id, String(e));
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
  // aplica desconto Galp
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
    // pequena pausa cordial
    await new Promise(r => setTimeout(r, 200));
  }
  const byBrand = pickCheapestByBrand(STATIONS, priceMap);
  const ranked = Object.values(byBrand).filter(r => isFinite(r.priceAdj)).sort((a,b)=>a.priceAdj-b.priceAdj);
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

app.listen(PORT, () => console.log("Seixal G95 proxy SCRAPER (TLS fixed) ativo na porta", PORT));
