#!/usr/bin/env bash
# Copies the secrets the app-suite stack needs from an old .env into Komodo variables, so they
# do not have to be pasted one by one (step 6 in ../README.md). Run it once on marvin.
#
#   KOMODO_API_KEY=K-... KOMODO_API_SECRET=S-... \
#     ./import-env.sh ~/stacks/app-suite/.env /home/didrik/stacks/app-suite/data
#
# Create the API key in Komodo under Settings → Profile → API keys, and delete it afterwards.
# Every [[NAME]] in app-suite.toml is created (or updated) as a secret variable, except
# APP_SUITE_DATA_DIR, which is set from the second argument and stays visible.
# Values are only read from the file and sent to Komodo; nothing is printed or written.
set -euo pipefail

ENV_FILE="${1:?usage: import-env.sh <old .env> <data dir>}"
DATA_DIR="${2:?usage: import-env.sh <old .env> <data dir>}"
URL="${KOMODO_URL:-https://komodo.didrik.dev}"
: "${KOMODO_API_KEY:?set KOMODO_API_KEY}" "${KOMODO_API_SECRET:?set KOMODO_API_SECRET}"
TOML="$(dirname "$0")/app-suite.toml"
[ -r "$ENV_FILE" ] || { echo "cannot read $ENV_FILE" >&2; exit 1; }
[ -d "$DATA_DIR" ] || { echo "warning: $DATA_DIR does not exist (yet)" >&2; }

# Prints the value of KEY in the .env file: last assignment wins, surrounding quotes removed.
value_of() {
  local line
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?$1=" "$ENV_FILE" | tail -n 1)" || return 1
  line="${line#*=}"
  line="${line%$'\r'}"
  if [[ "$line" =~ ^\"(.*)\"$ ]] || [[ "$line" =~ ^\'(.*)\'$ ]]; then line="${BASH_REMATCH[1]}"; fi
  printf '%s' "$line"
}

json_escape() { local s="${1//\\/\\\\}"; s="${s//\"/\\\"}"; printf '%s' "$s"; }

call() { # call <request> <json params>; prints the HTTP status
  curl -sS -o /dev/null -w '%{http_code}' -X POST "$URL/write/$1" \
    -H 'Content-Type: application/json' \
    -H "X-Api-Key: $KOMODO_API_KEY" -H "X-Api-Secret: $KOMODO_API_SECRET" \
    --data "$2"
}

put() { # put <name> <value> <secret: true|false>
  local name="$1" value secret="$3" code
  value="$(json_escape "$2")"
  code="$(call CreateVariable "{\"name\":\"$name\",\"value\":\"$value\",\"is_secret\":$secret}")"
  if [ "$code" != 200 ]; then # most likely it exists already: update the value instead
    code="$(call UpdateVariableValue "{\"name\":\"$name\",\"value\":\"$value\"}")"
  fi
  if [ "$code" = 200 ]; then echo "ok       $name"; else echo "FAILED   $name (HTTP $code)"; failed=1; fi
}

failed=0
put APP_SUITE_DATA_DIR "$DATA_DIR" false
for name in $(grep -v '^[[:space:]]*#' "$TOML" | grep -o '\[\[[A-Z0-9_]*\]\]' | tr -d '[]' | sort -u); do
  [ "$name" = APP_SUITE_DATA_DIR ] && continue
  if v="$(value_of "$name")" && [ -n "$v" ]; then
    put "$name" "$v" true
  else
    echo "MISSING  $name (not in $ENV_FILE: create it in Komodo by hand)"
    failed=1
  fi
done
exit "$failed"
