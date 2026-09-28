// app/app/radar/_components/RiskRadarList.test.tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { RiskRadarList } from "./RiskRadarList";
import { useAtRiskLeads } from "@/hooks/leads/useAtRiskLeads";

vi.mock("@/hooks/leads/useAtRiskLeads", () => ({ useAtRiskLeads: vi.fn() }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const BASE = {
  items: [],
  counts: { critico: 0, em_risco: 0, em_voo: 0 },
  total: 0,
  sem_proximo_passo: [],
  total_sem_proximo_passo: 0,
  propostas_vencidas_sem_retomada: [],
};

describe("RiskRadarList — propostas vencidas sem retomada (N3)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lista populada: mostra a seção nova com link para a proposta", async () => {
    vi.mocked(useAtRiskLeads).mockReturnValue({
      data: {
        ...BASE,
        propostas_vencidas_sem_retomada: [
          { lead_id: "lead-1", proposal_id: "prop-1", numero: 42, ano: 2026, valid_until: "2026-10-01" },
        ],
      },
      isLoading: false,
    } as never);
    render(<RiskRadarList />);
    expect(await screen.findByTestId("radar-propostas-vencidas")).toBeInTheDocument();
    expect(screen.getByText(/0042\/2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /0042\/2026/ })).toHaveAttribute("href", "/app/proposals/prop-1");
  });

  it("lista vazia: esconde a seção", async () => {
    vi.mocked(useAtRiskLeads).mockReturnValue({
      data: { ...BASE, sem_proximo_passo: [{ id: "d1", contact_id: "c1", contact_name: "X", aberta_em: "2026-01-01", horas_aberta: 5, origem: "y" }] },
      isLoading: false,
    } as never);
    render(<RiskRadarList />);
    expect(screen.queryByTestId("radar-propostas-vencidas")).not.toBeInTheDocument();
  });

  it("só há proposta vencida (sem lead frio nem demanda): NÃO mostra o vazio", async () => {
    vi.mocked(useAtRiskLeads).mockReturnValue({
      data: {
        ...BASE,
        propostas_vencidas_sem_retomada: [
          { lead_id: "lead-1", proposal_id: "prop-1", numero: null, ano: null, valid_until: null },
        ],
      },
      isLoading: false,
    } as never);
    render(<RiskRadarList />);
    expect(screen.queryByTestId("radar-empty")).not.toBeInTheDocument();
    expect(screen.getByTestId("radar-propostas-vencidas")).toBeInTheDocument();
  });
});
