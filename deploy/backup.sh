#!/usr/bin/env bash
# Nightly backup of every app's SQLite database (+ etapp photos).
# Uses sqlite3's online .backup, which is safe while the apps are running.
# Needs: sqlite3 on the host (apt install sqlite3).
# DATA_DIR is where the apps keep their data (the stack's APP_SUITE_DATA_DIR in Komodo).
# Cron example (03:15 every night), running the copy Komodo keeps checked out:
#   15 3 * * * DATA_DIR=/home/didrik/stacks/app-suite/data /etc/komodo/stacks/app-suite/deploy/backup.sh >> /home/didrik/stacks/app-suite/backup.log 2>&1
set -euo pipefail

DATA_DIR="${DATA_DIR:?set DATA_DIR to the apps data folder}"
DEST="${BACKUP_DIR:-$(dirname "$DATA_DIR")/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y-%m-%d_%H%M)"
TARGET="$DEST/$STAMP"

mkdir -p "$TARGET"
# Data folders, not app names: Fartlek and Kvitt still keep theirs in runplan/ and shopsplit/.
for app in runplan shopsplit etapp garden; do
  # Only app.db: demo/ holds visitors' throwaway demo databases and is left out on purpose.
  db="$DATA_DIR/$app/app.db"
  [ -f "$db" ] || { echo "skip $app (no database yet)"; continue; }
  sqlite3 "$db" ".backup '$TARGET/$app.db'"
  echo "backed up $app"
done
if [ -d "$DATA_DIR/etapp/uploads" ]; then
  tar -czf "$TARGET/etapp-uploads.tar.gz" -C "$DATA_DIR/etapp" uploads
  echo "backed up etapp uploads"
fi

find "$DEST" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} +
echo "done: $TARGET"
