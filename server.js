// Seixal • Gasolina 95 proxy (precocombustiveis.pt) — vFinal
// Extrai Gasolina 95 (Simples/Especial) das marcas Galp, Prio e Cepsa no Seixal.
// Aplica -€0.19 na Galp e devolve JSON compatível com o widget Scriptable.

import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const PORT = process.env.PORT || 3000;
const SOURCE_URL = "https://precocombustiveis.pt/seixal";
const DISCOUNT_GALP = 0.19;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora
const BRANDS = ["galp", "prio", "cepsa"];

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1";

const app = express();
app.use(cors());

let cache = { at: 0, payload: null };

// helpers
function parseNumberEu(s) {
  if (!s) return NaN;
  const clean = s.replace(/[^\d,]/g, "").replace(",", ".");
  const val = parseFloat(clean);
  return isFinite(val) ? val : NaN;
}

function extractStations(html) {
  const out = [];
  const rx = /<article[^>]*class="posto"[^>]*>([\s\S]*?)<\/article>/gi;
  let match;
  while ((match = rx.exec(html)) !== null) {
    const block = match[1];
    const brand = BRANDS.find(b => block.toLowerCase().includes(b)) || "unknown";
    const name = (block.match(/class="posto__title"[^>]*>([^<]+)</i) || [])[1]?.trim() || "Posto";
    const location = (block.match(/class="posto__location"[^>]*>([^<]+)</i) || [])[1]?.trim() || "Seixal";

    // procura Gasolina 95
    const rx95 = /Gasolina\s*95[^€]*€\s*([0-9],[0-9]{3})/gi;
    let m, prices = [];
    while ((m = rx95.exec(block)) !== null) {
      const val = parseNumberEu(m[1]);
      const tipo = block.toLowerCase().includes("especial") ? "especial" : "simples";
      if (isFinite(val)) prices.push({ type: tipo, value: val });
    }
    if (prices.length) out.push({ brand, name, location, prices });
  }
  return out;
}

function pickCheapestByBrand(list) {
  const byBrand = {};
  for (const s of list) {
    const sorted = s.prices.slice().sort((a, b) => a.value - b.value);
    const p = sorted[0];
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
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": UA, "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8" },
    timeout: 20000
  });
  const html = await res.text();
  const stations = extractStations(html);
  const byBrand = pickCheapestByBrand(stations);
  const ranked = Object.values(byBrand)
    .filter(r => isFinite(r.priceAdj))
    .sort((a, b) => a.priceAdj - b.priceAdj);
  return { at: new Date().toISOString(), stations, byBrand, ranked };
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
    console.error("Erro:", e);
    res.status(500).json({ error: String(e) });
  }
});

app.get("/", (_req, res) => res.json({ ok: true, endpoints: ["/seixal"], source: SOURCE_URL }));

app.listen(PORT, () => console.log("Proxy Seixal G95 (precocombustiveis.pt) ativo na porta", PORT));
