/**
 * A capacidade que a ORGANIZAÇÃO desligou (ex.: Propostas nasce desligada) não
 * é "capacidade que não existe mais nesta versão do sistema". O primeiro agente
 * de toda organização nasce com o pacote `vender`, que traz
 * `crm_draft_proposal`; sem esta distinção, toda instalação nova via na tela do
 * agente um aviso falso, com o nome interno e um botão "Desligar".
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { ToolPicker } from "@/app/app/ai/agents/[id]/_components/ToolPicker";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));

const BUSCA = {
  id: "crm_search_contacts",
  description: "Busca contatos.",
  category: "read",
  requires_role: "viewer",
  requires_scope: "mcp:read",
  rotulo: "Buscar contatos",
  explicacao: "Encontra o contato certo.",
  o_que_toca: "Contatos",
  risco: "seguro",
  pacotes: ["atender"],
  marcavel: true,
  motivo_nao_marcavel: null,
};

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.get.mockResolvedValue({
    data: { tools: [BUSCA], desligadas_pela_organizacao: ["crm_draft_proposal"] },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
});

function abrir(value: string[]) {
  return render(
    <IdiomaProvider locale="pt-BR">
      <QueryClientProvider client={client}>
        <ToolPicker value={value} onChange={() => undefined} />
      </QueryClientProvider>
    </IdiomaProvider>,
  );
}

describe("ToolPicker — capacidade desligada pela organização", () => {
  it("não chama de 'não existe mais' e diz onde se liga", async () => {
    abrir(["crm_search_contacts", "crm_draft_proposal"]);
    await waitFor(() => expect(screen.getByTestId("capacidades-desligadas-pela-organizacao")).toBeTruthy());
    expect(screen.queryByTestId("capacidades-orfas")).toBeNull();
    expect(screen.getByTestId("capacidades-desligadas-pela-organizacao").textContent).toContain(
      "Configurações › Propostas",
    );
  });

  it("capacidade que o servidor não conhece continua sendo órfã (controle)", async () => {
    abrir(["crm_search_contacts", "crm_que_nao_existe"]);
    await waitFor(() => expect(screen.getByTestId("capacidades-orfas")).toBeTruthy());
    expect(screen.queryByTestId("capacidades-desligadas-pela-organizacao")).toBeNull();
  });
});
