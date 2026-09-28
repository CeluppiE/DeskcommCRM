import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { formatarMoeda } from "./moeda";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  logo: { width: 96, height: 40, objectFit: "contain" },
  titulo: { fontSize: 16, fontWeight: 700 },
  linhaItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 0.5 },
  itemImagem: { width: 32, height: 32, objectFit: "cover", marginRight: 8 },
  itemTexto: { flexDirection: "row", alignItems: "center" },
  total: { marginTop: 12, fontSize: 12, fontWeight: 700, textAlign: "right" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 8, color: "#666" },
});

interface ItemPdf {
  descricao: string;
  quantidade: number;
  precoUnitarioCents: number;
  descontoCents: number;
  /** D6 — imagem do produto de catálogo (já é URL resolvida). Ausente/null: sem foto, layout fecha sem buraco. */
  imagemUrl?: string | null;
}
export interface PropostaPdfInput {
  titulo: string; numero: number | null; ano: number | null; versao: number;
  condicoes: string | null; validUntil: string | null;
  itens: ItemPdf[]; totalCents: number; moeda: string;
  /**
   * D6 — SÓ a organização (nunca instalação/revendedor). `logoUrl` já é uma
   * URL pronta para <Image> (data: ou http(s):) — quem monta este input
   * (send/route.ts, via `marcaDaOrganizacaoParaPdf`) resolve isso antes.
   */
  marca: { app_name: string | null; accent_hex: string | null; logoUrl: string | null };
  destinatario: { nome: string; email: string | null; telefone: string | null };
}

function PropostaPdfDoc({ d }: { d: PropostaPdfInput }): React.ReactElement {
  const accent = d.marca.accent_hex ?? undefined;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.titulo, accent ? { color: accent } : undefined]}>{d.titulo}</Text>
            {d.numero && <Text>Proposta {String(d.numero).padStart(4, "0")}/{d.ano}{d.versao > 1 ? ` — v${d.versao}` : ""}</Text>}
          </View>
          {d.marca.logoUrl ? (
            <Image src={d.marca.logoUrl} style={styles.logo} />
          ) : (
            d.marca.app_name && <Text>{d.marca.app_name}</Text>
          )}
        </View>

        <Text>Para: {d.destinatario.nome}</Text>

        <View style={{ marginTop: 16 }}>
          {d.itens.map((it, i) => (
            <View key={i} style={styles.linhaItem}>
              <View style={styles.itemTexto}>
                {it.imagemUrl && <Image src={it.imagemUrl} style={styles.itemImagem} />}
                <Text>{it.descricao} (x{it.quantidade})</Text>
              </View>
              <Text>{formatarMoeda(it.quantidade * it.precoUnitarioCents - it.descontoCents, d.moeda)}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.total, accent ? { color: accent } : undefined]}>Total: {formatarMoeda(d.totalCents, d.moeda)}</Text>

        {d.validUntil && <Text style={{ marginTop: 8 }}>Válida até {d.validUntil}</Text>}
        {d.condicoes && <Text style={{ marginTop: 8 }}>{d.condicoes}</Text>}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `${d.marca.app_name ?? "Proposta comercial"} — página ${pageNumber} de ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}

export async function renderPropostaPdf(input: PropostaPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(<PropostaPdfDoc d={input} />);
  return buf as Buffer;
}
