require('dotenv').config();
const { ethers } = require('ethers');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

// 1) Setup Provider & Wallet (Polygon / EVM-compatible network)
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// 2) Load the compiled ABI from your existing build or artifacts
//    Note the path has ../ if your script is in `backend/` 
const assetManagerABI = require('../artifacts/contracts/AssetManager.sol/AssetManager.json').abi;

// 3) Contract instance
const assetManagerAddress = process.env.ASSET_MANAGER_ADDRESS;
const assetManagerContract = new ethers.Contract(
  assetManagerAddress,
  assetManagerABI,
  wallet
);

// 4) Connect to the same data.db that your server.js uses
const db = new sqlite3.Database('data.db');

// Ensure sensor_readings table exists
db.run(`
  CREATE TABLE IF NOT EXISTS sensor_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,   -- Now store as INTEGER
    timestamp DATETIME NOT NULL,
    temperature REAL NOT NULL,
    vibration REAL NOT NULL
  )
`);

// 5) Use numeric asset IDs for your 3 lamps
const ASSET_IDS = [0, 1, 2];

// We track how many consecutive "high" readings each asset has
const consecutiveHighTempCount = {
  0: 0,
  1: 0,
  2: 0
};

const TEMP_THRESHOLD = 70;
const THRESHOLD_COUNT = 3; // 3 consecutive times => report fault

// 6) Helper: random sensor data
function generateSensorData() {
  // e.g. temperature: ~40-90°C, vibration: ~1-10
  const temperature = (40 + Math.random() * 50).toFixed(1);
  const vibration = (1 + Math.random() * 9).toFixed(2);
  return {
    temperature: parseFloat(temperature),
    vibration: parseFloat(vibration)
  };
}

// 7) Insert reading into DB
function storeReading(assetId, temperature, vibration) {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    const sql = `
      INSERT INTO sensor_readings (asset_id, timestamp, temperature, vibration)
      VALUES (?, ?, ?, ?)
    `;
    db.run(sql, [assetId, now, temperature, vibration], function (err) {
      if (err) return reject(err);
      resolve(this.lastID);
    });
  });
}

// 8) Check threshold => if 3 high reads in a row => call reportFault
async function checkThreshold(assetId, temperature) {
  if (temperature > TEMP_THRESHOLD) {
    consecutiveHighTempCount[assetId]++;
     console.log(
    `[Info] Asset #${assetId} => temperature ${temperature}°C > 70°C!` +
    ` Consecutive high count: ${consecutiveHighTempCount[assetId]}`
  );
  } else {
    consecutiveHighTempCount[assetId] = 0;
  }

  if (consecutiveHighTempCount[assetId] >= THRESHOLD_COUNT) {
    console.log(`[Fault] Asset ${assetId} => 3 consecutive high temps! Reporting fault.`);
    try {
      // Because your function expects a numeric uint _id:
      const tx = await assetManagerContract.reportFault(
        assetId,
        'Predictive maintenance triggered (High temperature)'
      );
      console.log('reportFault tx hash:', tx.hash);

      // Reset so we don’t spam
      consecutiveHighTempCount[assetId] = 0;
    } catch (err) {
      console.error('Error calling reportFault:', err);
    }
  }
}

// 9) Read the last N sensor readings from DB
function getLastNReadings(assetId, n) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT temperature, vibration, timestamp
      FROM sensor_readings
      WHERE asset_id = ?
      ORDER BY id DESC
      LIMIT ?
    `;
    db.all(sql, [assetId, n], (err, rows) => {
      if (err) return reject(err);
      // rows are newest-first, so let's reverse them to get oldest-first
      resolve(rows.reverse());
    });
  });
}

// 10) Every 3 minutes => storePredictiveHash
async function storeHashes() {
  for (const assetId of ASSET_IDS) {
    try {
      const readings = await getLastNReadings(assetId, 3);
      const r = await readings;
      if (r.length < 3) {
        console.log(`[Hash] Not enough readings for asset #${assetId}`);
        continue;
      }

      // Concatenate them e.g. as JSON
      const concatenated = JSON.stringify(r);
      // Compute SHA-256
      const hashHex = crypto
        .createHash('sha256')
        .update(concatenated)
        .digest('hex');

      console.log(`[Hash] Asset #${assetId}, hash=${hashHex}`);

      // The function expects (uint _assetId, string memory _hash)
      const tx = await assetManagerContract.storePredictiveHash(assetId, hashHex);
      console.log('storePredictiveHash tx:', tx.hash);
    } catch (err) {
      console.error(`[Hash] Error for asset #${assetId}`, err);
    }
  }
}

// 11) Generate readings every 30s (or 1 min, your choice)
async function simulateReadings() {
  for (const assetId of ASSET_IDS) {
    // (Optional) If you want to skip data if the asset is Broken, you can:
     let status = await assetManagerContract.getAssetStatus(assetId);
     if (status !== "Operational") {
       console.log(`Skipping asset #${assetId}, status=${status}`);
       continue;
     }

    const { temperature, vibration } = generateSensorData();
    console.log(`[Reading] Asset #${assetId}, temp=${temperature}, vib=${vibration}`);

    await storeReading(assetId, temperature, vibration);
    await checkThreshold(assetId, temperature);
  }
}

// 12) Start intervals
function start() {
  console.log("Predictive Maintenance Service started…");

  // A) Every 30s => create new readings
  setInterval(simulateReadings, 20 * 1000);

  // B) Every 3 minutes => store predictive hash
  setInterval(storeHashes,  5 * 60 * 1000);
}

start();
