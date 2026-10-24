import { describe, expect, it } from 'vitest';
import { parseSseBlock } from './stream';

describe('parseSseBlock', () => {
  it('parses a data block', () => {
    const e = parseSseBlock('id: 3\nevent: agent.started\ndata: {"seq":3,"type":"agent.started"}');
    expect(e?.seq).toBe(3);
    expect(e?.type).toBe('agent.started');
  });
  it('ignores comments and malformed data', () => {
    expect(parseSseBlock(': keep-alive')).toBeNull();
    expect(parseSseBlock('retry: 2000')).toBeNull();
    expect(parseSseBlock('data: {not json')).toBeNull();
  });
});
