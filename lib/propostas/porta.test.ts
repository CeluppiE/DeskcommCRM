import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ capacidades: vi.fn() }));
vi.mock("@/lib/organizacao/capacidades", () => ({ capacidadesDaOrganizacao: mocks.capacidades }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { sePropostasDesligadas } from "./porta";

describe("sePropostasDesligadas", () => {
  beforeEach(() => mocks.capacidades.mockReset());

  it("ligada: deixa passar (null)", async () => {
    mocks.capacidades.mockResolvedValue(["propostas"]);
    expect(await sePropostasDesligadas("org-1", "req-1")).toBeNull();
    expect(mocks.capacidades).toHaveBeenCalledWith(expect.anything(), "org-1");
  });

  it("desligada: 404 not_found, como módulo desligado", async () => {
    mocks.capacidades.mockResolvedValue([]);
    const r = await sePropostasDesligadas("org-1", "req-1");
    expect(r?.status).toBe(404);
    expect(await r?.json()).toMatchObject({ error: { code: "not_found" } });
  });
});
