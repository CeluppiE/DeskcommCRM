// components/kanban/PropostasDoNegocio.test.tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropostasDoNegocio } from "./PropostasDoNegocio";
import { apiClient } from "@/lib/api/client";

vi.mock("@/lib/api/client");
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));

function renderComQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("PropostasDoNegocio", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lista as propostas com número/versão/status/total/validade", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [{ id: "p1", titulo: "Site", status: "enviada", total_cents: 500000, moeda: "BRL", numero: 42, ano: 2026, versao: 1, valid_until: "2026-10-01", created_at: "2026-09-01" }],
    } as never);
    renderComQuery(<PropostasDoNegocio leadId="lead-1" pipelineId="pipe-1" />);
    expect(await screen.findByText(/0042\/2026/)).toBeInTheDocument();
  });

  it("sem propostas: mostra o atalho 'Nova proposta', nunca uma lista vazia muda (manager+)", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] } as never);
    renderComQuery(<PropostasDoNegocio leadId="lead-1" pipelineId="pipe-1" podeCriar />);
    expect(await screen.findByRole("link", { name: /nova proposta/i })).toBeInTheDocument();
  });

  it("papel sem permissão de criar: não mostra o atalho", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] } as never);
    renderComQuery(<PropostasDoNegocio leadId="lead-1" pipelineId="pipe-1" podeCriar={false} />);
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: /nova proposta/i })).not.toBeInTheDocument();
  });
});
