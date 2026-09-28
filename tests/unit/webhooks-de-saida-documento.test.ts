// @vitest-environment node
/**
 * O exemplo do guia de integração FUNCIONA (#1529).
 *
 * `docs/integracao/webhooks-de-saida.md` é o que um integrador copia para o
 * próprio sistema. Um exemplo que parece certo e não confere a assinatura é
 * pior que nenhum: quem copia conclui que o CRM assina errado. Por isso o bloco
 * em Node do documento é EXTRAÍDO e executado num processo node de verdade
 * contra o vetor de referência — o mesmo que o guia publica e que
 * `lib/automation/actions/call-webhook.test.ts` confere no emissor.
 *
 * A tabela da §7 do guia (o vetor que o integrador copia) é LIDA do documento e
 * comparada com o VETOR daqui, e o VETOR é recalculado pelo emissor
 * (`assinaturaComCarimbo`) e pelo HMAC do corpo: um dígito trocado no guia, ou
 * um corpo de exemplo editado só de um lado, deixa o teste vermelho.
 *
 * O bloco em Python recebe o mesmo tratamento quando há um interpretador na
 * máquina (no CI Linux há `python3`); sem ele, o caso é pulado e não conta.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assinaturaComCarimbo } from "@/lib/automation/actions/call-webhook";

const GUIA = readFileSync(
  join(process.cwd(), "docs", "integracao", "webhooks-de-saida.md"),
  "utf8",
);

const VETOR = {
  segredo: "segredo-de-exemplo-nao-use-em-producao",
  t: 1767225600,
  entrega: "209f529f-3a34-5ccb-9486-5e20cd48fb45",
  corpo:
    '{"event":"lead.created","occurred_at":"2026-01-01T00:00:00.000Z","happened_at":"2025-12-31T21:00:00.000Z","delivery_id":"209f529f-3a34-5ccb-9486-5e20cd48fb45","data":{"lead":{"id":"lead-1"}}}',
  v1: "bccb00c040649c7e2618d9cd4a3bc79ade96d5dd939c0fb11f26064c538e57a5",
  legada: "6aa08c69080a291fadcdd6913d78e79dbd2705a95b3cf87c8a0018491a1a8dab",
};

/** As linhas `| rótulo | `valor` |` da §7 do guia, na ordem em que aparecem. */
function tabelaDoVetorNoGuia(): string[] {
  const secao = GUIA.split(/^## 7\. /m)[1]?.split(/^## /m)[0];
  if (!secao) throw new Error("o guia não tem mais a seção 7 (vetor de referência)");
  return [...secao.matchAll(/^\|[^|\n]*\| `([^\n]*)` \|\r?$/gm)].map((m) => m[1] ?? "");
}

function blocoDoGuia(linguagem: string, marcador: string): string {
  const blocos = [...GUIA.matchAll(new RegExp("```" + linguagem + "\\n([\\s\\S]*?)```", "g"))].map(
    (m) => m[1] ?? "",
  );
  const bloco = blocos.find((b) => b.includes(marcador));
  if (!bloco) throw new Error(`o guia não tem mais o bloco ${linguagem} com "${marcador}"`);
  return bloco;
}

type Caso = {
  nome: string;
  agora: number;
  corpo: string;
  entrega: string;
  /** `X-Webhook-Signature`; `null` = o cabeçalho não veio. */
  assinatura: string | null;
  /** `X-Webhook-Timestamp`, que NÃO é assinado; ausente = não veio. */
  carimbo?: number;
  /** `X-Deskcomm-Signature` legado; ausente = não veio. */
  legada?: string;
  esperado: boolean;
};

const valida = `t=${VETOR.t},v1=${VETOR.v1}`;
const CASOS: Caso[] = [
  {
    nome: "válida, 10 s depois",
    agora: VETOR.t + 10,
    corpo: VETOR.corpo,
    entrega: VETOR.entrega,
    assinatura: valida,
    esperado: true,
  },
  {
    nome: "válida, 300 s depois (limite)",
    agora: VETOR.t + 300,
    corpo: VETOR.corpo,
    entrega: VETOR.entrega,
    assinatura: valida,
    esperado: true,
  },
  {
    nome: "velha: 301 s depois",
    agora: VETOR.t + 301,
    corpo: VETOR.corpo,
    entrega: VETOR.entrega,
    assinatura: valida,
    esperado: false,
  },
  {
    nome: "do futuro: 301 s antes",
    agora: VETOR.t - 301,
    corpo: VETOR.corpo,
    entrega: VETOR.entrega,
    assinatura: valida,
    esperado: false,
  },
  {
    nome: "corpo alterado",
    agora: VETOR.t,
    corpo: VETOR.corpo.replace("lead-1", "lead-2"),
    entrega: VETOR.entrega,
    assinatura: valida,
    esperado: false,
  },
  {
    nome: "delivery trocado",
    agora: VETOR.t,
    corpo: VETOR.corpo,
    entrega: "00000000-0000-5000-8000-000000000000",
    assinatura: valida,
    esperado: false,
  },
  {
    nome: "v1 adulterado",
    agora: VETOR.t,
    corpo: VETOR.corpo,
    entrega: VETOR.entrega,
    assinatura: `t=${VETOR.t},v1=${"0".repeat(64)}`,
    esperado: false,
  },
  {
    nome: "chave desconhecida é ignorada",
    agora: VETOR.t,
    corpo: VETOR.corpo,
    entrega: VETOR.entrega,
    assinatura: `${valida},v9=abc`,
    esperado: true,
  },
  {
    // Repetição com o cabeçalho solto trocado: a janela é medida pelo `t`
    // assinado, e o X-Webhook-Timestamp atual não salva a requisição velha.
    nome: "velha com X-Webhook-Timestamp trocado pela hora atual",
    agora: VETOR.t + 86_400,
    corpo: VETOR.corpo,
    entrega: VETOR.entrega,
    assinatura: valida,
    carimbo: VETOR.t + 86_400,
    esperado: false,
  },
  {
    // Rebaixamento: a X-Webhook-Signature apagada e o legado (válido) mantido.
    nome: "sem X-Webhook-Signature, só com o legado válido",
    agora: VETOR.t,
    corpo: VETOR.corpo,
    entrega: VETOR.entrega,
    assinatura: null,
    legada: VETOR.legada,
    esperado: false,
  },
];

/** Os cabeçalhos de um caso, com os nomes em minúsculas (como o Node entrega). */
function cabecalhosDoCaso(c: Caso): Record<string, string> {
  const cab: Record<string, string> = { "x-webhook-delivery": c.entrega };
  if (c.assinatura !== null) cab["x-webhook-signature"] = c.assinatura;
  if (c.carimbo !== undefined) cab["x-webhook-timestamp"] = String(c.carimbo);
  if (c.legada !== undefined) cab["x-deskcomm-signature"] = c.legada;
  return cab;
}

describe("guia de webhooks de saída: os exemplos conferem o vetor de referência", () => {
  it("a tabela da §7 publica exatamente o VETOR, e o emissor produz essas assinaturas", () => {
    expect(tabelaDoVetorNoGuia()).toEqual([
      VETOR.segredo,
      String(VETOR.t),
      VETOR.entrega,
      VETOR.corpo,
      `t=${VETOR.t},v1=${VETOR.v1}`,
      VETOR.legada,
    ]);
    expect(assinaturaComCarimbo(VETOR.segredo, VETOR.t, VETOR.entrega, VETOR.corpo)).toBe(
      `t=${VETOR.t},v1=${VETOR.v1}`,
    );
    expect(createHmac("sha256", VETOR.segredo).update(VETOR.corpo).digest("hex")).toBe(
      VETOR.legada,
    );
  });

  it("o exemplo em Node, executado num processo node real", () => {
    const harness = `
const casos = JSON.parse(process.env.CASOS);
const saida = casos.map((c) => verificarWebhook({
  segredo: ${JSON.stringify(VETOR.segredo)},
  cabecalhos: c.cabecalhos,
  corpoCru: c.corpo,
  agoraEmSegundos: c.agora,
}));
process.stdout.write(JSON.stringify(saida));
`;
    const saida = execFileSync(process.execPath, ["--input-type=module"], {
      input: blocoDoGuia("js", "export function verificarWebhook") + harness,
      env: {
        ...process.env,
        CASOS: JSON.stringify(CASOS.map((c) => ({ ...c, cabecalhos: cabecalhosDoCaso(c) }))),
      },
      encoding: "utf8",
    });
    expect(JSON.parse(saida)).toEqual(CASOS.map((c) => c.esperado));
  });

  const python = ["python3", "python"].find((cmd) => spawnSync(cmd, ["--version"]).status === 0);

  it.skipIf(!python)("o exemplo em Python, quando há interpretador", () => {
    const harness = `
import json, os, sys
casos = json.loads(os.environ["CASOS"])
saida = [
    verificar_webhook(
        ${JSON.stringify(VETOR.segredo)},
        c["cabecalhos"],
        c["corpo"].encode(),
        c["agora"],
    )
    for c in casos
]
sys.stdout.write(json.dumps(saida))
`;
    const saida = execFileSync(python as string, ["-"], {
      input: blocoDoGuia("python", "def verificar_webhook") + harness,
      env: {
        ...process.env,
        CASOS: JSON.stringify(CASOS.map((c) => ({ ...c, cabecalhos: cabecalhosDoCaso(c) }))),
      },
      encoding: "utf8",
    });
    expect(JSON.parse(saida)).toEqual(CASOS.map((c) => c.esperado));
  });
});
