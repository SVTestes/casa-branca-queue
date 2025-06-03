const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
app.use(cors());

// Serve static files from current directory
app.use(express.static(path.join(__dirname)));

// Serve queue.html at the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'queue.html'));
});

// Cache the queue count to avoid too frequent scraping
let cachedCount = 0;
let lastUpdate = 0;
const CACHE_DURATION = 10000; // 10 seconds

async function getQueueCount() {
    const now = Date.now();
    if (now - lastUpdate < CACHE_DURATION) {
        console.log('Returning cached count:', cachedCount);
        return cachedCount;
    }

    let browser = null;
    try {
        console.log('Launching browser...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--deterministic-fetch',
                '--disable-features=IsolateOrigins',
                '--disable-site-isolation-trials'
            ]
        });
        
        const page = await browser.newPage();
        await page.setDefaultNavigationTimeout(60000);
        
        console.log('Navigating to FastGet...');
        await page.goto('https://app.fastget.com.br/#/panel/d55420f6-b1b2-11ef-9f40-029e72b0772d/QUEUE', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        console.log('Waiting for queue items...');
        await page.waitForSelector('div.item.font-bold', { 
            visible: true,
            timeout: 30000 
        });

        console.log('Counting queue items...');
        const count = await page.evaluate(() => {
            const items = document.querySelectorAll('div.item.font-bold');
            console.log('Found items:', items.length);
            return items.length;
        });

        console.log('Got queue count:', count);

        // Update cache
        cachedCount = count;
        lastUpdate = now;
        
        return count;
    } catch (error) {
        console.error('Error fetching queue count:', error);
        // Return last known count if there's an error
        return cachedCount;
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (error) {
                console.error('Error closing browser:', error);
            }
        }
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.get('/api/queue-count', async (req, res) => {
    try {
        console.log('Received request for queue count');
        const count = await getQueueCount();
        console.log('Sending response:', { count });
        res.json({ count });
    } catch (error) {
        console.error('API error:', error);
        res.status(500).json({ error: 'Failed to get queue count', message: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
