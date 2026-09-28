// app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentoCanvas } from "./DocumentoCanvas";

const get = vi.hoisted(() => vi.fn());
const patch = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ apiClient: { get, patch, post } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

function docBase(overrides: Record<string, unknown> = {}) {
  return {
    modeloSlug: null,
    modeloSlugSugerido: null,
    secoes: [],
    variaveisFaltando: [],
    prontidao: null,
    resumoComercial: null,
    ...overrides,
  };
}

// P5: o canvas busca a lista de modelos da organização em paralelo ao
// documento — o mock roteia pela URL, como manda o plano (a lista mockada
// tem um modelo da empresa para o caso "o seletor mostra o modelo da empresa").
const MODELOS_MOCKADOS = [
  { slug: "site_institucional", nome: "Site institucional" },
  { slug: "empresa_locacao", nome: "Locação" },
];

function responderDocumento(dado: unknown) {
  get.mockImplementation(async (url: string) =>
    url.includes("/settings/proposal-templates") ? { data: MODELOS_MOCKADOS } : { data: dado },
  );
}

describe("DocumentoCanvas", () => {
  beforeEach(() => {
    get.mockReset();
    patch.mockReset();
    post.mockReset();
  });

  it("sem modelo escolhido, mostra aviso em vez de tela vazia ou erro (Review Focus)", async () => {
    responderDocumento(docBase());
    render(<DocumentoCanvas propostaId="p1" />);
    await waitFor(() => expect(screen.getByText(/nenhum modelo escolhido/i)).toBeInTheDocument());
  });

  it("com seções, mostra o título e o corpo de cada uma", async () => {
    responderDocumento(docBase({
        modeloSlug: "site_institucional",
        secoes: [{ id: "resumo", title: "Resumo", body: "Projeto: Site Catálogo", faltantes: [] }],
        prontidao: { status: "pronta_para_envio", checklist: {} },
      }));
    render(<DocumentoCanvas propostaId="p1" />);
    await waitFor(() => expect(screen.getByText("Resumo")).toBeInTheDocument());
    expect(screen.getByText("Projeto: Site Catálogo")).toBeInTheDocument();
  });

  it("com pendências, mostra a lista do que falta", async () => {
    responderDocumento(docBase({
        modeloSlug: "site_institucional",
        secoes: [{ id: "resumo", title: "Resumo", body: "Projeto: [a definir]", faltantes: ["project.name"] }],
        variaveisFaltando: ["project.name"],
        prontidao: { status: "incompleta", checklist: { cliente: false } },
      }));
    render(<DocumentoCanvas propostaId="p1" />);
    await waitFor(() => expect(screen.getByText(/1 pendência/i)).toBeInTheDocument());
  });

  it("mostra a sugestão da IA com botão de confirmar, quando não há modelo confirmado", async () => {
    responderDocumento(docBase({ modeloSlugSugerido: "site_institucional" }));
    render(<DocumentoCanvas propostaId="p1" />);
    expect(await screen.findByText(/A IA sugeriu o modelo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /usar este modelo/i })).toBeInTheDocument();
  });

  it("ao confirmar, chama PATCH /modelo com o slug sugerido", async () => {
    responderDocumento(docBase({ modeloSlugSugerido: "site_institucional" }));
    patch.mockResolvedValue({ data: { template_slug: "site_institucional" } });
    render(<DocumentoCanvas propostaId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: /usar este modelo/i }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/proposals/p1/modelo", { template_slug: "site_institucional" }),
    );
  });

  it("PATCH de modelo bem-sucedido chama onModeloConfirmado com o slug", async () => {
    responderDocumento(docBase({ modeloSlugSugerido: "site_institucional" }));
    patch.mockResolvedValue({ data: { template_slug: "site_institucional" } });
    const onModeloConfirmado = vi.fn();
    render(<DocumentoCanvas propostaId="p1" onModeloConfirmado={onModeloConfirmado} />);
    fireEvent.click(await screen.findByRole("button", { name: /usar este modelo/i }));
    await waitFor(() => expect(onModeloConfirmado).toHaveBeenCalledWith("site_institucional"));
  });

  it("PATCH de modelo que falha NÃO chama onModeloConfirmado", async () => {
    responderDocumento(docBase({ modeloSlugSugerido: "site_institucional" }));
    patch.mockRejectedValue(new Error("falha de rede"));
    const onModeloConfirmado = vi.fn();
    render(<DocumentoCanvas propostaId="p1" onModeloConfirmado={onModeloConfirmado} />);
    fireEvent.click(await screen.findByRole("button", { name: /usar este modelo/i }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/proposals/p1/modelo", { template_slug: "site_institucional" }),
    );
    // Dá tempo do catch de `executar` assentar antes de afirmar a ausência.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onModeloConfirmado).not.toHaveBeenCalled();
  });

  it("sem sugestão e sem modelo, mostra um seletor manual com os modelos da organização", async () => {
    responderDocumento(docBase());
    render(<DocumentoCanvas propostaId="p1" />);
    const seletor = await screen.findByRole("combobox");
    expect(seletor).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Site institucional" })).toBeInTheDocument();
  });

  it("o seletor mostra o modelo da empresa", async () => {
    responderDocumento(docBase());
    render(<DocumentoCanvas propostaId="p1" />);
    expect(await screen.findByRole("option", { name: "Locação" })).toBeInTheDocument();
  });

  it("o seletor esconde o modelo desligado", async () => {
    get.mockImplementation(async (url: string) =>
      url.includes("/settings/proposal-templates")
        ? { data: [{ slug: "site_institucional", nome: "Site institucional", oculto: true }, { slug: "empresa_locacao", nome: "Locação" }] }
        : { data: docBase() },
    );
    render(<DocumentoCanvas propostaId="p1" />);
    await screen.findByRole("combobox");
    expect(screen.queryByRole("option", { name: "Site institucional" })).toBeNull();
    expect(screen.getByRole("option", { name: "Locação" })).toBeInTheDocument();
  });

  it("o modelo atual desligado continua no seletor, marcado (desligado)", async () => {
    get.mockImplementation(async (url: string) =>
      url.includes("/settings/proposal-templates")
        ? { data: [{ slug: "site_institucional", nome: "Site institucional", oculto: true }, { slug: "empresa_locacao", nome: "Locação" }] }
        : {
            data: docBase({
              modeloSlug: "site_institucional",
              secoes: [],
              prontidao: { status: "incompleta", checklist: {} },
            }),
          },
    );
    render(<DocumentoCanvas propostaId="p1" podeRevisar emRascunho />);
    const seletor = await screen.findByLabelText("Modelo do documento");
    expect(seletor).toHaveValue("site_institucional");
    expect(screen.getByRole("option", { name: "Site institucional (desligado)" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Site institucional" })).toBeNull();
  });
});

describe("DocumentoCanvas — P1 (edição)", () => {
  beforeEach(() => {
    get.mockReset();
    patch.mockReset();
    post.mockReset();
  });

  const COM_MODELO = docBase({
    status: "rascunho",
    modeloSlug: "site_institucional",
    secoes: [
      { id: "summary", title: "Resumo", body: "Projeto: [a definir]", faltantes: ["project.name"], editada: false },
      { id: "terms", title: "Condições", body: "Texto escrito à mão", faltantes: [], editada: true },
    ],
    variaveisFaltando: ["project.name", "schedule.estimated_days"],
    camposFaltando: [
      { caminho: "project.name", rotulo: "Nome do projeto", onde: "briefing", secoes: ["summary"] },
      { caminho: "schedule.estimated_days", rotulo: "Prazo (dias úteis)", onde: "campo_prazo", secoes: ["schedule"] },
    ],
    temSecaoEditada: true,
  });

  it("sem papel de revisão, nada é editável", async () => {
    responderDocumento(COM_MODELO);
    render(<DocumentoCanvas propostaId="p1" emRascunho />);
    await screen.findByText("Resumo");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("salvar seção chama PATCH /documento com o texto", async () => {
    responderDocumento(COM_MODELO);
    patch.mockResolvedValue({ data: {} });
    render(<DocumentoCanvas propostaId="p1" podeRevisar emRascunho />);
    const caixa = await screen.findByLabelText("Resumo");
    fireEvent.change(caixa, { target: { value: "Projeto: Site da imobiliária" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Salvar seção" })[0]!);
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/proposals/p1/documento", { secaoId: "summary", texto: "Projeto: Site da imobiliária" }),
    );
  });

  it("voltar ao texto do modelo só aparece na seção reescrita, e manda texto null", async () => {
    responderDocumento(COM_MODELO);
    patch.mockResolvedValue({ data: {} });
    render(<DocumentoCanvas propostaId="p1" podeRevisar emRascunho />);
    const botoes = await screen.findAllByRole("button", { name: "Voltar ao texto do modelo" });
    expect(botoes).toHaveLength(1);
    fireEvent.click(botoes[0]!);
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/proposals/p1/documento", { secaoId: "terms", texto: null }));
  });

  it("campo do briefing tem caixa; prazo aponta para o campo de prazo", async () => {
    responderDocumento(COM_MODELO);
    patch.mockResolvedValue({ data: {} });
    render(<DocumentoCanvas propostaId="p1" podeRevisar emRascunho />);
    const campo = await screen.findByLabelText("Nome do projeto");
    fireEvent.change(campo, { target: { value: "Site da imobiliária" } });
    fireEvent.click(screen.getByRole("button", { name: "Preencher" }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/proposals/p1/documento", { campo: "project.name", valor: "Site da imobiliária" }),
    );
    expect(screen.getByText("Preencha no campo Prazo (dias úteis), abaixo.")).toBeInTheDocument();
  });

  it("trocar o modelo com seção reescrita: cancelar a confirmação não chama nada", async () => {
    responderDocumento(COM_MODELO);
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DocumentoCanvas propostaId="p1" podeRevisar emRascunho />);
    fireEvent.change(await screen.findByLabelText("Modelo do documento"), { target: { value: "empresa_locacao" } });
    expect(confirmar).toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    confirmar.mockRestore();
  });

  it("trocar o modelo confirmando manda descartar_reescritas", async () => {
    responderDocumento(COM_MODELO);
    patch.mockResolvedValue({ data: {} });
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DocumentoCanvas propostaId="p1" podeRevisar emRascunho />);
    fireEvent.change(await screen.findByLabelText("Modelo do documento"), { target: { value: "empresa_locacao" } });
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith("/api/v1/proposals/p1/modelo", { template_slug: "empresa_locacao", descartar_reescritas: true }),
    );
    confirmar.mockRestore();
  });

  it("botão 'Preencher com a conversa' só aparece com campo de briefing faltando e papel de revisão", async () => {
    responderDocumento(COM_MODELO);
    render(<DocumentoCanvas propostaId="p1" podeRevisar emRascunho />);
    await screen.findByText("Resumo");
    expect(screen.getByRole("button", { name: "Preencher com a conversa" })).toBeInTheDocument();
  });

  it("sem papel de revisão, o botão não aparece", async () => {
    responderDocumento(COM_MODELO);
    render(<DocumentoCanvas propostaId="p1" emRascunho />);
    await screen.findByText("Resumo");
    expect(screen.queryByRole("button", { name: "Preencher com a conversa" })).toBeNull();
  });

  it("clicar em 'Preencher com a conversa' pré-preenche a caixa do campo sugerido, sem gravar nada", async () => {
    responderDocumento(COM_MODELO);
    post.mockResolvedValue({
      data: { disponivel: true, motivo: null, sugestoes: [{ campo: "project.name", rotulo: "Nome do projeto", valor: "Site da Imobiliária Rio" }] },
    });
    render(<DocumentoCanvas propostaId="p1" podeRevisar emRascunho />);
    await screen.findByText("Resumo");
    fireEvent.click(screen.getByRole("button", { name: "Preencher com a conversa" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/proposals/p1/preencher-com-conversa", {}));
    const campo = await screen.findByLabelText("Nome do projeto");
    expect(campo).toHaveValue("Site da Imobiliária Rio");
    expect(patch).not.toHaveBeenCalled();
  });

  it("nenhuma sugestão: mostra aviso, não mexe nas caixas", async () => {
    responderDocumento(COM_MODELO);
    post.mockResolvedValue({ data: { disponivel: true, motivo: null, sugestoes: [] } });
    render(<DocumentoCanvas propostaId="p1" podeRevisar emRascunho />);
    await screen.findByText("Resumo");
    fireEvent.click(screen.getByRole("button", { name: "Preencher com a conversa" }));
    await waitFor(() => expect(screen.getByText("A conversa não respondeu nenhum dos campos que faltam.")).toBeInTheDocument());
  });
});
