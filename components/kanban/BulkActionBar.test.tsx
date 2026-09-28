import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BulkActionBar } from "./BulkActionBar";

const get = vi.hoisted(() => vi.fn());
const bulkMutate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/client", () => ({ apiClient: { get, post: vi.fn(), patch: vi.fn() } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useUser: () => ({ id: "u1", is_platform_admin: false }),
  useActiveOrg: () => ({ role: "manager" }),
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({ useAssignableMembers: () => ({ data: [] }) }));
vi.mock("@/hooks/kanban/useBulkAction", () => ({
  useBulkAction: () => ({ mutate: bulkMutate, isPending: false }),
}));

const STAGES = [{ id: "s1", name: "Novo" }] as never;

describe("BulkActionBar — D10, aviso agregado ao excluir em lote", () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue({ data: [] });
    bulkMutate.mockReset();
  });

  it("algum dos negocios selecionados tem proposta enviada: avisa na confirmacao", async () => {
    get.mockImplementation(async (url: string) =>
      url.includes("lead-1") ? { data: [{ status: "enviada" }] } : { data: [] },
    );
    const user = userEvent.setup();
    render(
      <BulkActionBar
        selectedIds={["lead-1", "lead-2"]}
        stages={STAGES}
        pipelineId="p-1"
        tagsExistentes={[]}
        onClear={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(screen.getByText(/continuam disponíveis em Propostas/i)).toBeInTheDocument());
  });

  it("nenhum negocio selecionado tem proposta enviada: sem aviso extra", async () => {
    get.mockResolvedValue({ data: [] });
    const user = userEvent.setup();
    render(
      <BulkActionBar
        selectedIds={["lead-1", "lead-2"]}
        stages={STAGES}
        pipelineId="p-1"
        tagsExistentes={[]}
        onClear={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Excluir" }));
    await screen.findByText("Esta ação remove o que está selecionado. Não pode ser desfeita.");
    expect(screen.queryByText(/continuam disponíveis em Propostas/i)).not.toBeInTheDocument();
  });
});
