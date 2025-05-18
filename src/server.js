const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const cheerio = require('cheerio');

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
        // Validate YouTube URL
        if (!ytdl.validateURL(url)) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }
        
        // Get video ID
        const videoID = ytdl.getVideoID(url);
        
        // Get video info
        let videoInfo;
        try {
            videoInfo = await ytdl.getBasicInfo(url);
        } catch (infoError) {
            console.error('Error getting video info:', infoError);
            return res.status(500).json({ error: 'Could not retrieve video information' });
        }
        
        const videoTitle = videoInfo.videoDetails.title.replace(/[^\w\s]/gi, ''); // Sanitize filename
        
        // Generate unique file names
        const videoId = uuidv4();
        const audioOutput = path.join(uploadsDir, `${videoId}.mp3`);
        
        // Use ytdl with a more robust configuration
        const options = {
            quality: 'highestaudio',
            filter: 'audioonly',
            requestOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Cache-Control': 'max-age=0'
                }
            }
        };
        
        try {
            // Stream directly to FFmpeg
            const stream = ytdl(url, options);
            
            // Handle stream errors
            stream.on('error', (err) => {
                console.error('Stream error:', err);
                return res.status(500).json({ error: 'Error streaming video: ' + err.message });
            });
            
            // Process with FFmpeg
            ffmpeg(stream)
                .audioBitrate(192)
                .format('mp3')
                .on('error', (err) => {
                    console.error('FFmpeg error:', err);
                    return res.status(500).json({ error: 'Error converting video: ' + err.message });
                })
                .on('end', () => {
                    // Send download link to client
                    res.json({
                        success: true,
                        title: videoTitle,
                        downloadUrl: `/downloads/${videoId}.mp3`,
                        filename: `${videoTitle}.mp3`
                    });
                    
                    // Set a timeout to delete the mp3 file after 1 hour
                    setTimeout(() => {
                        try {
                            if (fs.existsSync(audioOutput)) {
                                fs.unlinkSync(audioOutput);
                                console.log(`Deleted file: ${audioOutput}`);
                            }
                        } catch (err) {
                            console.error(`Error deleting file: ${err}`);
                        }
                    }, 3600000); // 1 hour in milliseconds
                })
                .save(audioOutput);
                
        } catch (streamError) {
            console.error('Error processing stream:', streamError);
            return res.status(500).json({ error: 'Error processing video stream: ' + streamError.message });
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
