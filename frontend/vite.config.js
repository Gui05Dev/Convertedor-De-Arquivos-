import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* O backend do proxy é o mesmo em dev e no preview: sempre esta máquina. Quem abre a
   página de outro aparelho continua chamando /api no endereço da página, e o proxy é
   quem alcança o backend — que segue sem precisar estar exposto na rede. */
const API_PROXY = {
  "/api": {
    target: process.env.VITE_DEV_BACKEND || "http://localhost:3000",
    changeOrigin: true,
  },
};

/* Configuração de rede compartilhada por `vite dev` e `vite preview`.

   host: true faz o Vite escutar em todas as interfaces (0.0.0.0) em vez de só em
   localhost — é o que permite abrir a página de outro aparelho da rede. Ao subir, o
   Vite imprime a URL "Network:" já com o IP, que é o link pra compartilhar.

   strictPort porque o endereço vai ser passado adiante: se a porta estiver ocupada, é
   melhor falhar na hora do que subir noutra porta e deixar o link que você mandou
   apontando pro vazio.

   allowedHosts libera também o nome da máquina na rede (ex.: http://NOTEBOOK-01:5173);
   por padrão o Vite só aceita Host localhost ou IP. */
const network = (port) => ({
  host: true,
  port,
  strictPort: true,
  allowedHosts: true,
  proxy: API_PROXY,
});

export default defineConfig({
  plugins: [react()],

  server: network(5173),
  preview: network(4173),

  build: {
    outDir: "dist",
    /* Sem sourcemap no bundle publicado: não há segredo no frontend, mas também não há
       motivo pra servir o código-fonte junto. */
    sourcemap: false,
  },
});
