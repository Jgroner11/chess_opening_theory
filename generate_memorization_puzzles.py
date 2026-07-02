#!/usr/bin/env python3
"""Generate line-memorization puzzles for an opening set.

Walks the set's root line forward, ply by ply. At each ply where it's the
target player's turn, the actual root-line move becomes the puzzle's
`bestMove`. The eval stored alongside it is the evaluation of the resulting
position (white-relative cp/mate), fetched from Lichess Cloud Eval first,
falling back to a local Stockfish engine if the position isn't cached.

Usage:
    python generate_memorization_puzzles.py <set-name>
    python generate_memorization_puzzles.py <set-name> --clear
    python generate_memorization_puzzles.py <set-name> --engine /path/to/stockfish

Requires: pip install chess requests
"""

import argparse
import time

import chess

from chess_data import DEFAULT_DEPTH, DEFAULT_SLEEP, get_top_moves, load_set, save_set, start_engine, to_white_relative


def generate(set_name, engine_path, depth, sleep, verbose):
    path, data = load_set(set_name)
    root   = data["root"]
    target = chess.WHITE if data["player"] == "white" else chess.BLACK

    existing      = data.setdefault("puzzles", [])
    existing_keys = {tuple(p["moves"]) for p in existing if p.get("type") == "memorization"}

    engine = start_engine(engine_path)

    def log(msg):
        if verbose:
            print(msg)

    board        = chess.Board()
    new_puzzles  = []
    try:
        for i, uci in enumerate(root):
            mover_is_target = board.turn == target
            board.push(chess.Move.from_uci(uci))

            if not mover_is_target:
                continue

            moves_before = root[:i]
            if tuple(moves_before) in existing_keys:
                continue

            print(f"ply {i + 1}: {' '.join(moves_before) or '(start)'} -> {uci}")
            top, was_lichess = get_top_moves(board.fen(), engine, depth, 1, log)
            if top:
                _, cp, mate = top[0]
                ev = to_white_relative(cp, mate, board.turn == chess.WHITE)
            else:
                ev = {"cp": None, "mate": None}
            if was_lichess:
                time.sleep(sleep)

            new_puzzles.append({
                "type":     "memorization",
                "moves":    moves_before,
                "bestMove": uci,
                "eval":     ev,
            })
    finally:
        if engine:
            engine.quit()

    if not new_puzzles:
        print("All puzzles already present -- nothing to add.")
        return

    data["puzzles"] = existing + new_puzzles
    save_set(path, data)
    print(f"Added {len(new_puzzles)} memorization puzzle(s) to '{set_name}'.")


def clear(set_name):
    path, data = load_set(set_name)
    before = len(data.get("puzzles", []))
    data["puzzles"] = [p for p in data.get("puzzles", []) if p.get("type") != "memorization"]
    removed = before - len(data["puzzles"])
    save_set(path, data)
    print(f"Removed {removed} memorization puzzle(s) from '{set_name}'.")


def main():
    parser = argparse.ArgumentParser(description="Generate line-memorization puzzles for an opening set.")
    parser.add_argument("set_name", help="opening set name, e.g. 'benoni' (matches data/<set_name>.json)")
    parser.add_argument("--clear", action="store_true", help="remove all memorization puzzles from the set instead of generating")
    parser.add_argument("--engine", default=None, help="path to a local UCI engine binary (e.g. stockfish), used when a position isn't in Lichess's cloud eval cache")
    parser.add_argument("--depth", type=int, default=DEFAULT_DEPTH, help=f"search depth for local engine fallback (default {DEFAULT_DEPTH})")
    parser.add_argument("--sleep", type=float, default=DEFAULT_SLEEP, help=f"seconds to wait between Lichess requests (default {DEFAULT_SLEEP})")
    parser.add_argument("-v", "--verbose", action="store_true", help="print eval source/detail for each position")
    args = parser.parse_args()

    if args.clear:
        clear(args.set_name)
    else:
        generate(args.set_name, args.engine, args.depth, args.sleep, args.verbose)


if __name__ == "__main__":
    main()
