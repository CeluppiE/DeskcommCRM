import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O `lang` do documento nas telas que traduzem SEM estar sob um `IdiomaProvider`.
 *
 * O provider já troca `document.documentElement.lang` (ver
 * `agenda-e-lang-seguem-o-idioma.test.tsx`). Mas o `<html lang="pt-BR">` do
 * layout raiz só é corrigido onde há provider — e estas rotas ficam fora de
 * todos (`app/app`, `app/admin/(protected)`, `app/(public)`, `app/onboarding`):
 * cada uma resolve o idioma no servidor e traduz o texto por `traduzir()`.
 * Resultado medido antes do conserto: texto em espanhol, `lang="pt-BR"` — o
 * leitor de tela lê o espanhol com a voz do português, e o navegador oferece
 * "traduzir do português" uma página que já está em espanhol. No convite, é a
 * primeira tela que o convidado vê.
 */

const locale = vi.hoisted(() => ({ valor: "es" as string | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { email: "x@exemplo.com", user_metadata: { locale: locale.valor } } },
      }),
    },
  }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}));
vi.mock("@/app/actions/auth/signOut", () => ({ signOut: async () => {} }));
vi.mock("@/lib/branding/saida", () => ({ emailDeSuporte: async () => "suporte@exemplo.com" }));
vi.mock("@/lib/branding", () => ({ branding: () => ({ name: "Produto" }) }));
vi.mock("@/lib/auth/rate-limit", () => ({
  authRateLimited: async () => false,
  AUTH_LIMITS: { invite_accept: {} },
}));
vi.mock("@/lib/auth/invite-token", () => ({ verifyInviteToken: () => null }));

const TELAS: Array<[string, () => Promise<ReactElement>]> = [
  ["/403", async () => (await import("@/app/403/page")).default()],
  ["/500", async () => (await import("@/app/500/page")).default()],
  ["/account-suspended", async () => (await import("@/app/account-suspended/page")).default()],
  ["/acesso-revogado", async () => (await import("@/app/acesso-revogado/page")).default()],
  ["/admin/forbidden", async () => (await import("@/app/admin/forbidden/page")).default()],
  [
    "/legal (layout)",
    async () => (await import("@/app/legal/layout")).default({ children: null }),
  ],
  [
    "/team/accept-invite/[token]",
    async () =>
      (await import("@/app/team/accept-invite/[token]/page")).default({
        params: Promise.resolve({ token: "qualquer" }),
      }),
  ],
];

describe("tela fora do app: o lang do documento é o idioma em que ela foi escrita", () => {
  beforeEach(() => {
    // O que o layout raiz entrega antes da hidratação.
    document.documentElement.lang = "pt-BR";
  });

  it.each(TELAS)("%s: o lang acompanha o idioma do texto", async (_rota, montar) => {
    locale.valor = "es";
    const emEspanhol = render(await montar());
    const textoEs = emEspanhol.container.textContent;
    expect(document.documentElement.lang).toBe("es");
    emEspanhol.unmount();

    locale.valor = "pt-BR";
    const emPortugues = render(await montar());
    expect(document.documentElement.lang).toBe("pt-BR");
    // Contraprova de que a tela TRADUZ: sem isto, o `lang` poderia estar
    // "certo" numa tela que nem mudou de idioma.
    expect(emPortugues.container.textContent).not.toBe(textoEs);
  });
});
