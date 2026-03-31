#!/usr/bin/env python3
"""
CrossForge Word List Compiler

Converts text word lists into the binary format used by CrossForge.
Input: text files with one word per line, optionally with score (e.g., "HELLO;75")
Output: binary .bin file

Binary format:
  Header: 4 bytes magic "CWDB" + 4 bytes version (u32 LE) + 4 bytes word count (u32 LE)
  Per word: 1 byte length + 1 byte score + N bytes word (ASCII uppercase)

Usage:
  python build-wordlist.py input1.txt [input2.txt ...] -o wordlist.bin
"""

import sys
import struct
import argparse
from pathlib import Path
from collections import Counter


def parse_wordlist(path: Path) -> dict:
    """Parse a text word list file. Returns {word: score}."""
    words = {}
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue

            if ';' in line:
                parts = line.split(';', 1)
                word_raw = parts[0].strip()
                try:
                    score = int(parts[1].strip())
                except ValueError:
                    score = 50
            elif '\t' in line:
                parts = line.split('\t', 1)
                word_raw = parts[0].strip()
                try:
                    score = int(parts[1].strip())
                except ValueError:
                    score = 50
            else:
                word_raw = line
                score = 50

            # Clean: uppercase, letters only
            word = ''.join(c.upper() for c in word_raw if c.isalpha())

            # Filter: 3-21 letters, ASCII only
            if 3 <= len(word) <= 21 and word.isascii():
                if word not in words or score > words[word]:
                    words[word] = min(max(score, 0), 100)

    return words


def write_binary(words: dict, output: Path):
    """Write word database in binary format."""
    with open(output, 'wb') as f:
        f.write(b'CWDB')
        f.write(struct.pack('<I', 1))
        f.write(struct.pack('<I', len(words)))

        for word in sorted(words.keys()):
            score = words[word]
            word_bytes = word.encode('ascii')
            f.write(struct.pack('B', len(word_bytes)))
            f.write(struct.pack('B', score))
            f.write(word_bytes)

    print(f"Wrote {len(words)} words to {output}")
    print(f"File size: {output.stat().st_size:,} bytes")

    lengths = Counter(len(w) for w in words)
    print("\nWord length distribution:")
    for length in sorted(lengths):
        print(f"  {length:2d} letters: {lengths[length]:6d} words")


def main():
    parser = argparse.ArgumentParser(description='Compile word lists to CrossForge binary format')
    parser.add_argument('inputs', nargs='+', help='Input text files')
    parser.add_argument('-o', '--output', default='wordlist.bin', help='Output binary file')
    args = parser.parse_args()

    all_words = {}
    for input_path in args.inputs:
        path = Path(input_path)
        if not path.exists():
            print(f"Warning: {path} not found, skipping")
            continue
        words = parse_wordlist(path)
        print(f"Loaded {len(words)} words from {path}")
        for word, score in words.items():
            if word not in all_words or score > all_words[word]:
                all_words[word] = score

    if not all_words:
        print("Error: no words loaded")
        sys.exit(1)

    print(f"\nTotal unique words: {len(all_words)}")
    write_binary(all_words, Path(args.output))


if __name__ == '__main__':
    main()
