/** Pack categories in reading order into pages containing at most two rows. */
export function groupCategoryRows(widths: number[], availableWidth: number, gap = 8): number[][][] {
  if (availableWidth <= 0 || !widths.length) return [];
  const pages: number[][][] = [];
  let page: number[][] = [];
  let row: number[] = [];
  let usedWidth = 0;
  widths.forEach((width, index) => {
    const itemWidth = Math.min(width, availableWidth);
    if (row.length && usedWidth + gap + itemWidth > availableWidth) {
      page.push(row);
      row = [];
      usedWidth = 0;
      if (page.length === 2) {
        pages.push(page);
        page = [];
      }
    }
    usedWidth += (row.length ? gap : 0) + itemWidth;
    row.push(index);
  });
  if (row.length) page.push(row);
  if (page.length) pages.push(page);
  return pages;
}
