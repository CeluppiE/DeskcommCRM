import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  requireAuth: vi.fn(),
  resolveActiveOrg: vi.fn(),
  showApiError: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({ apiClient: { get: mocks.get } }));
vi.mock("@/lib/auth/server", () => ({
  requireAuth: mocks.requireAuth,
  resolveActiveOrg: mocks.resolveActiveOrg,
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: mocks.showApiError }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => { throw new Error(`redirect:${href}`); },
}));

import ProposalsPage from "@/app/app/proposals/page";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({ data: [] });
  mocks.requireAuth.mockResolvedValue({ id: "user", is_platform_admin: false, support: null });
  mocks.resolveActiveOrg.mockResolvedValue({ orgId: "org-a", role: "agent" });
});

describe("lista de propostas", () => {
  it("permite ao atendente acessar a criação", async () => {
    render(await ProposalsPage());
    await screen.findByText("Nenhuma proposta cadastrada ainda.");
    expect(screen.getByRole("link", { name: "Nova proposta" })).toHaveAttribute("href", "/app/proposals/novo");
  });

  it("mantém leitura sem oferecer criação ao viewer", async () => {
    mocks.resolveActiveOrg.mockResolvedValue({ orgId: "org-a", role: "viewer" });
    render(await ProposalsPage());
    await screen.findByText("Nenhuma proposta cadastrada ainda.");
    expect(screen.queryByRole("link", { name: "Nova proposta" })).not.toBeInTheDocument();
  });

  it("não oferece criação no acompanhamento somente leitura", async () => {
    mocks.requireAuth.mockResolvedValue({
      id: "user", is_platform_admin: true,
      support: { status: "active", access_mode: "read_only" },
    });
    render(await ProposalsPage());
    await screen.findByText("Nenhuma proposta cadastrada ainda.");
    expect(screen.queryByRole("link", { name: "Nova proposta" })).not.toBeInTheDocument();
  });

  it("redireciona quando não há organização ativa", async () => {
    mocks.resolveActiveOrg.mockResolvedValue(null);
    await expect(ProposalsPage()).rejects.toThrow("redirect:/app");
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("mostra número, versão, status legível e valor na moeda da proposta", async () => {
    mocks.get.mockResolvedValue({ data: [{
      id: "proposta-a", titulo: "Consultoria", status: "enviada", total_cents: 24990,
      moeda: "MXN", numero: 7, ano: 2026, versao: 2, created_at: "2026-09-17T00:00:00Z",
    }] });
    render(await ProposalsPage());
    expect(await screen.findByText("0007/2026 v2")).toBeInTheDocument();
    expect(screen.getByText("Enviada")).toBeInTheDocument();
    expect(screen.getByText("$249.90")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Consultoria" })).toHaveAttribute("href", "/app/proposals/proposta-a");
  });

  it("distingue erro de lista vazia e permite tentar novamente", async () => {
    mocks.get.mockRejectedValueOnce(new Error("indisponível")).mockResolvedValueOnce({ data: [] });
    render(await ProposalsPage());
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha ao listar propostas.");
    expect(screen.queryByText("Nenhuma proposta cadastrada ainda.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByText("Nenhuma proposta cadastrada ainda.");
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("aborta a consulta ao desmontar a lista", async () => {
    mocks.get.mockImplementation(() => new Promise(() => {}));
    const { unmount } = render(await ProposalsPage());
    const signal = mocks.get.mock.calls[0]?.[1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it("não reaproveita propostas da organização anterior", async () => {
    mocks.get.mockResolvedValueOnce({ data: [{
      id: "proposta-a", titulo: "Somente A", status: "rascunho", total_cents: 1000,
      moeda: "BRL", numero: null, ano: null, versao: 1, created_at: "2026-09-17T00:00:00Z",
    }] });
    const { rerender } = render(await ProposalsPage());
    await screen.findByText("Somente A");
    mocks.resolveActiveOrg.mockResolvedValue({ orgId: "org-b", role: "viewer" });
    await act(async () => { rerender(await ProposalsPage()); });
    await waitFor(() => expect(screen.queryByText("Somente A")).not.toBeInTheDocument());
    expect(await screen.findByText("Nenhuma proposta cadastrada ainda.")).toBeInTheDocument();
  });
});
