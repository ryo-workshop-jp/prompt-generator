import React from 'react';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { HELP_NOTE_URL } from '../constants/links';

const HelpModal: React.FC<{ isOpen: boolean; onClose: () => void; noteUrl?: string }> = ({ isOpen, onClose, noteUrl = HELP_NOTE_URL }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[120] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white">使い方</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-xl" aria-label="Close">
                        &times;
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-3">
                        <div className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2">
                            <div className="text-xs font-bold text-slate-200 mb-1">使い方</div>
                            <div className="text-xs text-slate-300 mb-2">
                                使い方はnoteの記事にまとめています。
                            </div>
                            <a
                                href={noteUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 text-xs text-cyan-200 hover:text-cyan-100"
                            >
                                <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                                noteを開く
                            </a>
                            <div className="text-[11px] text-slate-500 break-all mt-1">
                                {noteUrl}
                            </div>
                        </div>
                        <div className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2">
                            <div className="text-xs font-bold text-slate-200 mb-1">参考サイト</div>
                            <div className="text-xs text-slate-300 mb-2">
                                便利なタグの検索や確認に使えます。
                            </div>
                            <a
                                href="https://ai-nante.com/"
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 text-xs text-cyan-200 hover:text-cyan-100"
                            >
                                https://ai-nante.com/
                            </a>
                        </div>
                    </div>
                    <div className="flex flex-col gap-3">
                        <div className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2">
                            <div className="text-xs font-bold text-slate-200 mb-1">アップデート履歴</div>
                            <div className="text-xs text-slate-300">2026年2月13日</div>
                            <div className="text-xs text-slate-400 mt-2">・カードの機能の追加</div>
                            <div className="text-xs text-slate-300 mt-3">2026年1月31日</div>
                            <div className="text-xs text-slate-400 mt-2">・語句並び替え機能の追加</div>
                            <div className="text-xs text-slate-400">・複数および単体のデータ出力機能の追加</div>
                            <div className="text-xs text-slate-300 mt-3">2026年1月30日 プレリリース</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HelpModal;
