import os
import time
import pandas as pd
import numpy as np
import joblib
from flask import Flask, request, jsonify, send_file, render_template

app = Flask(
    __name__,
    static_folder=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static"),
    template_folder=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "templates"),
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
MODELS_DIR = os.path.join(ROOT_DIR, "models")
TEMPLATE_PATH = os.path.join(ROOT_DIR, "templates", "index.html")

print("Loading dataset and ML models...")
t0 = time.time()

# Load models and data
DF_PATH = os.path.join(MODELS_DIR, "df_model.csv")
KNN_PATH = os.path.join(MODELS_DIR, "knn_recommender.pkl")
FEAT_PATH = os.path.join(MODELS_DIR, "feature_matrix.pkl")
SCALER_PATH = os.path.join(MODELS_DIR, "scaler.pkl")

# Fallback: if df_model.csv doesn't exist, check data.csv
if not os.path.exists(DF_PATH):
    raise FileNotFoundError(f"Missing {DF_PATH}. Please ensure models are generated.")

df = pd.read_csv(DF_PATH)
knn_model = joblib.load(KNN_PATH)
X = joblib.load(FEAT_PATH)
scaler = joblib.load(SCALER_PATH)

# Ensure strings are clean
df['name'] = df['name'].fillna("Unknown")
df['artists_clean'] = df['artists_clean'].fillna("Unknown Artist")
df['name_lower'] = df['name'].str.lower()
df['artist_lower'] = df['artists_clean'].str.lower()

# Fast ID to row index lookup map
id_to_idx = {sid: idx for idx, sid in enumerate(df['id'])}

print(f"Loaded {len(df):,} songs and k-NN recommender in {time.time() - t0:.2f}s")

AUDIO_FEATURES = [
    'valence', 'acousticness', 'danceability', 'duration_ms', 'energy',
    'explicit', 'instrumentalness', 'key', 'liveness', 'loudness',
    'mode', 'popularity', 'speechiness', 'tempo'
]

def format_song(row, similarity=None):
    duration_sec = int(row.get('duration_ms', 0) / 1000)
    mins = duration_sec // 60
    secs = duration_sec % 60
    
    # Generate deterministic vibrant color pair based on ID
    track_id = str(row['id'])
    h1 = (sum(ord(c) for c in track_id) * 37) % 360
    h2 = (h1 + 65) % 360
    gradient = f"linear-gradient(135deg, hsl({h1}, 75%, 32%), hsl({h2}, 85%, 15%))"

    data = {
        "id": track_id,
        "name": str(row['name']),
        "artist": str(row['artists_clean']),
        "year": int(row['year']),
        "popularity": int(row['popularity']),
        "duration": f"{mins}:{secs:02d}",
        "duration_ms": int(row.get('duration_ms', 0)),
        "tempo": round(float(row.get('tempo', 120)), 1),
        "energy": round(float(row.get('energy', 0.5)), 3),
        "danceability": round(float(row.get('danceability', 0.5)), 3),
        "valence": round(float(row.get('valence', 0.5)), 3),
        "acousticness": round(float(row.get('acousticness', 0.5)), 3),
        "instrumentalness": round(float(row.get('instrumentalness', 0.0)), 3),
        "speechiness": round(float(row.get('speechiness', 0.0)), 3),
        "liveness": round(float(row.get('liveness', 0.0)), 3),
        "loudness": round(float(row.get('loudness', -8.0)), 1),
        "spotify_url": f"https://open.spotify.com/track/{track_id}",
        "gradient": gradient
    }
    if similarity is not None:
        data["similarity"] = round(float(similarity), 3)
        data["match_pct"] = round(float(similarity) * 100, 1)
    return data


@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS'
    return response


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/search")
def search():
    query = request.args.get("q", "").strip().lower()
    limit = int(request.args.get("limit", 15))
    if not query:
        return jsonify([])

    # Fast substring search
    mask = df['name_lower'].str.contains(query, na=False, regex=False) | \
           df['artist_lower'].str.contains(query, na=False, regex=False)
    matches = df[mask].sort_values("popularity", ascending=False).head(limit)
    
    results = [format_song(row) for _, row in matches.iterrows()]
    return jsonify(results)


@app.route("/api/recommend")
def recommend():
    track_id = request.args.get("id", "").strip()
    name = request.args.get("name", "").strip()
    artist = request.args.get("artist", "").strip()
    n = int(request.args.get("n", 12))
    n = max(1, min(n, 50))

    seed_idx = None

    if track_id and track_id in id_to_idx:
        seed_idx = id_to_idx[track_id]
    elif name:
        m = df[df['name_lower'] == name.lower()]
        if artist:
            m_art = m[m['artist_lower'].str.contains(artist.lower(), regex=False)]
            if not m_art.empty:
                m = m_art
        if m.empty:
            # Fuzzy match fallback
            m = df[df['name_lower'].str.contains(name.lower(), regex=False)]
        if not m.empty:
            seed_idx = m['popularity'].idxmax()

    if seed_idx is None:
        return jsonify({"error": "Track not found"}), 404

    seed_song = format_song(df.iloc[seed_idx])

    # Compute k-NN recommendations
    distances, indices = knn_model.kneighbors(X[seed_idx].reshape(1, -1), n_neighbors=n + 1)
    
    recs = []
    for d, i in zip(distances[0][1:], indices[0][1:]):
        sim = 1.0 - d
        recs.append(format_song(df.iloc[i], similarity=sim))

    return jsonify({
        "seed": seed_song,
        "recommendations": recs,
        "count": len(recs)
    })


@app.route("/api/blend", methods=["POST"])
def blend():
    data = request.get_json(force=True, silent=True) or {}
    track_ids = data.get("ids", [])
    n = int(data.get("n", 15))
    n = max(1, min(n, 50))

    valid_idxs = [id_to_idx[tid] for tid in track_ids if tid in id_to_idx]
    if not valid_idxs:
        return jsonify({"error": "No valid tracks provided for blend"}), 400

    # Compute centroid of taste vectors
    blend_vector = X[valid_idxs].mean(axis=0).reshape(1, -1)
    
    # Query k-NN for nearest neighbors
    distances, indices = knn_model.kneighbors(blend_vector, n_neighbors=n + len(valid_idxs))

    seeds = [format_song(df.iloc[idx]) for idx in valid_idxs]
    recs = []
    
    for d, i in zip(distances[0], indices[0]):
        if i not in valid_idxs and len(recs) < n:
            sim = 1.0 - d
            recs.append(format_song(df.iloc[i], similarity=sim))

    return jsonify({
        "seeds": seeds,
        "recommendations": recs,
        "count": len(recs)
    })


@app.route("/api/recommend-tuned", methods=["POST"])
def recommend_tuned():
    data = request.get_json(force=True, silent=True) or {}
    track_id = data.get("id", "").strip()
    n = int(data.get("n", 15))
    n = max(1, min(n, 50))

    if not track_id or track_id not in id_to_idx:
        return jsonify({"error": "Seed track not found"}), 404

    seed_idx = id_to_idx[track_id]
    feat_cols = scaler.feature_names_in_.tolist()
    raw_row = df.iloc[seed_idx][feat_cols].copy()

    # Apply user tuning if provided
    if "energy" in data and data["energy"] is not None:
        raw_row['energy'] = float(np.clip(data["energy"], 0.0, 1.0))
    if "danceability" in data and data["danceability"] is not None:
        raw_row['danceability'] = float(np.clip(data["danceability"], 0.0, 1.0))
    if "valence" in data and data["valence"] is not None:
        raw_row['valence'] = float(np.clip(data["valence"], 0.0, 1.0))
    if "acousticness" in data and data["acousticness"] is not None:
        raw_row['acousticness'] = float(np.clip(data["acousticness"], 0.0, 1.0))
    if "tempo" in data and data["tempo"] is not None:
        raw_row['tempo'] = float(np.clip(data["tempo"], 40.0, 240.0))

    # Scale the customized vector
    tuned_vec = scaler.transform(pd.DataFrame([raw_row]))
    
    distances, indices = knn_model.kneighbors(tuned_vec, n_neighbors=n + 2)
    recs = []
    for d, i in zip(distances[0], indices[0]):
        if i != seed_idx and len(recs) < n:
            sim = 1.0 - d
            recs.append(format_song(df.iloc[i], similarity=sim))

    seed_song = format_song(df.iloc[seed_idx])
    return jsonify({
        "seed": seed_song,
        "tuned_params": {
            "energy": round(float(raw_row['energy']), 3),
            "danceability": round(float(raw_row['danceability']), 3),
            "valence": round(float(raw_row['valence']), 3),
            "acousticness": round(float(raw_row['acousticness']), 3),
            "tempo": round(float(raw_row['tempo']), 1)
        },
        "recommendations": recs,
        "count": len(recs)
    })


@app.route("/api/song/<track_id>")
def get_song(track_id):
    if track_id not in id_to_idx:
        return jsonify({"error": "Song not found"}), 404
    return jsonify(format_song(df.iloc[id_to_idx[track_id]]))


@app.route("/api/presets")
def get_presets():
    # Curated popular hits across multiple genres & eras
    preset_ids = [
        # Global Pop & 2020 Hits
        "0VjIjW4GlUZAMYd2vXMi3b",  # Blinding Lights - The Weeknd
        "47EiUVwUp4C9fGccaPuUCS",  # Dakiti - Bad Bunny
        "0t1kP63rueHleOhQkYSXFY",  # Dynamite - BTS
        "6UelLqGlWMcVH1E5c4H7lY",  # Watermelon Sugar - Harry Styles
        "54bFM56PmE4YLRnqpW6Tha",  # Therefore I Am - Billie Eilish
        # All-Time Classics & Rock
        "4u7EnebtmKWzUH433cf5Qv",  # Bohemian Rhapsody - Queen
        "7lPnGnNDv3tvTIosWbh2vq",  # Billie Jean - Michael Jackson
        "5ghIJDpPoe3CfHMTe7w1Tk",  # Smells Like Teen Spirit - Nirvana
        "08mG3Y1vljYA6bv08RQIpl",  # Sweet Child O' Mine - Guns N' Roses
        "3d9DChrdcR0dUtxLHVT2I8",  # Hotel California - Eagles
        # Chill & Acoustic
        "3yfqSUWxFvZELEM4Ptd0ia",  # Someone You Loved - Lewis Capaldi
        "1BxfuPKGuaTgP7aM0XbdHN",  # Let Her Go - Passenger
        "7qiZfU4dY1lWllzX7mPBI3",  # Shape of You - Ed Sheeran
        "2xLMifvAHQIcuKV6v8974V",  # Sunflower - Post Malone, Swae Lee
        "7szuecWpewWKOC3cCMwtGM",  # Believer - Imagine Dragons
        "2Foc5Q5nqNiosCNqttzNZ8",  # Get Lucky - Daft Punk
    ]
    
    found = []
    for pid in preset_ids:
        if pid in id_to_idx:
            found.append(format_song(df.iloc[id_to_idx[pid]]))
            
    # If some not found, fallback to top popularity songs
    if len(found) < 8:
        top_songs = df.sort_values("popularity", ascending=False).head(12)
        found = [format_song(row) for _, row in top_songs.iterrows()]

    return jsonify(found)


@app.route("/api/stats")
def stats():
    return jsonify({
        "total_songs": len(df),
        "year_min": int(df['year'].min()),
        "year_max": int(df['year'].max()),
        "avg_popularity": round(float(df['popularity'].mean()), 1),
        "dimensions": len(AUDIO_FEATURES),
        "features": AUDIO_FEATURES
    })


if __name__ == "__main__":
    print("Starting Spotify ML Recommendation Server on http://127.0.0.1:5000 ...")
    app.run(host="127.0.0.1", port=5000, debug=False)
