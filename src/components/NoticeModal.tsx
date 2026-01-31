import React, { useState } from 'react';

const NOTICE_STORAGE_KEY = 'promptgen:notice-dismissed';

const NoticeModal: React.FC<{ isOpen: boolean; onConfirm: (skipNext: boolean) => void }> = ({ isOpen, onConfirm }) => {
    const [skipNext, setSkipNext] = useState(false);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[130] pointer-events-auto flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col gap-4">
                <h3 className="text-lg font-bold text-white">アプリ使用上の注意事項</h3>
                <div className="text-xs text-slate-300 leading-relaxed overflow-y-auto pr-1 custom-scrollbar">
                    <div className="font-bold text-slate-200 mb-1">本アプリについて</div>
                    <div>・本アプリは、Stable Diffusion等の画像生成AIで使用するプロンプト作成を補助するためのツールです。</div>
                    <div>・生成されるプロンプトの内容や、それを使用して作成された画像の結果を保証するものではありません。</div>
                    <div className="font-bold text-slate-200 mt-3 mb-1">生成結果・利用責任について</div>
                    <div>・本アプリを利用して生成された画像の内容や利用については、ご利用者ご自身の責任でお願いいたします。</div>
                    <div>・各画像生成サービス（Stable Diffusion、Webサービス等）の利用規約・ガイドラインを必ずご確認の上、ご利用ください。</div>
                    <div className="font-bold text-slate-200 mt-3 mb-1">プロンプト・語群について</div>
                    <div>・本アプリに含まれるプロンプトや語群は、一般的な表現や、公開情報をもとに整理・再構成したものです。</div>
                    <div>・一部の語群は、外部サイト・個人の方の公開情報を参考にしています。</div>
                    <div className="font-bold text-slate-200 mt-3 mb-1">NSFWコンテンツについて</div>
                    <div>・NSFW（閲覧注意）に該当する可能性のある語群は、設定により表示・非表示を切り替えることができます。</div>
                    <div>・NSFW設定を有効にする場合は、各自の環境や利用目的に配慮した上でご利用ください。</div>
                    <div className="font-bold text-slate-200 mt-3 mb-1">免責事項</div>
                    <div>・本アプリの利用によって生じたいかなる損害・トラブルについても、開発者は責任を負いかねます。</div>
                    <div>・仕様は予告なく変更される場合があります。</div>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                        type="checkbox"
                        checked={skipNext}
                        onChange={(event) => setSkipNext(event.target.checked)}
                        className="rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50"
                    />
                    次回以降表示しない
                </label>
                <button
                    type="button"
                    onClick={() => onConfirm(skipNext)}
                    className="w-full rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-bold text-cyan-200 hover:bg-cyan-500/20 transition-colors"
                >
                    同意して利用
                </button>
            </div>
        </div>
    );
};

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

export default NoticeModal;
