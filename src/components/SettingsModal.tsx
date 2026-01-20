import React, { useMemo, useRef, useState } from 'react';
import { usePrompt } from '../context/usePrompt';
import type { FolderItem, WordItem, TemplateItem, TemplateOption } from '../types';


const TemplateModal: React.FC<{
    isOpen: boolean;
    template: TemplateItem | null;
    onClose: () => void;
    onSave: (template: TemplateItem) => void;
}> = ({ isOpen, template, onClose, onSave }) => {
    const [name, setName] = useState(template?.name ?? '');
    const [options, setOptions] = useState<TemplateOption[]>(template?.options ?? []);
    const [allowFree, setAllowFree] = useState(!!template?.allowFree);
    const [newLabel, setNewLabel] = useState('');
    const [newValue, setNewValue] = useState('');

    const canSave = useMemo(() => name.trim().length > 0, [name]);

    if (!isOpen) return null;

    const handleAddOption = () => {
        const label = newLabel.trim();
        const value = (newValue.trim() || label).trim();
        if (!label || !value) return;
        const id = Date.now().toString();
        const next = [...options, { id, label, value }];
        setOptions(next);
        setNewLabel('');
        setNewValue('');
    };

    const handleSave = () => {
        if (!canSave) return;
        const payload: TemplateItem = {
            id: template?.id ?? Date.now().toString(),
            name: name.trim(),
            options,
            allowFree
        };
        onSave(payload);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">{template ? '前置語を編集' : '前置語を追加'}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">&times;</button>
                </div>
                <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto pr-1">
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">前置語名</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-cyan-500 focus:outline-none"
                            placeholder="e.g. Color"
                        />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={allowFree}
                            onChange={(event) => setAllowFree(event.target.checked)}
                            className="rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50"
                        />
                        <span className="text-sm text-slate-300">自由入力を許可</span>
                    </label>
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-slate-200">候補</span>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={newLabel}
                                    onChange={(event) => setNewLabel(event.target.value)}
                                    className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:border-cyan-500 focus:outline-none"
                                    placeholder="表示名"
                                />
                                <input
                                    type="text"
                                    value={newValue}
                                    onChange={(event) => setNewValue(event.target.value)}
                                    className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:border-cyan-500 focus:outline-none"
                                    placeholder="出力語句（省略可）"
                                />
                                <button
                                    type="button"
                                    onClick={handleAddOption}
                                    className="px-2 py-1 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                                >
                                    追加
                                </button>
                            </div>
                        </div>
                        <div className="max-h-40 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                            {options.length === 0 && (
                                <div className="text-xs text-slate-500">候補がまだありません。</div>
                            )}
                            {options.map(option => (
                                <div key={option.id} className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={option.label}
                                        onChange={(event) => {
                                            const next = options.map(item => item.id === option.id ? { ...item, label: event.target.value } : item);
                                            setOptions(next);
                                        }}
                                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:border-cyan-500 focus:outline-none"
                                    />
                                    <input
                                        type="text"
                                        value={option.value}
                                        onChange={(event) => {
                                            const next = options.map(item => item.id === option.id ? { ...item, value: event.target.value } : item);
                                            setOptions(next);
                                        }}
                                        className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:border-cyan-500 focus:outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setOptions(options.filter(item => item.id !== option.id))}
                                        className="px-2 py-1 text-xs rounded bg-slate-800 text-slate-400 hover:text-rose-400"
                                    >
                                        削除
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={!canSave}
                            className={`flex-1 px-4 py-2 rounded-lg font-bold transition-colors ${canSave
                                ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                }`}
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { folders, words, templates, setData, addTemplate, updateTemplate, removeTemplate, nsfwEnabled, showDescendantWords, autoNsfwOn, toggleNsfw, toggleShowDescendantWords, toggleAutoNsfwOn, saveChanges, hasUnsavedChanges } = usePrompt();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [editingTemplate, setEditingTemplate] = useState<TemplateItem | null>(null);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

    if (!isOpen) return null;

    const handleSave = async () => {
        const ok = await saveChanges();
        if (ok) {
            window.location.reload();
        } else {
            alert('保存に失敗しました。');
        }
    };

    const handleExport = () => {
        const payload = JSON.stringify({ folders, words, templates }, null, 2);
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'promptgen-data.json';
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text) as { folders?: FolderItem[]; words?: WordItem[]; templates?: TemplateItem[] };
            if (!Array.isArray(parsed.folders) || !Array.isArray(parsed.words)) {
                alert('JSON形式が正しくありません。{ folders: [], words: [] } が必要です。');
                return;
            }
            if (!confirm('インポートすると現在のデータが上書きされます。続行しますか？')) return;
            setData({ folders: parsed.folders, words: parsed.words, templates: parsed.templates ?? [] });
            alert('インポートが完了しました。');
        } catch (error) {
            console.error('Failed to import data', error);
            alert('JSONファイルの読み込みに失敗しました。');
        } finally {
            if (event.target) event.target.value = '';
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl h-[80vh] rounded-2xl shadow-2xl flex flex-col">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-950 rounded-t-2xl">
                    <h2 className="text-xl font-bold text-white">データ管理</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">&times;</button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="flex flex-col gap-4">
                        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                            <h3 className="text-lg font-bold text-white mb-2">全体設定</h3>
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-slate-200">NSFWコンテンツ</span>
                                    <span className="text-xs text-slate-500">NSFWのフォルダ・語句を全体で有効/無効にします。</span>
                                </div>
                                <button
                                    onClick={toggleNsfw}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${nsfwEnabled ? 'bg-red-500' : 'bg-slate-600'
                                        }`}
                                >
                                    <span
                                        className={`${nsfwEnabled ? 'translate-x-6' : 'translate-x-1'
                                            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                    />
                                </button>
                            </div>
                            <div className="flex items-center justify-between mt-4">
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-slate-200">下層フォルダの語群を表示</span>
                                    <span className="text-xs text-slate-500">選択中フォルダ配下の語群をまとめて表示します。</span>
                                </div>
                                <button
                                    onClick={toggleShowDescendantWords}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${showDescendantWords ? 'bg-cyan-500' : 'bg-slate-600'
                                        }`}
                                >
                                    <span
                                        className={`${showDescendantWords ? 'translate-x-6' : 'translate-x-1'
                                            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                    />
                                </button>
                            </div>
                            <div className="flex items-center justify-between mt-4">
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-slate-200">NSFW ON時に自動でNSFWを追加</span>
                                    <span className="text-xs text-slate-500">NSFW表示がONのとき自動で追加します。</span>
                                </div>
                                <button
                                    onClick={toggleAutoNsfwOn}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${autoNsfwOn ? 'bg-cyan-500' : 'bg-slate-600'
                                        }`}
                                >
                                    <span
                                        className={`${autoNsfwOn ? 'translate-x-6' : 'translate-x-1'
                                            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                    />
                                </button>
                            </div>
                        </div>
                        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                            <h3 className="text-lg font-bold text-white mb-2">データのバックアップ</h3>
                            <p className="text-xs text-slate-500 mb-4">
                                フォルダと語句をJSONで書き出し/読み込みします。
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleExport}
                                    className="px-3 py-1.5 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                                >
                                    JSONを書き出し
                                </button>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="px-3 py-1.5 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                                >
                                    JSONを読み込み
                                </button>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="application/json"
                                onChange={handleImport}
                                className="hidden"
                            />
                        </div>
                        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-lg font-bold text-white">前置語</h3>
                                <button
                                    onClick={() => {
                                        setEditingTemplate(null);
                                        setIsTemplateModalOpen(true);
                                    }}
                                    className="px-3 py-1.5 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                                >
                                    追加
                                </button>
                            </div>
                            <div className="flex flex-col gap-2">
                                {templates.length === 0 && (
                                    <div className="text-xs text-slate-500">前置語がありません。</div>
                                )}
                                {templates.map(template => (
                                    <div key={template.id} className="flex items-center justify-between gap-3 border border-slate-700 rounded-lg px-3 py-2">
                                        <div>
                                            <div className="text-sm font-bold text-slate-200">{template.name}</div>
                                            <div className="text-[11px] text-slate-500">
                                                {template.options.length} 件
                                                {template.allowFree ? ' + 自由入力' : ''}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingTemplate(template);
                                                    setIsTemplateModalOpen(true);
                                                }}
                                                className="px-2 py-1 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                                            >
                                                編集
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!confirm('Delete this template? Linked words will revert to normal words.')) return;
                                                    removeTemplate(template.id);
                                                }}
                                                className="px-2 py-1 text-xs rounded bg-slate-800 text-slate-400 hover:text-rose-400"
                                            >
                                                削除
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t border-slate-700 bg-slate-950 rounded-b-2xl flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                        {hasUnsavedChanges ? '未保存の変更があります' : 'すべて保存済みです'}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 text-xs rounded bg-slate-800 text-slate-400 hover:bg-slate-700"
                        >
                            閉じる
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!hasUnsavedChanges}
                            className={`px-3 py-1.5 text-xs rounded font-bold transition-colors ${hasUnsavedChanges
                                ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                }`}
                        >
                            保存
                        </button>
                    </div>
                </div>
            </div>
            <TemplateModal
                key={editingTemplate?.id ?? 'new'}
                isOpen={isTemplateModalOpen}
                template={editingTemplate}
                onClose={() => setIsTemplateModalOpen(false)}
                onSave={(payload) => {
                    if (editingTemplate) {
                        updateTemplate(payload);
                        return;
                    }
                    addTemplate(payload);
                }}
            />
        </div>
    );
};

export default SettingsModal;


