#!/bin/bash
# ══════════════════════════════════════════════════════════════════
# Kimi K2.5 Job Finder — Mac Mini Setup Script
# ══════════════════════════════════════════════════════════════════
# Run this once on the Mac Mini to install everything.
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
#
# What it does:
#   1. Installs kimi-cli (if not already installed)
#   2. Sets up environment variables
#   3. Creates a launchd job to run every 2 hours automatically
#   4. Does a test run to verify everything works
# ══════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="$HOME/.kimi-job-finder"
PLIST_FILE="$HOME/Library/LaunchAgents/com.resumepreps.kimi-job-finder.plist"

echo "╔══════════════════════════════════════════╗"
echo "║  Kimi K2.5 Job Finder — Setup           ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Check Python ──────────────────────────────────────────────
echo "▸ Checking Python..."
if command -v python3 &>/dev/null; then
    PYTHON=$(command -v python3)
    echo "  ✓ Python found: $($PYTHON --version)"
else
    echo "  ✗ Python 3 not found! Install it first."
    exit 1
fi

# ── 2. Install kimi-cli ─────────────────────────────────────────
echo ""
echo "▸ Checking kimi-cli..."
if command -v kimi &>/dev/null; then
    echo "  ✓ kimi-cli already installed"
else
    echo "  Installing kimi-cli..."
    pip3 install kimi-cli --break-system-packages 2>/dev/null || pip3 install kimi-cli
    if command -v kimi &>/dev/null; then
        echo "  ✓ kimi-cli installed successfully"
    else
        echo "  ✗ kimi-cli installation failed. Try manually: pip3 install kimi-cli"
        exit 1
    fi
fi

# ── 3. Set up install directory ──────────────────────────────────
echo ""
echo "▸ Setting up install directory..."
mkdir -p "$INSTALL_DIR"
cp "$SCRIPT_DIR/find-jobs.py" "$INSTALL_DIR/find-jobs.py"
chmod +x "$INSTALL_DIR/find-jobs.py"
echo "  ✓ Script copied to $INSTALL_DIR"

# ── 4. Configure environment ────────────────────────────────────
ENV_FILE="$INSTALL_DIR/.env"
echo ""
echo "▸ Configuring environment..."

if [ -f "$ENV_FILE" ]; then
    echo "  Found existing .env file"
    source "$ENV_FILE"
fi

# Supabase URL (pre-filled for ResumePreps)
SUPABASE_URL="${SUPABASE_URL:-https://woxtbyotydxorcdhhivr.supabase.co}"

# Supabase service role key
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo ""
    echo "  I need your Supabase SERVICE ROLE KEY to save jobs to the database."
    echo "  Find it at: https://supabase.com/dashboard/project/woxtbyotydxorcdhhivr/settings/api"
    echo "  (Under 'service_role' — the secret one, NOT the anon key)"
    echo ""
    read -p "  Paste your Supabase service role key: " SUPABASE_SERVICE_ROLE_KEY
    if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
        echo "  ✗ No key provided. You can add it later to $ENV_FILE"
    fi
fi

# Write .env file
cat > "$ENV_FILE" << ENVEOF
# Kimi Job Finder Environment
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
ENVEOF
chmod 600 "$ENV_FILE"
echo "  ✓ Environment saved to $ENV_FILE"

# ── 5. Create runner script ─────────────────────────────────────
RUNNER="$INSTALL_DIR/run.sh"
cat > "$RUNNER" << 'RUNEOF'
#!/bin/bash
# Load environment
source "$HOME/.kimi-job-finder/.env"
export SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY

# Run the job finder
cd "$HOME/.kimi-job-finder"
/usr/bin/python3 find-jobs.py "$@" >> "$HOME/.kimi-job-finder/cron.log" 2>&1
RUNEOF
chmod +x "$RUNNER"
echo "  ✓ Runner script created"

# ── 6. Create launchd job (runs every 2 hours) ──────────────────
echo ""
echo "▸ Setting up auto-scheduler (every 2 hours)..."

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_FILE" << PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.resumepreps.kimi-job-finder</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${HOME}/.kimi-job-finder/run.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>7200</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${HOME}/.kimi-job-finder/launchd-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${HOME}/.kimi-job-finder/launchd-stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:${HOME}/.local/bin:${HOME}/Library/Python/3.12/bin:${HOME}/Library/Python/3.11/bin</string>
    </dict>
</dict>
</plist>
PLISTEOF

# Load the launchd job
launchctl unload "$PLIST_FILE" 2>/dev/null || true
launchctl load "$PLIST_FILE"
echo "  ✓ Auto-scheduler installed — runs every 2 hours"

# ── 7. Test run ──────────────────────────────────────────────────
echo ""
echo "▸ Running a quick test (2 roles only)..."
echo ""

source "$ENV_FILE"
export SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY

$PYTHON "$INSTALL_DIR/find-jobs.py" --roles "Software Engineer,Data Scientist" --dry-run --max-batches 1

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Setup Complete!                         ║"
echo "╠══════════════════════════════════════════╣"
echo "║                                          ║"
echo "║  Auto-runs every 2 hours automatically   ║"
echo "║                                          ║"
echo "║  Manual commands:                        ║"
echo "║  • Full run:   ~/.kimi-job-finder/run.sh ║"
echo "║  • Test run:   python3 find-jobs.py      ║"
echo "║                --dry-run                  ║"
echo "║  • View logs:  cat ~/.kimi-job-finder/   ║"
echo "║                job-finder.log             ║"
echo "║  • Stop auto:  launchctl unload          ║"
echo "║    ~/Library/LaunchAgents/com.            ║"
echo "║    resumepreps.kimi-job-finder.plist      ║"
echo "║                                          ║"
echo "╚══════════════════════════════════════════╝"
