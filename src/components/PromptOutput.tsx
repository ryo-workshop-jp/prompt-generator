import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePrompt } from '../context/usePrompt';
import type { SelectedWord, PromptStrength, PromptFavorite, CardWordRef } from '../types';
import { DocumentDuplicateIcon, XMarkIcon, BookmarkIcon, TrashIcon, Bars3Icon, ChevronRightIcon, ChevronDownIcon, ClockIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { MinusSmallIcon, PlusSmallIcon } from '@heroicons/react/24/solid';
import { trackEvent } from '../analytics';
import { COMFY_PRESET_STORAGE_KEY, COMFY_PRESET_UPDATE_EVENT, DEFAULT_COMFY_PRESET_CONFIG, readComfyPresetConfig, type ComfyPresetConfig, type ComfyQualityPreset } from '../constants/comfyPresets';

const UI_STORAGE_KEY = 'promptgen:ui';
const COPY_HISTORY_KEY = 'promptgen:copy-history';
const COPY_HISTORY_LIMIT = 50;

type CopyHistoryEntry = {
    id: string;
    type: 'pos' | 'neg' | 'both';
    text: string;
    createdAt: number;
    positive: SelectedWord[];
    negative: SelectedWord[];
    qualitySelection: {
        positive: string | null;
        negative: string | null;
    };
};

type CopyHistoryType = 'pos' | 'neg' | 'both';

type RestoreSnapshot = {
    positive: SelectedWord[];
    negative: SelectedWord[];
    qualitySelection: {
        positive: string | null;
        negative: string | null;
    };
};

type ComfyBatchJobDraft = {
    id: string;
    name: string;
    count: number;
    positive: string;
    negative: string;
};

const pad2 = (value: number) => value.toString().padStart(2, '0');

const formatFileTimestamp = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = pad2(date.getMonth() + 1);
    const dd = pad2(date.getDate());
    const hh = pad2(date.getHours());
    const mi = pad2(date.getMinutes());
    const ss = pad2(date.getSeconds());
    return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
};

const sanitizeFilenameBase = (name: string) => {
    const cleaned = name
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 96);
    return cleaned || 'prompt-job';
};

const clampImageCount = (value: number) => {
    if (!Number.isFinite(value)) return 1;
    return Math.min(256, Math.max(1, Math.round(value)));
};

const clampResolution = (value: number) => {
    if (!Number.isFinite(value)) return 1024;
    return Math.min(4096, Math.max(64, Math.round(value)));
};

const clampComfySteps = (value: number) => {
    if (!Number.isFinite(value)) return 28;
    return Math.min(200, Math.max(1, Math.round(value)));
};

const clampComfyCfgScale = (value: number) => {
    if (!Number.isFinite(value)) return 6;
    return Math.min(30, Math.max(0, Math.round(value * 10) / 10));
};

const createDraftId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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

const resolveComfySize = (
    preset: ComfyQualityPreset,
    customWidth: number,
    customHeight: number,
    presetConfig: Record<ComfyQualityPreset, ComfyPresetConfig>
) => {
    if (preset === 'custom') {
        return {
            width: clampResolution(customWidth),
            height: clampResolution(customHeight)
        };
    }
    const selected = presetConfig[preset];
    if (!selected) {
        return {
            width: clampResolution(customWidth),
            height: clampResolution(customHeight)
        };
    }
    return {
        width: selected.width,
        height: selected.height
    };
};

const readUiSettings = () => {
    try {
        if (typeof window === 'undefined') return {};
        const stored = localStorage.getItem(UI_STORAGE_KEY);
        if (!stored) return {};
        return JSON.parse(stored) as {
            stepperDisplay?: 'inside' | 'above';
            combinedCopyEnabled?: boolean;
            showRootInPaths?: boolean;
            comfyExportEnabled?: boolean;
        };
    } catch (e) {
        console.warn('Failed to load UI settings.', e);
        return {};
    }
};

const cloneSelectedWords = (words: SelectedWord[], type: 'positive' | 'negative') => {
    return words.map(word => ({
        ...word,
        type,
        strength: typeof word.strength === 'number' ? word.strength : 1.0
    }));
};

const normalizeHistoryWords = (input: unknown, type: 'positive' | 'negative') => {
    if (!Array.isArray(input)) return [];
    return input.reduce<SelectedWord[]>((acc, entry) => {
        if (!entry || typeof entry !== 'object') return acc;
        const candidate = entry as SelectedWord;
        if (!candidate.id) return acc;
        acc.push({
            ...candidate,
            type,
            strength: typeof candidate.strength === 'number' ? candidate.strength : 1.0
        });
        return acc;
    }, []);
};

const readCopyHistory = () => {
    try {
        if (typeof window === 'undefined') return [];
        const raw = localStorage.getItem(COPY_HISTORY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.reduce<CopyHistoryEntry[]>((acc, entry) => {
            if (!entry || typeof entry !== 'object') return acc;
            const candidate = entry as Partial<CopyHistoryEntry>;
            if (!candidate.id || !candidate.text) return acc;
            if (candidate.type !== 'pos' && candidate.type !== 'neg' && candidate.type !== 'both') return acc;
            const qualitySelection = candidate.qualitySelection ?? { positive: null, negative: null };
            acc.push({
                id: candidate.id,
                type: candidate.type,
                text: candidate.text,
                createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
                positive: normalizeHistoryWords(candidate.positive, 'positive'),
                negative: normalizeHistoryWords(candidate.negative, 'negative'),
                qualitySelection: {
                    positive: qualitySelection.positive ?? null,
                    negative: qualitySelection.negative ?? null
                }
            });
            return acc;
        }, []).slice(0, COPY_HISTORY_LIMIT);
    } catch (e) {
        console.warn('Failed to load copy history.', e);
        return [];
    }
};

const writeCopyHistory = (entries: CopyHistoryEntry[]) => {
    try {
        localStorage.setItem(COPY_HISTORY_KEY, JSON.stringify(entries.slice(0, COPY_HISTORY_LIMIT)));
    } catch (e) {
        console.warn('Failed to save copy history.', e);
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

const formatCardPrompt = (refs: CardWordRef[], disabledWordIds: string[] = []) => {
    const disabled = new Set(disabledWordIds);
    const parts: string[] = [];
    refs.forEach(ref => {
        if (disabled.has(ref.wordId)) return;
        const value = ref.value_en ?? ref.label_jp ?? ref.wordId;
        const strength = typeof ref.strength === 'number' ? ref.strength : 1.0;
        const token = strength === 1.0 ? value : `(${value}:${strength.toFixed(1)})`;
        const repeat = typeof ref.repeat === 'number' && ref.repeat > 1 ? Math.max(1, Math.round(ref.repeat)) : 1;
        for (let i = 0; i < repeat; i += 1) {
            parts.push(token);
        }
    });
    return parts.join(', ');
};

const getCardTokenPrompt = (word: SelectedWord) => {
    if (word.cardRefs && word.cardRefs.length > 0) {
        return formatCardPrompt(word.cardRefs, word.cardDisabledWordIds ?? []);
    }
    return word.cardPrompt ?? word.value_en;
};

const formatPrompt = (words: SelectedWord[]) => {
    return expandRepeatedWords(words).map(({ word }) => {
        const val = word.cardId ? `(${getCardTokenPrompt(word)})` : word.value_en;
        if (word.cardId) return val;
        if (word.strength === 1.0) return val;
        return `(${val}:${word.strength.toFixed(1)})`;
    }).join(', ');
};

const getHistoryTokens = (words: SelectedWord[]) => {
    return words.map((word) => ({
        id: word.id,
        label: word.label_jp || word.cardName || word.value_en || word.id,
        isDeck: Boolean(word.cardId)
    }));
};

const renderHistoryTokens = (words: SelectedWord[]) => {
    const tokens = getHistoryTokens(words);
    if (tokens.length === 0) {
        return <span className="text-slate-500">なし</span>;
    }

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {tokens.map(token => (
                <span
                    key={token.id}
                    className={token.isDeck
                        ? 'inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-200 font-semibold'
                        : 'text-slate-300'
                    }
                >
                    {token.isDeck && <span className="text-[9px] text-amber-300/90">デッキ</span>}
                    <span>{token.label}</span>
                </span>
            ))}
        </div>
    );
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
    onCardEdit?: (word: SelectedWord, type: 'positive' | 'negative') => void;
}> = ({ word, type, stepperDisplay, onHoverStart, onHoverEnd, onHighlightStart, onHighlightEnd, onCardEdit }) => {
    const { removeWord, updateWordStrength } = usePrompt();
    const chipRef = useRef<HTMLDivElement | null>(null);
    const isCardToken = !!word.cardId;
    const offCount = (word.cardDisabledWordIds ?? []).length;
    const hasCardOff = isCardToken && offCount > 0;

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
            className={`relative inline-flex items-center gap-2 pl-3 pr-1 py-1 rounded-full text-xs font-medium border group transition-all animate-fadeIn ${hasCardOff
                ? 'bg-amber-950/40 border-amber-600/70 text-amber-200'
                : type === 'positive'
                    ? 'bg-cyan-950/40 border-cyan-800 text-cyan-300'
                    : 'bg-rose-950/40 border-rose-800 text-rose-300'
                }`}>
            <span>{word.label_jp}</span>
            {isCardToken && (
                <button
                    type="button"
                    onClick={() => onCardEdit?.(word, type)}
                    className={`text-[10px] uppercase px-1 rounded border ${hasCardOff
                        ? 'text-amber-200 border-amber-300/70 bg-amber-900/40'
                        : 'text-amber-300/80 border-amber-400/30 hover:text-amber-200 hover:border-amber-300/50'
                        }`}
                    title="デッキ内容を調整"
                >
                    {hasCardOff ? `デッキ (${offCount} 無効)` : 'デッキ'}
                </button>
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
    onCardEdit?: (word: SelectedWord, type: 'positive' | 'negative') => void;
}> = ({ word, type, stepperDisplay, onHoverStart, onHoverEnd, onHighlightStart, onHighlightEnd, onCardEdit }) => {
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
                onCardEdit={onCardEdit}
            />
            <button
                type="button"
                {...attributes}
                {...listeners}
                className="absolute -left-2 -top-2 p-1 rounded-full bg-slate-900/80 border border-slate-700 text-slate-400 hover:text-slate-200 cursor-grab"
                title="ドラッグして並び替え"
            >
                <Bars3Icon className="w-3 h-3" />
            </button>
        </div>
    );
};

const PromptOutput: React.FC<{ activeFolderId: string }> = ({ activeFolderId }) => {
    const {
        selectedPositive,
        selectedNegative,
        favorites,
        qualityTemplates,
        templates,
        nsfwEnabled,
        folders,
        addPromptFavorite,
        addQualityTemplate,
        addCard,
        applyPromptFavorite,
        removePromptFavorite,
        removeQualityTemplate,
        updateQualityTemplateName,
        clearPositive,
        clearNegative,
        reorderSelected,
        selectQualityTemplate,
        selectedQualityTemplateIds,
        updateWordStrength,
        updateSelectedWord,
        setSelectedWords
    } = usePrompt();
    const [copyFeedback, setCopyFeedback] = useState<'pos' | 'neg' | 'both' | null>(null);
    const [copyHistory, setCopyHistory] = useState<CopyHistoryEntry[]>(() => readCopyHistory());
    const [historyType, setHistoryType] = useState<CopyHistoryType | null>(null);
    const [restoreToast, setRestoreToast] = useState<string | null>(null);
    const [restoreUndoSnapshot, setRestoreUndoSnapshot] = useState<RestoreSnapshot | null>(null);
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
    const [cardEditorTarget, setCardEditorTarget] = useState<{ id: string; type: 'positive' | 'negative' } | null>(null);
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
    const [comfyExportEnabled, setComfyExportEnabled] = useState<boolean>(() => {
        const settings = readUiSettings();
        return settings.comfyExportEnabled ?? true;
    });
    const [isComfyExportOpen, setIsComfyExportOpen] = useState(false);
    const [comfyPresetConfig, setComfyPresetConfig] = useState<Record<ComfyQualityPreset, ComfyPresetConfig>>(() => readComfyPresetConfig());
    const [comfyQualityPreset, setComfyQualityPreset] = useState<ComfyQualityPreset>('standard');
    const [comfyImageCount, setComfyImageCount] = useState(4);
    const [comfyJobName, setComfyJobName] = useState('');
    const [comfyBatchJobs, setComfyBatchJobs] = useState<ComfyBatchJobDraft[]>([]);
    const [comfyCustomWidth, setComfyCustomWidth] = useState(1524);
    const [comfyCustomHeight, setComfyCustomHeight] = useState(1524);
    const [comfySteps, setComfySteps] = useState(() => {
        const presets = readComfyPresetConfig();
        return presets.standard?.steps ?? Object.values(presets)[0]?.steps ?? DEFAULT_COMFY_PRESET_CONFIG.standard.steps;
    });
    const [comfyCfgScale, setComfyCfgScale] = useState(() => {
        const presets = readComfyPresetConfig();
        return presets.standard?.cfgScale ?? Object.values(presets)[0]?.cfgScale ?? DEFAULT_COMFY_PRESET_CONFIG.standard.cfgScale;
    });
    const [hoveredStrength, setHoveredStrength] = useState<{ id: string; type: 'positive' | 'negative'; rect: DOMRect } | null>(null);
    const hoverTimeoutRef = useRef<number | null>(null);
    const restoreToastTimerRef = useRef<number | null>(null);

    const posString = formatPrompt(selectedPositive);
    const negString = formatPrompt(selectedNegative);
    const hoveredWord = useMemo(() => {
        if (!hoveredStrength) return null;
        const source = hoveredStrength.type === 'positive' ? selectedPositive : selectedNegative;
        return source.find(word => word.id === hoveredStrength.id) ?? null;
    }, [hoveredStrength, selectedPositive, selectedNegative]);
    const editingCardWord = useMemo(() => {
        if (!cardEditorTarget) return null;
        const source = cardEditorTarget.type === 'positive' ? selectedPositive : selectedNegative;
        return source.find(word => word.id === cardEditorTarget.id) ?? null;
    }, [cardEditorTarget, selectedPositive, selectedNegative]);
    const comfyPresetEntries = useMemo(() => {
        return Object.entries(comfyPresetConfig) as [ComfyQualityPreset, ComfyPresetConfig][];
    }, [comfyPresetConfig]);
    const comfyActivePresetKey = useMemo(() => {
        if (comfyPresetConfig[comfyQualityPreset]) return comfyQualityPreset;
        return comfyPresetEntries[0]?.[0] ?? 'standard';
    }, [comfyPresetConfig, comfyQualityPreset, comfyPresetEntries]);
    const comfyActivePreset = useMemo(() => {
        return comfyPresetConfig[comfyActivePresetKey] ?? comfyPresetEntries[0]?.[1] ?? DEFAULT_COMFY_PRESET_CONFIG.standard;
    }, [comfyPresetConfig, comfyActivePresetKey, comfyPresetEntries]);
    const comfyResolvedSize = useMemo(() => {
        return resolveComfySize(comfyActivePresetKey, comfyCustomWidth, comfyCustomHeight, comfyPresetConfig);
    }, [comfyActivePresetKey, comfyCustomWidth, comfyCustomHeight, comfyPresetConfig]);

    const renderPromptTokens = (words: SelectedWord[], highlightId?: string) => {
        const expanded = expandRepeatedWords(words);
        return expanded.map(({ word, instance }, index) => {
            const base = word.cardId ? getCardTokenPrompt(word) : word.value_en;
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
        if (!cardEditorTarget) return;
        if (!editingCardWord) {
            setCardEditorTarget(null);
        }
    }, [cardEditorTarget, editingCardWord]);

    useEffect(() => {
        const handleUiUpdate = (event: Event) => {
            const detail = (event as CustomEvent).detail as { stepperDisplay?: 'inside' | 'above'; combinedCopyEnabled?: boolean; showRootInPaths?: boolean; comfyExportEnabled?: boolean } | undefined;
            const next = detail ?? readUiSettings();
            setStepperDisplay(next.stepperDisplay ?? 'above');
            setCombinedCopyEnabled(!!next.combinedCopyEnabled);
            setShowRootInPaths(next.showRootInPaths ?? false);
            setComfyExportEnabled(next.comfyExportEnabled ?? true);
        };
        const handleStorage = (event: StorageEvent) => {
            if (event.key !== UI_STORAGE_KEY) return;
            const next = readUiSettings();
            setStepperDisplay(next.stepperDisplay ?? 'above');
            setCombinedCopyEnabled(!!next.combinedCopyEnabled);
            setShowRootInPaths(next.showRootInPaths ?? false);
            setComfyExportEnabled(next.comfyExportEnabled ?? true);
        };
        window.addEventListener('promptgen:ui-update', handleUiUpdate);
        window.addEventListener('storage', handleStorage);
        return () => {
            window.removeEventListener('promptgen:ui-update', handleUiUpdate);
            window.removeEventListener('storage', handleStorage);
        };
    }, []);
    useEffect(() => {
        const handlePresetUpdate = (event: Event) => {
            const detail = (event as CustomEvent).detail as Record<ComfyQualityPreset, ComfyPresetConfig> | undefined;
            const next = detail ?? readComfyPresetConfig();
            setComfyPresetConfig(next);
        };
        const handleStorage = (event: StorageEvent) => {
            if (event.key !== COMFY_PRESET_STORAGE_KEY) return;
            setComfyPresetConfig(readComfyPresetConfig());
        };
        window.addEventListener(COMFY_PRESET_UPDATE_EVENT, handlePresetUpdate);
        window.addEventListener('storage', handleStorage);
        return () => {
            window.removeEventListener(COMFY_PRESET_UPDATE_EVENT, handlePresetUpdate);
            window.removeEventListener('storage', handleStorage);
        };
    }, []);

    useEffect(() => {
        if (comfyPresetConfig[comfyQualityPreset]) return;
        const fallback = comfyPresetEntries[0];
        if (!fallback) return;
        setComfyQualityPreset(fallback[0]);
        setComfySteps(fallback[1].steps);
        setComfyCfgScale(fallback[1].cfgScale);
    }, [comfyPresetConfig, comfyQualityPreset, comfyPresetEntries]);

    useEffect(() => {
        if (stepperDisplay === 'inside') {
            setHoveredStrength(null);
        }
    }, [stepperDisplay]);

    useEffect(() => {
        if (!comfyExportEnabled && isComfyExportOpen) {
            setIsComfyExportOpen(false);
        }
    }, [comfyExportEnabled, isComfyExportOpen]);

    useEffect(() => {
        return () => {
            if (restoreToastTimerRef.current) {
                window.clearTimeout(restoreToastTimerRef.current);
            }
        };
    }, []);

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

    const historyCounts = useMemo(() => {
        return copyHistory.reduce<{ pos: number; neg: number; both: number }>((acc, entry) => {
            acc[entry.type] += 1;
            return acc;
        }, { pos: 0, neg: 0, both: 0 });
    }, [copyHistory]);

    const filteredHistory = useMemo(() => {
        if (!historyType) return [];
        return copyHistory.filter(entry => entry.type === historyType);
    }, [copyHistory, historyType]);

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
    const comfyCurrentPositivePrompt = buildCopyText('positive', posString).trim();
    const comfyCurrentNegativePrompt = buildCopyText('negative', negString).trim();
    const comfyBatchStats = useMemo(() => {
        let readyJobs = 0;
        let totalImages = 0;
        comfyBatchJobs.forEach(job => {
            const hasPrompt = job.positive.trim().length > 0 || job.negative.trim().length > 0;
            if (!hasPrompt) return;
            readyJobs += 1;
            totalImages += clampImageCount(job.count);
        });
        return {
            readyJobs,
            totalImages
        };
    }, [comfyBatchJobs]);

    const buildCombinedCopyText = () => {
        const pos = buildCopyText('positive', posString);
        const neg = buildCopyText('negative', negString);
        return `Positive prompt: ${pos}\nNegative prompt: ${neg}`;
    };

    const openComfyExportModal = () => {
        const count = clampImageCount(comfyImageCount);
        if (count !== comfyImageCount) {
            setComfyImageCount(count);
        }
        setIsComfyExportOpen(true);
    };
    const handleAddComfyBatchFromCurrent = () => {
        if (!comfyCurrentPositivePrompt && !comfyCurrentNegativePrompt) {
            alert('現在のプロンプトが空です。先に語句を選択してください。');
            return;
        }
        const count = clampImageCount(comfyImageCount);
        if (count !== comfyImageCount) {
            setComfyImageCount(count);
        }
        setComfyBatchJobs(prev => ([
            ...prev,
            {
                id: createDraftId(),
                name: '',
                count,
                positive: comfyCurrentPositivePrompt,
                negative: comfyCurrentNegativePrompt
            }
        ]));
    };

    const updateComfyBatchJob = (id: string, updates: Partial<ComfyBatchJobDraft>) => {
        setComfyBatchJobs(prev => prev.map(job => (job.id === id ? { ...job, ...updates } : job)));
    };

    const removeComfyBatchJob = (id: string) => {
        setComfyBatchJobs(prev => prev.filter(job => job.id !== id));
    };

    const clearComfyBatchJobs = () => {
        if (!confirm('ジョブ一覧をすべて消去しますか？')) return;
        setComfyBatchJobs([]);
    };

    const handleExportComfyInstruction = () => {
        const exportPresetKey = comfyPresetConfig[comfyQualityPreset] ? comfyQualityPreset : comfyPresetEntries[0]?.[0];
        if (!exportPresetKey) {
            alert('Comfyプリセットがありません。設定から追加してください。');
            return;
        }
        const preset = comfyPresetConfig[exportPresetKey];
        if (!preset) {
            alert('選択されたComfyプリセットが見つかりません。');
            return;
        }

        const exportSize = resolveComfySize(exportPresetKey, comfyCustomWidth, comfyCustomHeight, comfyPresetConfig);
        if (exportPresetKey === 'custom') {
            if (exportSize.width !== comfyCustomWidth) setComfyCustomWidth(exportSize.width);
            if (exportSize.height !== comfyCustomHeight) setComfyCustomHeight(exportSize.height);
        }

        const steps = clampComfySteps(comfySteps);
        if (steps !== comfySteps) {
            setComfySteps(steps);
        }
        const cfgScale = clampComfyCfgScale(comfyCfgScale);
        if (cfgScale !== comfyCfgScale) {
            setComfyCfgScale(cfgScale);
        }

        const normalizedJobs = comfyBatchJobs.map(job => ({
            ...job,
            name: job.name.trim(),
            positive: job.positive.trim(),
            negative: job.negative.trim(),
            count: clampImageCount(job.count)
        }));

        const jobsChanged = normalizedJobs.some((job, index) => {
            const original = comfyBatchJobs[index];
            return !original
                || original.name !== job.name
                || original.positive !== job.positive
                || original.negative !== job.negative
                || original.count !== job.count;
        });
        if (jobsChanged) {
            setComfyBatchJobs(normalizedJobs);
        }

        const exportJobs = normalizedJobs
            .filter(job => job.positive.length > 0 || job.negative.length > 0)
            .map((job, index) => ({
                id: job.id,
                name: job.name || `job-${index + 1}`,
                count: job.count,
                prompt: {
                    positive: job.positive,
                    negative: job.negative
                }
            }));

        if (exportJobs.length === 0) {
            alert('出力対象のジョブがありません。ジョブを追加してから出力してください。');
            return;
        }

        const totalCount = exportJobs.reduce((sum, job) => sum + job.count, 0);
        const timestamp = new Date();
        const fallbackBatchName = `prompt-batch-${formatFileTimestamp(timestamp)}`;
        const batchName = comfyJobName.trim() || fallbackBatchName;
        const filename = `${sanitizeFilenameBase(batchName)}.json`;

        const payload = {
            schema: 'promptgen.comfy.batch/v1',
            createdAt: timestamp.toISOString(),
            source: {
                app: 'PromptGenerator'
            },
            batch: {
                name: batchName,
                qualityPreset: exportPresetKey,
                jobCount: exportJobs.length,
                totalCount
            },
            generation: {
                width: exportSize.width,
                height: exportSize.height,
                steps,
                cfgScale,
                sampler: preset.sampler,
                scheduler: preset.scheduler,
                seed: -1
            },
            jobs: exportJobs,
            meta: {
                qualityTemplate: {
                    positive: getQualityName('positive') || null,
                    negative: getQualityName('negative') || null
                },
                tokenCount: {
                    positive: selectedPositive.length,
                    negative: selectedNegative.length
                },
                selectedTokens: {
                    positive: selectedPositive.map(word => ({
                        id: word.id,
                        label: word.label_jp || word.value_en,
                        value: word.value_en,
                        strength: word.strength,
                        repeat: word.repeat ?? 1,
                        isDeck: Boolean(word.cardId)
                    })),
                    negative: selectedNegative.map(word => ({
                        id: word.id,
                        label: word.label_jp || word.value_en,
                        value: word.value_en,
                        strength: word.strength,
                        repeat: word.repeat ?? 1,
                        isDeck: Boolean(word.cardId)
                    }))
                }
            }
        };

        downloadJson(payload, filename);
        trackEvent('comfy_instruction_export', {
            quality_preset: exportPresetKey,
            image_count: totalCount,
            job_count: exportJobs.length,
            width: exportSize.width,
            height: exportSize.height,
            steps,
            cfg_scale: cfgScale,
            has_positive: exportJobs.some(job => job.prompt.positive.length > 0),
            has_negative: exportJobs.some(job => job.prompt.negative.length > 0)
        });
        setIsComfyExportOpen(false);
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

    const clearRestoreToast = () => {
        setRestoreToast(null);
        setRestoreUndoSnapshot(null);
        if (restoreToastTimerRef.current) {
            window.clearTimeout(restoreToastTimerRef.current);
            restoreToastTimerRef.current = null;
        }
    };

    const showRestoreToast = (type: CopyHistoryType) => {
        const message = type === 'both'
            ? 'ポジティブ/ネガティブを履歴から復元しました'
            : type === 'pos'
                ? 'ポジティブを履歴から復元しました'
                : 'ネガティブを履歴から復元しました';
        setRestoreToast(message);
        if (restoreToastTimerRef.current) {
            window.clearTimeout(restoreToastTimerRef.current);
        }
        restoreToastTimerRef.current = window.setTimeout(() => {
            clearRestoreToast();
        }, 5000);
    };

    const addHistoryEntry = (text: string, type: CopyHistoryType) => {
        const payload: CopyHistoryEntry = {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type,
            text,
            createdAt: Date.now(),
            positive: cloneSelectedWords(selectedPositive, 'positive'),
            negative: cloneSelectedWords(selectedNegative, 'negative'),
            qualitySelection: { ...selectedQualityTemplateIds }
        };
        setCopyHistory(prev => {
            const deduped = prev.filter(item => !(item.type === payload.type && item.text === payload.text));
            const next = [payload, ...deduped].slice(0, COPY_HISTORY_LIMIT);
            writeCopyHistory(next);
            return next;
        });
    };

    const removeHistoryEntry = (id: string) => {
        setCopyHistory(prev => {
            const next = prev.filter(entry => entry.id !== id);
            writeCopyHistory(next);
            return next;
        });
    };

    const clearHistoryEntries = (type: CopyHistoryType) => {
        setCopyHistory(prev => {
            const next = prev.filter(entry => entry.type !== type);
            writeCopyHistory(next);
            return next;
        });
    };

    const applyHistoryEntry = (entry: CopyHistoryEntry) => {
        setRestoreUndoSnapshot({
            positive: cloneSelectedWords(selectedPositive, 'positive'),
            negative: cloneSelectedWords(selectedNegative, 'negative'),
            qualitySelection: { ...selectedQualityTemplateIds }
        });
        if (entry.type === 'pos' || entry.type === 'both') {
            setSelectedWords('positive', cloneSelectedWords(entry.positive, 'positive'));
            selectQualityTemplate('positive', entry.qualitySelection.positive ?? null);
        }
        if (entry.type === 'neg' || entry.type === 'both') {
            setSelectedWords('negative', cloneSelectedWords(entry.negative, 'negative'));
            selectQualityTemplate('negative', entry.qualitySelection.negative ?? null);
        }
        setHistoryType(null);
        showRestoreToast(entry.type);
    };

    const undoRestore = () => {
        if (!restoreUndoSnapshot) return;
        setSelectedWords('positive', cloneSelectedWords(restoreUndoSnapshot.positive, 'positive'));
        setSelectedWords('negative', cloneSelectedWords(restoreUndoSnapshot.negative, 'negative'));
        selectQualityTemplate('positive', restoreUndoSnapshot.qualitySelection.positive);
        selectQualityTemplate('negative', restoreUndoSnapshot.qualitySelection.negative);
        clearRestoreToast();
    };

    const handleCopy = (text: string, type: CopyHistoryType) => {
        navigator.clipboard.writeText(text);
        addHistoryEntry(text, type);
        trackEvent('prompt_copy', {
            copy_scope: type,
            text_length: text.length
        });
        setCopyFeedback(type);
        setTimeout(() => setCopyFeedback(null), 2000);
    };

    const handleSaveFavorite = (type: 'positive' | 'negative') => {
        const source = type === 'positive' ? selectedPositive : selectedNegative;
        const combinedLabels = source.map(word => word.label_jp).filter(Boolean);
        const trimmedName = favoriteName.trim();
        const saveMode = saveAsCard ? 'deck' : saveAsQuality ? 'quality_template' : 'favorite';
        if (saveAsCard && !trimmedName) {
            alert('デッキ名を入力してください。');
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
        trackEvent('favorite_save', {
            save_mode: saveMode,
            prompt_type: type,
            word_count: source.length,
            nsfw: favoriteNsfw
        });
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

    const toggleCardWordEnabled = (target: SelectedWord, type: 'positive' | 'negative', wordId: string) => {
        const current = new Set(target.cardDisabledWordIds ?? []);
        if (current.has(wordId)) {
            current.delete(wordId);
        } else {
            current.add(wordId);
        }
        updateSelectedWord(target.id, type, {
            cardDisabledWordIds: Array.from(current)
        });
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

    const getHistoryLabel = (type: CopyHistoryType | null) => {
        if (type === 'pos') return 'ポジティブ';
        if (type === 'neg') return 'ネガティブ';
        if (type === 'both') return '両方コピー';
        return '';
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
            <div className="flex justify-end -mb-1 gap-2">
                {combinedCopyEnabled && (
                    <>
                        <button
                            type="button"
                            onClick={() => setHistoryType('both')}
                            className="h-9 shrink-0 whitespace-nowrap flex items-center gap-1 text-xs px-2.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 transition-colors"
                            title={'\u4e21\u65b9\u30b3\u30d4\u30fc\u306e\u5c65\u6b74\u3092\u958b\u304f'}
                        >
                            <ClockIcon className="w-4 h-4" /> {'\u5c65\u6b74'}
                            <span className="text-[10px] text-emerald-100/80">{historyCounts.both}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleCopy(buildCombinedCopyText(), 'both')}
                            className="h-9 shrink-0 whitespace-nowrap flex items-center gap-1 text-xs px-2.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 transition-colors"
                            title={'\u30dd\u30b8\u30c6\u30a3\u30d6/\u30cd\u30ac\u30c6\u30a3\u30d6\u3092\u307e\u3068\u3081\u3066\u30b3\u30d4\u30fc'}
                        >
                            {copyFeedback === 'both' ? <span className="text-green-300">{'\u30b3\u30d4\u30fc\u3057\u307e\u3057\u305f'}</span> : (
                                <>
                                    <DocumentDuplicateIcon className="w-4 h-4" /> {'\u4e21\u65b9\u30b3\u30d4\u30fc'}
                                </>
                            )}
                        </button>
                    </>
                )}
                {comfyExportEnabled && (
                    <button
                        type="button"
                        onClick={openComfyExportModal}
                        className="h-9 shrink-0 whitespace-nowrap flex items-center gap-1 text-xs px-2.5 rounded-md border border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 transition-colors"
                        title={'ComfyUI\u5411\u3051\u306e\u6307\u793aJSON\u3092\u51fa\u529b'}
                    >
                        <ArrowDownTrayIcon className="w-4 h-4" /> {'Comfy\u6307\u793aJSON'}
                    </button>
                )}
            </div>
            <div className="flex flex-1 gap-4">
            {/* Positive Section */}
            <div className="flex-1 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider">ポジティブプロンプト</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => openSaveModal('positive')}
                            className="h-9 shrink-0 whitespace-nowrap flex items-center gap-1 text-xs px-2 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
                        >
                            <BookmarkIcon className="w-4 h-4" /> 保存
                        </button>
                        <button
                            onClick={() => setQualityType('positive')}
                            className="h-9 shrink-0 whitespace-nowrap flex items-center gap-1 text-xs px-2 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
                        >
                            <Bars3Icon className="w-4 h-4" /> 品質
                            {getQualityName('positive') && (
                                <span className="text-[10px] text-cyan-200">{getQualityName('positive')}</span>
                            )}
                        </button>
                        <button
                            onClick={() => setLoadType('positive')}
                            className="h-9 shrink-0 whitespace-nowrap flex items-center gap-1 text-xs px-2 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
                        >
                            <BookmarkIcon className="w-4 h-4" /> 読み込み
                        </button>
                        <button
                            onClick={clearPositive}
                            className="h-9 shrink-0 whitespace-nowrap flex items-center gap-1 text-xs px-2 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
                        >
                            <XMarkIcon className="w-4 h-4" /> クリア
                        </button>
                        <button
                            type="button"
                            onClick={() => setHistoryType('pos')}
                            className="h-9 shrink-0 whitespace-nowrap flex items-center gap-1 text-xs px-2 rounded-md border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 transition-colors"
                            title="ポジティブの履歴を開く"
                        >
                            <ClockIcon className="w-4 h-4" /> 履歴
                            <span className="text-[10px] text-cyan-100/80">{historyCounts.pos}</span>
                        </button>
                        <button
                            onClick={() => handleCopy(buildCopyText('positive', posString), 'pos')}
                            className="h-9 shrink-0 whitespace-nowrap flex items-center gap-1 text-sm px-3 rounded-md border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 transition-colors"
                        >
                            {copyFeedback === 'pos' ? <span className="text-green-300">コピーしました</span> : (
                                <>
                                    <DocumentDuplicateIcon className="w-4 h-4" /> コピー
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
                        <Bars3Icon className="w-3 h-3" /> 展開
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
                                {selectedPositive.length === 0 && <span className="text-slate-600 text-sm italic">カードを選択...</span>}
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
                                        onCardEdit={(target, kind) => setCardEditorTarget({ id: target.id, type: kind })}
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
                    <div className="flex items-center gap-1">
                        <h3 className="text-sm font-bold text-rose-400 uppercase tracking-wider whitespace-nowrap">ネガティブプロンプト</h3>
                        <span className="text-[10px] text-slate-500 whitespace-nowrap">(右クリック / Shift+クリックで登録)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => openSaveModal('negative')}
                            className="h-9 shrink-0 whitespace-nowrap flex items-center gap-1 text-xs px-2 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
                        >
                            <BookmarkIcon className="w-4 h-4" /> 保存
                        </button>
                        <button
                            onClick={() => setQualityType('negative')}
                            className="h-9 shrink-0 whitespace-nowrap flex items-center gap-1 text-xs px-2 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
                        >
                            <Bars3Icon className="w-4 h-4" /> 品質
                            {getQualityName('negative') && (
                                <span className="text-[10px] text-rose-200">{getQualityName('negative')}</span>
                            )}
                        </button>
                        <button
                            onClick={() => setLoadType('negative')}
                            className="h-9 shrink-0 whitespace-nowrap flex items-center gap-1 text-xs px-2 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
                        >
                            <BookmarkIcon className="w-4 h-4" /> 読み込み
                        </button>
                        <button
                            onClick={clearNegative}
                            className="h-9 shrink-0 whitespace-nowrap flex items-center gap-1 text-xs px-2 rounded-md border border-slate-800 bg-slate-900/60 text-slate-300 hover:text-rose-300 hover:border-rose-500/40 transition-colors"
                        >
                            <XMarkIcon className="w-4 h-4" /> クリア
                        </button>
                        <button
                            type="button"
                            onClick={() => setHistoryType('neg')}
                            className="h-9 shrink-0 whitespace-nowrap flex items-center gap-1 text-xs px-2 rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 transition-colors"
                            title="ネガティブの履歴を開く"
                        >
                            <ClockIcon className="w-4 h-4" /> 履歴
                            <span className="text-[10px] text-rose-100/80">{historyCounts.neg}</span>
                        </button>
                        <button
                            onClick={() => handleCopy(buildCopyText('negative', negString), 'neg')}
                            className="h-9 shrink-0 whitespace-nowrap flex items-center gap-1 text-sm px-3 rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 transition-colors"
                        >
                            {copyFeedback === 'neg' ? <span className="text-green-300">コピーしました</span> : (
                                <>
                                    <DocumentDuplicateIcon className="w-4 h-4" /> コピー
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
                        <Bars3Icon className="w-3 h-3" /> 展開
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
                                {selectedNegative.length === 0 && <span className="text-slate-600 text-sm italic">カードを選択...</span>}
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
                                        onCardEdit={(target, kind) => setCardEditorTarget({ id: target.id, type: kind })}
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

            {comfyExportEnabled && isComfyExportOpen && renderModal(
                <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        <h3 className="text-lg font-bold mb-4 text-white">{'ComfyUI \u6307\u793aJSON\u3092\u51fa\u529b'}</h3>
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-4 pr-1">
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">{'バッチ名 (任意)'}</label>
                                <input
                                    type="text"
                                    value={comfyJobName}
                                    onChange={(event) => setComfyJobName(event.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-violet-500 focus:outline-none"
                                    placeholder={'未入力時は日時ベースで自動命名'}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">{'画質・サイズプリセット'}</label>
                                <select
                                    value={comfyActivePresetKey}
                                    onChange={(event) => {
                                        const nextPreset = event.target.value as ComfyQualityPreset;
                                        setComfyQualityPreset(nextPreset);
                                        setComfySteps(comfyPresetConfig[nextPreset].steps);
                                        setComfyCfgScale(comfyPresetConfig[nextPreset].cfgScale);
                                    }}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-violet-500 focus:outline-none"
                                >
                                    {comfyPresetEntries.map(([key, preset]) => (
                                        <option key={key} value={key}>{preset.label} - {preset.description}</option>
                                    ))}
                                </select>
                            </div>
                            {comfyActivePresetKey === 'custom' && (
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">{'任意サイズ (幅 x 高さ)'}</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            type="number"
                                            min={64}
                                            max={4096}
                                            value={comfyCustomWidth}
                                            onChange={(event) => setComfyCustomWidth(Number(event.target.value))}
                                            onBlur={() => setComfyCustomWidth(prev => clampResolution(prev))}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-violet-500 focus:outline-none"
                                            placeholder={'幅'}
                                        />
                                        <input
                                            type="number"
                                            min={64}
                                            max={4096}
                                            value={comfyCustomHeight}
                                            onChange={(event) => setComfyCustomHeight(Number(event.target.value))}
                                            onBlur={() => setComfyCustomHeight(prev => clampResolution(prev))}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-violet-500 focus:outline-none"
                                            placeholder={'高さ'}
                                        />
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">{'新規ジョブの枚数 (追加時)'}</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={256}
                                    value={comfyImageCount}
                                    onChange={(event) => setComfyImageCount(Number(event.target.value))}
                                    onBlur={() => setComfyImageCount(prev => clampImageCount(prev))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-violet-500 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">{'生成設定 (steps / cfg)'}</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="number"
                                        min={1}
                                        max={200}
                                        value={comfySteps}
                                        onChange={(event) => setComfySteps(Number(event.target.value))}
                                        onBlur={() => setComfySteps(prev => clampComfySteps(prev))}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-violet-500 focus:outline-none"
                                        placeholder={'steps'}
                                    />
                                    <input
                                        type="number"
                                        min={0}
                                        max={30}
                                        step={0.1}
                                        value={comfyCfgScale}
                                        onChange={(event) => setComfyCfgScale(Number(event.target.value))}
                                        onBlur={() => setComfyCfgScale(prev => clampComfyCfgScale(prev))}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-violet-500 focus:outline-none"
                                        placeholder={'cfg'}
                                    />
                                </div>
                            </div>
                            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300 space-y-2">
                                <div className="text-slate-100 font-semibold">{'現在のプロンプトをジョブに追加'}</div>
                                <div>positive: {comfyCurrentPositivePrompt || '(空)'}</div>
                                <div>negative: {comfyCurrentNegativePrompt || '(空)'}</div>
                                <div className="flex gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={handleAddComfyBatchFromCurrent}
                                        className="px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-500"
                                    >
                                        {'ジョブ追加'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={clearComfyBatchJobs}
                                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
                                    >
                                        {'ジョブ一覧を消去'}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {comfyBatchJobs.length === 0 && (
                                    <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/40 p-3 text-xs text-slate-400">
                                        {'ジョブがありません。"ジョブ追加"で追加してください。'}
                                    </div>
                                )}
                                {comfyBatchJobs.map((job, index) => (
                                    <div key={job.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="text-xs font-semibold text-slate-200">{`Job ${index + 1}`}</div>
                                            <button
                                                type="button"
                                                onClick={() => removeComfyBatchJob(job.id)}
                                                className="px-2 py-1 text-xs rounded bg-rose-900/50 text-rose-200 hover:bg-rose-800/60"
                                            >
                                                {'削除'}
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-[1fr,110px] gap-2">
                                            <input
                                                type="text"
                                                value={job.name}
                                                onChange={(event) => updateComfyBatchJob(job.id, { name: event.target.value })}
                                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-violet-500 focus:outline-none"
                                                placeholder={'ジョブ名 (任意)'}
                                            />
                                            <input
                                                type="number"
                                                min={1}
                                                max={256}
                                                value={job.count}
                                                onChange={(event) => {
                                                    const next = Number(event.target.value);
                                                    if (!Number.isFinite(next)) return;
                                                    updateComfyBatchJob(job.id, { count: next });
                                                }}
                                                onBlur={() => updateComfyBatchJob(job.id, { count: clampImageCount(job.count) })}
                                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-violet-500 focus:outline-none"
                                                placeholder={'枚数'}
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 gap-2">
                                            <textarea
                                                value={job.positive}
                                                onChange={(event) => updateComfyBatchJob(job.id, { positive: event.target.value })}
                                                className="w-full min-h-20 bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-cyan-100 focus:border-cyan-500 focus:outline-none"
                                                placeholder={'positive prompt'}
                                            />
                                            <textarea
                                                value={job.negative}
                                                onChange={(event) => updateComfyBatchJob(job.id, { negative: event.target.value })}
                                                className="w-full min-h-20 bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-rose-100 focus:border-rose-500 focus:outline-none"
                                                placeholder={'negative prompt'}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300 space-y-1">
                                <div className="text-slate-100 font-semibold mb-1">{'出力内容プレビュー'}</div>
                                <div>jobs: {comfyBatchStats.readyJobs} 件</div>
                                <div>total images: {comfyBatchStats.totalImages} 枚</div>
                                <div>size: {comfyResolvedSize.width} x {comfyResolvedSize.height}</div>
                                <div>steps/cfg: {clampComfySteps(comfySteps)} / {clampComfyCfgScale(comfyCfgScale)}</div>
                                <div>sampler: {comfyActivePreset.sampler} ({comfyActivePreset.scheduler})</div>
                            </div>
                        </div>                        <div className="flex gap-2 pt-4">
                            <button
                                type="button"
                                onClick={() => setIsComfyExportOpen(false)}
                                className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                            >
                                {'\u9589\u3058\u308b'}
                            </button>
                            <button
                                type="button"
                                onClick={handleExportComfyInstruction}
                                className="flex-1 px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500 font-bold"
                            >
                                {'JSON\u3092\u51fa\u529b'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {historyType && renderModal(
                <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        <h3 className="text-lg font-bold mb-4 text-white">{getHistoryLabel(historyType)} 履歴</h3>
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-1">
                            {filteredHistory.length === 0 && (
                                <div className="text-sm text-slate-500">履歴はありません。</div>
                            )}
                            {filteredHistory.map(entry => {
                                const typeClass = entry.type === 'both'
                                    ? 'text-emerald-300 bg-emerald-900/40 border-emerald-500/40'
                                    : entry.type === 'pos'
                                        ? 'text-cyan-300 bg-cyan-900/40 border-cyan-500/40'
                                        : 'text-rose-300 bg-rose-900/40 border-rose-500/40';
                                const typeLabel = entry.type === 'both'
                                    ? '両方'
                                    : entry.type === 'pos'
                                        ? 'ポジティブ'
                                        : 'ネガティブ';
                                return (
                                    <div
                                        key={entry.id}
                                        className="border border-slate-800 rounded-xl p-3 hover:border-amber-500/40 hover:bg-slate-900 transition-all flex items-start justify-between gap-3"
                                    >
                                        <button
                                            type="button"
                                            onClick={() => applyHistoryEntry(entry)}
                                            className="text-left flex-1"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[10px] px-2 py-0.5 rounded border ${typeClass}`}>{typeLabel}</span>
                                                <span className="text-[10px] text-slate-500">{new Date(entry.createdAt).toLocaleString('ja-JP', { hour12: false })}</span>
                                            </div>
                                            <div className="text-[11px] mt-2 break-words">
                                                {entry.type === 'both' ? (
                                                    <div className="flex flex-col gap-1.5">
                                                        <div className="flex items-start gap-2">
                                                            <span className="text-[10px] text-cyan-300 mt-[2px]">P:</span>
                                                            {renderHistoryTokens(entry.positive)}
                                                        </div>
                                                        <div className="flex items-start gap-2">
                                                            <span className="text-[10px] text-rose-300 mt-[2px]">N:</span>
                                                            {renderHistoryTokens(entry.negative)}
                                                        </div>
                                                    </div>
                                                ) : renderHistoryTokens(entry.type === 'pos' ? entry.positive : entry.negative)}
                                            </div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => removeHistoryEntry(entry.id)}
                                            className="text-slate-500 hover:text-rose-400"
                                            title="削除"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex items-center justify-between mt-4">
                            <button
                                type="button"
                                onClick={() => clearHistoryEntries(historyType)}
                                disabled={filteredHistory.length === 0}
                                className={`px-4 py-2 rounded-lg ${filteredHistory.length === 0
                                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                    }`}
                            >
                                履歴をクリア
                            </button>
                            <button
                                type="button"
                                onClick={() => setHistoryType(null)}
                                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                            >
                                閉じる
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {saveType && renderModal(
                <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        <h3 className="text-lg font-bold mb-4 text-white">お気に入りを保存</h3>
                        <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto pr-1">
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">{saveAsCard ? 'デッキ名' : 'お気に入り名'}</label>
                                <input
                                    type="text"
                                    value={favoriteName}
                                    onChange={(e) => setFavoriteName(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white focus:border-cyan-500 focus:outline-none"
                                    placeholder="(未入力の場合は自動生成)"
                                />
                                {saveAsCard && (
                                    <div className="mt-1 text-[10px] text-amber-300">デッキ名は必須です。</div>
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
                                <span className="text-sm text-slate-300">デッキとして保存</span>
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
                                    ? '編集中のプロンプトは空です。'
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
                            placeholder="フォルダを検索..."
                            className="mb-3 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                        />
                        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-1">
                            {filteredFolderOptions.length === 0 && (
                                <div className="text-xs text-slate-500">該当するフォルダはありません。</div>
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
                                                title={expandedFolderIds.has(option.id) ? '折りたたむ' : '展開'}
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
                                閉じる
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {loadType && renderModal(
                <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        <h3 className="text-lg font-bold mb-4 text-white">お気に入りを読み込み</h3>
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-1">
                            {filteredFavorites.filter(fav => fav.type === loadType).length === 0 && (
                                <div className="text-sm text-slate-500">お気に入りがありません。</div>
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
                                                {jpLabels || 'ラベルなし'}
                                            </div>
                                            <div className="text-[11px] text-slate-500 mt-1">
                                                {loadType === 'positive' ? <span className="text-cyan-400">P:</span> : <span className="text-rose-400">N:</span>} {prompt || '-'}
                                            </div>
                                            {fav.nsfw && (
                                                <div className="text-[10px] text-red-400 mt-1">NSFW含む</div>
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => removePromptFavorite(fav.id)}
                                            className="text-slate-500 hover:text-rose-400"
                                            title="削除"
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
                                閉じる
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {qualityType && renderModal(
                <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        <h3 className="text-lg font-bold mb-4 text-white">品質テンプレート</h3>
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-3 pr-1">
                            {filteredQualityTemplates.filter(template => template.type === qualityType).length === 0 && (
                                <div className="text-sm text-slate-500">品質テンプレートがありません。</div>
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
                                                {jpLabels || 'ラベルなし'}
                                            </div>
                                            <div className="text-[11px] text-slate-500 mt-1">
                                                {qualityType === 'positive' ? <span className="text-cyan-400">P:</span> : <span className="text-rose-400">N:</span>} {prompt || '-'}
                                            </div>
                                            {template.nsfw && (
                                                <div className="text-[10px] text-red-400 mt-1">NSFW含む</div>
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
                                                title="削除"
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
                                選択解除
                            </button>
                            <button
                                type="button"
                                onClick={() => setQualityType(null)}
                                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                            >
                                閉じる
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {cardEditorTarget && editingCardWord && renderModal(
                <div className="fixed inset-0 z-[100] pointer-events-auto flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-bold text-white">デッキ内プロンプトの一時無効</h3>
                                <div className="text-xs text-slate-500">{editingCardWord.label_jp}</div>
                            </div>
                            <button onClick={() => setCardEditorTarget(null)} className="text-slate-400 hover:text-white text-xl">&times;</button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-1">
                            {(!editingCardWord.cardRefs || editingCardWord.cardRefs.length === 0) && (
                                <div className="text-sm text-slate-500">このデッキには調整可能なカードがありません。</div>
                            )}
                            {(editingCardWord.cardRefs ?? []).map(ref => {
                                const isDisabled = (editingCardWord.cardDisabledWordIds ?? []).includes(ref.wordId);
                                const label = ref.label_jp ?? ref.value_en ?? ref.wordId;
                                return (
                                    <button
                                        key={`${editingCardWord.id}:${ref.wordId}`}
                                        type="button"
                                        onClick={() => toggleCardWordEnabled(editingCardWord, cardEditorTarget.type, ref.wordId)}
                                        className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${isDisabled
                                            ? 'border-slate-700 bg-slate-950 text-slate-500'
                                            : 'border-cyan-500/40 bg-cyan-500/10 text-slate-100'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-semibold">{label}</span>
                                            <span className={`text-[10px] px-2 py-0.5 rounded ${isDisabled ? 'bg-slate-800 text-slate-400' : 'bg-cyan-900/60 text-cyan-200'}`}>
                                                {isDisabled ? '無効' : '有効'}
                                            </span>
                                        </div>
                                        {ref.value_en && (
                                            <div className="text-[10px] mt-1 opacity-80">{ref.value_en}</div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex items-center justify-between mt-4 gap-2">
                            <div className="text-[10px] text-slate-500">
                                現在の生成プロンプト: {getCardTokenPrompt(editingCardWord) || '(空)'}
                            </div>
                            <button
                                type="button"
                                onClick={() => setCardEditorTarget(null)}
                                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700"
                            >
                                閉じる
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
                                {expandType === 'positive' ? 'ポジティブプロンプト' : 'ネガティブプロンプト'}
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
                                            <span className="text-slate-600 text-sm italic">カードを選択...</span>
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
                                                onCardEdit={(target, kind) => setCardEditorTarget({ id: target.id, type: kind })}
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
                                閉じる
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {restoreToast && renderModal(
                <div className="fixed right-4 bottom-4 z-[220] max-w-md rounded-xl border border-emerald-500/40 bg-slate-900/95 px-4 py-3 shadow-2xl">
                    <div className="flex items-center gap-3">
                        <div className="text-sm text-emerald-200">{restoreToast}</div>
                        <div className="ml-auto flex items-center gap-2">
                            {restoreUndoSnapshot && (
                                <button
                                    type="button"
                                    onClick={undoRestore}
                                    className="px-2 py-1 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-500"
                                >
                                    元に戻す
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={clearRestoreToast}
                                className="text-slate-400 hover:text-white"
                                title="閉じる"
                            >
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PromptOutput;






