/**
 * Ligar ou desligar Propostas em Configurações muda o MENU (sidebar, ⌘K), que
 * vem de `activeOrg.capacidades_ligadas`, montado no layout de `/app`. O layout
 * é compartilhado e não re-renderiza numa navegação comum: sem `router.refresh()`
 * depois de salvar, quem liga não vê a porta até dar F5, e quem desliga fica
 * com um link que leva a 404.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: mocks.get, patch: mocks.patch } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { ProposalsSettingsClient } from "@/app/app/settings/tenant/proposals/_client";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Configurações › Propostas", () => {
  it("salvar com sucesso recarrega o layout (o menu passa a refletir a chave)", async () => {
    mocks.get.mockResolvedValue({ data: { enabled: false, default_valid_days: 15, default_conditions: null } });
    mocks.patch.mockResolvedValue({ data: { ok: true } });
    render(
      <IdiomaProvider locale="pt-BR">
        <ProposalsSettingsClient />
      </IdiomaProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  });

  it("salvar que falha não recarrega", async () => {
    mocks.get.mockResolvedValue({ data: { enabled: false, default_valid_days: 15, default_conditions: null } });
    mocks.patch.mockRejectedValue(new Error("boom"));
    render(
      <IdiomaProvider locale="pt-BR">
        <ProposalsSettingsClient />
      </IdiomaProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
