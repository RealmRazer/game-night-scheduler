FROM node:20-bookworm-slim

WORKDIR /app

# Build tools needed for better-sqlite3's native bindings
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY server ./server
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

VOLUME ["/app/data"]
EXPOSE 3000

CMD ["node", "server/index.js"]
