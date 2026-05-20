import fs from 'node:fs';
import path from 'node:path';

describe('head.html simplified SEO template', () => {
  const headTemplatePath = path.resolve(__dirname, '../../../layouts/partials/head.html');

  it('contains simplified robots meta tags', () => {
    const template = fs.readFileSync(headTemplatePath, 'utf8');

    expect(template).toContain('{{- if .Params.noindex -}}');
    expect(template).toContain('<meta name="robots" content="noindex, follow">');
    expect(template).toContain('<meta name="robots" content="index, follow">');
  });

  it('contains simple meta description fallback', () => {
    const template = fs.readFileSync(headTemplatePath, 'utf8');

    expect(template).toContain(
      '{{- $metaDescription := .Description | default .Summary | default .Site.Params.description -}}',
    );
  });

  it('retains WebSite and BreadcrumbList schemas but no Product schema', () => {
    const template = fs.readFileSync(headTemplatePath, 'utf8');

    expect(template).toContain('"@type" "WebSite"');
    expect(template).toContain('"@type" "BreadcrumbList"');
    expect(template).not.toContain('"@type" "Product"');
    expect(template).not.toContain('"@type" "FAQPage"');
  });
});
