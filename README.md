# Music Recommendation System — Spotify ML

A **content-based music recommendation engine** built with scikit-learn and served through a
Flask REST API with a Spotify-inspired web UI. The model maps every track into a
**14-dimensional audio-feature space** and finds neighbours with **cosine similarity**
(k-nearest-neighbours), so recommendations come from how a song *sounds*, not from play counts.

- Tracks in the modelling subset: **~157,000**
- Distance metric: **cosine similarity** (brute force, no giant pairwise matrix)
- Features: `valence`, `acousticness`, `danceability`, `duration_ms`, `energy`, `explicit`,
  `instrumentalness`, `key`, `liveness`, `loudness`, `mode`, `popularity`, `speechiness`, `tempo`

---

## Features

| Capability | Description |
|---|---|
| Search | Case-insensitive substring search over track title and artist |
| Recommendations | Seed any track, get the N nearest neighbours in audio-feature space |
| Blend | Feed several tracks in, get recommendations from the centroid ("taste vector") |
| Tuned search | Move energy / danceability / valence / acousticness / tempo sliders away from the seed's real values and re-query |
| Stats | Total tracks, year range, average popularity, feature list |
| UI | Responsive dark theme, gradient track cards, match percentage, direct Spotify links |

---

## Project structure

```
.
├── app.py                    # Flask API + page serving
├── prepare_models.py         # Rebuilds models/ from data.csv
├── requirements.txt
├── music_prediction_system.ipynb  # Full EDA + modelling notebook
├── models/                   # Trained artifacts (committed so the app runs after cloning)
│   ├── df_model.csv
│   ├── scaler.pkl
│   ├── feature_matrix.pkl
│   └── knn_recommender.pkl
├── static/
│   ├── css/style.css
│   └── js/app.js
└── templates/
    └── index.html
```

---

## Setup

**1. Clone and install dependencies**

```bash
git clone https://github.com/Hemanthn-3/Music-Recommendation-System-Spotify-ML.git
cd Music-Recommendation-System-Spotify-ML
python -m venv .venv
```

Windows:

```powershell
.venv\Scripts\activate
```

macOS / Linux:

```bash
source .venv/bin/activate
```

```bash
pip install -r requirements.txt
```

**2. Add the dataset**

Download the Spotify dataset (`data.csv` plus the `data_by_*.csv` and `data_w_genres.csv`
summaries) and place the files in the project root. The dataset files and the trained model
artifacts are git-ignored because of their size — the notebook and `prepare_models.py`
regenerate everything you need.

**3. Build the model artifacts**

```bash
python prepare_models.py
```

This cleans the data, fits the `StandardScaler` and the cosine k-NN model, and writes the four
files into `models/` that `app.py` loads at startup.

> You can also run `music_prediction_system.ipynb` top to bottom for the EDA, clustering and
> t-SNE visualisations before saving the artifacts.

**4. Run the app**

```bash
python app.py
```

Open <http://127.0.0.1:5000>

---

## API reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/search?q=<query>&limit=<n>` | Search tracks by title or artist |
| `GET` | `/api/recommend?id=<track_id>&n=<n>` | Recommend from a single seed track |
| `GET` | `/api/recommend?name=<title>&artist=<artist>` | Recommend using name / artist instead of an ID |
| `POST` | `/api/blend` | Body `{"ids": ["<id>", ...], "n": 15}` — blend several tracks |
| `POST` | `/api/recommend-tuned` | Body `{"id": "<id>", "energy": 0.9, "tempo": 130, ...}` — tuned search |
| `GET` | `/api/song/<track_id>` | Metadata for one track |
| `GET` | `/api/presets` | Curated starter tracks shown on the home screen |
| `GET` | `/api/stats` | Dataset statistics |

Example:

```bash
curl "http://127.0.0.1:5000/api/recommend?id=0VjIjW4GlUZAMYd2vXMi3b&n=5"
```

```bash
curl -X POST "http://127.0.0.1:5000/api/blend" \
     -H "Content-Type: application/json" \
     -d '{"ids": ["0VjIjW4GlUZAMYd2vXMi3b", "7qiZfU4dY1lWllzX7mPBI3"], "n": 10}'
```

---

## How the model works

1. **Clean** — parse the `artists` list, drop duplicate `(name, artists)` pairs keeping the most
   popular version, remove clips under 30 seconds.
2. **Select** — keep rows with no missing values across the 14 audio features.
3. **Scale** — `StandardScaler` so every dimension contributes equally to the distance.
4. **Index** — `NearestNeighbors(metric="cosine", algorithm="brute")`. Brute force is used on
   purpose: a full pairwise matrix for this many tracks would need roughly 200 GB of RAM.
5. **Query** — `kneighbors()` on the seed's scaled vector; similarity is reported as
   `1 - cosine_distance`.
6. **Blend** — average the scaled vectors of several seeds to get one taste centroid, then query
   with that.

Tuning sliders work by editing the seed row's raw feature values, scaling the edited vector with
the same fitted `StandardScaler`, and re-querying — so the user controls the query point without
retraining anything.

---

## Tech stack

Python · Flask · pandas · NumPy · SciPy · scikit-learn (`StandardScaler`, `NearestNeighbors`,
`KMeans`, `PCA`, `TSNE`) · joblib · Matplotlib / Seaborn / Plotly · vanilla HTML/CSS/JS

---

## Possible improvements

- Hybrid filtering that blends content similarity with collaborative signals.
- Autoencoders or a learned audio embedding instead of hand-picked features.
- Live Spotify API integration for real-time popularity and cover art.
- ANN indexes such as FAISS to trade exactness for sub-linear query time.
- Recall-based offline evaluation against a held-out interaction dataset.

---

## Notes

- Dataset: public Spotify metadata compilation (Yamaerenay). The app reads local CSV files and
  makes no Spotify API calls — links to tracks open the public Spotify web player.
- `.gitignore` excludes datasets and model binaries; regenerate them with `prepare_models.py`.

## License

MIT