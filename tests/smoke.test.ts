import { describe, expect, test } from '@jest/globals';
import { version } from '../src/index.js';

describe('package smoke test', () => {
  test('exports a semantic version', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
