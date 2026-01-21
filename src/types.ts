export interface FolderItem {
    id: string;
    name: string;
    parentId: string | null;
    nsfw?: boolean;
}

export interface WordItem {
    id: string;
    folderId: string;
    label_jp: string;
    value_en: string;
    nsfw: boolean;
    tags?: string[];
    note?: string;
    favorite?: boolean;
    templateId?: string;
    templateIds?: string[];
}

export interface TemplateOption {
    id: string;
    label: string;
    value: string;
}

export interface TemplateItem {
    id: string;
    name: string;
    options: TemplateOption[];
    allowFree?: boolean;
    defaultOptionId?: string;
}

export interface DataStore {
    folders: FolderItem[];
    words: WordItem[];
    templates: TemplateItem[];
}

export type PromptStrength = number;

export interface SelectedWord extends WordItem {
    strength: PromptStrength;
    type: 'positive' | 'negative';
}

export interface PromptFavorite {
    id: string;
    name: string;
    type: 'positive' | 'negative';
    words: SelectedWord[];
    nsfw: boolean;
}
