export const FIELDS = ["物理", "化学", "地学", "生物"] as const;

export type ScienceField = (typeof FIELDS)[number];

export type ArchiveItem = {
  id: string;
  grade: 1 | 2 | 3;
  year: number;
  prefecture: string;
  field: ScienceField;
  unit: string;
  shortUnit: string;
  tags: string[];
  pageCount: number;
  previewPages: string[];
  contentVersion: string;
  pdfUrl: string;
  pdfFileName: string;
  fileSize: number;
};

export type ArchiveData = {
  generatedAt: string;
  releaseTag: string;
  totalItems: number;
  totalPages: number;
  items: ArchiveItem[];
};
