#!/bin/bash

# ClawPanel Test Runner
# Usage: ./scripts/test.sh [backend|frontend|e2e|all]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

run_backend_tests() {
    log_info "Running backend tests in Docker..."
    
    docker compose -f docker-compose.test.yml down -v 2>/dev/null || true
    docker compose -f docker-compose.test.yml up backend-test --build --abort-on-container-exit
    
    EXIT_CODE=$?
    docker compose -f docker-compose.test.yml down -v 2>/dev/null || true
    
    if [ $EXIT_CODE -eq 0 ]; then
        log_success "Backend tests passed!"
    else
        log_error "Backend tests failed!"
        return 1
    fi
}

run_backend_coverage() {
    log_info "Running backend tests with coverage..."
    
    mkdir -p test-results
    docker compose -f docker-compose.test.yml down -v 2>/dev/null || true
    docker compose -f docker-compose.test.yml up backend-test-coverage --build --abort-on-container-exit
    
    EXIT_CODE=$?
    docker compose -f docker-compose.test.yml down -v 2>/dev/null || true
    
    if [ $EXIT_CODE -eq 0 ]; then
        log_success "Coverage report generated in test-results/"
    else
        log_error "Coverage tests failed!"
        return 1
    fi
}

run_frontend_build() {
    log_info "Building frontend..."
    
    cd frontend
    npm run build
    cd ..
    
    log_success "Frontend build successful!"
}

run_e2e_tests() {
    log_info "Running E2E tests..."
    
    # Check if services are running
    if ! curl -s http://localhost:3000/api/health > /dev/null; then
        log_info "Starting services..."
        docker compose up -d backend frontend nginx
        sleep 10
    fi
    
    # Run tests
    docker compose exec -T backend npm test 2>&1
    
    log_success "E2E tests completed!"
}

run_all_tests() {
    log_info "Running all tests..."
    
    run_backend_tests || return 1
    run_frontend_build || return 1
    
    log_success "All tests passed!"
}

# Main
cd "$(dirname "$0")/.."

case "${1:-all}" in
    backend)
        run_backend_tests
        ;;
    coverage)
        run_backend_coverage
        ;;
    frontend)
        run_frontend_build
        ;;
    e2e)
        run_e2e_tests
        ;;
    all)
        run_all_tests
        ;;
    *)
        echo "Usage: $0 [backend|coverage|frontend|e2e|all]"
        echo ""
        echo "Commands:"
        echo "  backend   - Run backend unit tests in Docker"
        echo "  coverage  - Run backend tests with coverage report"
        echo "  frontend  - Build frontend"
        echo "  e2e       - Run E2E tests against running services"
        echo "  all       - Run all tests (default)"
        exit 1
        ;;
esac
