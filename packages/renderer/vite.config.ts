import { defineConfig } from 'vite';
import swc from 'vite-plugin-swc-transform';

export default defineConfig({
  esbuild: false,
  plugins: [
    swc({
      swcOptions: {
        jsc: {
          parser: {
            syntax: 'ecmascript',
            decorators: true,
          },
          transform: {
            decoratorVersion: '2022-03',
          },
        },
      },
    }),
  ],
});
