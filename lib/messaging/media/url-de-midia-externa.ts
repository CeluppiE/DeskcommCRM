/**
 * Guarda anti-SSRF do envio de mídia por `media_url`.
 *
 * Quem baixa o arquivo é o gateway de mensageria, de DENTRO da rede do
 * servidor: uma `media_url` apontando para 169.254.169.254 ou para um serviço
 * do compose faria o gateway buscar o endereço interno e entregar o conteúdo
 * ao contato. `media_url` chega pela API pública e pelas ferramentas MCP, então
 * não há "chamador confiável" a presumir.
 *
 * Uma exceção, e só uma: a URL ASSINADA pelo próprio Storage desta instalação
 * (`<NEXT_PUBLIC_SUPABASE_URL>/storage/v1/object/sign/…`). Assinar exige a
 * service role, então quem a tem recebeu-a do servidor; e ela é, por
 * construção, o endereço que o gateway já baixa no caminho de
 * `media_storage_path`. É por ela que sai o PDF da proposta — que num
 * self-host em `http://` ou em rede local nunca passaria na guarda externa.
 */
import { assertSafeOutboundUrl } from "@/lib/automation/outbound-url";
import { assertDestinoResolvidoSeguro } from "@/lib/automation/outbound-ip";
import { env } from "@/lib/env";

function ehUrlAssinadaDoProprioStorage(url: URL): boolean {
  let base: URL;
  try {
    base = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  } catch {
    return false;
  }
  // `new URL` já normalizou `..`: `/storage/v1/object/sign/../../rest` não
  // chega aqui com o prefixo.
  return url.origin === base.origin && url.pathname.startsWith("/storage/v1/object/sign/");
}

/** Lança `unsafe_url:*` quando a URL não pode ser entregue ao gateway. */
export async function assertUrlDeMidiaSegura(bruta: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(bruta);
  } catch {
    throw new Error("unsafe_url:invalid");
  }
  if (ehUrlAssinadaDoProprioStorage(url)) return;
  assertSafeOutboundUrl(bruta);
  await assertDestinoResolvidoSeguro(url.hostname);
}
