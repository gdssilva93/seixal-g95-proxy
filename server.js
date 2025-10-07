// Seixal • DGEG HTML Debug — v5
// Guarda o HTML do primeiro posto (Galp Arrentela) e devolve os primeiros 400 caracteres limpos.

import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import https from "node:https";
import fs from "fs";

const PORT = process.env.PORT || 3000;

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile Safari/604.1";

const STATIONS = [
  { id: 66099, brand: "galp", name: "Galp Arrentela", location: "Seixal" },
  { id: 65949, brand: "galp", name: "Galp Petrolinos", location: "Fogueteiro" },
  { id: 65948, brand: "prio", name: "PRIO Amora", location: "Amora" },
  { id: 65947, brand: "prio", name: "Prio Corroios", location: "Corroios" },
  { id: 65946, brand: "prio", name: "PRIO Fernão Ferro", location: "Fernão Ferro" },
  { id: 65945, brand: "cepsa", name: "Cepsa Fogueteiro", location: "Seixal" }
];

const dgegAgent = new https.Agent({ rejectUnauthorized: false });

const app = express();
app.use(cors());

async function fetchHTML(id) {
  const url = `https://precoscombustiveis.dgeg.gov.pt/Posto/${id}`;
  try {
    const res = await fetch(url, {
      agent: dgegAgent,
      headers: {
        "User-Agent": UA,
        "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      timeout: 30000
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

app.get("/seixal", async (_req, res) => {
  // Só faz debug do primeiro posto (Galp Arrentela)
  const first = STATIONS[0];
  const htmlRes = await fetchHTML(first.id);
  let snippet = "";

  if (htmlRes.ok) {
    // guarda ficheiro completo
    fs.writeFileSync("debug_galp_arrentela.html", htmlRes.text, "utf8");

    // limpa tags e reduz espaços
    snippet = htmlRes.text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
  }

  res.json({
    at: new Date().toISOString(),
    station: first,
    ok: htmlRes.ok,
    status: htmlRes.status,
    error: htmlRes.error || null,
    snippet,
    savedFile: htmlRes.ok ? "debug_galp_arrentela.html" : null
  });
});

app.get("/", (_req, res) => res.json({ ok: true, endpoint: "/seixal" }));

app.listen(PORT, () => console.log("DGEG HTML Debug ativo na porta", PORT));
