type AnalyticsValue = string | number | boolean | null | undefined;
type AnalyticsParams = Record<string, AnalyticsValue>;

const DEFAULT_GA_ID = 'G-XJG8B4JRV7';
const rawGaId = import.meta.env.VITE_GA_ID ?? DEFAULT_GA_ID;
const GA_ID = rawGaId.trim();
const ENABLE_IN_DEV = import.meta.env.VITE_GA_ENABLE_DEV === 'true';
const ANALYTICS_ENABLED = Boolean(GA_ID) && (import.meta.env.PROD || ENABLE_IN_DEV);

let initialized = false;
let scriptInjected = false;

declare global {
    interface Window {
        dataLayer: unknown[];
        gtag?: (...args: unknown[]) => void;
    }
}

const canUseDom = () => typeof window !== 'undefined' && typeof document !== 'undefined';

const ensureGtag = () => {
    if (!canUseDom()) return false;
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== 'function') {
        window.gtag = function () {
            // gtag.js requires an Arguments object; plain arrays are not commands.
            // eslint-disable-next-line prefer-rest-params
            window.dataLayer.push(arguments);
        };
    }
    return true;
};

const injectScript = () => {
    if (!canUseDom() || scriptInjected) return;
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    script.dataset.promptgenGa = 'true';
    document.head.appendChild(script);
    scriptInjected = true;
};

const sanitizeParams = (params: AnalyticsParams = {}) => {
    // ID・独自名などの文字列は送信せず、件数と状態だけを計測する。
    const numericKeys = ['removed_folder_count', 'affected_count', 'template_count', 'image_count', 'job_count', 'width', 'height', 'steps', 'cfg_scale', 'text_length', 'word_count'];
    const booleanKeys = ['has_note', 'has_positive', 'has_negative'];
    return Object.fromEntries(
        Object.entries(params).filter(([key, value]) => {
            if (numericKeys.includes(key)) return typeof value === 'number' && Number.isFinite(value);
            if (booleanKeys.includes(key)) return typeof value === 'boolean';
            if (key === 'copy_scope') return value === 'pos' || value === 'neg' || value === 'both';
            if (key === 'save_mode') return value === 'favorite' || value === 'quality_template' || value === 'deck';
            if (key === 'prompt_type') return value === 'positive' || value === 'negative';
            return false;
        })
    );
};

export const initAnalytics = () => {
    if (!ANALYTICS_ENABLED || initialized) return;
    if (!ensureGtag()) return;

    injectScript();
    window.gtag?.('js', new Date());
    window.gtag?.('config', GA_ID, {
        // URL内のクエリ・ハッシュ・参照元に含まれる情報を計測から除外する。
        page_location: window.location.origin + window.location.pathname,
        page_referrer: '',
        send_page_view: false,
        anonymize_ip: true,
        debug_mode: import.meta.env.DEV
    });

    initialized = true;
    trackPageView();
};

export const trackPageView = () => {
    if (!ANALYTICS_ENABLED || !canUseDom()) return;
    if (!initialized) initAnalytics();
    if (typeof window.gtag !== 'function') return;

    const path = window.location.pathname;
    window.gtag('event', 'page_view', {
        page_path: path,
        page_title: document.title,
        page_location: window.location.origin + path,
        page_referrer: ''
    });
};

export const trackEvent = (eventName: string, params: AnalyticsParams = {}) => {
    if (!ANALYTICS_ENABLED || !eventName) return;
    if (!initialized) initAnalytics();
    if (!canUseDom() || typeof window.gtag !== 'function') return;

    window.gtag('event', eventName, sanitizeParams(params));
};

export const analyticsEnabled = ANALYTICS_ENABLED;
export const analyticsMeasurementId = GA_ID;

