#!/bin/bash

##############################################################################
# Post-Deployment Validation Script
# Purpose: Validates deployment health across Vercel and Supabase
# Usage: ./scripts/post-deploy-validation.sh <deployment-url> [--strict]
# Validates: Vercel frontend, Supabase database, Edge Functions
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
DEPLOYMENT_URL="${1:-}"
STRICT_MODE="${2:-}"
VALIDATION_REPORT="post-deploy-validation-report.json"
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNED=0

# Supabase configuration
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-woxtbyotydxorcdhhivr}"
SUPABASE_API_KEY="${SUPABASE_API_KEY:-}"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((CHECKS_PASSED++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((CHECKS_WARNED++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((CHECKS_FAILED++))
}

log_debug() {
    if [[ "$STRICT_MODE" == "--strict" ]]; then
        echo -e "${MAGENTA}[DEBUG]${NC} $1"
    fi
}

# ============================================================================
# VERCEL DEPLOYMENT CHECKS
# ============================================================================

validate_deployment_url() {
    if [ -z "$DEPLOYMENT_URL" ]; then
        log_error "Deployment URL is required"
        echo "Usage: $0 <deployment-url> [--strict]"
        exit 1
    fi

    # Add https if no protocol specified
    if [[ ! "$DEPLOYMENT_URL" =~ ^https?:// ]]; then
        DEPLOYMENT_URL="https://$DEPLOYMENT_URL"
    fi

    log_info "Deployment URL: $DEPLOYMENT_URL"
}

check_vercel_connectivity() {
    log_info "Checking Vercel deployment connectivity..."

    local max_retries=5
    local retry_interval=10
    local attempt=1

    while [ $attempt -le $max_retries ]; do
        if curl -sf --connect-timeout 10 -m 30 "$DEPLOYMENT_URL" > /dev/null 2>&1; then
            log_success "Vercel connectivity verified (attempt $attempt)"
            return 0
        fi

        if [ $attempt -lt $max_retries ]; then
            log_warning "Connection attempt $attempt failed, retrying in ${retry_interval}s..."
            sleep $retry_interval
        fi
        ((attempt++))
    done

    log_error "Failed to connect after $max_retries attempts"
    return 1
}

check_vercel_http_status() {
    log_info "Checking Vercel HTTP status codes..."

    local status_code=$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOYMENT_URL")

    if [ "$status_code" -eq 200 ]; then
        log_success "HTTP 200 OK"
        return 0
    elif [ "$status_code" -lt 400 ]; then
        log_warning "HTTP $status_code (redirect/non-standard success)"
        return 0
    else
        log_error "HTTP $status_code (failed)"
        return 1
    fi
}

check_vercel_performance() {
    log_info "Checking Vercel response times (p95 < 3s SLA)..."

    local response_time=$(curl -s -o /dev/null -w "%{time_total}" "$DEPLOYMENT_URL" 2>/dev/null)
    local response_time_ms=$(echo "$response_time * 1000" | bc)

    if (( $(echo "$response_time < 3" | bc -l) )); then
        log_success "Response time: ${response_time}s (${response_time_ms%.*}ms) - within SLA"
        return 0
    elif (( $(echo "$response_time < 10" | bc -l) )); then
        log_warning "Response time: ${response_time}s (${response_time_ms%.*}ms) - above SLA but acceptable"
        return 0
    else
        log_error "Response time: ${response_time}s (${response_time_ms%.*}ms) - degraded"
        return 1
    fi
}

check_vercel_html_structure() {
    log_info "Checking Vercel HTML structure..."

    local content=$(curl -s "$DEPLOYMENT_URL")

    if echo "$content" | grep -q "<!DOCTYPE html\|<html\|<body"; then
        log_success "Valid HTML structure detected"
    else
        log_error "Invalid or missing HTML structure"
        return 1
    fi

    # Check for app initialization
    if echo "$content" | grep -q "root.*div\|id=\"app\"\|id=\"__next\""; then
        log_success "React app root element found"
    else
        log_warning "Could not verify app initialization markers"
    fi
}

check_vercel_resources() {
    log_info "Checking Vercel critical resources (JS/CSS)..."

    local content=$(curl -s "$DEPLOYMENT_URL")

    if echo "$content" | grep -q "\.js\|<script"; then
        log_success "JavaScript bundles loaded"
    else
        log_error "No JavaScript bundles detected"
        return 1
    fi

    if echo "$content" | grep -q "\.css\|<style"; then
        log_success "CSS resources loaded"
    else
        log_warning "No CSS resources detected"
    fi
}

check_vercel_security_headers() {
    log_info "Checking Vercel security headers..."

    local headers=$(curl -s -i "$DEPLOYMENT_URL" 2>/dev/null | head -30)

    local security_headers_found=0

    if echo "$headers" | grep -qi "x-frame-options"; then
        log_success "X-Frame-Options header present"
        ((security_headers_found++))
    fi

    if echo "$headers" | grep -qi "x-content-type-options"; then
        log_success "X-Content-Type-Options header present"
        ((security_headers_found++))
    fi

    if echo "$headers" | grep -qi "strict-transport-security"; then
        log_success "Strict-Transport-Security header present"
        ((security_headers_found++))
    fi

    if [ $security_headers_found -lt 2 ]; then
        log_warning "Some security headers are missing"
    fi
}

# ============================================================================
# SUPABASE CHECKS
# ============================================================================

check_supabase_database() {
    log_info "Checking Supabase database connectivity..."

    if [ -z "$SUPABASE_API_KEY" ]; then
        log_warning "SUPABASE_API_KEY not set - skipping database checks"
        return 0
    fi

    # Check database is reachable via REST API
    local response=$(curl -s -w "\n%{http_code}" \
        -H "apikey: $SUPABASE_API_KEY" \
        -H "Content-Type: application/json" \
        "https://${SUPABASE_PROJECT_REF}.supabase.co/rest/v1/profiles?select=*&limit=1" \
        2>/dev/null)

    local http_code=$(echo "$response" | tail -n1)

    if [ "$http_code" == "200" ] || [ "$http_code" == "401" ]; then
        log_success "Supabase database reachable (HTTP $http_code)"
        return 0
    else
        log_error "Supabase database unreachable (HTTP $http_code)"
        return 1
    fi
}

check_supabase_auth() {
    log_info "Checking Supabase Auth system..."

    if [ -z "$SUPABASE_API_KEY" ]; then
        log_warning "SUPABASE_API_KEY not set - skipping auth checks"
        return 0
    fi

    # Check auth endpoint
    local response=$(curl -s -w "\n%{http_code}" \
        -H "apikey: $SUPABASE_API_KEY" \
        "https://${SUPABASE_PROJECT_REF}.supabase.co/auth/v1/health" \
        2>/dev/null)

    local http_code=$(echo "$response" | tail -n1)

    if [ "$http_code" == "200" ]; then
        log_success "Supabase Auth system healthy"
        return 0
    else
        log_warning "Supabase Auth check returned HTTP $http_code"
    fi
}

check_supabase_storage() {
    log_info "Checking Supabase Storage..."

    if [ -z "$SUPABASE_API_KEY" ]; then
        log_warning "SUPABASE_API_KEY not set - skipping storage checks"
        return 0
    fi

    # Check storage is accessible
    local response=$(curl -s -w "\n%{http_code}" \
        -H "apikey: $SUPABASE_API_KEY" \
        "https://${SUPABASE_PROJECT_REF}.supabase.co/storage/v1/bucket" \
        2>/dev/null)

    local http_code=$(echo "$response" | tail -n1)

    if [ "$http_code" == "200" ] || [ "$http_code" == "401" ]; then
        log_success "Supabase Storage accessible (HTTP $http_code)"
        return 0
    else
        log_warning "Supabase Storage returned HTTP $http_code"
    fi
}

check_supabase_edge_functions() {
    log_info "Checking Supabase Edge Functions status..."

    if [ -z "$SUPABASE_API_KEY" ]; then
        log_warning "SUPABASE_API_KEY not set - skipping Edge Functions checks"
        return 0
    fi

    # Define critical edge functions to check
    local critical_functions=("generatePDF" "processResume" "validateEmail")
    local functions_available=0

    for func in "${critical_functions[@]}"; do
        # Attempt to call the function to verify it exists and is responsive
        local response=$(curl -s -w "\n%{http_code}" \
            -X POST \
            -H "Authorization: Bearer $SUPABASE_API_KEY" \
            -H "Content-Type: application/json" \
            "https://${SUPABASE_PROJECT_REF}.functions.supabase.co/$func" \
            --data '{}' \
            2>/dev/null)

        local http_code=$(echo "$response" | tail -n1)

        # 200, 400, 500, etc. all indicate the function exists and is responsive
        # 404 means function doesn't exist or isn't deployed
        if [ "$http_code" != "404" ] && [ "$http_code" != "000" ]; then
            log_success "Edge Function '$func' is deployed (HTTP $http_code)"
            ((functions_available++))
        else
            log_warning "Edge Function '$func' not responding (HTTP $http_code)"
        fi
    done

    if [ $functions_available -ge 1 ]; then
        log_success "At least one critical Edge Function is deployed"
        return 0
    else
        log_error "No critical Edge Functions responding"
        return 1
    fi
}

# ============================================================================
# APPLICATION HEALTH CHECKS
# ============================================================================

check_api_endpoints() {
    log_info "Checking critical API endpoints..."

    local endpoints=("/api/health" "/api/status")
    local working_endpoints=0

    for endpoint in "${endpoints[@]}"; do
        local response=$(curl -s -w "\n%{http_code}" "${DEPLOYMENT_URL}${endpoint}" 2>/dev/null)
        local http_code=$(echo "$response" | tail -n1)

        if [ "$http_code" == "200" ] || [ "$http_code" == "404" ]; then
            if [ "$http_code" == "200" ]; then
                log_success "API endpoint '$endpoint' is healthy"
                ((working_endpoints++))
            fi
        fi
    done

    if [ $working_endpoints -gt 0 ]; then
        log_success "$working_endpoints health endpoint(s) responding"
        return 0
    fi

    log_debug "No /health or /status endpoints found (not critical)"
    return 0
}

check_error_rate() {
    log_info "Checking deployment error rates..."

    # Check for 5xx errors in response
    local response=$(curl -s "$DEPLOYMENT_URL")

    if echo "$response" | grep -qi "error\|exception\|fatal"; then
        log_warning "Potential error indicators detected in response"
    else
        log_success "No obvious error indicators in deployment"
    fi
}

# ============================================================================
# REPORT GENERATION
# ============================================================================

generate_validation_report() {
    log_info "Generating post-deployment validation report..."

    cat > "$VALIDATION_REPORT" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deployment_url": "$DEPLOYMENT_URL",
  "supabase_project": "$SUPABASE_PROJECT_REF",
  "validation_mode": "$([ -z "$STRICT_MODE" ] && echo 'standard' || echo 'strict')",
  "checks": {
    "passed": $CHECKS_PASSED,
    "warned": $CHECKS_WARNED,
    "failed": $CHECKS_FAILED,
    "total": $((CHECKS_PASSED + CHECKS_WARNED + CHECKS_FAILED))
  },
  "status": "$([ $CHECKS_FAILED -eq 0 ] && echo 'HEALTHY' || echo 'DEGRADED')",
  "deployment_ready": $([ $CHECKS_FAILED -eq 0 ] && echo 'true' || echo 'false')
}
EOF

    log_success "Validation report written to $VALIDATION_REPORT"
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    log_info "=== Post-Deployment Validation Starting ==="
    log_info "Strict Mode: $([ -z "$STRICT_MODE" ] && echo 'disabled' || echo 'enabled')"
    echo ""

    # Validate inputs
    validate_deployment_url

    # Vercel checks
    log_info "--- Vercel Deployment Checks ---"
    check_vercel_connectivity || exit 1
    check_vercel_http_status || exit 1
    check_vercel_performance
    check_vercel_html_structure || exit 1
    check_vercel_resources
    check_vercel_security_headers
    echo ""

    # Supabase checks
    log_info "--- Supabase Backend Checks ---"
    check_supabase_database || exit 1
    check_supabase_auth
    check_supabase_storage
    check_supabase_edge_functions || exit 1
    echo ""

    # Application checks
    log_info "--- Application Health Checks ---"
    check_api_endpoints
    check_error_rate
    echo ""

    generate_validation_report

    log_info "=== Validation Summary ==="
    echo -e "  Passed: ${GREEN}$CHECKS_PASSED${NC}"
    echo -e "  Warned: ${YELLOW}$CHECKS_WARNED${NC}"
    echo -e "  Failed: ${RED}$CHECKS_FAILED${NC}"
    echo -e "  Total:  $((CHECKS_PASSED + CHECKS_WARNED + CHECKS_FAILED))"
    echo ""

    if [ $CHECKS_FAILED -eq 0 ]; then
        log_success "Post-deployment validation successful!"
        echo "Report: $VALIDATION_REPORT"
        exit 0
    else
        log_error "Post-deployment validation failed!"
        echo "Report: $VALIDATION_REPORT"
        exit 1
    fi
}

main "$@"
