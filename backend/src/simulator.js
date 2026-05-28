// List of symbols we are tracking
const SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];

// Core configurations
const basePrices = { AAPL: 175.50, MSFT: 420.75, GOOGL: 150.20, AMZN: 180.40, TSLA: 170.80 };
const volatility = { AAPL: 0.0015, MSFT: 0.0012, GOOGL: 0.0018, AMZN: 0.002, TSLA: 0.0035 };

// Active state of all stocks
const stockStates = {};
const listeners = [];

// Initialize all stock states
SYMBOLS.forEach(symbol => {
  const base = basePrices[symbol];
  stockStates[symbol] = {
    symbol,
    price: base,
    open: base * (0.995 + Math.random() * 0.01), // open slightly different from base
    high: base,
    low: base,
    volume: Math.floor(Math.random() * 500000) + 100000,
    change: 0,
    changePercent: 0,
    orderBook: { bids: [], asks: [] },
    recentTrades: []
  };
  
  // Create Initial High/Low based on base
  stockStates[symbol].high = stockStates[symbol].price * (1.002 + Math.random() * 0.01);
  stockStates[symbol].low = stockStates[symbol].price * (0.988 + Math.random() * 0.01);
  
  // Calculate change
  updateStats(symbol);
  generateOrderBook(symbol);
  generateRecentTrades(symbol);
});

// Update standard statistics of a stock
function updateStats(symbol) {
  const stock = stockStates[symbol];
  stock.change = stock.price - stock.open;
  stock.changePercent = (stock.change / stock.open) * 100;
  
  if (stock.price > stock.high) stock.high = stock.price;
  if (stock.price < stock.low) stock.low = stock.price;
}

// Generate a realistic 5-level deep order book
function generateOrderBook(symbol) {
  const stock = stockStates[symbol];
  const spot = stock.price;
  const bids = [];
  const asks = [];
  const spread = spot * 0.0006; // tight spread

  for (let i = 1; i <= 5; i++) {
    // Bids (Buy orders) - descending prices below spot
    const bidPrice = spot - (spread * i) - (Math.random() * (spot * 0.0002));
    const bidSize = Math.floor(Math.random() * 2000) + 100 * (6 - i);
    bids.push({ price: parseFloat(bidPrice.toFixed(2)), size: bidSize });

    // Asks (Sell orders) - ascending prices above spot
    const askPrice = spot + (spread * i) + (Math.random() * (spot * 0.0002));
    const askSize = Math.floor(Math.random() * 2000) + 100 * (6 - i);
    asks.push({ price: parseFloat(askPrice.toFixed(2)), size: askSize });
  }

  // Sort bids descending, asks ascending
  stock.orderBook = {
    bids: bids.sort((a, b) => b.price - a.price),
    asks: asks.sort((a, b) => a.price - b.price)
  };
}

// Generate some seed trades
function generateRecentTrades(symbol) {
  const stock = stockStates[symbol];
  const count = 10;
  for (let i = 0; i < count; i++) {
    const tradePrice = stock.price * (0.999 + Math.random() * 0.002);
    const size = Math.floor(Math.random() * 500) + 10;
    const side = Math.random() > 0.5 ? 'BUY' : 'SELL';
    stock.recentTrades.unshift({
      price: parseFloat(tradePrice.toFixed(2)),
      size,
      side,
      timestamp: new Date(Date.now() - i * 5000).toISOString()
    });
  }
}

// Tick update loop
function startSimulation(onTickCallback) {
  if (onTickCallback) listeners.push(onTickCallback);

  setInterval(() => {
    // Choose a random stock to tick (makes it feel asynchronous and organic)
    const activeSymbols = SYMBOLS.filter(() => Math.random() > 0.3); // update multiple stocks per loop
    
    activeSymbols.forEach(symbol => {
      const stock = stockStates[symbol];
      const vol = volatility[symbol];
      
      // Random walk with slight mean reversion
      const drift = (basePrices[symbol] - stock.price) * 0.01; // pull back towards base
      const changePercent = (Math.random() - 0.495) * vol + drift;
      const priceChange = stock.price * changePercent;
      
      stock.price = parseFloat((stock.price + priceChange).toFixed(2));
      const tradeVolume = Math.floor(Math.random() * 800) + 50;
      stock.volume += tradeVolume;
      
      // Update statistics
      updateStats(symbol);
      
      // Re-generate order book based on new price
      generateOrderBook(symbol);
      
      // Add new trade to trade list
      const tradeSide = Math.random() > 0.48 ? 'BUY' : 'SELL';
      const tradePrice = tradeSide === 'BUY' ? stock.orderBook.asks[0].price : stock.orderBook.bids[0].price;
      const newTrade = {
        price: tradePrice,
        size: tradeVolume,
        side: tradeSide,
        timestamp: new Date().toISOString()
      };
      
      stock.recentTrades.unshift(newTrade);
      if (stock.recentTrades.length > 25) stock.recentTrades.pop(); // keep log short

      // Notify WebSocket and Db handlers
      const tickData = {
        symbol,
        price: stock.price,
        open: parseFloat(stock.open.toFixed(2)),
        high: parseFloat(stock.high.toFixed(2)),
        low: parseFloat(stock.low.toFixed(2)),
        volume: stock.volume,
        change: parseFloat(stock.change.toFixed(2)),
        changePercent: parseFloat(stock.changePercent.toFixed(2)),
        orderBook: stock.orderBook,
        newTrade
      };

      listeners.forEach(callback => callback(tickData));
    });
  }, 1000); // Trigger ticks every second
}

function getStockData(symbol) {
  return stockStates[symbol] || null;
}

function getAllStocksData() {
  return Object.values(stockStates);
}

module.exports = {
  SYMBOLS,
  startSimulation,
  getStockData,
  getAllStocksData
};
