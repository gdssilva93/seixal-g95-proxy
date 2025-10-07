// Seixal • Diagnóstico HTML DGEG — vDiag
// Mostra primeiras linhas do HTML devolvido pelo site por cada posto.

import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const PORT = process.env.PORT || 3000;
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1";

const STATIONS = [
  { id: 66099, brand: "galp",  name: "Galp Arrentela" },
  { id: 65949, brand: "galp",  name: "Galp Petrolinos" },
  { id: 65948, brand: "prio",  name: "PRIO Amora" },
  { id: 65947, brand: "prio",  name: "Prio Corroios" },
  { id: 65946, brand: "prio",  name: "PRIO Fernão Ferro" },
  { id: 65945, brand: "cepsa", name: "Cepsa Fogueteiro" }
];

const app = express();
app.use(cors());

async function fetchHTML(id) {
  const url = `https://precoscombustiveis.dgeg.gov.pt/Posto/${id}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8"
      },
      timeout: 20000
    });
    const text = await res.text();
    // remove tags e reduz espaços
    const clean = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      ok: res.ok,
      status: res.status,
      length: text.length,
      snippet: clean.slice(0, 400)
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

app.get("/seixal", async (_req, res) => {
  const results = {};
  for (const s of STATIONS) {
    results[s.name] = await fetchHTML(s.id);
    await new Promise(r => setTimeout(r, 300));
  }
  res.json({ at: new Date().toISOString(), results });
});

app.get("/", (_req, res) => res.json({ ok: true, endpoint: "/seixal" }));

app.listen(PORT, () => console.log("Diagnóstico ativo na porta", PORT));
