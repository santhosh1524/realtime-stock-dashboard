import React from 'react';

export default function OrderBook({ orderBook, spotPrice, changePercent }) {
  if (!orderBook || !orderBook.bids || !orderBook.asks) {
    return (
      <div className="premium-card" style={{ height: '320px', justifyContent: 'center', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-muted)' }}>Loading Order Book...</span>
      </div>
    );
  }

  // Calculate maximum sizes to scale depth visualization bars
  const maxBidSize = Math.max(...orderBook.bids.map(b => b.size), 1);
  const maxAskSize = Math.max(...orderBook.asks.map(a => a.size), 1);
  const maxOverallSize = Math.max(maxBidSize, maxAskSize);

  // Compute Spread
  const bestBid = orderBook.bids[0]?.price || 0;
  const bestAsk = orderBook.asks[0]?.price || 0;
  const spreadValue = Math.max(0, bestAsk - bestBid);
  const spreadPercent = bestAsk > 0 ? (spreadValue / bestAsk) * 100 : 0;

  const isUp = changePercent >= 0;

  // Render asks (sells) from highest price down to lowest (best offer)
  const reversedAsks = [...orderBook.asks].reverse();

  return (
    <div className="premium-card" style={{ flexGrow: 1, minHeight: '340px' }}>
      <div className="card-title">
        Order Book (Depth)
        <span className="brand-badge" style={{ fontSize: '9px', background: 'rgba(190, 90, 50, 0.1)', color: 'hsl(190, 90, 50)', borderColor: 'rgba(190, 90, 50, 0.3)' }}>L2 Live</span>
      </div>

      <div className="orderbook-grid">
        {/* Table Headers */}
        <div className="orderbook-header">
          <span>Price ($)</span>
          <span className="text-right">Size (Qty)</span>
          <span className="text-right">Total ($)</span>
        </div>

        {/* ASKS (SELLS) - RED LINES */}
        <div style={{ display: 'flex', flexDirection: 'column-reverse' }}>
          {reversedAsks.map((ask, i) => {
            const depthPct = `${(ask.size / maxOverallSize) * 100}%`;
            return (
              <div 
                key={`ask-${i}`} 
                className="ob-row ask" 
                style={{ '--depth-pct': depthPct }}
              >
                <span style={{ color: 'var(--trend-down)' }}>{ask.price.toFixed(2)}</span>
                <span className="text-right">{ask.size.toLocaleString()}</span>
                <span className="text-right" style={{ color: 'var(--text-muted)' }}>
                  {(ask.price * ask.size).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            );
          })}
        </div>

        {/* MID MARKET SPREAD & SPOT PRICE */}
        <div className="ob-spread-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ 
              fontSize: '15px', 
              fontWeight: '700', 
              color: isUp ? 'var(--trend-up)' : 'var(--trend-down)' 
            }}>
              ${spotPrice.toFixed(2)}
            </span>
            <span style={{ 
              fontSize: '11px', 
              color: isUp ? 'var(--trend-up)' : 'var(--trend-down)' 
            }}>
              {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{changePercent.toFixed(2)}%
            </span>
          </div>
          <div>
            Spread: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>${spreadValue.toFixed(2)} ({spreadPercent.toFixed(2)}%)</span>
          </div>
        </div>

        {/* BIDS (BUYS) - GREEN LINES */}
        <div>
          {orderBook.bids.map((bid, i) => {
            const depthPct = `${(bid.size / maxOverallSize) * 100}%`;
            return (
              <div 
                key={`bid-${i}`} 
                className="ob-row bid" 
                style={{ '--depth-pct': depthPct }}
              >
                <span style={{ color: 'var(--trend-up)' }}>{bid.price.toFixed(2)}</span>
                <span className="text-right">{bid.size.toLocaleString()}</span>
                <span className="text-right" style={{ color: 'var(--text-muted)' }}>
                  {(bid.price * bid.size).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
