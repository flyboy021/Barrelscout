#!/bin/bash
# Force-push BarrelScout local version to GitHub
REPO="/Volumes/WD_Black SN850X 2G/Jeremy External Home/Desktop/whiskey identifier"
cd "$REPO" || exit 1

echo "Pushing BarrelScout to GitHub..."

# Reset any in-progress merge
git merge --abort 2>/dev/null
git reset --hard HEAD 2>/dev/null

# Stage everything we care about
git add index.html bottles.json barrelscout-sync.sh
git diff --cached --quiet && echo "Nothing to commit." && exit 0

git commit -m "Update theme, fix distillery websites, random home bottles, auto-sync"

# Force push (our local version is authoritative)
git push --force-with-lease origin main && echo "✓ Pushed successfully!" || git push origin main

echo ""
echo "Done! Press any key to close..."
read -n 1
