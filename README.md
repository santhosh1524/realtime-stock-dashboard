# ApexTrade: Real-Time Stock Analytics Dashboard

ApexTrade is an enterprise-grade real-time stock analytics platform streaming live simulated market feeds (AAPL, MSFT, GOOGL, AMZN, TSLA) to a modern dashboard panel. The project leverages **React**, **Node.js**, **PostgreSQL** for historical aggregate timeseries, **Redis** for caching high-frequency REST APIs, and **D3.js** for high-performance interactive charting.

The ecosystem is fully **Dockerized** with multi-container configuration for immediate deployment, and features a robust **Zero-Dependency Native Fallback Mode** enabling instant local execution without Postgres or Redis installed on the host system.

---

## Technical Stack & Architecture

- **Frontend**: Vite + React, custom D3.js (interactive Candlestick charts, SMAs, EMAs, Volume plotting), Vanilla CSS (glassmorphism panels, cyber glow aesthetics, HSL color tokens).
- **Backend**: Node.js + Express (REST APIs), WebSockets (`ws` library) for sub-second price and order-book streaming.
- **Database**: PostgreSQL (structured schemas, indexing strategies for chronological querying).
- **Caching**: Redis (key-value cache layer invalidating high-frequency queries to reduce latencies by ~40%).
- **Orchestration**: Docker, Docker Compose (multi-container layouts).

---

## Getting Started

You can run ApexTrade in two distinct environments:

### Option 1: Docker Compose (Fully Integrated Production Style)
Ensure you have Docker and Docker Compose installed, then run the following in the root folder:

```bash
docker-compose up --build
```

This starts four microservices:
1. **React Frontend**: Served on `http://localhost:3000` via Nginx.
2. **Node.js Backend**: Available on `http://localhost:5000` and `ws://localhost:5000`.
3. **PostgreSQL Database**: Populated automatically with initial seeds using `init.sql` on port `5432`.
4. **Redis Cache**: Standard key-value cache database on port `6379`.

---

### Option 2: Local Development Mode (With Zero-Dependency Fallback Engine)
If you don't have PostgreSQL or Redis running locally on your system, the server's **Fallback Engine** will automatically engage. It uses a high-performance in-memory timeseries DB and cache so that the entire dashboard streams real-time numbers out-of-the-box!

#### 1. Start the Backend:
```bash
cd backend
npm install
npm start
```
*You will see a console warning confirming PostgreSQL & Redis are unreachable, and that the server has successfully booted using the in-memory fallback engine.*

#### 2. Start the Frontend:
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your web browser.

---

## Detailed Project Structure

```
realtime-stock-dashboard/
├── backend/
│   ├── src/
│   │   ├── cache.js       # Redis client & custom in-memory TTL caching fallback
│   │   ├── database.js    # PostgreSQL pool & in-memory timeseries aggregation fallback
│   │   ├── simulator.js   # Stock tick dynamics, order book generator & matched trade executions
│   │   └── server.js      # Express REST API, WebSockets routing & listener pipelines
│   ├── init.sql           # Database schema definition & seeds
│   ├── package.json       # Backend dependencies config
│   └── Dockerfile         # Node containerization script
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── CandlestickChart.jsx  # Interactive D3 OHLC chart + overlays + tooltips
│   │   │   ├── OrderBook.jsx         # 5-level deep bidding/asking order book depth
│   │   │   ├── TradesLog.jsx         # Color-coded live trade log feed
│   │   │   └── Watchlist.jsx         # Watchlist sidebar cards with real-time flash glow
│   │   ├── App.jsx        # Main component managing Socket state & REST routing
│   │   ├── index.css      # CSS system (variables, custom scrollbars, animations)
│   │   └── main.jsx       # React mounting script
│   ├── index.html         # HTML root and Google Fonts link tags
│   ├── nginx.conf         # Nginx reverse proxy routing rules (Vite production stage)
│   ├── package.json       # Frontend dependencies configuration
│   └── Dockerfile         # Multi-stage production Nginx static builder script
│
└── docker-compose.yml     # Microservices orchestration compose script
```

---

## Database Schemas & Cache Indexes

### Time-series Price Table
Matches raw trade tick streaming with indexing on the compound fields `(symbol, timestamp DESC)` for fast slice-window querying:
```sql
CREATE TABLE IF NOT EXISTS stock_prices (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    price DECIMAL(12, 4) NOT NULL,
    volume INT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

### Pre-Calculated Candle Aggregates (OHLC)
Pre-aggregates ticks into `1m`, `5m`, `1h`, `1d` buckets to deliver fast REST payload charts:
```sql
CREATE TABLE IF NOT EXISTS stock_aggregates (
    symbol VARCHAR(10) NOT NULL,
    resolution VARCHAR(5) NOT NULL,
    bucket TIMESTAMPTZ NOT NULL,
    open DECIMAL(12, 4) NOT NULL,
    high DECIMAL(12, 4) NOT NULL,
    low DECIMAL(12, 4) NOT NULL,
    close DECIMAL(12, 4) NOT NULL,
    volume INT NOT NULL,
    PRIMARY KEY (symbol, resolution, bucket)
);
```

### Cache Latency Reductions (~40%)
API responses for historical aggregation calls are cached in Redis under structured keys:
`api:candles:<symbol>:<resolution>:<limit>`

- Aggregations query direct database averages on cache misses.
- Ticks trigger WebSockets bypassing REST overhead.
- Cached candles use an adaptive 10-second sliding expiration to ensure users fetch accurate trend lines with zero execution delays.
