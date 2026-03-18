/**
 * Active Directory Create Group Action
 *
 * Creates a new group in on-premise Active Directory using LDAP/LDAPS.
 * Supports security and distribution groups with global, domain local,
 * and universal scopes.
 */

import { Client } from 'ldapts';
import { getBaseURL } from '@sgnl-actions/utils';

/** Required object classes for AD groups */
const AD_GROUP_OBJECT_CLASS = ['top', 'group'];

/**
 * Group type constants (combination of type and scope).
 * Security groups have negative values (high bit set), distribution groups have positive.
 * These values are bitmasks defined by Active Directory.
 */
const GROUP_TYPES = {
  // Security groups (ADS_GROUP_TYPE_SECURITY_ENABLED = 0x80000000)
  SECURITY_GLOBAL: -2147483646,       // 0x80000002
  SECURITY_DOMAIN_LOCAL: -2147483644, // 0x80000004
  SECURITY_UNIVERSAL: -2147483640,    // 0x80000008
  // Distribution groups
  DISTRIBUTION_GLOBAL: 2,             // 0x00000002
  DISTRIBUTION_DOMAIN_LOCAL: 4,       // 0x00000004
  DISTRIBUTION_UNIVERSAL: 8           // 0x00000008
};

/**
 * Extract the Common Name (CN) from a Distinguished Name.
 * @param {string} dn - The Distinguished Name (e.g., "CN=My Group,OU=Groups,DC=example,DC=com")
 * @returns {string} The CN value
 * @throws {Error} If DN doesn't start with CN=
 */
function extractCN(dn) {
  const match = dn.match(/^CN=((?:[^\\,]|\\.)+)/i);
  if (!match) {
    throw new Error('groupDN must start with CN= (e.g., CN=My Group,OU=Groups,DC=example,DC=com)');
  }
  // Unescape DN escape sequences to get the raw CN value
  return match[1].replace(/\\(.)/g, '$1');
}

/**
 * Get the numeric group type value for AD based on type and scope.
 * @param {string} groupType - 'security' or 'distribution'
 * @param {string} groupScope - 'global', 'domain_local', or 'universal'
 * @returns {number} The AD groupType attribute value
 */
function getGroupType(groupType, groupScope) {
  const type = (groupType || 'security').toLowerCase();
  const scope = (groupScope || 'global').toLowerCase();

  // Build lookup key (e.g., "SECURITY_GLOBAL", "DISTRIBUTION_DOMAIN_LOCAL")
  const key = `${type.toUpperCase()}_${scope.toUpperCase().replace('-', '_').replace(' ', '_')}`;

  if (GROUP_TYPES[key] !== undefined) {
    return GROUP_TYPES[key];
  }

  // Fallback to security global for unknown combinations
  console.warn(`Unknown group type/scope combination: ${groupType}/${groupScope}, defaulting to security global`);
  return GROUP_TYPES.SECURITY_GLOBAL;
}

/**
 * Safely disconnect from LDAP server.
 * Errors during unbind are logged but not thrown to avoid masking original errors.
 * @param {Client} client - The ldapts client
 */
async function safeUnbind(client) {
  if (!client) {
    return;
  }
  try {
    await client.unbind();
  } catch (unbindError) {
    console.warn(`Warning: Error during LDAP unbind: ${unbindError.message}`);
  }
}

export default {
  /**
   * Main execution handler - creates a group in on-premise Active Directory.
   *
   * @param {Object} params - Job input parameters
   * @param {string} params.groupDN - Distinguished Name for the new group
   * @param {string} params.samAccountName - SAM account name (pre-Windows 2000 name)
   * @param {string} [params.description] - Group description
   * @param {string} [params.groupType] - 'security' or 'distribution' (default: 'security')
   * @param {string} [params.groupScope] - 'global', 'domain_local', or 'universal' (default: 'global')
   * @param {string} [params.managedBy] - DN of the user/group that manages this group
   * @param {Object} [params.additionalAttributes] - Additional LDAP attributes to set
   * @param {boolean} [params.dry_run] - If true, validate without making changes
   * @param {boolean} [params.successIfAlreadyExists] - If true, return success when group already exists
   * @param {Object} context - Execution context with environment and secrets
   * @returns {Object} Job results including status, groupDN, and created flag
   */
  invoke: async (params, context) => {
    console.log('Starting Active Directory create group operation');

    const { groupDN, dry_run = false, successIfAlreadyExists = false } = params;

    // Validate required parameters
    if (!groupDN) {
      throw new Error('groupDN is required');
    }
    if (!params.samAccountName) {
      throw new Error('samAccountName is required to create an AD group');
    }

    // Extract CN from DN and compute group type
    const cn = extractCN(groupDN);
    const groupTypeValue = getGroupType(params.groupType, params.groupScope);

    console.log(`Preparing to create group: ${cn}`);
    console.log(`Group type: ${params.groupType || 'security'}, scope: ${params.groupScope || 'global'}`);

    // Build the LDAP entry with required and optional attributes
    const entry = {
      objectClass: AD_GROUP_OBJECT_CLASS,
      cn,
      sAMAccountName: params.samAccountName,
      groupType: groupTypeValue.toString(),
      ...(params.description && { description: params.description }),
      ...(params.managedBy && { managedBy: params.managedBy }),
      ...(params.additionalAttributes || {})
    };

    // Track user-supplied attributes for response
    const userAttributes = ['sAMAccountName'];
    if (params.description) userAttributes.push('description');
    if (params.managedBy) userAttributes.push('managedBy');
    if (params.additionalAttributes) {
      userAttributes.push(...Object.keys(params.additionalAttributes));
    }

    // Handle dry run - validate and return without making changes
    if (dry_run) {
      console.log('DRY RUN: No changes will be made to Active Directory');
      console.log(`Would create group at: ${groupDN}`);
      console.log(`With attributes: ${userAttributes.join(', ')}`);
      return {
        status: 'dry_run_completed',
        groupDN,
        created: false,
        attributes: userAttributes,
        groupType: params.groupType || 'security',
        groupScope: params.groupScope || 'global'
      };
    }

    // Get LDAP connection details
    const address = getBaseURL(params, context);
    const bindDN = context.secrets.BASIC_USERNAME;
    const bindPassword = context.secrets.BASIC_PASSWORD;

    // Validate required secrets
    if (!bindDN) {
      throw new Error('BASIC_USERNAME secret is required');
    }
    if (!bindPassword) {
      throw new Error('BASIC_PASSWORD secret is required');
    }

    // Configure LDAP client with timeouts
    const clientOptions = {
      url: address,
      timeout: 10000,
      connectTimeout: 10000
    };

    // Configure TLS options for secure connections
    // Only apply TLS options to ldaps:// (encrypted) connections
    // For ldap:// (plain text) connections, TLS options cause connection failures
    if (address.startsWith('ldaps://')) {
      clientOptions.tlsOptions = {
        rejectUnauthorized: context.environment?.TLS_SKIP_VERIFY !== 'true'
      };
    }

    const client = new Client(clientOptions);

    try {
      console.log(`Connecting to LDAP server at ${address}`);
      await client.bind(bindDN, bindPassword);
      console.log('Successfully authenticated to LDAP server');

      console.log(`Creating group: ${groupDN}`);
      await client.add(groupDN, entry);

      console.log(`Successfully created group: ${groupDN}`);
      return {
        status: 'success',
        groupDN,
        created: true,
        alreadyExisted: false,
        attributes: userAttributes,
        groupType: params.groupType || 'security',
        groupScope: params.groupScope || 'global',
        address
      };
    } catch (error) {
      // Check if this is an "already exists" error and we should treat it as success
      const errorMessage = error.message.toLowerCase();
      if (successIfAlreadyExists && (errorMessage.includes('already exists') || error.code === 68)) {
        console.log(`Group already exists at ${groupDN}, treating as success per successIfAlreadyExists flag`);
        return {
          status: 'success',
          groupDN,
          created: false,
          alreadyExisted: true,
          attributes: userAttributes,
          groupType: params.groupType || 'security',
          groupScope: params.groupScope || 'global',
          address
        };
      }
      console.error(`Failed to create group: ${error.message}`);
      throw error;
    } finally {
      await safeUnbind(client);
    }
  },

  /**
   * Error recovery handler - classifies errors and determines retry behavior.
   *
   * @param {Object} params - Original params plus error information
   * @param {Error} params.error - The error that occurred
   * @param {string} params.groupDN - The group DN that was being created
   * @param {Object} _context - Execution context (unused)
   * @throws {Error} Re-throws with appropriate classification
   */
  error: async (params, _context) => {
    const { error, groupDN } = params;
    console.error(`Error handler invoked for group ${groupDN}: ${error.message}`);

    const errorMessage = error.message.toLowerCase();

    // Authentication errors (fatal - don't retry)
    if (errorMessage.includes('invalid credentials') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('bind failed')) {
      console.error('Authentication failed - check BASIC_USERNAME and BASIC_PASSWORD');
      throw new Error(`LDAP authentication failed: ${error.message}`);
    }

    // Connection errors (retryable - framework will retry)
    if (errorMessage.includes('connection') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('econnrefused')) {
      console.error('Connection error - may be transient, framework will retry');
      throw error;
    }

    // Already exists (fatal - don't retry)
    if (errorMessage.includes('already exists') ||
        errorMessage.includes('entry_exists')) {
      console.error('Group already exists at this DN');
      throw new Error(`Group already exists: ${error.message}`);
    }

    // Constraint violations (fatal - don't retry)
    if (errorMessage.includes('constraint violation') ||
        errorMessage.includes('invalid syntax')) {
      console.error('Data validation error - check input parameters');
      throw new Error(`Invalid group data: ${error.message}`);
    }

    // Insufficient permissions (fatal - don't retry)
    if (errorMessage.includes('insufficient access') ||
        errorMessage.includes('permission denied')) {
      console.error('Insufficient permissions - check service account privileges');
      throw new Error(`Insufficient LDAP permissions: ${error.message}`);
    }

    // Unknown error - re-throw for framework retry
    console.error('Unknown error occurred, allowing framework to retry');
    throw error;
  },

  /**
   * Graceful shutdown handler - called when the job is halted.
   *
   * @param {Object} params - Original params plus halt reason
   * @param {string} params.reason - The reason for the halt
   * @param {string} [params.groupDN] - The group DN being processed
   * @param {Object} _context - Execution context (unused)
   * @returns {Object} Cleanup results with halted status
   */
  halt: async (params, _context) => {
    const { reason, groupDN } = params;
    console.log(`Active Directory create group operation halted: ${reason}`);

    return {
      status: 'halted',
      groupDN: groupDN || 'unknown',
      reason,
      halted_at: new Date().toISOString()
    };
  }
};
