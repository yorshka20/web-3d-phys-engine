/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REPO_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type Any = any;

declare module '*.wgsl' {
  const content: string;
  export default content;
}
