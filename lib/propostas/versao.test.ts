import { describe, expect, it } from "vitest";
import { decidirVersao, decidirRevisao } from "./versao";
import type { ProposalRow } from "./tipos";

function proposta(over: Partial<ProposalRow> = {}): ProposalRow {
  return {
    id: "p1", organization_id: "org-1", lead_id: "lead-1", contact_id: "contact-1", status: "rascunho",
    numero: null, ano: null, versao: 1, substitui_id: null, revision: 1, total_cents: 1000,
    message_id: null, ultima_falha_envio: null, destinatario_nome: null,
    ...over,
  };
}

describe("decidirVersao (edição — PATCH e envio)", () => {
  it("rascunho: patch no mesmo registro", () => {
    expect(decidirVersao(proposta({ status: "rascunho" }))).toEqual({ tipo: "patch_no_mesmo" });
  });

  it("enviada: NÃO cria mais v2 aqui — lança (C4, D4: isso agora é revisar, não enviar)", () => {
    expect(() => decidirVersao(proposta({ status: "enviada", numero: 1, ano: 2026 }))).toThrow(/status_nao_editavel/);
  });

  it("qualquer outro status: lança", () => {
    for (const status of ["aceita", "recusada", "vencida", "cancelada", "substituida", "enviando"] as const) {
      expect(() => decidirVersao(proposta({ status }))).toThrow(/status_nao_editavel/);
    }
  });
});

describe("decidirRevisao (D4 — só proposta ENVIADA pode virar v2 em rascunho)", () => {
  it("enviada com numero/ano: devolve o que a v2 precisa herdar", () => {
    const r = decidirRevisao(proposta({ status: "enviada", numero: 42, ano: 2026, versao: 1, id: "v1-id" }));
    expect(r).toEqual({ herdaNumero: 42, herdaAno: 2026, novaVersao: 2, substituiId: "v1-id" });
  });

  it("rascunho: lança (já é editável pela PATCH, não precisa de revisão)", () => {
    expect(() => decidirRevisao(proposta({ status: "rascunho" }))).toThrow(/nao_pode_revisar/);
  });

  it("qualquer status que não seja enviada: lança", () => {
    for (const status of ["aceita", "recusada", "vencida", "cancelada", "substituida", "enviando"] as const) {
      expect(() => decidirRevisao(proposta({ status }))).toThrow(/nao_pode_revisar/);
    }
  });

  it("enviada sem numero/ano (estado inconsistente): lança, não inventa número", () => {
    expect(() => decidirRevisao(proposta({ status: "enviada", numero: null, ano: null }))).toThrow(/estado_inconsistente/);
  });
});
