# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **SGNL Action** that creates groups in on-premise Active Directory via LDAP/LDAPS. It runs on SGNL's CAEP Hub as a Node.js 20 job.

## Repository Structure

```
ad-create-group/
├── src/
│   └── script.mjs       # Main action implementation
├── tests/
│   └── script.test.js   # Jest unit tests
├── scripts/
│   ├── dev-runner.js    # Local development testing
│   └── validate-metadata.js
├── dist/                # Built output (committed for job service)
├── metadata.yaml        # Action inputs/outputs definition
├── package.json         # Dependencies and scripts
└── rollup.config.mjs    # Build configuration
```

## Common Commands

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build for production
npm run build

# Local development testing (requires ../.env with credentials)
npm run dev

# Validate metadata.yaml
npm run validate

# Lint code
npm run lint
```

## Key Implementation Details

### Group Type Values

Active Directory uses a bitmask for group types:

- **Security Global**: `-2147483646`
- **Security Domain Local**: `-2147483644`
- **Security Universal**: `-2147483640`
- **Distribution Global**: `2`
- **Distribution Domain Local**: `4`
- **Distribution Universal**: `8`

### Required LDAP Attributes for Groups

- `objectClass`: `['top', 'group']`
- `cn`: Common name (extracted from DN)
- `sAMAccountName`: Pre-Windows 2000 name
- `groupType`: Numeric value from above

### Environment Configuration

The action reads configuration from context:
- `context.environment.ADDRESS`: LDAP server URL
- `context.environment.TLS_SKIP_VERIFY`: Skip TLS verification
- `context.secrets.BASIC_USERNAME`: Bind account DN
- `context.secrets.BASIC_PASSWORD`: Bind account password

### Script Handlers

The script exports three handlers:
- `invoke`: Main execution - creates the group
- `error`: Error classification and recovery
- `halt`: Graceful shutdown handling

## Testing

Tests use Jest with ES module support. Mock the ldapts Client for unit tests:

```javascript
jest.unstable_mockModule('ldapts', () => ({
  Client: jest.fn().mockImplementation(() => ({
    bind: mockBind,
    unbind: mockUnbind,
    add: mockAdd
  }))
}));
```

## Important Notes

- The `dist/` directory must be committed (required by job service)
- Use `--env-file=../.env` for local development credentials
- LDAPS (port 636) is recommended for production
- Group DN must start with `CN=`
