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
        window.gtag = (...args: unknown[]) => {
            window.dataLayer.push(args);
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
    return Object.fromEntries(
        Object.entries(params).filter(([, value]) => value !== undefined && value !== null)
    );
};

export const initAnalytics = () => {
    if (!ANALYTICS_ENABLED || initialized) return;
    if (!ensureGtag()) return;

    injectScript();
    window.gtag?.('js', new Date());
    window.gtag?.('config', GA_ID, {
        send_page_view: false,
        anonymize_ip: true,
        debug_mode: import.meta.env.DEV
    });

    initialized = true;
    trackPageView();
};

export const trackPageView = (pagePath?: string) => {
    if (!ANALYTICS_ENABLED || !canUseDom()) return;
    if (!initialized) initAnalytics();
    if (typeof window.gtag !== 'function') return;

    const path = pagePath ?? `${window.location.pathname}${window.location.search}`;
    window.gtag('event', 'page_view', {
        page_path: path,
        page_title: document.title,
        page_location: window.location.href
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

