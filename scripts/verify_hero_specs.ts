
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

    // Verify Hero Metadata
    if (article.metadata.hero) {
        console.log("\nGenerated Hero Metadata:");
        console.log(JSON.stringify(article.metadata.hero, null, 2));

        const heroSpecs = article.metadata.hero.specs;
        const missing: string[] = [];

        if (!heroSpecs.os) missing.push('OS');
        if (!heroSpecs.cpu) missing.push('CPU');
        if (!heroSpecs.ram) missing.push('RAM');
        if (!heroSpecs.storage) missing.push('ROM');
        if (!heroSpecs.display?.size) missing.push('Display Size');
        if (!heroSpecs.battery?.capacity) missing.push('Battery');

        const weight = heroSpecs.dimensions?.weight || heroSpecs.weight;
        if (!weight) missing.push('Weight');

        if (!weight) missing.push('Weight');

        if (!article.metadata.affiliate_url) missing.push('Affiliate URL');
        if (!article.metadata.hero.warnings) missing.push('Warnings (cons)');

        if (missing.length === 0) {
            console.log("\nSUCCESS: All required specs, warnings, and affiliate URL are present in metadata.");
        } else {
            console.error("\nFAILURE: Missing metadata:", missing.join(', '));
        }

        // Verify that content DOES NOT contain duplicate HTML
        if (article.content.includes('<div class="product-hero-card">')) {
            console.error("\nFAILURE: Content still contains hero card HTML!");
        } else {
            console.log("\nSUCCESS: Content does not contain hero card HTML (clean separation).");
        }

    } else {
        console.error("Hero metadata not found in generated article.");
    }
};

main().catch(console.error);
