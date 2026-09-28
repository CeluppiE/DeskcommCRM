/**
 * O vigia de saúde pergunta se a conexão está de pé — e uma linha de seed do
 * e2e não é conexão de ninguém (#1032).
 *
 * ─── O defeito ──────────────────────────────────────────────────────────────
 *
 * Os seeds do e2e gravam em `channel_sessions` e nada os remove. O cron de
 * saúde varre a tabela inteira, acha a linha, pergunta ao transporte — e, com
 * o status dela entre os que avisam (`STOPPED`, `SCAN_QR_CODE`, `FAILED`),
 * abre aviso na Central de quem opera. Resíduo de suíte vira alarme permanente
 * na tela de uma instalação de verdade; e é o alarme que ninguém lê que faz o
 * alarme verdadeiro deixar de ser lido.
 *
 * ─── Os dois caminhos, uma categoria só ─────────────────────────────────────
 *
 *   - o cron PERGUNTA (`app/api/v1/cron/channel-health/route.ts`) → aqui se
 *     prova que ele não pergunta da seed e que a conexão real continua sendo
 *     perguntada;
 *   - a faixa do topo anuncia conexão caída (`listarConexoesCaidas`, em
 *     `lib/channels/health.ts`) → aqui se prova que ela não anuncia a seed e
 *     que a conexão real CAÍDA segue anunciada.
 *
 * São casos EXECUTADOS, não lidos do fonte: o sabote `if (false)` antes do
 * `adapter.checkHealth` deixa o primeiro caso vermelho, e uma cópia da lista de
 * nomes dentro da rota também — o que o vigia usa é a lista do módulo, que o
 * outro teste da classe já prende.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/cron/channel-health/route";
import { listarConexoesCaidas } from "@/lib/channels/health";
import { NOMES_DE_SESSAO_E2E } from "@/lib/channels/sessoes-e2e";

const duble = vi.hoisted(() => {
  type Linha = Record<string, unknown>;
  type Resultado = { data: Linha[]; error: null };

  const estado = {
    linhas: [] as Linha[],
    ops: [] as { tabela: string; op: string; payload?: unknown }[],
    /** O que o vigia checou, sessão a sessão — é esta lista que decide o caso. */
    perguntas: [] as string[],
  };

  /**
   * O select É aplicado: se a coluna que identifica a seed sumir da consulta,
   * a linha volta sem ela, não é reconhecida como seed e o caso reprova — que
   * é exatamente o defeito que uma fake que devolve a linha inteira esconderia.
   */
  function projetar(colunas: string, linhas: Linha[]): Linha[] {
    const chaves = colunas
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    return linhas.map((l) => Object.fromEntries(chaves.map((k) => [k, l[k]])));
  }

  interface Cadeia {
    select(colunas?: string): Cadeia;
    eq(coluna: string, valor: unknown): Cadeia;
    is(coluna: string, valor: unknown): Cadeia;
    in(coluna: string, valores: readonly unknown[]): Cadeia;
    limit(n: number): Cadeia;
    insert(payload?: unknown): Cadeia;
    update(payload?: unknown): Cadeia;
    upsert(payload?: unknown): Cadeia;
    maybeSingle(): Promise<{ data: unknown; error: null }>;
    then<T = Resultado>(
      cumprido?: (valor: Resultado) => T | PromiseLike<T>,
      recusado?: (motivo: unknown) => T | PromiseLike<T>,
    ): Promise<T>;
  }

  const admin = {
    from(tabela: string) {
      let colunas = "*";
      const cadeia: Cadeia = {
        select(c?: string) {
          if (c) colunas = c;
          return cadeia;
        },
        eq: () => cadeia,
        is: () => cadeia,
        in: () => cadeia,
        limit: () => cadeia,
        insert(payload?: unknown) {
          estado.ops.push({ tabela, op: "insert", payload });
          return cadeia;
        },
        update(payload?: unknown) {
          estado.ops.push({ tabela, op: "update", payload });
          return cadeia;
        },
        upsert(payload?: unknown) {
          estado.ops.push({ tabela, op: "upsert", payload });
          return cadeia;
        },
        maybeSingle: async () => ({ data: null, error: null }),
        then(cumprido, recusado) {
          const dados: Resultado = {
            data: tabela === "channel_sessions" ? projetar(colunas, estado.linhas) : [],
            error: null,
          };
          return Promise.resolve(dados).then(cumprido, recusado);
        },
      };
      return cadeia;
    },
  };

  return { estado, admin };
});

vi.mock("@/lib/env", () => ({
  env: { INTERNAL_CRON_SECRET: "segredo-do-vigia", INTERNAL_SECRET: "segredo-interno" },
}));

vi.mock("@/lib/logger", () => ({ logger: { error: () => undefined, warn: () => undefined } }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => duble.admin }));

// O seam inteiro, dublado: a rota só enxerga o que este módulo entrega, e é o
// que torna a pergunta observável sem depender de transporte nenhum.
vi.mock("@/lib/channels", () => ({
  CHANNEL_SESSION_REF_COLUMNS: "provider, waha_session_name, meta_phone_number_id, zernio_account_id",
  DEFAULT_CHANNEL_PROVIDER: "waha",
  canalConhecidoSemMensagem: () => false,
  resolveSessionRef: (s: {
    waha_session_name?: string | null;
    meta_phone_number_id?: string | null;
    zernio_account_id?: string | null;
  }) => s.waha_session_name ?? s.meta_phone_number_id ?? s.zernio_account_id ?? null,
  getAdapter: () => ({
    checkHealth: async ({ sessionRef }: { organizationId: string; sessionRef: string }) => {
      duble.estado.perguntas.push(sessionRef);
      // A realidade do resíduo: a linha de seed fica parada (`STOPPED`) — é o
      // status que abre aviso na Central.
      const status = sessionRef === NOMES_DE_SESSAO_E2E[2] ? "STOPPED" : "WORKING";
      return { reachable: true, status, detail: null };
    },
  }),
}));

const SESSAO_DE_SEED: Linha = {
  id: "sess-e2e",
  organization_id: "org-1",
  status: "STOPPED",
  display_name: "Número Conectado E2E",
  phone_number: null,
  archived_at: null,
  provider: "waha",
  waha_session_name: NOMES_DE_SESSAO_E2E[2],
  meta_phone_number_id: null,
  zernio_account_id: null,
};

const SESSAO_REAL: Linha = {
  id: "sess-real",
  organization_id: "org-1",
  // Caída de verdade: é o caso em que o vigia tem de Gritar.
  status: "STOPPED",
  display_name: "Comercial",
  phone_number: "+5511999990001",
  archived_at: null,
  provider: "waha",
  waha_session_name: "org_12345678_comercial",
  meta_phone_number_id: null,
  zernio_account_id: null,
};

type Linha = Record<string, unknown>;

function requisicao(): NextRequest {
  return new NextRequest("http://localhost/api/v1/cron/channel-health", {
    headers: { authorization: "Bearer segredo-do-vigia" },
  });
}

beforeEach(() => {
  duble.estado.linhas = [SESSAO_DE_SEED, SESSAO_REAL];
  duble.estado.ops = [];
  duble.estado.perguntas = [];
});

describe("o vigia de saúde ignora a sessão de seed (#1032)", () => {
  it("o cron não pergunta a saúde da seed — e continua perguntando a da conexão real", async () => {
    const res = await GET(requisicao());
    const corpo = (await res.json()) as {
      data: { sessoes: number; verificadas: number; ignoradas: number };
    };

    // Só a conexão real foi consultada no transporte.
    expect(duble.estado.perguntas).toEqual([SESSAO_REAL.waha_session_name]);
    expect(corpo.data.verificadas).toBe(1);
    expect(corpo.data.ignoradas).toBe(1);

    // E a seed não virou aviso na Central: sem pergunta não há episódio, e a
    // única escrita desta rodada seria justamente o `insert` do alerta dela.
    const avisos = duble.estado.ops.filter((o) => o.tabela === "agent_inbox_items");
    expect(avisos).toEqual([]);
  });

  it("a faixa do topo não anuncia a seed — e segue anunciando a conexão real caída", async () => {
    const conexoes = await listarConexoesCaidas(duble.admin as never, "org-1");

    expect(conexoes).toEqual([
      { id: "sess-real", apelido: "Comercial", status: "STOPPED" },
    ]);
  });
});
