const { createClient } = require('redis');

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = process.env.REDIS_PORT || 6379;

let redisClient = null;
let useFallback = false;

// Custom In-Memory TTL Cache
const memoryCache = {
  store: {},
  set(key, val, ttlSeconds = 60) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store[key] = {
      val: JSON.stringify(val),
      expiresAt
    };
  },
  get(key) {
    const item = this.store[key];
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      delete this.store[key];
      return null;
    }
    return JSON.parse(item.val);
  },
  del(key) {
    delete this.store[key];
  },
  clear() {
    this.store = {};
  }
};

async function connectCache() {
  console.log(`📡 Attempting connection to Redis at redis://${redisHost}:${redisPort}...`);
  try {
    redisClient = createClient({
      url: `redis://${redisHost}:${redisPort}`
    });

    redisClient.on('error', (err) => {
      // If error occurs after connecting or during connect
      if (!useFallback) {
        console.warn('⚠️  Redis client emitted an error. Falling back to IN-MEMORY cache.');
        console.warn(`Reason: ${err.message}`);
        useFallback = true;
      }
    });

    await redisClient.connect();
    console.log('✅ Connected to Redis cache successfully.');
  } catch (error) {
    console.warn('⚠️  Redis connection failed. Falling back to IN-MEMORY cache.');
    console.warn(`Reason: ${error.message}`);
    useFallback = true;
  }
}

async function getCached(key) {
  if (useFallback) {
    const val = memoryCache.get(key);
    if (val !== null) {
      console.log(`🎯 [Cache HIT - Memory] Key: ${key}`);
      return val;
    }
    console.log(`💨 [Cache MISS - Memory] Key: ${key}`);
    return null;
  }

  try {
    const val = await redisClient.get(key);
    if (val !== null) {
      console.log(`🎯 [Cache HIT - Redis] Key: ${key}`);
      return JSON.parse(val);
    }
    console.log(`💨 [Cache MISS - Redis] Key: ${key}`);
    return null;
  } catch (error) {
    console.error('Error fetching from Redis Cache:', error);
    return null;
  }
}

async function setCached(key, val, ttlSeconds = 60) {
  if (useFallback) {
    memoryCache.set(key, val, ttlSeconds);
    return true;
  }

  try {
    await redisClient.set(key, JSON.stringify(val), {
      EX: ttlSeconds
    });
    return true;
  } catch (error) {
    console.error('Error setting Redis Cache:', error);
    return false;
  }
}

async function invalidateCache(key) {
  if (useFallback) {
    memoryCache.del(key);
    return true;
  }

  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    console.error('Error invalidating Redis Cache:', error);
    return false;
  }
}

function isFallback() {
  return useFallback;
}

module.exports = {
  connectCache,
  getCached,
  setCached,
  invalidateCache,
  isFallback
};
