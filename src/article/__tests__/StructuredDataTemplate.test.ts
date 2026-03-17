import fs from 'node:fs';
import path from 'node:path';

describe('head.html review schema conditions', () => {
  const headTemplatePath = path.resolve(__dirname, '../../../layouts/partials/head.html');

  it('requires reviewBody presence before emitting Review schema', () => {
    const template = fs.readFileSync(headTemplatePath, 'utf8');

    expect(template).toContain('{{ $hasReviewBody := ne $reviewBody "" }}');
    expect(template).toContain('{{ if $hasReviewBody }}');
  });

  it('uses safe defaults for review author and datePublished', () => {
    const template = fs.readFileSync(headTemplatePath, 'utf8');

    expect(template).toContain('{{ $reviewAuthor := .Site.Params.defaultReviewAuthor | default "編集部" }}');
    expect(template).toContain('{{ $reviewDatePublished := .Date | time.Format "2006-01-02" }}');
  });
});
