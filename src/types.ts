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
    cardId?: string;
    cardName?: string;
    cardPrompt?: string;
    cardRefs?: CardWordRef[];
    cardDisabledWordIds?: string[];
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
    spaceEnabled?: boolean;
    position?: 'before' | 'after';
}

export interface DataStore {
    folders: FolderItem[];
    words: WordItem[];
    templates: TemplateItem[];
    cards?: CardItem[];
}

export type PromptStrength = number;

export interface SelectedWord extends WordItem {
    strength: PromptStrength;
    type: 'positive' | 'negative';
    repeat?: number;
}

export interface PromptFavorite {
    id: string;
    name: string;
    type: 'positive' | 'negative';
    words: SelectedWord[];
    nsfw: boolean;
}

export interface CardWordRef {
    wordId: string;
    strength?: PromptStrength;
    repeat?: number;
    label_jp?: string;
    value_en?: string;
    nsfw?: boolean;
    note?: string;
}

export interface CardItem {
    id: string;
    name: string;
    folderId: string;
    type: 'positive' | 'negative';
    words: CardWordRef[];
    nsfw: boolean;
    createdAt?: number;
    templateIds?: string[];
}
