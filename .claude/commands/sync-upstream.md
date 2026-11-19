---
description: Sincroniza o fork CeluppiE/DeskcommCRM com a release mais nova de melgarafael/DeskcommCRM (espelho + patches), valida local e publica tag/Release
---
Procedimento fixo. Siga exatamente esta ordem. Não invente etapa nova, não troque
espelho por merge, não rode suite completa nem testes de banco localmente — isso é
papel do CI. Pare no fim de cada etapa numerada e espere confirmação do usuário
antes de seguir pra próxima. Se achar necessário desviar, pergunte antes — não
decida sozinho.

## 1. Documentar o que é nosso

Antes de puxar qualquer coisa, leia docs/DIVERGENCIA-DO-FORK.md. Ele lista as
mudanças reais do fork (hoje são 3: namespace da imagem Docker ghcr.io/celuppie,
identidade de versão aceitando sufixo -aN, exclusão de fork-patches/ na checagem de
namespace dos testes — mais 2 patches só de documentação). Se esse arquivo estiver
desatualizado em relação ao que fork-patches/ realmente contém, atualize-o primeiro
— ele é a fonte de verdade, não a memória de ninguém.

## 2. Puxar os arquivos pra máquina local

Use scripts/sync-upstream.sh (sem --yes) pra trazer a tag mais nova do upstream e
reaplicar os patches de fork-patches/ numa branch de trabalho (sync/vX.Y.Z-aN).
Isso é um ESPELHO: parte da tag upstream pura e reaplica só os nossos patches por
cima — não é merge, não preserva o histórico antigo do main. Nunca use o botão
nativo "Sync fork" do GitHub enquanto o fork tiver commits próprios na frente do
upstream (ele oferece "Discard commits", reset duro que apagaria os patches).

## 3. Avaliar se nossas mudanças não quebram nada

Rode local, nessa ordem, e pare se algo falhar:
- lint
- typecheck, com NODE_OPTIONS='--max-old-space-size=8192' (mesmo valor que o CI usa)
- SÓ os testes que exercitam os arquivos tocados pelos nossos 3 patches (ex.: o
  teste de namespace das imagens, o teste de identidade de versão/sufixo -aN).
  Ache os arquivos certos grepando quais testes importam os módulos que os patches
  tocam, e rode só esses, isolados.

NÃO rode a suíte test:unit completa. NÃO suba o Docker Desktop nem rode test:db.
Isso nunca rodou aqui com sucesso (falta de RAM — o CI usa ~16GB) e sempre foi
responsabilidade do GitHub Actions; rodar isso local é trabalho desnecessário.

Aproveite essa etapa pra levantar qualquer mudança de comportamento relevante da
release nova (ex.: migration que muda default de módulo opcional, flag nova em
algum schema) e resuma pro usuário antes de publicar.

## 4. Aplicar as mudanças (publicar tag + Release)

Se lint + typecheck + os testes específicos passarem, publique a tag vX.Y.Z-aN e a
Release no GitHub (é isso que o sync-upstream.sh faz ao final). Avise o usuário
que foi publicado.

## 5. Subir pro fork e disparar o check

O push da tag só dispara o workflow de publicação de imagem (GHCR); o ci/e2e/perf
completo só roda no push do main — é o `git push origin sync/vX.Y.Z-aN:main
--force-with-lease` que dispara os checks de verdade. Espere esses checks ficarem
verdes antes da VPS, não só o build de imagem — não pule esse passo mesmo com os
testes locais passando, o CI roda a suíte completa que não roda localmente.

## 6. Subir pra VPS

Só depois do CI aprovado. Use SÓ os scripts do hostgator-setup-kit abaixo —
NÃO invente comando (pg_dumpall, curl manual, etc.), mesmo que pareça equivalente.
Esses scripts já tratam os casos reais do ambiente (Supabase gerenciado, locks
de backup concorrente, timeout do Docker travado); um comando improvisado pode
usar credencial errada, pular uma trava de segurança ou corromper dado em
produção.

```bash
cd /root/deskcomm-test

# pré-checagem (versão atual, proxy, disco)
cat .env | grep REVERSE_PROXY
df -h /

# o próprio update.sh já roda o backup.sh antes de atualizar — não rode
# backup manual, e não passe --skip-backup
nohup bash hostgator-setup-kit/update.sh --to <tag> > /root/update-<tag>.log 2>&1 &
tail -f /root/update-<tag>.log

# depois que terminar, a verificação de saúde oficial do kit:
bash hostgator-setup-kit/healthcheck.sh
```

O botão "Atualizar agora" da tela não serve pra isso (agent.sh não reconhece o
sufixo -aN do fork). Se `healthcheck.sh` sair com código diferente de 0, ele já
imprime o diagnóstico de onde travou — leia isso antes de tentar corrigir, não
invente um comando novo pra contornar.
