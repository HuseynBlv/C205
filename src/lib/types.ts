/**
 * Shared domain types for C205.
 *
 * These mirror the data model that will be backed by Supabase Postgres in a
 * later step. Defining them now keeps fixtures, UI components, and the
 * eventual database schema aligned on the same vocabulary.
 */

export type UserRole = "USER" | "ADMIN";

export type AccountStatus =
  | "PENDING"
  | "ACTIVE"
  | "REJECTED"
  | "SUSPENDED"
  | "REMOVED";

export type ReservationStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface AppUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  accountStatus: AccountStatus;
  createdAt: string;
}

export interface ReservationRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  /** ISO 8601 timestamp, always interpreted/stored as Asia/Baku wall time in UTC. */
  startsAt: string;
  endsAt: string;
  purpose: string;
  participantCount: number;
  status: ReservationStatus;
  submittedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  rejectionReason: string | null;
  adminOverride: boolean;
  overrideReason: string | null;
}

export interface AvailabilityWindow {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  isBlocked: boolean;
  note: string | null;
}
