import { jest } from '@jest/globals';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { parse } from 'yaml';

// Create custom LDAP mocks that include 'add' operation support
const mockBind = jest.fn();
const mockUnbind = jest.fn();
const mockModify = jest.fn();
const mockSearch = jest.fn();
const mockAdd = jest.fn();  // Add support for 'add' operations

// Mock ldapts module with complete implementation including 'add'
jest.unstable_mockModule('ldapts', () => ({
  Client: jest.fn().mockImplementation(() => ({
    bind: mockBind,
    unbind: mockUnbind,
    modify: mockModify,
    search: mockSearch,
    add: mockAdd  // Include the missing 'add' method
  })),
  Change: jest.fn().mockImplementation((opts) => ({
    operation: opts.operation,
    modification: opts.modification
  })),
  Attribute: jest.fn().mockImplementation((opts) => ({
    type: opts.type,
    values: opts.values
  }))
}));

// Import the script after mocking
const { default: script } = await import('../src/script.mjs');

// Parse scenarios manually since we need custom add operation support
const scenariosPath = resolve('./tests/scenarios.yaml');
const scenariosContent = readFileSync(scenariosPath, 'utf8');
const data = parse(scenariosContent);

function parseLDAPFixture(fixturePath) {
  const fullPath = resolve('./tests', fixturePath);
  const content = readFileSync(fullPath, 'utf8');
  return parse(content);
}

function setupScenarioMocks(resolvedSteps) {
  const operationCounters = { bind: 0, search: 0, modify: 0, unbind: 0, add: 0 };

  function getStepForOperation(operation) {
    let currentCounter = 0;
    for (const step of resolvedSteps) {
      if (step.ldap && step.ldap.operation === operation) {
        if (currentCounter === operationCounters[operation]) {
          operationCounters[operation]++;
          return step;
        }
        currentCounter++;
      }
    }
    return null;
  }

  mockBind.mockImplementation(() => {
    const step = getStepForOperation('bind');
    if (step && step.fixtureData) {
      if (step.fixtureData.result === 'error') {
        const error = new Error(step.fixtureData.message);
        error.code = step.fixtureData.code;
        throw error;
      }
    }
    return Promise.resolve();
  });

  mockSearch.mockImplementation(() => {
    const step = getStepForOperation('search');
    if (step && step.fixtureData) {
      if (step.fixtureData.result === 'error') {
        const error = new Error(step.fixtureData.message);
        error.code = step.fixtureData.code;
        throw error;
      }
      return Promise.resolve({ searchEntries: step.fixtureData.searchEntries || [] });
    }
    return Promise.resolve({ searchEntries: [] });
  });

  mockModify.mockImplementation(() => {
    const step = getStepForOperation('modify');
    if (step && step.fixtureData) {
      if (step.fixtureData.result === 'error') {
        const error = new Error(step.fixtureData.message);
        error.code = step.fixtureData.code;
        throw error;
      }
    }
    return Promise.resolve();
  });

  // Add support for 'add' operations
  mockAdd.mockImplementation(() => {
    const step = getStepForOperation('add');
    if (step && step.fixtureData) {
      if (step.fixtureData.result === 'error') {
        const error = new Error(step.fixtureData.message);
        error.code = step.fixtureData.code;
        throw error;
      }
    }
    return Promise.resolve();
  });

  mockUnbind.mockImplementation(() => {
    const step = getStepForOperation('unbind');
    if (step && step.fixtureData) {
      if (step.fixtureData.result === 'error') {
        const error = new Error(step.fixtureData.message);
        error.code = step.fixtureData.code;
        throw error;
      }
    }
    return Promise.resolve();
  });
}

describe(`LDAP scenarios: ${data.scenarios.length} defined`, () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.console.log = jest.fn();
    global.console.error = jest.fn();
    global.console.warn = jest.fn();
  });

  for (const scenario of data.scenarios) {
    test(scenario.name, async () => {
      const action = data.action || {};
      const params = { ...action.params, ...(scenario.params || {}) };

      const actionContext = action.context || {};
      const scenarioContext = scenario.context || {};
      const context = {
        ...actionContext,
        ...scenarioContext,
        secrets: { ...(actionContext.secrets || {}), ...(scenarioContext.secrets || {}) },
        environment: { ...(actionContext.environment || {}), ...(scenarioContext.environment || {}) }
      };

      // Resolve LDAP fixtures for each step
      const resolvedSteps = scenario.steps.map(step => {
        if (!step.ldap || !step.fixture) {
          return step;
        }
        const fixtureData = parseLDAPFixture(step.fixture);
        return { ...step, fixtureData };
      });

      setupScenarioMocks(resolvedSteps);

      if (scenario.invoke.throws) {
        await expect(script.invoke(params, context))
          .rejects.toThrow(scenario.invoke.throws);
      } else {
        const result = await script.invoke(params, context);

        if (scenario.invoke.returns) {
          Object.keys(scenario.invoke.returns).forEach(key => {
            expect(result[key]).toEqual(scenario.invoke.returns[key]);
          });
        }
      }
    });
  }
});
