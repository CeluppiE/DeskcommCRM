// app/app/settings/tenant/proposals/modelos/[slug]/_client.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHAVE_DO_MODELO_IMPORTADO } from "../_client";
import { EditorDeModelo } from "./_client";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
const patch = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ apiClient: { get, post, patch } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (chave: string) => chave }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));

const MODELO_EMPRESA = {
  nome: "E-commerce nosso",
  descricao: null,
  sections: [
    { id: "summary", title: "Resumo", body: "Texto um.", required: true, conditional: false },
    { id: "terms", title: "Termos", body: "Texto dois.", required: true, conditional: false },
  ],
  sectionOrder: ["summary", "terms"],
  origem: "empresa",
};

describe("EditorDeModelo", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    patch.mockReset();
    push.mockReset();
    replace.mockReset();
    window.sessionStorage.clear();
    get.mockResolvedValue({ data: MODELO_EMPRESA });
    patch.mockResolvedValue({ data: { slug: "ecommerce", version: 3 } });
    post.mockResolvedValue({ data: { slug: "empresa_portal" } });
  });

  it("modelo da plataforma abre só leitura (sem botão Salvar modelo)", async () => {
    get.mockResolvedValue({
      data: { ...MODELO_EMPRESA, origem: "plataforma", nome: "E-commerce" },
    });
    render(<EditorDeModelo slug="ecommerce" />);
    await waitFor(() => expect(screen.getByDisplayValue("E-commerce")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Salvar modelo" })).not.toBeInTheDocument();
  });

  it("editar título e salvar chama PATCH com section_order na ordem da tela", async () => {
    render(<EditorDeModelo slug="ecommerce" />);
    const titulo = await screen.findByDisplayValue("Resumo");
    fireEvent.change(titulo, { target: { value: "Resumo novo" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar modelo" }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/api/v1/settings/proposal-templates/ecommerce",
        expect.objectContaining({ section_order: ["summary", "terms"] }),
      ),
    );
    const corpo = patch.mock.calls[0]![1] as { sections: Array<{ title: string }> };
    expect(corpo.sections[0]?.title).toBe("Resumo novo");
  });

  it("↓ troca a ordem enviada", async () => {
    render(<EditorDeModelo slug="ecommerce" />);
    await screen.findByDisplayValue("Resumo");
    fireEvent.click(screen.getAllByRole("button", { name: "Descer seção" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Salvar modelo" }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/api/v1/settings/proposal-templates/ecommerce",
        expect.objectContaining({ section_order: ["terms", "summary"] }),
      ),
    );
  });

  it("com slug novo e sessionStorage preenchido, salvar chama POST acao novo", async () => {
    window.sessionStorage.setItem(
      CHAVE_DO_MODELO_IMPORTADO,
      JSON.stringify({ nome: "Portal", sections: MODELO_EMPRESA.sections, sectionOrder: ["summary", "terms"] }),
    );
    render(<EditorDeModelo slug="novo" />);
    await screen.findByDisplayValue("Portal");
    expect(get).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar modelo" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        "/api/v1/settings/proposal-templates",
        expect.objectContaining({ acao: "novo", nome: "Portal" }),
      ),
    );
  });

  it("salvar com sucesso volta para a lista com ?salvo=", async () => {
    // O nome vem na query string de propósito: é a lista que mostra "Modelo «X»
    // salvo." (ver `modelos/_client.test.tsx`). O nome é codificado — sem isso
    // um modelo chamado "Site & Landing" chega truncado no `&`.
    render(<EditorDeModelo slug="ecommerce" />);
    await screen.findByDisplayValue("Resumo");
    fireEvent.click(screen.getByRole("button", { name: "Salvar modelo" }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        "/app/settings/tenant/proposals/modelos?salvo=E-commerce%20nosso",
      ),
    );
  });

  it("modelo que só tem {{investment.total_formatted}} avisa que quase não pede nada", async () => {
    // O que o sistema CALCULA não é pergunta ao cliente. Sem esta distinção, o
    // quadro "Este modelo vai pedir ao cliente:" contaria o total investido e a
    // tela prometeria à pessoa que a IA vai perguntar o valor — que ela nunca
    // pergunta, porque ele vem das colunas da proposta.
    get.mockResolvedValue({
      data: {
        ...MODELO_EMPRESA,
        sections: [
          { id: "investimento", title: "Investimento", body: "Total: {{investment.total_formatted}}.", required: true, conditional: false },
        ],
        sectionOrder: ["investimento"],
      },
    });
    render(<EditorDeModelo slug="ecommerce" />);
    const aviso = await screen.findByText(/quase não pede nada/);
    expect(aviso).toHaveTextContent(
      "Este modelo quase não pede nada ao cliente: a IA não saberá o que perguntar.",
    );
    expect(screen.queryByText("Este modelo vai pedir ao cliente:")).toBeNull();
  });

  it("{{scope.pages_list}} entra no quadro de perguntas com o rótulo legível", async () => {
    // `{{scope.pages_list}}` é o que FAZ a proposta de um site mudar de um
    // cliente para o outro. O quadro é onde a pessoa descobre o que a IA vai
    // perguntar, então o caminho tem de aparecer com nome humano — e não só o
    // identificador, que ninguém lê.
    get.mockResolvedValue({
      data: {
        ...MODELO_EMPRESA,
        sections: [
          { id: "escopo", title: "Escopo", body: "Páginas: {{scope.pages_list}}.", required: true, conditional: false },
          { id: "entrega", title: "Entrega", body: "Prazo de {{schedule.estimated_days}} dias úteis.", required: true, conditional: false },
        ],
        sectionOrder: ["escopo", "entrega"],
      },
    });
    render(<EditorDeModelo slug="ecommerce" />);
    const quadro = (await screen.findByText("Este modelo vai pedir ao cliente:")).parentElement as HTMLElement;
    expect(quadro).toHaveTextContent("{{scope.pages_list}}");
    expect(quadro).toHaveTextContent("Lista de páginas");
  });
});
