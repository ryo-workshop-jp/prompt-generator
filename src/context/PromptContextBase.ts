import { createContext } from 'react';
import type { DataStore, FolderItem, SelectedWord, PromptStrength, WordItem, PromptFavorite, TemplateItem } from '../types';

export interface PromptContextType {
    folders: FolderItem[];
    words: WordItem[];
    selectedPositive: SelectedWord[];
    selectedNegative: SelectedWord[];
    favorites: PromptFavorite[];
    qualityTemplates: PromptFavorite[];
    templates: TemplateItem[];
    nsfwEnabled: boolean;
    showDescendantWords: boolean;
    autoNsfwOn: boolean;
    toggleNsfw: () => void;
    toggleShowDescendantWords: () => void;
    toggleAutoNsfwOn: () => void;
    addWord: (word: WordItem, type: 'positive' | 'negative', strength?: PromptStrength) => void;
    removeWord: (id: string, type: 'positive' | 'negative') => void;
    updateWordStrength: (id: string, type: 'positive' | 'negative', strength: PromptStrength) => void;
    toggleFavorite: (id: string) => void;
    addPromptFavorite: (name: string, type: 'positive' | 'negative', words: SelectedWord[], nsfw: boolean) => void;
    applyPromptFavorite: (favorite: PromptFavorite) => void;
    removePromptFavorite: (id: string) => void;
    addQualityTemplate: (name: string, type: 'positive' | 'negative', words: SelectedWord[], nsfw: boolean) => void;
    removeQualityTemplate: (id: string) => void;
    selectQualityTemplate: (type: 'positive' | 'negative', id: string | null) => void;
    selectedQualityTemplateIds: { positive: string | null; negative: string | null };
    clearPositive: () => void;
    clearNegative: () => void;
    undo: () => void;
    canUndo: boolean;
    clearAll: () => void;
    reorderSelected: (type: 'positive' | 'negative', ordered: SelectedWord[]) => void;
    addWordToFolder: (folderId: string, newWord: WordItem) => void;
    addFolder: (name: string, id: string, parentId: string, nsfw?: boolean) => void;
    addTemplate: (template: TemplateItem) => void;
    updateTemplate: (template: TemplateItem) => void;
    removeTemplate: (id: string) => void;
    setData: (data: DataStore) => void;
    saveChanges: () => Promise<boolean>;
    hasUnsavedChanges: boolean;
}

export const PromptContext = createContext<PromptContextType | undefined>(undefined);
