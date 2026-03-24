#!/bin/bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_banner() {
    echo -e "${BLUE}"
    echo "  _____ _               _____              _ "
    echo " / ____| |        /\\   |  __ \\            | |"
    echo "| |    | |       /  \\  | |__) | __ _  ___| |"
    echo "| |    | |      / /\\ \\ |  ___/ / _\` |/ __| |"
    echo "| |____| |____ / ____ \\| |    | (_| | (__| |"
    echo " \\_____|______/_/    \\_\\_|     \\__,_|\\___|_|"
    echo -e "${NC}"
    echo -e "${GREEN}ClawPanel Installer for OpenClaw${NC}"
    echo ""
}

check_requirements() {
    echo -e "${BLUE}Checking requirements...${NC}"
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Docker is not installed. Please install Docker first.${NC}"
        echo "Visit: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    if ! docker compose version &> /dev/null && ! docker-compose --version &> /dev/null; then
        echo -e "${RED}Docker Compose is not installed. Please install Docker Compose first.${NC}"
        exit 1
    fi
    
    # Check SSH server
    if ! systemctl is-active --quiet sshd 2>/dev/null && ! systemctl is-active --quiet ssh 2>/dev/null; then
        echo -e "${YELLOW}WARNING: SSH server is not running. Terminal feature will not work.${NC}"
        echo -e "${YELLOW}Install SSH: sudo apt-get install -y openssh-server && sudo systemctl enable --now ssh${NC}"
    fi
    
    echo -e "${GREEN}Requirements satisfied!${NC}"
    echo ""
}

get_gateway_password() {
    # Try to get password from OpenClaw config
    if [ -f "$HOME/.openclaw/gateway-password.txt" ]; then
        GATEWAY_PASSWORD=$(cat "$HOME/.openclaw/gateway-password.txt")
        echo -e "${GREEN}Found Gateway password in ~/.openclaw/gateway-password.txt${NC}"
    elif [ -f "$HOME/.openclaw/openclaw.json" ]; then
        # Try to extract from JSON (requires jq or python)
        if command -v jq &> /dev/null; then
            GATEWAY_PASSWORD=$(jq -r '.gateway.auth.password // empty' "$HOME/.openclaw/openclaw.json" 2>/dev/null)
        elif command -v python3 &> /dev/null; then
            GATEWAY_PASSWORD=$(python3 -c "import json,sys; d=json.load(open('$HOME/.openclaw/openclaw.json')); print(d.get('gateway',{}).get('auth',{}).get('password',''))" 2>/dev/null)
        fi
        
        if [ -n "$GATEWAY_PASSWORD" ]; then
            echo -e "${GREEN}Extracted Gateway password from openclaw.json${NC}"
        fi
    fi
    
    # If no password found, generate one
    if [ -z "$GATEWAY_PASSWORD" ]; then
        GATEWAY_PASSWORD=$(openssl rand -base64 32)
        echo -e "${YELLOW}Generated new Gateway password${NC}"
        echo -e "${YELLOW}Warning: Make sure to update ~/.openclaw/openclaw.json with this password!${NC}"
    fi
}

setup_ssh_keys() {
    echo -e "${BLUE}Setting up SSH keys for Terminal...${NC}"
    
    # Generate SSH keys for container access
    if [ ! -f "ssh-keys/clawpanel" ]; then
        echo -e "${YELLOW}Generating SSH keys...${NC}"
        mkdir -p ssh-keys
        ssh-keygen -t ed25519 -f ssh-keys/clawpanel -N "" -C "clawpanel-terminal" 2>/dev/null
        
        # Add public key to authorized_keys
        mkdir -p ~/.ssh
        chmod 700 ~/.ssh
        cat ssh-keys/clawpanel.pub >> ~/.ssh/authorized_keys
        chmod 600 ~/.ssh/authorized_keys
        
        echo -e "${GREEN}SSH keys generated and added to authorized_keys${NC}"
    else
        echo -e "${YELLOW}SSH keys already exist, skipping generation${NC}"
    fi
    
    # Copy keys to backend directory for Docker build
    rm -rf backend/ssh-keys
    cp -r ssh-keys backend/
    
    echo -e "${GREEN}SSH keys ready for Docker build${NC}"
    echo ""
}

copy_files() {
    echo -e "${BLUE}Setting up ClawPanel...${NC}"
    
    # Get Gateway password
    get_gateway_password
    
    # Setup SSH keys
    setup_ssh_keys
    
    if [ ! -f ".env" ]; then
        echo -e "${YELLOW}Creating .env file...${NC}"
        JWT_SECRET=$(openssl rand -hex 32)
        cat > .env << EOF
# JWT Secret (change this!)
JWT_SECRET=$JWT_SECRET

# Node Environment
NODE_ENV=production

# OpenClaw Gateway URL (Docker container connects to host)
# For Linux: ws://172.17.0.1:18789
# For macOS/Windows: ws://host.docker.internal:18789
GATEWAY_URL=ws://host.docker.internal:18789

# OpenClaw Gateway Password (REQUIRED for WebSocket authentication)
# This must match the password in ~/.openclaw/openclaw.json
# gateway.auth.password field
GATEWAY_PASSWORD=$GATEWAY_PASSWORD

# SSH Terminal Configuration
SSH_HOST=host.docker.internal
SSH_USER=root
SSH_PORT=22
SSH_KEY_PATH=/root/.ssh/id_ed25519

# Database
SQLITE_PATH=/data/clawpanel.db

# Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100
EOF
        echo -e "${GREEN}.env file created${NC}"
        echo -e "${YELLOW}Gateway password: $GATEWAY_PASSWORD${NC}"
    else
        echo -e "${YELLOW}.env file already exists, skipping...${NC}"
        echo -e "${YELLOW}Make sure GATEWAY_PASSWORD is set correctly!${NC}"
    fi
    
    echo ""
}

build_images() {
    echo -e "${BLUE}Building Docker images...${NC}"
    
    export COMPOSE_PROJECT_NAME=clawpanel
    
    if docker compose version &> /dev/null; then
        docker compose build
    else
        docker-compose build
    fi
    
    echo -e "${GREEN}Images built successfully!${NC}"
    echo ""
}

start_services() {
    echo -e "${BLUE}Starting services...${NC}"
    
    if docker compose version &> /dev/null; then
        docker compose up -d
    else
        docker-compose up -d
    fi
    
    echo -e "${GREEN}Services started!${NC}"
    echo ""
}

initialize_database() {
    echo -e "${BLUE}Initializing database...${NC}"
    
    sleep 3
    
    if docker compose version &> /dev/null; then
        docker compose exec -T backend npx tsx src/database/migrate.ts
    else
        docker-compose exec -T backend npx tsx src/database/migrate.ts
    fi
    
    echo -e "${GREEN}Database initialized!${NC}"
    echo ""
}

fix_admin_password() {
    echo -e "${BLUE}Setting up admin password...${NC}"
    
    sleep 2
    
    if docker compose version &> /dev/null; then
        docker compose exec -T backend node /app/fix-admin.js
    else
        docker-compose exec -T backend node /app/fix-admin.js
    fi
    
    echo -e "${GREEN}Admin password set!${NC}"
    echo ""
}

test_terminal() {
    echo -e "${BLUE}Testing SSH Terminal connection...${NC}"
    
    sleep 2
    
    # Test SSH from container
    if docker compose exec -T backend ssh -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null -i /root/.ssh/id_ed25519 \
        root@host.docker.internal "echo 'SSH OK'" 2>/dev/null | grep -q "SSH OK"; then
        echo -e "${GREEN}SSH Terminal connection successful!${NC}"
    else
        echo -e "${YELLOW}WARNING: SSH Terminal test failed.${NC}"
        echo -e "${YELLOW}Make sure SSH server is running on the host.${NC}"
        echo -e "${YELLOW}You may need to run: sudo apt-get install -y openssh-server${NC}"
    fi
    
    echo ""
}

print_completion() {
    echo -e "${GREEN}================================${NC}"
    echo -e "${GREEN}ClawPanel installed successfully!${NC}"
    echo -e "${GREEN}================================${NC}"
    echo ""
    
    IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}' || echo "your-server-ip")
    echo -e "Access the panel at: ${BLUE}http://$IP${NC}"
    echo ""
    echo -e "Default credentials:"
    echo -e "  Username: ${YELLOW}admin${NC}"
    echo -e "  Password: ${YELLOW}admin${NC}"
    echo ""
    echo -e "${YELLOW}Important:${NC}"
    echo "1. Change the default password immediately after login"
    echo "2. Add your API keys to ~/.openclaw/openclaw.json"
    echo "3. Ensure OpenClaw Gateway is running on the host"
    echo ""
    echo -e "Features:"
    echo -e "  ✅ Dashboard with Gateway status"
    echo -e "  ✅ Agent management"
    echo -e "  ✅ WebChat with real-time WebSocket"
    echo -e "  ✅ SSH Terminal (access OpenClaw CLI)"
    echo -e "  ✅ Chain Builder"
    echo -e "  ✅ Channel management"
    echo ""
    echo -e "Gateway WebSocket Status:"
    echo -e "  Check with: ${BLUE}docker compose logs backend | grep -i gateway${NC}"
    echo -e "  Should show: ${GREEN}'Gateway authentication successful'${NC}"
    echo ""
    echo -e "Useful commands:"
    echo -e "  ${BLUE}docker compose logs -f${NC} - View logs"
    echo -e "  ${BLUE}docker compose logs -f backend${NC} - View backend logs (Gateway WebSocket)"
    echo -e "  ${BLUE}docker compose restart${NC} - Restart services"
    echo -e "  ${BLUE}docker compose down${NC} - Stop services"
    echo -e "  ${BLUE}docker compose exec backend node /app/fix-admin.js${NC} - Reset admin password"
    echo ""
    echo -e "${YELLOW}Troubleshooting:${NC}"
    echo "If Gateway shows 'disconnected', check:"
    echo "  1. Gateway is running: sudo systemctl status openclaw-gateway"
    echo "  2. GATEWAY_PASSWORD in .env matches openclaw.json"
    echo "  3. Network access: docker compose exec backend wget -qO- http://host.docker.internal:18789"
    echo ""
    echo "If Terminal doesn't connect, check:"
    echo "  1. SSH server: sudo systemctl status ssh"
    echo "  2. SSH test: docker compose exec backend ssh root@host.docker.internal echo OK"
    echo ""
}

# Main
print_banner
check_requirements
copy_files
build_images
start_services
initialize_database
fix_admin_password
test_terminal
print_completion
