"use client";

import { useQuery } from "@tanstack/react-query";

import { useSession } from "./session";

export const walletKey = ["wallet"] as const;
export const aiConversationsKey = ["ai-conversations"] as const;

/** The student's points, credits and AI helper limits. */
export function useWallet() {
  const { api } = useSession();
  return useQuery({ queryKey: walletKey, queryFn: () => api.wallet(), staleTime: 15_000 });
}
