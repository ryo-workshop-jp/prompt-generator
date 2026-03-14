export const COMFY_PRESET_STORAGE_KEY = 'promptgen:comfy-presets';
export const COMFY_PRESET_UPDATE_EVENT = 'promptgen:comfy-presets-update';

export type ComfyQualityPreset = string;

export type ComfyPresetConfig = {
    label: string;
    description: string;
    width: number;
    height: number;
    steps: number;
    cfgScale: number;
    sampler: string;
    scheduler: string;
};

export const DEFAULT_COMFY_PRESET_CONFIG: Record<string, ComfyPresetConfig> = {
    draft: {
        label: '下書き',
        description: '確認用の軽量設定',
        width: 768,
        height: 1024,
        steps: 18,
        cfgScale: 5,
        sampler: 'dpmpp_2m',
        scheduler: 'karras'
    },
    standard: {
        label: '標準',
        description: '通常品質の標準設定',
        width: 1024,
        height: 1024,
        steps: 28,
        cfgScale: 6,
        sampler: 'dpmpp_2m_sde',
        scheduler: 'karras'
    },
    high: {
        label: '高品質',
        description: '高画質向け設定',
        width: 1344,
        height: 1344,
        steps: 40,
        cfgScale: 6.5,
        sampler: 'dpmpp_2m_sde',
        scheduler: 'karras'
    },
    square1524: {
        label: '正方形 1524',
        description: '1524 x 1524',
        width: 1524,
        height: 1524,
        steps: 36,
        cfgScale: 6.5,
        sampler: 'dpmpp_2m_sde',
        scheduler: 'karras'
    },
    landscapeFhd: {
        label: '横長 FHD',
        description: '1920 x 1080',
        width: 1920,
        height: 1080,
        steps: 32,
        cfgScale: 6,
        sampler: 'dpmpp_2m_sde',
        scheduler: 'karras'
    },
    portraitFhd: {
        label: '縦長 FHD',
        description: '1080 x 1920',
        width: 1080,
        height: 1920,
        steps: 32,
        cfgScale: 6,
        sampler: 'dpmpp_2m_sde',
        scheduler: 'karras'
    },
    custom: {
        label: '任意サイズ',
        description: '幅と高さを手動指定',
        width: 1024,
        height: 1024,
        steps: 28,
        cfgScale: 6,
        sampler: 'dpmpp_2m_sde',
        scheduler: 'karras'
    }
};

const clampResolution = (value: number) => {
    if (!Number.isFinite(value)) return 1024;
    return Math.min(4096, Math.max(64, Math.round(value)));
};

const clampSteps = (value: number) => {
    if (!Number.isFinite(value)) return 28;
    return Math.min(200, Math.max(1, Math.round(value)));
};

const clampCfgScale = (value: number) => {
    if (!Number.isFinite(value)) return 6;
    return Math.min(30, Math.max(0, Math.round(value * 10) / 10));
};

const cloneDefault = (): Record<ComfyQualityPreset, ComfyPresetConfig> => {
    return JSON.parse(JSON.stringify(DEFAULT_COMFY_PRESET_CONFIG)) as Record<ComfyQualityPreset, ComfyPresetConfig>;
};

export const normalizeComfyPresetConfig = (input: unknown): Record<ComfyQualityPreset, ComfyPresetConfig> => {
    if (!input || typeof input !== 'object') return cloneDefault();

    const defaults = cloneDefault();
    const entries = Object.entries(input as Record<string, unknown>);
    const normalized: Record<ComfyQualityPreset, ComfyPresetConfig> = {};

    for (const [rawKey, value] of entries) {
        const key = rawKey.trim();
        if (!key) continue;
        if (!value || typeof value !== 'object') continue;

        const preset = value as Partial<ComfyPresetConfig>;
        const fallback = defaults[key] ?? defaults.standard;
        normalized[key] = {
            label: typeof preset.label === 'string' && preset.label.trim() ? preset.label.trim() : fallback.label,
            description: typeof preset.description === 'string' ? preset.description.trim() : fallback.description,
            width: typeof preset.width === 'number' ? clampResolution(preset.width) : fallback.width,
            height: typeof preset.height === 'number' ? clampResolution(preset.height) : fallback.height,
            steps: typeof preset.steps === 'number' ? clampSteps(preset.steps) : fallback.steps,
            cfgScale: typeof preset.cfgScale === 'number' ? clampCfgScale(preset.cfgScale) : fallback.cfgScale,
            sampler: typeof preset.sampler === 'string' && preset.sampler.trim() ? preset.sampler.trim() : fallback.sampler,
            scheduler: typeof preset.scheduler === 'string' && preset.scheduler.trim() ? preset.scheduler.trim() : fallback.scheduler
        };
    }

    if (Object.keys(normalized).length === 0) {
        return defaults;
    }
    return normalized;
};

export const readComfyPresetConfig = (): Record<ComfyQualityPreset, ComfyPresetConfig> => {
    try {
        if (typeof window === 'undefined') return cloneDefault();
        const stored = localStorage.getItem(COMFY_PRESET_STORAGE_KEY);
        if (!stored) return cloneDefault();
        const parsed = JSON.parse(stored) as unknown;
        return normalizeComfyPresetConfig(parsed);
    } catch (e) {
        console.warn('Failed to load Comfy preset config.', e);
        return cloneDefault();
    }
};

export const writeComfyPresetConfig = (config: Record<ComfyQualityPreset, ComfyPresetConfig>) => {
    try {
        if (typeof window === 'undefined') return;
        const normalized = normalizeComfyPresetConfig(config);
        localStorage.setItem(COMFY_PRESET_STORAGE_KEY, JSON.stringify(normalized));
        window.dispatchEvent(new CustomEvent(COMFY_PRESET_UPDATE_EVENT, { detail: normalized }));
    } catch (e) {
        console.warn('Failed to save Comfy preset config.', e);
    }
};