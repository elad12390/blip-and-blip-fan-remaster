// Shelf packing for atlas pages. Space is reclaimed by resetting every page at
// once; surfaces are re-read from native memory lazily after a reset, so the
// working set is what stays resident.
export class ShelfAtlas {
  constructor(pageSize = 2048, maxPages = 6) {
    this.pageSize = pageSize;
    this.maxPages = maxPages;
    this.reset();
  }

  reset() {
    this.pages = [];
    this.generation = (this.generation ?? 0) + 1;
  }

  fits(width, height) { return width <= this.pageSize && height <= this.pageSize; }

  // Returns {page, x, y}, or null when the atlas is full (caller resets).
  allocate(width, height) {
    if (!this.fits(width, height)) throw RangeError(`${width}x${height} exceeds atlas page ${this.pageSize}.`);
    for (let page = 0; page < this.pages.length; page++) {
      const slot = this.place(this.pages[page], width, height);
      if (slot) return { page, ...slot };
    }
    if (this.pages.length >= this.maxPages) return null;
    this.pages.push({ shelves: [], top: 0 });
    return { page: this.pages.length - 1, ...this.place(this.pages.at(-1), width, height) };
  }

  place(page, width, height) {
    // Best-fitting existing shelf by height waste, then a new shelf.
    let best = null;
    for (const shelf of page.shelves) {
      if (shelf.height >= height && shelf.x + width <= this.pageSize && (!best || shelf.height < best.height)) best = shelf;
    }
    if (best) { const x = best.x; best.x += width; return { x, y: best.y }; }
    if (page.top + height > this.pageSize) return null;
    const shelf = { y: page.top, height, x: width };
    page.shelves.push(shelf);
    page.top += height;
    return { x: 0, y: shelf.y };
  }
}
