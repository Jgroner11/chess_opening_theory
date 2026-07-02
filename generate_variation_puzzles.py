#!/usr/bin/env python3
"""Generate variation puzzles for an opening set.

Walks the set's root line forward, ply by ply. At each ply where it's the
*opponent's* turn, asks Lichess Cloud Eval (same call as the frontend's Ask
Lichess button, multiPv=N) for the engine's top moves in that position,
excluding whatever the root line actually plays -- these are the "opponent
deviated" candidates. For each deviation, the target player's best response
(and its eval) is then looked up the same way generate_memorization_puzzles.py
looks up an eval, becoming the puzzle's `bestMove`/`eval`.

Falls back to a local Stockfish engine (multipv search) wherever Lichess
doesn't have a position cached -- both for finding deviation candidates and
for finding the best response to one.

Usage:
    python generate_variation_puzzles.py <set-name>
    python generate_variation_puzzles.py <set-name> --clear
    python generate_variation_puzzles.py <set-name> --engine /path/to/stockfish

Requires: pip install chess requests
"""

import argparse
import time

import chess

from chess_data import DEFAULT_DEPTH, DEFAULT_SLEEP, get_top_moves, load_set, save_set, start_engine, to_white_relative

DEFAULT_PER_PLY = 3


def generate(set_name, engine_path, depth, per_ply, sleep, verbose):
    path, data = load_set(set_name)
    root   = data["root"]
    target = chess.WHITE if data["player"] == "white" else chess.BLACK

    existing      = data.setdefault("puzzles", [])
    existing_keys = {tuple(p["moves"]) for p in existing if p.get("type") == "variation"}

    engine = start_engine(engine_path)

    def log(msg):
        if verbose:
            print(msg)

    board       = chess.Board()
    new_puzzles = []
    try:
        for i, book_move in enumerate(root):
            opponent_to_move = board.turn != target

            if opponent_to_move:
                fen_before = board.fen()
                candidates, was_lichess = get_top_moves(fen_before, engine, depth, per_ply + 1, log)
                if was_lichess:
                    time.sleep(sleep)

                deviations = [uci for uci, _cp, _mate in candidates if uci != book_move][:per_ply]

                for dev_uci in deviations:
                    moves_before = root[:i] + [dev_uci]
                    if tuple(moves_before) in existing_keys:
                        continue

                    dev_board = board.copy()
                    dev_board.push(chess.Move.from_uci(dev_uci))

                    print(f"ply {i + 1} deviation: {' '.join(root[:i]) or '(start)'} -> {dev_uci}  (book move: {book_move})")
                    response, was_lichess2 = get_top_moves(dev_board.fen(), engine, depth, 1, log)
                    if was_lichess2:
                        time.sleep(sleep)

                    if not response:
                        log("  no best response available -- skipping")
                        continue

                    best_uci, cp, mate = response[0]
                    ev = to_white_relative(cp, mate, dev_board.turn == chess.WHITE)

                    new_puzzles.append({
                        "type":     "variation",
                        "moves":    moves_before,
                        "bestMove": best_uci,
                        "eval":     ev,
                    })

            board.push(chess.Move.from_uci(book_move))
    finally:
        if engine:
            engine.quit()

    if not new_puzzles:
        print("All puzzles already present -- nothing to add.")
        return

    data["puzzles"] = existing + new_puzzles
    save_set(path, data)
    print(f"Added {len(new_puzzles)} variation puzzle(s) to '{set_name}'.")


def clear(set_name):
    path, data = load_set(set_name)
    before = len(data.get("puzzles", []))
    data["puzzles"] = [p for p in data.get("puzzles", []) if p.get("type") != "variation"]
    removed = before - len(data["puzzles"])
    save_set(path, data)
    print(f"Removed {removed} variation puzzle(s) from '{set_name}'.")


def main():
    parser = argparse.ArgumentParser(description="Generate variation puzzles for an opening set.")
    parser.add_argument("set_name", help="opening set name, e.g. 'benoni' (matches data/<set_name>.json)")
    parser.add_argument("--clear", action="store_true", help="remove all variation puzzles from the set instead of generating")
    parser.add_argument("--engine", default=None, help="path to a local UCI engine binary (e.g. stockfish), used when a position isn't in Lichess's cloud eval cache")
    parser.add_argument("--depth", type=int, default=DEFAULT_DEPTH, help=f"search depth for local engine fallback (default {DEFAULT_DEPTH})")
    parser.add_argument("--per-ply", type=int, default=DEFAULT_PER_PLY, help=f"max deviation puzzles per opponent move (default {DEFAULT_PER_PLY})")
    parser.add_argument("--sleep", type=float, default=DEFAULT_SLEEP, help=f"seconds to wait between Lichess requests (default {DEFAULT_SLEEP})")
    parser.add_argument("-v", "--verbose", action="store_true", help="print eval source/detail for each position")
    args = parser.parse_args()

    if args.clear:
        clear(args.set_name)
    else:
        generate(args.set_name, args.engine, args.depth, args.per_ply, args.sleep, args.verbose)


if __name__ == "__main__":
    main()
