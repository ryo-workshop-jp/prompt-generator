import type { DataStore } from '../types';
import categoriesData from '../../初期データ.json';

// Type assertion is needed because JSON imports are treated as inferred types
export const initialData: DataStore = categoriesData as unknown as DataStore;
