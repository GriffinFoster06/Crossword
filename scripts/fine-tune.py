#!/usr/bin/env python3
"""
CrossForge LoRA Fine-Tuning Script

Fine-tunes Phi-4 on crossword-specific instruction data using:
  - Apple Silicon (M1/M2/M3/M4): MLX-LM (fast, memory-efficient)
  - NVIDIA GPU:                   Unsloth (4-bit QLoRA)
  - CPU-only fallback:            Warning + basic transformers

After training, models are exported to GGUF format for Ollama.

Usage:
  # Apple Silicon (recommended for Mac users):
  pip install mlx-lm
  python scripts/fine-tune.py --data training/ --base-model phi4 --platform mlx

  # NVIDIA GPU:
  pip install unsloth
  python scripts/fine-tune.py --data training/ --base-model phi4 --platform unsloth

  # Check what's available:
  python scripts/fine-tune.py --check

The script trains one model per agent role and saves adapters to models/fine-tuned/.
"""

import argparse
import json
import os
import platform
import subprocess
import sys
from pathlib import Path


AGENT_ROLES = {
    "clue-writer": {
        "data": "training/clue-writer.jsonl",
        "modelfile": "models/Modelfile.clue-writer",
        "ollama_name": "crossforge-clue-writer",
        "description": "NYT clue writer — generates clues at specific difficulty levels",
        "iters": 500,
    },
    "word-selector": {
        "data": "training/word-selector.jsonl",
        "modelfile": "models/Modelfile.word-selector",
        "ollama_name": "crossforge-word-selector",
        "description": "Word quality ranker — selects optimal fill candidates",
        "iters": 200,
    },
    "theme-agent": {
        "data": "training/theme-agent.jsonl",
        "modelfile": "models/Modelfile.theme-agent",
        "ollama_name": "crossforge-theme-agent",
        "description": "Theme developer — creates NYT-publishable puzzle themes",
        "iters": 200,
    },
}


def check_environment() -> dict:
    """Detect available training backends."""
    env = {
        "platform": platform.system(),
        "arch": platform.machine(),
        "python": sys.version,
        "mlx": False,
        "unsloth": False,
        "transformers": False,
        "ollama": False,
        "llama_cpp": False,
    }

    # Check MLX (Apple Silicon)
    try:
        import mlx.core as mx
        env["mlx"] = True
        env["mlx_version"] = getattr(mx, "__version__", "unknown")
    except ImportError:
        pass

    # Check Unsloth (NVIDIA)
    try:
        import unsloth
        env["unsloth"] = True
    except ImportError:
        pass

    # Check transformers
    try:
        import transformers
        env["transformers"] = True
        env["transformers_version"] = transformers.__version__
    except ImportError:
        pass

    # Check Ollama
    result = subprocess.run(["ollama", "list"], capture_output=True, timeout=5)
    env["ollama"] = result.returncode == 0

    # Check llama.cpp for GGUF conversion
    result = subprocess.run(["which", "llama-quantize"], capture_output=True)
    env["llama_cpp"] = result.returncode == 0

    return env


def print_env_report(env: dict) -> None:
    print("CrossForge Training Environment")
    print("=" * 40)
    print(f"Platform: {env['platform']} {env['arch']}")
    print(f"Python:   {env['python'].split()[0]}")
    print()
    print("Training backends:")
    print(f"  MLX (Apple Silicon): {'✓ available' if env['mlx'] else '✗ not installed'}")
    if env['mlx']:
        print(f"    version: {env.get('mlx_version', 'unknown')}")
    print(f"  Unsloth (NVIDIA):    {'✓ available' if env['unsloth'] else '✗ not installed'}")
    print(f"  Transformers:        {'✓ available' if env['transformers'] else '✗ not installed'}")
    print()
    print("Serving:")
    print(f"  Ollama:              {'✓ available' if env['ollama'] else '✗ not installed'}")
    print(f"  llama.cpp (GGUF):    {'✓ available' if env['llama_cpp'] else '✗ not installed'}")
    print()

    if env['mlx']:
        print("Recommended command (Apple Silicon):")
        print("  python scripts/fine-tune.py --platform mlx --data training/ --base-model phi4")
    elif env['unsloth']:
        print("Recommended command (NVIDIA GPU):")
        print("  python scripts/fine-tune.py --platform unsloth --data training/ --base-model phi4")
    else:
        print("Install a training backend:")
        print("  Apple Silicon: pip install mlx-lm")
        print("  NVIDIA GPU:    pip install unsloth")


def fine_tune_mlx(role: str, config: dict, base_model: str, output_dir: Path, iters: int) -> bool:
    """Fine-tune using MLX-LM (Apple Silicon)."""
    try:
        import mlx_lm
    except ImportError:
        print("Error: mlx-lm not installed. Run: pip install mlx-lm")
        return False

    data_path = Path(config["data"])
    if not data_path.exists():
        print(f"  Error: training data not found: {data_path}")
        print("  Run: python scripts/prepare-training-data.py")
        return False

    adapter_dir = output_dir / role / "adapters"
    adapter_dir.mkdir(parents=True, exist_ok=True)

    print(f"  Training {role} with MLX-LM ({iters} iterations)...")
    print(f"  Data: {data_path} ({data_path.stat().st_size // 1024} KB)")
    print(f"  Output: {adapter_dir}")

    cmd = [
        sys.executable, "-m", "mlx_lm.lora",
        "--model", base_model,
        "--data", str(data_path.parent),
        "--train",
        "--iters", str(iters),
        "--batch-size", "4",
        "--lora-layers", "8",
        "--adapter-path", str(adapter_dir),
        "--learning-rate", "1e-4",
        "--val-batches", "5",
        "--steps-per-report", "50",
        "--steps-per-eval", "100",
        "--save-every", "100",
    ]

    result = subprocess.run(cmd)
    return result.returncode == 0


def fine_tune_unsloth(role: str, config: dict, base_model: str, output_dir: Path, iters: int) -> bool:
    """Fine-tune using Unsloth (NVIDIA GPU)."""
    try:
        from unsloth import FastLanguageModel
        import torch
    except ImportError:
        print("Error: unsloth not installed. Run: pip install unsloth")
        return False

    data_path = Path(config["data"])
    if not data_path.exists():
        print(f"  Error: training data not found: {data_path}")
        return False

    adapter_dir = output_dir / role / "adapters"
    adapter_dir.mkdir(parents=True, exist_ok=True)

    print(f"  Training {role} with Unsloth ({iters} steps)...")

    # Load model with 4-bit quantization
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=base_model,
        max_seq_length=2048,
        dtype=None,
        load_in_4bit=True,
    )

    # Add LoRA adapters
    model = FastLanguageModel.get_peft_model(
        model,
        r=8,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                         "gate_proj", "up_proj", "down_proj"],
        lora_alpha=16,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=42,
    )

    # Load training data
    from datasets import load_dataset
    dataset = load_dataset("json", data_files=str(data_path), split="train")

    from trl import SFTTrainer
    from transformers import TrainingArguments

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="messages",
        max_seq_length=2048,
        args=TrainingArguments(
            per_device_train_batch_size=2,
            gradient_accumulation_steps=4,
            warmup_steps=10,
            max_steps=iters,
            learning_rate=2e-4,
            fp16=not torch.cuda.is_bf16_supported(),
            bf16=torch.cuda.is_bf16_supported(),
            logging_steps=25,
            optim="adamw_8bit",
            weight_decay=0.01,
            lr_scheduler_type="linear",
            output_dir=str(adapter_dir),
        ),
    )

    trainer.train()
    model.save_pretrained(str(adapter_dir))
    tokenizer.save_pretrained(str(adapter_dir))
    print(f"  Adapters saved to {adapter_dir}")
    return True


def export_to_gguf(role: str, output_dir: Path) -> bool:
    """
    Merge LoRA adapters into base model and export to GGUF.

    Requires: llama.cpp Python bindings or convert scripts.
    """
    adapter_dir = output_dir / role / "adapters"
    gguf_path = output_dir / role / f"crossforge-{role}.gguf"

    print(f"  Exporting {role} to GGUF → {gguf_path}")

    # Try MLX fuse + export first
    try:
        import mlx_lm
        cmd = [
            sys.executable, "-m", "mlx_lm.fuse",
            "--model", str(adapter_dir),
            "--adapter-path", str(adapter_dir),
            "--save-path", str(output_dir / role / "merged"),
        ]
        result = subprocess.run(cmd)
        if result.returncode != 0:
            raise RuntimeError("MLX fuse failed")

        # Convert merged model to GGUF
        cmd2 = [
            sys.executable, "-m", "mlx_lm.convert",
            "--hf-path", str(output_dir / role / "merged"),
            "--mlx-path", str(gguf_path.with_suffix("")),
            "--quantize",
        ]
        result2 = subprocess.run(cmd2)
        return result2.returncode == 0
    except Exception:
        pass

    # Fallback: try llama.cpp convert
    convert_script = Path("llama.cpp/convert_hf_to_gguf.py")
    if convert_script.exists():
        cmd = [
            sys.executable, str(convert_script),
            str(adapter_dir),
            "--outfile", str(gguf_path),
            "--outtype", "q8_0",
        ]
        result = subprocess.run(cmd)
        return result.returncode == 0

    print("  Warning: could not export to GGUF (install mlx-lm or llama.cpp)")
    print("  Adapters are still saved and can be loaded for inference directly.")
    return False


def install_ollama_model(role: str, config: dict, output_dir: Path) -> bool:
    """Create an Ollama model from the fine-tuned GGUF."""
    gguf_path = output_dir / role / f"crossforge-{role}.gguf"
    modelfile_path = Path(config["modelfile"])

    if not gguf_path.exists():
        print(f"  Warning: GGUF not found ({gguf_path}), using base Modelfile")
        # Fall back to creating from base model (Phi-4) with system prompt only
        if not modelfile_path.exists():
            print(f"  Error: Modelfile not found: {modelfile_path}")
            return False
        cmd = ["ollama", "create", config["ollama_name"], "-f", str(modelfile_path)]
    else:
        # Write a temporary Modelfile pointing to the GGUF
        tmp_modelfile = output_dir / role / "Modelfile"
        original_content = modelfile_path.read_text() if modelfile_path.exists() else ""
        # Replace FROM line to point to local GGUF
        new_content = f"FROM {gguf_path.absolute()}\n" + "\n".join(
            line for line in original_content.splitlines()
            if not line.startswith("FROM")
        )
        tmp_modelfile.write_text(new_content)
        cmd = ["ollama", "create", config["ollama_name"], "-f", str(tmp_modelfile)]

    print(f"  Creating Ollama model: {config['ollama_name']}...")
    result = subprocess.run(cmd)
    return result.returncode == 0


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Fine-tune CrossForge AI models on crossword data",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument(
        "--platform",
        choices=["mlx", "unsloth", "auto"],
        default="auto",
        help="Training backend (default: auto-detect)",
    )
    ap.add_argument(
        "--base-model",
        default="phi4",
        help="Base Ollama model to fine-tune (default: phi4)",
    )
    ap.add_argument(
        "--data",
        type=Path,
        default=Path("training"),
        help="Directory with JSONL training files (default: training/)",
    )
    ap.add_argument(
        "--output",
        type=Path,
        default=Path("models/fine-tuned"),
        help="Output directory for adapters + GGUF files",
    )
    ap.add_argument(
        "--roles",
        nargs="+",
        choices=list(AGENT_ROLES.keys()) + ["all"],
        default=["all"],
        help="Which agent roles to train (default: all)",
    )
    ap.add_argument(
        "--iters",
        type=int,
        default=0,
        help="Training iterations override (0 = use per-role defaults)",
    )
    ap.add_argument(
        "--skip-export",
        action="store_true",
        help="Skip GGUF export (faster, keep adapters only)",
    )
    ap.add_argument(
        "--install",
        action="store_true",
        help="Install trained models into Ollama after training",
    )
    ap.add_argument(
        "--check",
        action="store_true",
        help="Check environment and exit",
    )
    args = ap.parse_args()

    env = check_environment()

    if args.check:
        print_env_report(env)
        return

    print_env_report(env)

    # Determine platform
    platform_choice = args.platform
    if platform_choice == "auto":
        if env["mlx"]:
            platform_choice = "mlx"
        elif env["unsloth"]:
            platform_choice = "unsloth"
        else:
            print("Error: no training backend available.")
            print("Install one of:")
            print("  Apple Silicon: pip install mlx-lm")
            print("  NVIDIA GPU:    pip install unsloth")
            sys.exit(1)

    # Resolve roles
    roles = list(AGENT_ROLES.keys()) if "all" in args.roles else args.roles

    print(f"\nTraining plan:")
    print(f"  Backend:    {platform_choice}")
    print(f"  Base model: {args.base_model}")
    print(f"  Roles:      {', '.join(roles)}")
    print(f"  Output:     {args.output}")
    print()

    args.output.mkdir(parents=True, exist_ok=True)

    success_count = 0
    for role in roles:
        config = AGENT_ROLES[role]
        iters = args.iters if args.iters > 0 else config["iters"]

        print(f"\n{'='*50}")
        print(f"Training: {role}")
        print(f"  {config['description']}")
        print(f"  Iterations: {iters}")

        ok = False
        if platform_choice == "mlx":
            ok = fine_tune_mlx(role, config, args.base_model, args.output, iters)
        elif platform_choice == "unsloth":
            ok = fine_tune_unsloth(role, config, args.base_model, args.output, iters)

        if not ok:
            print(f"  Training failed for {role}")
            continue

        if not args.skip_export:
            export_to_gguf(role, args.output)

        if args.install:
            install_ollama_model(role, config, args.output)

        success_count += 1

    print(f"\n{'='*50}")
    print(f"Training complete: {success_count}/{len(roles)} models trained")
    if not args.install:
        print("\nTo install models into Ollama:")
        print("  bash scripts/install-models.sh")


if __name__ == "__main__":
    main()
