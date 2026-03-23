export type Nucleotide = 'A' | 'T' | 'G' | 'C';

export interface Point {
  x: number;
  y: number;
}

export type ColorMode = 'fixed' | 'mixing' | 'paired';
export type AppMode = 'single' | 'comparison';
export type PointShape = 'circle' | 'square';
export type ProjectionMode = 'square' | 'circular';

export interface VisualizationSettings {
  r: number;
  pointSize: number;
  opacity: number;
  resolution: number;
  colorMode: ColorMode;
  projection: ProjectionMode;
  mixingWeight: number; // 0 to 1
  backgroundColor: string;
  showGrid: boolean;
  showOrigin: boolean;
  autoScale: boolean;
  customColors: Record<string, string>;
  pointShape: PointShape;
  isFilled: boolean;
  hasStroke: boolean;
  animationSpeed: number; // 0 = no animation, >0 = nucleotides per frame
  comparisonColorA: string;
  comparisonColorB: string;
  overlapColor: string;
}

export interface SequenceStats {
  length: number;
  frequencies: Record<Nucleotide, number>;
  dinucleotideFrequencies: Record<string, number>;
}

export type Language = 'en' | 'es';
