const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());

// Serve static files from current directory
app.use(express.static('./'));

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

    try {
        console.log('Launching browser...');
        const browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process'
            ]
        });
        const page = await browser.newPage();
        
        console.log('Navigating to FastGet...');
        // Navigate to FastGet queue page
        await page.goto('https://app.fastget.com.br/#/panel/d55420f6-b1b2-11ef-9f40-029e72b0772d/QUEUE', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        console.log('Waiting for queue items...');
        // Wait for the queue items to load and be visible
        await page.waitForSelector('div.item.font-bold', { 
            visible: true,
            timeout: 10000 
        });

        console.log('Counting queue items...');
        // Count the number of people in queue
        const count = await page.evaluate(() => {
            const items = document.querySelectorAll('div.item.font-bold');
            console.log('Found items:', items.length);
            return items.length;
        });

        await browser.close();
        console.log('Got queue count:', count);

        // Update cache
        cachedCount = count;
        lastUpdate = now;
        
        return count;
    } catch (error) {
        console.error('Error fetching queue count:', error);
        // Return last known count if there's an error
        return cachedCount;
    }
}

app.get('/api/queue-count', async (req, res) => {
    try {
        console.log('Received request for queue count');
        const count = await getQueueCount();
        console.log('Sending response:', { count });
        res.json({ count });
    } catch (error) {
        console.error('API error:', error);
        res.status(500).json({ error: 'Failed to get queue count' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
}); 