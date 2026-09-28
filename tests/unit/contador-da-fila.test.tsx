/**
 * O número ao lado de "Inbox" no menu: quantas conversas esperam uma PESSOA.
 *
 * Medido numa loja (26/09/2026): a IA passou duas conversas para a equipe numa
 * manhã (cliente irritado, reclamação) e o dono só soube abrindo o Inbox e
 * procurando. Ele pediu para ver as transferências no menu.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const contagem: { fila?: number; unassigned: number } = { unassigned: 0 };
vi.mock("@/hooks/auth/AuthProvider", () => ({ useAuth: () => ({ activeOrg: { orgId: "org-1" } }) }));
vi.mock("@/hooks/inbox/useConversationCounts", () => ({
  useConversationCounts: () => ({ data: { ...contagem, mine: 0, all: 0 } }),
}));

import { ContadorDaFila } from "@/components/shell/ContadorDaFila";
import { sidebarGroups } from "@/lib/navigation/registry";

describe("contador da fila no menu", () => {
  it("mostra quantas conversas esperam uma pessoa", () => {
    contagem.fila = 2;
    render(<ContadorDaFila compacto={false} />);
    expect(screen.getByTestId("contador-da-fila").textContent).toBe("2");
  });

  it("lê o nome antigo quando a rota ainda não manda `fila`", () => {
    delete contagem.fila;
    contagem.unassigned = 3;
    render(<ContadorDaFila compacto={false} />);
    expect(screen.getAllByTestId("contador-da-fila").at(-1)?.textContent).toBe("3");
  });

  it("sem ninguém esperando, não desenha nada — número zero treina a ignorar o número", () => {
    contagem.fila = 0;
    contagem.unassigned = 0;
    const { container } = render(<ContadorDaFila compacto={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("Inbox está no menu com o contador da fila declarado", () => {
    const atendimento = sidebarGroups(true, null).find((g) => g.group.id === "atendimento");
    expect(atendimento?.items.find((i) => i.href === "/app/inbox")?.contador).toBe("fila");
  });
});
