/**
 * Availability Repository Port
 * Handles teacher availability rules and exceptions
 */

import type {
  AvailabilityRuleView,
  AvailabilityExceptionView,
  CreateAvailabilityRuleRequest,
  CreateAvailabilityExceptionRequest,
} from '@rabbit/shared'

export interface AvailabilityRepository {
  /**
   * List availability rules for a teacher
   */
  listRules(teacherId: string): Promise<AvailabilityRuleView[]>

  /**
   * List active rules for a teacher on a specific weekday
   */
  listActiveRulesForWeekday(
    teacherId: string,
    weekday: number
  ): Promise<AvailabilityRuleView[]>

  /**
   * Create a new availability rule
   */
  createRule(
    teacherId: string,
    data: CreateAvailabilityRuleRequest
  ): Promise<AvailabilityRuleView>

  /**
   * Update an availability rule
   */
  updateRule(
    ruleId: string,
    data: Partial<CreateAvailabilityRuleRequest>
  ): Promise<AvailabilityRuleView>

  /**
   * Delete (soft) an availability rule
   */
  deleteRule(ruleId: string): Promise<void>

  /**
   * Copy rules from one weekday to others
   */
  copyRules(teacherId: string, fromWeekday: number, toWeekdays: number[]): Promise<void>

  /**
   * List exceptions for a teacher in a date range
   */
  listExceptions(
    teacherId: string,
    fromDate: string,
    toDate: string
  ): Promise<AvailabilityExceptionView[]>

  /**
   * Get exception for a specific date
   */
  getExceptionForDate(
    teacherId: string,
    date: string
  ): Promise<AvailabilityExceptionView | null>

  /**
   * Create an availability exception
   */
  createException(
    teacherId: string,
    data: CreateAvailabilityExceptionRequest
  ): Promise<AvailabilityExceptionView>

  /**
   * Delete an availability exception
   */
  deleteException(exceptionId: string): Promise<void>
}
