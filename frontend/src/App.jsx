import React, { useState, useEffect, useRef } from 'react';
import Watchlist from './components/Watchlist';
import CandlestickChart from './components/CandlestickChart';
import OrderBook from './components/OrderBook';
import TradesLog from './components/TradesLog';
import { ShieldAlert, RefreshCw, Activity, Layers } from 'lucide-react';

export default function App() {
  const [stocks, setStocks] = useState([]);
  const [activeSymbol, setActiveSymbol] = useState('AAPL');
  const [activeStockDetail, setActiveStockDetail] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [healthStatus, setHealthStatus] = useState({ postgresFallback: false, redisFallback: false });
  const [latencyText, setLatencyText] = useState('0ms');

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Fetch initial REST data for historical candles
  const fetchHistoricalData = async (symbol) => {
    try {
      const response = await fetch(`/api/stocks/${symbol}/candles?resolution=1m&limit=60`);
      const resData = await response.json();
      if (resData && resData.data) {
        setHistoricalData(resData.data);
        setLatencyText(resData.latency || 'N/A');
      }
    } catch (error) {
      console.error(`Error loading candles for ${symbol}:`, error.message);
      
      // Local fallback simulator if API is totally unreachable
      generateMockCandles(symbol);
    }
  };

  const generateMockCandles = (symbol) => {
    const data = [];
    const now = Date.now();
    let price = 175;
    for (let i = 60; i >= 0; i--) {
      const change = (Math.random() - 0.5) * 2;
      const open = price;
      const close = price + change;
      data.push({
        symbol,
        resolution: '1m',
        bucket: new Date(now - i * 60 * 1000).toISOString(),
        open,
        high: Math.max(open, close) + Math.random(),
        low: Math.min(open, close) - Math.random(),
        close,
        volume: Math.floor(Math.random() * 2000) + 100
      });
      price = close;
    }
    setHistoricalData(data);
  };

  // Fetch API Health Status
  const checkHealthStatus = async () => {
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      if (data && data.features) {
        setHealthStatus(data.features);
      }
    } catch (e) {
      // Fallback local modes active if backend unreachable
      setHealthStatus({ postgresFallback: true, redisFallback: true });
    }
  };

  // Establish WebSocket Connection with auto-reconnect
  const connectWebSocket = () => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // If we're on port 3000 (Vite), connect to backend port 5000. Otherwise use standard host
    const wsHost = window.location.port === '3000' ? `${window.location.hostname}:5000` : window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}`;

    console.log(`🔌 Establishing WebSocket connection to ${wsUrl}...`);
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ WebSocket connection established.');
      setIsConnected(true);
      
      // Subscribe to active symbol
      ws.send(JSON.stringify({ action: 'SUBSCRIBE', symbol: activeSymbol }));
      checkHealthStatus();
    };

    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);

      switch (payload.type) {
        case 'INIT':
          setStocks(payload.data);
          // Set initial detailed selection
          const active = payload.data.find(s => s.symbol === activeSymbol);
          if (active) setActiveStockDetail(active);
          break;

        case 'TICK':
          setStocks((prevStocks) => {
            return prevStocks.map((stock) => {
              if (stock.symbol === payload.symbol) {
                return {
                  ...stock,
                  price: payload.price,
                  change: payload.change,
                  changePercent: payload.changePercent,
                  volume: payload.volume
                };
              }
              return stock;
            });
          });
          break;

        case 'SUBSCRIBED':
          if (payload.symbol === activeSymbol) {
            setActiveStockDetail(payload.data);
          }
          break;

        case 'DETAIL_UPDATE':
          if (payload.data.symbol === activeSymbol) {
            setActiveStockDetail(payload.data);
            
            // Append real-time price updates incrementally to the candlestick list
            setHistoricalData((prevCandles) => {
              if (prevCandles.length === 0) return prevCandles;
              
              const lastCandle = { ...prevCandles[prevCandles.length - 1] };
              const tickTime = new Date(payload.data.newTrade.timestamp);
              tickTime.setSeconds(0, 0);
              const tickBucket = tickTime.toISOString();

              if (lastCandle.bucket === tickBucket) {
                // Update active minute candle
                lastCandle.high = Math.max(lastCandle.high, payload.data.price);
                lastCandle.low = Math.min(lastCandle.low, payload.data.price);
                lastCandle.close = payload.data.price;
                lastCandle.volume += payload.data.newTrade.size;
                return [...prevCandles.slice(0, -1), lastCandle];
              } else {
                // Push a new minute candle
                const newCandle = {
                  symbol: activeSymbol,
                  resolution: '1m',
                  bucket: tickBucket,
                  open: lastCandle.close,
                  high: Math.max(lastCandle.close, payload.data.price),
                  low: Math.min(lastCandle.close, payload.data.price),
                  close: payload.data.price,
                  volume: payload.data.newTrade.size
                };
                return [...prevCandles.slice(1), newCandle];
              }
            });
          }
          break;

        default:
          break;
      }
    };

    ws.onclose = () => {
      console.warn('⚠️ WebSocket disconnected. Reconnecting in 3s...');
      setIsConnected(false);
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket Error:', error.message);
      ws.close();
    };
  };

  // Run on Mount and on Symbol Changes
  useEffect(() => {
    fetchHistoricalData(activeSymbol);
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'SUBSCRIBE', symbol: activeSymbol }));
    }
  }, [activeSymbol]);

  useEffect(() => {
    connectWebSocket();
    checkHealthStatus();

    // Poll health status
    const healthInterval = setInterval(checkHealthStatus, 15000);

    return () => {
      clearInterval(healthInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent loop
        wsRef.current.close();
      }
    };
  }, []);

  const handleSelectSymbol = (symbol) => {
    setActiveSymbol(symbol);
  };

  const isUp = activeStockDetail?.change >= 0;

  return (
    <div className="dashboard-container">
      {/* GLOWING HEADER */}
      <header className="dashboard-header">
        <div className="brand-section">
          <Layers style={{ color: 'var(--accent-secondary)' }} size={24} />
          <h1 className="brand-logo">APEXTRADE</h1>
          <span className="brand-badge">Engine v1.0</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Automatic Fallback Warn Badges */}
          {(healthStatus.postgresFallback || healthStatus.redisFallback) && (
            <div className="fallback-warning-badge">
              <ShieldAlert size={14} />
              <span>
                {healthStatus.postgresFallback && healthStatus.redisFallback
                  ? 'Memory Engine Active (No DB/Redis)'
                  : healthStatus.postgresFallback
                  ? 'SQLite Fallback (No PG)'
                  : 'Memory Cache (No Redis)'}
              </span>
            </div>
          )}

          <div className="connection-status">
            <span className={`status-dot ${isConnected ? 'online' : 'offline'}`}></span>
            <span>{isConnected ? 'LIVE ENGINE' : 'OFFLINE (RECONNECTING)'}</span>
          </div>
        </div>
      </header>

      {/* DASHBOARD BODY LAYOUT */}
      <main className="dashboard-grid">
        
        {/* WATCHLIST COLUMN (LEFT) */}
        <section className="left-sidebar">
          <Watchlist 
            stocks={stocks} 
            activeSymbol={activeSymbol} 
            onSelect={handleSelectSymbol} 
          />
        </section>

        {/* PRICE CHARTING AREA (CENTER) */}
        <section className="main-chart-area">
          <div className="premium-card">
            {activeStockDetail ? (
              <div className="ticker-hero">
                <div className="ticker-identity">
                  <h1>{activeStockDetail.symbol}</h1>
                  <span>
                    {activeStockDetail.symbol === 'AAPL' && 'Apple Inc. - Common Stock'}
                    {activeStockDetail.symbol === 'MSFT' && 'Microsoft Corporation - Common Stock'}
                    {activeStockDetail.symbol === 'GOOGL' && 'Alphabet Inc. - Class A'}
                    {activeStockDetail.symbol === 'AMZN' && 'Amazon.com, Inc. - Common Stock'}
                    {activeStockDetail.symbol === 'TSLA' && 'Tesla, Inc. - Common Stock'}
                  </span>
                </div>
                
                <div className="ticker-values">
                  <div className={`ticker-price ${isUp ? 'change-up' : 'change-down'}`}>
                    ${activeStockDetail.price.toFixed(2)}
                  </div>
                  <div className={`ticker-change ${isUp ? 'change-up' : 'change-down'}`}>
                    <span>{isUp ? '▲' : '▼'}</span>
                    <span>{isUp ? '+' : ''}{activeStockDetail.change.toFixed(2)} ({activeStockDetail.changePercent.toFixed(2)}%)</span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ height: '54px', display: 'flex', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Synchronizing ticker...</span>
              </div>
            )}

            {/* Quick Stats Grid */}
            {activeStockDetail && (
              <div className="ticker-stats-grid">
                <div className="stat-item">
                  <span className="stat-label">Open</span>
                  <span className="stat-value">${activeStockDetail.open.toFixed(2)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">High</span>
                  <span className="stat-value" style={{ color: 'var(--trend-up)' }}>${activeStockDetail.high.toFixed(2)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Low</span>
                  <span className="stat-value" style={{ color: 'var(--trend-down)' }}>${activeStockDetail.low.toFixed(2)}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Volume</span>
                  <span className="stat-value">{activeStockDetail.volume.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>

          {/* D3 Candlestick Box */}
          <div className="premium-card" style={{ flexGrow: 1, minHeight: '380px', display: 'flex', flexDirection: 'column' }}>
            <div className="card-title">
              Interactive Financial Chart (OHLC + Volume)
              <span className="brand-badge" style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(245, 75, 65, 0.05)', color: 'var(--text-muted)', borderColor: 'var(--border-color)', textTransform: 'none' }}>
                <RefreshCw size={10} style={{ animation: 'spin 12s linear infinite' }} />
                DB Query Latency: <strong style={{ color: 'var(--accent-secondary)' }}>{latencyText}</strong>
              </span>
            </div>
            
            <CandlestickChart 
              historicalData={historicalData} 
              activeSymbol={activeSymbol} 
            />
          </div>
        </section>

        {/* ORDER BOOK & TRANS LOGS (RIGHT) */}
        <section className="right-sidebar">
          {activeStockDetail && (
            <OrderBook 
              orderBook={activeStockDetail.orderBook} 
              spotPrice={activeStockDetail.price} 
              changePercent={activeStockDetail.changePercent}
            />
          )}

          {activeStockDetail && (
            <TradesLog 
              trades={activeStockDetail.recentTrades} 
            />
          )}
        </section>

      </main>
    </div>
  );
}
