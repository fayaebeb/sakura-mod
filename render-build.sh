#!/usr/bin/env bash
echo "🔧 Installing system dependencies..."

# Ensure package lists are up-to-date
apt-get update 

# Install LibreOffice and necessary packages
apt-get install -y libreoffice libreoffice-common libreoffice-writer libreoffice-calc libreoffice-impress

echo "✅ LibreOffice installed successfully!"
