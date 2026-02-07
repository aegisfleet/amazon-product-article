
import fs from 'fs';
import path from 'path';
import { CreatorsAPIBrowseNode } from '../src/types/CreatorsAPITypes';
import { CategoryNormalizer } from '../src/utils/CategoryNormalizer';

// Read the debug output from the current directory
const debugOutputPath = path.resolve('debug_output.json');

try {
    const debugOutput = JSON.parse(fs.readFileSync(debugOutputPath, 'utf8'));

    // Extract browse nodes
    const browseNodes: CreatorsAPIBrowseNode[] = [];
    if (debugOutput.itemsResult?.items?.[0]?.browseNodeInfo?.browseNodes) {
        browseNodes.push(...debugOutput.itemsResult.items[0].browseNodeInfo.browseNodes);
    }

    console.log(`Found ${browseNodes.length} browse nodes.`);

    browseNodes.forEach((node, index) => {
        console.log(`\n--- Node ${index} ---`);
        console.log(`Input: ${node.displayName} (ID: ${node.id})`);

        const normalized = CategoryNormalizer.normalize(node);
        console.log(`Normalized: Main="${normalized.main}", Sub="${normalized.sub}", Score=${normalized.score}`);
    });
} catch (error) {
    console.error(`Error reading debug output file at ${debugOutputPath}: ${error}`);
}
