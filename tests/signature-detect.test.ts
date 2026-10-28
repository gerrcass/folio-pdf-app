import { describe, expect, it } from 'vitest';
import { detectSignatureTargetsFromData } from '../src/pdf/signature-detect';

const pageView = [0, 0, 612, 792];

describe('signature field suggestions', () => {
  it('detects an unsigned signature widget before text labels', () => {
    const targets = detectSignatureTargetsFromData(
      [
        {
          id: 'widget-1',
          subtype: 'Widget',
          fieldType: 'Sig',
          fieldName: 'ApplicantSignature',
          rect: [54, 470, 354, 504],
        },
      ],
      [
        {
          str: 'Signature',
          width: 52,
          transform: [10, 0, 0, 10, 54, 520],
        },
      ],
      pageView,
    );
    expect(targets[0].source).toBe('widget');
    expect(targets[0].fieldName).toBe('ApplicantSignature');
    expect(targets[0].quad.p0.y).toBe(470);
    expect(targets[0].quad.p2.y).toBe(504);
    // A nearby label must not create a duplicate suggestion.
    expect(targets).toHaveLength(1);
  });

  it('offers a label-only suggestion when no widget exists', () => {
    const targets = detectSignatureTargetsFromData([], [{ str: 'Sign here', transform: [10, 0, 0, 10, 54, 300] }], pageView);
    expect(targets).toHaveLength(1);
    expect(targets[0].source).toBe('label');
    expect(targets[0].label).toContain('Sign here');
    expect(targets[0].quad.p0.x).toBeGreaterThanOrEqual(0);
    expect(targets[0].quad.p2.x).toBeLessThanOrEqual(612);
  });

  it('ignores ordinary prose and zero-sized widgets', () => {
    const targets = detectSignatureTargetsFromData(
      [{ subtype: 'Widget', fieldType: 'Sig', rect: [10, 10, 10, 10] }],
      [{ str: 'The reader should sign their own copy when ready.', transform: [10, 0, 0, 10, 40, 300] }],
      pageView,
    );
    expect(targets).toHaveLength(0);
  });
});

  it('does not mistake a prose sentence containing the word signature for a field', () => {
    const targets = detectSignatureTargetsFromData(
      [],
      [
        {
          str: 'If a highlight or signature drifts here, geometry is wrong.',
          transform: [10, 0, 0, 10, 70, 370],
        },
      ],
      pageView,
    );
    expect(targets).toHaveLength(0);
  });

  it('does not suggest a widget that already carries a value', () => {
    const targets = detectSignatureTargetsFromData(
      [
        {
          id: 'signed-widget',
          subtype: 'Widget',
          fieldType: 'Sig',
          fieldValue: 'signed-dictionary',
          rect: [54, 470, 354, 504],
        },
      ],
      [],
      pageView,
    );
    expect(targets).toHaveLength(0);
  });
