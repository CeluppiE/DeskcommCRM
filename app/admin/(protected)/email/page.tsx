import { notFound } from "next/navigation";

import { loadAuthUser } from "@/lib/auth/server";
import { getSmtpConfig } from "@/lib/email/config";
import { transporteEmVigor } from "@/lib/email/roteador";

import { FormularioDeSmtp } from "./_form";

export const metadata = { title: "Servidor de e-mail da instalação" };
export const dynamic = "force-dynamic";

/**
 * A tela onde o dono da instalação cadastra o servidor SMTP que manda os
 * e-mails do produto — convite de equipe, entrega de export de LGPD e alarme
 * de SLA.
 *
 * ── Por que `/admin`, e não `/app/settings` ──────────────────────────────────
 *
 * O objeto é a INSTALAÇÃO: um servidor SMTP manda o e-mail de todas as empresas
 * desta VPS. Deixar o admin de um tenant trocá-lo derrubaria (ou redirecionaria)
 * o e-mail de TODOS. Irmã de `/admin/meta` e `/admin/google`, que são o molde.
 *
 * A versão original desta tela (PR #714) vivia em `/app/settings/resend`, e o
 * sintoma disso estava no próprio PR: o autor precisou inventar um
 * `platformOnly: true` no catálogo de navegação do TENANT para esconder da
 * empresa uma tela que estava no menu da empresa. Movida para cá, a exceção
 * deixa de existir.
 *
 * ── Por que `notFound()` ────────────────────────────────────────────────────
 *
 * Mesma decisão e mesma frase de `/admin/meta`: o layout de `(protected)` já
 * roda `requirePlatformAdmin()`, e o gate local fica porque um layout pode ser
 * movido.
 *
 * ⚠️ A SENHA NÃO ATRAVESSA A FRONTEIRA. `getSmtpConfig()` a decifra porque o
 * transporte precisa dela no servidor; a TELA não precisa — para desenhar o
 * campo basta saber que existe uma senha gravada, e é só isso que chega ao
 * componente de cliente. Mesma disciplina de `temSegredoSalvo` em
 * `/admin/google` e `/admin/meta`, e vigiado em
 * `tests/unit/tela-de-smtp-nao-devolve-a-senha.test.tsx`.
 */
export default async function Page() {
  const usuario = await loadAuthUser();
  if (!usuario?.is_platform_admin) notFound();

  const config = await getSmtpConfig();
  const transporte = await transporteEmVigor();

  return (
    <FormularioDeSmtp
      host={config.host}
      porta={config.port}
      seguranca={config.security}
      usuario={config.username}
      remetente={config.fromEmail}
      nomeDoRemetente={config.fromName}
      temSenhaSalva={Boolean(config.password)}
      // Onde está o que vale. Sem isto, quem preencheu as `SMTP_*` no `.env`
      // abre a tela com os campos JÁ cheios e não tem como saber que o que
      // salvar aqui passa a valer no lugar do arquivo.
      origem={config.source}
      // QUEM ESTÁ ENTREGANDO. Sem isto, a instalação que manda e-mail pela
      // Resend abre a única tela de e-mail do produto e lê "não está em uso" —
      // verdade sobre o SMTP, e leitura errada sobre o sistema.
      transporte={transporte}
    />
  );
}
