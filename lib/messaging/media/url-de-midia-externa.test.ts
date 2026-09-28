import { describe, expect, it } from "vitest";

import { env } from "@/lib/env";
import { assertUrlDeMidiaSegura } from "@/lib/messaging/media/url-de-midia-externa";

describe("assertUrlDeMidiaSegura", () => {
  it("aceita a URL assinada pelo Storage desta instalação, sem consultar DNS", async () => {
    await expect(
      assertUrlDeMidiaSegura(`${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/sign/propostas/o/p.pdf?token=t`),
    ).resolves.toBeUndefined();
  });

  it.each([
    ["metadata da nuvem", "http://169.254.169.254/latest/meta-data/", "unsafe_url:private_host"],
    ["IP privado do compose", "http://10.0.0.7:8080/x", "unsafe_url:private_host"],
    ["CGNAT (só a guarda por IP pega)", "https://100.64.0.1/x", "unsafe_url:private_ip"],
    ["esquema que não é http", "file:///etc/passwd", "unsafe_url:scheme"],
    ["lixo", "não é url", "unsafe_url:invalid"],
    // Parece Storage, mas não é a origem DESTA instalação: não herda a exceção.
    ["Storage de outra origem", "http://127.0.0.1:54321/storage/v1/object/sign/x?token=t", "unsafe_url:private_host"],
  ])("recusa %s", async (_nome, url, motivo) => {
    await expect(assertUrlDeMidiaSegura(url)).rejects.toThrow(motivo);
  });
});
