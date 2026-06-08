#!/bin/bash
# BarrelScout auto-sync — commits and pushes index.html + bottles.json if changed
REPO="/Volumes/WD_Black SN850X 2G/Jeremy External Home/Desktop/whiskey identifier"

# Don't run if drive isn't mounted
[ -d "$REPO/.git" ] || exit 0

cd "$REPO" || exit 0

# Stage only the two app files (ignore .DS_Store etc.)
/usr/bin/git add index.html bottles.json

# If nothing staged, nothing to do
/usr/bin/git diff --cached --quiet && exit 0

# Backup changed files before pushing (keep last 30 days, one per day)
BACKUP_DIR="$REPO/backups"
mkdir -p "$BACKUP_DIR"
DATE=$(date '+%Y-%m-%d')
cp "$REPO/index.html"  "$BACKUP_DIR/index.html.$DATE"  2>/dev/null
cp "$REPO/bottles.json" "$BACKUP_DIR/bottles.json.$DATE" 2>/dev/null
# Prune backups older than 30 days
find "$BACKUP_DIR" -name "index.html.*" -mtime +30 -delete 2>/dev/null
find "$BACKUP_DIR" -name "bottles.json.*" -mtime +30 -delete 2>/dev/null

# Commit and push
/usr/bin/git commit -m "Auto-sync: $(date '+%Y-%m-%d %H:%M')"
/usr/bin/git push origin main
