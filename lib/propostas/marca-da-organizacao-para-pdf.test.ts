import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { marcaDaOrganizacaoParaPdf } from "./marca-da-organizacao-para-pdf";

function montarSupabase(settings: unknown) {
  const chain = {
    select: vi.fn(function (this: typeof chain) { return this; }),
    eq: vi.fn(function (this: typeof chain) { return this; }),
    maybeSingle: vi.fn(async () => ({ data: { settings }, error: null })),
  };
  return { from: vi.fn(() => chain) } as unknown as SupabaseClient;
}

describe("marcaDaOrganizacaoParaPdf", () => {
  it("organização SEM marca configurada: tudo null (nunca cai para instalação/produto)", async () => {
    const db = montarSupabase(null);
    expect(await marcaDaOrganizacaoParaPdf(db, "org-1")).toEqual({ appName: null, accentHex: null, logoUrl: null });
  });

  it("organização com app_name e accent_hex configurados: devolve os dois", async () => {
    const db = montarSupabase({ branding: { app_name: "Clínica Vale", accent_hex: "#0EA5E9", logo_path: null } });
    const r = await marcaDaOrganizacaoParaPdf(db, "org-1");
    expect(r.appName).toBe("Clínica Vale");
    expect(r.accentHex).toBe("#0EA5E9");
  });

  it("accent_hex vazio/espaços: vira null, nunca uma string vazia (Review Focus 4)", async () => {
    const db = montarSupabase({ branding: { app_name: "x", accent_hex: "   ", logo_path: null } });
    const r = await marcaDaOrganizacaoParaPdf(db, "org-1");
    expect(r.accentHex).toBeNull();
  });

  it("settings malformado: degrada para tudo null, nunca lança", async () => {
    const db = montarSupabase("string-invalida");
    await expect(marcaDaOrganizacaoParaPdf(db, "org-1")).resolves.toEqual({ appName: null, accentHex: null, logoUrl: null });
  });
});
