import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePrompt } from '../context/usePrompt';
import CategoryNav from './CategoryNav';
import WordGrid, { WordCard } from './WordGrid';
import PromptOutput from './PromptOutput';
import SettingsModal from './SettingsModal';
import HelpModal from './HelpModal';
import { Cog6ToothIcon, PlusIcon, XMarkIcon, TrashIcon, Bars3Icon, ArrowRightIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import type { FolderItem, WordItem, TemplateItem } from '../types';

const AddNodeModal: React.FC<{
    isOpen: boolean;
    title: string;
    onClose: () => void;
    onAdd: (name: string, id: string, nsfw: boolean) => void;
    parentId: string;
}> = ({ isOpen, title, onClose, onAdd, parentId }) => {
    const [name, setName] = useState('');
    const [id, setId] = useState('');
    const [nsfw, setNsfw] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!name) return;
        const slug = name.toLowerCase().replace(/\s+/g, '_');
        const finalId = id || (parentId === 'root' ? slug : `${parentId}_${slug}`);
        onAdd(name, finalId, nsfw);
        setName('');
        setId('');
        setNsfw(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-sm shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <h3 className="text-lg font-bold mb-4 text-white">{title}</h3>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 flex-1 min-h-0">
                    <div className="flex flex-col gap-4 overflow-y-auto pr-1 flex-1 min-h-0">
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Name (Display)</label>
                        <input
                            type="text"
                            value={name}
                            onChange={event => setName(event.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-cyan-500 focus:outline-none"
                            placeholder="e.g. My Folder"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">ID (Optional)</label>
                        <input
                            type="text"
                            value={id}
                            onChange={event => setId(event.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-cyan-500 focus:outline-none"
                            placeholder="auto-generated-if-empty"
                        />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={nsfw}
                            onChange={event => setNsfw(event.target.checked)}
                            className="rounded bg-slate-800 border-slate-600 text-red-500 focus:ring-red-500/50"
                        />
                        <span className="text-sm text-slate-300">NSFW content</span>
                    </label>
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700">
                            Cancel
                        </button>
                        <button type="submit" className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 font-bold">
                            Add
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const EditFolderModal: React.FC<{
    folder: FolderItem | null;
    onClose: () => void;
    onSave: (updates: { name: string; nsfw: boolean }) => void;
}> = ({ folder, onClose, onSave }) => {
    const [name, setName] = useState(folder?.name ?? '');
    const [nsfw, setNsfw] = useState(folder?.nsfw ?? false);

    if (!folder) return null;

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (!name) return;
        onSave({ name, nsfw });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-sm shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                <h3 className="text-lg font-bold mb-4 text-white">Edit Folder</h3>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 flex-1 min-h-0">
                    <div className="flex flex-col gap-4 overflow-y-auto pr-1 flex-1 min-h-0">
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={event => setName(event.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-cyan-500 focus:outline-none"
                            required
                        />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={nsfw}
                            onChange={event => setNsfw(event.target.checked)}
                            className="rounded bg-slate-800 border-slate-600 text-red-500 focus:ring-red-500/50"
                        />
                        <span className="text-sm text-slate-300">NSFW content</span>
                    </label>
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700">
                            Cancel
                        </button>
                        <button type="submit" className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 font-bold">
                            Save
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const BulkWordSettingsModal: React.FC<{
    isOpen: boolean;
    templates: TemplateItem[];
    hasDecorations: boolean;
    onClose: () => void;
    onApply: (nsfw: boolean, templateIds: string[]) => void;
}> = ({ isOpen, templates, hasDecorations, onClose, onApply }) => {
    const [nsfw, setNsfw] = useState(false);
    const [templateIds, setTemplateIds] = useState<string[]>([]);

    useEffect(() => {
        if (!isOpen) return;
        setNsfw(false);
        setTemplateIds([]);
    }, [isOpen]);

    if (!isOpen) return null;

    const toggleTemplateId = (id: string) => {
        setTemplateIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    return (
        <div className="fixed inset-0 z-[110] pointer-events-auto flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md shadow-2xl flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white">語群の一括設定</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">&times;</button>
                </div>
                <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-lg px-3 py-2">
                    既存の装飾設定は上書きされます。下階層の語群には適用されません。
                    {hasDecorations && <div className="text-[10px] text-amber-200 mt-1">すでに装飾設定がある語句があります。</div>}
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={nsfw}
                        onChange={event => setNsfw(event.target.checked)}
                        className="rounded bg-slate-800 border-slate-600 text-red-500 focus:ring-red-500/50"
                    />
                    <span className="text-sm text-slate-300">NSFWを付与</span>
                </label>
                <div>
                    <div className="text-xs text-slate-400 mb-2">装飾テンプレート</div>
                    <div className="bg-slate-950 border border-slate-700 rounded-lg p-2 max-h-40 overflow-y-auto custom-scrollbar">
                        {templates.length === 0 && (
                            <div className="text-xs text-slate-500">装飾がありません。</div>
                        )}
                        {templates.map(template => (
                            <label key={template.id} className="flex items-center gap-2 text-sm text-slate-300">
                                <input
                                    type="checkbox"
                                    checked={templateIds.includes(template.id)}
                                    onChange={() => toggleTemplateId(template.id)}
                                    className="rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50"
                                />
                                <span>{template.name}</span>
                            </label>
                        ))}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">未選択の場合は装飾を解除します。</div>
                </div>
                <div className="flex gap-2 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                    >
                        キャンセル
                    </button>
                    <button
                        type="button"
                        onClick={() => onApply(nsfw, templateIds)}
                        className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 font-bold"
                    >
                        適用
                    </button>
                </div>
            </div>
        </div>
    );
};

const MoveItemModal: React.FC<{
    isOpen: boolean;
    title: string;
    description?: string;
    itemLabel: string;
    options: { id: string; label: string }[];
    value: string;
    onChange: (value: string) => void;
    onClose: () => void;
    onConfirm: () => void;
}> = ({ isOpen, title, description, itemLabel, options, value, onChange, onClose, onConfirm }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] pointer-events-auto flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md shadow-2xl flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">&times;</button>
                </div>
                <div className="text-xs text-slate-400">対象: <span className="text-slate-200 font-bold">{itemLabel}</span></div>
                {description && (
                    <div className="text-xs text-slate-500 leading-relaxed">{description}</div>
                )}
                <label className="block text-xs text-slate-400">
                    移動先フォルダ
                    <select
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                    >
                        {options.map(option => (
                            <option key={option.id} value={option.id}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="flex gap-2 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                    >
                        キャンセル
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 font-bold"
                    >
                        移動
                    </button>
                </div>
            </div>
        </div>
    );
};

const FolderCard: React.FC<{
    folder: FolderItem;
    onOpen: () => void;
    editMode?: boolean;
    onEdit?: () => void;
    onDelete?: () => void;
    onMove?: () => void;
    dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}> = ({ folder, onOpen, editMode = false, onEdit, onDelete, onMove, dragHandleProps }) => {
    return (
        <button
            onClick={onOpen}
            className="relative flex h-full w-full flex-col items-start p-3 rounded-xl border border-slate-800 bg-slate-900/40 hover:border-cyan-500/40 hover:bg-slate-900 transition-all text-left"
        >
            <span className="text-xs text-slate-500 font-mono mb-1">Folder</span>
            <span className="text-sm font-bold text-slate-200">{folder.name}</span>
            {editMode && (
                <div className="absolute top-2 right-2 flex gap-1">
                    <button
                        type="button"
                        {...dragHandleProps}
                        className="p-1 rounded-md text-slate-500 hover:text-slate-300 cursor-grab"
                        title="Drag to reorder"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <Bars3Icon className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onMove?.();
                        }}
                        className="p-1 rounded-md text-slate-500 hover:text-cyan-400"
                        title="Move"
                    >
                        <ArrowRightIcon className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onEdit?.();
                        }}
                        className="p-1 rounded-md text-slate-500 hover:text-cyan-400"
                        title="Edit"
                    >
                        <Cog6ToothIcon className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onDelete?.();
                        }}
                        className="p-1 rounded-md text-slate-500 hover:text-rose-400"
                        title="Delete"
                    >
                        <TrashIcon className="w-4 h-4" />
                    </button>
                </div>
            )}
        </button>
    );
};

const SortableFolderCard: React.FC<{
    id: string;
    folder: FolderItem;
    onOpen: () => void;
    editMode?: boolean;
    onEdit?: () => void;
    onDelete?: () => void;
    onMove?: () => void;
}> = ({ id, ...props }) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition
    };

    return (
        <div ref={setNodeRef} style={style}>
            <FolderCard {...props} dragHandleProps={{ ...attributes, ...listeners }} />
        </div>
    );
};
const Layout: React.FC = () => {
    const { folders, words, templates, nsfwEnabled, showDescendantWords, clearAll, addFolder, addWordToFolder, undo, canUndo, setData } = usePrompt();
    const [activeFolderId, setActiveFolderId] = useState<string>('root');
    const [searchQuery, setSearchQuery] = useState('');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [showAddFolder, setShowAddFolder] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [editingFolder, setEditingFolder] = useState<FolderItem | null>(null);
    const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [movingFolder, setMovingFolder] = useState<FolderItem | null>(null);
    const [movingWord, setMovingWord] = useState<WordItem | null>(null);
    const [moveTargetId, setMoveTargetId] = useState('root');
    const isPopStateRef = useRef(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    useEffect(() => {
        if (movingFolder) {
            setMoveTargetId(movingFolder.parentId ?? 'root');
        }
    }, [movingFolder]);

    useEffect(() => {
        if (movingWord) {
            setMoveTargetId(movingWord.folderId ?? 'root');
        }
    }, [movingWord]);

    const folderById = useMemo(() => {
        return new Map(folders.map(folder => [folder.id, folder]));
    }, [folders]);

    const visibleFolders = useMemo(() => {
        return folders.filter(folder => folder.parentId === activeFolderId && (nsfwEnabled || !folder.nsfw));
    }, [folders, activeFolderId, nsfwEnabled]);

    const activeFolderIds = useMemo(() => {
        if (!showDescendantWords) {
            return new Set<string>([activeFolderId]);
        }
        const ids = new Set<string>();
        const queue = [activeFolderId];
        while (queue.length > 0) {
            const current = queue.shift();
            if (!current || ids.has(current)) continue;
            ids.add(current);
            const children = folders.filter(folder => folder.parentId === current);
            for (const child of children) {
                queue.push(child.id);
            }
        }
        return ids;
    }, [activeFolderId, folders, showDescendantWords]);

    const visibleWords = useMemo(() => {
        const filtered = words.filter(word => {
            if (!activeFolderIds.has(word.folderId)) return false;
            const parentFolder = folderById.get(word.folderId);
            if (!parentFolder) return false;
            if (nsfwEnabled) return true;
            return !word.nsfw && !parentFolder.nsfw;
        });
        const indexed = filtered.map((word, index) => ({ word, index }));
        indexed.sort((a, b) => {
            const favDiff = Number(!!b.word.favorite) - Number(!!a.word.favorite);
            if (favDiff !== 0) return favDiff;
            return a.index - b.index;
        });
        return indexed.map(item => item.word);
    }, [words, activeFolderIds, nsfwEnabled, folderById]);

    const editableWords = useMemo(() => {
        return words.filter(word => word.folderId === activeFolderId);
    }, [words, activeFolderId]);

    const wordsForGrid = editMode ? editableWords : visibleWords;
    const hasDecorationsInFolder = useMemo(() => {
        return words.some(word => word.folderId === activeFolderId && (!!word.templateId || (word.templateIds?.length ?? 0) > 0));
    }, [words, activeFolderId]);


    const reorderSubset = <T extends { id: string }>(list: T[], ordered: T[]) => {
        const orderedIds = new Set(ordered.map(item => item.id));
        let index = 0;
        return list.map(item => {
            if (!orderedIds.has(item.id)) return item;
            const replacement = ordered[index];
            index += 1;
            return replacement;
        });
    };

    const handleSelectFolder = (id: string) => {
        setActiveFolderId(id);
    };

    const handleNavigateUp = React.useCallback(() => {
        if (activeFolderId === 'root') return;
        const currentFolder = folderById.get(activeFolderId);
        const parentId = currentFolder?.parentId ?? 'root';
        setActiveFolderId(parentId || 'root');
        setSearchQuery('');
    }, [activeFolderId, folderById]);

    const normalizeName = (value: string) => value.trim().toLowerCase();

    const hasDuplicateFolderName = (name: string, parentId: string | null, excludeId?: string) => {
        const target = normalizeName(name);
        return folders.some(folder =>
            folder.parentId === parentId &&
            folder.id !== excludeId &&
            normalizeName(folder.name) === target
        );
    };

    const hasDuplicateWordLabel = (label: string, folderId: string, excludeId?: string) => {
        const target = normalizeName(label);
        return words.some(word =>
            word.folderId === folderId &&
            word.id !== excludeId &&
            normalizeName(word.label_jp) === target
        );
    };

    const collectDescendantFolderIds = (startId: string) => {
        const visited = new Set<string>();
        const queue = [startId];
        while (queue.length > 0) {
            const current = queue.shift();
            if (!current || visited.has(current)) continue;
            visited.add(current);
            const children = folders.filter(folder => folder.parentId === current);
            for (const child of children) queue.push(child.id);
        }
        return visited;
    };

    const handleDeleteFolder = (id: string) => {
        if (!confirm('このフォルダと中身を削除します。よろしいですか？')) return;
        const folderIds = collectDescendantFolderIds(id);
        setData({
            folders: folders.filter(folder => !folderIds.has(folder.id)),
            words: words.filter(word => !folderIds.has(word.folderId)),
            templates
        });
    };

    const handleUpdateFolder = (id: string, updates: { name: string; nsfw: boolean }) => {
        const targetFolder = folders.find(folder => folder.id === id);
        if (!targetFolder) return;
        if (hasDuplicateFolderName(updates.name, targetFolder.parentId, id)) {
            alert('同じ階層に同じ名前のフォルダは作成できません。');
            return;
        }
        setData({
            folders: folders.map(folder => folder.id === id ? { ...folder, ...updates } : folder),
            words,
            templates
        });
    };

    const handleDeleteWord = (id: string) => {
        if (!confirm('この語句を削除します。よろしいですか？')) return;
        setData({
            folders,
            words: words.filter(word => word.id !== id),
            templates
        });
    };

    const handleUpdateWord = (updated: WordItem) => {
        if (hasDuplicateWordLabel(updated.label_jp, updated.folderId, updated.id)) {
            alert('同じフォルダ内に同じ名前の語句は作成できません。');
            return;
        }
        setData({
            folders,
            words: words.map(word => word.id === updated.id ? { ...word, ...updated } : word),
            templates
        });
    };

    const handleDragEndFolder = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            const oldIndex = visibleFolders.findIndex((item) => item.id === active.id);
            const newIndex = visibleFolders.findIndex((item) => item.id === over?.id);
            if (oldIndex === -1 || newIndex === -1) return;
            const reordered = arrayMove(visibleFolders, oldIndex, newIndex);
            setData({
                folders: reorderSubset(folders, reordered),
                words,
                templates
            });
        }
    };

    const handleReorderWords = (ordered: WordItem[]) => {
        setData({
            folders,
            words: reorderSubset(words, ordered),
            templates
        });
    };

    const searchResults = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return null;

        const matchingFolders = folders.filter(folder => {
            if (!nsfwEnabled && folder.nsfw) return false;
            return folder.name.toLowerCase().includes(query);
        });

        const matchingWords = words.filter(word => {
            if (!nsfwEnabled && word.nsfw) return false;
            const parentFolder = folderById.get(word.folderId);
            if (!parentFolder) return false;
            if (!nsfwEnabled && parentFolder.nsfw) return false;
            const target = `${word.label_jp} ${word.value_en} ${word.note ?? ''}`.toLowerCase();
            return target.includes(query);
        });

        const indexed = matchingWords.map((word, index) => ({ word, index }));
        indexed.sort((a, b) => {
            const favDiff = Number(!!b.word.favorite) - Number(!!a.word.favorite);
            if (favDiff !== 0) return favDiff;
            return a.index - b.index;
        });

        return { matchingFolders, matchingWords: indexed.map(item => item.word) };
    }, [searchQuery, folders, words, nsfwEnabled, folderById]);

    const currentFolderPath = useMemo(() => {
        const path: string[] = [];
        let cursor: string | null = activeFolderId;
        while (cursor) {
            const folder = folderById.get(cursor);
            if (!folder) {
                path.unshift('root');
                break;
            }
            path.unshift(folder.name);
            cursor = folder.parentId;
        }
        if (path.length === 0) return 'root';
        if (path[0] !== 'root') path.unshift('root');
        return path.join(' / ');
    }, [activeFolderId, folderById]);

    const getFolderPath = (folderId: string | null) => {
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
    };

    const folderOptions = useMemo(() => {
        const options = folders.map(folder => ({
            id: folder.id,
            label: getFolderPath(folder.id)
        }));
        options.sort((a, b) => a.label.localeCompare(b.label));
        return [{ id: 'root', label: 'root' }, ...options];
    }, [folders, folderById, getFolderPath]);

    const blockedMoveFolderIds = useMemo(() => {
        if (!movingFolder) return new Set<string>();
        return collectDescendantFolderIds(movingFolder.id);
    }, [movingFolder, folders]);

    const folderMoveOptions = useMemo(() => {
        if (!movingFolder) return folderOptions;
        return folderOptions.filter(option => !blockedMoveFolderIds.has(option.id));
    }, [blockedMoveFolderIds, folderOptions, movingFolder]);

    const handleOpenFolder = (folder: FolderItem) => {
        setActiveFolderId(folder.id);
        setSearchQuery('');
    };
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const isTypingTarget = !!target && (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'SELECT' ||
                target.isContentEditable
            );
            if (isTypingTarget) return;
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
                if (!canUndo) return;
                event.preventDefault();
                undo();
            }
        };

        const handlePopState = () => {
            if (activeFolderId === 'root') return;
            isPopStateRef.current = true;
            handleNavigateUp();
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('popstate', handlePopState);
        };
    }, [activeFolderId, canUndo, handleNavigateUp, undo]);

    useEffect(() => {
        if (isPopStateRef.current) {
            isPopStateRef.current = false;
            window.history.replaceState({ app: true, folderId: activeFolderId }, '', window.location.href);
            return;
        }
        if (activeFolderId === 'root') {
            window.history.replaceState({ app: true, folderId: activeFolderId }, '', window.location.href);
            return;
        }
        window.history.pushState({ app: true, folderId: activeFolderId }, '', window.location.href);
    }, [activeFolderId]);

    const handleAddWord = (label: string, value: string, nsfw: boolean, note?: string, templateIds?: string[]) => {
        if (hasDuplicateWordLabel(label, activeFolderId)) {
            alert('同じフォルダ内に同じ名前の語句は作成できません。');
            return;
        }
        addWordToFolder(activeFolderId, {
            id: Date.now().toString(),
            folderId: activeFolderId,
            label_jp: label,
            value_en: value,
            nsfw,
            note,
            favorite: false,
            templateIds: templateIds && templateIds.length > 0 ? templateIds : undefined
        });
    };

    const handleApplyBulkSettings = (nsfw: boolean, templateIds: string[]) => {
        const nextTemplateIds = templateIds.length > 0 ? templateIds : undefined;
        setData({
            folders,
            templates,
            words: words.map(word => {
                if (word.folderId !== activeFolderId) return word;
                return {
                    ...word,
                    nsfw,
                    templateId: undefined,
                    templateIds: nextTemplateIds
                };
            })
        });
        setIsBulkEditOpen(false);
    };

    const handleConfirmMoveFolder = () => {
        if (!movingFolder) return;
        const targetId = moveTargetId || 'root';
        if (blockedMoveFolderIds.has(targetId)) {
            alert('移動先に同じフォルダ、もしくは配下フォルダは指定できません。');
            return;
        }
        if (targetId === movingFolder.parentId) {
            setMovingFolder(null);
            return;
        }
        if (hasDuplicateFolderName(movingFolder.name, targetId, movingFolder.id)) {
            alert('同じ階層に同じ名前のフォルダは作成できません。');
            return;
        }
        setData({
            folders: folders.map(folder => folder.id === movingFolder.id
                ? { ...folder, parentId: targetId }
                : folder
            ),
            words,
            templates
        });
        setMovingFolder(null);
    };

    const handleConfirmMoveWord = () => {
        if (!movingWord) return;
        const targetId = moveTargetId || 'root';
        if (targetId === movingWord.folderId) {
            setMovingWord(null);
            return;
        }
        if (hasDuplicateWordLabel(movingWord.label_jp, targetId, movingWord.id)) {
            alert('同じフォルダ内に同じ名前の語句は作成できません。');
            return;
        }
        setData({
            folders,
            words: words.map(word => word.id === movingWord.id
                ? { ...word, folderId: targetId }
                : word
            ),
            templates
        });
        setMovingWord(null);
    };

    return (
        <div className="flex h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 z-20 shadow-xl">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50 backdrop-blur-sm">
                    <h1 className="text-xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent tracking-tighter">
                        PROMPT<span className="text-slate-500 font-light">GEN</span>
                    </h1>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setIsHelpOpen(true)}
                            className="text-slate-500 hover:text-cyan-400 transition-colors p-1 rounded-full hover:bg-slate-800"
                            title="使い方"
                            aria-label="使い方"
                        >
                            <QuestionMarkCircleIcon className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="text-slate-500 hover:text-cyan-400 transition-colors p-1 rounded-full hover:bg-slate-800"
                            title="Manage Data"
                        >
                            <Cog6ToothIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden">
                    <CategoryNav
                        onSelectFolder={handleSelectFolder}
                        activeFolderId={activeFolderId}
                    />
                </div>

                <div className="p-3 border-t border-slate-800 text-[10px] text-slate-600 text-center font-mono">
                    v1.0.0 • LocalStorage Mode
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col relative overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
                <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />

                {/* Header Area */}
                <header className="h-16 border-b border-slate-800/50 flex items-center px-6 justify-between backdrop-blur-sm z-10">
                    <div className="text-sm font-medium text-slate-400 flex items-center gap-2">
                        {activeFolderId !== 'root' ? (
                            <>
                                <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                                <span>Developing Prompt...</span>
                            </>
                        ) : (
                            <span>Browse folders or search</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="relative hidden md:block">
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 w-56 pr-8"
                                placeholder="Search folders or words..."
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                    title="Clear search"
                                >
                                    <XMarkIcon className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <button
                            onClick={() => setEditMode(prev => !prev)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${editMode
                                ? 'bg-cyan-500/10 border-cyan-500 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.3)]'
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                                }`}
                        >
                            <span>EDIT</span>
                            <span className={`w-2 h-2 rounded-full ${editMode ? 'bg-cyan-400 animate-pulse' : 'bg-slate-500'}`}></span>
                        </button>
                        <button
                            onClick={undo}
                            disabled={!canUndo}
                            className={`text-xs px-3 py-1.5 rounded transition-colors ${canUndo
                                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                : 'bg-slate-900 text-slate-600 cursor-not-allowed'
                                }`}
                            title="Undo (Ctrl/Cmd+Z)"
                        >
                            Undo
                        </button>
                        <button onClick={clearAll} className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded transition-colors text-slate-300">
                            Clear
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6 relative custom-scrollbar">
                    {searchResults ? (
                        <div className="flex flex-col gap-8">
                            <div>
                                <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">Folders</h2>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                    {searchResults.matchingFolders.length === 0 && (
                                        <div className="text-xs text-slate-500">No matching folders.</div>
                                    )}
                                    {searchResults.matchingFolders.map(folder => (
                                        <FolderCard
                                            key={folder.id}
                                            folder={folder}
                                            onOpen={() => handleOpenFolder(folder)}
                                            editMode={editMode}
                                            onMove={() => {
                                                setMovingWord(null);
                                                setMovingFolder(folder);
                                            }}
                                            onEdit={() => setEditingFolder(folder)}
                                            onDelete={() => handleDeleteFolder(folder.id)}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3">Words</h2>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                    {searchResults.matchingWords.length === 0 && (
                                        <div className="text-xs text-slate-500">No matching words.</div>
                                    )}
                                    {searchResults.matchingWords.map(word => (
                                        <WordCard key={word.id} word={word} folderPath={getFolderPath(word.folderId)} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-6">
                            <div className="flex items-center justify-between">
                                <div className="text-xs text-slate-500 uppercase tracking-wider">
                                    Current Folder: <span className="text-slate-300">{currentFolderPath}</span>
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Folders</h2>
                                    <button
                                        onClick={() => setShowAddFolder(true)}
                                        className="text-xs text-slate-400 hover:text-cyan-400 flex items-center gap-1"
                                    >
                                        <PlusIcon className="w-4 h-4" />
                                        Add Folder
                                    </button>
                                </div>
                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={handleDragEndFolder}
                                >
                                    <SortableContext
                                        items={editMode ? visibleFolders.map(folder => folder.id) : []}
                                        strategy={rectSortingStrategy}
                                    >
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                            {visibleFolders.length === 0 && (
                                                <div className="text-xs text-slate-500">No folders.</div>
                                            )}
                                            {visibleFolders.map(folder => {
                                                const cardProps = {
                                                    folder,
                                                    onOpen: () => handleSelectFolder(folder.id),
                                                    editMode,
                                                    onEdit: () => setEditingFolder(folder),
                                                    onDelete: () => handleDeleteFolder(folder.id),
                                                    onMove: () => {
                                                        setMovingWord(null);
                                                        setMovingFolder(folder);
                                                    }
                                                };

                                                if (editMode) {
                                                    return <SortableFolderCard key={folder.id} id={folder.id} {...cardProps} />;
                                                }

                                                return <FolderCard key={folder.id} {...cardProps} />;
                                            })}
                                        </div>
                                    </SortableContext>
                                </DndContext>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Words</h2>
                                    <button
                                        type="button"
                                        onClick={() => setIsBulkEditOpen(true)}
                                        className="text-xs text-slate-400 hover:text-cyan-300 transition-colors"
                                    >
                                        一括設定
                                    </button>
                                </div>
                                <WordGrid
                                    words={wordsForGrid}
                                    onAddWord={handleAddWord}
                                    folderPathForWord={(word: WordItem) => getFolderPath(word.folderId)}
                                    editMode={editMode}
                                    onEditWord={(updated) => handleUpdateWord(updated)}
                                    onDeleteWord={(word) => handleDeleteWord(word.id)}
                                    onMoveWord={(word) => {
                                        setMovingFolder(null);
                                        setMovingWord(word);
                                    }}
                                    onReorderWords={handleReorderWords}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="shrink-0 z-20">
                    <PromptOutput />
                </div>
            </main>

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
            <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
            <EditFolderModal
                key={editingFolder?.id ?? 'none'}
                folder={editingFolder}
                onClose={() => setEditingFolder(null)}
                onSave={(updates) => {
                    if (!editingFolder) return;
                    handleUpdateFolder(editingFolder.id, updates);
                }}
            />
            <BulkWordSettingsModal
                isOpen={isBulkEditOpen}
                templates={templates}
                hasDecorations={hasDecorationsInFolder}
                onClose={() => setIsBulkEditOpen(false)}
                onApply={handleApplyBulkSettings}
            />
            <MoveItemModal
                isOpen={!!movingFolder}
                title="フォルダを移動"
                description="配下のフォルダと語群も含めて移動します。"
                itemLabel={movingFolder?.name ?? ''}
                options={folderMoveOptions}
                value={moveTargetId}
                onChange={setMoveTargetId}
                onClose={() => setMovingFolder(null)}
                onConfirm={handleConfirmMoveFolder}
            />
            <MoveItemModal
                isOpen={!!movingWord}
                title="語群を移動"
                itemLabel={movingWord?.label_jp ?? ''}
                options={folderOptions}
                value={moveTargetId}
                onChange={setMoveTargetId}
                onClose={() => setMovingWord(null)}
                onConfirm={handleConfirmMoveWord}
            />
            <AddNodeModal
                isOpen={showAddFolder}
                title="Add Folder"
                onClose={() => setShowAddFolder(false)}
                onAdd={(name, id, nsfw) => {
                    if (hasDuplicateFolderName(name, activeFolderId)) {
                        alert('同じ階層に同じ名前のフォルダは作成できません。');
                        return;
                    }
                    addFolder(name, id, activeFolderId, nsfw);
                }}
                parentId={activeFolderId}
            />
        </div>
    );
};

export default Layout;



