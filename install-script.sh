#!/bin/bash

# Ghost to SES Adapter Installation Script
echo "Ghost to SES Adapter Installer"
echo "=============================="
echo

# Check for required commands
for cmd in node npm nginx; do
  if ! command -v $cmd &> /dev/null; then
    echo "Error: $cmd is required but not installed."
    exit 1
  fi
done

# Create directory
INSTALL_DIR="${1:-/opt/ghost-ses-adapter}"
echo "Installing to $INSTALL_DIR..."
sudo mkdir -p "$INSTALL_DIR"

# Copy files
sudo cp mailgun-to-ses.js "$INSTALL_DIR/"
sudo cp package.json "$INSTALL_DIR/"
sudo cp config.json "$INSTALL_DIR/"
sudo cp README.md "$INSTALL_DIR/"

# Install dependencies
echo "Installing dependencies..."
cd "$INSTALL_DIR"
sudo npm install --production

# Set up Nginx
echo "Setting up Nginx proxy..."
NGINX_CONF="/etc/nginx/sites-available/mailgun-proxy.conf"
sudo cp mailgun-proxy.conf "$NGINX_CONF"

# Enable Nginx site
sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
sudo nginx -t

if [ $? -ne 0 ]; then
  echo "Error: Nginx configuration test failed."
  echo "Please check your SSL certificate paths in $NGINX_CONF"
  exit 1
fi

sudo systemctl reload nginx

# Set up systemd service
echo "Setting up systemd service..."
SERVICE_FILE="/etc/systemd/system/ghost-ses-adapter.service"
sudo cp ghost-ses-adapter.service "$SERVICE_FILE"

# Update paths in service file
sudo sed -i "s|/path/to/mailgun-to-ses.js|$INSTALL_DIR/mailgun-to-ses.js|g" "$SERVICE_FILE"
sudo sed -i "s|/path/to/ghost-ses-adapter|$INSTALL_DIR|g" "$SERVICE_FILE"

# Get the current user
CURRENT_USER=$(whoami)
sudo sed -i "s|your-user|$CURRENT_USER|g" "$SERVICE_FILE"

# Enable and start the service
sudo systemctl daemon-reload
sudo systemctl enable ghost-ses-adapter
sudo systemctl start ghost-ses-adapter

# Update hosts file
echo "Updating hosts file..."
if ! grep -q "api.eu.mailgun.net" /etc/hosts; then
  echo "127.0.0.1 api.eu.mailgun.net api.mailgun.net" | sudo tee -a /etc/hosts
fi

echo
echo "Installation completed!"
echo "Please check the service status with: sudo systemctl status ghost-ses-adapter"
echo "And verify your Ghost configuration to use Mailgun for newsletters."
echo
echo "For more information, see the README.md file in $INSTALL_DIR"
