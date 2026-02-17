import { jest, describe, test, expect, beforeEach } from '@jest/globals';

const mockBind = jest.fn();
const mockUnbind = jest.fn();
const mockAdd = jest.fn();

jest.unstable_mockModule('ldapts', () => ({
  Client: jest.fn().mockImplementation(() => ({
    bind: mockBind,
    unbind: mockUnbind,
    add: mockAdd
  }))
}));

const mockGetBaseURL = jest.fn().mockReturnValue('ldaps://dc.example.com:636');

jest.unstable_mockModule('@sgnl-actions/utils', () => ({
  getBaseURL: mockGetBaseURL
}));

const { default: script } = await import('../src/script.mjs');
const { Client } = await import('ldapts');

describe('AD Create Group Script', () => {
  const mockContext = {
    environment: {
      ADDRESS: 'ldaps://dc.example.com:636'
    },
    secrets: {
      LDAP_BIND_DN: 'CN=admin,DC=example,DC=com',
      LDAP_BIND_PASSWORD: 'password123'
    },
    outputs: {}
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockBind.mockResolvedValue(undefined);
    mockUnbind.mockResolvedValue(undefined);
    mockAdd.mockResolvedValue(undefined);
    mockGetBaseURL.mockReturnValue('ldaps://dc.example.com:636');
  });

  describe('invoke handler', () => {
    test('should create group with required attributes', async () => {
      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        samAccountName: 'testgroup'
      };

      const result = await script.invoke(params, mockContext);

      expect(result.status).toBe('success');
      expect(result.groupDN).toBe('CN=Test Group,OU=Groups,DC=example,DC=com');
      expect(result.created).toBe(true);
      expect(result.groupType).toBe('security');
      expect(result.groupScope).toBe('global');
      expect(mockAdd).toHaveBeenCalledWith(
        'CN=Test Group,OU=Groups,DC=example,DC=com',
        expect.objectContaining({
          objectClass: ['top', 'group'],
          cn: 'Test Group',
          sAMAccountName: 'testgroup',
          groupType: '-2147483646'  // Security Global
        })
      );
    });

    test('should create group with description', async () => {
      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        samAccountName: 'testgroup',
        description: 'A test group'
      };

      const result = await script.invoke(params, mockContext);

      expect(result.status).toBe('success');
      expect(result.attributes).toContain('description');
      expect(mockAdd).toHaveBeenCalledWith(
        'CN=Test Group,OU=Groups,DC=example,DC=com',
        expect.objectContaining({
          description: 'A test group'
        })
      );
    });

    test('should create distribution group', async () => {
      const params = {
        groupDN: 'CN=Dist Group,OU=Groups,DC=example,DC=com',
        samAccountName: 'distgroup',
        groupType: 'distribution',
        groupScope: 'global'
      };

      const result = await script.invoke(params, mockContext);

      expect(result.status).toBe('success');
      expect(result.groupType).toBe('distribution');
      expect(mockAdd).toHaveBeenCalledWith(
        'CN=Dist Group,OU=Groups,DC=example,DC=com',
        expect.objectContaining({
          groupType: '2'  // Distribution Global
        })
      );
    });

    test('should create universal security group', async () => {
      const params = {
        groupDN: 'CN=Universal Group,OU=Groups,DC=example,DC=com',
        samAccountName: 'universalgroup',
        groupType: 'security',
        groupScope: 'universal'
      };

      const result = await script.invoke(params, mockContext);

      expect(result.status).toBe('success');
      expect(mockAdd).toHaveBeenCalledWith(
        'CN=Universal Group,OU=Groups,DC=example,DC=com',
        expect.objectContaining({
          groupType: '-2147483640'  // Security Universal
        })
      );
    });

    test('should create domain local security group', async () => {
      const params = {
        groupDN: 'CN=Local Group,OU=Groups,DC=example,DC=com',
        samAccountName: 'localgroup',
        groupType: 'security',
        groupScope: 'domain_local'
      };

      const result = await script.invoke(params, mockContext);

      expect(result.status).toBe('success');
      expect(mockAdd).toHaveBeenCalledWith(
        'CN=Local Group,OU=Groups,DC=example,DC=com',
        expect.objectContaining({
          groupType: '-2147483644'  // Security Domain Local
        })
      );
    });

    test('should throw when groupDN is missing', async () => {
      const params = {
        samAccountName: 'testgroup'
      };

      await expect(script.invoke(params, mockContext)).rejects.toThrow(
        'groupDN is required'
      );
      expect(mockBind).not.toHaveBeenCalled();
    });

    test('should throw when samAccountName is missing', async () => {
      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com'
      };

      await expect(script.invoke(params, mockContext)).rejects.toThrow(
        'samAccountName is required to create an AD group'
      );
      expect(mockBind).not.toHaveBeenCalled();
    });

    test('should throw if DN does not start with CN=', async () => {
      const params = {
        groupDN: 'OU=Groups,DC=example,DC=com',
        samAccountName: 'testgroup'
      };

      await expect(script.invoke(params, mockContext)).rejects.toThrow(
        'groupDN must start with CN='
      );
      expect(mockBind).not.toHaveBeenCalled();
    });

    test('should handle dry run', async () => {
      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        samAccountName: 'testgroup',
        dry_run: true
      };

      const result = await script.invoke(params, mockContext);

      expect(result.status).toBe('dry_run_completed');
      expect(result.created).toBe(false);
      expect(mockBind).not.toHaveBeenCalled();
      expect(mockAdd).not.toHaveBeenCalled();
    });

    test('should propagate LDAP error code 68 (entry already exists) by default', async () => {
      mockAdd.mockRejectedValue(
        Object.assign(new Error('Entry already exists'), { code: 68 })
      );

      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        samAccountName: 'testgroup'
      };

      await expect(script.invoke(params, mockContext)).rejects.toThrow('Entry already exists');
    });

    test('should return success with alreadyExisted=true when successIfAlreadyExists is true and group exists', async () => {
      mockAdd.mockRejectedValue(
        Object.assign(new Error('Entry already exists'), { code: 68 })
      );

      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        samAccountName: 'testgroup',
        successIfAlreadyExists: true
      };

      const result = await script.invoke(params, mockContext);

      expect(result.status).toBe('success');
      expect(result.created).toBe(false);
      expect(result.alreadyExisted).toBe(true);
      expect(result.groupDN).toBe('CN=Test Group,OU=Groups,DC=example,DC=com');
    });

    test('should set alreadyExisted=false when group is newly created', async () => {
      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        samAccountName: 'testgroup'
      };

      const result = await script.invoke(params, mockContext);

      expect(result.status).toBe('success');
      expect(result.created).toBe(true);
      expect(result.alreadyExisted).toBe(false);
    });

    test('should still throw other errors even when successIfAlreadyExists is true', async () => {
      mockAdd.mockRejectedValue(new Error('Insufficient access rights'));

      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        samAccountName: 'testgroup',
        successIfAlreadyExists: true
      };

      await expect(script.invoke(params, mockContext)).rejects.toThrow('Insufficient access rights');
    });

    test('should throw on missing LDAP_BIND_DN', async () => {
      const context = {
        ...mockContext,
        secrets: { ...mockContext.secrets, LDAP_BIND_DN: '' }
      };

      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        samAccountName: 'testgroup'
      };

      await expect(script.invoke(params, context)).rejects.toThrow('LDAP_BIND_DN secret is required');
    });

    test('should throw on missing LDAP_BIND_PASSWORD', async () => {
      const context = {
        ...mockContext,
        secrets: { ...mockContext.secrets, LDAP_BIND_PASSWORD: '' }
      };

      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        samAccountName: 'testgroup'
      };

      await expect(script.invoke(params, context)).rejects.toThrow('LDAP_BIND_PASSWORD secret is required');
    });

    test('should set rejectUnauthorized false when TLS_SKIP_VERIFY is true', async () => {
      const context = {
        ...mockContext,
        environment: { ...mockContext.environment, TLS_SKIP_VERIFY: 'true' }
      };

      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        samAccountName: 'testgroup'
      };

      await script.invoke(params, context);

      expect(Client).toHaveBeenCalledWith({
        url: 'ldaps://dc.example.com:636',
        timeout: 10000,
        connectTimeout: 10000,
        tlsOptions: { rejectUnauthorized: false }
      });
    });

    test('should set rejectUnauthorized to true for ldaps:// URLs when TLS_SKIP_VERIFY is not set', async () => {
      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        samAccountName: 'testgroup'
      };

      await script.invoke(params, mockContext);

      expect(Client).toHaveBeenCalledWith({
        url: 'ldaps://dc.example.com:636',
        timeout: 10000,
        connectTimeout: 10000,
        tlsOptions: { rejectUnauthorized: true }
      });
    });

    test('should not include tlsOptions for ldap:// URLs when TLS_SKIP_VERIFY is not set', async () => {
      mockGetBaseURL.mockReturnValue('ldap://dc.example.com:389');

      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        samAccountName: 'testgroup'
      };

      await script.invoke(params, mockContext);

      expect(Client).toHaveBeenCalledWith({
        url: 'ldap://dc.example.com:389',
        timeout: 10000,
        connectTimeout: 10000
      });
    });

    test('should include managedBy when provided', async () => {
      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        samAccountName: 'testgroup',
        managedBy: 'CN=Admin User,OU=Users,DC=example,DC=com'
      };

      const result = await script.invoke(params, mockContext);

      expect(result.attributes).toContain('managedBy');
      expect(mockAdd).toHaveBeenCalledWith(
        'CN=Test Group,OU=Groups,DC=example,DC=com',
        expect.objectContaining({
          managedBy: 'CN=Admin User,OU=Users,DC=example,DC=com'
        })
      );
    });

    test('should include additionalAttributes', async () => {
      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        samAccountName: 'testgroup',
        additionalAttributes: {
          mail: 'testgroup@example.com',
          info: 'Additional info'
        }
      };

      const result = await script.invoke(params, mockContext);

      expect(result.attributes).toContain('mail');
      expect(result.attributes).toContain('info');
      expect(mockAdd).toHaveBeenCalledWith(
        'CN=Test Group,OU=Groups,DC=example,DC=com',
        expect.objectContaining({
          mail: 'testgroup@example.com',
          info: 'Additional info'
        })
      );
    });

    test('should handle unbind errors gracefully', async () => {
      mockUnbind.mockRejectedValue(new Error('Unbind failed'));

      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        samAccountName: 'testgroup'
      };

      // Should still succeed even if unbind fails
      const result = await script.invoke(params, mockContext);

      expect(result.status).toBe('success');
      expect(mockUnbind).toHaveBeenCalled();
    });

    test('should not mask original error when unbind also fails', async () => {
      mockAdd.mockRejectedValue(new Error('Add operation failed'));
      mockUnbind.mockRejectedValue(new Error('Unbind failed'));

      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        samAccountName: 'testgroup'
      };

      // Should throw the original error, not the unbind error
      await expect(script.invoke(params, mockContext)).rejects.toThrow('Add operation failed');
    });
  });

  describe('special characters in attributes', () => {
    test('should handle dashes in group name (team - engineering)', async () => {
      const params = {
        groupDN: 'CN=team - engineering,OU=Groups,DC=example,DC=com',
        samAccountName: 'team-engineering'
      };

      const result = await script.invoke(params, mockContext);

      expect(result.status).toBe('success');
      expect(mockAdd).toHaveBeenCalledWith(
        'CN=team - engineering,OU=Groups,DC=example,DC=com',
        expect.objectContaining({
          cn: 'team - engineering'
        })
      );
    });

    test('should handle apostrophe in group description', async () => {
      const params = {
        groupDN: "CN=O'Brien Team,OU=Groups,DC=example,DC=com",
        samAccountName: 'obrien-team',
        description: "O'Brien's team for project management"
      };

      const result = await script.invoke(params, mockContext);

      expect(result.status).toBe('success');
      expect(mockAdd).toHaveBeenCalledWith(
        "CN=O'Brien Team,OU=Groups,DC=example,DC=com",
        expect.objectContaining({
          cn: "O'Brien Team",
          description: "O'Brien's team for project management"
        })
      );
    });

    test('should handle forward slash in group name', async () => {
      const params = {
        groupDN: 'CN=Sales/Marketing,OU=Groups,DC=example,DC=com',
        samAccountName: 'sales-marketing'
      };

      const result = await script.invoke(params, mockContext);

      expect(result.status).toBe('success');
      expect(mockAdd).toHaveBeenCalledWith(
        'CN=Sales/Marketing,OU=Groups,DC=example,DC=com',
        expect.objectContaining({
          cn: 'Sales/Marketing'
        })
      );
    });

    test('should extract CN with escaped comma in DN', async () => {
      const params = {
        groupDN: 'CN=Group\\, Special,OU=Groups,DC=example,DC=com',
        samAccountName: 'group-special'
      };

      const result = await script.invoke(params, mockContext);

      expect(result.status).toBe('success');
      expect(mockAdd).toHaveBeenCalledWith(
        'CN=Group\\, Special,OU=Groups,DC=example,DC=com',
        expect.objectContaining({
          cn: 'Group, Special'
        })
      );
    });
  });

  describe('error handler', () => {
    test('should wrap authentication errors', async () => {
      const error = new Error('Invalid credentials');
      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        error
      };

      await expect(script.error(params, mockContext)).rejects.toThrow('LDAP authentication failed');
    });

    test('should wrap permission errors', async () => {
      const error = new Error('Insufficient access rights');
      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        error
      };

      await expect(script.error(params, mockContext)).rejects.toThrow('Insufficient LDAP permissions');
    });

    test('should wrap already exists errors', async () => {
      const error = new Error('Entry already exists');
      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        error
      };

      await expect(script.error(params, mockContext)).rejects.toThrow('Group already exists');
    });

    test('should re-throw connection errors for retry', async () => {
      const error = new Error('Connection timeout');
      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        error
      };

      await expect(script.error(params, mockContext)).rejects.toThrow(error);
    });
  });

  describe('halt handler', () => {
    test('should return halted status with groupDN', async () => {
      const params = {
        groupDN: 'CN=Test Group,OU=Groups,DC=example,DC=com',
        reason: 'timeout'
      };

      const result = await script.halt(params, mockContext);

      expect(result.status).toBe('halted');
      expect(result.groupDN).toBe('CN=Test Group,OU=Groups,DC=example,DC=com');
      expect(result.reason).toBe('timeout');
      expect(result.halted_at).toBeDefined();
    });

    test('should handle halt without groupDN', async () => {
      const params = {
        reason: 'system_shutdown'
      };

      const result = await script.halt(params, mockContext);

      expect(result.status).toBe('halted');
      expect(result.groupDN).toBe('unknown');
      expect(result.reason).toBe('system_shutdown');
    });
  });
});
