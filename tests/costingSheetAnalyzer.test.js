import test from 'node:test';
import assert from 'node:assert/strict';
import { findCostingSheet } from '../services/costingSheetAnalyzer.js';

test('findCostingSheet falls back to a likely costing sheet when the preferred name is missing', () => {
  const workbook = {
    SheetNames: ['Summary Sheet', 'AUTO CALCULATION SHEET (2)'],
    Sheets: {
      'Summary Sheet': { '!ref': 'A1:A1' },
      'AUTO CALCULATION SHEET (2)': { '!ref': 'A1:A1' },
    },
  };

  const selected = findCostingSheet(workbook);
  assert.equal(selected, 'AUTO CALCULATION SHEET (2)');
});

test('findCostingSheet uses a normalized name match when the sheet name has extra whitespace', () => {
  const workbook = {
    SheetNames: ['  auto calculation sheet (2)  '],
    Sheets: {
      '  auto calculation sheet (2)  ': { '!ref': 'A1:A1' },
    },
  };

  const selected = findCostingSheet(workbook, 'AUTO CALCULATION SHEET (2)');
  assert.equal(selected, '  auto calculation sheet (2)  ');
});
