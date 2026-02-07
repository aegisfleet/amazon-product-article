
import fs from 'fs';
import path from 'path';
import { CreatorsAPIBrowseNode } from '../src/types/CreatorsAPITypes';
import { CategoryNormalizer } from '../src/utils/CategoryNormalizer';

// Read the debug output from the current directory
const debugOutputPath = path.resolve('tmp', 'debug_output.json');

try {
    const debugOutput = JSON.parse(fs.readFileSync(debugOutputPath, 'utf8'));

    // Extract browse nodes
    const browseNodes: CreatorsAPIBrowseNode[] = [];
    if (debugOutput.itemsResult?.items?.[0]?.browseNodeInfo?.browseNodes) {
        browseNodes.push(...debugOutput.itemsResult.items[0].browseNodeInfo.browseNodes);
    }

    let output = `Found ${browseNodes.length} browse nodes.\n`;

    browseNodes.forEach((node, index) => {
        output += `\n--- Node ${index} ---\n`;
        output += `Input: ${node.displayName} (ID: ${node.id})\n`;

        const normalized = CategoryNormalizer.normalize(node);
        output += `Normalized: Main="${normalized.main}", Sub="${normalized.sub}", Score=${normalized.score}\n`;
    });

    fs.writeFileSync('tmp/normalization_results.txt', output, 'utf8');
    console.log('Results written to tmp/normalization_results.txt');
} catch (error) {
    console.error(`Error reading debug output file at ${debugOutputPath}: ${error}`);
}
