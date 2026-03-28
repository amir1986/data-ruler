#!/usr/bin/env bash
# =============================================================================
# Oracle Cloud Always-Free VM — One-time setup
# Run this ONCE on a fresh Ubuntu 22.04 ARM (Ampere A1) instance.
# =============================================================================
set -e

echo "=== DataRuler — Oracle Cloud Setup ==="
echo ""

# --- 1. Install Docker ---
if ! command -v docker &> /dev/null; then
  echo "[1/4] Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  echo "Docker installed. You may need to log out and back in for group changes."
else
  echo "[1/4] Docker already installed."
fi

# --- 2. Open firewall ports (Ubuntu iptables) ---
echo "[2/4] Opening firewall ports 80 and 443..."
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT

# Persist iptables rules
if command -v netfilter-persistent &> /dev/null; then
  sudo netfilter-persistent save
else
  sudo apt-get install -y iptables-persistent
  sudo netfilter-persistent save
fi

# --- 3. Clone and configure ---
echo "[3/4] Setting up project..."
if [ ! -d "data-ruler" ]; then
  echo "Clone the repository first:"
  echo "  git clone <your-repo-url> data-ruler"
  echo "Then re-run this script from the parent directory."
  exit 1
fi

cd data-ruler

if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "IMPORTANT: Edit .env and configure:"
  echo "  nano .env"
  echo ""
  echo "  Required:"
  echo "    OLLAMA_CLOUD_API_KEY=your-key-here"
  echo "    DOMAIN=yourdomain.com (or your-ip.duckdns.org)"
  echo "    NEXTAUTH_SECRET=$(openssl rand -base64 32)"
  echo ""
fi

# --- 4. Print next steps ---
echo "[4/4] Setup complete!"
echo ""
echo "=== Next Steps ==="
echo ""
echo "1. Edit .env:"
echo "   nano data-ruler/.env"
echo ""
echo "2. Set your domain in .env:"
echo "   DOMAIN=yourdomain.com"
echo "   (Free subdomain: https://www.duckdns.org)"
echo ""
echo "3. Point your domain DNS A record to this server's IP"
echo ""
echo "4. Deploy:"
echo "   cd data-ruler"
echo "   ./deploy.sh prod"
echo ""
echo "5. Open https://yourdomain.com and create an account"
echo ""
echo "=== Oracle Cloud Always Free Resources (no expiration, no charge) ==="
echo "  Compute:    Up to 4 ARM OCPUs + 24GB RAM (Ampere A1), or 2x AMD Micro VMs"
echo "  Storage:    200GB Block Volume + 5 backups, 20GB Object, 10GB Archive"
echo "  Network:    2 VCNs, 1 reserved IP, 2 ephemeral IPs, 1 LB (10Mbps), 10TB/mo outbound"
echo "  Database:   2 Autonomous DBs (20GB each)"
echo ""
echo "  IMPORTANT:"
echo "  - Keep A1 at or below 4 OCPUs + 24GB RAM total (or instances may be deleted after trial)"
echo "  - Idle instances (< 20% CPU for 7 days) may be reclaimed by Oracle"
echo "  - All Always Free resources must be in your home region"
echo ""
