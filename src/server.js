const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
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
        // Validate YouTube URL
        if (!ytdl.validateURL(url)) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }
        
        // Get video info
        const videoInfo = await ytdl.getInfo(url);
        const videoTitle = videoInfo.videoDetails.title.replace(/[^\w\s]/gi, ''); // Sanitize filename
        
        // Generate unique file names
        const videoId = uuidv4();
        const videoOutput = path.join(uploadsDir, `${videoId}.mp4`);
        const audioOutput = path.join(uploadsDir, `${videoId}.mp3`);
        
        // Create a writable stream for the video
        const videoWriteStream = fs.createWriteStream(videoOutput);
        
        // Download the video
        const videoStream = ytdl(url, {
            quality: 'highestaudio',
            filter: 'audioonly',
        });
        
        videoStream.pipe(videoWriteStream);
        
        // Convert to MP3 when video download completes
        videoWriteStream.on('finish', () => {
            ffmpeg(videoOutput)
                .audioBitrate(192)
                .save(audioOutput)
                .on('end', () => {
                    // Clean up the video file
                    fs.unlinkSync(videoOutput);
                    
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
                .on('error', (err) => {
                    console.error('Error converting to MP3:', err);
                    res.status(500).json({ error: 'Error converting to MP3' });
                    
                    // Clean up the video file on error
                    if (fs.existsSync(videoOutput)) {
                        fs.unlinkSync(videoOutput);
                    }
                });
        });
        
        videoWriteStream.on('error', (err) => {
            console.error('Error downloading video:', err);
            res.status(500).json({ error: 'Error downloading video' });
        });
        
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
