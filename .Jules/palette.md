## 2026-06-20 - [Shortcut de Procura Global]
**Learning:** Em ferramentas de produtividade inspiradas no Obsidian, os utilizadores esperam atalhos de teclado padrão (como Cmd+K) para ações frequentes. Adicionar um visual hint (`<kbd>`) melhora a descoberta sem sobrecarregar a UI. Diferenciar entre `⌘` e `Ctrl` com base no OS é um pequeno toque de polimento que faz a app sentir-se nativa.
**Action:** Ao implementar atalhos de teclado, usar sempre uma lógica de deteção de plataforma para mostrar o símbolo correto (`⌘` vs `Ctrl`) e garantir que o listener é limpo no `useEffect`.
