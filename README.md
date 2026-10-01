# 🎵 Spotify ML Music Recommendation System

[![Python](https://img.shields.io/badge/Python-3.9+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-2.0+-000000?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com/)
[![scikit-learn](https://img.shields.io/badge/scikit--learn-F7931E?style=for-the-badge&logo=scikit-learn&logoColor=white)](https://scikit-learn.org/)
[![Spotify](https://img.shields.io/badge/Spotify-1ED760?style=for-the-badge&logo=spotify&logoColor=white)](https://open.spotify.com/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

An intelligent, full-stack Machine Learning music recommendation engine built with **Python, Scikit-Learn, Flask, and Vanilla Web Technologies**. The system analyzes acoustic feature profiles across **157,000+ tracks** from Spotify (1921–2020) and uses a **k-Nearest Neighbors (k-NN)** algorithm with **cosine distance** to deliver real-time, high-precision recommendations, multi-track taste blending, interactive parameter fine-tuning, and radar audio visualization.

---

## 📸 Key Highlights & Features

- 🎧 **Content-Based Filtering via k-NN**: Computes acoustic similarity in a normalized 14-dimensional feature space using cosine metric for fast sub-second recommendation queries.
- ⚡ **Real-Time Autocomplete & Search**: Instant substring search across 157,000+ song titles and artists with zero latency.
- 🎛️ **Interactive Acoustic Vibe Tuner**: Fine-tune recommendations on the fly by adjusting energy, danceability, valence, acousticness, and tempo sliders.
- 🧬 **Multi-Track Taste Blend**: Select multiple tracks to compute a composite taste vector (centroid embedding) and discover songs that bridge your favorite artists.
- 📊 **Model Analytics & Radar Charts**: Interactive SVG/Canvas spider radar charts comparing acoustic fingerprints between seed songs and recommendations.
- 🟢 **Spotify Player Integration & Web Audio**: In-app Spotify mini-player embed dock, track preview audio, dynamic Web Audio API canvas visualizer, and direct Spotify links.
- 💾 **Liked Songs & Playlist Export**: Save your favorite recommendations locally in browser storage and export as formatted playlists.
- 🎨 **Modern Spotify-Style UI**: Sleek dark-mode aesthetic with glassmorphism, dynamic color gradients, fluid transitions, and responsive layout.

---

## 🧠 Machine Learning Architecture

The recommendation engine leverages **Content-Based Filtering** based on Spotify's quantitative audio analysis:

### 1. 14 Acoustic Dimensions
Each song is characterized by 14 continuous and discrete features:
- **Valence**: Musical positiveness (happy, cheerful vs. sad, depressed).
- **Acousticness**: Confidence measure of whether the track is acoustic.
- **Danceability**: Suitability for dancing based on tempo, rhythm, and beat strength.
- **Energy**: Perceptual measure of intensity and activity.
- **Instrumentalness**: Predicts whether a track contains no vocals.
- **Liveness**: Detects audience presence in the recording.
- **Loudness**: Overall volume in decibels (dB).
- **Speechiness**: Presence of spoken words.
- **Tempo**: Estimated tempo in beats per minute (BPM).
- **Popularity**: Spotify track popularity metric (0–100).
- **Duration (ms)**, **Key**, **Mode**, and **Explicit Content**.

### 2. Feature Preprocessing & Scaling
Because features have vastly different ranges (e.g., `loudness` in negative dB, `tempo` up to 240 BPM, `danceability` from 0.0 to 1.0), all dimensions are normalized using **`StandardScaler`** (`z = (x - u) / s`).

### 3. Cosine Distance Metric
Similarity between tracks $A$ and $B$ is measured using cosine distance:

$$\text{Cosine Similarity}(A, B) = \frac{A \cdot B}{\|A\| \|B\|}$$

$$\text{Distance} = 1 - \text{Cosine Similarity}$$

Using cosine similarity ensures recommendations are invariant to scale and capture relational acoustic profiles.

---

## 📁 Project Structure

```plaintext
Music_Recommendation/
│
├── models/                         # Pre-trained ML artifacts & model dataset
│   ├── df_model.csv                # Optimized lookup table (157k+ songs)
│   ├── feature_matrix.pkl          # Pre-computed normalized feature matrix
│   ├── knn_recommender.pkl         # Fitted NearestNeighbors model
│   └── scaler.pkl                  # Fitted StandardScaler
│
├── static/                         # Frontend static assets
│   ├── css/
│   │   └── style.css               # Spotify glassmorphism design system
│   └── js/
│       └── app.js                  # Frontend client engine, visualizers & player
│
├── templates/
│   └── index.html                  # Main responsive single-page application
│
├── app.py                          # Flask REST API & Web Server
├── music_prediction_system.ipynb   # Data exploration, EDA & model training notebook
├── data.csv                        # Raw Spotify 157k+ tracks dataset
├── data_by_artist.csv              # Artist aggregated statistics
├── data_by_genres.csv              # Genre acoustic statistics
├── data_by_year.csv                # Yearly acoustic evolution trends
├── data_w_genres.csv               # Songs with genre annotations
└── README.md                       # Documentation
```

---

## 🚀 Quick Start Guide

### Prerequisites
- Python 3.8, 3.9, 3.10, 3.11, or 3.12
- `pip` package manager

### 1. Clone the Repository
```bash
git clone https://github.com/Hemanthn-3/Music-Recommendation-System-Spotify-ML.git
cd Music-Recommendation-System-Spotify-ML
```

### 2. Set Up a Virtual Environment (Recommended)
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install flask pandas numpy scikit-learn joblib
```

*(Or if you prefer requirements file)*:
```bash
pip install -r requirements.txt
```

### 4. Run the Application
```bash
python app.py
```

Open your browser and navigate to:
```
http://127.0.0.1:5000
```

---

## 📡 REST API Reference

| Endpoint | Method | Params / Payload | Description |
| :--- | :---: | :--- | :--- |
| `/api/search` | `GET` | `?q=<term>&limit=15` | Fast search across song titles and artists |
| `/api/recommend` | `GET` | `?id=<spotify_id>&n=12` or `?name=<title>&artist=<name>` | Get top $N$ nearest acoustic neighbors |
| `/api/blend` | `POST` | `{"ids": ["id1", "id2"], "n": 15}` | Blend multiple songs into composite recommendations |
| `/api/recommend-tuned` | `POST` | `{"id": "...", "energy": 0.8, "danceability": 0.9, ...}` | Generate recommendations with adjusted acoustic dials |
| `/api/song/<track_id>` | `GET` | `track_id` | Retrieve comprehensive audio profile for a song |
| `/api/presets` | `GET` | — | Fetch curated list of popular seed tracks across genres |
| `/api/stats` | `GET` | — | Get dataset summary statistics and feature dimensions |

---

## 🛠️ Tech Stack

- **Machine Learning & Analytics**: Scikit-Learn (`NearestNeighbors`), NumPy, Pandas, Joblib.
- **Backend**: Python 3, Flask.
- **Frontend**: HTML5, Vanilla JavaScript (ES6+), Vanilla CSS (Custom Design System, Glassmorphism, CSS Grid/Flexbox).
- **Visuals & Audio**: HTML5 Canvas Audio Spectrum, Web Audio API, SVG Radar Charts, Spotify Embed API.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
