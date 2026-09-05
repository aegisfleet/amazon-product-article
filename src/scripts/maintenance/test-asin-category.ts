import fs from 'node:fs';
import path from 'node:path';
import { CategoryNormalizer } from '../../utils/CategoryNormalizer';

const debugOutputPath = path.resolve('tmp', 'debug_output.json');
try {
  const debugOutput = JSON.parse(fs.readFileSync(debugOutputPath, 'utf8'));
  const item = (debugOutput.itemsResult || debugOutput.response?.itemsResult)?.items?.[0];
  if (!item) {
    console.error('No item found in debug_output.json');
    process.exit(1);
  }

  const nodes = item.browseNodeInfo?.browseNodes || [];
  console.log(`Browse Nodes Found: ${nodes.length}`);
  nodes.forEach((node: any, i: number) => {
    const norm = CategoryNormalizer.normalize(node);
    console.log(
      `${i}: ${node.displayName} (ID: ${node.id}) -> Main: ${norm.main}, Sub: ${norm.sub}, score: ${norm.score}, nameCount: ${norm.nameCount}, rank: ${node.salesRank ?? 'N/A'}`,
    );
  });

  const result = CategoryNormalizer.selectBestCategory(nodes);
  console.log('\nFinal Selection:');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error);
}
