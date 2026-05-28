# Use standard Debian-based Node image
FROM node:18-bullseye

# Install PostgreSQL and Redis
RUN apt-get update && apt-get install -y \
    postgresql \
    postgresql-client \
    redis-server \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Set up write permissions for PostgreSQL user-space data directories
RUN mkdir -p /app/pg_data && chmod -R 777 /app/pg_data

# 1. Build React Frontend
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# 2. Build Node.js Backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production
COPY backend/ ./backend/

# 3. Setup Startup script
COPY start.sh ./
RUN chmod +x start.sh

# Expose port (Hugging Face default is 7860)
EXPOSE 7860

# Run services
CMD ["./start.sh"]
