// backend/server.js

import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

const db = new Database('data.db');
dotenv.config();

// Create a table to store each asset’s user gas cost
db.prepare(`
  CREATE TABLE IF NOT EXISTS gas_costs (
    assetId INTEGER PRIMARY KEY,
    user TEXT NOT NULL,
    costWei TEXT NOT NULL,
    polUsd REAL NOT NULL,
    ts INTEGER NOT NULL
  )
`).run();

const app = express();
app.use(cors());
app.use(express.json());



// ──────────────────────────────────────────────────────────────
// 2.  helper to fetch MATIC/USD from CoinMarketCap
// ──────────────────────────────────────────────────────────────
const CMC_ENDPOINT = 'https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?symbol=POL&convert=USD';
const CMC_KEY = process.env.CMC_API_KEY;     // put this in .env

async function fetchPolUsd() {
  if (!CMC_KEY) throw new Error('CMC_API_KEY missing');

  const r = await fetch(CMC_ENDPOINT, {
    headers: { 'X-CMC_PRO_API_KEY': CMC_KEY },
  });

  if (!r.ok) throw new Error(`CMC status ${r.status}`);

  const j = await r.json();
  // response format: { data: { POL: [ { quote: { USD: { price } } } ] } }
  const price = j.data.POL[0].quote.USD.price;
  return price;            // number, e.g. 0.74213
}

/* ========== NEW:  GET /polPrice  ========== */
app.get('/polPrice', async (_req, res) => {
  try {
    const price = await fetchPolUsd();
    res.json({ price });
  } catch (err) {
    console.error('fetchPolUsd failed:', err.message);
    res.status(502).json({ error: err.message });
  }
});

/* POST /gasCosts – insert or update */
app.post('/gasCosts', async (req, res) => {
  let { assetId, user, costWei, polUsd } = req.body;
  if (assetId === undefined || !user || !costWei) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  /* fetch price if client didn’t supply it */
  if (polUsd === undefined) {
    try {
      polUsd = await fetchPolUsd();
    } catch (err) {
      console.error('Price fetch failed:', err.message);
      polUsd = -1;                        // sentinel – detect later
    }
  }

  const ts = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT OR REPLACE INTO gas_costs
      (assetId, user, costWei, polUsd, ts)
    VALUES
      (@assetId, @user, @costWei, @polUsd, @ts)
  `).run({ assetId, user, costWei, polUsd, ts });

  res.json({ success: true });
});

/* GET /gasCosts – list all rows */
app.get('/gasCosts', (_req, res) => {
  const rows = db.prepare(`
    SELECT assetId, user, costWei, polUsd, ts FROM gas_costs
  `).all();
  res.json(rows);
});


/* POST /resetDB – drop & recreate the table */
app.post('/resetDB', (_req, res) => {
  try {
    db.exec('DROP TABLE IF EXISTS gas_costs;');
    db.exec(`
      CREATE TABLE IF NOT EXISTS gas_costs (
        assetId  INTEGER PRIMARY KEY,
        user     TEXT    NOT NULL,
        costWei  TEXT    NOT NULL,
        polUsd   REAL    NOT NULL,
        ts       INTEGER NOT NULL
      )
    `);
    res.json({ success: true });
  } catch (err) {
    console.error('Error resetting DB:', err);
    res.status(500).json({ error: err.message });
  }
});

// ADD THIS new route to use when i rimborso l utente, gli cancello la riga in db
app.delete('/gasCosts', (req, res) => {
  // We expect ?assetId=123&user=0xABC&costWei=9999 in the query string
  let { assetId, user, costWei } = req.query;

  try {
    // Validate them. For instance:
    if (!assetId || !user || !costWei) {
      return res
        .status(400)
        .json({ error: "Missing assetId, user, or costWei in query." });
    }

    // Optional: parse assetId to integer if you want
    const id = parseInt(assetId);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid assetId" });
    }

    // Next, run a DELETE with all three fields in the WHERE clause
    const stmt = db.prepare(
      `DELETE FROM gas_costs 
       WHERE assetId = @id 
         AND user = @user 
         AND costWei = @costWei`
    );
    const info = stmt.run({ id, user, costWei });

    // info.changes tells how many rows were deleted
    if (info.changes === 0) {
      return res.json({ success: false, message: "No matching row found" });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting gas cost:", err);
    return res.status(500).json({ error: err.message });
  }
});



const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

//curl -X POST http://localhost:4000/resetDB reset the db
