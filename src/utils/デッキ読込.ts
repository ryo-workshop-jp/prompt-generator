import type { CardItem, FolderItem } from '../types';

// 既存の同一IDは維持し、Exportに同梱された保存先だけを追加する。
export const prepareDeckImport = (existing: FolderItem[], incoming: FolderItem[], cards: CardItem[]) => {
    const folders = new Map(existing.map(folder => [folder.id, folder]));
    for (const folder of incoming) if (!folders.has(folder.id)) folders.set(folder.id, folder);
    const existingIds = new Set(existing.map(folder => folder.id));
    let reparentedFolders = 0;
    for (const [id, folder] of folders) {
        if (existingIds.has(id) || id === 'root') continue;
        if (folder.parentId === null || (folder.parentId !== 'root' && !folders.has(folder.parentId))) {
            folders.set(id, { ...folder, parentId: 'root' });
            reparentedFolders += 1;
        }
    }
    let movedToRoot = 0;
    const nextCards = cards.map(card => {
        if (card.folderId === 'root' || folders.has(card.folderId)) return card;
        // 古いcards単体ファイルでも、見えないデッキを作らずrootから利用できるようにする。
        movedToRoot += 1;
        return { ...card, folderId: 'root' };
    });
    return { folders: [...folders.values()], cards: nextCards, movedToRoot, reparentedFolders };
};
