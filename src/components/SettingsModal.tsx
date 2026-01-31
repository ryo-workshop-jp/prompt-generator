import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Bars3Icon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { usePrompt } from '../context/usePrompt';
import type { FolderItem, WordItem, TemplateItem, TemplateOption, PromptFavorite } from '../types';
import { initialData } from '../data/initialData';


const UI_STORAGE_KEY = 'promptgen:ui';

const readUiSettings = () => {
    try {
        if (typeof window === 'undefined') return {};
        const stored = localStorage.getItem(UI_STORAGE_KEY);
        if (!stored) return {};
        const parsed = JSON.parse(stored) as {
            nsfwConfirmSkip?: boolean;
            stepperDisplay?: 'inside' | 'above';
            combinedCopyEnabled?: boolean;
            showRootInPaths?: boolean;
            showItemFolderPath?: boolean;
        };
        const showFolderPath = parsed.showItemFolderPath ?? parsed.showRootInPaths ?? false;
        return {
            ...parsed,
            showItemFolderPath: showFolderPath,
            showRootInPaths: showFolderPath
        };
    } catch (e) {
        console.warn('Failed to load UI settings.', e);
        return {};
    }
};

const writeUiSettings = (updates: {
    nsfwConfirmSkip?: boolean;
    stepperDisplay?: 'inside' | 'above';
    combinedCopyEnabled?: boolean;
    showRootInPaths?: boolean;
    showItemFolderPath?: boolean;
}) => {
    try {
        if (typeof window === 'undefined') return;
        const current = readUiSettings();
        const next = { ...current, ...updates };
        localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(next));
        window.dispatchEvent(new CustomEvent('promptgen:ui-update', { detail: next }));
    } catch (e) {
        console.warn('Failed to save UI settings.', e);
    }
};

const SortableOptionRow: React.FC<{
    option: TemplateOption;
    onLabelChange: (value: string) => void;
    onValueChange: (value: string) => void;
    onDelete: () => void;
}> = ({ option, onLabelChange, onValueChange, onDelete }) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: option.id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition
    };

    return (
        <div ref={setNodeRef} style={style} className="flex items-center gap-2">
            <button
                type="button"
                {...attributes}
                {...listeners}
                title="Drag to reorder"
                className="flex h-7 w-7 items-center justify-center rounded bg-slate-800 text-slate-400 hover:text-slate-200"
            >
                <Bars3Icon className="h-4 w-4" />
            </button>
            <input
                type="text"
                value={option.label}
                onChange={(event) => onLabelChange(event.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
            <input
                type="text"
                value={option.value}
                onChange={(event) => onValueChange(event.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
            <button
                type="button"
                onClick={onDelete}
                className="px-2 py-1 text-xs rounded bg-slate-800 text-slate-400 hover:text-rose-400"
            >
                削除
            </button>
        </div>
    );
};

const TemplateModal: React.FC<{
    isOpen: boolean;
    template: TemplateItem | null;
    onClose: () => void;
    onSave: (template: TemplateItem) => void;
}> = ({ isOpen, template, onClose, onSave }) => {
    const [name, setName] = useState(template?.name ?? '');
    const [options, setOptions] = useState<TemplateOption[]>(template?.options ?? []);
    const [allowFree, setAllowFree] = useState(!!template?.allowFree);
    const [spaceEnabled, setSpaceEnabled] = useState(template?.spaceEnabled ?? true);
    const [position, setPosition] = useState<TemplateItem['position']>(template?.position ?? 'before');
    const [newLabel, setNewLabel] = useState('');
    const [newValue, setNewValue] = useState('');

    const canSave = useMemo(() => name.trim().length > 0, [name]);
    const optionSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

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
            allowFree,
            spaceEnabled,
            position
        };
        onSave(payload);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">{template ? '装飾を編集' : '装飾を追加'}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">&times;</button>
                </div>
                <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto pr-1">
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">装飾名</label>
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
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={spaceEnabled}
                            onChange={(event) => setSpaceEnabled(event.target.checked)}
                            className="rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50"
                        />
                        <span className="text-sm text-slate-300">装飾とプロンプトの間にスペースを入れる</span>
                    </label>
                    <label className="block text-xs text-slate-400">
                        挿入位置
                        <select
                            value={position ?? 'before'}
                            onChange={(event) => setPosition(event.target.value as TemplateItem['position'])}
                            className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                        >
                            <option value="before">前方</option>
                            <option value="after">後方</option>
                        </select>
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
                        <DndContext
                            sensors={optionSensors}
                            collisionDetection={closestCenter}
                            onDragEnd={(event: DragEndEvent) => {
                                const { active, over } = event;
                                if (!over || active.id === over.id) return;
                                const oldIndex = options.findIndex(item => item.id === active.id);
                                const newIndex = options.findIndex(item => item.id === over.id);
                                if (oldIndex === -1 || newIndex === -1) return;
                                setOptions(arrayMove(options, oldIndex, newIndex));
                            }}
                        >
                            <SortableContext
                                items={options.map(option => option.id)}
                                strategy={rectSortingStrategy}
                            >
                                <div className="max-h-40 overflow-y-auto custom-scrollbar flex flex-col gap-2">
                                    {options.length === 0 && (
                                        <div className="text-xs text-slate-500">候補がまだありません。</div>
                                    )}
                                    {options.map(option => (
                                        <SortableOptionRow
                                            key={option.id}
                                            option={option}
                                            onLabelChange={(value) => {
                                                const next = options.map(item => item.id === option.id ? { ...item, label: value } : item);
                                                setOptions(next);
                                            }}
                                            onValueChange={(value) => {
                                                const next = options.map(item => item.id === option.id ? { ...item, value } : item);
                                                setOptions(next);
                                            }}
                                            onDelete={() => setOptions(options.filter(item => item.id !== option.id))}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
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

const SortableTemplateRow: React.FC<{
    template: TemplateItem;
    onEdit: () => void;
    onDelete: () => void;
}> = ({ template, onEdit, onDelete }) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: template.id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition
    };

    return (
        <div ref={setNodeRef} style={style} className="flex items-center justify-between gap-3 border border-slate-700 rounded-lg px-3 py-2">
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    title="Drag to reorder"
                    className="flex h-7 w-7 items-center justify-center rounded bg-slate-800 text-slate-400 hover:text-slate-200"
                >
                    <Bars3Icon className="h-4 w-4" />
                </button>
                <div>
                    <div className="text-sm font-bold text-slate-200">{template.name}</div>
                    <div className="text-[11px] text-slate-500">
                        {template.options.length} 件
                        {template.allowFree ? ' + 自由入力' : ''}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={onEdit}
                    className="px-2 py-1 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                >
                    編集
                </button>
                <button
                    type="button"
                    onClick={onDelete}
                    className="px-2 py-1 text-xs rounded bg-slate-800 text-slate-400 hover:text-rose-400"
                >
                    削除
                </button>
            </div>
        </div>
    );
};

const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { folders, words, cards, templates, favorites, qualityTemplates, setData, addTemplate, updateTemplate, removeTemplate, setFavoritesData, setQualityTemplatesData, nsfwEnabled, showDescendantWords, autoNsfwOn, collapseInactiveFolders, toggleNsfw, toggleShowDescendantWords, toggleAutoNsfwOn, toggleCollapseInactiveFolders } = usePrompt();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [editingTemplate, setEditingTemplate] = useState<TemplateItem | null>(null);
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [isNsfwConfirmOpen, setIsNsfwConfirmOpen] = useState(false);
    const [skipNsfwConfirm, setSkipNsfwConfirm] = useState(false);
    const [nsfwConfirmSkipped, setNsfwConfirmSkipped] = useState(() => {
        const settings = readUiSettings();
        return !!settings.nsfwConfirmSkip;
    });
    const [stepperDisplay, setStepperDisplay] = useState<'inside' | 'above'>(() => {
        const settings = readUiSettings();
        return settings.stepperDisplay ?? 'above';
    });
    const [combinedCopyEnabled, setCombinedCopyEnabled] = useState<boolean>(() => {
        const settings = readUiSettings();
        return !!settings.combinedCopyEnabled;
    });
    const [showItemFolderPath, setShowItemFolderPath] = useState<boolean>(() => {
        const settings = readUiSettings();
        return settings.showItemFolderPath ?? false;
    });
    const [activeTab, setActiveTab] = useState<'general' | 'io' | 'templates'>('general');
    const [importMode, setImportMode] = useState<'all' | 'words' | 'favorites' | 'quality' | 'templates' | null>(null);
    const [pendingWordsImport, setPendingWordsImport] = useState<{ folders: FolderItem[]; words: WordItem[] } | null>(null);
    const [resetAction, setResetAction] = useState<'resetWords' | 'clearWords' | 'clearExtras' | null>(null);
    const [resetConfirmed, setResetConfirmed] = useState(false);
    const [selectedFolderExportIds, setSelectedFolderExportIds] = useState<string[]>([]);
    const [selectedWordExportIds, setSelectedWordExportIds] = useState<string[]>([]);
    const [selectedFavoriteExportIds, setSelectedFavoriteExportIds] = useState<string[]>([]);
    const [selectedQualityExportIds, setSelectedQualityExportIds] = useState<string[]>([]);
    const [selectedTemplateExportIds, setSelectedTemplateExportIds] = useState<string[]>([]);
    const [isWordExportPickerOpen, setIsWordExportPickerOpen] = useState(false);
    const [isFavoriteExportPickerOpen, setIsFavoriteExportPickerOpen] = useState(false);
    const [isQualityExportPickerOpen, setIsQualityExportPickerOpen] = useState(false);
    const [isTemplateExportPickerOpen, setIsTemplateExportPickerOpen] = useState(false);
    const [wordExportActiveFolderId, setWordExportActiveFolderId] = useState('root');
    const [wordExportSearch, setWordExportSearch] = useState('');
    const [wordExportExpandedFolderIds, setWordExportExpandedFolderIds] = useState<string[]>(['root']);
    const templateSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const folderById = useMemo(() => {
        return new Map(folders.map(folder => [folder.id, folder]));
    }, [folders]);

    const getFolderPath = useCallback((folderId: string | null) => {
        if (!folderId) return 'root';
        const path: string[] = [];
        let cursor: string | null = folderId;
        while (cursor) {
            const folder = folderById.get(cursor);
            if (!folder) break;
            path.unshift(folder.name);
            cursor = folder.parentId;
        }
        if (path.length === 0) return 'root';
        if (path[0] === 'root') return path.join(' / ');
        return `root / ${path.join(' / ')}`;
    }, [folderById]);

    const favoriteExportOptions = useMemo(() => {
        return favorites
            .map(fav => ({
                id: fav.id,
                label: `${fav.name} (${fav.type})`
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [favorites]);

    const qualityExportOptions = useMemo(() => {
        return qualityTemplates
            .map(template => ({
                id: template.id,
                label: `${template.name} (${template.type})`
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [qualityTemplates]);

    const templateExportOptions = useMemo(() => {
        return templates
            .map(template => ({
                id: template.id,
                label: `${template.name} (${template.options.length}件)`
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [templates]);

    const collectDescendantFolderIds = (startIds: string[]) => {
        const visited = new Set<string>();
        const queue = [...startIds];
        while (queue.length > 0) {
            const current = queue.shift();
            if (!current || visited.has(current)) continue;
            visited.add(current);
            const children = folders.filter(folder => folder.parentId === current);
            for (const child of children) queue.push(child.id);
        }
        return visited;
    };

    const collectAncestorFolderIds = (startIds: Set<string>) => {
        const visited = new Set<string>();
        for (const startId of startIds) {
            let cursor: string | null = startId;
            while (cursor) {
                const folder = folderById.get(cursor);
                if (!folder) break;
                if (!visited.has(folder.id)) {
                    visited.add(folder.id);
                }
                cursor = folder.parentId ?? null;
            }
        }
        return visited;
    };

    const selectedFolderIdSet = useMemo(() => new Set(selectedFolderExportIds), [selectedFolderExportIds]);
    const isRootSelectedForExport = selectedFolderIdSet.has('root');
    const selectedFolderDescendantIds = useMemo(() => {
        if (isRootSelectedForExport) {
            return new Set(folders.map(folder => folder.id));
        }
        return collectDescendantFolderIds(selectedFolderExportIds.filter(id => id !== 'root'));
    }, [folders, isRootSelectedForExport, selectedFolderExportIds]);
    const selectedWordIdSet = useMemo(() => new Set(selectedWordExportIds), [selectedWordExportIds]);
    const totalSelectedWordCount = useMemo(() => {
        if (isRootSelectedForExport) return words.length;
        const ids = new Set<string>();
        words.forEach(word => {
            if (selectedFolderDescendantIds.has(word.folderId) || selectedWordIdSet.has(word.id)) {
                ids.add(word.id);
            }
        });
        return ids.size;
    }, [isRootSelectedForExport, selectedFolderDescendantIds, selectedWordIdSet, words]);
    const wordExportVisibleWords = useMemo(() => {
        const query = wordExportSearch.trim().toLowerCase();
        if (query) {
            return words.filter(word => {
                const target = `${word.label_jp} ${word.value_en} ${word.note ?? ''}`.toLowerCase();
                return target.includes(query);
            });
        }
        if (wordExportActiveFolderId === 'root') {
            return words.filter(word => word.folderId === 'root');
        }
        return words.filter(word => word.folderId === wordExportActiveFolderId);
    }, [wordExportActiveFolderId, wordExportSearch, words]);

    const folderChildrenByParent = useMemo(() => {
        const map = new Map<string | null, FolderItem[]>();
        for (const folder of folders) {
            const key = folder.parentId ?? null;
            if (!map.has(key)) map.set(key, []);
            map.get(key)?.push(folder);
        }
        for (const list of map.values()) {
            list.sort((a, b) => a.name.localeCompare(b.name));
        }
        return map;
    }, [folders]);

    useEffect(() => {
        if (!isWordExportPickerOpen) return;
        const next = new Set<string>(['root']);
        let cursor: string | null = wordExportActiveFolderId;
        while (cursor && cursor !== 'root') {
            next.add(cursor);
            const folder = folderById.get(cursor);
            cursor = folder?.parentId ?? null;
        }
        setWordExportExpandedFolderIds(Array.from(next));
    }, [folderById, isWordExportPickerOpen, wordExportActiveFolderId]);

    const wordExportExpandedSet = useMemo(() => new Set(wordExportExpandedFolderIds), [wordExportExpandedFolderIds]);
    const toggleWordExportFolderExpanded = (id: string) => {
        setWordExportExpandedFolderIds(prev => prev.includes(id)
            ? prev.filter(item => item !== id)
            : [...prev, id]
        );
    };

    const downloadJson = (payload: unknown, filename: string) => {
        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleExportAll = () => {
        downloadJson({ folders, words, cards, templates, favorites, qualityTemplates }, 'promptgen-all.json');
    };

    const handleExportWords = () => {
        downloadJson({ folders, words }, 'promptgen-words.json');
    };

    const handleExportFavorites = () => {
        downloadJson({ favorites }, 'promptgen-favorites.json');
    };

    const handleExportQuality = () => {
        downloadJson({ qualityTemplates }, 'promptgen-quality-templates.json');
    };

    const handleExportTemplates = () => {
        downloadJson({ templates }, 'promptgen-templates.json');
    };

    const handleExportSelectedTemplates = () => {
        if (selectedTemplateExportIds.length === 0) {
            alert('出力する装飾を選択してください。');
            return;
        }
        const selected = templates.filter(template => selectedTemplateExportIds.includes(template.id));
        downloadJson({ templates: selected }, 'promptgen-templates-selected.json');
    };

    const handleExportSelectedWords = () => {
        if (selectedFolderExportIds.length === 0 && selectedWordExportIds.length === 0) {
            alert('出力する語群を選択してください。');
            return;
        }
        const isRootSelected = selectedFolderExportIds.includes('root');
        const folderIds = isRootSelected
            ? new Set(folders.map(folder => folder.id))
            : collectDescendantFolderIds(selectedFolderExportIds.filter(id => id !== 'root'));

        const selectedWordIds = new Set<string>();
        if (isRootSelected) {
            words.forEach(word => selectedWordIds.add(word.id));
        } else {
            words.forEach(word => {
                if (folderIds.has(word.folderId)) selectedWordIds.add(word.id);
            });
            selectedWordExportIds.forEach(id => selectedWordIds.add(id));
        }

        const folderIdsFromWords = collectAncestorFolderIds(
            new Set(words.filter(word => selectedWordIds.has(word.id)).map(word => word.folderId))
        );
        const allFolderIds = isRootSelected
            ? folderIds
            : new Set([...folderIds, ...folderIdsFromWords]);
        const selectedFolders = folders.filter(folder => allFolderIds.has(folder.id));
        const selectedWords = words.filter(word => selectedWordIds.has(word.id));
        downloadJson({ folders: selectedFolders, words: selectedWords }, 'promptgen-words-selected.json');
    };

    const handleExportSelectedFavorites = () => {
        if (selectedFavoriteExportIds.length === 0) {
            alert('出力するお気に入りを選択してください。');
            return;
        }
        const selected = favorites.filter(fav => selectedFavoriteExportIds.includes(fav.id));
        downloadJson({ favorites: selected }, 'promptgen-favorites-selected.json');
    };

    const handleExportSelectedQuality = () => {
        if (selectedQualityExportIds.length === 0) {
            alert('出力する品質テンプレートを選択してください。');
            return;
        }
        const selected = qualityTemplates.filter(template => selectedQualityExportIds.includes(template.id));
        downloadJson({ qualityTemplates: selected }, 'promptgen-quality-templates-selected.json');
    };

    const handleToggleFavoriteExport = (id: string) => {
        setSelectedFavoriteExportIds(prev => prev.includes(id)
            ? prev.filter(item => item !== id)
            : [...prev, id]
        );
    };

    const handleToggleQualityExport = (id: string) => {
        setSelectedQualityExportIds(prev => prev.includes(id)
            ? prev.filter(item => item !== id)
            : [...prev, id]
        );
    };

    const handleToggleTemplateExport = (id: string) => {
        setSelectedTemplateExportIds(prev => prev.includes(id)
            ? prev.filter(item => item !== id)
            : [...prev, id]
        );
    };

    const handleToggleFolderExport = (id: string) => {
        if (id === 'root') {
            setSelectedFolderExportIds(prev => prev.includes('root') ? [] : ['root']);
            setSelectedWordExportIds([]);
            return;
        }
        setSelectedFolderExportIds(prev => {
            const withoutRoot = prev.filter(item => item !== 'root');
            if (withoutRoot.includes(id)) {
                return withoutRoot.filter(item => item !== id);
            }
            return [...withoutRoot, id];
        });
    };

    const handleToggleWordExport = (id: string) => {
        if (isRootSelectedForExport) return;
        const targetWord = words.find(word => word.id === id);
        if (targetWord && selectedFolderDescendantIds.has(targetWord.folderId)) return;
        setSelectedWordExportIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    const handleSelectAllVisibleWords = () => {
        if (isRootSelectedForExport) return;
        setSelectedWordExportIds(prev => {
            const next = new Set(prev);
            for (const word of wordExportVisibleWords) {
                if (!selectedFolderDescendantIds.has(word.folderId)) {
                    next.add(word.id);
                }
            }
            return Array.from(next);
        });
    };

    const handleClearVisibleWords = () => {
        setSelectedWordExportIds(prev => {
            const visibleIds = new Set(wordExportVisibleWords.map(word => word.id));
            return prev.filter(id => !visibleIds.has(id));
        });
    };

    const handleClearAllExportSelection = () => {
        setSelectedFolderExportIds([]);
        setSelectedWordExportIds([]);
    };

    const requestImport = (mode: 'all' | 'words' | 'favorites' | 'quality' | 'templates') => {
        setImportMode(mode);
        fileInputRef.current?.click();
    };

    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !importMode) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text) as any;
            const asArray = (value: unknown): unknown[] | null => Array.isArray(value) ? value : null;
            if (importMode === 'all') {
                const nextFolders = asArray(parsed?.folders) as FolderItem[] | null;
                const nextWords = asArray(parsed?.words) as WordItem[] | null;
                if (!nextFolders || !nextWords) {
                    alert('JSON形式が正しくありません。{ folders: [], words: [] } が必要です。');
                    return;
                }
                const nextTemplates = (asArray(parsed?.templates) ?? []) as TemplateItem[];
                const nextFavorites = (asArray(parsed?.favorites) ?? []) as PromptFavorite[];
                const nextQuality = (asArray(parsed?.qualityTemplates) ?? []) as PromptFavorite[];
                if (!confirm('インポートすると現在のデータが上書きされます。続行しますか？')) return;
                setData({ folders: nextFolders, words: nextWords, templates: nextTemplates, cards: Array.isArray(parsed?.cards) ? parsed?.cards : [] });
                setFavoritesData(nextFavorites);
                setQualityTemplatesData(nextQuality);
                alert('インポートが完了しました。');
                return;
            }
            if (importMode === 'words') {
                const nextFolders = asArray(parsed?.folders) as FolderItem[] | null;
                const nextWords = asArray(parsed?.words) as WordItem[] | null;
                if (!nextFolders || !nextWords) {
                    alert('JSON形式が正しくありません。{ folders: [], words: [] } が必要です。');
                    return;
                }
                setPendingWordsImport({ folders: nextFolders, words: nextWords });
                return;
            }
            if (importMode === 'favorites') {
                const nextFavorites = (asArray(parsed?.favorites) ?? asArray(parsed)) as PromptFavorite[] | null;
                if (!nextFavorites) {
                    alert('JSON形式が正しくありません。{ favorites: [] } が必要です。');
                    return;
                }
                if (!confirm('インポートすると現在のお気に入りが上書きされます。続行しますか？')) return;
                setFavoritesData(nextFavorites);
                alert('インポートが完了しました。');
                return;
            }
            if (importMode === 'quality') {
                const nextQuality = (asArray(parsed?.qualityTemplates) ?? asArray(parsed)) as PromptFavorite[] | null;
                if (!nextQuality) {
                    alert('JSON形式が正しくありません。{ qualityTemplates: [] } が必要です。');
                    return;
                }
                if (!confirm('インポートすると現在の品質テンプレートが上書きされます。続行しますか？')) return;
                setQualityTemplatesData(nextQuality);
                alert('インポートが完了しました。');
                return;
            }
            if (importMode === 'templates') {
                const nextTemplates = (asArray(parsed?.templates) ?? asArray(parsed)) as TemplateItem[] | null;
                if (!nextTemplates) {
                    alert('JSON形式が正しくありません。{ templates: [] } が必要です。');
                    return;
                }
                if (!confirm('インポートすると現在の装飾が上書きされます。続行しますか？')) return;
                setData({ folders, words, templates: nextTemplates, cards });
                alert('インポートが完了しました。');
                return;
            }
        } catch (error) {
            console.error('Failed to import data', error);
            alert('JSONファイルの読み込みに失敗しました。');
        } finally {
            if (event.target) event.target.value = '';
            setImportMode(null);
        }
    };

    const applyWordsOverwrite = () => {
        if (!pendingWordsImport) return;
        setData({ folders: pendingWordsImport.folders, words: pendingWordsImport.words, templates, cards });
        setPendingWordsImport(null);
        alert('インポートが完了しました。');
    };

    const applyWordsAdd = () => {
        if (!pendingWordsImport) return;
        const folderMap = new Map(folders.map(folder => [folder.id, folder]));
        const wordMap = new Map(words.map(word => [word.id, word]));
        const mergedFolders = [...folders];
        for (const folder of pendingWordsImport.folders) {
            if (!folderMap.has(folder.id)) {
                folderMap.set(folder.id, folder);
                mergedFolders.push(folder);
            }
        }
        const mergedFolderIds = new Set(mergedFolders.map(folder => folder.id));
        const mergedWords = [...words];
        for (const word of pendingWordsImport.words) {
            if (wordMap.has(word.id)) continue;
            if (!mergedFolderIds.has(word.folderId)) continue;
            wordMap.set(word.id, word);
            mergedWords.push(word);
        }
        setData({ folders: mergedFolders, words: mergedWords, templates, cards });
        setPendingWordsImport(null);
        alert('インポートが完了しました。');
    };

    const handleToggleNsfw = () => {
        if (nsfwEnabled) {
            toggleNsfw();
            return;
        }
        if (nsfwConfirmSkipped) {
            toggleNsfw();
            return;
        }
        setSkipNsfwConfirm(false);
        setIsNsfwConfirmOpen(true);
    };

    const handleConfirmNsfw = () => {
        if (skipNsfwConfirm) {
            writeUiSettings({ nsfwConfirmSkip: true });
            setNsfwConfirmSkipped(true);
        }
        toggleNsfw();
        setIsNsfwConfirmOpen(false);
    };

    const handleStepperDisplay = (next: 'inside' | 'above') => {
        setStepperDisplay(next);
        writeUiSettings({ stepperDisplay: next });
    };
    const handleCombinedCopyToggle = () => {
        setCombinedCopyEnabled(prev => {
            const next = !prev;
            writeUiSettings({ combinedCopyEnabled: next });
            return next;
        });
    };
    const handleShowFolderPathToggle = () => {
        setShowItemFolderPath(prev => {
            const next = !prev;
            writeUiSettings({ showItemFolderPath: next, showRootInPaths: next });
            return next;
        });
    };

    const openResetModal = (action: 'resetWords' | 'clearWords' | 'clearExtras') => {
        setResetAction(action);
        setResetConfirmed(false);
    };

    const applyResetAction = () => {
        if (!resetAction) return;
        if (resetAction === 'resetWords') {
            setData({ folders: initialData.folders, words: initialData.words, templates, cards: [] });
        } else if (resetAction === 'clearWords') {
            setData({ folders: [], words: [], templates, cards: [] });
        } else if (resetAction === 'clearExtras') {
            setFavoritesData([]);
            setQualityTemplatesData([]);
            setData({ folders, words, templates: [], cards });
        }
        setResetAction(null);
        setResetConfirmed(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl h-[80vh] rounded-2xl shadow-2xl flex flex-col">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-950 rounded-t-2xl">
                    <h2 className="text-xl font-bold text-white">設定</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">&times;</button>
                </div>

                <div className="flex-1 flex flex-col min-h-0">
                    <div className="px-4 pt-4">
                        <div className="flex gap-2 border-b border-slate-700 text-xs font-bold uppercase tracking-wider">
                            <button
                                type="button"
                                onClick={() => setActiveTab('general')}
                                className={`px-3 py-2 rounded-t-lg transition-colors ${activeTab === 'general'
                                    ? 'bg-slate-800 text-slate-100 border border-b-0 border-slate-700'
                                    : 'text-slate-500 hover:text-slate-200'
                                    }`}
                            >
                                全体の設定
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('io')}
                                className={`px-3 py-2 rounded-t-lg transition-colors ${activeTab === 'io'
                                    ? 'bg-slate-800 text-slate-100 border border-b-0 border-slate-700'
                                    : 'text-slate-500 hover:text-slate-200'
                                    }`}
                            >
                                語群データの入出力
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('templates')}
                                className={`px-3 py-2 rounded-t-lg transition-colors ${activeTab === 'templates'
                                    ? 'bg-slate-800 text-slate-100 border border-b-0 border-slate-700'
                                    : 'text-slate-500 hover:text-slate-200'
                                    }`}
                            >
                                装飾の設定
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 pt-3 custom-scrollbar">
                        {activeTab === 'general' && (
                            <div className="flex flex-col gap-4">
                                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                                    <h3 className="text-lg font-bold text-white mb-2">全体設定</h3>
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-200">NSFWコンテンツ</span>
                                            <span className="text-xs text-slate-500">NSFWのフォルダ・語句を全体で有効/無効にします。</span>
                                        </div>
                                        <button
                                            onClick={handleToggleNsfw}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${nsfwEnabled ? 'bg-red-500' : 'bg-slate-600'
                                                }`}
                                        >
                                            <span
                                                className={`${nsfwEnabled ? 'translate-x-6' : 'translate-x-1'
                                                    } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                            />
                                        </button>
                                    </div>
                                    {nsfwEnabled && (
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
                                    )}
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
                                            <span className="text-sm font-bold text-slate-200">フォルダは選択中のみ展開</span>
                                            <span className="text-xs text-slate-500">オフの場合は展開状態を保持します。</span>
                                        </div>
                                        <button
                                            onClick={toggleCollapseInactiveFolders}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${collapseInactiveFolders ? 'bg-cyan-500' : 'bg-slate-600'
                                                }`}
                                        >
                                            <span
                                                className={`${collapseInactiveFolders ? 'translate-x-6' : 'translate-x-1'
                                                    } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                            />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between mt-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-200">チップのステッパー表示</span>
                                            <span className="text-xs text-slate-500">チップ内に固定するか、上に表示するか選択します。</span>
                                        </div>
                                        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900/60 p-0.5 text-xs">
                                            <button
                                                type="button"
                                                onClick={() => handleStepperDisplay('inside')}
                                                className={`px-2 py-1 rounded-md transition-colors ${stepperDisplay === 'inside'
                                                    ? 'bg-cyan-600 text-white'
                                                    : 'text-slate-400 hover:text-slate-200'
                                                    }`}
                                            >
                                                チップ内
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleStepperDisplay('above')}
                                                className={`px-2 py-1 rounded-md transition-colors ${stepperDisplay === 'above'
                                                    ? 'bg-cyan-600 text-white'
                                                    : 'text-slate-400 hover:text-slate-200'
                                                    }`}
                                            >
                                                チップ上
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between mt-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-200">ポジ・ネガを同時コピー</span>
                                            <span className="text-xs text-slate-500">両方を1つのテキストでコピーするボタンを表示します。</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleCombinedCopyToggle}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${combinedCopyEnabled ? 'bg-cyan-500' : 'bg-slate-600'
                                                }`}
                                        >
                                            <span
                                                className={`${combinedCopyEnabled ? 'translate-x-6' : 'translate-x-1'
                                                    } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                            />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between mt-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-slate-200">フォルダパス表示（root含む）</span>
                                            <span className="text-xs text-slate-500">カードや語句の下にフォルダパスを表示します。</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleShowFolderPathToggle}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${showItemFolderPath ? 'bg-cyan-500' : 'bg-slate-600'
                                                }`}
                                        >
                                            <span
                                                className={`${showItemFolderPath ? 'translate-x-6' : 'translate-x-1'
                                                    } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                            />
                                        </button>
                                    </div>
                                </div>
                                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                                    <h3 className="text-lg font-bold text-white mb-2">初期化・消去</h3>
                                    <div className="flex flex-col gap-3">
                                        <button
                                            type="button"
                                            onClick={() => openResetModal('resetWords')}
                                            className="text-left px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-700 text-slate-200 hover:border-cyan-500/40 hover:bg-slate-900"
                                        >
                                            <div className="text-sm font-bold">語群の初期化</div>
                                            <div className="text-xs text-slate-500">初期の語群データに戻します。</div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => openResetModal('clearWords')}
                                            className="text-left px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-700 text-slate-200 hover:border-rose-500/40 hover:bg-slate-900"
                                        >
                                            <div className="text-sm font-bold">語群の全データ消去</div>
                                            <div className="text-xs text-slate-500">フォルダと語群をすべて消去します。</div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => openResetModal('clearExtras')}
                                            className="text-left px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-700 text-slate-200 hover:border-rose-500/40 hover:bg-slate-900"
                                        >
                                            <div className="text-sm font-bold">お気に入り・品質テンプレート・装飾の全データ消去</div>
                                            <div className="text-xs text-slate-500">お気に入り・品質テンプレート・装飾データを消去します。</div>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {activeTab === 'io' && (
                            <div className="flex flex-col gap-3">
                                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <div className="text-sm font-bold text-slate-200">全データ</div>
                                            <div className="text-xs text-slate-500">語群・お気に入り・品質テンプレート・装飾の全データ</div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleExportAll}
                                                className="px-3 py-1.5 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                                            >
                                                出力
                                            </button>
                                            <button
                                                onClick={() => requestImport('all')}
                                                className="px-3 py-1.5 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                                            >
                                                入力
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <div className="text-sm font-bold text-slate-200">語群データのみ</div>
                                            <div className="text-xs text-slate-500">フォルダと語群のデータ</div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleExportWords}
                                                className="px-3 py-1.5 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                                            >
                                                出力
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsWordExportPickerOpen(true)}
                                                className="px-3 py-1.5 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                                            >
                                                選択して出力
                                            </button>
                                            <button
                                                onClick={() => requestImport('words')}
                                                className="px-3 py-1.5 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                                            >
                                                入力
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <div className="text-sm font-bold text-slate-200">お気に入りのみ</div>
                                            <div className="text-xs text-slate-500">お気に入りプロンプトのデータ</div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleExportFavorites}
                                                className="px-3 py-1.5 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                                            >
                                                出力
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsFavoriteExportPickerOpen(true)}
                                                className="px-3 py-1.5 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                                            >
                                                選択して出力
                                            </button>
                                            <button
                                                onClick={() => requestImport('favorites')}
                                                className="px-3 py-1.5 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                                            >
                                                入力
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <div className="text-sm font-bold text-slate-200">品質テンプレートのみ</div>
                                            <div className="text-xs text-slate-500">品質テンプレートのデータ</div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleExportQuality}
                                                className="px-3 py-1.5 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                                            >
                                                出力
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsQualityExportPickerOpen(true)}
                                                className="px-3 py-1.5 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                                            >
                                                選択して出力
                                            </button>
                                            <button
                                                onClick={() => requestImport('quality')}
                                                className="px-3 py-1.5 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                                            >
                                                入力
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <div className="text-sm font-bold text-slate-200">装飾データのみ</div>
                                            <div className="text-xs text-slate-500">装飾テンプレートのデータ</div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleExportTemplates}
                                                className="px-3 py-1.5 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                                            >
                                                出力
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsTemplateExportPickerOpen(true)}
                                                className="px-3 py-1.5 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                                            >
                                                選択して出力
                                            </button>
                                            <button
                                                onClick={() => requestImport('templates')}
                                                className="px-3 py-1.5 text-xs rounded bg-slate-700 text-slate-200 hover:bg-slate-600"
                                            >
                                                入力
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="application/json"
                                    onChange={handleImport}
                                    className="hidden"
                                />
                            </div>
                        )}
                        {activeTab === 'templates' && (
                            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-lg font-bold text-white">装飾</h3>
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
                                <DndContext
                                    sensors={templateSensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={(event: DragEndEvent) => {
                                        const { active, over } = event;
                                        if (!over || active.id === over.id) return;
                                        const oldIndex = templates.findIndex(item => item.id === active.id);
                                        const newIndex = templates.findIndex(item => item.id === over.id);
                                        if (oldIndex === -1 || newIndex === -1) return;
                                        setData({ folders, words, templates: arrayMove(templates, oldIndex, newIndex), cards });
                                    }}
                                >
                                    <SortableContext
                                        items={templates.map(template => template.id)}
                                        strategy={rectSortingStrategy}
                                    >
                                        <div className="flex flex-col gap-2">
                                            {templates.length === 0 && (
                                                <div className="text-xs text-slate-500">装飾がありません。</div>
                                            )}
                                            {templates.map(template => (
                                                <SortableTemplateRow
                                                    key={template.id}
                                                    template={template}
                                                    onEdit={() => {
                                                        setEditingTemplate(template);
                                                        setIsTemplateModalOpen(true);
                                                    }}
                                                    onDelete={() => {
                                                        if (!confirm('Delete this template? Linked words will revert to normal words.')) return;
                                                        removeTemplate(template.id);
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </SortableContext>
                                </DndContext>
                            </div>
                        )}
                    </div>
                </div>
                <div className="p-4 border-t border-slate-700 bg-slate-950 rounded-b-2xl flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-xs rounded bg-slate-800 text-slate-400 hover:bg-slate-700"
                    >
                        閉じる
                    </button>
                </div>
            </div>
            {isNsfwConfirmOpen && (
                <div className="fixed inset-0 z-[110] pointer-events-auto flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md shadow-2xl flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">コンテンツ表示の確認</h3>
                            <button
                                onClick={() => setIsNsfwConfirmOpen(false)}
                                className="text-slate-400 hover:text-white text-xl"
                            >
                                &times;
                            </button>
                        </div>
                        <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                            NSFW表示を有効にすると、
                            一部ユーザーにとって不適切と感じられる表現が表示される可能性があります
                            本機能の利用はご自身の判断と責任で行ってください
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input
                                type="checkbox"
                                checked={skipNsfwConfirm}
                                onChange={(event) => setSkipNsfwConfirm(event.target.checked)}
                                className="rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50"
                            />
                            <span>次回からこの表示をしない</span>
                        </label>
                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setIsNsfwConfirmOpen(false)}
                                className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                            >
                                キャンセル
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmNsfw}
                                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 font-bold"
                            >
                                同意して表示
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {pendingWordsImport && (
                <div className="fixed inset-0 z-[110] pointer-events-auto flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md shadow-2xl flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">語群データの取り込み</h3>
                            <button
                                onClick={() => setPendingWordsImport(null)}
                                className="text-slate-400 hover:text-white text-xl"
                            >
                                &times;
                            </button>
                        </div>
                        <div className="text-sm text-slate-300 leading-relaxed">
                            取り込み方法を選択してください。
                        </div>
                        <div className="text-xs text-slate-500 leading-relaxed">
                            上書き: 既存の語群を入力データで置き換えます。入力データにない語群は削除されます。
                            <br />
                            追加: 既存の語群にない語群のみ追加します。
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setPendingWordsImport(null)}
                                className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                            >
                                キャンセル
                            </button>
                            <button
                                type="button"
                                onClick={applyWordsOverwrite}
                                className="flex-1 px-4 py-2 rounded-lg bg-slate-700 text-slate-100 hover:bg-slate-600 font-bold"
                            >
                                上書き
                            </button>
                            <button
                                type="button"
                                onClick={applyWordsAdd}
                                className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-rose-300 hover:bg-slate-700 hover:text-rose-200 font-bold border border-rose-500/40"
                            >
                                追加
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isWordExportPickerOpen && (
                <div className="fixed inset-0 z-[110] pointer-events-auto flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col gap-4 max-h-[90vh]">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">語群を選択</h3>
                            <button
                                onClick={() => setIsWordExportPickerOpen(false)}
                                className="text-slate-400 hover:text-white text-xl"
                            >
                                &times;
                            </button>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-slate-400">
                                フォルダ選択: <span className="text-slate-200 font-bold">{selectedFolderExportIds.length}</span>
                                {' '}・語句選択: <span className="text-slate-200 font-bold">{selectedWordExportIds.length}</span>
                                {' '}・合計語句: <span className="text-cyan-300 font-bold">{totalSelectedWordCount}</span>
                                {isRootSelectedForExport && <span className="ml-2 text-[10px] text-cyan-300">全語句選択中</span>}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={handleClearAllExportSelection}
                                    className="px-3 py-1.5 text-xs rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                                >
                                    全解除
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (selectedFolderExportIds.length === 0 && selectedWordExportIds.length === 0) {
                                            alert('出力する語群を選択してください。');
                                            return;
                                        }
                                        handleExportSelectedWords();
                                        setIsWordExportPickerOpen(false);
                                    }}
                                    className="px-3 py-1.5 text-xs rounded bg-cyan-600 text-white hover:bg-cyan-500 font-bold"
                                >
                                    選択して出力
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-[240px,1fr] gap-4 min-h-0 flex-1">
                            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-y-auto custom-scrollbar">
                                {(() => {
                                    const rootFolders = folderChildrenByParent.get('root') ?? folderChildrenByParent.get(null) ?? [];
                                    const renderFolder = (target: FolderItem, depth: number): React.ReactNode => {
                                        const children = folderChildrenByParent.get(target.id) ?? [];
                                        const hasChildren = children.length > 0;
                                        const isSelected = selectedFolderIdSet.has(target.id);
                                        const isActive = wordExportActiveFolderId === target.id;
                                        const isExpanded = wordExportExpandedSet.has(target.id);
                                        const isDisabled = isRootSelectedForExport && !isSelected;
                                        return (
                                            <div key={target.id}>
                                                <div className="flex items-center gap-2" style={{ paddingLeft: depth * 12 }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => hasChildren && toggleWordExportFolderExpanded(target.id)}
                                                        className={`flex h-4 w-4 items-center justify-center text-slate-500 ${hasChildren ? 'hover:text-slate-200' : 'opacity-30'}`}
                                                        title={hasChildren ? (isExpanded ? 'Collapse' : 'Expand') : 'No children'}
                                                    >
                                                        {hasChildren ? (isExpanded ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />) : <span className="h-3 w-3" />}
                                                    </button>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        disabled={isDisabled}
                                                        onChange={() => handleToggleFolderExport(target.id)}
                                                        className="rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setWordExportActiveFolderId(target.id)}
                                                        className={`text-sm ${isActive ? 'text-cyan-300 font-bold' : 'text-slate-300'} ${isDisabled ? 'opacity-50' : ''}`}
                                                    >
                                                        {target.name}
                                                    </button>
                                                </div>
                                                {hasChildren && isExpanded && children.map(child => renderFolder(child, depth + 1))}
                                            </div>
                                        );
                                    };
                                    return (
                                        <>
                                            <div className="flex items-center gap-2 mb-2">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleWordExportFolderExpanded('root')}
                                                    className="flex h-4 w-4 items-center justify-center text-slate-500 hover:text-slate-200"
                                                    title={wordExportExpandedSet.has('root') ? 'Collapse' : 'Expand'}
                                                >
                                                    {wordExportExpandedSet.has('root')
                                                        ? <ChevronDownIcon className="h-3 w-3" />
                                                        : <ChevronRightIcon className="h-3 w-3" />}
                                                </button>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedFolderIdSet.has('root')}
                                                    onChange={() => handleToggleFolderExport('root')}
                                                    className="rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setWordExportActiveFolderId('root')}
                                                    className={`text-sm ${wordExportActiveFolderId === 'root' ? 'text-cyan-300 font-bold' : 'text-slate-300'}`}
                                                >
                                                    root
                                                </button>
                                            </div>
                                            {wordExportExpandedSet.has('root') && rootFolders.map(folder => renderFolder(folder, 1))}
                                        </>
                                    );
                                })()}
                            </div>
                            <div className="flex flex-col gap-3 min-h-0">
                                <div className="flex flex-col gap-2">
                                    <input
                                        type="search"
                                        value={wordExportSearch}
                                        onChange={(event) => setWordExportSearch(event.target.value)}
                                        className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                                        placeholder="語句を検索..."
                                    />
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={handleSelectAllVisibleWords}
                                            className="px-2 py-1 text-xs rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                                        >
                                            表示中を全選択
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleClearVisibleWords}
                                            className="px-2 py-1 text-xs rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                                        >
                                            表示中を解除
                                        </button>
                                        {wordExportSearch && (
                                            <span className="text-[10px] text-slate-500">
                                                検索結果: {wordExportVisibleWords.length} 件
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-y-auto custom-scrollbar flex-1">
                                    {wordExportVisibleWords.length === 0 && (
                                        <div className="text-xs text-slate-500">語句がありません。</div>
                                    )}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {wordExportVisibleWords.map(word => {
                                            const isImplicit = isRootSelectedForExport || selectedFolderDescendantIds.has(word.folderId);
                                            const isSelected = isImplicit || selectedWordIdSet.has(word.id);
                                            return (
                                                <label
                                                    key={word.id}
                                                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${isSelected ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-800 bg-slate-900/40'}`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        disabled={isImplicit}
                                                        onChange={() => handleToggleWordExport(word.id)}
                                                        className="mt-1 rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50"
                                                    />
                                                    <div className="flex-1">
                                                        <div className="font-semibold text-slate-200">{word.label_jp}</div>
                                                        <div className="text-[10px] text-slate-500">{word.value_en}</div>
                                                        {wordExportSearch && (
                                                            <div className="text-[10px] text-slate-500">{getFolderPath(word.folderId)}</div>
                                                        )}
                                                        {isImplicit && (
                                                            <div className="text-[10px] text-cyan-300 mt-1">フォルダ選択に含まれます</div>
                                                        )}
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {isFavoriteExportPickerOpen && (
                <div className="fixed inset-0 z-[110] pointer-events-auto flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col gap-4 max-h-[90vh]">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">お気に入りを選択</h3>
                            <button
                                onClick={() => setIsFavoriteExportPickerOpen(false)}
                                className="text-slate-400 hover:text-white text-xl"
                            >
                                &times;
                            </button>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-xs text-slate-400">
                                選択数: <span className="text-cyan-300 font-bold">{selectedFavoriteExportIds.length}</span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setSelectedFavoriteExportIds(favoriteExportOptions.map(option => option.id))}
                                    className="px-3 py-1.5 text-xs rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                                >
                                    全選択
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedFavoriteExportIds([])}
                                    className="px-3 py-1.5 text-xs rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                                >
                                    解除
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (selectedFavoriteExportIds.length === 0) {
                                            alert('出力するお気に入りを選択してください。');
                                            return;
                                        }
                                        handleExportSelectedFavorites();
                                        setIsFavoriteExportPickerOpen(false);
                                    }}
                                    className="px-3 py-1.5 text-xs rounded bg-cyan-600 text-white hover:bg-cyan-500 font-bold"
                                >
                                    選択して出力
                                </button>
                            </div>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-y-auto custom-scrollbar">
                            {favoriteExportOptions.length === 0 && (
                                <div className="text-xs text-slate-500">お気に入りがありません。</div>
                            )}
                            <div className="flex flex-col gap-2">
                                {favoriteExportOptions.map(option => (
                                    <label key={option.id} className="flex items-center gap-2 text-sm text-slate-300">
                                        <input
                                            type="checkbox"
                                            checked={selectedFavoriteExportIds.includes(option.id)}
                                            onChange={() => handleToggleFavoriteExport(option.id)}
                                            className="rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50"
                                        />
                                        <span>{option.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {isQualityExportPickerOpen && (
                <div className="fixed inset-0 z-[110] pointer-events-auto flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col gap-4 max-h-[90vh]">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">品質テンプレートを選択</h3>
                            <button
                                onClick={() => setIsQualityExportPickerOpen(false)}
                                className="text-slate-400 hover:text-white text-xl"
                            >
                                &times;
                            </button>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-xs text-slate-400">
                                選択数: <span className="text-cyan-300 font-bold">{selectedQualityExportIds.length}</span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setSelectedQualityExportIds(qualityExportOptions.map(option => option.id))}
                                    className="px-3 py-1.5 text-xs rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                                >
                                    全選択
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedQualityExportIds([])}
                                    className="px-3 py-1.5 text-xs rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                                >
                                    解除
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (selectedQualityExportIds.length === 0) {
                                            alert('出力する品質テンプレートを選択してください。');
                                            return;
                                        }
                                        handleExportSelectedQuality();
                                        setIsQualityExportPickerOpen(false);
                                    }}
                                    className="px-3 py-1.5 text-xs rounded bg-cyan-600 text-white hover:bg-cyan-500 font-bold"
                                >
                                    選択して出力
                                </button>
                            </div>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-y-auto custom-scrollbar">
                            {qualityExportOptions.length === 0 && (
                                <div className="text-xs text-slate-500">品質テンプレートがありません。</div>
                            )}
                            <div className="flex flex-col gap-2">
                                {qualityExportOptions.map(option => (
                                    <label key={option.id} className="flex items-center gap-2 text-sm text-slate-300">
                                        <input
                                            type="checkbox"
                                            checked={selectedQualityExportIds.includes(option.id)}
                                            onChange={() => handleToggleQualityExport(option.id)}
                                            className="rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50"
                                        />
                                        <span>{option.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {isTemplateExportPickerOpen && (
                <div className="fixed inset-0 z-[110] pointer-events-auto flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col gap-4 max-h-[90vh]">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">装飾テンプレートを選択</h3>
                            <button
                                onClick={() => setIsTemplateExportPickerOpen(false)}
                                className="text-slate-400 hover:text-white text-xl"
                            >
                                &times;
                            </button>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <div className="text-xs text-slate-400">
                                選択数: <span className="text-cyan-300 font-bold">{selectedTemplateExportIds.length}</span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setSelectedTemplateExportIds(templateExportOptions.map(option => option.id))}
                                    className="px-3 py-1.5 text-xs rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                                >
                                    全選択
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedTemplateExportIds([])}
                                    className="px-3 py-1.5 text-xs rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                                >
                                    解除
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (selectedTemplateExportIds.length === 0) {
                                            alert('出力する装飾を選択してください。');
                                            return;
                                        }
                                        handleExportSelectedTemplates();
                                        setIsTemplateExportPickerOpen(false);
                                    }}
                                    className="px-3 py-1.5 text-xs rounded bg-cyan-600 text-white hover:bg-cyan-500 font-bold"
                                >
                                    選択して出力
                                </button>
                            </div>
                        </div>
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-y-auto custom-scrollbar">
                            {templateExportOptions.length === 0 && (
                                <div className="text-xs text-slate-500">装飾がありません。</div>
                            )}
                            <div className="flex flex-col gap-2">
                                {templateExportOptions.map(option => (
                                    <label key={option.id} className="flex items-center gap-2 text-sm text-slate-300">
                                        <input
                                            type="checkbox"
                                            checked={selectedTemplateExportIds.includes(option.id)}
                                            onChange={() => handleToggleTemplateExport(option.id)}
                                            className="rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50"
                                        />
                                        <span>{option.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {resetAction && (
                <div className="fixed inset-0 z-[110] pointer-events-auto flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md shadow-2xl flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">初期化・消去の確認</h3>
                            <button
                                onClick={() => setResetAction(null)}
                                className="text-slate-400 hover:text-white text-xl"
                            >
                                &times;
                            </button>
                        </div>
                        <div className="text-sm text-slate-300 leading-relaxed">
                            この操作は取り消せません。編集データがある場合は事前に保存することを推奨します。
                        </div>
                        <div className="text-xs text-slate-500 leading-relaxed">
                            {resetAction === 'resetWords' && '語群の初期化を行います。'}
                            {resetAction === 'clearWords' && '語群・フォルダの全データを消去します。'}
                            {resetAction === 'clearExtras' && 'お気に入り・品質テンプレート・装飾データを消去します。'}
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input
                                type="checkbox"
                                checked={resetConfirmed}
                                onChange={(event) => setResetConfirmed(event.target.checked)}
                                className="rounded bg-slate-800 border-slate-600 text-rose-500 focus:ring-rose-500/50"
                            />
                            <span>内容を確認しました</span>
                        </label>
                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setResetAction(null)}
                                className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                            >
                                キャンセル
                            </button>
                            <button
                                type="button"
                                onClick={applyResetAction}
                                disabled={!resetConfirmed}
                                className={`flex-1 px-4 py-2 rounded-lg font-bold ${resetConfirmed
                                    ? 'bg-rose-600 text-white hover:bg-rose-500'
                                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                    }`}
                            >
                                実行
                            </button>
                        </div>
                    </div>
                </div>
            )}
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




