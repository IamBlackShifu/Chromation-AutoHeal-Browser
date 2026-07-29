export type ExportFormat = 'csv' | 'json' | 'excel';
export type FieldType = 'string' | 'number' | 'boolean' | 'date';
export interface FieldMapping {
  name: string;
  selector?: string;
  attribute?: string;
  type?: FieldType;
  trim?: boolean;
}
export interface ScrapingConfig {
  selector: string;
  fields: Array<string | FieldMapping>;
  pagination: boolean;
  infiniteScroll: boolean;
  maxPages?: number;
  maxRecords?: number;
  nextSelector?: string;
  deduplicateBy?: string[];
}
export interface ScrapedData {
  records: Record<string, unknown>[];
  timestamp: number;
  source: string;
  partial?: boolean;
  pagesProcessed?: number;
}
export interface ScrapingPage {
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
  click?(selector: string): Promise<void>;
  waitForTimeout?(milliseconds: number): Promise<void>;
}
export interface ScrapeProgress { pages: number; records: number; done: boolean; partial: boolean; }

export class ScraperStudio {
  private isActive = false;
  private scrapedData: ScrapedData | null = null;
  private controller: AbortController | null = null;
  private progress: ScrapeProgress = { pages: 0, records: 0, done: false, partial: false };

  constructor() { console.log('Scraper Studio initialized'); }
  startScraping(): void { this.isActive = true; }
  stopScraping(): void { this.isActive = false; this.controller?.abort(); }
  cancel(): boolean {
    if (!this.controller) return false;
    this.controller.abort();
    return true;
  }
  getProgress(): ScrapeProgress { return { ...this.progress }; }
  ingestData(records: Record<string, unknown>[], source = 'embedded-webview'): ScrapedData {
    this.scrapedData = { records: records.slice(0, 10_000), timestamp: Date.now(), source };
    this.progress = { pages: 1, records: this.scrapedData.records.length, done: true, partial: false };
    return this.scrapedData;
  }

  async scrapeTable(config: ScrapingConfig, page?: ScrapingPage): Promise<ScrapedData> {
    if (!page) throw new Error('A browser page adapter is required for extraction');
    this.controller = new AbortController();
    this.isActive = true;
    this.progress = { pages: 0, records: 0, done: false, partial: false };
    const records: Record<string, unknown>[] = [];
    const maxPages = Math.max(1, config.maxPages ?? 1);
    const maxRecords = Math.max(1, config.maxRecords ?? 10_000);
    const fields = config.fields.map((field) => typeof field === 'string' ? { name: field } : field);
    try {
      for (let pageIndex = 0; pageIndex < maxPages && records.length < maxRecords; pageIndex++) {
        if (this.controller.signal.aborted) break;
        const batch = await page.evaluate(({ rowSelector, mappings }) => {
          return Array.from(document.querySelectorAll(rowSelector)).map((row) => {
            const output: Record<string, unknown> = {};
            for (const mapping of mappings) {
              const target = mapping.selector ? row.querySelector(mapping.selector) : row;
              output[mapping.name] = mapping.attribute
                ? target?.getAttribute(mapping.attribute) ?? ''
                : target?.textContent ?? '';
            }
            return output;
          });
        }, { rowSelector: config.selector, mappings: fields });
        records.push(...batch.map((record) => this.cleanRecord(record, fields)));
        this.progress = { pages: pageIndex + 1, records: records.length, done: false, partial: false };
        if (!config.pagination && !config.infiniteScroll) break;
        if (config.pagination) {
          if (!config.nextSelector || !page.click) break;
          await page.click(config.nextSelector);
        } else if (config.infiniteScroll) {
          await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); }, undefined);
        }
        await page.waitForTimeout?.(300);
      }
    } finally {
      const partial = Boolean(this.controller?.signal.aborted);
      const deduped = this.deduplicate(records.slice(0, maxRecords), config.deduplicateBy);
      this.scrapedData = {
        records: deduped, timestamp: Date.now(), source: config.selector,
        partial, pagesProcessed: this.progress.pages,
      };
      this.progress = { pages: this.progress.pages, records: deduped.length, done: true, partial };
      this.controller = null;
      this.isActive = false;
    }
    return this.scrapedData;
  }

  async handlePagination(config: ScrapingConfig, page?: ScrapingPage): Promise<void> {
    if (config.pagination && config.nextSelector && page?.click) await page.click(config.nextSelector);
  }
  async handleInfiniteScroll(page?: ScrapingPage): Promise<void> {
    if (page) await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); }, undefined);
  }
  async exportData(format: ExportFormat): Promise<string> {
    if (!this.scrapedData) return '';
    if (format === 'json') return JSON.stringify(this.scrapedData.records, null, 2);
    const columns = [...new Set(this.scrapedData.records.flatMap((record) => Object.keys(record)))];
    if (format === 'csv') {
      const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      return [columns.map(quote).join(','), ...this.scrapedData.records.map((record) =>
        columns.map((column) => quote(record[column])).join(',')
      )].join('\r\n');
    }
    const xml = (value: unknown) => String(value ?? '').replace(/[&<>"]/g, (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char);
    const rows = [columns, ...this.scrapedData.records.map((record) => columns.map((column) => record[column]))];
    return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Data" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Table>${rows.map((row) =>
      `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${xml(cell)}</Data></Cell>`).join('')}</Row>`
    ).join('')}</Table></Worksheet></Workbook>`;
  }
  clearData(): void { this.scrapedData = null; }
  isScraperActive(): boolean { return this.isActive; }
  private cleanRecord(record: Record<string, unknown>, fields: FieldMapping[]): Record<string, unknown> {
    return Object.fromEntries(fields.map((field) => {
      const raw = String(record[field.name] ?? '');
      const value = field.trim === false ? raw : raw.trim();
      if (field.type === 'number') return [field.name, Number(value)];
      if (field.type === 'boolean') return [field.name, /^(true|yes|1)$/i.test(value)];
      if (field.type === 'date') return [field.name, new Date(value).toISOString()];
      return [field.name, value];
    }));
  }
  private deduplicate(records: Record<string, unknown>[], keys?: string[]): Record<string, unknown>[] {
    if (!keys?.length) return records;
    const seen = new Set<string>();
    return records.filter((record) => {
      const identity = JSON.stringify(keys.map((key) => record[key]));
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }
}
