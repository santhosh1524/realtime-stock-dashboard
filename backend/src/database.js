const { Pool } = require('pg');

// Environmental configurations
const pgUser = process.env.POSTGRES_USER || 'postgres';
const pgPassword = process.env.POSTGRES_PASSWORD || 'postgres';
const pgHost = process.env.POSTGRES_HOST || 'localhost';
const pgPort = process.env.POSTGRES_PORT || 5432;
const pgDb = process.env.POSTGRES_DB || 'stock_dashboard';

let pool = null;
let useFallback = false;

// IN-MEMORY FALLBACK DATABASE
const memoryDb = {
  stock_prices: [],
  stock_aggregates: {} // structure: { 'AAPL-1m': [ { bucket, open, high, low, close, volume } ] }
};

// Seed historical candles for fallback mode
const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];
const basePrices = { AAPL: 175, MSFT: 420, GOOGL: 150, AMZN: 180, TSLA: 170 };

function seedFallbackData() {
  const resolutions = ['1m'];
  const now = new Date();

  symbols.forEach(symbol => {
    resolutions.forEach(res => {
      const key = `${symbol}-${res}`;
      memoryDb.stock_aggregates[key] = [];
      
      let prevClose = basePrices[symbol];
      
      // Generate 100 historical minute candles
      for (let i = 100; i >= 0; i--) {
        const bucket = new Date(now.getTime() - i * 60 * 1000);
        const change = (Math.random() - 0.49) * (prevClose * 0.005); // slightly upward drift
        const open = prevClose;
        const close = open + change;
        const high = Math.max(open, close) + Math.random() * (open * 0.002);
        const low = Math.min(open, close) - Math.random() * (open * 0.002);
        const volume = Math.floor(Math.random() * 5000) + 500;
        
        memoryDb.stock_aggregates[key].push({
          symbol,
          resolution: res,
          bucket: bucket.toISOString(),
          open: parseFloat(open.toFixed(2)),
          high: parseFloat(high.toFixed(2)),
          low: parseFloat(low.toFixed(2)),
          close: parseFloat(close.toFixed(2)),
          volume: parseInt(volume)
        });
        
        prevClose = close;
      }
    });
  });
  console.log('⚡ [Fallback DB] Seeded 100 historical in-memory candles for each ticker.');
}

// Connect to Database
async function connectDb() {
  console.log(`📡 Attempting connection to PostgreSQL at ${pgHost}:${pgPort}...`);
  try {
    pool = new Pool({
      user: pgUser,
      password: pgPassword,
      host: pgHost,
      port: pgPort,
      database: pgDb,
      connectionTimeoutMillis: 3000 // 3 seconds timeout
    });

    // Test query
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL database successfully.');
    client.release();
  } catch (error) {
    console.warn('⚠️  PostgreSQL connection failed. Falling back to IN-MEMORY database.');
    console.warn(`Reason: ${error.message}`);
    useFallback = true;
    seedFallbackData();
  }
}

// Write a tick (trade) to DB
async function insertTick(symbol, price, volume, timestamp = new Date()) {
  if (useFallback) {
    // Save raw tick
    const tick = { symbol, price, volume, timestamp: timestamp.toISOString() };
    memoryDb.stock_prices.push(tick);
    if (memoryDb.stock_prices.length > 5000) memoryDb.stock_prices.shift(); // caps memory usage

    // Update 1m aggregate
    const key = `${symbol}-1m`;
    if (!memoryDb.stock_aggregates[key]) {
      memoryDb.stock_aggregates[key] = [];
    }

    // Align timestamp to the minute bucket
    const bucketTime = new Date(timestamp);
    bucketTime.setSeconds(0, 0);
    const bucketIso = bucketTime.toISOString();

    const arr = memoryDb.stock_aggregates[key];
    const existing = arr.find(a => a.bucket === bucketIso);

    if (existing) {
      existing.high = Math.max(existing.high, price);
      existing.low = Math.min(existing.low, price);
      existing.close = price;
      existing.volume += volume;
    } else {
      const open = arr.length > 0 ? arr[arr.length - 1].close : price;
      arr.push({
        symbol,
        resolution: '1m',
        bucket: bucketIso,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(Math.max(open, price).toFixed(2)),
        low: parseFloat(Math.min(open, price).toFixed(2)),
        close: parseFloat(price.toFixed(2)),
        volume: parseInt(volume)
      });
      // Cap at 300 candles to keep memory clean
      if (arr.length > 300) arr.shift();
    }
    return tick;
  }

  // Postgres path
  const query = 'INSERT INTO stock_prices (symbol, price, volume, timestamp) VALUES ($1, $2, $3, $4) RETURNING *';
  const values = [symbol, price, volume, timestamp];
  try {
    const res = await pool.query(query, values);
    
    // Also perform incremental aggregation in the background
    await updatePostgresAggregates(symbol, price, volume, timestamp);
    
    return res.rows[0];
  } catch (error) {
    console.error('Error inserting price tick into Postgres:', error);
  }
}

// Direct incremental Postgres Aggregation matching fallback logic
async function updatePostgresAggregates(symbol, price, volume, timestamp) {
  const bucketTime = new Date(timestamp);
  bucketTime.setSeconds(0, 0);
  
  const selectQuery = 'SELECT * FROM stock_aggregates WHERE symbol = $1 AND resolution = $2 AND bucket = $3';
  const selectValues = [symbol, '1m', bucketTime];
  
  try {
    const selectRes = await pool.query(selectQuery, selectValues);
    if (selectRes.rows.length > 0) {
      // Update existing
      const updateQuery = `
        UPDATE stock_aggregates 
        SET high = GREATEST(high, $4), low = LEAST(low, $4), close = $4, volume = volume + $5
        WHERE symbol = $1 AND resolution = $2 AND bucket = $3
      `;
      await pool.query(updateQuery, [symbol, '1m', bucketTime, price, volume]);
    } else {
      // Get previous close as open
      const prevQuery = 'SELECT close FROM stock_aggregates WHERE symbol = $1 AND resolution = $2 ORDER BY bucket DESC LIMIT 1';
      const prevRes = await pool.query(prevQuery, [symbol, '1m']);
      const open = prevRes.rows.length > 0 ? parseFloat(prevRes.rows[0].close) : price;
      
      const insertQuery = `
        INSERT INTO stock_aggregates (symbol, resolution, bucket, open, high, low, close, volume)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;
      await pool.query(insertQuery, [
        symbol,
        '1m',
        bucketTime,
        open,
        Math.max(open, price),
        Math.min(open, price),
        price,
        volume
      ]);
    }
  } catch (error) {
    console.error('Error updating PostgreSQL stock aggregates:', error);
  }
}

// Retrieve historical candles (OHLC)
async function getHistoricalCandles(symbol, resolution = '1m', limit = 100) {
  if (useFallback) {
    const key = `${symbol}-${resolution}`;
    const data = memoryDb.stock_aggregates[key] || [];
    // Return latest 'limit' elements sorted chronologically
    return data.slice(-limit);
  }

  // Postgres Path
  const query = `
    SELECT bucket, open, high, low, close, volume 
    FROM stock_aggregates 
    WHERE symbol = $1 AND resolution = $2 
    ORDER BY bucket DESC 
    LIMIT $3
  `;
  const values = [symbol, resolution, limit];
  try {
    const res = await pool.query(query, values);
    // Reverse elements so they are in chronological order (oldest to newest) for charting
    return res.rows.reverse().map(row => ({
      symbol,
      resolution,
      bucket: new Date(row.bucket).toISOString(),
      open: parseFloat(row.open),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      close: parseFloat(row.close),
      volume: parseInt(row.volume)
    }));
  } catch (error) {
    console.error('Error fetching historical aggregates from Postgres:', error);
    return [];
  }
}

function isFallback() {
  return useFallback;
}

module.exports = {
  connectDb,
  insertTick,
  getHistoricalCandles,
  isFallback
};
