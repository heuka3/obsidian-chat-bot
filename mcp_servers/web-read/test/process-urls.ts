import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { urlToMarkdown } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function processUrls() {
  try {
    // Read URLs from the file
    const urlsFilePath = path.join(__dirname, 'urls.txt');
    const outputDir = path.join(__dirname, 'output');
    
    console.log('Reading URLs from:', urlsFilePath);
    
    // Check if urls.txt exists
    if (!fs.existsSync(urlsFilePath)) {
      throw new Error(`URLs file not found: ${urlsFilePath}`);
    }
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Read and parse URLs
    const urlsContent = fs.readFileSync(urlsFilePath, 'utf-8');
    const urls = urlsContent
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0 && url.startsWith('http'));
    
    console.log(`Found ${urls.length} URLs to process`);
    
    // Process each URL
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`\nProcessing ${i + 1}/${urls.length}: ${url}`);
      
      try {
        // Convert URL to markdown
        const {markdown, resolvedURL} = await urlToMarkdown(url);

        // Generate a safe filename from URL
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.replace(/[^a-zA-Z0-9]/g, '_');
        const pathname = urlObj.pathname.replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `${hostname}${pathname || '_index'}.md`;
        
        // Write markdown to file
        const outputPath = path.join(outputDir, filename);
        //const fullContent = `# ${url}\n\nSource: ${url}\nGenerated: ${new Date().toISOString()}\n\n---\n\n${markdown}`;
        
        fs.writeFileSync(outputPath, markdown, 'utf-8');
        console.log(`✅ Successfully saved: ${filename}`);
        
        // Add delay between requests to be respectful
        if (i < urls.length - 1) {
          console.log('Waiting 2 seconds before next request...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        console.error(`❌ Failed to process ${url}:`, error instanceof Error ? error.message : 'Unknown error');
        
        // Create an error file
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.replace(/[^a-zA-Z0-9]/g, '_');
        const pathname = urlObj.pathname.replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `ERROR_${hostname}${pathname || '_index'}.md`;
        const outputPath = path.join(outputDir, filename);
        
        const errorContent = `# Error Processing ${url}\n\nSource: ${url}\nGenerated: ${new Date().toISOString()}\n\n---\n\n**Error:** ${error instanceof Error ? error.message : 'Unknown error'}\n`;
        fs.writeFileSync(outputPath, errorContent, 'utf-8');
      }
    }
    
    console.log('\n🎉 All URLs processed successfully!');
    console.log(`Output files saved in: ${outputDir}`);
    
  } catch (error) {
    console.error('❌ Fatal error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Run the process
processUrls().catch(console.error);

export { processUrls };
