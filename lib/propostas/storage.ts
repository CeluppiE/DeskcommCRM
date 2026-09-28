import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "propostas";

/** Upload + signed URL — mesmo padrão de `workers/lgpd-export-worker.ts` (bucket lgpd-exports). */
export async function salvarPdfDaProposta(
  admin: SupabaseClient,
  input: { orgId: string; propostaId: string; buffer: Buffer },
): Promise<{ path: string; signedUrl: string }> {
  const path = `${input.orgId}/${input.propostaId}.pdf`;

  const { error: uploadErr } = await admin.storage
    .from(BUCKET)
    .upload(path, input.buffer, { contentType: "application/pdf", upsert: true });
  if (uploadErr) throw new Error(`proposta_pdf_upload_failed: ${uploadErr.message}`);

  const { data: signed, error: signedErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 dias — tempo de a mensagem chegar e o canal baixar o arquivo
  if (signedErr || !signed) throw new Error(`proposta_pdf_signed_url_failed: ${signedErr?.message ?? "no_url"}`);

  return { path, signedUrl: signed.signedUrl };
}
