import { describe, expect, it } from "vitest";

import { recuperarPropostasTravadas } from "./route";

interface LinhaFalsa {
  id: string;
  organization_id: string;
  status: string;
  message_id?: string | null;
}

/**
 * Banco falso mínimo, mas que HONRA os filtros de verdade: o SELECT só
 * devolve linhas com `status = 'enviando'` (a sonda), e o UPDATE só toca
 * linha cujo status AINDA seja `enviando` no momento da escrita (a trava
 * atômica) — nunca as que a sonda listou. É essa diferença que prova o claim:
 * ignorar o `.eq("status","enviando")` do UPDATE faria o teste de corrida
 * (abaixo) reverter uma proposta que já tinha confirmado.
 *
 * `apósSelecionar` roda DEPOIS que a sonda já capturou seu retrato (mas antes
 * do UPDATE) — é o gancho que simula o ack chegando NO MEIO da rodada do cron.
 */
function bancoFalso(linhas: LinhaFalsa[], apósSelecionar?: () => void, mensagens: Record<string, string> = {}) {
  const avisos: Array<{ organization_id: string }> = [];
  const admin = {
    from: (tabela: string) => {
      if (tabela === "messages") {
        return {
          select: () => ({
            in: async (_c: string, ids: string[]) => ({
              data: ids.filter((id) => id in mensagens).map((id) => ({ id, status: mensagens[id] })),
              error: null,
            }),
          }),
        };
      }
      if (tabela === "crm_proposals") {
        return {
          select: () => ({
            eq: (_c: string, _v: string) => ({
              lt: () => ({
                limit: async () => {
                  const retrato = linhas
                    .filter((l) => l.status === "enviando")
                    .map((l) => ({ id: l.id, organization_id: l.organization_id, message_id: l.message_id ?? null }));
                  apósSelecionar?.();
                  return { data: retrato, error: null };
                },
              }),
            }),
          }),
          update: (_dados: unknown) => ({
            in: (_c: string, ids: string[]) => ({
              eq: (campo: string, valor: string) => ({
                select: async () => {
                  if (campo !== "status" || valor !== "enviando") throw new Error("UPDATE sem a trava .eq('status','enviando')");
                  const alvo = linhas.filter((l) => ids.includes(l.id) && l.status === "enviando");
                  for (const l of alvo) l.status = "rascunho";
                  return { data: alvo.map((l) => ({ id: l.id })), error: null };
                },
              }),
            }),
          }),
        };
      }
      if (tabela === "agent_inbox_items") {
        return { insert: async (linha: { organization_id: string }) => { avisos.push(linha); return { error: null }; } };
      }
      throw new Error(`tabela inesperada: ${tabela}`);
    },
  };
  return { admin: admin as never, avisos, linhas };
}

describe("recuperarPropostasTravadas", () => {
  it("volta a rascunho proposta presa em enviando ha mais de 5 minutos, sem reenviar nada", async () => {
    const { admin } = bancoFalso([{ id: "prop-1", organization_id: "org-1", status: "enviando" }]);
    const result = await recuperarPropostasTravadas(admin, new Date(), "req-1");
    expect(result).toEqual({ scanned: 1, revertidas: 1, organizations: 1 });
  });

  it("nao mexe em nada quando nao ha proposta presa", async () => {
    const { admin } = bancoFalso([]);
    const result = await recuperarPropostasTravadas(admin, new Date(), "req-1");
    expect(result).toEqual({ scanned: 0, revertidas: 0, organizations: 0 });
  });

  it("agrupa por organizacao: duas propostas da mesma org geram UM aviso, nao dois", async () => {
    const { admin, avisos } = bancoFalso([
      { id: "prop-1", organization_id: "org-1", status: "enviando" },
      { id: "prop-2", organization_id: "org-1", status: "enviando" },
    ]);
    const result = await recuperarPropostasTravadas(admin, new Date(), "req-1");
    expect(result).toEqual({ scanned: 2, revertidas: 2, organizations: 1 });
    expect(avisos.length).toBe(1);
  });

  it("corrida: a mensagem confirmou entre o SELECT e o UPDATE — a trava .eq('status','enviando') protege, não reverte", async () => {
    const linhas: LinhaFalsa[] = [{ id: "prop-1", organization_id: "org-1", status: "enviando" }];
    const { admin, avisos } = bancoFalso(linhas, () => {
      linhas[0]!.status = "enviada"; // o ack chega ENTRE o SELECT e o UPDATE.
    });

    const result = await recuperarPropostasTravadas(admin, new Date(), "req-1");
    expect(result).toEqual({ scanned: 1, revertidas: 0, organizations: 0 });
    expect(avisos.length).toBe(0);
    expect(linhas[0]!.status).toBe("enviada"); // continua enviada — não foi revertida.
  });

  it("mensagem ainda 'queued' (sem credencial, o agent-engine reagenda): nao reverte, nao e' presa de verdade (I1)", async () => {
    const linhas: LinhaFalsa[] = [{ id: "prop-1", organization_id: "org-1", status: "enviando", message_id: "msg-1" }];
    const { admin, avisos } = bancoFalso(linhas, undefined, { "msg-1": "queued" });

    const result = await recuperarPropostasTravadas(admin, new Date(), "req-1");
    expect(result).toEqual({ scanned: 1, revertidas: 0, organizations: 0 });
    expect(avisos.length).toBe(0);
    expect(linhas[0]!.status).toBe("enviando"); // continua tentando — não é presa de verdade.
  });

  it("mensagem 'failed' de verdade: reverte normalmente", async () => {
    const linhas: LinhaFalsa[] = [{ id: "prop-1", organization_id: "org-1", status: "enviando", message_id: "msg-1" }];
    const { admin, avisos } = bancoFalso(linhas, undefined, { "msg-1": "failed" });

    const result = await recuperarPropostasTravadas(admin, new Date(), "req-1");
    expect(result).toEqual({ scanned: 1, revertidas: 1, organizations: 1 });
    expect(avisos.length).toBe(1);
    expect(linhas[0]!.status).toBe("rascunho");
  });

  it("sem message_id (processo morreu antes de enviar): reverte normalmente", async () => {
    const linhas: LinhaFalsa[] = [{ id: "prop-1", organization_id: "org-1", status: "enviando", message_id: null }];
    const { admin } = bancoFalso(linhas);

    const result = await recuperarPropostasTravadas(admin, new Date(), "req-1");
    expect(result).toEqual({ scanned: 1, revertidas: 1, organizations: 1 });
  });
});
