export interface SecaoDoModelo {
  id: string;
  title: string;
  titleEs: string | null;
  body: string;
  bodyEs: string | null;
  required: boolean;
  conditional: boolean;
}

export interface ModeloBase {
  slug: string;
  version: number;
  sections: SecaoDoModelo[];
  sectionOrder: string[];
}
