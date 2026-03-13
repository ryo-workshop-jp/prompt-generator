/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_GA_ID?: string;
    readonly VITE_GA_ENABLE_DEV?: 'true' | 'false';
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

