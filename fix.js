const fs = require('fs');
const file = 'data/investigations/B0FF9CCT5N.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

// 減点理由の分割
data.analysis.recommendation.scoreRationale = data.analysis.recommendation.scoreRationale.replace(
  "[減点: -4] (純粋なクエン酸のみを求めるユーザーにとっては不要な成分が含まれる点、40%の割引率表示が常態化している可能性の考慮)",
  "[減点: -2] (純粋なクエン酸のみを求めるユーザーにとっては不要な成分が含まれる点)\n[減点: -2] (40%の割引率表示が常態化している可能性の考慮)"
);

// dimensions, weight の削除
delete data.analysis.technicalSpecs.dimensions;
delete data.analysis.technicalSpecs.weight;

fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
