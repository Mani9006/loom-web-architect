#!/bin/bash

##############################################################################
# Deployment Metrics Tracker
# Purpose: Collects and tracks deployment reliability metrics
# Usage: ./scripts/deploy-metrics-tracker.sh [--duration 3600] [--interval 60]
# Output: deploy-metrics-TIMESTAMP.json
##############################################################################

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DEPLOYMENT_URL="${1:-https://resumepreps.com}"
TRACKING_DURATION="${2:-3600}"  # 1 hour default
POLLING_INTERVAL="${3:-60}"     # 60 seconds default
METRICS_FILE="deploy-metrics-$(date +%Y%m%d-%H%M%S).json"

# Metrics storage
declare -a RESPONSE_TIMES
declare -a HTTP_STATUS_CODES
declare -a TIMESTAMPS
TOTAL_REQUESTS=0
FAILED_REQUESTS=0
ERROR_MESSAGES=()

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# ============================================================================
# METRICS COLLECTION
# ============================================================================

collect_response_time() {
    local url="$1"

    local response_time=$(curl -s -o /dev/null -w "%{time_total}" "$url" 2>/dev/null || echo "-1")

    echo "$response_time"
}

collect_http_status() {
    local url="$1"

    local status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")

    echo "$status"
}

collect_error_rate() {
    local url="$1"

    # Try to detect errors in response
    local response=$(curl -s "$url" 2>/dev/null)

    if echo "$response" | grep -qi "error\|exception\|fatal\|500\|503"; then
        echo "1"  # Error detected
    else
        echo "0"  # No error
    fi
}

collect_database_latency() {
    local project_ref="${SUPABASE_PROJECT_REF:-woxtbyotydxorcdhhivr}"

    if [ -z "${SUPABASE_API_KEY:-}" ]; then
        echo "-1"  # Unknown
        return
    fi

    # Simple database query to measure latency
    local start_time=$(date +%s%N)

    curl -s -H "apikey: $SUPABASE_API_KEY" \
        "https://${project_ref}.supabase.co/rest/v1/profiles?select=count&limit=1" > /dev/null 2>&1

    local end_time=$(date +%s%N)
    local latency_ms=$(( (end_time - start_time) / 1000000 ))

    echo "$latency_ms"
}

collect_edge_function_latency() {
    local project_ref="${SUPABASE_PROJECT_REF:-woxtbyotydxorcdhhivr}"

    if [ -z "${SUPABASE_API_KEY:-}" ]; then
        echo "-1"  # Unknown
        return
    fi

    # Measure edge function response time
    local start_time=$(date +%s%N)

    curl -s -X POST \
        -H "Authorization: Bearer $SUPABASE_API_KEY" \
        "https://${project_ref}.functions.supabase.co/health" \
        --data '{}' > /dev/null 2>&1

    local end_time=$(date +%s%N)
    local latency_ms=$(( (end_time - start_time) / 1000000 ))

    echo "$latency_ms"
}

collect_metrics_snapshot() {
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    local response_time=$(collect_response_time "$DEPLOYMENT_URL")
    local http_status=$(collect_http_status "$DEPLOYMENT_URL")
    local error_rate=$(collect_error_rate "$DEPLOYMENT_URL")
    local db_latency=$(collect_database_latency)
    local ef_latency=$(collect_edge_function_latency)

    # Store metrics
    RESPONSE_TIMES+=("$response_time")
    HTTP_STATUS_CODES+=("$http_status")
    TIMESTAMPS+=("$timestamp")
    ((TOTAL_REQUESTS++))

    if [ "$http_status" != "200" ]; then
        ((FAILED_REQUESTS++))
        ERROR_MESSAGES+=("[$timestamp] HTTP $http_status")
    fi

    echo "{
    \"timestamp\": \"$timestamp\",
    \"response_time_s\": $response_time,
    \"http_status\": $http_status,
    \"error_detected\": $error_rate,
    \"database_latency_ms\": $db_latency,
    \"edge_function_latency_ms\": $ef_latency
  }"
}

# ============================================================================
# METRICS ANALYSIS
# ============================================================================

calculate_percentile() {
    local data=("$@")
    local percentile=95

    if [ ${#data[@]} -eq 0 ]; then
        echo "0"
        return
    fi

    # Sort and find 95th percentile
    local sorted=($(printf '%s\n' "${data[@]}" | grep -v '^-' | sort -n))

    if [ ${#sorted[@]} -eq 0 ]; then
        echo "0"
        return
    fi

    local index=$(( (${#sorted[@]} * percentile) / 100 ))
    echo "${sorted[$index]}"
}

calculate_average() {
    local data=("$@")

    if [ ${#data[@]} -eq 0 ]; then
        echo "0"
        return
    fi

    local sum=0
    local count=0

    for val in "${data[@]}"; do
        if [ "$val" != "-1" ]; then
            sum=$(echo "$sum + $val" | bc)
            ((count++))
        fi
    done

    if [ $count -eq 0 ]; then
        echo "0"
    else
        echo "scale=2; $sum / $count" | bc
    fi
}

calculate_max() {
    local data=("$@")

    if [ ${#data[@]} -eq 0 ]; then
        echo "0"
        return
    fi

    printf '%s\n' "${data[@]}" | grep -v '^-' | sort -n | tail -1
}

calculate_min() {
    local data=("$@")

    if [ ${#data[@]} -eq 0 ]; then
        echo "0"
        return
    fi

    printf '%s\n' "${data[@]}" | grep -v '^-' | sort -n | head -1
}

# ============================================================================
# MONITORING LOOP
# ============================================================================

monitor_deployment() {
    local end_time=$(($(date +%s) + TRACKING_DURATION))
    local snapshot_count=0

    log_info "Starting deployment metrics collection"
    log_info "Duration: $TRACKING_DURATION seconds"
    log_info "Interval: $POLLING_INTERVAL seconds"
    log_info "URL: $DEPLOYMENT_URL"
    echo ""

    # Create initial metrics file
    echo "[" > "$METRICS_FILE"

    while [ $(date +%s) -lt $end_time ]; do
        log_info "Collecting metrics snapshot #$((snapshot_count + 1))..."

        local snapshot=$(collect_metrics_snapshot)
        echo "$snapshot" >> "$METRICS_FILE"

        if [ $(date +%s) -lt $end_time ]; then
            echo "," >> "$METRICS_FILE"
        fi

        ((snapshot_count++))

        if [ $(date +%s) -lt $end_time ]; then
            sleep $POLLING_INTERVAL
        fi
    done

    # Close JSON array
    echo "]" >> "$METRICS_FILE"

    log_success "Metrics collection complete ($snapshot_count snapshots)"
}

# ============================================================================
# REPORT GENERATION
# ============================================================================

generate_metrics_report() {
    log_info "Generating metrics analysis report..."

    local avg_response_time=$(calculate_average "${RESPONSE_TIMES[@]}")
    local p95_response_time=$(calculate_percentile "${RESPONSE_TIMES[@]}")
    local max_response_time=$(calculate_max "${RESPONSE_TIMES[@]}")
    local min_response_time=$(calculate_min "${RESPONSE_TIMES[@]}")

    local success_rate=$(echo "scale=2; ($TOTAL_REQUESTS - $FAILED_REQUESTS) * 100 / $TOTAL_REQUESTS" | bc)

    cat > "deploy-metrics-report-$(date +%Y%m%d-%H%M%S).json" <<EOF
{
  "collection_period": {
    "start": "${TIMESTAMPS[0]}",
    "end": "${TIMESTAMPS[-1]}",
    "duration_seconds": $TRACKING_DURATION
  },
  "deployment_url": "$DEPLOYMENT_URL",
  "request_metrics": {
    "total_requests": $TOTAL_REQUESTS,
    "successful_requests": $((TOTAL_REQUESTS - FAILED_REQUESTS)),
    "failed_requests": $FAILED_REQUESTS,
    "success_rate_percent": $success_rate
  },
  "response_time_metrics_seconds": {
    "average": $avg_response_time,
    "p95": $p95_response_time,
    "max": $max_response_time,
    "min": $min_response_time,
    "slo_target": 3.0,
    "slo_compliant": $([ $(echo "$p95_response_time < 3.0" | bc -l) -eq 1 ] && echo 'true' || echo 'false')
  },
  "reliability_assessment": {
    "status": "$([ $success_rate == "100" ] && echo 'HEALTHY' || ([ $(echo "$success_rate > 99" | bc -l) -eq 1 ] && echo 'DEGRADED' || echo 'CRITICAL'))",
    "error_rate_percent": $(echo "scale=2; $FAILED_REQUESTS * 100 / $TOTAL_REQUESTS" | bc),
    "errors": $([ ${#ERROR_MESSAGES[@]} -gt 0 ] && echo "${ERROR_MESSAGES[@]}" | jq -R -s -c 'split("\n")[:-1]' || echo '[]')
  }
}
EOF

    log_success "Metrics report generated"
}

print_summary() {
    echo ""
    log_info "=== Deployment Metrics Summary ==="
    echo -e "  ${GREEN}Total Requests:${NC} $TOTAL_REQUESTS"
    echo -e "  ${GREEN}Successful:${NC} $((TOTAL_REQUESTS - FAILED_REQUESTS))"
    echo -e "  ${RED}Failed:${NC} $FAILED_REQUESTS"

    if [ ${#RESPONSE_TIMES[@]} -gt 0 ]; then
        local avg=$(calculate_average "${RESPONSE_TIMES[@]}")
        local p95=$(calculate_percentile "${RESPONSE_TIMES[@]}")
        echo -e "  ${GREEN}Response Time (avg):${NC} ${avg}s"
        echo -e "  ${GREEN}Response Time (p95):${NC} ${p95}s (SLO: 3.0s)"
    fi

    echo ""
    log_success "Raw metrics saved to: $METRICS_FILE"
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
    log_info "=== Deployment Metrics Tracker Starting ==="
    echo ""

    monitor_deployment
    generate_metrics_report
    print_summary

    log_info "Metrics collection complete"
}

main "$@"
