#!/bin/bash
# BarrelScout Auto-Sync Installer
# Double-click this file to install. You only need to run it once.

REPO="/Volumes/WD_Black SN850X 2G/Jeremy External Home/Desktop/whiskey identifier"
SCRIPTS_DIR="$HOME/Library/Scripts"
AGENTS_DIR="$HOME/Library/LaunchAgents"
SCRIPT_DEST="$SCRIPTS_DIR/barrelscout-sync.sh"
PLIST_DEST="$AGENTS_DIR/com.barrelscout.autosync.plist"
LABEL="com.barrelscout.autosync"

echo "====================================="
echo "  BarrelScout Auto-Sync Installer"
echo "====================================="
echo ""

# Create directories
mkdir -p "$SCRIPTS_DIR"
mkdir -p "$AGENTS_DIR"

# Copy sync script
cp "$REPO/github-sync/barrelscout-sync.sh" "$SCRIPT_DEST"
chmod +x "$SCRIPT_DEST"
echo "✓ Sync script installed"

# Write plist with correct home path
cat > "$PLIST_DEST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT_DEST</string>
  </array>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/barrelscout-sync.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/barrelscout-sync.log</string>
</dict>
</plist>
EOF
echo "✓ Launch agent installed"

# Unload if already running, then load fresh
launchctl unload "$PLIST_DEST" 2>/dev/null
launchctl load "$PLIST_DEST"
echo "✓ Auto-sync started (runs every 5 minutes)"

echo ""
echo "====================================="
echo "  Done! BarrelScout will now auto-"
echo "  push changes to GitHub every 5 min."
echo "====================================="
echo ""
echo "Press any key to close..."
read -n 1
