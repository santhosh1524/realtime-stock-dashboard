require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const db = require('./database');
const cache = require('./cache');
const simulator = require('./simulator');

const app = express();
const port = process.env.PORT || 5000;

// Enable CORS
app.use(cors({
  origin: '*' // In production, refine this
}));

app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// WebSocket client subscriptions track
const clientSubscriptions = new Map(); // ws -> symbol subscription

// Start databases
async function initializeServers() {
  await db.connectDb();
  await cache.connectCache();

  // Start Simulation
  simulator.startSimulation(async (tickData) => {
    // 1. Write the tick to PostgreSQL (falls back to memory if DB not active)
    await db.insertTick(tickData.symbol, tickData.price, tickData.newTrade.size, new Date(tickData.newTrade.timestamp));

    // 2. Broadcast tick via WebSockets
    broadcastTick(tickData);
  });
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('🔌 Client connected via WebSockets.');
  
  // Set default subscription
  clientSubscriptions.set(ws, 'AAPL');

  // Send initial data for all tickers to client immediately
  ws.send(JSON.stringify({
    type: 'INIT',
    data: simulator.getAllStocksData()
  }));

  // Handle client messages
  ws.on('message', (message) => {
    try {
      const payload = JSON.parse(message);
      if (payload.action === 'SUBSCRIBE') {
        const symbol = payload.symbol;
        if (simulator.SYMBOLS.includes(symbol)) {
          clientSubscriptions.set(ws, symbol);
          console.log(`🎯 Client subscribed to symbol: ${symbol}`);
          
          // Send current state of subscription immediately
          ws.send(JSON.stringify({
            type: 'SUBSCRIBED',
            symbol,
            data: simulator.getStockData(symbol)
          }));
        }
      }
    } catch (e) {
      console.error('Invalid WebSocket message received from client:', e.message);
    }
  });

  ws.on('close', () => {
    clientSubscriptions.delete(ws);
    console.log('🔌 Client disconnected.');
  });
});

// Broadcast ticks to WebSocket clients
function broadcastTick(tickData) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      // 1. Always send generic price tick so sidebar / ticker summaries update in real time
      client.send(JSON.stringify({
        type: 'TICK',
        symbol: tickData.symbol,
        price: tickData.price,
        change: tickData.change,
        changePercent: tickData.changePercent,
        volume: tickData.volume
      }));

      // 2. If client is specifically subscribed to this symbol, send full update (order book, trade log, stats)
      const subSymbol = clientSubscriptions.get(client);
      if (subSymbol === tickData.symbol) {
        client.send(JSON.stringify({
          type: 'DETAIL_UPDATE',
          data: tickData
        }));
      }
    }
  });
}

// REST API Endpoints

// GET /api/health - Health check status (including fallback states)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    environment: process.env.NODE_ENV || 'development',
    features: {
      postgresFallback: db.isFallback(),
      redisFallback: cache.isFallback()
    }
  });
});

// GET /api/stocks - Get details for all stocks (Uses Redis Caching)
app.get('/api/stocks', async (req, res) => {
  const cacheKey = 'api:stocks:all';
  
  // Try Cache
  const cachedData = await cache.getCached(cacheKey);
  if (cachedData) {
    return res.json({ source: 'cache', data: cachedData });
  }

  // Live Data
  const data = simulator.getAllStocksData();
  
  // Cache for 3 seconds
  await cache.setCached(cacheKey, data, 3);
  res.json({ source: 'live', data });
});

// GET /api/stocks/:symbol - Get detailed state for a stock
app.get('/api/stocks/:symbol', async (req, res) => {
  const { symbol } = req.params;
  if (!simulator.SYMBOLS.includes(symbol)) {
    return res.status(404).json({ error: `Symbol ${symbol} not found.` });
  }

  const cacheKey = `api:stocks:${symbol}`;
  const cachedData = await cache.getCached(cacheKey);
  if (cachedData) {
    return res.json({ source: 'cache', data: cachedData });
  }

  const data = simulator.getStockData(symbol);
  
  // Cache for 2 seconds
  await cache.setCached(cacheKey, data, 2);
  res.json({ source: 'live', data });
});

// GET /api/stocks/:symbol/candles - Get historical aggregates (Uses Redis Caching)
app.get('/api/stocks/:symbol/candles', async (req, res) => {
  const { symbol } = req.params;
  const resolution = req.query.resolution || '1m';
  const limit = parseInt(req.query.limit) || 100;

  if (!simulator.SYMBOLS.includes(symbol)) {
    return res.status(404).json({ error: `Symbol ${symbol} not found.` });
  }

  const cacheKey = `api:candles:${symbol}:${resolution}:${limit}`;
  
  // Try Cache
  const startTime = Date.now();
  const cachedData = await cache.getCached(cacheKey);
  if (cachedData) {
    const latency = Date.now() - startTime;
    return res.json({ 
      source: 'cache', 
      latency: `${latency}ms`,
      data: cachedData 
    });
  }

  // Live query from db/fallback
  const data = await db.getHistoricalCandles(symbol, resolution, limit);
  const latency = Date.now() - startTime;

  // Cache for 10 seconds (time-series is slightly fluid)
  await cache.setCached(cacheKey, data, 10);
  
  res.json({ 
    source: 'database', 
    latency: `${latency}ms`,
    data 
  });
});

const path = require('path');

// Serve static frontend assets if they exist (Production)
const frontendDistPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDistPath));

// For Single Page Application support (Vite routing client-side fallback)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(frontendDistPath, 'index.html'), (err) => {
    if (err) {
      // Fallback if frontend is not built/available locally during API tests
      res.status(404).send('Frontend not built. Run npm run build in frontend directory.');
    }
  });
});

// Boot server
initializeServers().then(() => {
  server.listen(port, () => {
    console.log(`🚀 Real-Time Stock Analytics Server running on http://localhost:${port}`);
    console.log(`🔌 WebSockets listening at ws://localhost:${port}`);
    console.log(`🔧 Fallbacks active: Database = ${db.isFallback()}, Redis = ${cache.isFallback()}`);
  });
}).catch(err => {
  console.error('Critical Server Initialization Failure:', err);
});
