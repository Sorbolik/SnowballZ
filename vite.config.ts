import { defineConfig } from 'vite'

// Due ingressi nella stessa build:
//  - index.html: la pagina standalone del gioco (utile per provarlo da solo)
//  - snowballz.js: il micro-frontend, un modulo ES che registra <snowballz-demo>.
//    Ha un nome fisso così il portfolio può caricarlo da un URL stabile;
//    three.js è incluso dentro (~128 kB gzip), e il portfolio lo scarica solo al click.
export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        index: 'index.html',
        snowballz: 'src/element.ts',
      },
      preserveEntrySignatures: 'exports-only',
      output: {
        entryFileNames: (chunk) => (chunk.name === 'snowballz' ? 'snowballz.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  // Il portfolio in locale carica il modulo da qui (npm run build && npm run preview).
  preview: { port: 4174, cors: true },
  server: { port: 5175, cors: true },
})
