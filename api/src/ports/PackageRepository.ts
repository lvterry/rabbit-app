/**
 * Package Repository Port
 * Handles package (session bundles) data access
 */

import type {
  PackageView,
  PackageTransactionView,
  CreatePackageRequest,
  AddPackageTransactionRequest,
  BalanceView,
} from '@rabbit/shared'

export interface PackageRepository {
  /**
   * Find package by ID
   */
  findById(packageId: string): Promise<PackageView | null>

  /**
   * List packages for a student
   */
  listByStudent(studentId: string): Promise<PackageView[]>

  /**
   * List active (non-archived) packages for a student and course
   */
  listActiveByStudentAndCourse(studentId: string, courseId: string): Promise<PackageView[]>

  /**
   * Create a new package
   */
  create(
    studentId: string,
    teacherId: string,
    data: CreatePackageRequest
  ): Promise<PackageView>

  /**
   * Add transaction to package (via SECURITY DEFINER function)
   */
  addTransaction(
    packageId: string,
    data: AddPackageTransactionRequest,
    actorUserId?: string,
    actorStudentId?: string
  ): Promise<PackageTransactionView>

  /**
   * List transactions for a package
   */
  listTransactions(packageId: string): Promise<PackageTransactionView[]>

  /**
   * List transactions for a student
   */
  listTransactionsByStudent(studentId: string): Promise<PackageTransactionView[]>

  /**
   * Get balance aggregated across all active packages for student+course
   */
  getBalance(studentId: string, courseId: string): Promise<BalanceView>

  /**
   * Archive a package
   */
  archive(packageId: string): Promise<PackageView>

  /**
   * Restore an archived package
   */
  restore(packageId: string): Promise<PackageView>

  /**
   * Select package for booking via FIFO rule
   */
  selectPackageForBooking(studentId: string, courseId: string): Promise<string | null>

  /**
   * Check if package has sufficient available sessions
   */
  hasAvailableSessions(
    studentId: string,
    courseId: string,
    required: number
  ): Promise<boolean>
}
