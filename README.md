# AD Create Group

Create a new group in on-premise Active Directory via LDAP/LDAPS.

## Overview

This action creates groups in Active Directory with support for:
- Security and distribution groups
- Global, domain local, and universal scopes
- Custom descriptions and managers
- Additional LDAP attributes

## Inputs

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `groupDN` | text | Yes | Distinguished Name for the new group (e.g., `CN=My Group,OU=Groups,DC=example,DC=com`) |
| `samAccountName` | text | Yes | SAM account name (pre-Windows 2000 name) |
| `description` | text | No | Group description |
| `groupType` | text | No | `security` or `distribution` (default: `security`) |
| `groupScope` | text | No | `global`, `domain_local`, or `universal` (default: `global`) |
| `managedBy` | text | No | DN of the user or group that manages this group |
| `address` | text | No | Optional LDAP/LDAPS URL override |
| `additionalAttributes` | object | No | Additional LDAP attributes to set |
| `dry_run` | boolean | No | Validate without making changes |

## Outputs

| Name | Type | Description |
|------|------|-------------|
| `status` | text | Operation result (`success`, `halted`, `dry_run_completed`) |
| `groupDN` | text | Distinguished Name of the created group |
| `created` | boolean | Whether the group was created |
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

## Development

### Setup

```bash
npm install
```

### Run tests

```bash
npm test
```

### Build

```bash
npm run build
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

## License

MIT License - see [LICENSE](LICENSE) for details.
