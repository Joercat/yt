const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Create express app
const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/downloads', express.static(uploadsDir));

// Serve the main HTML page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint for conversion
app.post('/convert', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'YouTube URL is required' });
    }
    
    try {
        // Generate unique ID and file path
        const videoId = uuidv4();
        const outputPath = path.join(uploadsDir, `${videoId}.mp3`);
        
        // Use youtube-dl to extract audio directly
        const options = {
            extractAudio: true,
            audioFormat: 'mp3',
            audioQuality: 0, // best
            output: outputPath,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            ]
        };
        
        try {
            // Get video info first to get title
            const info = await youtubedl(url, {
                dumpSingleJson: true,
                noWarnings: true,
                noCheckCertificates: true,
                preferFreeFormats: true,
                addHeader: [
                    'referer:youtube.com',
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                ]
            });
            
            const videoTitle = info.title.replace(/[^\w\s]/gi, '');
            
            // Download and convert
            await youtubedl(url, options);
            
            // Send response once download is complete
            res.json({
                success: true,
                title: videoTitle,
                downloadUrl: `/downloads/${videoId}.mp3`,
                filename: `${videoTitle}.mp3`
            });
            
            // Set a timeout to delete the mp3 file after 1 hour
            setTimeout(() => {
                try {
                    if (fs.existsSync(outputPath)) {
                        fs.unlinkSync(outputPath);
                        console.log(`Deleted file: ${outputPath}`);
                    }
                } catch (err) {
                    console.error(`Error deleting file: ${err}`);
                }
            }, 3600000); // 1 hour in milliseconds
            
        } catch (dlError) {
            console.error('Download error:', dlError);
            return res.status(500).json({ error: 'Error downloading video: ' + dlError.message });
        }
        
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to use the YouTube to MP3 converter`);
});
