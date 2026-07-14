# Active Directory Create Group Action

Create a new group in on-premise Active Directory via LDAP/LDAPS.

## Overview

This action creates a new group object in Active Directory using the LDAP `add` operation via the `ldapts` library. It automatically sets the required AD object classes (`top`, `group`), extracts the `cn` from the provided DN, and configures the group type bitmask from the `groupType` and `groupScope` parameters.

Supports security and distribution groups across global, domain local, and universal scopes, with optional description, manager, and additional LDAP attributes.

## Prerequisites

- Network access to an Active Directory Domain Controller (LDAP port 389 or LDAPS port 636)
- A service account with permission to **create group objects** in the target OU

## Configuration

### Authentication

| Secret | Description |
|--------|-------------|
| `BASIC_USERNAME` | Bind DN of the service account (e.g., `CN=svc-sgnl,OU=Service Accounts,DC=example,DC=com`) |
| `BASIC_PASSWORD` | Password for the service account |

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ADDRESS` | LDAP/LDAPS URL of the Domain Controller (e.g., `ldaps://dc.example.com:636`) | Required |

### Input Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `groupDN` | text | Yes | Distinguished Name for the new group | `CN=Engineering Team,OU=Groups,DC=corp,DC=example,DC=com` |
| `samAccountName` | text | Yes | SAM account name (pre-Windows 2000 name) | `engineering-team` |
| `description` | text | No | Group description | `Engineering department security group` |
| `groupType` | text | No | `security` or `distribution` (default: `security`) | `security` |
| `groupScope` | text | No | `global`, `domain_local`, or `universal` (default: `global`) | `global` |
| `managedBy` | text | No | DN of the user or group that manages this group | `CN=IT Manager,OU=Users,DC=corp,DC=example,DC=com` |
| `additionalAttributes` | object | No | Additional LDAP attributes to set | `{"mail": "engineering@example.com"}` |
| `dry_run` | boolean | No | Validate without making changes | `true` |
| `tlsSkipVerify` | boolean | No | Skip TLS certificate verification (use only for self-signed certificates) | `true` |
| `successIfAlreadyExists` | boolean | No | If `true`, return success when group already exists instead of throwing an error (default: `false`) | `true` |
| `address` | text | No | Optional LDAP server URL override | `ldaps://ad.corp.example.com:636` |

### Output

| Field | Type | Description |
|-------|------|-------------|
| `status` | text | Operation result (`success`, `halted`, `dry_run_completed`) |
| `groupDN` | text | Distinguished Name of the created group |
| `created` | boolean | Whether the group was created, `false` if it already existed |
| `alreadyExisted` | boolean | `true` if the group already existed (when `successIfAlreadyExists` is enabled) |
| `groupType` | text | Type of group created |
| `groupScope` | text | Scope of group created |
| `attributes` | array | List of attributes that were set |
| `address` | text | LDAP server address used |

## Usage Examples

### Basic Usage

```json
{
  "groupDN": "CN=Engineering Team,OU=Groups,DC=example,DC=com",
  "samAccountName": "engineering-team"
}
```

This creates a security group with global scope using the minimum required attributes. The `objectClass`, `cn`, and `groupType` bitmask are set automatically.

### Using Named Parameters

```json
{
  "groupDN": "CN=Engineering Team,OU=Groups,DC=example,DC=com",
  "samAccountName": "engineering-team",
  "description": "Engineering department security group",
  "groupType": "security",
  "groupScope": "global"
}
```

### Create a Distribution List

```json
{
  "groupDN": "CN=All Staff,OU=Distribution Lists,DC=example,DC=com",
  "samAccountName": "all-staff",
  "description": "Company-wide distribution list",
  "groupType": "distribution",
  "groupScope": "universal"
}
```

### Create a Group with Manager

```json
{
  "groupDN": "CN=IT Admins,OU=Groups,DC=example,DC=com",
  "samAccountName": "it-admins",
  "managedBy": "CN=IT Manager,OU=Users,DC=example,DC=com",
  "groupType": "security",
  "groupScope": "domain_local"
}
```

### Idempotent Creation (Success If Already Exists)

Use `successIfAlreadyExists: true` for idempotent operations where you want the action to succeed even if the group already exists:

```json
{
  "groupDN": "CN=Engineering Team,OU=Groups,DC=example,DC=com",
  "samAccountName": "engineering-team",
  "successIfAlreadyExists": true
}
```

When the group already exists and this flag is set, the response will include:
- `status: "success"`
- `created: false`
- `alreadyExisted: true`

### Full Job Specification

```json
{
  "id": "create-ad-group",
  "type": "nodejs-20",
  "script": {
    "repository": "github.com/sgnl-actions/ad-create-group",
    "version": "v1.0.0",
    "type": "nodejs"
  },
  "script_inputs": {
    "groupDN": "CN=Engineering Team,OU=Groups,DC=example,DC=com",
    "samAccountName": "engineering-team",
    "description": "Engineering department security group",
    "groupType": "security",
    "groupScope": "global"
  },
  "environment": {
    "ADDRESS": "ldaps://dc.example.com:636"
  }
}
```

### Skip TLS Verification

For development or self-signed certificate environments, add `tlsSkipVerify` to your script inputs:

```json
{
  "script_inputs": {
    "tlsSkipVerify": true
  }
}
```

## API Details

### LDAP Add Operation

This action uses the LDAP `add` operation to create a new directory entry. The entry is built as follows:

1. **objectClass** — automatically set to `['top', 'group']`
2. **cn** — extracted from the `groupDN` (e.g., `CN=Engineering Team,...` → `cn: "Engineering Team"`)
3. **sAMAccountName** — set from the `samAccountName` parameter
4. **groupType** — computed as an AD bitmask from the `groupType` and `groupScope` parameters
5. **User-supplied attributes** — from named parameters (`description`, `managedBy`) and the `additionalAttributes` object

### Group Type Bitmask Mapping

Active Directory groups are defined by a combination of type and scope, encoded as a bitmask integer:

| groupType | groupScope | AD Bitmask Value |
|-----------|------------|-----------------|
| `security` | `global` | `-2147483646` |
| `security` | `domain_local` | `-2147483644` |
| `security` | `universal` | `-2147483640` |
| `distribution` | `global` | `2` |
| `distribution` | `domain_local` | `4` |
| `distribution` | `universal` | `8` |

**Group Types:**
- **Security** — can be used for access control (permissions, security policies)
- **Distribution** — used only for email distribution lists

**Group Scopes:**
- **Global** — can contain members from the same domain, can be used in any domain
- **Domain Local** — can contain members from any domain, used only in the local domain
- **Universal** — can contain members from any domain, can be used in any domain (requires Global Catalog)

## Error Handling

### Success Scenarios

- **Group created** — returns `status: "success"`, `created: true`, `alreadyExisted: false`
- **Group already exists (with `successIfAlreadyExists: true`)** — returns `status: "success"`, `created: false`, `alreadyExisted: true`

### Retryable Errors

| Error | Description |
|-------|-------------|
| Network timeout | Domain Controller unreachable |
| Connection refused | LDAP service not running |
| Server busy | DC under heavy load |

### Fatal Errors

| LDAP Code | Error | Description |
|-----------|-------|-------------|
| 68 | Entry Already Exists | A group with the same DN already exists in AD (use `successIfAlreadyExists: true` to treat as success) |
| 19 | Constraint Violation | Attribute value violates AD schema constraints |
| 49 | Invalid Credentials | Bind DN or password is incorrect |
| 50 | Insufficient Access Rights | Service account lacks permission to create groups |
| 34 | Invalid DN Syntax | Malformed Distinguished Name |

## Security Considerations

- Use LDAPS (port 636) in production to encrypt credentials and data in transit
- Only set \`tlsSkipVerify: true\` in development environments
- The service account should have minimal permissions — only the ability to create group objects in the target OU
- Attribute values are not logged; only attribute names appear in the output to avoid leaking sensitive data

## Development

### Setup

```bash
npm install
```

### Run tests

```bash
npm test
```

### Run tests in watch mode

```bash
npm run test:watch
```

### Build

```bash
npm run build
```

### Validate metadata

```bash
npm run validate
```

### Lint

```bash
npm run lint
npm run lint:fix
```

### Local testing

Copy the sample environment file and configure with your AD credentials:

```bash
cp .env.sample .env
```

Then edit `.env` with your actual values:

```
ADDRESS=ldap://your-dc.example.com:389
BASIC_USERNAME=CN=admin,DC=example,DC=com
BASIC_PASSWORD=your-password
TLS_SKIP_VERIFY=false  # Used as tlsSkipVerify input parameter

# Test parameters for ad-create-group
GROUP_DN=CN=Engineering Team,OU=Groups,DC=corp,DC=example,DC=com
SAM_ACCOUNT_NAME=engineering-team
DESCRIPTION=A test security group created by ad-create-group action
GROUP_TYPE=security
GROUP_SCOPE=global
SUCCESS_IF_ALREADY_EXISTS=true
DRY_RUN=false
```

Then run:

```bash
npm run dev
```

## Troubleshooting

### Connection Issues

- Verify the Domain Controller is reachable: `telnet dc.example.com 636`
- Check that the `ADDRESS` environment variable includes the protocol and port: `ldaps://dc.example.com:636`
- For LDAPS, ensure the DC's certificate is trusted or set `tlsSkipVerify: true` in inputs for testing

### Authentication Failures

- Verify the bind DN format matches your AD structure
- Ensure the service account password has not expired
- Check that the service account is not locked out

### Permission Errors

- The service account needs permission to create group objects in the target OU
- Use AD delegation to grant the "Create Group objects" permission on the target OU

### Entry Already Exists (LDAP Code 68)

- A group with the same DN already exists — use a different DN or delete the existing group first
- Use `successIfAlreadyExists: true` for idempotent operations

### Attribute Errors

- Verify attribute names match the AD schema (LDAP names, not display names)
- Check that attribute values conform to the schema's syntax rules
- For multi-valued attributes, pass an array of values

## Support

- [ldapts Documentation](https://github.com/ldapts/ldapts)
- [Active Directory LDAP Reference](https://docs.microsoft.com/en-us/windows/win32/ad/active-directory-domain-services)
- [SGNL Actions Documentation](https://github.com/sgnl-actions)
