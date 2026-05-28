import React, { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function Watchlist({ stocks, activeSymbol, onSelect }) {
  const [prevPrices, setPrevPrices] = useState({});
  const [flashStates, setFlashStates] = useState({});

  useEffect(() => {
    // Determine flash directions (price went up or down)
    const newFlashStates = { ...flashStates };
    let hasChanges = false;

    stocks.forEach(stock => {
      const prev = prevPrices[stock.symbol];
      if (prev !== undefined && prev !== stock.price) {
        newFlashStates[stock.symbol] = stock.price > prev ? 'flash-up' : 'flash-down';
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setFlashStates(newFlashStates);
      
      // Store current prices
      const prices = {};
      stocks.forEach(s => { prices[s.symbol] = s.price; });
      setPrevPrices(prices);

      // Clear flashes after animation completes (800ms)
      const timer = setTimeout(() => {
        const cleared = {};
        stocks.forEach(s => { cleared[s.symbol] = ''; });
        setFlashStates(cleared);
      }, 800);

      return () => clearTimeout(timer);
    } else {
      // Just seed initial prices if empty
      if (Object.keys(prevPrices).length === 0) {
        const prices = {};
        stocks.forEach(s => { prices[s.symbol] = s.price; });
        setPrevPrices(prices);
      }
    }
  }, [stocks]);

  return (
    <div className="premium-card" style={{ flexGrow: 1, overflow: 'hidden' }}>
      <div className="card-title">
        Market Watchlist
        <span className="brand-badge" style={{ fontSize: '9px' }}>Live Feed</span>
      </div>
      
      <div className="watchlist-items">
        {stocks.map(stock => {
          const isSelected = stock.symbol === activeSymbol;
          const isUp = stock.change >= 0;
          const flash = flashStates[stock.symbol] || '';

          return (
            <div 
              key={stock.symbol}
              className={`watchlist-row ${isSelected ? 'selected' : ''} ${flash}`}
              onClick={() => onSelect(stock.symbol)}
            >
              <div className="watchlist-sym">
                <h3>{stock.symbol}</h3>
                <span>
                  {stock.symbol === 'AAPL' && 'Apple Inc.'}
                  {stock.symbol === 'MSFT' && 'Microsoft Corp.'}
                  {stock.symbol === 'GOOGL' && 'Alphabet Inc.'}
                  {stock.symbol === 'AMZN' && 'Amazon Inc.'}
                  {stock.symbol === 'TSLA' && 'Tesla Inc.'}
                </span>
              </div>
              
              <div className="watchlist-data">
                <div className="watchlist-price">${stock.price?.toFixed(2) ?? '0.00'}</div>
                <div className={`watchlist-percent ${isUp ? 'change-up' : 'change-down'}`} style={{ display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'flex-end' }}>
                  {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {isUp ? '+' : ''}{stock.changePercent?.toFixed(2) ?? '0.00'}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
