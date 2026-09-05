const NOTICE_STORAGE_KEY = 'promptgen:notice-dismissed';

export const readNoticeDismissed = () => {
    try {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem(NOTICE_STORAGE_KEY) === '1';
    } catch (e) {
        console.warn('Failed to load notice settings.', e);
        return false;
    }
};

export const writeNoticeDismissed = (dismissed: boolean) => {
    try {
        if (typeof window === 'undefined') return;
        localStorage.setItem(NOTICE_STORAGE_KEY, dismissed ? '1' : '0');
    } catch (e) {
        console.warn('Failed to save notice settings.', e);
    }
};
