/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REPO_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

declare module '*.wgsl' {
  const content: string;
  export default content;
}
