"""Rebuild the model artifacts required by app.py.

Usage:
    python prepare_models.py

Reads the raw Spotify dataset (``data.csv``) from the project root and writes the
four artifacts the Flask app loads at startup into ``models/``:

    models/df_model.csv         cleaned track table (id, name, artists_clean, year, ...)
    models/scaler.pkl           StandardScaler fitted on the 14 audio features
    models/feature_matrix.pkl   scaled feature matrix X (n_songs x 14)
    models/knn_recommender.pkl  NearestNeighbors (cosine, brute force)
"""

import ast
import os
import pickle
import warnings

import joblib
import pandas as pd
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "data.csv")
MODEL_DIR = os.path.join(BASE_DIR, "models")

SONG_FEATURES = [
    "valence", "acousticness", "danceability", "duration_ms",
    "energy", "explicit", "instrumentalness", "key",
    "liveness", "loudness", "mode", "popularity",
    "speechiness", "tempo",
]


def main() -> None:
    if not os.path.exists(DATA_PATH):
        raise SystemExit(
            "data.csv not found. Download the Spotify dataset and place it in the "
            "project root (see README -> Data)."
        )

    os.makedirs(MODEL_DIR, exist_ok=True)

    df = pd.read_csv(DATA_PATH)

    df["artists_clean"] = df["artists"].apply(lambda x: ", ".join(ast.literal_eval(x)))
    df["primary_artist"] = df["artists"].apply(lambda x: ast.literal_eval(x)[0])

    df = (
        df.sort_values("popularity", ascending=False)
          .drop_duplicates(subset=["name", "artists_clean"])
          .reset_index(drop=True)
    )
    df = df[df["duration_ms"] > 30_000].reset_index(drop=True)

    df_model = df.dropna(subset=SONG_FEATURES).reset_index(drop=True)
    print(f"Modelling subset: {len(df_model):,} songs")

    scaler = StandardScaler()
    X = scaler.fit_transform(df_model[SONG_FEATURES])
    print(f"Feature matrix shape: {X.shape}")

    knn_model = NearestNeighbors(
        n_neighbors=21, metric="cosine", algorithm="brute", n_jobs=-1
    )
    knn_model.fit(X)
    print("kNN model trained")

    df_model.to_csv(os.path.join(MODEL_DIR, "df_model.csv"), index=False)
    joblib.dump(scaler, os.path.join(MODEL_DIR, "scaler.pkl"))
    joblib.dump(knn_model, os.path.join(MODEL_DIR, "knn_recommender.pkl"))
    with open(os.path.join(MODEL_DIR, "feature_matrix.pkl"), "wb") as fh:
        pickle.dump(X, fh)

    print(f"Artifacts written to {MODEL_DIR}")


if __name__ == "__main__":
    main()