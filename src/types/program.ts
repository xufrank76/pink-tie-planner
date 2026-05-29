export interface ExtraCredential {
  type: 'major' | 'minor' | 'joint' | 'specialization';
  id: string;
  name: string;
}

export interface UserProgram {
  id: string;
  major: string;
  doubleMajor: string | null;
  doubleMajorId: string | null;
  minor: string | null;
  minorId: string | null;
  extras: ExtraCredential[];
  coopStream: '1' | '2' | '3' | '4' | 'none' | null;
  startTerm: string | null;
}
