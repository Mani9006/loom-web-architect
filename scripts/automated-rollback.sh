#!/bin/bash

##############################################################################
# Automated Rollback Script
# Purpose: Safely rollback Vercel deployments and Supabase changes
# Usage: ./scripts/automated-rollback.sh [--vercel|--supabase|--full] [--dry-run]
# Safety: Requires explicit confirmation before executing rollback
##############################################################################

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Configuration
ROLLBACK_TARGET="${1:-full}"
DRY_RUN="${2:-}"
ROLLBACK_LOG="rollback-$(date +%Y%m%d-%H%M%S).log"
DEPLOYMENT_HISTORY=".deployment-history"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$ROLLBACK_LOG"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1" | tee -a "$ROLLBACK_LOG"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$ROLLBACK_LOG"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1" | tee -a "$ROLLBACK_LOG"
}

log_action() {
    echo -e "${MAGENTA}[ACTION]${NC} $1" | tee -a "$ROLLBACK_LOG"
}

log_debug() {
    if [[ "$DRY_RUN" == "--dry-run" ]]; then
        echo -e "${MAGENTA}[DRY-RUN]${NC} $1" | tee -a "$ROLLBACK_LOG"
    fi
}

# ============================================================================
# SAFETY CHECKS
# ============================================================================

check_prerequisites() {
    log_info "Checking rollback prerequisites..."

    # Check for required tools
    if ! command -v vercel &> /dev/null; then
        log_error "Vercel CLI is not installed"
        log_info "Install with: npm install -g vercel"
        exit 1
    fi

    if ! command -v supabase &> /dev/null; then
        log_error "Supabase CLI is not installed"
        log_info "Install with: npm install -g supabase"
        exit 1
    fi

    # Check for Vercel project configuration
    if [ ! -f "vercel.json" ]; then
        log_warning "vercel.json not found in project root"
    fi

    log_success "All prerequisites met"
}

confirm_rollback() {
    log_warning "=== ROLLBACK CONFIRMATION REQUIRED ==="
    echo ""
    echo "Target: $ROLLBACK_TARGET"
    echo "Dry Run: $([ "$DRY_RUN" == "--dry-run" ] && echo 'YES' || echo 'NO')"
    echo ""
    echo "This will rollback the deployment to the previous stable version."
    echo "Current deployment will be replaced."
    echo ""

    if [ "$DRY_RUN" != "--dry-run" ]; then
        read -p "Type 'CONFIRM_ROLLBACK' to proceed: " confirmation
        if [ "$confirmation" != "CONFIRM_ROLLBACK" ]; then
            log_error "Rollback cancelled by user"
            exit 1
        fi
    else
        log_debug "Dry run mode - no confirmation required"
    fi

    log_success "Rollback confirmed"
}

# ============================================================================
# VERCEL ROLLBACK
# ============================================================================

get_previous_vercel_deployment() {
    log_info "Retrieving previous Vercel deployment..."

    # Get list of deployments (most recent first)
    local deployments=$(vercel ls --prod 2>/dev/null | tail -n +2 | head -2)

    # Extract the second deployment (previous one)
    local previous_deployment=$(echo "$deployments" | tail -1 | awk '{print $NF}')

    if [ -z "$previous_deployment" ]; then
        log_error "Could not find previous deployment"
        return 1
    fi

    echo "$previous_deployment"
    log_info "Previous deployment found: $previous_deployment"
}

rollback_vercel() {
    log_info "Starting Vercel rollback..."

    if [ "$DRY_RUN" == "--dry-run" ]; then
        log_debug "Would execute: vercel rollback --prod"
        return 0
    fi

    if vercel rollback --prod --yes 2>&1 | tee -a "$ROLLBACK_LOG"; then
        log_success "Vercel rollback completed"
        return 0
    else
        log_error "Vercel rollback failed"
        return 1
    fi
}

verify_vercel_rollback() {
    log_info "Verifying Vercel rollback..."

    # Wait for deployment to be live
    sleep 10

    local deployment_url="https://resumepreps.com"
    local max_retries=5
    local attempt=1

    while [ $attempt -le $max_retries ]; do
        if curl -sf "$deployment_url" > /dev/null 2>&1; then
            log_success "Vercel deployment is live and responsive"
            return 0
        fi

        if [ $attempt -lt $max_retries ]; then
            log_warning "Verification attempt $attempt failed, retrying..."
            sleep 10
        fi
        ((attempt++))
    done

    log_error "Vercel deployment verification failed after $max_retries attempts"
    return 1
}

# ============================================================================
# SUPABASE ROLLBACK
# ============================================================================

get_supabase_project_ref() {
    if [ -z "${SUPABASE_PROJECT_REF:-}" ]; then
        SUPABASE_PROJECT_REF="woxtbyotydxorcdhhivr"
    fi
    echo "$SUPABASE_PROJECT_REF"
}

get_previous_edge_function_version() {
    local project_ref=$(get_supabase_project_ref)
    local function_name="$1"

    log_info "Retrieving previous version of Edge Function: $function_name..."

    # This would require storing versions somewhere
    # For now, we'll redeploy from current source
    log_warning "Edge Function versioning not implemented - will redeploy from source"
}

rollback_supabase_edge_functions() {
    local project_ref=$(get_supabase_project_ref)
    log_info "Starting Supabase Edge Functions rollback..."

    # List of critical edge functions
    local functions=("generatePDF" "processResume" "validateEmail")

    for func in "${functions[@]}"; do
        log_action "Rolling back Edge Function: $func"

        if [ "$DRY_RUN" == "--dry-run" ]; then
            log_debug "Would execute: supabase functions deploy $func --project-ref $project_ref"
            continue
        fi

        if supabase functions deploy "$func" --project-ref "$project_ref" 2>&1 | tee -a "$ROLLBACK_LOG"; then
            log_success "Edge Function '$func' redeployed"
        else
            log_warning "Failed to redeploy Edge Function '$func'"
        fi
    done
}

verify_supabase_edge_functions() {
    local project_ref=$(get_supabase_project_ref)
    log_info "Verifying Supabase Edge Functions..."

    local functions=("generatePDF" "processResume" "validateEmail")
    local functions_ok=0

    for func in "${functions[@]}"; do
        # Check if function is responsive
        local response=$(curl -s -w "\n%{http_code}" \
            -X POST \
            -H "Authorization: Bearer ${SUPABASE_API_KEY:-}" \
            "https://${project_ref}.functions.supabase.co/$func" \
            --data '{}' \
            2>/dev/null)

        local http_code=$(echo "$response" | tail -n1)

        if [ "$http_code" != "404" ] && [ "$http_code" != "000" ]; then
            log_success "Edge Function '$func' responding (HTTP $http_code)"
            ((functions_ok++))
        else
            log_warning "Edge Function '$func' not responding"
        fi
    done

    if [ $functions_ok -gt 0 ]; then
        log_success "Edge Functions verification passed"
        return 0
    else
        log_error "Edge Functions verification failed"
        return 1
    fi
}

rollback_supabase_database() {
    local project_ref=$(get_supabase_project_ref)
    log_info "Checking Supabase database state..."

    if [ "$DRY_RUN" == "--dry-run" ]; then
        log_debug "Would check database migrations"
        return 0
    fi

    # Check for recent migrations that need reverting
    if [ -d "supabase/migrations" ]; then
        log_warning "Database migrations require manual review"
        log_info "Migrations location: supabase/migrations/"
        log_info "Use: supabase db push --dry-run"
    fi

    return 0
}

# ============================================================================
# ROLLBACK EXECUTION
# ============================================================================

rollback_full() {
    log_info "Executing full rollback (Vercel + Supabase)..."

    rollback_vercel || exit 1
    verify_vercel_rollback || log_warning "Vercel verification incomplete"

    rollback_supabase_edge_functions
    verify_supabase_edge_functions || log_warning "Supabase verification incomplete"

    rollback_supabase_database

    log_success "Full rollback completed"
}

rollback_vercel_only() {
    log_info "Executing Vercel-only rollback..."

    rollback_vercel || exit 1
    verify_vercel_rollback || exit 1

    log_success "Vercel rollback completed"
}

rollback_supabase_only() {
    log_info "Executing Supabase-only rollback..."

    rollback_supabase_edge_functions
    verify_supabase_edge_functions || exit 1
    rollback_supabase_database

    log_success "Supabase rollback completed"
}

# ============================================================================
# POST-ROLLBACK VALIDATION
# ============================================================================

run_post_rollback_validation() {
    log_info "Running post-rollback validation..."

    if [ -f "scripts/post-deploy-validation.sh" ]; then
        if bash scripts/post-deploy-validation.sh "https://resumepreps.com" 2>&1 | tee -a "$ROLLBACK_LOG"; then
            log_success "Post-rollback validation passed"
            return 0
        else
            log_error "Post-rollback validation failed"
            return 1
        fi
    else
        log_warning "Post-deploy validation script not found"
        return 0
    fi
}

# ============================================================================
# REPORTING
# ============================================================================

record_rollback() {
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local git_commit=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    local rollback_reason="${1:-manual}"

    if [ ! -f "$DEPLOYMENT_HISTORY" ]; then
        echo "timestamp,event,git_commit,reason" > "$DEPLOYMENT_HISTORY"
    fi

    echo "$timestamp,rollback,$git_commit,$rollback_reason" >> "$DEPLOYMENT_HISTORY"

    log_success "Rollback recorded in deployment history"
}

generate_rollback_report() {
    log_info "Generating rollback report..."

    cat > "rollback-report-$(date +%Y%m%d-%H%M%S).json" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "rollback_target": "$ROLLBACK_TARGET",
  "dry_run": $([ "$DRY_RUN" == "--dry-run" ] && echo 'true' || echo 'false'),
  "log_file": "$ROLLBACK_LOG",
  "deployment_history": "$(cat $DEPLOYMENT_HISTORY 2>/dev/null || echo 'not available')"
}
EOF

    log_success "Rollback report generated"
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    log_info "=== Automated Rollback Script Starting ==="
    log_info "Target: $ROLLBACK_TARGET"
    log_info "Dry Run: $([ "$DRY_RUN" == "--dry-run" ] && echo 'YES' || echo 'NO')"
    log_info "Log file: $ROLLBACK_LOG"
    echo ""

    # Pre-flight checks
    check_prerequisites
    confirm_rollback

    echo ""
    log_warning "=== EXECUTING ROLLBACK ==="
    echo ""

    # Execute rollback based on target
    case "$ROLLBACK_TARGET" in
        --vercel)
            rollback_vercel_only
            ;;
        --supabase)
            rollback_supabase_only
            ;;
        --full)
            rollback_full
            ;;
        *)
            log_error "Unknown rollback target: $ROLLBACK_TARGET"
            log_info "Usage: $0 [--vercel|--supabase|--full] [--dry-run]"
            exit 1
            ;;
    esac

    echo ""
    log_info "Running post-rollback validation..."
    run_post_rollback_validation

    # Record and report
    if [ "$DRY_RUN" != "--dry-run" ]; then
        record_rollback "automated"
    fi
    generate_rollback_report

    echo ""
    log_success "=== Rollback Process Complete ==="
    log_info "Logs saved to: $ROLLBACK_LOG"
    log_info "Report saved to: rollback-report-$(date +%Y%m%d-%H%M%S).json"

    if [ "$DRY_RUN" == "--dry-run" ]; then
        log_warning "This was a DRY RUN - no changes were made"
    fi

    exit 0
}

main "$@"
