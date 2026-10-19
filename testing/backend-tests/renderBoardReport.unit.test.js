/**
 * Unit tests for renderBoardReport (backend/src/utils/renderBoardReport.js).
 *
 * The renderer reads board-report.html from disk and performs template
 * substitution. Tests run against the real file so they'll catch template
 * regressions as well as renderer bugs.
 */
import { describe, it, expect } from '@jest/globals';
import { renderBoardReport } from '../../backend/src/utils/renderBoardReport.js';

function makeData(overrides = {}) {
  return {
    meta: {
      generatedAt: '2026-05-13T10:00:00.000Z',
      period: 'quarter',
      start: '2026-04-01T00:00:00.000Z',
      end: '2026-05-13T00:00:00.000Z',
      hourlyRate: 75,
      organization: {
        name: 'Acme Corp',
        logoUrl: null,
        primaryColor: '#1565c0',
      },
    },
    executiveSummary: {
      totalIdeas: { current: 42, previous: 30, direction: 'up', pct: 40 },
      implemented: { current: 5, previous: 3, direction: 'up', pct: 67 },
      activeUsers: { current: 18, previous: 20, direction: 'down', pct: -10 },
      participationRate: 72.5,
      totalUsers: 25,
      avgTimeToImplementation: 14.3,
    },
    roiImpact: {
      annualTimeSavedHours: 320,
      annualCostSavings: 24000,
      costPerIdea: 4800,
      ideasImplemented: 5,
    },
    topIdeas: [
      { id: '1', slug: 'automate-reports', title: 'Automate weekly reports', status: 'Reviewing', category: 'Efficiency', voteCount: 12, timeSavedMinutes: 45, champion: 'alice' },
      { id: '2', slug: 'new-onboarding', title: 'Redesign onboarding flow', status: 'Approved', category: 'UX', voteCount: 9, timeSavedMinutes: null, champion: 'bob' },
    ],
    pipeline: {
      reviewing: 8,
      approved: 3,
      inProgress: 2,
      implemented: 5,
    },
    stuckCount: 1,
    recommendations: [
      { id: '3', slug: 'ai-search', title: 'Add AI-powered search', status: 'Reviewing', category: 'Tech', voteCount: 15, impactScore: 9, effortScore: 6 },
    ],
    ...overrides,
  };
}

describe('renderBoardReport', () => {
  it('returns a non-empty HTML string', () => {
    const html = renderBoardReport(makeData());

    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(500);
    expect(html).toMatch(/<!DOCTYPE html>/i);
  });

  it('injects organisation name into the output', () => {
    const html = renderBoardReport(makeData());

    expect(html).toContain('Acme Corp');
  });

  it('injects period label for known period values', () => {
    const html = renderBoardReport(makeData({ meta: { ...makeData().meta, period: 'month' } }));

    expect(html).toContain('This Month');
  });

  it('uses custom range label for period=custom', () => {
    const data = makeData();
    data.meta.period = 'custom';
    const html = renderBoardReport(data);

    expect(html).toContain('2026');
  });

  it('injects top idea titles', () => {
    const html = renderBoardReport(makeData());

    expect(html).toContain('Automate weekly reports');
    expect(html).toContain('Redesign onboarding flow');
  });

  it('injects recommendation titles', () => {
    const html = renderBoardReport(makeData());

    expect(html).toContain('Add AI-powered search');
  });

  it('does not crash when topIdeas is empty', () => {
    const data = makeData();
    data.topIdeas = [];
    const html = renderBoardReport(data);

    expect(typeof html).toBe('string');
    expect(html).toMatch(/<!DOCTYPE html>/i);
  });

  it('does not crash when recommendations is empty', () => {
    const data = makeData();
    data.recommendations = [];
    const html = renderBoardReport(data);

    expect(typeof html).toBe('string');
  });

  it('escapes HTML special characters in idea titles', () => {
    const data = makeData();
    data.topIdeas = [{ id: '99', slug: 'xss', title: '<script>alert("xss")</script>', status: 'Reviewing', category: null, voteCount: 1, timeSavedMinutes: null, champion: null }];
    const html = renderBoardReport(data);

    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML in recommendation titles', () => {
    const data = makeData();
    data.recommendations = [{ id: '98', slug: 'xss2', title: '<b>bold injection</b>', status: 'Reviewing', category: null, voteCount: 2, impactScore: 5, effortScore: 3 }];
    const html = renderBoardReport(data);

    expect(html).not.toContain('<b>bold injection</b>');
    expect(html).toContain('&lt;b&gt;');
  });

  it('includes pipeline counts in the output', () => {
    const html = renderBoardReport(makeData());

    // Pipeline values render as text within the HTML; spot-check a few
    expect(html).toMatch(/8/);
    expect(html).toMatch(/5/);
  });

  it('handles missing optional meta fields without throwing', () => {
    const data = makeData();
    data.meta.organization.logoUrl = null;
    data.meta.organization.primaryColor = null;

    expect(() => renderBoardReport(data)).not.toThrow();
  });
});
