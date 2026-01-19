
import * as fs from 'fs';
import * as path from 'path';
import { ArticleGenerator } from '../src/article/ArticleGenerator';
import { InvestigationResult } from '../src/types/JulesTypes';
import { Product } from '../src/types/Product';

const main = async () => {
    const jsonPath = path.join(__dirname, '../data/investigations/B0D6YF4LNL.json');
    if (!fs.existsSync(jsonPath)) {
        console.error(`File not found: ${jsonPath}`);
        return;
    }
    const rawData = fs.readFileSync(jsonPath, 'utf-8');
    const investigationData = JSON.parse(rawData);

    // Mock Product
    const product: Product = {
        asin: "B0D6YF4LNL",
        title: "Sony Xperia 10 VI",
        category: "スマートフォン本体",
        price: {
            amount: 53900,
            currency: "JPY",
            formatted: "￥53,900"
        },
        images: {
            primary: "https://m.media-amazon.com/images/I/31Ne5f81ovL._SL500_.jpg",
            thumbnails: []
        },
        specifications: {},
        rating: {
            average: 4.0,
            count: 100
        }
    };

    // Construct full InvestigationResult if the JSON is partial
    const investigation: InvestigationResult = {
        sessionId: "test-session",
        product: product,
        analysis: investigationData.analysis ? investigationData.analysis : investigationData,
        generatedAt: new Date()
    };

    // Ensure technicalSpecs is present
    if (!investigation.analysis.technicalSpecs) {
        console.error("Technical specs not found in investigation data!");
        console.log("Analysis keys:", Object.keys(investigation.analysis));
        return;
    }

    console.log("Technical Specs found:", JSON.stringify(investigation.analysis.technicalSpecs, null, 2));

    const generator = new ArticleGenerator();
    const article = await generator.generateArticle(product, investigation);

    // Extract hero card (simplified regex)
    // The hero card is wrapped in <div class="product-hero-card">
    if (article.content.includes('<div class="hero-meta-tags">')) {
        const start = article.content.indexOf('<div class="hero-meta-tags">');
        const end = article.content.indexOf('</div>', start);
        const metaTagsHtml = article.content.substring(start, end + 6);
        console.log("\nGenerated Meta Tags Section:");
        console.log(metaTagsHtml);

        // Validation
        const requiredSpecs = ['OS:', 'CPU:', 'RAM:', 'ROM:', '画面:', 'バッテリー:', '重量:'];
        const missing = requiredSpecs.filter(spec => !metaTagsHtml.includes(spec));

        if (missing.length === 0) {
            console.log("\nSUCCESS: All required specs are present.");
        } else {
            console.error("\nFAILURE: Missing specs:", missing.join(', '));
        }
    } else {
        console.error("Hero meta tags section not found in generated content.");
    }
};

main().catch(console.error);
