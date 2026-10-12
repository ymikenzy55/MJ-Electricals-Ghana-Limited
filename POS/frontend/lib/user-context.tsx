"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { getStoredUser } from "./api";
import type { UserInfo } from "./types";

const UserContext = createContext<UserInfo | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    setUser(u);
    setReady(true);
  }, []);

  if (!ready) return null;
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useUser(): UserInfo | null {
  return useContext(UserContext);
}
