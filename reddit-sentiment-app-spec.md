# SubReddit Sentiment Analyzer — Build Spec

## Overview

Build a full-stack web application that lets users select one or more subreddits and perform sentiment analysis on recent posts and comments. The app should look like it was made by a PhD data scientist but be usable by anyone — a humanities researcher, a curious student, or a marketing analyst. All NLP processing should happen locally (no external AI APIs). The only external API is Reddit's free Data API.

## Target User

A humanities or social science researcher who uses Reddit communities as qualitative research material. They want to quantify what communities think about certain topics, people, or concepts — turning qualitative observations into data-driven insights with real visualizations.

## Tech Stack

- **Frontend**: React with TypeScript, Tailwind CSS for styling
- **Backend**: Python (FastAPI)
- **NLP/Sentiment**: Python libraries only — use `transformers` with a pre-trained sentiment model (e.g., `cardiffnlp/twitter-roberta-base-sentiment-latest` from HuggingFace) for high-quality sentiment analysis. Use `nltk` or `spacy` for tokenization and text preprocessing. Use `wordcloud` for word cloud generation.
- **Data Viz**: Recharts on the frontend for interactive charts
- **Reddit Data Access**: Use Reddit's public JSON endpoints (no API key required)

## Reddit Data Access

### Primary Method: Public JSON Endpoints (No Auth Required)

Reddit serves public JSON data by appending `.json` to any subreddit URL. This requires zero API keys or credentials — it works out of the box.

Examples:
- `https://www.reddit.com/r/GenderStudies/hot.json?limit=100`
- `https://www.reddit.com/r/GenderStudies/top.json?t=month&limit=100`
- `https://www.reddit.com/r/GenderStudies/comments/POST_ID.json` (for comments on a specific post)

Pagination uses the `after` parameter with the `name` field of the last post in each response.

**Rate limit**: ~10 requests per minute for unauthenticated access. The app must respect this by:
- Fetching in batches with delays between requests (6+ seconds between requests to stay safe)
- Showing a progress bar during data fetching so the user knows what's happening
- Caching fetched data locally so re-analysis doesn't require re-fetching
- Starting to render partial results while remaining data is still loading

**Important**: Set a custom `User-Agent` header on all requests (e.g., `SubRedditSentimentAnalyzer/1.0`) — Reddit blocks default user agents.

### Future Upgrade: Authenticated API (Optional)

If the user has Reddit API credentials (client_id, client_secret), the app should optionally support authenticated access via OAuth for higher rate limits (100 req/min). Include a settings page where users can enter credentials if they have them, but make it completely optional — the app must work fully without any credentials.

## Core Features

### 1. Subreddit Selection & Data Fetching

- Text input to enter one or more subreddit names (comma-separated or tag-style input)
- Options to configure:
  - Number of posts to fetch (25, 50, 100, 250, 500, up to 1000)
  - Sort method: hot, top (with time filter: day/week/month/year/all), new, rising
  - Whether to include comments (toggle, with depth limit)
- Show a loading indicator with progress feedback while fetching and processing
- Display total posts fetched, total comments fetched, date range covered

### 2. Sentiment Analysis Engine

- Run sentiment analysis on each post title and selftext
- Run sentiment analysis on each comment (if enabled)
- Classify each piece of text as positive, negative, or neutral with a confidence score
- Also compute a compound/continuous sentiment score (-1 to +1) for more granular analysis
- Aggregate sentiment at the subreddit level and across all selected subreddits

### 3. Visualizations Dashboard

Build an interactive dashboard with the following panels. Use a clean, modern, data-science aesthetic — think dark mode option, muted color palette, good typography, generous whitespace.

#### Panel 1: Sentiment Distribution
- Histogram or density plot showing the distribution of sentiment scores across all analyzed text
- Color-coded by positive (green), neutral (gray), negative (red)
- Show mean, median, and standard deviation

#### Panel 2: Sentiment Over Time
- Line chart showing average sentiment score by day/week over the date range of fetched posts
- If multiple subreddits, show one line per subreddit with a legend
- Include a trend line

#### Panel 3: Word Clouds
- One word cloud for positive-sentiment posts/comments
- One word cloud for negative-sentiment posts/comments
- Filter out common stop words; optionally let user add custom stop words

#### Panel 4: Topic/Keyword Sentiment
- Let the user type in a keyword or topic
- Show the average sentiment of posts/comments that mention that keyword vs. those that don't
- Bar chart comparison

#### Panel 5: Subreddit Comparison (if multiple selected)
- Side-by-side or grouped bar chart comparing overall sentiment across subreddits
- Show post volume alongside sentiment

#### Panel 6: Most Polarizing Posts
- Table showing the top 10 most positive and top 10 most negative posts
- Include post title, score, number of comments, sentiment score, and a link to the original post

### 4. NLP Insights Panel

- Named Entity Recognition: show the most frequently mentioned people, organizations, and places
- N-gram analysis: show the most common bigrams and trigrams
- Text statistics: average post length, vocabulary richness, reading level estimate

### 5. AI-Powered Summary (Local)

- Use a small local summarization model (e.g., `facebook/bart-large-cnn` or similar from HuggingFace) to generate a 2-3 paragraph plain-English summary of findings
- Summary should cover: overall sentiment, key themes, notable differences between subreddits (if applicable), and any interesting outliers
- If the local summarization model is too heavy or slow, fall back to a template-based summary using the computed statistics

### 6. Export

- Export full results as CSV (posts with sentiment scores, comments with sentiment scores)
- Export visualizations as PNG
- Export summary as a formatted PDF report

## UI/UX Requirements

- **Design quality**: Professional, polished, looks like a published data science tool. Think Streamlit meets Bloomberg Terminal aesthetics.
- **Dark mode** by default with a light mode toggle
- **Responsive**: Works on desktop and tablet
- **Loading states**: Skeleton loaders and progress bars during data fetching and NLP processing
- **Error handling**: Graceful errors for invalid subreddit names, rate limiting, empty results
- **Tooltips**: Explain what each metric means (e.g., hover over "compound score" to see definition)

## Project Structure

```
reddit-sentiment-analyzer/
├── frontend/          # React app
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── utils/
│   └── package.json
├── backend/           # FastAPI server
│   ├── app/
│   │   ├── main.py
│   │   ├── reddit_client.py    # Handles public JSON endpoints + optional OAuth
│   │   ├── sentiment.py
│   │   ├── nlp_analysis.py
│   │   ├── summarizer.py
│   │   └── models.py
│   └── requirements.txt
├── README.md          # Setup instructions, screenshots
└── docker-compose.yml # Optional: for easy deployment
```

## Getting Started Flow

When a user first opens the app, they should see:
1. A clean welcome screen explaining what the tool does
2. Immediately redirect to the main analysis interface — no setup required since we use public JSON endpoints
3. Include a settings page (accessible from a gear icon) where users can optionally enter Reddit API credentials for faster rate limits if they have them

## Performance Notes

- The HuggingFace transformer models will need to download on first run (~500MB for sentiment, ~1.5GB for summarization). Show download progress.
- For large fetches (500+ posts with comments), consider processing in batches and updating the UI progressively
- Cache results locally so re-analyzing the same subreddit doesn't require re-fetching

## Future Enhancements (Don't build yet, but architect for)

- Comparison over time (fetch the same subreddit weekly and track changes)
- User authentication and saved analyses
- Sharing analysis results via a public link
- Custom sentiment lexicons for domain-specific research
