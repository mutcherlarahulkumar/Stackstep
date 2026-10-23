"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { type TemplateFilter } from "@/lib/api/client";
import { type Persona } from "@/lib/api/schemas";
import { useSession } from "@/lib/session";

/** Every persona, archived too, for showing who posted existing items. */
export function useAllPersonas() {
  const { api } = useSession();
  return useQuery({ queryKey: ["personas", "all"], queryFn: () => api.personas(true), staleTime: 60_000 });
}

export const personaMap = (list: readonly Persona[] | undefined) => new Map((list ?? []).map((p) => [p.id, p]));

export function useTemplates(f: TemplateFilter) {
  const { api } = useSession();
  return useInfiniteQuery({
    queryKey: ["templates", f],
    queryFn: ({ pageParam }) => api.templates(f, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });
}

export function useFlows(includeArchived = false) {
  const { api } = useSession();
  return useQuery({ queryKey: ["flows", { includeArchived }], queryFn: () => api.flows(includeArchived) });
}
