"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { AccountStatus, AppUser, UserRole } from "@/lib/types";
import {
  fixtureAdminUser,
  fixtureCurrentUser,
} from "@/lib/fixtures/data";

/**
 * Simulates an authenticated session using fixture data so the application
 * shell, navigation, and account-status states can be previewed before
 * Supabase Auth is wired up. Only ever mounted when `useFixtures` is true
 * (see src/lib/config.ts) — never reachable in a production build.
 */

interface FixtureSessionValue {
  user: AppUser;
  role: UserRole;
  accountStatus: AccountStatus;
  setRole: (role: UserRole) => void;
  setAccountStatus: (status: AccountStatus) => void;
}

export const FixtureSessionContext = createContext<FixtureSessionValue | null>(null);

export function FixtureSessionProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<UserRole>("USER");
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("ACTIVE");

  const user = useMemo<AppUser>(() => {
    const base = role === "ADMIN" ? fixtureAdminUser : fixtureCurrentUser;
    return { ...base, role, accountStatus };
  }, [role, accountStatus]);

  const value = useMemo(
    () => ({ user, role, accountStatus, setRole, setAccountStatus }),
    [user, role, accountStatus],
  );

  return (
    <FixtureSessionContext.Provider value={value}>
      {children}
    </FixtureSessionContext.Provider>
  );
}

export function useFixtureSession() {
  const ctx = useContext(FixtureSessionContext);
  if (!ctx) {
    throw new Error("useFixtureSession must be used within a FixtureSessionProvider");
  }
  return ctx;
}
