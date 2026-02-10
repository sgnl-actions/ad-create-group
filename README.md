# AD Create Group

Create a new group in on-premise Active Directory via LDAP/LDAPS.

## Overview

This action creates groups in Active Directory with support for:
- Security and distribution groups
- Global, domain local, and universal scopes
- Custom descriptions and managers
- Additional LDAP attributes

## Inputs

| Name | Type | Required | Description | Example |
|------|------|----------|-------------|---------|
| `groupDN` | text | Yes | Distinguished Name for the new group | `CN=Engineering Team,OU=Groups,DC=corp,DC=example,DC=com` |
| `samAccountName` | text | Yes | SAM account name (pre-Windows 2000 name) | `engineering-team` |
| `description` | text | No | Group description | `Engineering department security group` |
| `groupType` | text | No | `security` or `distribution` (default: `security`) | `security` |
| `groupScope` | text | No | `global`, `domain_local`, or `universal` (default: `global`) | `global` |
| `managedBy` | text | No | DN of the user or group that manages this group | `CN=IT Manager,OU=Users,DC=corp,DC=example,DC=com` |
| `additionalAttributes` | object | No | Additional LDAP attributes to set | `{"mail": "engineering@example.com"}` |
| `dry_run` | boolean | No | Validate without making changes | `true` |
| `successIfAlreadyExists` | boolean | No | If `true`, return success when group already exists instead of throwing an error (default: `false`) | `true` |
| `address` | text | No | Optional LDAP server URL override | `ldaps://ad.corp.example.com:636` |

## Outputs

| Name | Type | Description |
|------|------|-------------|
| `status` | text | Operation result (`success`, `halted`, `dry_run_completed`) |
| `groupDN` | text | Distinguished Name of the created group |
| `created` | boolean | Whether the group was created, `false` if it already existed |
| `alreadyExisted` | boolean | `true` if the group already existed (when `successIfAlreadyExists` is enabled) |
| `groupType` | text | Type of group created |
| `groupScope` | text | Scope of group created |
| `attributes` | array | List of attributes that were set |
| `address` | text | LDAP server address used |

## Environment Variables

| Name | Required | Description |
|------|----------|-------------|
| `ADDRESS` | Yes | LDAP server URL (e.g., `ldap://dc.example.com:389`) |
| `TLS_SKIP_VERIFY` | No | Skip TLS certificate verification (`true`/`false`) |

## Secrets

| Name | Required | Description |
|------|----------|-------------|
| `LDAP_BIND_DN` | Yes | DN of the account to bind with |
| `LDAP_BIND_PASSWORD` | Yes | Password for the bind account |

## Group Types

Active Directory groups are defined by a combination of type and scope:

### Group Types
- **Security**: Can be used for access control (permissions, security policies)
- **Distribution**: Used only for email distribution lists

### Group Scopes
- **Global**: Can contain members from the same domain, can be used in any domain
- **Domain Local**: Can contain members from any domain, used only in the local domain
- **Universal**: Can contain members from any domain, can be used in any domain (requires Global Catalog)

## Examples

### Create a security group

```javascript
{
  groupDN: "CN=Engineering Team,OU=Groups,DC=example,DC=com",
  samAccountName: "engineering-team",
  description: "Engineering department security group",
  groupType: "security",
  groupScope: "global"
}
```

### Create a distribution list

```javascript
{
  groupDN: "CN=All Staff,OU=Distribution Lists,DC=example,DC=com",
  samAccountName: "all-staff",
  description: "Company-wide distribution list",
  groupType: "distribution",
  groupScope: "universal"
}
```

### Create a group with manager

```javascript
{
  groupDN: "CN=IT Admins,OU=Groups,DC=example,DC=com",
  samAccountName: "it-admins",
  managedBy: "CN=IT Manager,OU=Users,DC=example,DC=com",
  groupType: "security",
  groupScope: "domain_local"
}
```

### Idempotent creation (success if already exists)

Use `successIfAlreadyExists: true` for idempotent operations where you want the action to succeed even if the group already exists:

```javascript
{
  groupDN: "CN=Engineering Team,OU=Groups,DC=example,DC=com",
  samAccountName: "engineering-team",
  successIfAlreadyExists: true
}
```

When the group already exists and this flag is set, the response will include:
- `status: "success"`
- `created: false`
- `alreadyExisted: true`

## Error Handling

### Success Scenarios

- **Group created**: Returns `status: "success"`, `created: true`, `alreadyExisted: false`
- **Group already exists (with `successIfAlreadyExists: true`)**: Returns `status: "success"`, `created: false`, `alreadyExisted: true`

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

Create a `../.env` file with your AD credentials:

```
AD_ADDRESS=ldap://your-dc.example.com:389
LDAP_BIND_DN=CN=admin,DC=example,DC=com
LDAP_BIND_PASSWORD=your-password
TLS_SKIP_VERIFY=false
```

Then run:

```bash
npm run dev
```

## Troubleshooting

### Common Issues

1. **"Missing LDAP bind credentials"**
   - Ensure `LDAP_BIND_DN` and `LDAP_BIND_PASSWORD` are set in secrets
   - Verify the bind DN is a valid Distinguished Name

2. **"No URL specified"**
   - Ensure the `ADDRESS` environment variable is set or `address` is provided in params
   - Verify the URL format (e.g., `ldaps://ad.corp.example.com:636`)

3. **"Invalid credentials"**
   - Verify the service account DN and password are correct
   - Check that the account is not locked or expired in Active Directory

4. **"Insufficient access rights"**
   - Verify the service account has permission to create group objects in the target OU
   - Use AD delegation to grant the "Create Group objects" permission

5. **"Entry already exists"**
   - A group with the same DN already exists
   - Use `successIfAlreadyExists: true` for idempotent operations

6. **TLS/SSL connection errors**
   - Verify the LDAP server is accessible on the configured port
   - For LDAPS, ensure the server certificate is trusted or set `TLS_SKIP_VERIFY=true` for testing
   - Check that the correct port is used (389 for LDAP, 636 for LDAPS)

### Verifying Group Creation

To verify the action worked correctly, you can check the group using:

```bash
# Using ldapsearch
ldapsearch -H ldaps://ad.corp.example.com:636 \
  -D "CN=svc-sgnl,OU=Service Accounts,DC=corp,DC=example,DC=com" \
  -W -b "CN=Engineering Team,OU=Groups,DC=corp,DC=example,DC=com" \
  "(objectClass=group)" cn sAMAccountName groupType

# Using PowerShell
Get-ADGroup -Identity "Engineering Team" -Properties * | Select-Object Name, SamAccountName, GroupScope, GroupCategory
```

## Support

- [ldapts Documentation](https://github.com/ldapts/ldapts)
- [Active Directory LDAP Reference](https://docs.microsoft.com/en-us/windows/win32/ad/active-directory-domain-services)
- [SGNL Actions Documentation](https://github.com/sgnl-actions)

## License

MIT License - see [LICENSE](LICENSE) for details.
