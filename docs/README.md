# Documentation Index

This directory contains all development and detailed documentation for the Claude Secure Terminal extension.

## 📝 **DXT Architecture Note**

**Key Point**: This project follows DXT v0.1 specifications exactly:

- ✅ **No dependencies in source**: `server/node_modules` is NOT stored in the repository
- ✅ **Build-time installation**: Dependencies are installed only during `./build.sh`
- ✅ **Clean source tree**: Only source code and configuration files are tracked
- ✅ **Build artifacts**: Dependencies exist only in the `build/` output

This ensures a clean development environment and follows DXT best practices.

## 📦 Available Documentation

### Development Documentation
- **[PROJECT_RULES.md](PROJECT_RULES.md)** - Development guidelines, file management rules, and coding standards
- **[CHANGELOG.md](CHANGELOG.md)** - Complete version history and change documentation

### Installation & Troubleshooting
- **[INSTALLATION_FIX.md](INSTALLATION_FIX.md)** - Detailed troubleshooting for installation issues

## 🔄 Documentation Guidelines

### For Users
- See the main [README.md](../README.md) in the root directory for quick start and basic usage
- Refer to this docs/ directory for detailed technical information

### For Developers
- Always follow [PROJECT_RULES.md](PROJECT_RULES.md) when making changes
- Document all changes in [CHANGELOG.md](CHANGELOG.md)
- Use the unified `./build.sh` script for building

### For Troubleshooting
- Start with the main README troubleshooting section
- Use [INSTALLATION_FIX.md](INSTALLATION_FIX.md) for installation-specific issues
- Use `./build.sh --help` for build options

## 📁 Documentation Structure

```
docs/
├── README.md              # This file - documentation index
├── PROJECT_RULES.md       # Development guidelines and rules
├── CHANGELOG.md           # Complete change history
└── INSTALLATION_FIX.md    # Installation troubleshooting
```

## 🛠️ Related Directories

- **`server/`** - MCP server implementation
- **`assets/`** - Extension assets and resources
- **`build/`** - Generated build artifacts (created by build.sh)
- **`deprecated/`** - Legacy scripts (safe to delete manually)

---

This documentation follows the project's commitment to clear separation of concerns and maintains the DXT v0.1 specification compliance.
