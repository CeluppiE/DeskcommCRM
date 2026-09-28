// @vitest-environment node
// O <Image> do @react-pdf/renderer decodifica data-URI para Buffer e o pdfkit
// testa `instanceof Uint8Array` — sob jsdom o Buffer é polyfill e o teste
// cai em `fs.readFileSync`, um artefato do ambiente, não do PDF (em produção,
// runtime node de verdade, o Buffer passa e a imagem é embutida). Mesmo
// padrão de `sonda-de-pdf-na-imagem.test.ts`.
import { describe, expect, it } from "vitest";
import { renderPropostaPdf } from "./pdf";

describe("renderPropostaPdf", () => {
  it("devolve um Buffer que começa com o header de PDF (%PDF)", async () => {
    const buf = await renderPropostaPdf({
      titulo: "Site institucional", numero: 42, ano: 2026, versao: 1,
      condicoes: "50% na entrada", validUntil: "2026-10-01",
      itens: [{ descricao: "Site", quantidade: 1, precoUnitarioCents: 800000, descontoCents: 0 }],
      totalCents: 800000, moeda: "BRL",
      marca: { app_name: "Acme", accent_hex: "#0EA5E9", logoUrl: null },
      destinatario: { nome: "Cliente Teste", email: null, telefone: null },
    });
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("sem imagem_url no item, não quebra (layout fecha sem buraco)", async () => {
    const buf = await renderPropostaPdf({
      titulo: "x", numero: null, ano: null, versao: 1, condicoes: null, validUntil: null,
      itens: [{ descricao: "Serviço", quantidade: 1, precoUnitarioCents: 100, descontoCents: 0 }],
      totalCents: 100, moeda: "BRL",
      marca: { app_name: null, accent_hex: null, logoUrl: null },
      destinatario: { nome: "Cliente", email: null, telefone: null },
    });
    expect(buf.length).toBeGreaterThan(0);
  });

  it("com logoUrl: desenha a imagem no cabeçalho sem lançar", async () => {
    const PIXEL_TRANSPARENTE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const buf = await renderPropostaPdf({
      titulo: "x", numero: 1, ano: 2026, versao: 1, condicoes: null, validUntil: null,
      itens: [{ descricao: "Item", quantidade: 1, precoUnitarioCents: 100, descontoCents: 0 }],
      totalCents: 100, moeda: "BRL",
      marca: { app_name: "Acme", accent_hex: "#0EA5E9", logoUrl: PIXEL_TRANSPARENTE },
      destinatario: { nome: "Cliente", email: null, telefone: null },
    });
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("item com imagemUrl: desenha a imagem do item sem lançar", async () => {
    const PIXEL_TRANSPARENTE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const buf = await renderPropostaPdf({
      titulo: "x", numero: 1, ano: 2026, versao: 1, condicoes: null, validUntil: null,
      itens: [{ descricao: "Item com foto", quantidade: 1, precoUnitarioCents: 100, descontoCents: 0, imagemUrl: PIXEL_TRANSPARENTE }],
      totalCents: 100, moeda: "BRL",
      marca: { app_name: null, accent_hex: null, logoUrl: null },
      destinatario: { nome: "Cliente", email: null, telefone: null },
    });
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("sem logoUrl nem accent_hex: continua fechando sem buraco (regressão)", async () => {
    const buf = await renderPropostaPdf({
      titulo: "x", numero: null, ano: null, versao: 1, condicoes: null, validUntil: null,
      itens: [{ descricao: "Serviço", quantidade: 1, precoUnitarioCents: 100, descontoCents: 0 }],
      totalCents: 100, moeda: "BRL",
      marca: { app_name: null, accent_hex: null, logoUrl: null },
      destinatario: { nome: "Cliente", email: null, telefone: null },
    });
    expect(buf.length).toBeGreaterThan(0);
  });
});
