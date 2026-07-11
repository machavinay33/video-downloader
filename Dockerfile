FROM node:22-slim

# Install Python, pip, and yt-dlp
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    && pip3 install --break-system-packages --no-cache-dir yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy all source files (including patches for pnpm)
COPY . .

# Install dependencies using corepack-pinned pnpm
RUN npm install -g corepack@latest && corepack pnpm install

# Build the application (Vite frontend + esbuild server)
RUN corepack pnpm run build

# Set production environment
ENV NODE_ENV=production

# Run the server
CMD ["node", "dist/index.js"]
