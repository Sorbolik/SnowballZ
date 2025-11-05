# Simple Dockerfile for a Node.js app
FROM node:18-alpine

WORKDIR /usr/src/app

# Install dependencies first to leverage layer caching
COPY package*.json ./
RUN npm ci --only=production

# Copy app source
COPY . .

# Run as non-root
RUN addgroup -S app && adduser -S app -G app
USER app

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Use package.json's start script (fallback to node server.js if needed)
CMD ["sh", "-c", "if [ -f package.json ]; then npm start; else node server.js; fi"]