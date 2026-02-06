import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePrompt } from '../context/usePrompt';
import type { SelectedWord, PromptStrength, PromptFavorite } from '../types';
import { DocumentDuplicateIcon, XMarkIcon, BookmarkIcon, TrashIcon, Bars3Icon, ChevronRightIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { MinusSmallIcon, PlusSmallIcon } from '@heroicons/react/24/solid';

const UI_STORAGE_KEY = 'promptgen:ui';

const readUiSettings = () => {
    try {
        if (typeof window === 'undefined') return {};
        const stored = localStorage.getItem(UI_STORAGE_KEY);
        if (!stored) return {};
        return JSON.parse(stored) as {
            stepperDisplay?: 'inside' | 'above';
            combinedCopyEnabled?: boolean;
            showRootInPaths?: boolean;
        };
    } catch (e) {
        console.warn('Failed to load UI settings.', e);
        return {};
    }
};

const expandRepeatedWords = (words: SelectedWord[]) => {
    const expanded: { word: SelectedWord; instance: number }[] = [];
    words.forEach(word => {
        if (word.cardId) {
            expanded.push({ word, instance: 0 });
            return;
        }
        const repeatRaw = word.repeat ?? 1;
        const repeat = Number.isFinite(repeatRaw) ? Math.max(1, Math.round(repeatRaw)) : 1;
        for (let i = 0; i < repeat; i += 1) {
            expanded.push({ word, instance: i });
        }
    });
    return expanded;
};

const formatPrompt = (words: SelectedWord[]) => {
    return expandRepeatedWords(words).map(({ word }) => {
        const val = word.cardId ? `(${word.cardPrompt ?? word.value_en})` : word.value_en;
        if (word.cardId) return val;
        if (word.strength === 1.0) return val;
        return `(${val}:${word.strength.toFixed(1)})`;
    }).join(', ');
};

const StrengthSelector: React.FC<{
    strength: PromptStrength,
    onChange: (s: PromptStrength) => void
}> = ({ strength, onChange }) => {
    const minStrength = 0.5;
    const maxStrength = 1.5;
    const step = 0.1;
    const roundStrength = (value: number) => Math.round(value * 10) / 10;
    const clampStrength = (value: number) => Math.min(maxStrength, Math.max(minStrength, roundStrength(value)));
    const canDecrease = strength > minStrength;
    const canIncrease = strength < maxStrength;

    return (
        <div className="flex items-center gap-1 bg-slate-900 rounded-lg px-1.5 py-0.5 border border-slate-700 font-mono">
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    if (!canDecrease) return;
                    onChange(clampStrength(strength - step));
                }}
                disabled={!canDecrease}
                className={`text-[11px] px-1.5 rounded-md transition-all ${canDecrease
                    ? 'text-slate-300 hover:text-white hover:bg-slate-700/70'
                    : 'text-slate-600 cursor-not-allowed'
                    }`}
            >
                <MinusSmallIcon className="w-4 h-4" />
            </button>
            <span className="text-[11px] text-slate-200 min-w-[34px] text-center">{strength.toFixed(1)}</span>
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    if (!canIncrease) return;
                    onChange(clampStrength(strength + step));
                }}
                disabled={!canIncrease}
                className={`text-[11px] px-1.5 rounded-md transition-all ${canIncrease
                    ? 'text-slate-300 hover:text-white hover:bg-slate-700/70'
                    : 'text-slate-600 cursor-not-allowed'
                    }`}
            >
                <PlusSmallIcon className="w-4 h-4" />
            </button>
        </div>
    );
};

const Chip: React.FC<{
    word: SelectedWord;
    type: 'positive' | 'negative';
    stepperDisplay: 'inside' | 'above';
    onHoverStart?: (id: string, type: 'positive' | 'negative', rect: DOMRect) => void;
    onHoverEnd?: () => void;
    onHighlightStart?: (id: string, type: 'positive' | 'negative') => void;
    onHighlightEnd?: () => void;
}> = ({ word, type, stepperDisplay, onHoverStart, onHoverEnd, onHighlightStart, onHighlightEnd }) => {
    const { removeWord, updateWordStrength } = usePrompt();
    const chipRef = useRef<HTMLDivElement | null>(null);
    const isCardToken = !!word.cardId;

    const handleMouseEnter = () => {
        if (stepperDisplay !== 'above' || isCardToken) return;
        const rect = chipRef.current?.getBoundingClientRect();
        if (!rect) return;
        onHoverStart?.(word.id, type, rect);
    };

    return (
        <div
            ref={chipRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={stepperDisplay === 'above' ? onHoverEnd : undefined}
            onPointerEnter={() => onHighlightStart?.(word.id, type)}
            onPointerLeave={onHighlightEnd}
            className={`relative inline-flex items-center gap-2 pl-3 pr-1 py-1 rounded-full text-xs font-medium border group transition-all animate-fadeIn ${type === 'positive'
            ? 'bg-cyan-950/40 border-cyan-800 text-cyan-300'
            : 'bg-rose-950/40 border-rose-800 text-rose-300'
            }`}>
            <span>{word.label_jp}</span>
            {isCardToken && (
                <span className="text-[10px] uppercase text-amber-300/80 border border-amber-400/30 px-1 rounded">Card</span>
            )}
            {stepperDisplay === 'inside' && !isCardToken && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                    <StrengthSelector
                        strength={word.strength}
                        onChange={(s) => updateWordStrength(word.id, type, s)}
                    />
                </div>
            )}
            <button
                onClick={() => removeWord(word.id, type)}
                className="p-1 hover:bg-black/20 rounded-full ml-1"
            >
                <XMarkIcon className="w-3 h-3" />
            </button>
        </div>
    );
};

const SortableChip: React.FC<{
    word: SelectedWord;
    type: 'positive' | 'negative';
    stepperDisplay: 'inside' | 'above';
    onHoverStart?: (id: string, type: 'positive' | 'negative', rect: DOMRect) => void;
    onHoverEnd?: () => void;
    onHighlightStart?: (id: string, type: 'positive' | 'negative') => void;
    onHighlightEnd?: () => void;
}> = ({ word, type, stepperDisplay, onHoverStart, onHoverEnd, onHighlightStart, onHighlightEnd }) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
        id: `${type}:${word.id}`,
        data: { type }
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition
    };

    return (
        <div ref={setNodeRef} style={style} className="relative">
            <Chip
                word={word}
                type={type}
                stepperDisplay={stepperDisplay}
                onHoverStart={onHoverStart}
                onHoverEnd={onHoverEnd}
                onHighlightStart={onHighlightStart}
                onHighlightEnd={onHighlightEnd}
            />
            <button
                type="button"
                {...attributes}
                {...listeners}
                className="absolute -left-2 -top-2 p-1 rounded-full bg-slate-900/80 border border-slate-700 text-slate-400 hover:text-slate-200 cursor-grab"
                title="Drag to reorder"
            >
                <Bars3Icon className="w-3 h-3" />
            </button>
        </div>
    );
};

const PromptOutput: React.FC<{ activeFolderId: string }> = ({ activeFolderId }) => {
    const { selectedPositive, selectedNegative, favorites, qualityTemplates, templates, nsfwEnabled, folders, addPromptFavorite, addQualityTemplate, addCard, applyPromptFavorite, removePromptFavorite, removeQualityTemplate, updateQualityTemplateName, clearPositive, clearNegative, reorderSelected, selectQualityTemplate, selectedQualityTemplateIds, updateWordStrength } = usePrompt();
    const [copyFeedback, setCopyFeedback] = useState<'pos' | 'neg' | 'both' | null>(null);
    const [saveType, setSaveType] = useState<'positive' | 'negative' | null>(null);
    const [qualityType, setQualityType] = useState<'positive' | 'negative' | null>(null);
    const [loadType, setLoadType] = useState<'positive' | 'negative' | null>(null);
    const [expandType, setExpandType] = useState<'positive' | 'negative' | null>(null);
    const [favoriteName, setFavoriteName] = useState('');
    const [favoriteNsfw, setFavoriteNsfw] = useState(false);
    const [saveAsQuality, setSaveAsQuality] = useState(false);
    const [saveAsCard, setSaveAsCard] = useState(false);
    const [cardFolderMode, setCardFolderMode] = useState<'current' | 'custom'>('current');
    const [selectedCardFolderId, setSelectedCardFolderId] = useState('root');
    const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);
    const [folderSearch, setFolderSearch] = useState('');
    const [cardTemplateIds, setCardTemplateIds] = useState<string[]>([]);
    const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set(['root']));
    const [editingQualityId, setEditingQualityId] = useState<string | null>(null);
    const [editingQualityName, setEditingQualityName] = useState('');
    const [highlightedPrompt, setHighlightedPrompt] = useState<{ id: string; type: 'positive' | 'negative' } | null>(null);
    const [stepperDisplay, setStepperDisplay] = useState<'inside' | 'above'>(() => {
        const settings = readUiSettings();
        return settings.stepperDisplay ?? 'above';
    });
    const [combinedCopyEnabled, setCombinedCopyEnabled] = useState<boolean>(() => {
        const settings = readUiSettings();
        return !!settings.combinedCopyEnabled;
    });
    const [showRootInPaths, setShowRootInPaths] = useState<boolean>(() => {
        const settings = readUiSettings();
        return settings.showRootInPaths ?? false;
    });
    const [hoveredStrength, setHoveredStrength] = useState<{ id: string; type: 'positive' | 'negative'; rect: DOMRect } | null>(null);
    const hoverTimeoutRef = useRef<number | null>(null);

    const posString = formatPrompt(selectedPositive);
    const negString = formatPrompt(selectedNegative);
    const hoveredWord = useMemo(() => {
        if (!hoveredStrength) return null;
        const source = hoveredStrength.type === 'positive' ? selectedPositive : selectedNegative;
        return source.find(word => word.id === hoveredStrength.id) ?? null;
    }, [hoveredStrength, selectedPositive, selectedNegative]);

    const renderPromptTokens = (words: SelectedWord[], highlightId?: string) => {
        const expanded = expandRepeatedWords(words);
        return expanded.map(({ word, instance }, index) => {
            const base = word.cardPrompt ?? word.value_en;
            const value = word.cardId
                ? `(${base})`
                : (word.strength === 1.0 ? base : `(${base}:${word.strength.toFixed(1)})`);
            return (
                <span key={`${word.id}:${instance}`}>
                    <span className={word.id === highlightId ? 'bg-amber-400/30 text-amber-200 rounded px-0.5' : undefined}>
                        {value}
                    </span>
                    {index < expanded.length - 1 ? ', ' : ''}
                </span>
            );
        });
    };

    useEffect(() => {
        if (!hoveredStrength) return;
        if (!hoveredWord) {
            setHoveredStrength(null);
        }
    }, [hoveredStrength, hoveredWord]);

    useEffect(() => {
        const handleUiUpdate = (event: Event) => {
            const detail = (event as CustomEvent).detail as { stepperDisplay?: 'inside' | 'above'; combinedCopyEnabled?: boolean; showRootInPaths?: boolean } | undefined;
            const next = detail ?? readUiSettings();
            setStepperDisplay(next.stepperDisplay ?? 'above');
            setCombinedCopyEnabled(!!next.combinedCopyEnabled);
            setShowRootInPaths(next.showRootInPaths ?? false);
        };
        const handleStorage = (event: StorageEvent) => {
            if (event.key !== UI_STORAGE_KEY) return;
            const next = readUiSettings();
            setStepperDisplay(next.stepperDisplay ?? 'above');
            setCombinedCopyEnabled(!!next.combinedCopyEnabled);
            setShowRootInPaths(next.showRootInPaths ?? false);
        };
        window.addEventListener('promptgen:ui-update', handleUiUpdate);
        window.addEventListener('storage', handleStorage);
        return () => {
            window.removeEventListener('promptgen:ui-update', handleUiUpdate);
            window.removeEventListener('storage', handleStorage);
        };
    }, []);

    useEffect(() => {
        if (stepperDisplay === 'inside') {
            setHoveredStrength(null);
        }
    }, [stepperDisplay]);
    useEffect(() => {
        if (!qualityType) {
            cancelEditQualityName();
            return;
        }
        if (!editingQualityId) return;
        const exists = qualityTemplates.some(template => template.id === editingQualityId);
        if (!exists) cancelEditQualityName();
    }, [editingQualityId, qualityTemplates, qualityType]);

    const filteredFavorites = useMemo(() => {
        return favorites.filter(fav => (nsfwEnabled ? true : !fav.nsfw));
    }, [favorites, nsfwEnabled]);

    const filteredQualityTemplates = useMemo(() => {
        return qualityTemplates.filter(template => (nsfwEnabled ? true : !template.nsfw));
    }, [qualityTemplates, nsfwEnabled]);

    const folderById = useMemo(() => {
        return new Map(folders.map(folder => [folder.id, folder]));
    }, [folders]);

    const getFolderPath = (folderId: string) => {
        if (!folderId) return 'root';
        const path: string[] = [];
        let cursor: string | null = folderId;
        while (cursor) {
            const folder = folderById.get(cursor);
            if (!folder) break;
            path.unshift(folder.name);
            cursor = folder.parentId ?? null;
        }
        if (path.length === 0) return 'root';
        if (!showRootInPaths) {
            const trimmed = path[0] === 'root' ? path.slice(1) : path;
            return trimmed.length > 0 ? trimmed.join(' / ') : '';
        }
        if (path[0] === 'root') return path.join(' / ');
        return `root / ${path.join(' / ')}`;
    };

    const folderTreeOptions = useMemo(() => {
        const childrenMap = new Map<string, { id: string; name: string; nsfw?: boolean }[]>();
        folders.filter(folder => folder.id !== 'root').forEach(folder => {
            if (!nsfwEnabled && folder.nsfw) return;
            const parent = folder.parentId ?? 'root';
            const list = childrenMap.get(parent) ?? [];
            list.push({ id: folder.id, name: folder.name, nsfw: folder.nsfw });
            childrenMap.set(parent, list);
        });
        const options: { id: string; name: string; depth: number; path: string; hasChildren: boolean; parentId: string | null }[] = [];
        const walk = (parentId: string, depth: number) => {
            const children = childrenMap.get(parentId) ?? [];
            children.forEach(child => {
                const path = getFolderPath(child.id);
                const hasChildren = (childrenMap.get(child.id) ?? []).length > 0;
                options.push({ id: child.id, name: child.name, depth, path, hasChildren, parentId });
                walk(child.id, depth + 1);
            });
        };
        const rootChildren = childrenMap.get('root') ?? [];
        options.push({ id: 'root', name: 'root', depth: 0, path: 'root', hasChildren: rootChildren.length > 0, parentId: null });
        walk('root', 1);
        return options;
    }, [folders, folderById, nsfwEnabled, getFolderPath]);

    const filteredFolderOptions = useMemo(() => {
        const query = folderSearch.trim().toLowerCase();
        if (query) {
            return folderTreeOptions.filter(option => {
                return option.name.toLowerCase().includes(query) || option.path.toLowerCase().includes(query);
            });
        }
        const expanded = expandedFolderIds;
        const byId = new Map(folderTreeOptions.map(option => [option.id, option]));
        return folderTreeOptions.filter(option => {
            if (option.id === 'root') return true;
            let cursor = option.parentId;
            while (cursor) {
                if (!expanded.has(cursor)) return false;
                const parent = byId.get(cursor);
                cursor = parent?.parentId ?? null;
            }
            return true;
        });
    }, [folderSearch, folderTreeOptions, expandedFolderIds]);

    const getQualityPrompt = (type: 'positive' | 'negative') => {
        const selectedId = selectedQualityTemplateIds[type];
        if (!selectedId) return '';
        const selected = qualityTemplates.find(template => template.id === selectedId);
        if (!selected) return '';
        if (!nsfwEnabled && selected.nsfw) return '';
        return formatPrompt(selected.words);
    };

    const getQualityName = (type: 'positive' | 'negative') => {
        const selectedId = selectedQualityTemplateIds[type];
        if (!selectedId) return '';
        const selected = qualityTemplates.find(template => template.id === selectedId);
        if (!selected) return '';
        if (!nsfwEnabled && selected.nsfw) return '';
        return selected.name;
    };

    const buildCopyText = (type: 'positive' | 'negative', base: string) => {
        const quality = getQualityPrompt(type);
        if (!quality) return base;
        if (!base) return quality;
        return `${quality}, ${base}`;
    };
    const buildCombinedCopyText = () => {
        const pos = buildCopyText('positive', posString);
        const neg = buildCopyText('negative', negString);
        return `Positive prompt: ${pos}\nNegative prompt: ${neg}`;
    };

    const inferFavoriteNsfw = (source: SelectedWord[]) => {
        return source.some(word => {
            const jp = word.label_jp?.toLowerCase();
            const en = word.value_en?.toLowerCase();
            return word.nsfw || jp === 'nsfw' || en === 'nsfw';
        });
    };

    const openSaveModal = (type: 'positive' | 'negative') => {
        const source = type === 'positive' ? selectedPositive : selectedNegative;
        setFavoriteNsfw(inferFavoriteNsfw(source));
        setSaveType(type);
        setSaveAsQuality(false);
        setSaveAsCard(false);
        setCardFolderMode('current');
        setSelectedCardFolderId(activeFolderId || 'root');
        setCardTemplateIds([]);
    };

    const toggleFolderExpand = (id: string) => {
        setExpandedFolderIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleCardTemplateId = (id: string) => {
        setCardTemplateIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    const handleCopy = (text: string, type: 'pos' | 'neg' | 'both') => {
        navigator.clipboard.writeText(text);
        setCopyFeedback(type);
        setTimeout(() => setCopyFeedback(null), 2000);
    };

    const handleSaveFavorite = (type: 'positive' | 'negative') => {
        const source = type === 'positive' ? selectedPositive : selectedNegative;
        const combinedLabels = source.map(word => word.label_jp).filter(Boolean);
        const trimmedName = favoriteName.trim();
        if (saveAsCard && !trimmedName) {
            alert('カード名を入力してください。');
            return;
        }
        const name = saveAsCard ? trimmedName : (trimmedName || combinedLabels.join(' / ') || 'Favorite');
        if (saveAsCard) {
            const targetFolderId = cardFolderMode === 'current' ? (activeFolderId || 'root') : selectedCardFolderId || 'root';
            const hasTemplates = cardTemplateIds.length > 0;
            addCard({
                id: Date.now().toString(),
                name,
                folderId: targetFolderId,
                type,
                nsfw: favoriteNsfw,
                templateIds: hasTemplates ? cardTemplateIds : undefined,
                words: source.map(word => ({
                    wordId: word.id,
                    strength: word.strength,
                    repeat: word.repeat,
                    label_jp: word.label_jp,
                    value_en: word.value_en,
                    nsfw: word.nsfw,
                    note: word.note
                })),
                createdAt: Date.now()
            });
        } else if (saveAsQuality) {
            addQualityTemplate(name, type, source, favoriteNsfw);
        } else {
            addPromptFavorite(name, type, source, favoriteNsfw);
        }
        setFavoriteName('');
        setFavoriteNsfw(false);
        setSaveAsQuality(false);
        setSaveAsCard(false);
        setSaveType(null);
        setIsFolderPickerOpen(false);
    };
    const startEditQualityName = (template: PromptFavorite) => {
        setEditingQualityId(template.id);
        setEditingQualityName(template.name);
    };
    const cancelEditQualityName = () => {
        setEditingQualityId(null);
        setEditingQualityName('');
    };
    const submitEditQualityName = () => {
        if (!editingQualityId) return;
        updateQualityTemplateName(editingQualityId, editingQualityName);
        cancelEditQualityName();
    };

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent, type: 'positive' | 'negative') => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const source = type === 'positive' ? selectedPositive : selectedNegative;
        const activeId = String(active.id).replace(`${type}:`, '');
        const overId = String(over.id).replace(`${type}:`, '');
        const oldIndex = source.findIndex(word => word.id === activeId);
        const newIndex = source.findIndex(word => word.id === overId);
        if (oldIndex === -1 || newIndex === -1) return;
        reorderSelected(type, arrayMove(source, oldIndex, newIndex));
    };

    const modalRoot = typeof document !== 'undefined' ? document.body : null;
    const renderModal = (node: React.ReactNode) => {
        if (!modalRoot) return null;
        return createPortal(node, modalRoot);
    };

    const handleHoverStart = (id: string, type: 'positive' | 'negative', rect: DOMRect) => {
        if (stepperDisplay !== 'above') return;
        if (hoverTimeoutRef.current) {
            window.clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        }
        setHoveredStrength({ id, type, rect });
    };

    const handleHoverEnd = () => {
        if (stepperDisplay !== 'above') return;
        if (hoverTimeoutRef.current) {
            window.clearTimeout(hoverTimeoutRef.current);
        }
        hoverTimeoutRef.current = window.setTimeout(() => {
            setHoveredStrength(null);
        }, 120);
    };

    return (
        <div className="h-full flex flex-col p-4 gap-3">
            {stepperDisplay === 'above' && hoveredWord && hoveredStrength && renderModal(
                <div
                    className="fixed z-[200] bg-slate-900/95 border border-slate-700 rounded-lg px-2 py-1 shadow-xl"
                    style={{
                        top: hoveredStrength.rect.top - 6,
                        left: hoveredStrength.rect.left + hoveredStrength.rect.width / 2,
                        transform: 'translate(-50%, -100%)'
                    }}
                    onMouseEnter={() => handleHoverStart(hoveredStrength.id, hoveredStrength.type, hoveredStrength.rect)}
                    onMouseLeave={handleHoverEnd}
                >
                    <StrengthSelector
                        strength={hoveredWord.strength}
                        onChange={(s) => updateWordStrength(hoveredWord.id, hoveredStrength.type, s)}
                    />
                </div>
            )}
            {combinedCopyEnabled && (
                <div className="flex justify-end -mb-1">
                    <button
                        type="button"
                        onClick={() => handleCopy(buildCombinedCopyText(), 'both')}
                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 transition-colors"
                        title="Positive/Negative をまとめてコピー"
                    >
                        {copyFeedback === 'both' ? <span className="text-green-300">Copied!</span> : (
                            <>
                                <DocumentDuplicateIcon className="w-4 h-4" /> Copy Both
                            </>
                        )}
                    </button>
                </div>
            )}
            <div className="flex flex-1 gap-4">
            {/* Positive Section */}
            <div className="flex-1 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">Positive Prompt</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => openSaveModal('positive')}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
                        >
                            <BookmarkIcon className="w-4 h-4" /> 保存
                        </button>
                        <button
                            onClick={() => setQualityType('positive')}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
                        >
                            <Bars3Icon className="w-4 h-4" /> Quality
                            {getQualityName('positive') && (
                                <span className="text-[10px] text-cyan-200">{getQualityName('positive')}</span>
                            )}
                        </button>
                        <button
                            onClick={() => setLoadType('positive')}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
                        >
                            <BookmarkIcon className="w-4 h-4" /> Load
                        </button>
                        <button
                            onClick={clearPositive}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
                        >
                            <XMarkIcon className="w-4 h-4" /> Clear
                        </button>
                        <button
                            onClick={() => handleCopy(buildCopyText('positive', posString), 'pos')}
                            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 transition-colors"
                        >
                            {copyFeedback === 'pos' ? <span className="text-green-300">Copied!</span> : (
                                <>
                                    <DocumentDuplicateIcon className="w-4 h-4" /> Copy
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Visual Chips Area */}
                <div className="relative h-32 bg-slate-900/50 border border-slate-800 rounded-xl p-3 overflow-y-auto mb-2 custom-scrollbar">
                    <button
                        onClick={() => setExpandType('positive')}
                        className="absolute right-2 top-2 z-10 flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-slate-800 bg-slate-950/70 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
                    >
                        <Bars3Icon className="w-3 h-3" /> More
                    </button>
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => handleDragEnd(event, 'positive')}
                    >
                        <SortableContext
                            items={selectedPositive.map(word => `positive:${word.id}`)}
                            strategy={rectSortingStrategy}
                        >
                            <div className="flex flex-wrap gap-2">
                                {selectedPositive.length === 0 && <span className="text-slate-600 text-sm italic">Select words...</span>}
                                {selectedPositive.map(word => (
                                    <SortableChip
                                        key={word.id}
                                        word={word}
                                        type="positive"
                                        stepperDisplay={stepperDisplay}
                                        onHoverStart={stepperDisplay === 'above' ? handleHoverStart : undefined}
                                        onHoverEnd={stepperDisplay === 'above' ? handleHoverEnd : undefined}
                                        onHighlightStart={(id, type) => setHighlightedPrompt({ id, type })}
                                        onHighlightEnd={() => setHighlightedPrompt(null)}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>

                {/* Raw Text Output (Read Only) */}
                <div className="h-16 relative">
                    <div className="w-full h-full bg-black/40 border border-slate-800 rounded-lg p-2 text-xs font-mono text-cyan-100/70 overflow-y-auto whitespace-pre-wrap break-words">
                        {posString ? renderPromptTokens(selectedPositive, highlightedPrompt?.type === 'positive' ? highlightedPrompt.id : undefined) : ''}
                    </div>
                </div>
            </div>

            {/* Negative Section */}
            <div className="flex-1 flex flex-col gap-2 border-l border-slate-800 pl-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-rose-400 uppercase tracking-wider">Negative Prompt</h3>
                        <span className="text-[10px] text-slate-500">(右クリック / Shift+クリックで登録)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => openSaveModal('negative')}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
                        >
                            <BookmarkIcon className="w-4 h-4" /> 保存
                        </button>
                        <button
                            onClick={() => setQualityType('negative')}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
                        >
                            <Bars3Icon className="w-4 h-4" /> Quality
                            {getQualityName('negative') && (
                                <span className="text-[10px] text-rose-200">{getQualityName('negative')}</span>
                            )}
                        </button>
                        <button
                            onClick={() => setLoadType('negative')}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
                        >
                            <BookmarkIcon className="w-4 h-4" /> Load
                        </button>
                        <button
                            onClick={clearNegative}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
                        >
                            <XMarkIcon className="w-4 h-4" /> Clear
                        </button>
                        <button
                            onClick={() => handleCopy(buildCopyText('negative', negString), 'neg')}
                            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 transition-colors"
                        >
                            {copyFeedback === 'neg' ? <span className="text-green-300">Copied!</span> : (
                                <>
                                    <DocumentDuplicateIcon className="w-4 h-4" /> Copy
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Visual Chips Area */}
                <div className="relative h-32 bg-slate-900/50 border border-slate-800 rounded-xl p-3 overflow-y-auto mb-2 custom-scrollbar">
                    <button
                        onClick={() => setExpandType('negative')}
                        className="absolute right-2 top-2 z-10 flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-slate-800 bg-slate-950/70 text-slate-300 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
                    >
                        <Bars3Icon className="w-3 h-3" /> More
                    </button>
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => handleDragEnd(event, 'negative')}
                    >
                        <SortableContext
                            items={selectedNegative.map(word => `negative:${word.id}`)}
                            strategy={rectSortingStrategy}
                        >
                            <div className="flex flex-wrap gap-2">
                                {selectedNegative.length === 0 && <span className="text-slate-600 text-sm italic">Select words...</span>}
                                {selectedNegative.map(word => (
                                    <SortableChip
                                        key={word.id}
                                        word={word}
                                        type="negative"
                                        stepperDisplay={stepperDisplay}
                                        onHoverStart={stepperDisplay === 'above' ? handleHoverStart : undefined}
                                        onHoverEnd={stepperDisplay === 'above' ? handleHoverEnd : undefined}
                                        onHighlightStart={(id, type) => setHighlightedPrompt({ id, type })}
                                        onHighlightEnd={() => setHighlightedPrompt(null)}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>

                {/* Raw Text Output */}
                <div className="h-16 relative">
                    <div className="w-full h-full bg-black/40 border border-slate-800 rounded-lg p-2 text-xs font-mono text-rose-100/70 overflow-y-auto whitespace-pre-wrap break-words">
                        {negString ? renderPromptTokens(selectedNegative, highlightedPrompt?.type === 'negative' ? highlightedPrompt.id : undefined) : ''}
                    </div>
                </div>
            </div>
            </div>

            {saveType && renderModal(
                <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        <h3 className="text-lg font-bold mb-4 text-white">Save Favorite</h3>
                        <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto pr-1">
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">{saveAsCard ? 'Card Name' : 'Favorite Name'}</label>
                                <input
                                    type="text"
                                    value={favoriteName}
                                    onChange={(e) => setFavoriteName(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-cyan-500 focus:outline-none"
                                    placeholder="(未入力の場合は自動生成)"
                                />
                                {saveAsCard && (
                                    <div className="mt-1 text-[10px] text-amber-300">カード名は必須です。</div>
                                )}
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={favoriteNsfw}
                                    onChange={(e) => setFavoriteNsfw(e.target.checked)}
                                    className="rounded bg-slate-800 border-slate-600 text-red-500 focus:ring-red-500/50"
                                />
                                <span className="text-sm text-slate-300">NSFWを含む</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={saveAsQuality}
                                    onChange={(e) => {
                                        setSaveAsQuality(e.target.checked);
                                        if (e.target.checked) setSaveAsCard(false);
                                    }}
                                    className="rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50"
                                />
                                <span className="text-sm text-slate-300">品質テンプレートとして保存</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={saveAsCard}
                                    onChange={(e) => {
                                        setSaveAsCard(e.target.checked);
                                        if (e.target.checked) setSaveAsQuality(false);
                                    }}
                                    className="rounded bg-slate-800 border-slate-600 text-amber-500 focus:ring-amber-500/50"
                                />
                                <span className="text-sm text-slate-300">カードとして保存</span>
                            </label>
                            {saveAsCard && (
                                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400 flex flex-col gap-3">
                                    <div>
                                        <div className="flex items-center gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    checked={cardFolderMode === 'current'}
                                                    onChange={() => setCardFolderMode('current')}
                                                    className="rounded-full bg-slate-800 border-slate-600 text-amber-500 focus:ring-amber-500/50"
                                                />
                                                <span>現在のフォルダ</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    checked={cardFolderMode === 'custom'}
                                                    onChange={() => setCardFolderMode('custom')}
                                                    className="rounded-full bg-slate-800 border-slate-600 text-amber-500 focus:ring-amber-500/50"
                                                />
                                                <span>任意のフォルダ</span>
                                            </label>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between gap-2">
                                            <div className="text-[11px] text-slate-500">
                                                保存先: <span className="text-slate-200">{cardFolderMode === 'current' ? getFolderPath(activeFolderId || 'root') : getFolderPath(selectedCardFolderId || 'root')}</span>
                                            </div>
                                            {cardFolderMode === 'custom' && (
                                                <button
                                                    type="button"
                                                    onClick={() => setIsFolderPickerOpen(true)}
                                                    className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 text-[11px]"
                                                >
                                                    フォルダを選択
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[11px] text-slate-500 mb-1">装飾 (任意)</div>
                                        {templates.length === 0 && (
                                            <div className="text-[11px] text-slate-600">装飾がありません。</div>
                                        )}
                                        {templates.length > 0 && (
                                            <div className="flex flex-col gap-1">
                                                {templates.map(template => (
                                                    <label key={template.id} className="flex items-center gap-2 text-[11px] text-slate-300">
                                                        <input
                                                            type="checkbox"
                                                            checked={cardTemplateIds.includes(template.id)}
                                                            onChange={() => toggleCardTemplateId(template.id)}
                                                            className="rounded bg-slate-800 border-slate-600 text-cyan-500 focus:ring-cyan-500/50"
                                                        />
                                                        <span>{template.name}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            <div className="text-xs text-slate-500">
                                {(saveType === 'positive' ? selectedPositive.length : selectedNegative.length) === 0
                                    ? '現在のプロンプトは空です。'
                                    : `選択語数: ${saveType === 'positive' ? selectedPositive.length : selectedNegative.length}`}
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFavoriteName('');
                                        setFavoriteNsfw(false);
                                        setSaveAsQuality(false);
                                        setSaveAsCard(false);
                                        setSaveType(null);
                                        setIsFolderPickerOpen(false);
                                    }}
                                    className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSaveFavorite(saveType)}
                                    className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 font-bold"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isFolderPickerOpen && renderModal(
                <div className="fixed inset-0 z-[110] pointer-events-auto flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-5 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-lg font-bold text-white">フォルダを選択</h3>
                            <button
                                type="button"
                                onClick={() => setIsFolderPickerOpen(false)}
                                className="text-slate-400 hover:text-white text-xl"
                            >
                                &times;
                            </button>
                        </div>
                        <input
                            type="search"
                            value={folderSearch}
                            onChange={(event) => setFolderSearch(event.target.value)}
                            placeholder="Search folders..."
                            className="mb-3 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                        />
                        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-1">
                            {filteredFolderOptions.length === 0 && (
                                <div className="text-xs text-slate-500">No matching folders.</div>
                            )}
                            {filteredFolderOptions.map(option => (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedCardFolderId(option.id);
                                        setCardFolderMode('custom');
                                        setIsFolderPickerOpen(false);
                                    }}
                                    className={`text-left w-full rounded-lg border px-3 py-2 text-sm transition-colors ${selectedCardFolderId === option.id
                                        ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-100'
                                        : 'border-slate-800 bg-slate-950 text-slate-200 hover:border-cyan-500/40 hover:bg-slate-900'
                                        }`}
                                >
                                    <div className="flex items-center gap-2" style={{ paddingLeft: `${option.depth * 12}px` }}>
                                        {option.hasChildren ? (
                                            <span
                                                role="button"
                                                tabIndex={0}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    toggleFolderExpand(option.id);
                                                }}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        toggleFolderExpand(option.id);
                                                    }
                                                }}
                                                className="w-5 h-5 flex items-center justify-center rounded bg-slate-800/70 text-slate-300 hover:text-white"
                                                title={expandedFolderIds.has(option.id) ? 'Collapse' : 'Expand'}
                                            >
                                                {expandedFolderIds.has(option.id) ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
                                            </span>
                                        ) : (
                                            <span className="w-5 h-5" />
                                        )}
                                        <span className="font-semibold">{option.name}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 mt-1">{option.path}</div>
                                </button>
                            ))}
                        </div>
                        <div className="flex justify-end mt-4">
                            <button
                                type="button"
                                onClick={() => setIsFolderPickerOpen(false)}
                                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {loadType && renderModal(
                <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        <h3 className="text-lg font-bold mb-4 text-white">Load Favorite</h3>
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-1">
                            {filteredFavorites.filter(fav => fav.type === loadType).length === 0 && (
                                <div className="text-sm text-slate-500">No favorites available.</div>
                            )}
                            {filteredFavorites.filter(fav => fav.type === loadType).map((fav: PromptFavorite) => {
                                const jpLabels = fav.words.map(word => word.label_jp).filter(Boolean).join(', ');
                                const prompt = formatPrompt(fav.words);
                                return (
                                    <div
                                        key={fav.id}
                                        className="border border-slate-800 rounded-xl p-3 hover:border-cyan-500/40 hover:bg-slate-900 transition-all flex items-start justify-between gap-3"
                                    >
                                        <button
                                            onClick={() => {
                                                applyPromptFavorite(fav);
                                                setLoadType(null);
                                            }}
                                            className="text-left flex-1"
                                        >
                                            <div className="text-sm font-bold text-slate-200">{fav.name}</div>
                                            <div className="text-[11px] text-slate-500 mt-1">
                                                {jpLabels || 'No labels'}
                                            </div>
                                            <div className="text-[11px] text-slate-500 mt-1">
                                                {loadType === 'positive' ? <span className="text-cyan-400">P:</span> : <span className="text-rose-400">N:</span>} {prompt || '-'}
                                            </div>
                                            {fav.nsfw && (
                                                <div className="text-[10px] text-red-400 mt-1">NSFW</div>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => removePromptFavorite(fav.id)}
                                            className="text-slate-500 hover:text-rose-400"
                                            title="Delete"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex justify-end mt-4">
                            <button
                                type="button"
                                onClick={() => setLoadType(null)}
                                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {qualityType && renderModal(
                <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        <h3 className="text-lg font-bold mb-4 text-white">Quality Template</h3>
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-1">
                            {filteredQualityTemplates.filter(template => template.type === qualityType).length === 0 && (
                                <div className="text-sm text-slate-500">No quality templates available.</div>
                            )}
                            {filteredQualityTemplates.filter(template => template.type === qualityType).map((template: PromptFavorite) => {
                                const jpLabels = template.words.map(word => word.label_jp).filter(Boolean).join(', ');
                                const prompt = formatPrompt(template.words);
                                const isSelected = selectedQualityTemplateIds[qualityType] === template.id;
                                const isEditingName = editingQualityId === template.id;
                                return (
                                    <div
                                        key={template.id}
                                        className={`border rounded-xl p-3 transition-all flex items-start justify-between gap-3 ${isSelected
                                            ? 'border-cyan-500/60 bg-cyan-950/20'
                                            : 'border-slate-800 hover:border-cyan-500/40 hover:bg-slate-900'
                                            }`}
                                    >
                                        <button
                                            onClick={() => {
                                                selectQualityTemplate(qualityType, template.id);
                                                setQualityType(null);
                                            }}
                                            className="text-left flex-1"
                                        >
                                            {isEditingName ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={editingQualityName}
                                                        onChange={(event) => setEditingQualityName(event.target.value)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === 'Enter') {
                                                                event.preventDefault();
                                                                submitEditQualityName();
                                                            }
                                                        }}
                                                        onClick={(event) => event.stopPropagation()}
                                                        className="w-full max-w-xs bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white focus:border-cyan-500 focus:outline-none"
                                                        autoFocus
                                                    />
                                                </div>
                                            ) : (
                                                <div className="text-sm font-bold text-slate-200">{template.name}</div>
                                            )}
                                            <div className="text-[11px] text-slate-500 mt-1">
                                                {jpLabels || 'No labels'}
                                            </div>
                                            <div className="text-[11px] text-slate-500 mt-1">
                                                {qualityType === 'positive' ? <span className="text-cyan-400">P:</span> : <span className="text-rose-400">N:</span>} {prompt || '-'}
                                            </div>
                                            {template.nsfw && (
                                                <div className="text-[10px] text-red-400 mt-1">NSFW</div>
                                            )}
                                        </button>
                                        <div className="flex items-center gap-2">
                                            {isEditingName ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            submitEditQualityName();
                                                        }}
                                                        className="px-2 py-1 text-[11px] rounded bg-cyan-600 text-white hover:bg-cyan-500"
                                                    >
                                                        保存
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            cancelEditQualityName();
                                                        }}
                                                        className="px-2 py-1 text-[11px] rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                                                    >
                                                        キャンセル
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        startEditQualityName(template);
                                                    }}
                                                    className="px-2 py-1 text-[11px] rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                                                    title="名前を編集"
                                                >
                                                    編集
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    removeQualityTemplate(template.id);
                                                    if (editingQualityId === template.id) cancelEditQualityName();
                                                }}
                                                className="text-slate-500 hover:text-rose-400"
                                                title="Delete"
                                            >
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex items-center justify-between mt-4">
                            <button
                                type="button"
                                onClick={() => {
                                    if (!qualityType) return;
                                    selectQualityTemplate(qualityType, null);
                                    setQualityType(null);
                                }}
                                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                            >
                                Clear Selection
                            </button>
                            <button
                                type="button"
                                onClick={() => setQualityType(null)}
                                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {expandType && renderModal(
                <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className={`text-lg font-bold ${expandType === 'positive' ? 'text-cyan-400' : 'text-rose-400'}`}>
                                {expandType === 'positive' ? 'Positive Prompt' : 'Negative Prompt'}
                            </h3>
                            <button onClick={() => setExpandType(null)} className="text-slate-400 hover:text-white text-xl">&times;</button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={(event) => handleDragEnd(event, expandType)}
                            >
                                <SortableContext
                                    items={(expandType === 'positive' ? selectedPositive : selectedNegative).map(word => `${expandType}:${word.id}`)}
                                    strategy={rectSortingStrategy}
                                >
                                    <div className="flex flex-wrap gap-2">
                                        {(expandType === 'positive' ? selectedPositive : selectedNegative).length === 0 && (
                                            <span className="text-slate-600 text-sm italic">Select words...</span>
                                        )}
                                        {(expandType === 'positive' ? selectedPositive : selectedNegative).map(word => (
                                            <SortableChip
                                                key={word.id}
                                                word={word}
                                                type={expandType}
                                                stepperDisplay={stepperDisplay}
                                                onHoverStart={stepperDisplay === 'above' ? handleHoverStart : undefined}
                                                onHoverEnd={stepperDisplay === 'above' ? handleHoverEnd : undefined}
                                                onHighlightStart={(id, type) => setHighlightedPrompt({ id, type })}
                                                onHighlightEnd={() => setHighlightedPrompt(null)}
                                            />
                                        ))}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        </div>
                        <div className="flex items-center justify-end gap-2 mt-4">
                            <button
                                type="button"
                                onClick={() => setExpandType(null)}
                                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PromptOutput;






