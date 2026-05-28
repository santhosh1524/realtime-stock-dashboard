-- Timeseries data for raw trades/ticks
CREATE TABLE IF NOT EXISTS stock_prices (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    price DECIMAL(12, 4) NOT NULL,
    volume INT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Optimize queries searching for a symbol over a specific time range
CREATE INDEX IF NOT EXISTS idx_stock_prices_symbol_timestamp ON stock_prices (symbol, timestamp DESC);

-- Table for pre-calculated aggregates (OHLC - Open, High, Low, Close) to speed up chart loading
CREATE TABLE IF NOT EXISTS stock_aggregates (
    symbol VARCHAR(10) NOT NULL,
    resolution VARCHAR(5) NOT NULL, -- '1m', '5m', '1h', '1d'
    bucket TIMESTAMPTZ NOT NULL,
    open DECIMAL(12, 4) NOT NULL,
    high DECIMAL(12, 4) NOT NULL,
    low DECIMAL(12, 4) NOT NULL,
    close DECIMAL(12, 4) NOT NULL,
    volume INT NOT NULL,
    PRIMARY KEY (symbol, resolution, bucket)
);

CREATE INDEX IF NOT EXISTS idx_aggregates_bucket ON stock_aggregates (bucket DESC);

-- Seed some initial trades to populate database
INSERT INTO stock_prices (symbol, price, volume, timestamp) VALUES
('AAPL', 175.2500, 500, NOW() - INTERVAL '10 minutes'),
('AAPL', 175.3000, 200, NOW() - INTERVAL '9 minutes'),
('AAPL', 175.4500, 1500, NOW() - INTERVAL '8 minutes'),
('AAPL', 175.4000, 300, NOW() - INTERVAL '7 minutes'),
('AAPL', 175.6000, 800, NOW() - INTERVAL '6 minutes'),
('AAPL', 175.5500, 1200, NOW() - INTERVAL '5 minutes'),
('AAPL', 175.7000, 600, NOW() - INTERVAL '4 minutes'),
('AAPL', 175.6500, 400, NOW() - INTERVAL '3 minutes'),
('AAPL', 175.8000, 1100, NOW() - INTERVAL '2 minutes'),
('AAPL', 175.9500, 900, NOW() - INTERVAL '1 minute');

INSERT INTO stock_prices (symbol, price, volume, timestamp) VALUES
('MSFT', 420.1000, 200, NOW() - INTERVAL '10 minutes'),
('MSFT', 420.2500, 100, NOW() - INTERVAL '9 minutes'),
('MSFT', 420.2000, 400, NOW() - INTERVAL '8 minutes'),
('MSFT', 420.4500, 300, NOW() - INTERVAL '7 minutes'),
('MSFT', 420.3500, 150, NOW() - INTERVAL '6 minutes'),
('MSFT', 420.6000, 700, NOW() - INTERVAL '5 minutes'),
('MSFT', 420.5000, 50, NOW() - INTERVAL '4 minutes'),
('MSFT', 420.7500, 500, NOW() - INTERVAL '3 minutes'),
('MSFT', 420.9000, 800, NOW() - INTERVAL '2 minutes'),
('MSFT', 421.1000, 600, NOW() - INTERVAL '1 minute');

INSERT INTO stock_prices (symbol, price, volume, timestamp) VALUES
('TSLA', 170.1000, 1200, NOW() - INTERVAL '10 minutes'),
('TSLA', 169.8500, 900, NOW() - INTERVAL '9 minutes'),
('TSLA', 169.5000, 2400, NOW() - INTERVAL '8 minutes'),
('TSLA', 169.9000, 1500, NOW() - INTERVAL '7 minutes'),
('TSLA', 170.2500, 1100, NOW() - INTERVAL '6 minutes'),
('TSLA', 170.8000, 3100, NOW() - INTERVAL '5 minutes'),
('TSLA', 170.4000, 800, NOW() - INTERVAL '4 minutes'),
('TSLA', 171.1500, 2000, NOW() - INTERVAL '3 minutes'),
('TSLA', 171.5000, 1800, NOW() - INTERVAL '2 minutes'),
('TSLA', 171.8500, 2500, NOW() - INTERVAL '1 minute');

-- Seed initial aggregates
INSERT INTO stock_aggregates (symbol, resolution, bucket, open, high, low, close, volume) VALUES
('AAPL', '1m', NOW() - INTERVAL '10 minutes', 175.20, 175.30, 175.15, 175.25, 500),
('AAPL', '1m', NOW() - INTERVAL '9 minutes', 175.25, 175.35, 175.20, 175.30, 200),
('AAPL', '1m', NOW() - INTERVAL '8 minutes', 175.30, 175.50, 175.28, 175.45, 1500),
('AAPL', '1m', NOW() - INTERVAL '7 minutes', 175.45, 175.45, 175.35, 175.40, 300),
('AAPL', '1m', NOW() - INTERVAL '6 minutes', 175.40, 175.65, 175.38, 175.60, 800),
('AAPL', '1m', NOW() - INTERVAL '5 minutes', 175.60, 175.65, 175.50, 175.55, 1200),
('AAPL', '1m', NOW() - INTERVAL '4 minutes', 175.55, 175.75, 175.55, 175.70, 600),
('AAPL', '1m', NOW() - INTERVAL '3 minutes', 175.70, 175.70, 175.60, 175.65, 400),
('AAPL', '1m', NOW() - INTERVAL '2 minutes', 175.65, 175.85, 175.65, 175.80, 1100),
('AAPL', '1m', NOW() - INTERVAL '1 minute', 175.80, 176.00, 175.75, 175.95, 900);
