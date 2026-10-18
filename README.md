# Lab Arcade

1. Supabase: já aplicado no projeto `lab-arcade` (`supabase/schema.sql`). Em outro projeto, rode o arquivo no SQL Editor e troque URL/chave em `js/supabase-client.js`.
2. Publique no GitHub Pages (Settings → Pages → branch `main`, pasta `/root`).
3. Sincronização: abra o app com `?lab=<código de 20+ caracteres [a-z0-9_-]>`. Quem tem o link compartilha o estado; sem o parâmetro, o app funciona só no próprio PC. Trate o link como senha.
4. Local: `python3 -m http.server` e abra `http://localhost:8000` (módulos ES e `fetch` não funcionam em `file://`).
