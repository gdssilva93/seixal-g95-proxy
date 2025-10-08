// Seixal • Gasolina 95 proxy (cache + update) — FINAL
// Lê o JSON via POST /update (enviado pelo Shortcut) e serve em GET /seixal.

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";

const PORT = process.env.PORT || 3000;
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "200kb" }));

let cache = { at: 0, payload: null };

// recebe JSON do iPhone
app.post("/update", (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.byBrand) throw new Error("JSON inválido");
    cache = { at: Date.now(), payload: data };
    console.log("Cache atualizada:", data);
    res.json({ ok: true, updated: new Date().toISOString() });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// devolve JSON ao widget
app.get("/seixal", (req, res) => {
  if (!cache.payload) return res.json({ byBrand: {}, ranked: [] });
  res.json(cache.payload);
});

app.get("/", (_req, res) =>
  res.json({ ok: true, endpoints: ["/update (POST)", "/seixal (GET)"] })
);

app.listen(PORT, () =>
  console.log("Proxy Seixal G95 cache ativo na porta", PORT)
);
