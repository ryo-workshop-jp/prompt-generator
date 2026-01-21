import React, { useEffect, useState, type ReactNode } from 'react';
import type { DataStore, SelectedWord, PromptStrength, WordItem, PromptFavorite, TemplateItem } from '../types';
import { initialData } from '../data/initialData';
import { PromptContext } from './PromptContextBase';

const STORAGE_KEY = 'promptgen:data';
const UI_STORAGE_KEY = 'promptgen:ui';
const FAVORITES_KEY = 'promptgen:favorites';
const QUALITY_KEY = 'promptgen:quality-templates';
const QUALITY_SELECTION_KEY = 'promptgen:quality-selection';

const readUiSettings = () => {
    try {
        const stored = localStorage.getItem(UI_STORAGE_KEY);
        if (!stored) return {};
        return JSON.parse(stored) as {
            showDescendantWords?: boolean;
            autoNsfwOn?: boolean;
            nsfwEnabled?: boolean;
            collapseInactiveFolders?: boolean;
        };
    } catch (e) {
        console.warn('Failed to load UI settings, using defaults.', e);
        return {};
    }
};

const writeUiSettings = (updates: {
    showDescendantWords?: boolean;
    autoNsfwOn?: boolean;
    nsfwEnabled?: boolean;
    collapseInactiveFolders?: boolean;
}) => {
    try {
        const current = readUiSettings();
        localStorage.setItem(UI_STORAGE_KEY, JSON.stringify({ ...current, ...updates }));
    } catch (e) {
        console.warn('Failed to save UI settings.', e);
    }
};

const normalizeDataStore = (input: Partial<DataStore>): DataStore => {
    return {
        folders: Array.isArray(input.folders) ? input.folders : [],
        words: Array.isArray(input.words) ? input.words : [],
        templates: Array.isArray(input.templates) ? input.templates : []
    };
};

const normalizeFavoritesList = (input: unknown): PromptFavorite[] => {
    if (!Array.isArray(input)) return [];
    return input.reduce<PromptFavorite[]>((acc, entry) => {
        if (!entry || typeof entry !== 'object') return acc;
        const candidate = entry as PromptFavorite;
        if (!candidate.id || !candidate.name) return acc;
        if (candidate.type !== 'positive' && candidate.type !== 'negative') return acc;
        if (!Array.isArray(candidate.words)) return acc;
        const nsfw = typeof candidate.nsfw === 'boolean'
            ? candidate.nsfw
            : candidate.words.some(word => word.nsfw);
        acc.push({ ...candidate, nsfw });
        return acc;
    }, []);
};

const ensureUniqueFolderIds = (input: DataStore): DataStore => {
    const used = new Set<string>();
    const counters = new Map<string, number>();
    const firstIdMap = new Map<string, string>();
    let changed = false;

    const foldersWithIds = input.folders.map(folder => {
        const baseId = folder.id;
        const count = counters.get(baseId) ?? 0;
        let candidate = count === 0 ? baseId : `${baseId}_${count}`;
        counters.set(baseId, count + 1);
        while (used.has(candidate)) {
            const nextCount = counters.get(baseId) ?? 1;
            candidate = `${baseId}_${nextCount}`;
            counters.set(baseId, nextCount + 1);
        }
        used.add(candidate);
        if (!firstIdMap.has(baseId)) firstIdMap.set(baseId, candidate);
        if (candidate !== baseId) changed = true;
        return { ...folder, id: candidate };
    });

    const normalizedFolders = foldersWithIds.map(folder => {
        if (!folder.parentId) return folder;
        const mappedParent = firstIdMap.get(folder.parentId) ?? folder.parentId;
        if (mappedParent === folder.parentId) return folder;
        changed = true;
        return { ...folder, parentId: mappedParent };
    });

    const normalizedWords = input.words.map(word => {
        const mappedFolder = firstIdMap.get(word.folderId) ?? word.folderId;
        if (mappedFolder === word.folderId) return word;
        changed = true;
        return { ...word, folderId: mappedFolder };
    });

    if (!changed) return input;
    return { folders: normalizedFolders, words: normalizedWords, templates: input.templates };
};

export const PromptProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [data, setDataState] = useState<DataStore>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as Partial<DataStore>;
                const normalized = normalizeDataStore(parsed);
                if (normalized.folders.length > 0 || normalized.words.length > 0 || normalized.templates.length > 0) {
                    return ensureUniqueFolderIds(normalized);
                }
            }
        } catch (e) {
            console.warn('Failed to load local data, falling back to defaults.', e);
        }
        return ensureUniqueFolderIds(normalizeDataStore(initialData));
    });
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
    const [undoData, setUndoData] = useState<DataStore | null>(null);

    const [selectedPositive, setSelectedPositive] = useState<SelectedWord[]>([]);
    const [selectedNegative, setSelectedNegative] = useState<SelectedWord[]>([]);
    const [favorites, setFavorites] = useState<PromptFavorite[]>(() => {
        try {
            const stored = localStorage.getItem(FAVORITES_KEY);
            if (!stored) return [];
            const parsed = JSON.parse(stored) as Array<PromptFavorite | { id: string; name: string; positive: SelectedWord[]; negative: SelectedWord[] }>;
            if (!Array.isArray(parsed)) return [];
            const normalized: PromptFavorite[] = [];
            for (const entry of parsed) {
                if ('words' in entry && (entry.type === 'positive' || entry.type === 'negative')) {
                    normalized.push({ ...entry, nsfw: entry.nsfw ?? false });
                    continue;
                }
                if ('positive' in entry && 'negative' in entry) {
                    if (entry.positive.length > 0) {
                        normalized.push({
                            id: `${entry.id}_pos`,
                            name: `${entry.name} (Positive)`,
                            type: 'positive',
                            words: entry.positive,
                            nsfw: entry.positive.some(word => word.nsfw)
                        });
                    }
                    if (entry.negative.length > 0) {
                        normalized.push({
                            id: `${entry.id}_neg`,
                            name: `${entry.name} (Negative)`,
                            type: 'negative',
                            words: entry.negative,
                            nsfw: entry.negative.some(word => word.nsfw)
                        });
                    }
                }
            }
            return normalized;
        } catch (e) {
            console.warn('Failed to load favorites, using defaults.', e);
            return [];
        }
    });
    const [qualityTemplates, setQualityTemplates] = useState<PromptFavorite[]>(() => {
        try {
            const stored = localStorage.getItem(QUALITY_KEY);
            if (!stored) return [];
            const parsed = JSON.parse(stored) as PromptFavorite[];
            return normalizeFavoritesList(parsed);
        } catch (e) {
            console.warn('Failed to load quality templates, using defaults.', e);
            return [];
        }
    });
    const [selectedQualityTemplateIds, setSelectedQualityTemplateIds] = useState<{ positive: string | null; negative: string | null }>(() => {
        try {
            const stored = localStorage.getItem(QUALITY_SELECTION_KEY);
            if (!stored) return { positive: null, negative: null };
            const parsed = JSON.parse(stored) as { positive?: string | null; negative?: string | null };
            return {
                positive: parsed.positive ?? null,
                negative: parsed.negative ?? null
            };
        } catch (e) {
            console.warn('Failed to load quality selection, using defaults.', e);
            return { positive: null, negative: null };
        }
    });
    const [nsfwEnabled, setNsfwEnabled] = useState<boolean>(() => {
        const parsed = readUiSettings();
        return parsed.nsfwEnabled ?? false;
    });
    const [showDescendantWords, setShowDescendantWords] = useState<boolean>(() => {
        const parsed = readUiSettings();
        return parsed.showDescendantWords ?? false;
    });
    const [autoNsfwOn, setAutoNsfwOn] = useState<boolean>(() => {
        const parsed = readUiSettings();
        return parsed.autoNsfwOn ?? false;
    });
    const [collapseInactiveFolders, setCollapseInactiveFolders] = useState<boolean>(() => {
        const parsed = readUiSettings();
        return parsed.collapseInactiveFolders ?? true;
    });

    const saveToStorage = async (currentData: DataStore) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentData));
            console.log('Saved to localStorage');
            return true;
        } catch (e) {
            console.error('Failed to save to localStorage', e);
            return false;
        }
    };

    const setData = (nextData: DataStore) => {
        const normalized = ensureUniqueFolderIds(normalizeDataStore(nextData));
        setDataState(prev => {
            setUndoData(prev);
            return normalized;
        });
        setHasUnsavedChanges(true);
    };

    const updateData = (updater: (prev: DataStore) => DataStore) => {
        setDataState(prev => {
            setUndoData(prev);
            return updater(prev);
        });
        setHasUnsavedChanges(true);
    };

    const toggleNsfw = () => {
        setNsfwEnabled(prev => {
            const next = !prev;
            writeUiSettings({ nsfwEnabled: next });
            return next;
        });
    };
    const toggleShowDescendantWords = () => {
        setShowDescendantWords(prev => {
            const next = !prev;
            writeUiSettings({ showDescendantWords: next });
            return next;
        });
    };
    const toggleAutoNsfwOn = () => {
        setAutoNsfwOn(prev => {
            const next = !prev;
            writeUiSettings({ autoNsfwOn: next });
            return next;
        });
    };
    const toggleCollapseInactiveFolders = () => {
        setCollapseInactiveFolders(prev => {
            const next = !prev;
            writeUiSettings({ collapseInactiveFolders: next });
            return next;
        });
    };

    const addWordToFolder = (folderId: string, newWord: WordItem) => {
        updateData(prev => ({
            ...prev,
            words: [...prev.words, { ...newWord, folderId }]
        }));
    };

    const addFolder = (name: string, id: string, parentId: string, nsfw: boolean = false) => {
        updateData(prev => {
            const used = new Set(prev.folders.map(folder => folder.id));
            let candidate = id;
            let counter = 1;
            while (used.has(candidate)) {
                candidate = `${id}_${counter}`;
                counter += 1;
            }
            return {
                ...prev,
                folders: [...prev.folders, { id: candidate, name, parentId, nsfw }]
            };
        });
    };

    const addTemplate = (template: TemplateItem) => {
        updateData(prev => ({
            ...prev,
            templates: [...prev.templates, template]
        }));
    };

    const updateTemplate = (template: TemplateItem) => {
        updateData(prev => ({
            ...prev,
            templates: prev.templates.map(item => item.id === template.id ? template : item)
        }));
    };

    const removeTemplate = (id: string) => {
        updateData(prev => ({
            ...prev,
            templates: prev.templates.filter(item => item.id !== id),
            words: prev.words.map(word => {
                if (word.templateId !== id && !(word.templateIds ?? []).includes(id)) return word;
                const nextTemplateIds = (word.templateIds ?? []).filter(item => item !== id);
                return {
                    ...word,
                    templateId: word.templateId === id ? undefined : word.templateId,
                    templateIds: nextTemplateIds.length > 0 ? nextTemplateIds : undefined
                };
            })
        }));
    };

    const addWord = (word: WordItem, type: 'positive' | 'negative', strength: PromptStrength = 1.0) => {
        const newWord: SelectedWord = { ...word, type, strength };
        if (type === 'positive') {
            if (!selectedPositive.some(w => w.id === word.id)) {
                setSelectedPositive([...selectedPositive, newWord]);
            }
        } else {
            if (!selectedNegative.some(w => w.id === word.id)) {
                setSelectedNegative([...selectedNegative, newWord]);
            }
        }
    };

    const removeWord = (id: string, type: 'positive' | 'negative') => {
        const nsfwWord = getNsfwWord();
        if (type === 'positive' && nsfwEnabled && autoNsfwOn && id === nsfwWord.id) {
            return;
        }
        if (type === 'positive') {
            setSelectedPositive(selectedPositive.filter(w => w.id !== id));
        } else {
            setSelectedNegative(selectedNegative.filter(w => w.id !== id));
        }
    };

    const updateWordStrength = (id: string, type: 'positive' | 'negative', strength: PromptStrength) => {
        if (type === 'positive') {
            setSelectedPositive(selectedPositive.map(w => w.id === id ? { ...w, strength } : w));
        } else {
            setSelectedNegative(selectedNegative.map(w => w.id === id ? { ...w, strength } : w));
        }
    };

    const toggleFavorite = (id: string) => {
        updateData(prev => ({
            ...prev,
            words: prev.words.map(word => word.id === id ? { ...word, favorite: !word.favorite } : word)
        }));
    };

    const addPromptFavorite = (name: string, type: 'positive' | 'negative', words: SelectedWord[], nsfw: boolean) => {
        const payload: PromptFavorite = {
            id: Date.now().toString(),
            name,
            type,
            words: words.map(word => ({ ...word, type })),
            nsfw
        };
        setFavorites(prev => {
            const next = [payload, ...prev];
            try {
                localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
            } catch (e) {
                console.warn('Failed to save favorites.', e);
            }
            return next;
        });
    };

    const setFavoritesData = (items: PromptFavorite[]) => {
        const normalized = normalizeFavoritesList(items);
        setFavorites(normalized);
        try {
            localStorage.setItem(FAVORITES_KEY, JSON.stringify(normalized));
        } catch (e) {
            console.warn('Failed to save favorites.', e);
        }
    };

    const addQualityTemplate = (name: string, type: 'positive' | 'negative', words: SelectedWord[], nsfw: boolean) => {
        const payload: PromptFavorite = {
            id: Date.now().toString(),
            name,
            type,
            words: words.map(word => ({ ...word, type })),
            nsfw
        };
        setQualityTemplates(prev => {
            const next = [payload, ...prev];
            try {
                localStorage.setItem(QUALITY_KEY, JSON.stringify(next));
            } catch (e) {
                console.warn('Failed to save quality templates.', e);
            }
            return next;
        });
    };

    const applyPromptFavorite = (favorite: PromptFavorite) => {
        if (favorite.type === 'positive') {
            setSelectedPositive(favorite.words.map(word => ({ ...word, type: 'positive' })));
        } else {
            setSelectedNegative(favorite.words.map(word => ({ ...word, type: 'negative' })));
        }
    };

    const removePromptFavorite = (id: string) => {
        setFavorites(prev => {
            const next = prev.filter(fav => fav.id !== id);
            try {
                localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
            } catch (e) {
                console.warn('Failed to save favorites.', e);
            }
            return next;
        });
    };

    const setQualityTemplatesData = (items: PromptFavorite[]) => {
        const normalized = normalizeFavoritesList(items);
        setQualityTemplates(normalized);
        try {
            localStorage.setItem(QUALITY_KEY, JSON.stringify(normalized));
        } catch (e) {
            console.warn('Failed to save quality templates.', e);
        }
        setSelectedQualityTemplateIds(prev => {
            const ids = new Set(normalized.map(template => template.id));
            const next = {
                positive: prev.positive && ids.has(prev.positive) ? prev.positive : null,
                negative: prev.negative && ids.has(prev.negative) ? prev.negative : null
            };
            if (next.positive === prev.positive && next.negative === prev.negative) return prev;
            try {
                localStorage.setItem(QUALITY_SELECTION_KEY, JSON.stringify(next));
            } catch (e) {
                console.warn('Failed to save quality selection.', e);
            }
            return next;
        });
    };

    const removeQualityTemplate = (id: string) => {
        setQualityTemplates(prev => {
            const next = prev.filter(template => template.id !== id);
            try {
                localStorage.setItem(QUALITY_KEY, JSON.stringify(next));
            } catch (e) {
                console.warn('Failed to save quality templates.', e);
            }
            return next;
        });
        setSelectedQualityTemplateIds(prev => {
            if (prev.positive !== id && prev.negative !== id) return prev;
            const next = {
                positive: prev.positive === id ? null : prev.positive,
                negative: prev.negative === id ? null : prev.negative
            };
            try {
                localStorage.setItem(QUALITY_SELECTION_KEY, JSON.stringify(next));
            } catch (e) {
                console.warn('Failed to save quality selection.', e);
            }
            return next;
        });
    };

    const selectQualityTemplate = (type: 'positive' | 'negative', id: string | null) => {
        setSelectedQualityTemplateIds(prev => {
            const next = { ...prev, [type]: id };
            try {
                localStorage.setItem(QUALITY_SELECTION_KEY, JSON.stringify(next));
            } catch (e) {
                console.warn('Failed to save quality selection.', e);
            }
            return next;
        });
    };

    const reorderSelected = (type: 'positive' | 'negative', ordered: SelectedWord[]) => {
        if (type === 'positive') {
            setSelectedPositive(ordered);
        } else {
            setSelectedNegative(ordered);
        }
    };

    const undo = () => {
        if (!undoData) return;
        setDataState(undoData);
        setUndoData(null);
        setHasUnsavedChanges(true);
    };

    const getNsfwWord = React.useCallback(() => {
        const found = data.words.find(word => {
            const id = word.id?.toLowerCase();
            const jp = word.label_jp?.toLowerCase();
            const en = word.value_en?.toLowerCase();
            return id === 'nsfw' || jp === 'nsfw' || en === 'nsfw';
        });
        if (found) return found;
        return {
            id: '__auto_nsfw__',
            folderId: 'root',
            label_jp: 'NSFW',
            value_en: 'nsfw',
            nsfw: true
        };
    }, [data.words]);

    const clearAll = () => {
        if (nsfwEnabled && autoNsfwOn) {
            const nsfwWord = getNsfwWord();
            setSelectedPositive([{ ...nsfwWord, type: 'positive', strength: 1.0 }]);
            setSelectedNegative([]);
            return;
        }
        setSelectedPositive([]);
        setSelectedNegative([]);
    };

    const clearPositive = () => {
        if (nsfwEnabled && autoNsfwOn) {
            const nsfwWord = getNsfwWord();
            setSelectedPositive([{ ...nsfwWord, type: 'positive', strength: 1.0 }]);
            return;
        }
        setSelectedPositive([]);
    };

    const clearNegative = () => {
        setSelectedNegative([]);
    };

    useEffect(() => {
        const nsfwWord = getNsfwWord();

        const shouldPositive = nsfwEnabled && autoNsfwOn;

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedPositive(prev => {
            if (!shouldPositive) return prev.filter(w => w.id !== nsfwWord.id);
            if (prev.some(w => w.id === nsfwWord.id)) return prev;
            return [...prev, { ...nsfwWord, type: 'positive', strength: 1.0 }];
        });
    }, [autoNsfwOn, getNsfwWord, nsfwEnabled]);

    useEffect(() => {
        if (!hasUnsavedChanges) return;
        saveToStorage(data).then(ok => {
            if (ok) setHasUnsavedChanges(false);
        });
    }, [data, hasUnsavedChanges]);

    return (
        <PromptContext.Provider value={{
            folders: data.folders,
            words: data.words,
            templates: data.templates,
            selectedPositive,
            selectedNegative,
            favorites,
            qualityTemplates,
            nsfwEnabled,
            showDescendantWords,
            autoNsfwOn,
            collapseInactiveFolders,
            toggleNsfw,
            toggleShowDescendantWords,
            toggleAutoNsfwOn,
            toggleCollapseInactiveFolders,
            addWord,
            removeWord,
            updateWordStrength,
            toggleFavorite,
            addPromptFavorite,
            applyPromptFavorite,
            removePromptFavorite,
            setFavoritesData,
            addQualityTemplate,
            removeQualityTemplate,
            setQualityTemplatesData,
            selectQualityTemplate,
            selectedQualityTemplateIds,
            clearPositive,
            clearNegative,
            undo,
            canUndo: !!undoData,
            clearAll,
            reorderSelected,
            addWordToFolder,
            addFolder,
            addTemplate,
            updateTemplate,
            removeTemplate,
            setData
        }}>
            {children}
        </PromptContext.Provider>
    );
};


