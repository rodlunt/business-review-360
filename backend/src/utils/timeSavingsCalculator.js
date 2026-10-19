/**
 * Time Savings Calculator
 * Utilities for calculating aggregate time savings based on frequency data
 * Related to Issue #434 - Frequency tracking for time-saved calculations
 */

import { logger } from "./logger.js";

/**
 * Multipliers for converting different time periods to annual occurrences
 */
const PERIOD_MULTIPLIERS = {
  day: 365,
  week: 52,
  month: 12,
  year: 1,
};

/**
 * Calculate annual time savings in minutes
 * @param {number} timeSavedMinutes - Time saved per occurrence in minutes
 * @param {number} frequencyCount - Number of occurrences per period
 * @param {string} frequencyPeriod - Time period ('day', 'week', 'month', or 'year')
 * @returns {number|null} Annual time savings in minutes, or null if insufficient data
 */
export function calculateAnnualSavingsMinutes(timeSavedMinutes, frequencyCount, frequencyPeriod) {
  // Return null if any required data is missing
  if (!timeSavedMinutes || !frequencyCount || !frequencyPeriod) {
    return null;
  }

  // Validate frequency period
  if (!PERIOD_MULTIPLIERS[frequencyPeriod]) {
    logger.warn(`[TimeSavings] Invalid frequency period: ${frequencyPeriod}`);
    return null;
  }

  const multiplier = PERIOD_MULTIPLIERS[frequencyPeriod];
  return timeSavedMinutes * frequencyCount * multiplier;
}

/**
 * Calculate annual time savings in hours
 * @param {number} timeSavedMinutes - Time saved per occurrence in minutes
 * @param {number} frequencyCount - Number of occurrences per period
 * @param {string} frequencyPeriod - Time period ('day', 'week', 'month', or 'year')
 * @returns {number|null} Annual time savings in hours, or null if insufficient data
 */
export function calculateAnnualSavingsHours(timeSavedMinutes, frequencyCount, frequencyPeriod) {
  const minutes = calculateAnnualSavingsMinutes(timeSavedMinutes, frequencyCount, frequencyPeriod);
  return minutes !== null ? Math.round((minutes / 60) * 10) / 10 : null; // Round to 1 decimal
}

/**
 * Calculate annual time savings in days (assuming 8-hour workday)
 * @param {number} timeSavedMinutes - Time saved per occurrence in minutes
 * @param {number} frequencyCount - Number of occurrences per period
 * @param {string} frequencyPeriod - Time period ('day', 'week', 'month', or 'year')
 * @returns {number|null} Annual time savings in days, or null if insufficient data
 */
export function calculateAnnualSavingsDays(timeSavedMinutes, frequencyCount, frequencyPeriod) {
  const hours = calculateAnnualSavingsHours(timeSavedMinutes, frequencyCount, frequencyPeriod);
  return hours !== null ? Math.round((hours / 8) * 10) / 10 : null; // Round to 1 decimal
}

/**
 * Format time savings for display
 * @param {number} timeSavedMinutes - Time saved per occurrence in minutes
 * @param {number} frequencyCount - Number of occurrences per period
 * @param {string} frequencyPeriod - Time period ('day', 'week', 'month', or 'year')
 * @returns {string} Formatted string like "625 hours/year (78 days)"
 */
export function formatAnnualSavings(timeSavedMinutes, frequencyCount, frequencyPeriod) {
  const hours = calculateAnnualSavingsHours(timeSavedMinutes, frequencyCount, frequencyPeriod);
  const days = calculateAnnualSavingsDays(timeSavedMinutes, frequencyCount, frequencyPeriod);

  if (hours === null) {
    return "Not calculated";
  }

  if (hours < 8) {
    return `${hours} hours/year`;
  }

  return `${hours} hours/year (${days} days)`;
}

/**
 * Calculate aggregate time savings for multiple ideas
 * @param {Array} ideas - Array of idea objects with timeSavedMinutes, frequencyCount, frequencyPeriod
 * @returns {Object} Object with total minutes, hours, and days
 */
export function calculateAggregateSavings(ideas) {
  const totalMinutes = ideas.reduce((sum, idea) => {
    const savings = calculateAnnualSavingsMinutes(
      idea.timeSavedMinutes,
      idea.frequencyCount,
      idea.frequencyPeriod
    );
    return sum + (savings || 0);
  }, 0);

  return {
    minutes: totalMinutes,
    hours: Math.round((totalMinutes / 60) * 10) / 10,
    days: Math.round((totalMinutes / 480) * 10) / 10, // 480 minutes = 8-hour workday
  };
}

/**
 * Get human-readable period name
 * @param {string} period - Period code ('day', 'week', 'month', 'year')
 * @returns {string} Human-readable period name
 */
export function getPeriodName(period) {
  const names = {
    day: "Per Day",
    week: "Per Week",
    month: "Per Month",
    year: "Per Year",
  };
  return names[period] || period;
}
