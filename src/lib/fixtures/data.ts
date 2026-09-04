import type {
  AppUser,
  AvailabilityWindow,
  ReservationRequest,
} from "@/lib/types";

/**
 * Static development fixtures only. Never imported unless `useFixtures` is
 * true (see src/lib/config.ts), which is hard-disabled in production builds.
 */

export const fixtureCurrentUser: AppUser = {
  id: "usr_dev_active",
  fullName: "Nigar Aliyeva",
  email: "nigar.aliyeva@student.edu",
  role: "USER",
  accountStatus: "ACTIVE",
  createdAt: "2026-01-14T08:00:00.000Z",
};

export const fixtureAdminUser: AppUser = {
  id: "usr_dev_admin",
  fullName: "Rashad Huseynov",
  email: "rashad.huseynov@usg.edu",
  role: "ADMIN",
  accountStatus: "ACTIVE",
  createdAt: "2025-09-01T08:00:00.000Z",
};

export const fixturePendingUser: AppUser = {
  id: "usr_dev_pending",
  fullName: "Kamran Mammadov",
  email: "kamran.mammadov@student.edu",
  role: "USER",
  accountStatus: "PENDING",
  createdAt: "2026-08-30T08:00:00.000Z",
};

export const fixtureSuspendedUser: AppUser = {
  id: "usr_dev_suspended",
  fullName: "Leyla Guliyeva",
  email: "leyla.guliyeva@student.edu",
  role: "USER",
  accountStatus: "SUSPENDED",
  createdAt: "2026-02-11T08:00:00.000Z",
};

export const fixtureReservations: ReservationRequest[] = [
  {
    id: "res_1001",
    requesterId: fixtureCurrentUser.id,
    requesterName: fixtureCurrentUser.fullName,
    startsAt: "2026-09-08T11:00:00.000Z",
    endsAt: "2026-09-08T13:00:00.000Z",
    purpose: "USG General Assembly weekly meeting",
    participantCount: 24,
    status: "APPROVED",
    submittedAt: "2026-09-01T09:12:00.000Z",
    decidedAt: "2026-09-02T14:00:00.000Z",
    decidedBy: fixtureAdminUser.fullName,
    rejectionReason: null,
    adminOverride: false,
    overrideReason: null,
  },
  {
    id: "res_1002",
    requesterId: fixtureCurrentUser.id,
    requesterName: fixtureCurrentUser.fullName,
    startsAt: "2026-09-12T07:00:00.000Z",
    endsAt: "2026-09-12T08:30:00.000Z",
    purpose: "Debate club practice round",
    participantCount: 10,
    status: "PENDING",
    submittedAt: "2026-09-04T06:40:00.000Z",
    decidedAt: null,
    decidedBy: null,
    rejectionReason: null,
    adminOverride: false,
    overrideReason: null,
  },
  {
    id: "res_1003",
    requesterId: fixtureCurrentUser.id,
    requesterName: fixtureCurrentUser.fullName,
    startsAt: "2026-08-20T10:00:00.000Z",
    endsAt: "2026-08-20T11:00:00.000Z",
    purpose: "Budget committee review",
    participantCount: 6,
    status: "REJECTED",
    submittedAt: "2026-08-17T10:00:00.000Z",
    decidedAt: "2026-08-18T09:30:00.000Z",
    decidedBy: fixtureAdminUser.fullName,
    rejectionReason: "Room already committed to Career Services for this slot.",
    adminOverride: false,
    overrideReason: null,
  },
  {
    id: "res_1004",
    requesterId: "usr_dev_other",
    requesterName: "Career Services Board",
    startsAt: "2026-09-09T12:00:00.000Z",
    endsAt: "2026-09-09T14:00:00.000Z",
    purpose: "Resume workshop",
    participantCount: 18,
    status: "APPROVED",
    submittedAt: "2026-09-01T08:00:00.000Z",
    decidedAt: "2026-09-01T16:00:00.000Z",
    decidedBy: fixtureAdminUser.fullName,
    rejectionReason: null,
    adminOverride: false,
    overrideReason: null,
  },
];

export const fixtureAvailability: AvailabilityWindow[] = [
  { id: "avl_1", date: "2026-09-08", startTime: "09:00", endTime: "18:00", isBlocked: false, note: null },
  { id: "avl_2", date: "2026-09-09", startTime: "09:00", endTime: "18:00", isBlocked: false, note: null },
  { id: "avl_3", date: "2026-09-10", startTime: "09:00", endTime: "18:00", isBlocked: false, note: null },
  { id: "avl_4", date: "2026-09-11", startTime: "00:00", endTime: "23:59", isBlocked: true, note: "Facilities maintenance — floor waxing" },
  { id: "avl_5", date: "2026-09-12", startTime: "09:00", endTime: "15:00", isBlocked: false, note: null },
];
