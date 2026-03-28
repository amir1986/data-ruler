#!/usr/bin/env bash
set -euo pipefail

echo "=== DataRuler — Oracle Cloud VM Setup ==="
echo ""

# Detect OS
if [ -f /etc/oracle-release ] || grep -q 'Oracle' /etc/os-release 2>/dev/null; then
  OS="oracle"
elif grep -q 'Ubuntu' /etc/os-release 2>/dev/null; then
  OS="ubuntu"
else
  echo "Unsupported OS. This script supports Oracle Linux and Ubuntu."
  exit 1
fi
echo "Detected OS: $OS"

# Install Docker
if command -v docker &>/dev/null; then
  echo "Docker is already installed: $(docker --version)"
else
  echo "Installing Docker..."
  if [ "$OS" = "oracle" ]; then
    sudo dnf install -y dnf-utils
    sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    sudo systemctl enable --now docker
  else
    curl -fsSL https://get.docker.com | sh
  fi
  sudo usermod -aG docker "$USER"
  echo "Docker installed. You may need to log out and back in for group changes to take effect."
fi

# Open firewall ports (80, 443)
echo ""
echo "Opening firewall ports 80 and 443..."
if [ "$OS" = "oracle" ]; then
  sudo firewall-cmd --permanent --add-port=80/tcp
  sudo firewall-cmd --permanent --add-port=443/tcp
  sudo firewall-cmd --reload
  echo "Firewall updated (firewalld)."
else
  sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
  sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
  if command -v netfilter-persistent &>/dev/null; then
    sudo netfilter-persistent save
  else
    sudo apt-get install -y iptables-persistent
    sudo netfilter-persistent save
  fi
  echo "Firewall updated (iptables)."
fi

echo ""
echo "IMPORTANT: Also open ports 80 and 443 in the Oracle Cloud Console:"
echo "  Networking → Virtual Cloud Networks → your VCN → Security Lists → Default"
echo "  Add Ingress Rules for TCP ports 80 and 443 from 0.0.0.0/0"

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
echo "=== Next Steps ==="
echo "  1. cd data-ruler"
echo "  2. cp .env.example .env && nano .env"
echo "  3. Set DOMAIN=yourdomain.com and OLLAMA_CLOUD_API_KEY in .env"
echo "  4. ./deploy.sh"
echo ""
echo "=== Setup complete ==="
