// app/app/proposals/_client.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ apiClient: { get } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

import { ProposalsClient } from "./_client";

const base = { total_cents: 0, moeda: "BRL", numero: null, ano: null, versao: 1 };

describe("lista de propostas", () => {
  it("rascunho da IA vem primeiro e diz que aguarda revisão", async () => {
    get.mockResolvedValue({
      data: [
        { ...base, id: "a", titulo: "Enviada antiga", status: "enviada", drafted_by_agent_id: null, created_at: "2026-09-27T00:00:00Z" },
        { ...base, id: "b", titulo: "Da IA", status: "rascunho", drafted_by_agent_id: "ag-1", created_at: "2026-09-20T00:00:00Z" },
        { ...base, id: "c", titulo: "Manual", status: "rascunho", drafted_by_agent_id: null, created_at: "2026-09-26T00:00:00Z" },
      ],
    });
    render(<ProposalsClient podeCriar={false} />);
    await waitFor(() => expect(screen.getByText("Da IA")).toBeInTheDocument());
    const titulos = screen.getAllByRole("link").map((l) => l.textContent);
    expect(titulos.indexOf("Da IA")).toBeLessThan(titulos.indexOf("Enviada antiga"));
    expect(screen.getByText("Aguardando revisão")).toBeInTheDocument();
    expect(screen.getAllByText("Aguardando revisão")).toHaveLength(1);
  });
});
