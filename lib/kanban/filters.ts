import type { Lead } from "@/lib/types/leads";
import { cardTemMarcador } from "@/lib/kanban/marcadores-do-card";

/**
 * Prefixo que marca um dono AGENTE no filtro (0070). O param de URL continua
 * sendo `owner=` — humano é o uuid puro, agente é `agent:<uuid>`, e o board
 * não precisa de dois seletores para a mesma pergunta ("de quem é isto?").
 */
export const AGENT_OWNER_PREFIX = "agent:";

export function agentOwnerFilter(agentId: string): string {
  return `${AGENT_OWNER_PREFIX}${agentId}`;
}

export function parseAgentOwnerFilter(value: string | undefined): string | null {
  if (!value?.startsWith(AGENT_OWNER_PREFIX)) return null;
  return value.slice(AGENT_OWNER_PREFIX.length) || null;
}

export interface LeadFilters {
  /** userId | `agent:<uuid>` | "any" | "unassigned" */
  owner?: string | "any" | "unassigned";
  status?: "all" | "open" | "won" | "lost";
  tag?: string;
  search?: string;
  valueCentsMin?: number | null;
  valueCentsMax?: number | null;
  overdueOnly?: boolean;
}

/**
 * Serializa/deserializa os filtros do board em query params (deep-linkável).
 * Só os controles expostos na FilterBar: owner, status, tag, busca, atrasados.
 */
export function filtersFromParams(
  sp: { get(key: string): string | null },
): LeadFilters {
  const owner = sp.get("owner");
  const status = sp.get("status");
  const tag = sp.get("tag");
  const search = sp.get("q");
  return {
    owner: owner ?? undefined,
    status:
      status === "open" || status === "won" || status === "lost" || status === "all"
        ? status
        : "all",
    tag: tag ?? undefined,
    search: search ?? undefined,
    overdueOnly: sp.get("overdue") === "1" || undefined,
  };
}

export function filtersToParams(f: LeadFilters): string {
  const p = new URLSearchParams();
  if (f.owner && f.owner !== "any") p.set("owner", f.owner);
  if (f.status && f.status !== "all") p.set("status", f.status);
  if (f.tag) p.set("tag", f.tag);
  if (f.search?.trim()) p.set("q", f.search.trim());
  if (f.overdueOnly) p.set("overdue", "1");
  return p.toString();
}

export function applyFilters(leads: Lead[], f: LeadFilters): Lead[] {
  const today = new Date().toISOString().slice(0, 10);
  const search = f.search?.trim().toLowerCase() ?? "";

  return leads.filter((l) => {
    // "Sem responsável" é sem dono NENHUM — lead de dono agente tem dono.
    if (
      f.owner === "unassigned" &&
      (l.owner_user_id !== null || l.owner_agent_id !== null)
    )
      return false;
    if (f.owner && f.owner !== "any" && f.owner !== "unassigned") {
      const agentId = parseAgentOwnerFilter(f.owner);
      if (agentId) {
        if (l.owner_agent_id !== agentId) return false;
      } else if (l.owner_user_id !== f.owner) {
        return false;
      }
    }
    if (f.status && f.status !== "all" && l.status !== f.status) return false;
    // As TRÊS caixas de marcador (negócio, contato, conversa) — ver
    // lib/kanban/marcadores-do-card.ts. Só `l.tags` deixava o marcador escrito
    // no contato ou na conversa sem casar card nenhum.
    if (f.tag && !cardTemMarcador(l, f.tag)) return false;
    if (
      search &&
      !`${l.title} ${l.description ?? ""}`.toLowerCase().includes(search)
    )
      return false;
    if (typeof f.valueCentsMin === "number" && (l.value_cents ?? 0) < f.valueCentsMin)
      return false;
    if (typeof f.valueCentsMax === "number" && (l.value_cents ?? 0) > f.valueCentsMax)
      return false;
    if (f.overdueOnly) {
      if (l.status !== "open") return false;
      if (!l.expected_close_date || l.expected_close_date >= today) return false;
    }
    return true;
  });
}
