# perfil (#92)

Página de **perfil / conta** do utilizador, num modal próprio (`perfil-modal.tsx`,
espelha a `DefinicoesModal`) aberto pelo item **Perfil** do menu do badge.

## Campos

- **Nome** → `profiles.display_name` (`atualizarNomeCom`). RLS "o próprio".
- **Email / Password** → Supabase Auth `updateUser`. Mudar email dispara o fluxo
  de **confirmação** (email para o novo endereço; só efetiva no clique); a UI avisa.
- **Avatar** → Supabase **Storage**, bucket `avatars`:
  - leitura **pública** (identidade visual, não sensível; ajuda a reconhecer nos grupos);
  - escrita só do **próprio**, na pasta `{uid}/` — RLS em `storage.objects`
    (`(storage.foldername(name))[1] = auth.uid()`), por isso ninguém sobrepõe o avatar de outro;
  - upload por **server action** (sob a sessão do user → a RLS aplica-se), `upsert`
    no caminho estável `{uid}/avatar.<ext>`, URL público com cache-bust.
- **Pagamentos** — secção placeholder sob `<hr/>` (vendas vêm depois).

## Forma

- `perfil.schema.ts` — zod (nome/email/password) + helpers PUROS testados:
  `validarAvatar` (PNG/JPG/WebP, ≤2 MB) e `caminhoAvatar(uid, mime)`.
- `perfil.service.ts` — escritas (`atualizarNomeCom`, `atualizarAvatarCom`); a
  LEITURA do perfil vem por props do layout (que já tem o `user`), não por action.
- `perfil.actions.ts` — `'use server'`, zod nas actions de texto; avatar via `FormData`.
- O layout (`app/(app)/layout.tsx`) carrega `display_name`+`avatar_url`+`email` e
  passa `perfil` pelo header → `ProfileMenu` → `PerfilModal`.

## Migration

`20260619130000_perfil_avatar.sql`: coluna `profiles.avatar_url` + bucket `avatars`
(público) + policies de insert/update/delete em `storage.objects` por pasta do dono.

## Pendente (nits diferidos)

- Smoke do caso adversarial da RLS (upload para `{outro_uid}/` → recusa) — não há teste automático.
- Reauth antes de mudar password (hardening de comercialização).
- `label htmlFor` para a11y; alinhar a action do avatar ao padrão zod.
