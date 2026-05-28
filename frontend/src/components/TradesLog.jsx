import React from 'react';

export default function TradesLog({ trades }) {
  if (!trades || trades.length === 0) {
    return (
      <div className="premium-card" style={{ height: '220px', justifyContent: 'center', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-muted)' }}>No Trade Records</span>
      </div>
    );
  }

  return (
    <div className="premium-card" style={{ flexGrow: 1, minHeight: '220px', maxHeight: '350px' }}>
      <div className="card-title">
        Real-Time Market Trades
        <span className="brand-badge" style={{ fontSize: '9px', background: 'rgba(245, 75, 65, 0.1)', color: 'hsl(245, 80%, 75%)', borderColor: 'rgba(245, 75, 65, 0.3)' }}>Stream</span>
      </div>

      <div className="trades-log-container">
        <div className="trades-list">
          {trades.map((trade, i) => {
            const isBuy = trade.side === 'BUY';
            const time = new Date(trade.timestamp).toLocaleTimeString(undefined, {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });

            return (
              <div key={`trade-${i}`} className="trade-row">
                <span style={{ color: 'var(--text-muted)' }}>{time}</span>
                <span style={{ 
                  fontWeight: '600', 
                  color: isBuy ? 'var(--trend-up)' : 'var(--trend-down)' 
                }}>
                  ${trade.price?.toFixed(2) ?? '0.00'}
                </span>
                <span className="text-right" style={{ color: 'var(--text-main)' }}>
                  {trade.size.toLocaleString()} Units
                </span>
                <span className="text-right" style={{ 
                  fontWeight: '700',
                  color: isBuy ? 'var(--trend-up)' : 'var(--trend-down)',
                  fontSize: '10px'
                }}>
                  {trade.side}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
