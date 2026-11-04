import test from "node:test";
import assert from "node:assert/strict";
import { groupCategoryRows } from "../src/components/owner/ops/category-row-layout.ts";

test("few categories stay in a single row and page", () => {
  assert.deepEqual(groupCategoryRows([60, 90, 80], 300), [[[0, 1, 2]]]);
});
test("fills two rows before adding another horizontal page", () => {
  assert.deepEqual(groupCategoryRows([90, 100, 90, 100, 90], 200), [[[0, 1], [2, 3]], [[4]]]);
});
test("uses actual widths and exact gap boundaries", () => {
  assert.deepEqual(groupCategoryRows([72, 120, 65, 127], 200), [[[0, 1], [2, 3]]]);
});
test("reflows for search and narrow screens, preserving reading order", () => {
  const widths = [120, 70, 110, 60, 80, 100];
  for (const width of [800, 300, 150, 80]) {
    const pages = groupCategoryRows(widths, width);
    assert.deepEqual(pages.flat(2), [0, 1, 2, 3, 4, 5]);
    for (const rows of pages) {
      assert.ok(rows.length <= 2);
      for (const row of rows) {
        assert.ok(row.reduce((sum, i) => sum + Math.min(widths[i], width), 0) + (row.length - 1) * 8 <= width);
      }
    }
  }
});
test("handles missing categories and unmeasurable containers", () => {
  assert.deepEqual(groupCategoryRows([], 300), []);
  assert.deepEqual(groupCategoryRows([100], 0), []);
});
