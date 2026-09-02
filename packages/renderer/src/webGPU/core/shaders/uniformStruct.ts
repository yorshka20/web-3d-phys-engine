// Byte layout + WGSL declaration of a uniform struct from one ordered field list, so the CPU
// packer and the shader read the same offsets by construction instead of by hand-kept index
// comments. Offsets follow the WGSL uniform address-space rules (WGSL spec §13.4, "Memory
// Layout"): every member sits at the next multiple of its alignment and the struct size is
// rounded up to the struct alignment. The generated declaration lists members in the same
// order, so the shader derives identical offsets from the language rules — no explicit
// padding members are needed.

export type UniformFieldType = 'f32' | 'vec2' | 'vec4';

const FIELD_SIZE: Record<UniformFieldType, number> = { f32: 4, vec2: 8, vec4: 16 };
const FIELD_ALIGN: Record<UniformFieldType, number> = { f32: 4, vec2: 8, vec4: 16 };

const WGSL_TYPE: Record<UniformFieldType, string> = {
  f32: 'f32',
  vec2: 'vec2<f32>',
  vec4: 'vec4<f32>',
};

export interface UniformFieldSpec {
  name: string;
  type: UniformFieldType;
  comment?: string;
}

export type LaidOutField<F extends UniformFieldSpec> = F & { offset: number };

export interface UniformStructLayout<F extends UniformFieldSpec> {
  structName: string;
  fields: readonly LaidOutField<F>[];
  byteSize: number;
  // WGSL `struct <structName> { ... }` declaration
  wgsl: string;
}

function roundUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

export function layoutUniformStruct<F extends UniformFieldSpec>(
  structName: string,
  fields: readonly F[],
  header?: string,
): UniformStructLayout<F> {
  const seen = new Set<string>();
  let cursor = 0;
  let structAlign = 4;
  const laidOut = fields.map((field) => {
    if (seen.has(field.name)) {
      throw new Error(`uniform struct ${structName}: duplicate field "${field.name}"`);
    }
    seen.add(field.name);
    const align = FIELD_ALIGN[field.type];
    structAlign = Math.max(structAlign, align);
    const offset = roundUp(cursor, align);
    cursor = offset + FIELD_SIZE[field.type];
    return { ...field, offset };
  });
  const byteSize = roundUp(cursor, structAlign);

  const lines = laidOut.map((field) => {
    const comment = field.comment ? ` // ${field.comment}` : '';
    return `    ${field.name}: ${WGSL_TYPE[field.type]},${comment}`;
  });
  const headerLines = header ? header.split('\n').map((line) => `// ${line}`.trimEnd()) : [];
  const wgsl = [
    ...headerLines,
    `// Generated from the ${structName} field table (${byteSize} bytes); edit the table, not this text.`,
    `struct ${structName} {`,
    ...lines,
    '}',
  ].join('\n');

  return { structName, fields: laidOut, byteSize, wgsl };
}
