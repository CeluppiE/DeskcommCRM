import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";

import { ProposalEditorClient } from "./_client";

const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ apiClient: { get, post: vi.fn(), patch: vi.fn() } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("./_components/AssistantPanel", () => ({ AssistantPanel: () => null }));

const PROPOSTA_BASE = {
  id: "p1",
  titulo: "Proposta X",
  condicoes: null,
  valid_until: null,
  revision: 1,
  total_cents: 1000,
  itens: [],
  moeda: "BRL",
};

// P5: o DocumentoCanvas busca a lista de modelos da organização em paralelo —
// o mock roteia pela URL (a chamada de modelos devolve 1 item; o foco destes
// testes é a proposta, não o seletor).
function responderProposta(envelope: { data: unknown }) {
  const dado = envelope.data;
  get.mockImplementation(async (url: string) =>
    url.includes("/settings/proposal-templates")
      ? { data: [{ slug: "site_institucional", nome: "Site institucional" }] }
      : { data: dado },
  );
}

describe("ProposalEditorClient — desfecho do envio (D3)", () => {
  it("mostra o motivo da ultima falha de envio quando a proposta esta em rascunho com falha registrada", async () => {
    responderProposta({ data: { ...PROPOSTA_BASE, status: "rascunho", ultima_falha_envio: "canal desconectado" } });
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    await waitFor(() => expect(screen.getByText(/canal desconectado/i)).toBeInTheDocument());
  });

  it("nao mostra aviso de falha quando rascunho nunca falhou", async () => {
    responderProposta({ data: { ...PROPOSTA_BASE, status: "rascunho", ultima_falha_envio: null } });
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    await waitFor(() => expect(screen.getByDisplayValue("Proposta X")).toBeInTheDocument());
    expect(screen.queryByText(/o último envio falhou/i)).not.toBeInTheDocument();
  });

  it("mostra 'na fila do WhatsApp' quando enviando", async () => {
    responderProposta({ data: { ...PROPOSTA_BASE, status: "enviando", ultima_falha_envio: null } });
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    await waitFor(() => expect(screen.getByText(/na fila do whatsapp/i)).toBeInTheDocument());
  });

  it("item sem preço mostra 'A definir' no lugar do subtotal, nunca R$ 0,00", async () => {
    responderProposta({
      data: {
        ...PROPOSTA_BASE,
        status: "rascunho",
        ultima_falha_envio: null,
        itens: [
          { id: "i1", product_id: null, descricao: "Item a definir", quantidade: 1, preco_unitario_cents: null, desconto_cents: 0, position: 1000 },
        ],
      },
    });
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    expect(await screen.findByText("A definir")).toBeInTheDocument();
  });

  it("adicionar item manual novo: nasce com preço vazio ('A definir'), não com R$ 0,00", async () => {
    responderProposta({ data: { ...PROPOSTA_BASE, status: "rascunho", ultima_falha_envio: null } });
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    const botaoAdicionar = await screen.findByRole("button", { name: /item à mão/i });
    fireEvent.click(botaoAdicionar);
    const camposDePreco = screen.getAllByPlaceholderText("A definir");
    expect(camposDePreco.length).toBeGreaterThan(0);
  });
});

describe("ProposalEditorClient — drift de preço do catálogo (N4)", () => {
  it("item com preço de catálogo desatualizado: mostra a faixa de aviso com 'Atualizar preços' e 'Ignorar aviso', com o aviso honesto de que o preço muda ao salvar de qualquer forma (achado Importante da revisão final da C3b+E1)", async () => {
    responderProposta({
      data: {
        ...PROPOSTA_BASE,
        status: "rascunho",
        ultima_falha_envio: null,
        itens: [
          { id: "i1", product_id: "prod-1", descricao: "Item de catálogo", quantidade: 1, preco_unitario_cents: 5000, preco_catalogo_atual_cents: 6000, desconto_cents: 0, position: 1000 },
        ],
      },
    });
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    expect(await screen.findByText(/1 item mudou de preço no catálogo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /atualizar preços/i })).toBeInTheDocument();
    // O botão antigo dizia "Manter" mas nada travava — resolverItensDaProposta
    // sempre reaplica o preço do catálogo no Salvar. Não existe mais botão
    // "manter" (nenhum, nem "manter preço") — só "Ignorar aviso", honesto.
    expect(screen.queryByRole("button", { name: /^manter$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ignorar aviso/i })).toBeInTheDocument();
    expect(screen.getByText(/o preço do catálogo será aplicado de qualquer forma/i)).toBeInTheDocument();
  });

  it("clicar 'Atualizar preços': troca o preco_unitario_cents do item pelo valor atual do catálogo, localmente (não salva sozinho)", async () => {
    responderProposta({
      data: {
        ...PROPOSTA_BASE,
        status: "rascunho",
        ultima_falha_envio: null,
        itens: [
          { id: "i1", product_id: "prod-1", descricao: "Item de catálogo", quantidade: 1, preco_unitario_cents: 5000, preco_catalogo_atual_cents: 6000, desconto_cents: 0, position: 1000 },
        ],
      },
    });
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    fireEvent.click(await screen.findByRole("button", { name: /atualizar preços/i }));
    // 6000/100 = 60 no input de preço (desabilitado para item de catálogo, mas exibe o valor).
    expect(screen.getByDisplayValue("60")).toBeInTheDocument();
    // local: não chamou PATCH sozinho.
    expect(vi.mocked(apiClient.patch)).not.toHaveBeenCalled();
  });

  it("nenhum item com drift: não mostra a faixa", async () => {
    responderProposta({
      data: {
        ...PROPOSTA_BASE,
        status: "rascunho",
        ultima_falha_envio: null,
        itens: [
          { id: "i1", product_id: "prod-1", descricao: "Item de catálogo", quantidade: 1, preco_unitario_cents: 5000, preco_catalogo_atual_cents: 5000, desconto_cents: 0, position: 1000 },
        ],
      },
    });
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    await waitFor(() => expect(screen.getByDisplayValue("Proposta X")).toBeInTheDocument());
    expect(screen.queryByText(/mudou de preço no catálogo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mudaram de preço no catálogo/i)).not.toBeInTheDocument();
  });
});

describe("ProposalEditorClient — C1: enviar exige modelo confirmado", () => {
  it("sem template_slug: o botão 'Enviar ao cliente' fica desabilitado e o motivo aparece na tela", async () => {
    responderProposta({ data: { ...PROPOSTA_BASE, status: "rascunho", ultima_falha_envio: null, template_slug: null } });
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /enviar ao cliente/i })).toBeDisabled());
    expect(screen.getByText(/escolha e confirme o modelo da proposta antes de enviar/i)).toBeInTheDocument();
  });

  it("com template_slug: o botão fica disponível e o aviso some", async () => {
    responderProposta({ data: { ...PROPOSTA_BASE, status: "rascunho", ultima_falha_envio: null, template_slug: "site_institucional" } });
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /enviar ao cliente/i })).toBeEnabled());
    expect(screen.queryByText(/escolha e confirme o modelo da proposta antes de enviar/i)).not.toBeInTheDocument();
  });
});

describe("ProposalEditorClient — C2: ver como o cliente recebe", () => {
  it("o botão existe em qualquer status (é leitura: não precisa de rascunho)", async () => {
    for (const status of ["rascunho", "enviada", "aceita"]) {
      responderProposta({ data: { ...PROPOSTA_BASE, status, ultima_falha_envio: null, template_slug: "site_institucional" } });
      const { unmount } = render(<ProposalEditorClient id="p1" podeEditar={true} />);
      expect(await screen.findByRole("button", { name: /ver como o cliente recebe/i })).toBeInTheDocument();
      unmount();
    }
  });

  it("sucesso: abre o PDF numa aba nova, sem recarregar a página", async () => {
    responderProposta({ data: { ...PROPOSTA_BASE, status: "rascunho", ultima_falha_envio: null, template_slug: "site_institucional" } });
    // jsdom não implementa `URL.createObjectURL` — o duviê é instalado à mão e
    // desfeito no fim, senão ele vaza para os outros testes do arquivo.
    const createObjectURLOriginal = URL.createObjectURL;
    const abrirOriginal = window.open;
    const criarUrl = vi.fn(() => "blob:previa");
    const abrir = vi.fn();
    URL.createObjectURL = criarUrl;
    window.open = abrir;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(["%PDF"]) }) as unknown as Response),
    );
    try {
      render(<ProposalEditorClient id="p1" podeEditar={true} />);
      fireEvent.click(await screen.findByRole("button", { name: /ver como o cliente recebe/i }));
      await waitFor(() => expect(abrir).toHaveBeenCalledWith("blob:previa", "_blank", "noopener"));
    } finally {
      URL.createObjectURL = createObjectURLOriginal;
      window.open = abrirOriginal;
      vi.unstubAllGlobals();
    }
  });

  it("recusa 422: mostra a mensagem do corpo JSON no bloco de erro da tela", async () => {
    responderProposta({ data: { ...PROPOSTA_BASE, status: "rascunho", ultima_falha_envio: null, template_slug: "site_institucional" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { code: "validation_failed", message: "Escolha e confirme o modelo da proposta antes de enviar." } }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    fireEvent.click(await screen.findByRole("button", { name: /ver como o cliente recebe/i }));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/escolha e confirme o modelo/i);
    vi.unstubAllGlobals();
  });

  it("corpo que não é JSON: mostra a frase genérica, nunca silêncio", async () => {
    responderProposta({ data: { ...PROPOSTA_BASE, status: "rascunho", ultima_falha_envio: null, template_slug: "site_institucional" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>502</html>", { status: 502, headers: { "Content-Type": "text/html" } })),
    );
    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    fireEvent.click(await screen.findByRole("button", { name: /ver como o cliente recebe/i }));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Não foi possível gerar a prévia agora.");
    vi.unstubAllGlobals();
  });
});

describe("ProposalEditorClient — revisar cria a v2 (D4)", () => {
  it("proposta enviada mostra o botão 'Revisar esta proposta'", async () => {
    responderProposta({ data: { ...PROPOSTA_BASE, status: "enviada", ultima_falha_envio: null } });
    render(<ProposalEditorClient id="prop-1" podeEditar={false} />);
    expect(await screen.findByRole("button", { name: /revisar esta proposta/i })).toBeInTheDocument();
  });

  it("clicar em 'Revisar esta proposta' chama a rota e navega para a v2", async () => {
    responderProposta({ data: { ...PROPOSTA_BASE, id: "prop-1", status: "enviada", ultima_falha_envio: null } });
    const mockPost = vi.mocked(apiClient.post).mockResolvedValue({ data: { id: "v2-id" } } as never);
    render(<ProposalEditorClient id="prop-1" podeEditar={false} />);
    const botao = await screen.findByRole("button", { name: /revisar esta proposta/i });
    fireEvent.click(botao);
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith("/api/v1/proposals/prop-1/revise", {}));
  });

  it("proposta rascunho/aceita/recusada/vencida: NÃO mostra o botão de revisar", async () => {
    for (const status of ["rascunho", "aceita", "recusada", "vencida"]) {
      responderProposta({ data: { ...PROPOSTA_BASE, status, ultima_falha_envio: null } });
      const { unmount } = render(<ProposalEditorClient id="prop-1" podeEditar={false} />);
      await waitFor(() => expect(screen.getByDisplayValue("Proposta X")).toBeInTheDocument());
      expect(screen.queryByRole("button", { name: /revisar esta proposta/i })).not.toBeInTheDocument();
      unmount();
    }
  });
});

/**
 * A LINHA EM BRANCO E O "CAMPOS INVÁLIDOS" QUE NÃO DIZ QUAL CAMPO.
 *
 * O que o dono viu na tela: um "Campos inválidos." sem nome de campo, ao salvar.
 * A causa era a linha que "+ Item à mão" deixa para trás quando ninguém escreve
 * nada nela — `descricao` é `min(1)`, e a rota recusa o PATCH inteiro sem dizer
 * que era aquela linha. E a mesma frase saía quando o motivo era outro: o 409
 * do conflito de revisão, que descreve um caso que não era o que acontecia.
 */
const ITEM_DE_REFERENCIA = {
  id: "i1",
  product_id: null,
  descricao: "Site institucional",
  quantidade: 1,
  preco_unitario_cents: 500000,
  desconto_cents: 0,
  position: 1000,
};

function rascunhoComItens(itens: unknown[]) {
  responderProposta({
    data: {
      ...PROPOSTA_BASE,
      status: "rascunho",
      ultima_falha_envio: null,
      template_slug: "site_institucional",
      itens,
    },
  });
}

describe("ProposalEditorClient — o que realmente sai no PATCH", () => {
  beforeEach(() => {
    get.mockReset();
    vi.mocked(apiClient.patch).mockReset();
    vi.mocked(apiClient.post).mockReset();
  });

  it("linha em branco (sem descrição e sem preço) é DESCARTADA: o PATCH não a leva", async () => {
    // A linha existe porque alguém clicou "+ Item à mão" e não escreveu nada.
    // Mandá-la é jogar fora a gravação inteira por um resíduo de formulário.
    rascunhoComItens([ITEM_DE_REFERENCIA]);
    const patch = vi
      .mocked(apiClient.patch)
      .mockResolvedValue({ data: { id: "p1", revision: 2, total_cents: 500000 } } as never);

    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    fireEvent.click(await screen.findByRole("button", { name: /item à mão/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Salvar$/ }));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    const gravado = patch.mock.calls[0]![1] as { itens: Array<{ descricao: string }> };
    expect(gravado.itens).toHaveLength(1);
    expect(gravado.itens[0]!.descricao).toBe("Site institucional");
  });

  it("item com preço e SEM descrição não é enviado: a tela diz o número dele", async () => {
    // Preço sem nome é proposta pela metade, e apagar a linha seria apagar o
    // dinheiro que a pessoa já digitou. A tela recusa e aponta qual é.
    rascunhoComItens([
      ITEM_DE_REFERENCIA,
      { ...ITEM_DE_REFERENCIA, id: "i2", descricao: "", preco_unitario_cents: 120000, position: 2000 },
    ]);
    const patch = vi.mocked(apiClient.patch);

    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Salvar$/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Preencha a descrição do item 2.");
    expect(patch).not.toHaveBeenCalled();
  });

  it("422 com `details` mostra o CAMPO recusado, não a frase do conflito de revisão", async () => {
    rascunhoComItens([ITEM_DE_REFERENCIA]);
    vi.mocked(apiClient.patch).mockRejectedValue(
      new ApiError(
        422,
        "validation_failed",
        { formErrors: [], fieldErrors: { "itens.0.descricao": ["Too small"] } },
        "req-1",
        "Campos inválidos.",
      ),
    );

    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Salvar$/ }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("O servidor recusou estes campos: item 1 · descricao.");
    // A frase antiga descrevia o 409 e era falsa aqui.
    expect(alerta).not.toHaveTextContent(/recarregue antes de editar/i);
  });
});

describe("ProposalEditorClient — Enviar envia o que está NA TELA", () => {
  beforeEach(() => {
    get.mockReset();
    vi.mocked(apiClient.patch).mockReset();
    vi.mocked(apiClient.post).mockReset();
  });

  const COM_PRECO_A_DIGITAR = {
    ...ITEM_DE_REFERENCIA,
    preco_unitario_cents: null,
  };

  it("alteração não salva: o PATCH acontece ANTES do POST de envio", async () => {
    // O defeito medido: a pessoa digita o preço, clica em Enviar e recebe
    // "Item sem preço" — porque o envio leu a versão GRAVADA, e o preço
    // digitado estava só na tela.
    const ordem: string[] = [];
    rascunhoComItens([COM_PRECO_A_DIGITAR]);
    const patch = vi.mocked(apiClient.patch).mockImplementation(async () => {
      ordem.push("patch");
      return { data: { id: "p1", revision: 2, total_cents: 120000 } } as never;
    });
    const post = vi.mocked(apiClient.post).mockImplementation(async (url: string) => {
      ordem.push(`post ${url}`);
      return { data: { id: "p1", numero: 1, ano: 2026, message_id: "m1" } } as never;
    });

    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    fireEvent.change(await screen.findByPlaceholderText("A definir"), { target: { value: "1200" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar ao cliente" }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(ordem).toEqual(["patch", "post /api/v1/proposals/p1/send"]);
    const gravado = patch.mock.calls[0]![1] as { itens: Array<{ preco_unitario_cents: number }> };
    expect(gravado.itens[0]!.preco_unitario_cents).toBe(120000);
  });

  it("sem alteração, o Enviar vai direto ao POST (não grava o que não mudou)", async () => {
    const ordem: string[] = [];
    rascunhoComItens([ITEM_DE_REFERENCIA]);
    const patch = vi.mocked(apiClient.patch);
    const post = vi.mocked(apiClient.post).mockImplementation(async (url: string) => {
      ordem.push(`post ${url}`);
      return { data: { id: "p1", numero: 1, ano: 2026, message_id: "m1" } } as never;
    });

    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    fireEvent.click(await screen.findByRole("button", { name: "Enviar ao cliente" }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(patch).not.toHaveBeenCalled();
    expect(ordem).toEqual(["post /api/v1/proposals/p1/send"]);
  });

  it("se a gravação falha, o envio NÃO sai — mandar o rascunho velho é pior que não mandar", async () => {
    rascunhoComItens([COM_PRECO_A_DIGITAR]);
    vi.mocked(apiClient.patch).mockRejectedValue(
      new ApiError(409, "proposal_context_stale", undefined, "req-1", "A proposta mudou."),
    );
    const post = vi.mocked(apiClient.post);

    render(<ProposalEditorClient id="p1" podeEditar={true} />);
    fireEvent.change(await screen.findByPlaceholderText("A definir"), { target: { value: "1200" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar ao cliente" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/recarregue antes de editar/i);
    expect(post).not.toHaveBeenCalled();
  });
});
