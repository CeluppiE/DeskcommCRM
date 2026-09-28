// hooks/kanban/usePropostasDoLead.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { usePropostasDoLead } from "./usePropostasDoLead";

vi.mock("@/lib/api/client");

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("usePropostasDoLead", () => {
  beforeEach(() => vi.clearAllMocks());
  it("busca /api/v1/proposals?lead_id=... e devolve a lista INTEIRA (não filtra como usePropostaEnviadaDoLead)", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [
        { id: "p1", titulo: "A", status: "rascunho", total_cents: 100, moeda: "BRL", numero: null, ano: null, versao: 1, valid_until: null, created_at: "2026-01-01" },
        { id: "p2", titulo: "B", status: "enviada", total_cents: 200, moeda: "BRL", numero: 1, ano: 2026, versao: 1, valid_until: "2026-02-01", created_at: "2026-01-02" },
      ],
    } as never);
    const { result } = renderHook(() => usePropostasDoLead("lead-1"), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(apiClient.get).toHaveBeenCalledWith("/api/v1/proposals?lead_id=lead-1");
  });

  it("enabled=false: não busca", () => {
    renderHook(() => usePropostasDoLead("lead-1", false), { wrapper });
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
