/**
 * ROI Calculator Utility
 * Phase 1 - Advanced Analytics (#451)
 *
 * Calculates Return on Investment for ideas based on:
 * - Time saved
 * - Frequency of occurrence
 * - Implementation cost
 * - Labor cost (hourly rate)
 */

/**
 * Convert frequency to annual occurrences
 * @param {number} frequencyCount - How many times per period
 * @param {string} frequencyPeriod - 'day', 'week', 'month', 'year'
 * @returns {number} Annual occurrences
 */
export function convertToAnnualOccurrences(frequencyCount, frequencyPeriod) {
  if (!frequencyCount || !frequencyPeriod) return 0;

  const multipliers = {
    day: 365,
    week: 52,
    month: 12,
    year: 1,
  };

  return frequencyCount * (multipliers[frequencyPeriod] || 0);
}

/**
 * Calculate annual time savings in hours
 * @param {number} timeSavedMinutes - Time saved per occurrence (minutes)
 * @param {number} frequencyCount - How many times per period
 * @param {string} frequencyPeriod - 'day', 'week', 'month', 'year'
 * @returns {number} Annual hours saved
 */
export function calculateAnnualTimeSavings(timeSavedMinutes, frequencyCount, frequencyPeriod) {
  if (!timeSavedMinutes) return 0;

  const annualOccurrences = convertToAnnualOccurrences(frequencyCount, frequencyPeriod);
  const annualMinutes = timeSavedMinutes * annualOccurrences;
  return annualMinutes / 60; // Convert to hours
}

/**
 * Calculate annual cost savings
 * @param {number} annualHoursSaved - Hours saved per year
 * @param {number} hourlyRate - Labor cost per hour (default: $50)
 * @param {number} overheadMultiplier - Multiplier for overhead costs (default: 1.3 = 30% overhead)
 * @returns {number} Annual cost savings in dollars
 */
export function calculateAnnualCostSavings(
  annualHoursSaved,
  hourlyRate = 50,
  overheadMultiplier = 1.3
) {
  return annualHoursSaved * hourlyRate * overheadMultiplier;
}

/**
 * Calculate ROI percentage
 * @param {number} annualBenefit - Annual cost savings
 * @param {number} implementationCost - One-time implementation cost
 * @returns {number} ROI percentage
 */
export function calculateROI(annualBenefit, implementationCost) {
  if (!implementationCost || implementationCost === 0) {
    return annualBenefit > 0 ? Infinity : 0;
  }

  return ((annualBenefit - implementationCost) / implementationCost) * 100;
}

/**
 * Calculate payback period in months
 * @param {number} implementationCost - One-time implementation cost
 * @param {number} annualBenefit - Annual cost savings
 * @returns {number} Payback period in months (null if no payback)
 */
export function calculatePaybackPeriod(implementationCost, annualBenefit) {
  if (!annualBenefit || annualBenefit === 0) return null;
  if (!implementationCost || implementationCost === 0) return 0;

  const years = implementationCost / annualBenefit;
  return years * 12; // Convert to months
}

/**
 * Calculate Net Present Value (NPV)
 * @param {number} annualBenefit - Annual cost savings
 * @param {number} implementationCost - One-time implementation cost
 * @param {number} years - Number of years to calculate NPV over (default: 3)
 * @param {number} discountRate - Annual discount rate (default: 0.10 = 10%)
 * @returns {number} NPV in dollars
 */
export function calculateNPV(annualBenefit, implementationCost, years = 3, discountRate = 0.1) {
  let npv = -implementationCost; // Initial investment is negative

  for (let year = 1; year <= years; year++) {
    npv += annualBenefit / Math.pow(1 + discountRate, year);
  }

  return npv;
}

/**
 * Comprehensive ROI calculation
 * @param {Object} params - Calculation parameters
 * @param {number} params.timeSavedMinutes - Time saved per occurrence (minutes)
 * @param {number} params.frequencyCount - How many times per period
 * @param {string} params.frequencyPeriod - 'day', 'week', 'month', 'year'
 * @param {number} params.implementationCost - One-time implementation cost
 * @param {number} params.hourlyRate - Labor cost per hour (optional, default: 50)
 * @param {number} params.overheadMultiplier - Overhead multiplier (optional, default: 1.3)
 * @param {number} params.years - Years for NPV calculation (optional, default: 3)
 * @param {number} params.discountRate - Discount rate for NPV (optional, default: 0.10)
 * @returns {Object} Comprehensive ROI metrics
 */
export function calculateComprehensiveROI({
  timeSavedMinutes,
  frequencyCount,
  frequencyPeriod,
  implementationCost,
  hourlyRate = 50,
  overheadMultiplier = 1.3,
  years = 3,
  discountRate = 0.1,
}) {
  // Calculate annual time savings
  const annualHoursSaved = calculateAnnualTimeSavings(
    timeSavedMinutes,
    frequencyCount,
    frequencyPeriod
  );

  // Calculate annual cost savings
  const annualBenefit = calculateAnnualCostSavings(
    annualHoursSaved,
    hourlyRate,
    overheadMultiplier
  );

  // Calculate ROI percentage
  const roiPercentage = calculateROI(annualBenefit, implementationCost);

  // Calculate payback period
  const paybackMonths = calculatePaybackPeriod(implementationCost, annualBenefit);

  // Calculate NPV
  const npv = calculateNPV(annualBenefit, implementationCost, years, discountRate);

  // Calculate annual occurrences
  const annualOccurrences = convertToAnnualOccurrences(frequencyCount, frequencyPeriod);

  return {
    annualHoursSaved: Math.round(annualHoursSaved * 100) / 100,
    annualBenefit: Math.round(annualBenefit * 100) / 100,
    roiPercentage: Math.round(roiPercentage * 100) / 100,
    paybackMonths: paybackMonths !== null ? Math.round(paybackMonths * 10) / 10 : null,
    npv: Math.round(npv * 100) / 100,
    annualOccurrences,
    isPositiveROI: roiPercentage > 0,
    isProfitable: npv > 0,
  };
}

/**
 * Get priority quadrant based on impact and effort scores
 * @param {number} impactScore - Impact score (1-10)
 * @param {number} effortScore - Effort score (1-10)
 * @returns {string} Quadrant name
 */
export function getPriorityQuadrant(impactScore, effortScore) {
  const impact = impactScore || 5;
  const effort = effortScore || 5;

  // Quadrants (based on median split at 5.5):
  // High Impact (>5.5), Low Effort (<=5.5): Quick Wins
  // High Impact (>5.5), High Effort (>5.5): Strategic
  // Low Impact (<=5.5), Low Effort (<=5.5): Fill-ins
  // Low Impact (<=5.5), High Effort (>5.5): Thankless Tasks

  if (impact > 5.5 && effort <= 5.5) {
    return "Quick Wins";
  } else if (impact > 5.5 && effort > 5.5) {
    return "Strategic";
  } else if (impact <= 5.5 && effort <= 5.5) {
    return "Fill-ins";
  } else {
    return "Thankless Tasks";
  }
}

/**
 * Get priority score (composite of impact and effort)
 * Higher is better (high impact, low effort)
 * @param {number} impactScore - Impact score (1-10)
 * @param {number} effortScore - Effort score (1-10)
 * @returns {number} Priority score (0-100)
 */
export function getPriorityScore(impactScore, effortScore) {
  const impact = impactScore || 5;
  const effort = effortScore || 5;

  // Formula: (Impact * 2) - Effort
  // This weights impact more heavily than effort
  // Range: (1*2)-10 = -8 to (10*2)-1 = 19
  // Normalized to 0-100: ((score + 8) / 27) * 100

  const rawScore = impact * 2 - effort;
  const normalizedScore = ((rawScore + 8) / 27) * 100;

  return Math.round(normalizedScore * 10) / 10;
}
