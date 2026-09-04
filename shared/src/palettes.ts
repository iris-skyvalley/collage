import type { ThemeId } from './constants.ts';

/** Ink sets per theme. Index 0 is the darkest line colour, last is nearest paper. */
export const THEME_INKS: Record<ThemeId, string[]> = {
  herbarium: ['#2a2a1e', '#4b5d3a', '#7d8f52', '#a8a06a', '#c8b38a', '#8c3b2b'],
  cartography: ['#1d2733', '#2f5d75', '#5f8ea3', '#a9c2c9', '#c8a24a', '#8e3f2f'],
  ephemera: ['#241f1b', '#7a3b2e', '#b8642f', '#cbb08a', '#4d5f6b', '#a8324a'],
  typography: ['#141414', '#2e2e2e', '#5a5a5a', '#8f8a80', '#c0392b', '#b8ac96'],
  cosmos: ['#0c1020', '#1f3357', '#4a6fa5', '#8fa8cc', '#d9c27a', '#a8536b'],
  marginalia: ['#1b1b1b', '#3a3226', '#6b5b45', '#9b8b70', '#8c2f2f', '#3d5a6b'],
};

/** The tint the fragment's own paper takes, before any substrate sits behind it. */
export const THEME_PAPER: Record<ThemeId, string[]> = {
  herbarium: ['#f2ecdc', '#e8dfc7', '#efe9d8'],
  cartography: ['#f0ece0', '#e6e8e2', '#f4f1e6'],
  ephemera: ['#f3e8d6', '#eadcc4', '#f6efe2'],
  typography: ['#f6f4ef', '#ece9e1', '#fbfaf6'],
  cosmos: ['#e9e6ea', '#dfe0e8', '#f2f0f2'],
  marginalia: ['#f4efe3', '#eae3d3', '#f8f4ea'],
};
