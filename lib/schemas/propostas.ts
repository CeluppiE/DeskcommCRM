import { z } from "zod";

/**
 * O CONTRATO DA PROPOSTA — um só, lido pela tela E pela rota (padrão
 * `lib/schemas/produtos.ts`, CLAUDE.md).
 */

export const propostaItemSchema = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid().nullable(),
  descricao: z.string().trim().min(1).max(500),
  quantidade: z.number().positive(),
  preco_unitario_cents: z.number().int().nonnegative().nullable(),
  desconto_cents: z.number().int().nonnegative().default(0),
  position: z.number(),
});

export const propostaCreateSchema = z.object({
  lead_id: z.string().uuid(),
  titulo: z.string().trim().min(1).max(200),
  condicoes: z.string().max(4000).nullable().optional(),
  valid_until: z.string().date().nullable().optional(),
  itens: z.array(propostaItemSchema).default([]),
});
export type PropostaCreateInput = z.infer<typeof propostaCreateSchema>;
