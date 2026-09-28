import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  requireAuth: vi.fn(),
  resolveActiveOrg: vi.fn(),
  showApiError: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({ apiClient: { get: mocks.get, patch: mocks.patch } }));
vi.mock("@/lib/auth/server", () => ({
  requireAuth: mocks.requireAuth,
  resolveActiveOrg: mocks.resolveActiveOrg,
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: mocks.showApiError }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => { throw new Error(`redirect:${href}`); },
}));

import ProposalPage from "@/app/app/proposals/[id]/page";

const mockProposalData = {
  id: "proposta-a",
  titulo: "Consultoria",
  condicoes: "Prazo: 30 dias",
  valid_until: "2026-10-17",
  status: "rascunho" as const,
  revision: 1,
  total_cents: 50000,
  moeda: "BRL",
  itens: [
    {
      id: "item-1",
      product_id: "prod-a",
      descricao: "Consultoria inicial",
      quantidade: 10,
      preco_unitario_cents: 5000,
      desconto_cents: 0,
      position: 1,
    },
  ],
};

// P5: DocumentoCanvas também busca a lista de modelos da organização em
// paralelo ao documento — o mock roteia por URL, como em DocumentoCanvas.test.tsx,
// senão a proposta cai na chamada de /settings/proposal-templates e quebra o
// "modelosDisponiveis.map" do canvas.
function mockProposalGet(data: unknown) {
  mocks.get.mockImplementation(async (url: string) =>
    url.includes("/settings/proposal-templates") ? { data: [] } : { data },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockProposalGet(mockProposalData);
  mocks.patch.mockResolvedValue({
    data: { id: "proposta-a", revision: 2, total_cents: 50000 },
  });
  mocks.requireAuth.mockResolvedValue({ id: "user", is_platform_admin: false, support: null });
  mocks.resolveActiveOrg.mockResolvedValue({ orgId: "org-a", role: "agent" });
});

describe("editor de propostas", () => {
  it("carrega e mostra a proposta com seus itens", async () => {
    render(await ProposalPage({ params: Promise.resolve({ id: "proposta-a" }) }));
    await waitFor(() => {
      expect(screen.getByDisplayValue("Consultoria")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("Consultoria inicial")).toBeInTheDocument();
    expect(screen.getByDisplayValue("10")).toBeInTheDocument();
  });

  it("recalcula o total ao editar quantidade", async () => {
    const user = userEvent.setup();
    render(await ProposalPage({ params: Promise.resolve({ id: "proposta-a" }) }));
    const quantidadeInputs = await screen.findAllByDisplayValue("10");
    await user.clear(quantidadeInputs[0]!);
    await user.type(quantidadeInputs[0]!, "20");
    await waitFor(() => {
      const totalText = screen.getByText(/Total/).parentElement;
      expect(totalText?.textContent || "").toContain("1.000,00");
    });
  });

  it("recalcula o total ao editar preço unitário", async () => {
    const user = userEvent.setup();
    // Item manual (sem product_id): preço editável. Item de catálogo tem o
    // preço travado na tela (C3 §5.1 — o servidor resolve do catálogo e
    // ignora o que a tela mandar).
    mockProposalGet({
      ...mockProposalData,
      itens: [{ ...mockProposalData.itens[0]!, product_id: null }],
    });
    render(await ProposalPage({ params: Promise.resolve({ id: "proposta-a" }) }));
    const priceInputs = await screen.findAllByDisplayValue("50");
    await user.clear(priceInputs[0]!);
    await user.type(priceInputs[0]!, "100");
    await waitFor(() => {
      const totalText = screen.getByText(/Total/).parentElement;
      expect(totalText?.textContent || "").toContain("1.000,00");
    });
  });

  it("trava o preço de item de catálogo na tela (o servidor resolve do catálogo)", async () => {
    render(await ProposalPage({ params: Promise.resolve({ id: "proposta-a" }) }));
    const priceInputs = await screen.findAllByDisplayValue("50");
    expect(priceInputs[0]).toBeDisabled();
  });

  it("recalcula o total ao editar desconto", async () => {
    const user = userEvent.setup();
    render(await ProposalPage({ params: Promise.resolve({ id: "proposta-a" }) }));
    const descontoInputs = await screen.findAllByDisplayValue("0");
    await user.clear(descontoInputs[0]!);
    await user.type(descontoInputs[0]!, "10");
    await waitFor(() => {
      const totalText = screen.getByText(/Total/).parentElement;
      expect(totalText?.textContent || "").toContain("490,00");
    });
  });

  it("desabilita campos para viewer", async () => {
    mocks.resolveActiveOrg.mockResolvedValue({ orgId: "org-a", role: "viewer" });
    render(await ProposalPage({ params: Promise.resolve({ id: "proposta-a" }) }));
    await waitFor(() => {
      expect(screen.getByDisplayValue("Consultoria")).toBeDisabled();
    });
    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
    expect(screen.queryByText("+ Item à mão")).not.toBeInTheDocument();
  });

  it("desabilita campos para suporte read-only", async () => {
    mocks.requireAuth.mockResolvedValue({
      id: "user",
      is_platform_admin: true,
      support: { status: "active", access_mode: "read_only" },
    });
    render(await ProposalPage({ params: Promise.resolve({ id: "proposta-a" }) }));
    await waitFor(() => {
      expect(screen.getByDisplayValue("Consultoria")).toBeDisabled();
    });
    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
  });

  it("desabilita campos quando status não é rascunho", async () => {
    mockProposalGet({ ...mockProposalData, status: "enviada" });
    render(await ProposalPage({ params: Promise.resolve({ id: "proposta-a" }) }));
    await waitFor(() => {
      expect(screen.getByDisplayValue("Consultoria")).toBeDisabled();
    });
    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
  });

  it("permite salvar quando status é rascunho e tem permissão", async () => {
    render(await ProposalPage({ params: Promise.resolve({ id: "proposta-a" }) }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();
    });
    const salvarBtn = screen.getByRole("button", { name: "Salvar" });
    expect(salvarBtn).not.toBeDisabled();
  });

  it("envia PATCH com revision e itens ao salvar", async () => {
    const user = userEvent.setup();
    render(await ProposalPage({ params: Promise.resolve({ id: "proposta-a" }) }));
    const salvarBtn = await screen.findByRole("button", { name: "Salvar" });
    await user.click(salvarBtn);
    await waitFor(() => {
      expect(mocks.patch).toHaveBeenCalledWith(
        "/api/v1/proposals/proposta-a",
        expect.objectContaining({
          revision: 1,
          titulo: "Consultoria",
          itens: expect.arrayContaining([
            expect.objectContaining({
              descricao: "Consultoria inicial",
              quantidade: 10,
            }),
          ]),
        }),
      );
    });
  });

  it("atualiza revision e total após salvar com sucesso", async () => {
    const user = userEvent.setup();
    mocks.patch.mockResolvedValue({
      data: { id: "proposta-a", revision: 2, total_cents: 50000 },
    });
    render(await ProposalPage({ params: Promise.resolve({ id: "proposta-a" }) }));
    const salvarBtn = await screen.findByRole("button", { name: "Salvar" });
    await user.click(salvarBtn);
    await waitFor(() => {
      expect(mocks.patch).toHaveBeenCalled();
    });
  });

  it("mostra mensagem de erro quando proposta mudou (409)", async () => {
    const userSetup = userEvent.setup();
    mocks.patch.mockRejectedValue(
      new Error(
        JSON.stringify({
          error: {
            code: "proposal_context_stale",
            message: "A proposta mudou (ou não está mais em rascunho). Recarregue antes de editar.",
          },
        }),
      ),
    );
    render(await ProposalPage({ params: Promise.resolve({ id: "proposta-a" }) }));
    const salvarBtn = await screen.findByRole("button", { name: "Salvar" });
    await userSetup.click(salvarBtn);
    await waitFor(() => {
      expect(screen.getByText(/A proposta mudou/)).toBeInTheDocument();
    });
  });

  it("adiciona item manual com posição incremental", async () => {
    const user = userEvent.setup();
    render(await ProposalPage({ params: Promise.resolve({ id: "proposta-a" }) }));
    await waitFor(() => {
      expect(screen.getByText("+ Item à mão")).toBeInTheDocument();
    });
    const addBtn = screen.getByRole("button", { name: /Item à mão/ });
    await user.click(addBtn);
    await waitFor(() => {
      const descricaoInputs = screen.getAllByPlaceholderText("Descrição");
      expect(descricaoInputs.length).toBeGreaterThan(1);
    });
  });

  it("redireciona quando não há organização ativa", async () => {
    mocks.resolveActiveOrg.mockResolvedValue(null);
    await expect(ProposalPage({ params: Promise.resolve({ id: "proposta-a" }) })).rejects.toThrow(
      "redirect:/app",
    );
  });

  it("desabilita botão salvar enquanto está salvando", async () => {
    const user = userEvent.setup();
    let resolvePatch: () => void;
    const patchPromise = new Promise<{ data: { id: string; revision: number; total_cents: number } }>((resolve) => {
      resolvePatch = () => resolve({ data: { id: "proposta-a", revision: 2, total_cents: 50000 } });
    });
    mocks.patch.mockReturnValue(patchPromise);
    render(await ProposalPage({ params: Promise.resolve({ id: "proposta-a" }) }));
    const salvarBtn = await screen.findByRole("button", { name: "Salvar" });
    await user.click(salvarBtn);
    await waitFor(() => {
      expect(salvarBtn).toBeDisabled();
    });
    resolvePatch!();
    await waitFor(() => {
      expect(salvarBtn).not.toBeDisabled();
    });
  });
});
