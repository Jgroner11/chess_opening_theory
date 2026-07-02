"""Shared helpers for the puzzle generator scripts: reading/writing data/<set>.json
and querying position evaluations (Lichess Cloud Eval, falling back to a local
UCI engine), same source the frontend's "Ask Lichess" button and analysis
board use.

Requires: pip install chess requests
"""

import json
import sys
from pathlib import Path

import chess
import chess.engine
import requests

DATA_DIR           = Path(__file__).resolve().parent / "data"
LICHESS_CLOUD_EVAL  = "https://lichess.org/api/cloud-eval"
DEFAULT_DEPTH       = 20
DEFAULT_SLEEP       = 1.0  # seconds between Lichess requests, be polite


def load_set(set_name):
    path = DATA_DIR / f"{set_name}.json"
    if not path.exists():
        sys.exit(f"No such opening set: {path}")
    with path.open("r", encoding="utf-8") as f:
        return path, json.load(f)


def save_set(path, data):
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def start_engine(engine_path):
    """Starts a local UCI engine (e.g. Stockfish) if a path was given. Returns None on failure/absence."""
    if not engine_path:
        return None
    try:
        return chess.engine.SimpleEngine.popen_uci(engine_path)
    except Exception as e:
        print(f"warning: could not start engine at '{engine_path}': {e}", file=sys.stderr)
        return None


def to_white_relative(cp, mate, side_to_move_is_white):
    """Lichess/engine scores are relative to the side to move; convert to white-relative for storage."""
    sign = 1 if side_to_move_is_white else -1
    cp_w   = cp * sign if cp is not None else None
    mate_w = mate * sign if mate is not None else None
    return {"cp": cp_w, "mate": mate_w}


def lichess_top_moves(fen, multi_pv):
    """Same call as the frontend's Ask Lichess button (cloud-eval, multiPv=N).
    Returns a list of (move_uci, cp, mate) tuples -- side-to-move-relative,
    ranked best first -- or None if the position isn't in Lichess's cache."""
    try:
        r = requests.get(LICHESS_CLOUD_EVAL, params={"fen": fen, "multiPv": multi_pv}, timeout=10)
    except requests.RequestException:
        return None
    if r.status_code != 200:
        return None
    pvs = r.json().get("pvs") or []
    if not pvs:
        return None
    return [(pv["moves"].split(" ")[0], pv.get("cp"), pv.get("mate")) for pv in pvs]


def stockfish_top_moves(engine, fen, depth, multi_pv):
    """Local-engine fallback, same shape as lichess_top_moves: (move_uci, cp, mate) list, side-to-move-relative."""
    board = chess.Board(fen)
    infos = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=multi_pv)
    if isinstance(infos, dict):
        infos = [infos]
    moves = []
    for info in infos:
        move  = info["pv"][0]
        score = info["score"].pov(board.turn)
        cp    = None if score.is_mate() else score.score()
        mate  = score.mate() if score.is_mate() else None
        moves.append((move.uci(), cp, mate))
    return moves


def get_top_moves(fen, engine, depth, multi_pv, log=lambda msg: None):
    """Lichess first, local engine fallback. Returns (moves, was_lichess) where
    moves is a list of (move_uci, cp, mate) tuples, side-to-move-relative, ranked best first."""
    result = lichess_top_moves(fen, multi_pv)
    if result is not None:
        log(f"  lichess:   {result}")
        return result, True

    if engine is None:
        log("  no cloud eval cached and no engine configured -- skipping")
        return [], False

    result = stockfish_top_moves(engine, fen, depth, multi_pv)
    log(f"  stockfish: {result}")
    return result, False
