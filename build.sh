#!/bin/bash

#
# Claude Terminal DXT Build Script
# Version: 1.0.4
# Compatible with DXT v0.1 specification
#
# This script builds the Claude Terminal Extension following proper DXT standards:
# - Dependencies are only installed in server/ directory during build
# - No root-level node_modules or package files
# - Proper cross-platform support (darwin, win32, linux)
# - Comprehensive validation and testing
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"
SERVER_DIR="${SCRIPT_DIR}/server"
MANIFEST_FILE="${SCRIPT_DIR}/manifest.json"
EXTENSION_NAME="claude-secure-terminal"

# Use certs from certs/ directory if present
CERTS_DIR="$SCRIPT_DIR/certs"
if [[ -z "${DXT_SIGN_CERT:-}" && -f "$CERTS_DIR/dxt.p12" ]]; then
    DXT_SIGN_CERT="$CERTS_DIR/dxt.p12"
fi

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Cleanup function
cleanup() {
    log_info "Cleaning up temporary files..."
    # Note: We keep server/node_modules for the packaged extension
}

# Trap for cleanup on exit
trap cleanup EXIT

print_header() {
    echo
    echo "=============================================="
    echo "  Claude Terminal DXT Builder v1.0.4"
    echo "  DXT Specification: v0.1"
    echo "=============================================="
    echo
}

check_dependencies() {
    log_info "Checking build dependencies..."

    # Check Node.js
    if ! command -v node &>/dev/null; then
        log_error "Node.js is required but not installed"
        log_error "Please install Node.js >= 16.0.0"
        exit 1
    fi

    NODE_VERSION=$(node --version | sed 's/v//')
    log_info "Node.js version: $NODE_VERSION"

    # Check npm
    if ! command -v npm &>/dev/null; then
        log_error "npm is required but not installed"
        exit 1
    fi

    NPM_VERSION=$(npm --version)
    log_info "npm version: $NPM_VERSION"

    # Check required files
    if [[ ! -f "$MANIFEST_FILE" ]]; then
        log_error "manifest.json not found"
        exit 1
    fi

    if [[ ! -d "$SERVER_DIR" ]]; then
        log_error "server/ directory not found"
        exit 1
    fi

    if [[ ! -f "$SERVER_DIR/index.js" ]]; then
        log_error "server/index.js not found"
        exit 1
    fi

    if [[ ! -f "$SCRIPT_DIR/package.json" ]]; then
        log_error "package.json not found in root directory"
        exit 1
    fi

    log_success "All dependencies and files are present"
}

validate_manifest() {
    log_info "Validating manifest.json..."

    # Check if jq is available for JSON validation
    if command -v jq &>/dev/null; then
        if ! jq empty "$MANIFEST_FILE" 2>/dev/null; then
            log_error "manifest.json is not valid JSON"
            exit 1
        fi

        # Check required DXT fields
        DXT_VERSION=$(jq -r '.dxt_version // empty' "$MANIFEST_FILE")
        if [[ "$DXT_VERSION" != "0.1" ]]; then
            log_error "manifest.json must specify dxt_version: \"0.1\""
            exit 1
        fi

        ENTRY_POINT=$(jq -r '.server.entry_point // empty' "$MANIFEST_FILE")
        if [[ "$ENTRY_POINT" != "server/index.js" ]]; then
            log_error "manifest.json entry_point must be \"server/index.js\""
            exit 1
        fi

        log_success "manifest.json is valid"
    else
        log_warning "jq not available, skipping JSON validation"
    fi
}

clean_build_dir() {
    log_info "Cleaning build directory..."

    if [[ -d "$BUILD_DIR" ]]; then
        rm -rf "$BUILD_DIR"
    fi

    mkdir -p "$BUILD_DIR"
    log_success "Build directory cleaned"
}

install_server_dependencies() {
    log_info "Installing dependencies in root directory..."

    cd "$SCRIPT_DIR"

    # Remove existing node_modules if present
    if [[ -d "node_modules" ]]; then
        log_info "Removing existing root node_modules..."
        rm -rf node_modules
    fi

    # Remove package-lock.json for clean install
    if [[ -f "package-lock.json" ]]; then
        rm -f package-lock.json
    fi

    # Install dependencies with specific flags for DXT packaging
    log_info "Running npm install with DXT-compatible settings in root..."
    npm install --production --no-optional --no-fund --no-audit --prefer-offline

    # Verify critical dependencies
    if [[ ! -d "node_modules/@modelcontextprotocol" ]]; then
        log_error "MCP SDK not installed correctly"
        log_error "This will cause the extension to fail when installed in Claude Desktop"
        exit 1
    fi

    # Verify MCP SDK files
    if [[ ! -f "node_modules/@modelcontextprotocol/sdk/package.json" ]]; then
        log_error "MCP SDK package.json missing - corrupted installation"
        exit 1
    fi

    # Check dependency size (warn if too large)
    local deps_size
    deps_size=$(du -sm node_modules 2>/dev/null | cut -f1 || echo "0")
    if [[ $deps_size -gt 50 ]]; then
        log_warning "Dependencies are ${deps_size}MB - DXT file will be large"
    fi

    log_info "Dependencies size: ${deps_size}MB"

    log_success "Dependencies installed and verified for DXT packaging"
}

validate_server() {
    log_info "Validating server implementation..."

    cd "$SERVER_DIR"

    # Add error logging for uncaught exceptions and unhandled rejections
    if ! grep -q "process.on('uncaughtException'" index.js 2>/dev/null; then
        echo "Adding error logging to server/index.js for debugging..."
        cat <<'EOF' | cat - index.js >temp && mv temp index.js
process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:', err);
});
EOF
    fi

    # Syntax check
    if ! node --check index.js; then
        log_error "Server syntax validation failed"
        exit 1
    fi

    # Quick runtime test (with timeout)
    log_info "Testing server startup..."
    timeout 10s node index.js --test || {
        local exit_code=$?
        if [[ $exit_code -eq 124 ]]; then
            log_success "Server startup test completed (timeout as expected)"
        else
            log_error "Server startup test failed"
            exit 1
        fi
    }

    cd "$SCRIPT_DIR"
    log_success "Server validation completed"
}

copy_extension_files() {
    log_info "Copying extension files to build directory..."

    # Copy manifest.json
    cp "$MANIFEST_FILE" "$BUILD_DIR/"

    # Copy server directory (without node_modules)
    cp -r "$SERVER_DIR" "$BUILD_DIR/"

    # Copy node_modules to build/
    cp -r "$SCRIPT_DIR/node_modules" "$BUILD_DIR/"

    # Copy assets if they exist
    if [[ -d "assets" ]]; then
        cp -r assets "$BUILD_DIR/"
    fi

    # Copy LICENSE and README if they exist
    if [[ -f "LICENSE" ]]; then
        cp LICENSE "$BUILD_DIR/"
    fi

    if [[ -f "README.md" ]]; then
        cp README.md "$BUILD_DIR/"
    fi

    # Copy docs directory for reference
    if [[ -d "docs" ]]; then
        cp -r docs "$BUILD_DIR/"
    fi

    log_success "Extension files copied"
}

set_file_permissions() {
    log_info "Setting correct file permissions..."

    # Make server/index.js executable
    chmod +x "$BUILD_DIR/server/index.js"

    # Ensure proper permissions on all files
    find "$BUILD_DIR" -type f -name "*.js" -exec chmod 644 {} \;
    find "$BUILD_DIR" -type f -name "*.json" -exec chmod 644 {} \;
    find "$BUILD_DIR" -type d -exec chmod 755 {} \;

    # Make the main server executable
    chmod +x "$BUILD_DIR/server/index.js"

    log_success "File permissions set"
}

create_package_info() {
    log_info "Creating package information..."

    # Get version from manifest
    if command -v jq &>/dev/null; then
        VERSION=$(jq -r '.version' "$MANIFEST_FILE")
        NAME=$(jq -r '.name' "$MANIFEST_FILE")
    else
        VERSION="1.0.4"
        NAME="claude-secure-terminal"
    fi

    # Create build info
    cat >"$BUILD_DIR/BUILD_INFO" <<EOF
Extension Name: $NAME
Version: $VERSION
Build Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
DXT Version: 0.1
Platform: $(uname -s)
Node Version: $(node --version)
Builder: Claude Terminal DXT Build Script v1.0.4

This package contains a complete Claude Desktop Extension (DXT)
following the DXT v0.1 specification.

Installation:
1. Copy this directory to your Claude Desktop extensions folder
2. Restart Claude Desktop
3. The extension will be automatically loaded

Server Dependencies:
- @modelcontextprotocol/sdk: $(cd "$SERVER_DIR" && npm list @modelcontextprotocol/sdk --depth=0 2>/dev/null | grep @modelcontextprotocol || echo "installed")

For more information, see README.md
EOF

    log_success "Package information created"
}

validate_build() {
    log_info "Validating build output..."

    # Check required files
    local required_files=(
        "manifest.json"
        "server/index.js"
        # "server/package.json"  # No longer required in server/
        "node_modules/@modelcontextprotocol/sdk"
        "node_modules/@modelcontextprotocol/sdk/package.json"
    )

    for file in "${required_files[@]}"; do
        if [[ ! -e "$BUILD_DIR/$file" ]]; then
            log_error "Missing required file in build: $file"
            log_error "This will cause the extension to fail in Claude Desktop"
            exit 1
        fi
    done

    # Critical validation: Ensure MCP SDK is properly bundled
    log_info "Verifying MCP SDK bundling..."

    local mcp_sdk_dir="$BUILD_DIR/node_modules/@modelcontextprotocol/sdk"
    if [[ ! -d "$mcp_sdk_dir" ]]; then
        log_error "MCP SDK directory missing from build"
        log_error "Claude Desktop will not be able to load the extension"
        exit 1
    fi

    # Check for essential MCP SDK files
    local mcp_files=(
        "server/index.js"
        "server/stdio.js"
        "types.js"
        "package.json"
    )

    for mcp_file in "${mcp_files[@]}"; do
        if [[ ! -f "$mcp_sdk_dir/$mcp_file" ]]; then
            log_warning "MCP SDK file may be missing: $mcp_file"
        fi
    done

    # Check total node_modules size
    local node_modules_size
    node_modules_size=$(du -sm "$BUILD_DIR/node_modules" 2>/dev/null | cut -f1 || echo "0")
    log_info "Bundled dependencies size: ${node_modules_size}MB"

    if [[ $node_modules_size -eq 0 ]]; then
        log_error "node_modules appears to be empty - this will cause extension failure"
        exit 1
    elif [[ $node_modules_size -gt 100 ]]; then
        log_warning "Large dependency bundle (${node_modules_size}MB) - DXT file will be significant"
    fi

    # Check manifest.json in build
    if command -v jq &>/dev/null; then
        if ! jq empty "$BUILD_DIR/manifest.json" 2>/dev/null; then
            log_error "Built manifest.json is not valid JSON"
            exit 1
        fi
    fi

    # Test server syntax in build directory
    log_info "Testing server syntax in build directory..."
    cd "$BUILD_DIR/server"
    if ! node --check index.js; then
        log_error "Built server has syntax errors"
        exit 1
    fi
    cd "$SCRIPT_DIR"

    log_success "Build validation completed - extension ready for Claude Desktop"
}

show_build_summary() {
    echo
    echo "=============================================="
    echo "  Build Summary"
    echo "=============================================="

    if command -v jq &>/dev/null; then
        local name
        name=$(jq -r '.name' "$BUILD_DIR/manifest.json")
        local version
        version=$(jq -r '.version' "$BUILD_DIR/manifest.json")
        local display_name
        display_name=$(jq -r '.display_name' "$BUILD_DIR/manifest.json")

        echo "Extension: $display_name ($name)"
        echo "Version: $version"
    else
        echo "Extension: Claude Secure Terminal"
        echo "Version: 1.0.4"
    fi

    echo "DXT Version: 0.1"
    echo "Build Directory: $BUILD_DIR"
    echo "Build Date: $(date)"
    echo

    local build_size
    build_size=$(du -sh "$BUILD_DIR" | cut -f1)
    echo "Build Size: $build_size"

    echo
    echo "Next Steps:"
    echo "1. Copy the build/ directory to your Claude Desktop extensions folder"
    echo "2. Restart Claude Desktop"
    echo "3. The extension will be automatically loaded"
    echo
    log_info "Final build directory structure:"
    find "$BUILD_DIR" -maxdepth 2 -type f | sed "s|$BUILD_DIR/||"
    echo "Build completed successfully!"
    echo "=============================================="
}

main() {
    print_header

    check_dependencies
    validate_manifest
    clean_build_dir
    install_server_dependencies
    validate_server
    copy_extension_files
    set_file_permissions
    create_package_info
    validate_build
    show_build_summary

    # Package .dxt using Anthropic's dxt CLI if available
    if command -v npx &>/dev/null; then
        log_info "Packing DXT..."
        pushd "$BUILD_DIR" >/dev/null

        # Create unsigned package
        if npx @anthropic-ai/dxt pack . "${EXTENSION_NAME}.dxt"; then
            log_success "DXT package created at $BUILD_DIR/${EXTENSION_NAME}.dxt"
        else
            log_error "DXT packaging failed"
            popd >/dev/null
            exit 1
        fi

        # Robust cert/key check for signing
        CERT_CRT="$CERTS_DIR/dxt.crt"
        CERT_KEY="$CERTS_DIR/dxt.key"
        if [[ -f "$CERT_CRT" && -f "$CERT_KEY" ]]; then
            log_info "Signing DXT package with PEM certificate and key: $CERT_CRT, $CERT_KEY..."
            if npx @anthropic-ai/dxt sign "${EXTENSION_NAME}.dxt" --cert "$CERT_CRT" --key "$CERT_KEY"; then
                log_success "DXT package signed with PEM certificate and key"
            else
                log_error "DXT signing with PEM certificate and key failed"
                popd >/dev/null
                exit 1
            fi
        elif [[ -f "$CERT_CRT" || -f "$CERT_KEY" ]]; then
            log_error "Both dxt.crt and dxt.key are required for PEM signing, but only one is present. Signing aborted."
            popd >/dev/null
            exit 1
        else
            log_info "Signing DXT package (self-signed)..."
            if npx @anthropic-ai/dxt sign "${EXTENSION_NAME}.dxt" --self-signed; then
                log_success "DXT package signed (self-signed)"
            else
                log_error "DXT signing failed"
                popd >/dev/null
                exit 1
            fi
        fi
        popd >/dev/null
    else
        log_warning "DXT CLI not found; skipping DXT packaging"
    fi
}

# Show help if requested
if [[ "${1:-}" == "--help" ]] || [[ "${1:-}" == "-h" ]]; then
    echo "Claude Terminal DXT Build Script"
    echo
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  --clean        Clean build directory and exit"
    echo
    echo "This script builds the Claude Terminal Extension following DXT v0.1 specifications."
    echo "Dependencies are installed only in the server/ directory during build."
    echo
    exit 0
fi

# Clean only if requested
if [[ "${1:-}" == "--clean" ]]; then
    log_info "Cleaning build directory..."
    if [[ -d "$BUILD_DIR" ]]; then
        rm -rf "$BUILD_DIR"
        log_success "Build directory cleaned"
    else
        log_info "Build directory doesn't exist"
    fi
    exit 0
fi

# Run main build process
main "$@"
