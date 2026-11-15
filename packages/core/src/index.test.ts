import { describe, expect, it } from 'vitest';
import * as core from './index';

describe('package entry', () => {
  it('exposes the public API', () => {
    for (const name of [
      'atLocal',
      'buildPlan',
      'milestoneProgress',
      'intensity',
      'classifyDay',
      'streak',
      'patternWarning',
      'project',
      'suggestStack',
      'r1Verdict',
      'dueRules',
      'snoozeDue',
    ]) {
      expect(typeof (core as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('does not export test fixtures', () => {
    expect('exercise' in core).toBe(false);
  });
});
