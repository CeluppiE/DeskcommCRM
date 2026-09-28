/**
 * Com a capacidade "Propostas" desligada, as telas de `/app/proposals` não
 * existem para a organização: o layout chama `notFound()` antes de renderizar
 * a lista, o editor ou a tela de nova proposta. Link antigo, favorito e aviso
 * velho da Central caem na página de "não encontrado", não numa tela que
 * quebra no primeiro fetch.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capacidades: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/lib/auth/server", () => ({
  requireAuth: vi.fn(async () => ({ id: "u-1" })),
  resolveActiveOrg: vi.fn(async () => ({ orgId: "org-1", role: "admin" })),
}));
vi.mock("@/lib/organizacao/capacidades", () => ({ capacidadesDaOrganizacao: mocks.capacidades }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import PropostasLayout from "@/app/app/proposals/layout";

describe("layout de /app/proposals", () => {
  beforeEach(() => {
    mocks.capacidades.mockReset();
    mocks.notFound.mockClear();
  });

  it("desligada: notFound, sem renderizar a tela", async () => {
    mocks.capacidades.mockResolvedValue([]);
    await expect(PropostasLayout({ children: "tela" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.capacidades).toHaveBeenCalledWith(expect.anything(), "org-1");
  });

  it("ligada: renderiza os filhos (controle positivo)", async () => {
    mocks.capacidades.mockResolvedValue(["propostas"]);
    const r = await PropostasLayout({ children: "tela" });
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(JSON.stringify(r)).toContain("tela");
  });
});
