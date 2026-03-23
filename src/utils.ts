import { Nucleotide, Point, SequenceStats } from './types';

export const NUCLEOTIDE_CORNERS: Record<Nucleotide, Point> = {
  A: { x: 0, y: 1 }, // top-left
  T: { x: 1, y: 1 }, // top-right
  G: { x: 1, y: 0 }, // bottom-right
  C: { x: 0, y: 0 }, // bottom-left
};

export const FIXED_PALETTE: Record<string, string> = {
  AA: '#dc2626', AT: '#ea580c', AG: '#d97706', AC: '#ca8a04',
  TA: '#65a30d', TT: '#16a34a', TG: '#059669', TC: '#0891b2',
  GA: '#2563eb', GT: '#4f46e5', GG: '#7c3aed', GC: '#9333ea',
  CA: '#c026d3', CT: '#db2777', CG: '#e11d48', CC: '#475569',
};

export const BASE_COLORS: Record<Nucleotide, string> = {
  A: '#0891b2', // Cyan-600
  T: '#db2777', // Pink-600
  G: '#ca8a04', // Yellow-600
  C: '#059669', // Emerald-600
};

export function cleanDNA(input: string): string {
  return input.toUpperCase().replace(/[^ATGC]/g, '');
}

export function parseFASTA(content: string): string {
  const lines = content.split('\n');
  const sequenceLines = lines.filter(line => !line.startsWith('>'));
  return cleanDNA(sequenceLines.join(''));
}

export function getSequenceStats(sequence: string): SequenceStats {
  const frequencies: Record<Nucleotide, number> = { A: 0, T: 0, G: 0, C: 0 };
  const dinucleotideFrequencies: Record<string, number> = {};

  for (let i = 0; i < sequence.length; i++) {
    const s = sequence[i] as Nucleotide;
    frequencies[s]++;

    if (i > 0) {
      const dinuc = sequence[i - 1] + sequence[i];
      dinucleotideFrequencies[dinuc] = (dinucleotideFrequencies[dinuc] || 0) + 1;
    }
  }

  return {
    length: sequence.length,
    frequencies,
    dinucleotideFrequencies,
  };
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export function blendColors(c1: string, c2: string, weight1: number): string {
  const rgb1 = hexToRgb(c1);
  const rgb2 = hexToRgb(c2);
  if (!rgb1 || !rgb2) return '#000000';

  const weight2 = 1 - weight1;
  const r = Math.round(rgb1.r * weight1 + rgb2.r * weight2);
  const g = Math.round(rgb1.g * weight1 + rgb2.g * weight2);
  const b = Math.round(rgb1.b * weight1 + rgb2.b * weight2);

  return rgbToHex(r, g, b);
}

export function generateRandomDNA(length: number, gcContent: number): string {
  let sequence = '';
  for (let i = 0; i < length; i++) {
    const r = Math.random();
    if (r < gcContent) {
      sequence += Math.random() < 0.5 ? 'G' : 'C';
    } else {
      sequence += Math.random() < 0.5 ? 'A' : 'T';
    }
  }
  return sequence;
}
