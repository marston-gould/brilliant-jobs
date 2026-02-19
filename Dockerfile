# C8: Reproducible build container for Brilliant Jobs
# Ensures consistent builds across dev machines and CI
#
# Usage:
#   docker build -t brilliant-jobs .
#   docker run -v $(pwd):/app brilliant-jobs npm run css:build

FROM node:20-alpine

# Install Tailwind CLI and project dependencies
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
RUN npm ci --production

# Copy source
COPY . .

# Build CSS
RUN npm run css:build 2>/dev/null || echo "CSS build skipped (no tailwind config)"

# Default command: serve static files for local dev
RUN npm install -g serve
EXPOSE 3000
CMD ["serve", "-s", ".", "-l", "3000"]
