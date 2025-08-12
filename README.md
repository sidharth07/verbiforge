# VerbiForge - Translation Management Platform

A comprehensive translation management platform that counts words in Excel files and calculates pricing for 100+ languages with project management capabilities.

## Features

- Upload Excel files (.xlsx, .xls)
- Count total words across all sheets
- Calculate pricing based on word count
- Clean, responsive web interface
- Real-time file processing

## Setup Instructions

### Prerequisites
- Node.js (version 14 or higher)
- npm (comes with Node.js)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and go to:
```
http://localhost:3000
```

## Configuration

### Changing the Price Per Word

Edit the `PRICE_PER_WORD` constant in `server.js`:

```javascript
const PRICE_PER_WORD = 0.2; // Change this value (in cents)
```

### Supported File Types

Currently supports:
- .xlsx (Excel 2007+)
- .xls (Excel 97-2003)

## How It Works

1. User uploads an Excel file through the web interface
2. Server extracts text from all sheets in the workbook
3. Words are counted using whitespace separation
4. Total cost is calculated: `word_count × price_per_word`
5. Results are displayed with file name, word count, and total cost

## Project Structure

```
├── server.js          # Backend server
├── package.json       # Dependencies
├── public/
│   ├── index.html     # Main webpage
│   ├── style.css      # Styling
│   └── script.js      # Frontend JavaScript
└── README.md          # This file
```

## Free Deployment Options

- **Heroku**: Free tier available
- **Vercel**: Free for personal projects
- **Netlify**: Free static hosting (frontend only)
- **Railway**: Free tier available

## Troubleshooting

- Make sure Node.js is installed
- Check that port 3000 is not in use
- Ensure Excel files are not corrupted
- Check browser console for JavaScript errors