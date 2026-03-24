FROM node:20-alpine

WORKDIR /app

# Install build dependencies for native modules (node-pty, better-sqlite3)
# Add openssh-client for terminal SSH access to host
RUN apk add --no-cache python3 make g++ openssh-client

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy SSH keys for host access (generated during setup)
COPY ssh-keys/clawpanel /root/.ssh/id_ed25519
COPY ssh-keys/clawpanel.pub /root/.ssh/id_ed25519.pub
RUN chmod 600 /root/.ssh/id_ed25519 && \
    chmod 644 /root/.ssh/id_ed25519.pub

# Copy source code
COPY . .

# Create data directory
RUN mkdir -p /data

# Expose port
EXPOSE 3000

# Start application with tsx (TypeScript execution)
CMD ["npx", "tsx", "src/index.ts"]
